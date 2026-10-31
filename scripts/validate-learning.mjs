import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { curatedDecks } from "../lib/flashcards/decks.ts";
import {
  projectLearning,
  studyDay,
  validEvent,
} from "../lib/flashcards/learning-model.ts";

const catalog = JSON.parse(
  await readFile(new URL("../public/cards/catalog.json", import.meta.url)),
);
const decks = curatedDecks(catalog);
assert.equal(decks.length, 18);
assert.equal(new Set(decks.map((d) => d.id)).size, decks.length);
const catalogueIds = new Set(catalog.structures.map((s) => s.id));
for (const deck of decks) {
  assert.ok(deck.items.length, `${deck.name} must not be empty`);
  assert.equal(
    new Set(deck.items.map((i) => i.structureId)).size,
    deck.items.length,
  );
  assert.ok(
    deck.items.every((i) => catalogueIds.has(i.structureId) && i.label),
  );
}
assert.equal(
  new Set(decks.flatMap((d) => d.items.map((i) => i.structureId))).size,
  catalog.structures.length,
);
assert.ok(
  decks
    .find((d) => d.id === "bones-upper-limb")
    .items.some((i) => i.structureId === "humerus"),
);
assert.ok(
  decks
    .find((d) => d.id === "all-bones")
    .items.some((i) => i.structureId === "humerus"),
);

const now = new Date(2026, 9, 30, 12).getTime();
const event = (id, action, at, deckId = "bones-upper-limb") => ({
  id,
  action,
  at,
  deckId,
  cardId: "humerus",
  mode: "recall",
  schedulerVersion: 1,
});
const introduced = event("1", "introduce", now);
const remembered = event("2", "good", now + 60_000, "all-bones");
const forgotten = event("3", "again", now + 120_000);
const a = projectLearning([introduced, remembered, forgotten], now);
const b = projectLearning(
  [forgotten, introduced, remembered, introduced, forgotten],
  now,
);
assert.deepEqual(
  a,
  b,
  "Offline event order and duplicate delivery must not change progress",
);
assert.equal(
  a.newToday,
  1,
  "The same card in two decks counts as one introduction",
);
assert.equal(a.reviewsToday, 2);
assert.equal(a.lastGrades.humerus, "again");
assert.equal(a.cards.humerus.due, now + 180_000);
assert.equal(a.cards.humerus.step, 0);
const importedState = {
  phase: "review",
  step: 0,
  ease: 2.5,
  interval: 7,
  reps: 8,
  lapses: 1,
  due: now + 604800000,
};
const imported = {
  ...event("old", "import", now - 10),
  mode: "migration",
  initialState: importedState,
};
assert.ok(validEvent(imported));
assert.equal(projectLearning([imported], now).newToday, 0);
assert.deepEqual(projectLearning([imported], now).cards.humerus, importedState);
assert.equal(
  projectLearning([imported, forgotten], now).cards.humerus.phase,
  "relearning",
);
assert.equal(
  projectLearning([imported, forgotten], now).cards.humerus.lapses,
  2,
);
assert.equal(validEvent({ ...introduced, at: "yesterday" }), false);
assert.equal(validEvent({ ...imported, initialState: { due: 1 } }), false);
assert.equal(studyDay(new Date(2026, 9, 30, 3, 59).getTime()), "2026-10-29");
assert.equal(studyDay(new Date(2026, 9, 30, 4, 0).getTime()), "2026-10-30");
console.log(
  `Validated ${decks.length} curated decks, ${catalogueIds.size} unique subjects, shared progress, migration, idempotent replay, and study-day boundaries.`,
);
