// Builds public/cards/catalog.json: bone, muscle, ligament, and joint structures with Latin terms.
// Existing catalogue IDs are kept when the meshes or the anatomical name still match, so decks
// and review history stay attached. Run scripts/fetch-latin-terms.mjs first to refresh Latin terms.
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
  /tooth|gingiva|papillary|intervertebral disk|cartilage|trochlea|tendon|tendinous|raphe|linea alba|conus elasticus|lens|iliotibial tract|bursa|retinaculum|sheath|aponeurosis|\btarsus\b|nucleus pulposus|sinus of|cells of ethmoid|\b(canine|incisor|premolar|molar)\b|fat pad|frenul/i;
const MUSCLE_OUTSIDE_MUSCULAR =
  /^(fibularis|tibialis|subscapularis|levator scapulae|tensor fasciae latae)/i;
const LIGAMENT = /ligament|interosseous membrane|thyrohyoid membrane/i;
const JOINT_STRUCTURE = /capsule|meniscus|\bdisc\b|labrum|symphysis/i;

function category(part, base) {
  if (EXCLUDE.test(part.name) || EXCLUDE.test(base)) return null;
  if (part.system === "joints") {
    if (JOINT_STRUCTURE.test(part.name)) return "joint";
    if (/ligament|membrane|oblique cord/i.test(part.name)) return "ligament";
    return null;
  }
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
    .replace(/[()]/g, "")
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

const partById = new Map(atlas.parts.map((p) => [p.id, p]));
// When the new skeleton, muscle, or joint mesh exists, drop the older connective-tissue duplicate.
function preferSystem(entry) {
  const systems = new Set(entry.parts.map((id) => partById.get(id)?.system));
  let keep = null;
  if (entry.category === "muscle" && systems.has("muscular")) keep = "muscular";
  else if (
    (entry.category === "ligament" || entry.category === "joint") &&
    systems.has("joints")
  )
    keep = "joints";
  else if (entry.category === "bone" && systems.has("skeletal"))
    keep = "skeletal";
  if (!keep) return;
  const ok = (id) => partById.get(id)?.system === keep;
  for (const id of entry.parts) if (!ok(id)) meshToBase.delete(id);
  entry.parts = entry.parts.filter(ok);
  entry.right = entry.right.filter(ok);
  entry.other = entry.other.filter(ok);
}
for (const entry of bases.values()) preferSystem(entry);

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
const PIECE = /^[\w-]+ (?:head|part|belly) of (.+)$/;
const byWhole = new Map();
for (const s of bases.values()) {
  const m = PIECE.exec(s.en);
  if (m)
    byWhole.set(m[1], {
      members: [...(byWhole.get(m[1])?.members ?? []), s.id],
      concepts: [],
    });
}
const conceptByName = new Map(
  [...conceptMembers.entries()].map(([id, info]) => [
    info.name.toLowerCase(),
    id,
  ]),
);
const WHOLE_CONCEPTS = { sternum: "Sternum" };
for (const [whole, key] of Object.entries(WHOLE_CONCEPTS)) {
  const fma = conceptMembers.has(key)
    ? key
    : conceptByName.get(key.toLowerCase());
  const info = fma ? conceptMembers.get(fma) : null;
  if (!info) continue;
  byWhole.set(whole, { members: info.members, concepts: [fma] });
}
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

// Mesh names from Z-Anatomy, after side words and parentheses are removed.
// FMA_ALIAS reads Latin already stored under that id. LATIN_ALIAS is used when
// TA98 has no row for this structure, or when the shared TA word must be qualified
// so it is not the name shown on the card.
const SPELLING = { bucinator: "buccinator" };
const part = (term, parent) => [`${term} (${parent})`, term];
const FMA_ALIAS = {
  bucinator: "FMA46834",
  buccinator: "FMA46834",
  "ary-epiglottic part of oblique arytenoid": "FMA46602",
  "internal abdominal oblique": "FMA13891",
  "innermost intercostal muscles": "FMA74086",
  "internal intercostal muscles": "FMA74085",
  "interspinales colli": "FMA71309",
  "interspinales lumborum": "FMA71306",
  "interspinales thoracis": "FMA71308",
  "levator nasolabialis": "FMA46802",
  "levatores breves costarum": "FMA71314",
  "levatores longi costarum": "FMA71313",
  "longissimus colli": "FMA22711",
  "lumbrical muscles of foot": "FMA37453",
  "lumbrical muscles of hand": "FMA37385",
  "multifidus colli": "FMA22833",
  "dorsal interossei muscles of hand": "FMA37418",
  "dorsal interossei muscles of foot": "FMA37457",
  "rectus anterior capitis": "FMA46312",
  "rectus lateralis capitis": "FMA46316",
  "rectus posterior major capitis": "FMA32525",
  "rectus posterior minor capitis": "FMA32526",
  "semispinalis colli": "FMA22829",
  "splenius colli": "FMA22681",
  "annular ligament of radius": "FMA38872",
  "dorsal intercuneiform ligaments": "FMA44214",
  "intercornual ligament": "FMA21503",
  "sacrococcygeal symphysis": "FMA16210",
  "tibionavicular ligament": "FMA44061",
  "tibiocalcaneal ligament": "FMA44062",
  "collateral metacarpophalangeal ligaments": "FMA71407",
  "collateral interphalangeal ligaments of hand": "FMA71409",
  "palmar interphalangeal ligaments": "FMA71410",
  "collateral metatarsophalangeal ligaments": "FMA71424",
  "plantar metatarsophalangeal ligaments": "FMA71425",
  "collateral interphalangeal ligaments of foot": "FMA71426",
  "plantar interphalangeal ligaments": "FMA71427",
};
const LATIN_ALIAS = {
  "anterior belly of digastric": part("venter anterior", "m. digastricus"),
  "posterior belly of digastric": part("venter posterior", "m. digastricus"),
  "deep head of flexor pollicis brevis": part(
    "caput profundum",
    "m. flexor pollicis brevis",
  ),
  "deep head of pronator teres": part("caput ulnare", "m. pronator teres"),
  "superficial head of pronator teres": part(
    "caput humerale",
    "m. pronator teres",
  ),
  "deep part of masseter": part("pars profunda", "m. masseter"),
  "superficial part of masseter": part("pars superficialis", "m. masseter"),
  "external part of thyro-arytenoid": part(
    "pars externa",
    "m. thyroarytenoideus",
  ),
  "humeral head of extensor carpi ulnaris": part(
    "caput humerale",
    "m. extensor carpi ulnaris",
  ),
  "ulnar head of extensor carpi ulnaris": part(
    "caput ulnare",
    "m. extensor carpi ulnaris",
  ),
  "humero-ulnar head of flexor digitorum superficialis": part(
    "caput humeroulnare",
    "m. flexor digitorum superficialis",
  ),
  "radial head of flexor digitorum superficialis": part(
    "caput radiale",
    "m. flexor digitorum superficialis",
  ),
  "inferior head of lateral pterygoid": part(
    "caput inferius",
    "m. pterygoideus lateralis",
  ),
  "superior head of lateral pterygoid": part(
    "caput superius",
    "m. pterygoideus lateralis",
  ),
  "orbital part of orbicularis oculi": part(
    "pars orbitalis",
    "m. orbicularis oculi",
  ),
  "palpebral part of orbicularis oculi": part(
    "pars palpebralis",
    "m. orbicularis oculi",
  ),
  "spinalis colli": ["m. spinalis cervicis", "m. spinalis colli"],
  "dorsal interossei muscles of hand": ["mm. interossei dorsales manus"],
  "dorsal interossei muscles of foot": ["mm. interossei dorsales pedis"],
  "lumbrical muscles of hand": ["mm. lumbricales manus"],
  "lumbrical muscles of foot": ["mm. lumbricales pedis"],
  "dorsal parts of lateral intertransversarii lumborum muscles": part(
    "partes dorsales",
    "mm. intertransversarii laterales lumborum",
  ),
  "ventral parts of lateral intertransversarii lumborum muscles": part(
    "partes ventrales",
    "mm. intertransversarii laterales lumborum",
  ),
  "anterior meniscotibial ligament lateral meniscus": [
    "lig. meniscotibiale anterius (meniscus lateralis)",
  ],
  "anterior meniscotibial ligament medial meniscus": [
    "lig. meniscotibiale anterius (meniscus medialis)",
  ],
  "posterior meniscotibial ligament lateral meniscus": [
    "lig. meniscotibiale posterius (meniscus lateralis)",
  ],
  "posterior meniscotibial ligament medial meniscus": [
    "lig. meniscotibiale posterius (meniscus medialis)",
  ],
  "anterior talocalcaneal ligament": ["lig. talocalcaneum anterius"],
  "capitohamate interosseous ligament": ["lig. capitohamatum interosseum"],
  "check ligament of medial rectus": ["lacertus musculi recti medialis"],
  "deep part of tibial collateral ligament": part(
    "pars profunda",
    "lig. collaterale tibiale",
  ),
  "superficial part of tibial collateral ligament": part(
    "pars superficialis",
    "lig. collaterale tibiale",
  ),
  "descending part of iliofemoral ligament": part(
    "pars descendens",
    "lig. iliofemorale",
  ),
  "transverse part of iliofemoral ligament": part(
    "pars transversa",
    "lig. iliofemorale",
  ),
  "dorsal radio-ulnar ligament": ["lig. radioulnare dorsale"],
  "palmar radio-ulnar ligament": ["lig. radioulnare palmare"],
  "dorsal scaphotriquetral ligament": ["lig. scaphotriquetrum dorsale"],
  "palmar scaphotriquetral ligament": ["lig. scaphotriquetrum palmare"],
  "inferior glenohumeral ligament": ["lig. glenohumerale inferius"],
  "middle glenohumeral ligament": ["lig. glenohumerale medium"],
  "superior glenohumeral ligament": ["lig. glenohumerale superius"],
  "intersesamoid ligament": ["lig. intersesamoideum"],
  "lateral temporomandibular ligament": [
    "lig. laterale (articulatio temporomandibularis)",
  ],
  "lunotriquetral interosseous ligament": ["lig. lunotriquetrum interosseum"],
  "palmar lunotriquetral ligament": ["lig. lunotriquetrum palmare"],
  "meniscopatellar ligament": ["lig. meniscopatellare"],
  "palmar capitohamate ligament": ["lig. capitohamatum palmare"],
  "palmar trapezoideocapitate ligament": ["lig. trapezoideocapitatum palmare"],
  "pisotriquetral ligament": ["lig. pisotriquetrum"],
  "popliteofibular ligament": ["lig. popliteofibulare"],
  "posterior tibiotalar ligament": ["pars tibiotalaris posterior"],
  "radiocapitate ligament": ["lig. radiocapitatum"],
  "radioscaphocapitate ligament": ["lig. radioscaphocapitatum"],
  "scaphocapitate ligament": ["lig. scaphocapitatum"],
  "scapholunate interosseous ligament": ["lig. scapholunatum interosseum"],
  "scaphotrapeziotrapezoidal ligament": ["lig. scaphotrapeziotrapezoideum"],
  "transverse tibiofibular ligament": ["lig. tibiofibulare transversum"],
  "trapeziotrapezoidal interosseous ligament": [
    "lig. trapeziotrapezoideum interosseum",
  ],
  "trapezoideocapitate interosseous ligament": [
    "lig. trapezoideocapitatum interosseum",
  ],
  "triquetrocapitate ligament": ["lig. triquetrocapitatum"],
  "triquetrohamate ligament": ["lig. triquetrohamatum"],
  "ulnocapitate ligament": ["lig. ulnocapitatum"],
  "ulnolunate ligament": ["lig. ulnolunatum"],
  "ulnopisiform ligament": ["lig. ulnopisiforme"],
  "ulnotriquetral ligament": ["lig. ulnotriquetrum"],
  "collateral metacarpophalangeal ligaments": [
    "ligg. collateralia (articulationes metacarpophalangeae)",
  ],
  "collateral interphalangeal ligaments of hand": [
    "ligg. collateralia (articulationes interphalangeae manus)",
  ],
  "collateral metatarsophalangeal ligaments": [
    "ligg. collateralia (articulationes metatarsophalangeae)",
  ],
  "collateral interphalangeal ligaments of foot": [
    "ligg. collateralia (articulationes interphalangeae pedis)",
  ],
  "palmar interphalangeal ligaments": [
    "ligg. palmaria (articulationes interphalangeae manus)",
  ],
  "plantar metatarsophalangeal ligaments": [
    "ligg. plantaria (articulationes metatarsophalangeae)",
  ],
  "plantar interphalangeal ligaments": [
    "ligg. plantaria (articulationes interphalangeae pedis)",
  ],
};
// Singular capsule, or the plural, then the joint it belongs to.
const CAPSULE = {
  "articular capsule of acromioclavicular joint": [
    "capsula articularis",
    "articulatio acromioclavicularis",
  ],
  "articular capsule of elbow joint": [
    "capsula articularis",
    "articulatio cubiti",
  ],
  "articular capsule of glenohumeral joint": [
    "capsula articularis",
    "articulatio humeri",
  ],
  "articular capsule of hip joint": [
    "capsula articularis",
    "articulatio coxae",
  ],
  "articular capsule of interphalangeal joint of great toe": [
    "capsula articularis",
    "articulatio interphalangea hallucis",
  ],
  "articular capsule of knee joint": [
    "capsula articularis",
    "articulatio genus",
  ],
  "articular capsule of radiocarpal joint": [
    "capsula articularis",
    "articulatio radiocarpalis",
  ],
  "articular capsule of sternoclavicular joint": [
    "capsula articularis",
    "articulatio sternoclavicularis",
  ],
  "articular capsule of superior tibiofibular joint": [
    "capsula articularis",
    "articulatio tibiofibularis",
  ],
  "articular capsule of temporomandibular joint": [
    "capsula articularis",
    "articulatio temporomandibularis",
  ],
  "articular capsules of distal interphalangeal joints": [
    "capsulae articulares",
    "articulationes interphalangeae distales manus",
  ],
  "articular capsules of distal interphalangeal joints of foot": [
    "capsulae articulares",
    "articulationes interphalangeae distales pedis",
  ],
  "articular capsules of metacarpophalangeal joints": [
    "capsulae articulares",
    "articulationes metacarpophalangeae",
  ],
  "articular capsules of metatarsophalangeal joints": [
    "capsulae articulares",
    "articulationes metatarsophalangeae",
  ],
  "articular capsules of proximal interphalangeal joints": [
    "capsulae articulares",
    "articulationes interphalangeae proximales manus",
  ],
  "articular capsules of proximal interphalangeal joints of foot": [
    "capsulae articulares",
    "articulationes interphalangeae proximales pedis",
  ],
};
const DISC = {
  "articular disc of acromioclavicular joint":
    "articulatio acromioclavicularis",
  "articular disc of distal radio-ulnar joint":
    "articulatio radioulnaris distalis",
  "articular disc of sternoclavicular joint": "articulatio sternoclavicularis",
  "articular disc of temporomandibular joint":
    "articulatio temporomandibularis",
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
  if ((m = /^intervertebral disc ([ctls])(\d+)-([ctls])(\d+)$/.exec(en))) {
    const level = (letter, n) => `${letter.toUpperCase()}${n}`;
    return [
      `discus intervertebralis ${level(m[1], m[2])}/${level(m[3], m[4])}`,
    ];
  }
  const capsule = CAPSULE[en];
  if (capsule) return [`${capsule[0]} (${capsule[1]})`, capsule[0]];
  if (DISC[en])
    return [`discus articularis (${DISC[en]})`, "discus articularis"];
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
  if (s.en.endsWith(" muscles")) {
    const singular = s.en.replace(/ muscles$/, "");
    names.push(singular, `${singular} muscle`);
  }
  for (const n of [...names]) if (SPELLING[n]) names.push(SPELLING[n]);
  for (const n of names) {
    for (const t of LATIN_ALIAS[n] ?? []) push(t);
    for (const t of termsByFma[FMA_ALIAS[n]]?.la ?? []) push(t);
    for (const t of termsByFma[termsByEnglish.get(n)]?.la ?? []) push(t);
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
  if (!s.la.length || !whole || s.la[0].includes("(")) continue;
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

// Keep the learner-facing id when this is the same structure as a card that already exists.
function normName(en) {
  return en
    .toLowerCase()
    .replace(/\b(left|right)\b/g, "")
    .replace(/\b(muscle|muscles|bone|bones)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function sharedCount(a, b) {
  const set = new Set(a);
  let n = 0;
  for (const id of b) if (set.has(id)) n++;
  return n;
}
const prevList = previous?.structures ?? [];
const pairs = [];
for (const s of structures)
  for (const prev of prevList) {
    const shared = sharedCount(s.parts, prev.parts);
    const sameName = normName(s.en) === normName(prev.en);
    if (!shared && !sameName) continue;
    const union = new Set([...s.parts, ...prev.parts]).size;
    pairs.push({ s, prev, shared, score: shared ? shared / union : 0.5 });
  }
pairs.sort((a, b) => b.score - a.score || b.shared - a.shared);
const idMap = new Map();
const usedPrev = new Set();
const usedNew = new Set();
let preserved = 0;
let retargeted = 0;
for (const { s, prev, shared } of pairs) {
  if (usedNew.has(s) || usedPrev.has(prev.id)) continue;
  usedNew.add(s);
  usedPrev.add(prev.id);
  const provisional = s.id;
  const sameParts = shared === s.parts.length && shared === prev.parts.length;
  idMap.set(provisional, prev.id);
  s.id = prev.id;
  s.en = prev.en;
  if (prev.la?.length) s.la = prev.la;
  if (!shared) retargeted++;
  else if (sameParts) {
    s.parts = prev.parts;
    s.focus = prev.focus;
    if (prev.members) s.members = prev.members;
    preserved++;
  } else {
    const parts = [
      ...new Set([...prev.parts.filter((id) => partById.has(id)), ...s.parts]),
    ];
    s.parts = parts;
    if (!s.focus.every((id) => parts.includes(id)))
      s.focus = prev.focus.filter((id) => parts.includes(id));
    if (prev.members) s._keepMembers = prev.members;
    preserved++;
  }
}
const taken = new Set(
  structures.filter((s) => usedNew.has(s)).map((s) => s.id),
);
let added = 0;
for (const s of structures) {
  if (usedNew.has(s)) continue;
  const cleaned = s.en.replace(/ (muscle|bone)$/i, "");
  let id = slug(cleaned);
  if (taken.has(id)) id = slug(s.en);
  let n = 2;
  while (taken.has(id)) id = `${slug(cleaned)}-${n++}`;
  if (id !== s.id) idMap.set(s.id, id);
  s.id = id;
  s.en = cleaned === "bucinator" ? "buccinator" : cleaned;
  taken.add(id);
  added++;
}
const covered = new Set(structures.flatMap((s) => s.parts));
let kept = 0;
for (const prev of prevList) {
  if (usedPrev.has(prev.id)) continue;
  if (prev.parts.every((id) => covered.has(id))) continue;
  structures.push(prev);
  kept++;
}
for (const s of structures) if (s.en === "bucinator") s.en = "buccinator";
const mapId = (id) => idMap.get(id) ?? id;
const finalIds = new Set(structures.map((s) => s.id));
for (const s of structures)
  if (s.members || s._keepMembers)
    s.members = [
      ...new Set([...(s._keepMembers ?? []), ...(s.members ?? []).map(mapId)]),
    ].filter((id) => finalIds.has(id));
for (const s of structures) delete s._keepMembers;
for (let i = groups.length - 1; i >= 0; i--) {
  const members = [...new Set(groups[i].members.map(mapId))].filter((id) =>
    finalIds.has(id),
  );
  if (members.length < 2 || finalIds.has(groups[i].id)) groups.splice(i, 1);
  else groups[i].members = members;
}
for (const prevGroup of previous?.groups ?? []) {
  if (groups.some((g) => g.id === prevGroup.id) || finalIds.has(prevGroup.id))
    continue;
  const members = prevGroup.members.filter((id) => finalIds.has(id));
  if (members.length >= 2) groups.push({ ...prevGroup, members });
}
console.log(
  `Catalogue ids: preserved ${preserved}, retargeted ${retargeted}, new ${added}, kept from before ${kept}`,
);

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
      "Skeleton, muscles, and joints: Z-Anatomy, CC BY-SA 2.1 Japan",
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
