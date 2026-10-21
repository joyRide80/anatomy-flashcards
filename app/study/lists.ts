import { buildLatinIndex } from "@/lib/flashcards/latin";
import type { Catalog, DeckItem, Structure } from "@/lib/flashcards/types";
import { catalogMaps, latinName } from "./shared";

/** Course lists reduced to terms the 3D atlas can match exactly. */
export const PREFILL_LISTS: { name: string; lines: [string, string][] }[] = [
  {
    name: "Columna vertebralis",
    lines: [
      ["Vertebrae cervicales", "7 stk, inkludert atlas (C1) og axis (C2)"],
      ["Vertebrae thoracicae", "12 stk"],
      ["Vertebrae lumbales", "5 stk"],
    ],
  },
  {
    name: "Thorax",
    lines: [
      ["Manubrium sterni", "Øvre del"],
      ["Corpus sterni", "Midtre del"],
      ["Processus xiphoideus", "Nedre spiss"],
      ["Costae verae", "Ribbe 1-7, direkte sternal forbindelse"],
      ["Costae spuriae", "Ribbe 8-10, fester via ribbe 7 brusk"],
    ],
  },
];

const SERIES = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
];

function seriesOrder(s: Structure) {
  const en = s.en.toLowerCase();
  if (en === "atlas") return 1;
  if (en === "axis") return 2;
  const index = SERIES.findIndex((word) => en.startsWith(word));
  return index === -1 ? 99 : index + 1;
}

/** Expands each matched line. Groups become one card per member. Unmatched lines are dropped. */
export function prefillItems(catalog: Catalog, name: string): DeckItem[] {
  const list = PREFILL_LISTS.find((item) => item.name === name);
  if (!list) return [];
  const index = buildLatinIndex(catalog);
  const maps = catalogMaps(catalog);
  const items: DeckItem[] = [];
  const seen = new Set<string>();
  const push = (item: DeckItem) => {
    if (seen.has(item.structureId)) return;
    seen.add(item.structureId);
    items.push(item);
  };
  for (const [term, note] of list.lines) {
    const result = index.match(term, note);
    const top = result.candidates[0];
    if (!top || top.score < 1) continue;
    if (top.type === "structure") {
      const structure = maps.structures.get(top.id);
      if (structure?.images.length)
        push({ structureId: structure.id, label: term, note });
      continue;
    }
    const members = (maps.groups.get(top.id)?.members ?? [])
      .map((id) => maps.structures.get(id))
      .filter((s): s is Structure => !!s?.images.length)
      .sort((a, b) => seriesOrder(a) - seriesOrder(b));
    for (const structure of members)
      push({
        structureId: structure.id,
        label: latinName(structure),
        note: `${term} · ${note}`,
      });
  }
  return items;
}
