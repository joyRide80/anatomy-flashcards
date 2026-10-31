import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import {
  buildLatinIndex,
  normalizeLatin,
  parseUpload,
} from "../lib/flashcards/latin.ts";
import { introduce, schedule, pickNext, LEARNING_STEPS } from "../lib/srs.ts";

const atlas = JSON.parse(
  await readFile(new URL("../public/models/atlas.json", import.meta.url)),
);
const catalog = JSON.parse(
  await readFile(new URL("../public/cards/catalog.json", import.meta.url)),
);
const meshes = new Set(atlas.parts.map((p) => p.id));
const ids = new Set();
const referenced = new Set();

for (const s of catalog.structures) {
  assert.ok(!ids.has(s.id), `Duplicate structure ${s.id}`);
  ids.add(s.id);
  assert.ok(
    ["bone", "muscle", "ligament", "joint"].includes(s.category),
    `${s.id} category`,
  );
  assert.ok(
    s.parts.length && s.parts.every((p) => meshes.has(p)),
    `${s.id} parts`,
  );
  assert.ok(
    s.focus.length && s.focus.every((p) => s.parts.includes(p)),
    `${s.id} focus`,
  );
  assert.ok(
    s.images.length,
    `${s.id} has no rendered image; run scripts/render-cards.mjs`,
  );
  for (const img of s.images) {
    await access(new URL(`../public${img.src}`, import.meta.url));
    referenced.add(img.src.split("/").pop());
  }
}
for (const s of catalog.structures)
  for (const m of s.members ?? []) assert.ok(ids.has(m), `${s.id} member ${m}`);
for (const g of catalog.groups) {
  assert.ok(g.la.length && g.members.length > 1, `${g.id} group`);
  for (const m of g.members) assert.ok(ids.has(m), `${g.id} member ${m}`);
}
const files = (
  await readdir(new URL("../public/cards/img/", import.meta.url))
).filter((f) => f.endsWith(".webp"));
const orphans = files.filter((f) => !referenced.has(f));
assert.deepEqual(orphans, [], "Unreferenced card images");

// Latin matching.
assert.equal(
  normalizeLatin("M. Biceps-Brachii dexter"),
  normalizeLatin("musculus bicepsbrachii"),
);
assert.equal(normalizeLatin("Costa 1"), "costa i");
const index = buildLatinIndex(catalog);
const expect = (term, status, id) => {
  const r = index.match(term);
  assert.equal(r.status, status, `${term}: ${r.status}`);
  if (id)
    assert.equal(r.candidates[0].id, id, `${term}: ${r.candidates[0]?.id}`);
};
expect("M. biceps brachii", "exact", "biceps-brachii");
expect("musculus deltoideus", "exact", "deltoid");
expect("Os femoris", "exact", "femur");
expect("Lig. plantare longum", "exact", "long-plantar-ligament");
expect("Costa 1", "exact", "first-rib");
expect("Costae", "group", "group-rib");
expect("m. bizeps brachi", "suggested", "biceps-brachii");
expect("Caput longum", "ambiguous");
expect("qwertz", "none");
assert.deepEqual(
  parseUpload("Latin;Note\nM. biceps brachii; arm\n\n# comment\nFemur"),
  [{ term: "M. biceps brachii", note: "arm" }, { term: "Femur" }],
);

// Scheduling.
const t = 1_000_000;
let card = introduce(t);
assert.equal(card.due, t + LEARNING_STEPS[0]);
card = schedule(card, "good", card.due);
assert.equal(card.phase, "learning");
card = schedule(card, "good", card.due);
assert.equal(card.phase, "review");
assert.equal(card.interval, 1);
const lapsed = schedule(schedule(card, "good", card.due), "again", card.due);
assert.equal(lapsed.phase, "relearning");
assert.equal(lapsed.lapses, 1);
const deck = catalog.structures.slice(0, 3);
assert.equal(pickNext(deck, {}, t, 0), null);
assert.equal(pickNext(deck, {}, t, 5).kind, "learn");

console.log(
  `Validated ${catalog.structures.length} structures, ${catalog.groups.length} groups, ${files.length} images.`,
);
