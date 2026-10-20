// Builds public/cards/catalog.json: bone, muscle, and ligament structures with Latin terms.
// Run scripts/fetch-latin-terms.mjs first to refresh scripts/data/latin-terms.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const atlas = JSON.parse(
  await readFile(new URL("../public/models/atlas.json", import.meta.url)),
);
const latin = JSON.parse(
  await readFile(new URL("./data/latin-terms.json", import.meta.url)),
);
const catalogUrl = new URL("../public/cards/catalog.json", import.meta.url);
const previous = await readFile(catalogUrl).then(
  (b) => JSON.parse(b),
  () => null,
);
const previousImages = new Map(
  previous?.structures.map((s) => [s.id, s.images]) ?? [],
);

const EXCLUDE =
  /tooth|gingiva|papillary|intervertebral disk|cartilage|trochlea|tendon|raphe|linea alba|conus elasticus|lens|iliotibial tract/i;
const MUSCLE_OUTSIDE_MUSCULAR =
  /^(fibularis|tibialis|subscapularis|levator scapulae|tensor fasciae latae)/i;
const LIGAMENT = /ligament|interosseous membrane|thyrohyoid membrane/i;

function category(part, base) {
  if (EXCLUDE.test(part.name)) return null;
  if (LIGAMENT.test(part.name)) return "ligament";
  if (part.system === "muscular" || MUSCLE_OUTSIDE_MUSCULAR.test(base))
    return "muscle";
  if (part.system === "skeletal") return "bone";
  return null;
}
function side(name) {
  const m = /\b(left|right)\b/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}
const baseName = (name) =>
  name
    .replace(/\b(left|right) /i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Latin lookup tables.
const termsByFma = latin.terms;
const termsByEnglish = new Map();
for (const [fma, t] of Object.entries(termsByFma))
  for (const en of t.en) {
    const k = en.toLowerCase();
    if (!termsByEnglish.has(k)) termsByEnglish.set(k, fma);
  }

// Base structures: one per anatomical name, both sides merged.
const bases = new Map(),
  meshToBase = new Map();
for (const part of atlas.parts) {
  const en = baseName(part.name),
    cat = category(part, en);
  if (!cat) continue;
  const id = slug(en);
  const s = bases.get(id) ?? {
    id,
    en,
    category: cat,
    parts: [],
    right: [],
    other: [],
    concepts: new Set(),
  };
  s.parts.push(part.id);
  // Position decides the side: a few source meshes have left and right swapped in their names.
  const x = (part.bounds[0][0] + part.bounds[1][0]) / 2;
  (side(part.name) && x < 0 ? s.right : s.other).push(part.id);
  s.concepts.add(part.conceptId);
  bases.set(id, s);
  meshToBase.set(part.id, id);
}

// Concepts whose meshes all belong to one base name the same structure (e.g. side-specific concepts).
const conceptMembers = new Map();
for (const c of atlas.concepts) {
  const ids = new Set();
  let outside = 0;
  for (const e of c.elements) {
    const b = meshToBase.get(e);
    if (b) ids.add(b);
    else outside++;
  }
  conceptMembers.set(c.id, {
    members: [...ids],
    outside,
    total: c.elements.length,
    name: c.name,
  });
  if (ids.size === 1 && outside === 0)
    bases.get([...ids][0]).concepts.add(c.id);
}

// Composites: whole muscles split into heads or parts, and whole bones modeled in pieces.
const composites = new Map();
const PIECE = /^.+? (?:head|part|belly) of (.+)$/;
const byWhole = new Map();
for (const s of bases.values()) {
  const m = PIECE.exec(s.en);
  if (m)
    byWhole.set(m[1], {
      members: [...(byWhole.get(m[1])?.members ?? []), s.id],
      concepts: [],
    });
}
const WHOLE_CONCEPTS = { sternum: "FMA7485" };
for (const [whole, fma] of Object.entries(WHOLE_CONCEPTS))
  byWhole.set(whole, {
    members: conceptMembers.get(fma).members,
    concepts: [fma],
  });
for (const [whole, { members, concepts }] of byWhole) {
  const id = slug(whole);
  if (members.length > 1 && !bases.has(id))
    composites.set(id, { id, en: whole, members, concepts: new Set(concepts) });
}

// Rule-based Latin for numbered series that Terminologia Anatomica lists collectively.
const ORDINAL = [
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
const ROMAN = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];
const roman = (word) => ROMAN[ORDINAL.indexOf(word)];
const DIGIT = {
  thumb: ["pollicis"],
  "index finger": ["digiti II manus", "indicis"],
  "middle finger": ["digiti III manus", "digiti medii"],
  "ring finger": ["digiti IV manus", "digiti anularis"],
  "little finger": ["digiti V manus", "digiti minimi manus"],
  "big toe": ["hallucis"],
  "second toe": ["digiti II pedis"],
  "third toe": ["digiti III pedis"],
  "fourth toe": ["digiti IV pedis"],
  "little toe": ["digiti V pedis", "digiti minimi pedis"],
};
const PHALANX = { distal: "distalis", middle: "media", proximal: "proximalis" };
const FIXED = {
  "set of dorsal interossei of hand": ["mm. interossei dorsales manus"],
  "set of lumbricals of hand": ["mm. lumbricales manus"],
  "set of palmar interossei of hand": ["mm. interossei palmares"],
  "set of interspinales lumborum": ["mm. interspinales lumborum"],
  "interspinalis thoracis": [
    "m. interspinalis thoracis",
    "mm. interspinales thoracis",
  ],
  "lateral lumbar intertransversarius": [
    "mm. intertransversarii laterales lumborum",
  ],
  "medial lumbar intertransversarius": [
    "mm. intertransversarii mediales lumborum",
  ],
  "sesamoid bone of foot": ["ossa sesamoidea pedis"],
};
function ruleLatin(en) {
  if (FIXED[en]) return FIXED[en];
  let m;
  if (
    (m = /^(\w+) (cervical|thoracic|lumbar) vertebra$/.exec(en)) &&
    roman(m[1])
  ) {
    const r = roman(m[1]),
      k = { cervical: "cervicalis", thoracic: "thoracica", lumbar: "lumbalis" }[
        m[2]
      ],
      c = { cervical: "C", thoracic: "T", lumbar: "L" }[m[2]];
    return [`vertebra ${k} ${r}`, `vertebra ${c}${ORDINAL.indexOf(m[1]) + 1}`];
  }
  if ((m = /^(\w+) rib$/.exec(en)) && roman(m[1]))
    return [`costa ${roman(m[1])}`];
  if ((m = /^(\w+) metacarpal bone$/.exec(en)) && roman(m[1]))
    return [`os metacarpi ${roman(m[1])}`, `os metacarpale ${roman(m[1])}`];
  if ((m = /^(\w+) metatarsal bone$/.exec(en)) && roman(m[1]))
    return [`os metatarsi ${roman(m[1])}`, `os metatarsale ${roman(m[1])}`];
  if (
    (m = /^(distal|middle|proximal) phalanx of (.+)$/.exec(en)) &&
    DIGIT[m[2]]
  )
    return DIGIT[m[2]].map((d) => `phalanx ${PHALANX[m[1]]} ${d}`);
  if ((m = /^(\w+) lumbrical of foot$/.exec(en)) && roman(m[1]))
    return [`m. lumbricalis ${roman(m[1])} pedis`];
  if ((m = /^(\w+) plantar interosseous of foot$/.exec(en)) && roman(m[1]))
    return [`m. interosseus plantaris ${roman(m[1])}`];
  return [];
}

function latinFor(s) {
  const out = [];
  const push = (t) => {
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const fma of s.concepts)
    for (const t of termsByFma[fma]?.la ?? []) push(t);
  const names = [
    s.en,
    s.en.replace(/ muscle$/, ""),
    `${s.en} muscle`,
    s.en.replace(/ bone$/, ""),
    `${s.en} bone`,
  ];
  for (const n of names) {
    const fma = termsByEnglish.get(n);
    for (const t of termsByFma[fma]?.la ?? []) push(t);
  }
  for (const t of ruleLatin(s.en)) push(t);
  return out;
}

const structures = [];
for (const s of bases.values())
  structures.push({
    id: s.id,
    en: s.en,
    la: latinFor(s),
    category: s.category,
    parts: s.parts,
    focus: s.right.length ? s.right : s.other,
  });
for (const c of composites.values()) {
  const members = c.members.map((m) => bases.get(m));
  structures.push({
    id: c.id,
    en: c.en,
    la: latinFor(c),
    category: members[0].category,
    parts: members.flatMap((m) => m.parts),
    focus: members.flatMap((m) => (m.right.length ? m.right : m.other)),
    members: c.members,
  });
}

// Latin shared by several structures (e.g. "caput longum") is qualified with the whole muscle.
const usage = new Map();
for (const s of structures)
  for (const t of s.la)
    usage.set(t.toLowerCase(), (usage.get(t.toLowerCase()) ?? 0) + 1);
const wholeOf = new Map();
for (const s of structures) for (const m of s.members ?? []) wholeOf.set(m, s);
// Heads and parts named only "pars abdominalis" also get the muscle: "pars abdominalis (m. pectoralis major)".
for (const s of structures) {
  const unique = s.la.filter((t) => usage.get(t.toLowerCase()) === 1);
  if (unique.length)
    s.la = [...unique, ...s.la.filter((t) => !unique.includes(t))];
  const whole = wholeOf.get(s.id)?.la[0];
  if (!s.la.length || !whole) continue;
  const stem = whole
    .toLowerCase()
    .split(/\s+/)
    .find((w) => !/^(m|mm|musculus|musculi)\.?$/.test(w))
    .slice(0, 5);
  if (!s.la[0].toLowerCase().includes(stem))
    s.la.unshift(`${s.la[0]} (${whole})`);
}

// Collective terms that expand to several structures when a learner uploads them.
const structureIds = new Set(structures.map((s) => s.id));
const TOO_GENERIC =
  /^(flat|irregular|long|short|pneumatized|sesamoid) bone$|^head of muscle organ$|^lower limb$|perineum|^bony pelvis$|^pelvic girdle$|^neurocranium$|^soft palate$|^interosseous membrane$|^vertebra$/;
const groups = [];
for (const [fma, info] of conceptMembers) {
  const terms = termsByFma[fma]?.la;
  if (!terms || info.members.length < 2 || info.members.length > 80) continue;
  if (info.outside / info.total > 0.1 || TOO_GENERIC.test(info.name)) continue;
  const id = `group-${slug(info.name)}`;
  if (groups.some((g) => g.id === id) || structureIds.has(slug(info.name)))
    continue;
  groups.push({ id, en: info.name, la: terms, members: info.members.sort() });
}

for (const s of structures) s.images = previousImages.get(s.id) ?? [];
structures.sort(
  (a, b) => a.category.localeCompare(b.category) || a.en.localeCompare(b.en),
);
groups.sort((a, b) => a.en.localeCompare(b.en));
await mkdir(new URL("./", catalogUrl), { recursive: true });
await writeFile(
  catalogUrl,
  JSON.stringify({
    version: 1,
    sources: [
      "BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0",
      ...latin.sources,
    ],
    structures,
    groups,
  }) + "\n",
);

const counts = structures.reduce(
  (n, s) => ({ ...n, [s.category]: (n[s.category] ?? 0) + 1 }),
  {},
);
const missing = structures.filter((s) => !s.la.length);
console.log(
  `Structures: ${structures.length}`,
  counts,
  `composites: ${composites.size}, groups: ${groups.length}`,
);
console.log(
  `With Latin: ${structures.length - missing.length}; without: ${missing.map((s) => s.en).join("; ")}`,
);
