import type { Catalog } from "./types";

const ABBREVIATIONS: Record<string, string> = {
  m: "musculus",
  mm: "musculi",
  musc: "musculus",
  lig: "ligamentum",
  ligg: "ligamenta",
  proc: "processus",
  art: "articulatio",
};
const SIDES = new Set([
  "dexter",
  "dextra",
  "dextrum",
  "dextri",
  "sinister",
  "sinistra",
  "sinistrum",
  "sinistri",
  "left",
  "right",
]);
/** Leading words dropped for a second, looser key ("m. biceps brachii" → "biceps brachii"). */
const GENERIC = new Set([
  "musculus",
  "musculi",
  "ligamentum",
  "ligamenta",
  "os",
  "ossa",
]);
const ROMAN = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
];

export function normalizeLatin(text: string): string {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/j/g, "i")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/-/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .map((w) => (/^\d+$/.test(w) && ROMAN[+w - 1] ? ROMAN[+w - 1] : w))
    .filter((w) => !SIDES.has(w));
  return words.join(" ");
}

function looseKey(normalized: string) {
  const words = normalized.split(" ");
  return words.length > 1 && GENERIC.has(words[0])
    ? words.slice(1).join(" ")
    : normalized;
}

export type TargetType = "structure" | "group";
export interface Target {
  type: TargetType;
  id: string;
}
export interface Candidate extends Target {
  score: number;
  /** The catalog term that matched. */
  term: string;
}
export type MatchStatus =
  "exact" | "group" | "suggested" | "ambiguous" | "none";
export interface MatchResult {
  input: string;
  note?: string;
  status: MatchStatus;
  candidates: Candidate[];
}

interface Entry extends Target {
  term: string;
  key: string;
  sorted: string;
  grams: Set<string>;
}

const sortWords = (s: string) => s.split(" ").sort().join(" ");
function trigrams(s: string) {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}
function dice(a: Set<string>, b: Set<string>) {
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return prev[b.length];
}
const ratio = (a: string, b: string) =>
  1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

export interface LatinIndex {
  match(input: string, note?: string): MatchResult;
}

export function buildLatinIndex(catalog: Catalog): LatinIndex {
  const exact = new Map<string, Map<string, Candidate>>();
  const entries: Entry[] = [];
  const add = (target: Target, term: string) => {
    const full = normalizeLatin(term);
    if (!full) return;
    for (const key of new Set([full, looseKey(full)])) {
      const targets = exact.get(key) ?? new Map<string, Candidate>();
      targets.set(`${target.type}:${target.id}`, { ...target, term, score: 1 });
      exact.set(key, targets);
    }
    const key = looseKey(full);
    entries.push({
      ...target,
      term,
      key,
      sorted: sortWords(key),
      grams: trigrams(key),
    });
  };
  for (const s of catalog.structures) {
    for (const term of s.la) add({ type: "structure", id: s.id }, term);
    add({ type: "structure", id: s.id }, s.en);
  }
  for (const g of catalog.groups) {
    for (const term of g.la) add({ type: "group", id: g.id }, term);
    add({ type: "group", id: g.id }, g.en);
  }

  return {
    match(input, note) {
      const full = normalizeLatin(input);
      const base = { input, ...(note ? { note } : {}) };
      if (!full) return { ...base, status: "none", candidates: [] };
      const hits = exact.get(full) ?? exact.get(looseKey(full));
      if (hits) {
        const candidates = [...hits.values()];
        const structures = candidates.filter((c) => c.type === "structure");
        if (structures.length === 1)
          return { ...base, status: "exact", candidates: structures };
        if (!structures.length && candidates.length === 1)
          return { ...base, status: "group", candidates };
        return { ...base, status: "ambiguous", candidates };
      }

      const key = looseKey(full);
      const grams = trigrams(key);
      const sorted = sortWords(key);
      const best = new Map<string, Candidate>();
      for (const e of entries) {
        if (dice(grams, e.grams) < 0.35) continue;
        const score = Math.max(ratio(key, e.key), ratio(sorted, e.sorted));
        const id = `${e.type}:${e.id}`;
        if (score >= 0.72 && score > (best.get(id)?.score ?? 0))
          best.set(id, { type: e.type, id: e.id, term: e.term, score });
      }
      const candidates = [...best.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (!candidates.length) return { ...base, status: "none", candidates };
      const [top, next] = candidates;
      const clear =
        top.score >= 0.85 && (!next || top.score - next.score >= 0.05);
      return { ...base, status: clear ? "suggested" : "ambiguous", candidates };
    },
  };
}

export interface UploadLine {
  term: string;
  note?: string;
}

/** Reads one term per line, with an optional note after a tab, semicolon, or pipe (or comma in CSV files). */
export function parseUpload(text: string, csv = false): UploadLine[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const delimiter = lines.some((l) => l.includes("\t"))
    ? "\t"
    : lines.some((l) => l.includes(";"))
      ? ";"
      : lines.some((l) => l.includes("|"))
        ? "|"
        : csv
          ? ","
          : null;
  const rows = lines.map((line) => {
    const [term, ...rest] = delimiter ? line.split(delimiter) : [line];
    const note = rest
      .join(delimiter ?? "")
      .trim()
      .replace(/^"|"$/g, "");
    return {
      term: term.trim().replace(/^"|"$/g, ""),
      ...(note ? { note } : {}),
    };
  });
  if (rows.length && /^(latin|latein|term|name|terminus)$/i.test(rows[0].term))
    rows.shift();
  return rows.filter((r) => r.term);
}
