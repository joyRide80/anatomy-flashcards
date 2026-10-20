// Downloads Latin anatomical terms keyed by FMA identifier, with English names for lookup.
// Sources: Terminologia Anatomica 1998 via github.com/mhalle/ta98-sqlite, and Wikidata Latin labels.
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const TA98_URL =
  "https://github.com/mhalle/ta98-sqlite/raw/master/db/ta98.sqlite";
const SPARQL = "https://query.wikidata.org/sparql";
const headers = {
  "User-Agent": "human-atlas-flashcards/0.1 (educational anatomy flash cards)",
};

const terms = new Map();
const entry = (fma) => {
  if (!terms.has(fma)) terms.set(fma, { en: [], la: [], ta: [] });
  return terms.get(fma);
};
const add = (list, value) => {
  const t = value?.trim();
  if (t && !list.includes(t)) list.push(t);
};

const dir = await mkdtemp(join(tmpdir(), "ta98-"));
const response = await fetch(TA98_URL, { headers });
if (!response.ok) throw new Error(`TA98 download failed: ${response.status}`);
const dbPath = join(dir, "ta98.sqlite");
await writeFile(dbPath, Buffer.from(await response.arrayBuffer()));
const db = new DatabaseSync(dbPath, { readOnly: true });
for (const row of db
  .prepare(
    "select id,fma_id,name_la,name_en from ta98 where fma_id is not null and fma_id!=''",
  )
  .all()) {
  const e = entry(`FMA${row.fma_id}`);
  add(e.la, row.name_la);
  add(e.en, row.name_en);
  add(e.ta, row.id);
}
for (const row of db
  .prepare(
    "select t.fma_id,s.synonym,s.lang from synonyms s join ta98 t on t.id=s.id where t.fma_id is not null and t.fma_id!='' and s.synonym_type!='nac:qualified_name'",
  )
  .all()) {
  const e = entry(`FMA${row.fma_id}`);
  add(row.lang === "la" ? e.la : e.en, row.synonym);
}
db.close();

async function sparql(query) {
  const r = await fetch(`${SPARQL}?${new URLSearchParams({ query })}`, {
    headers: { ...headers, Accept: "application/sparql-results+json" },
  });
  if (!r.ok) throw new Error(`Wikidata query failed: ${r.status}`);
  return (await r.json()).results.bindings;
}
for (const property of ["rdfs:label", "skos:altLabel"]) {
  const rows = await sparql(
    `SELECT ?fma ?la ?en WHERE { ?item wdt:P1402 ?fma ; ${property} ?la FILTER(LANG(?la)="la") OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en)="en") } }`,
  );
  for (const row of rows) {
    const e = entry(`FMA${row.fma.value}`);
    add(e.la, row.la.value);
    add(e.en, row.en?.value);
  }
}

const sorted = Object.fromEntries(
  [...terms]
    .filter(([, e]) => e.la.length)
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })),
);
await mkdir(new URL("./data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./data/latin-terms.json", import.meta.url),
  JSON.stringify({
    sources: [
      "Terminologia Anatomica 1998 (FIPAT) via github.com/mhalle/ta98-sqlite",
      "Wikidata Latin labels (CC0)",
    ],
    terms: sorted,
  }) + "\n",
);
console.log(
  `Saved Latin terms for ${Object.keys(sorted).length} FMA concepts.`,
);
