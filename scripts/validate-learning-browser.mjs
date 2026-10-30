import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3016";
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const source = `/@fs${process.cwd()}/lib/flashcards/learning-store.ts`;
const output = new URL("../outputs/learning-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await engine.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  Math.random = () => 0.8;
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = (p = page) =>
  p.evaluate(async (path) => (await import(path)).learningStore().read(), source);
const waitEvents = async (count, p = page) => {
  await p.waitForFunction(
    async ({ path, count }) =>
      (await (await import(path)).learningStore().read()).events.length === count,
    { path: source, count },
  );
};
const deck = (name) =>
  page.locator(".catalog-card").filter({ has: page.getByRole("heading", { name, exact: true }) });

try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Pick a deck. Learn the body." }).waitFor();
  assert.equal(await page.locator(".catalog-card").count(), 16);
  assert.equal(await page.getByText("New deck from your Latin list", { exact: true }).count(), 0);
  await page.screenshot({ path: new URL("desktop.png", output).pathname, fullPage: true });
  await page.getByRole("searchbox", { name: "Search decks" }).fill("upper limb");
  assert.equal(await page.locator(".catalog-card").count(), 4);
  await deck("Upper limb bones").getByRole("button", { name: "Preview cards" }).click();
  assert.equal(await deck("Upper limb bones").locator(".deck-preview li").count(), 5);
  await page
    .getByRole("button", { name: "Add Upper limb bones to My learning", exact: true })
    .click();
  await page.getByRole("button", { name: "My learning 1", exact: true }).waitFor();
  await deck("Upper limb bones").getByRole("button", { name: "Start deck" }).click();
  await page.getByRole("button", { name: /Got it/ }).click();
  await waitEvents(1);
  await page.getByRole("button", { name: "Back to decks", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "My learning 1", exact: true }).waitFor();
  assert.equal((await read()).events.length, 1);
  assert.ok(
    (await deck("All available bones").innerText()).includes("1 introduced"),
    "Progress is shared across decks",
  );

  // A failed local transaction must retain the answer and offer an idempotent retry.
  await page.evaluate(async (path) => {
    const { LearningStore } = await import(path);
    const original = LearningStore.prototype.append;
    let fail = true;
    LearningStore.prototype.append = async function (event) {
      if (fail) {
        fail = false;
        throw new Error("Simulated disk write failure.");
      }
      return original.call(this, event);
    };
  }, source);
  await deck("Upper limb bones").getByRole("button", { name: "Study deck" }).click();
  await page.getByRole("button", { name: /Got it/ }).click();
  await page.getByRole("button", { name: "Retry saving answer" }).waitFor();
  assert.equal((await read()).events.length, 1);
  await page.getByRole("button", { name: "Retry saving answer" }).click();
  await waitEvents(2);
  await page.getByRole("button", { name: "Back to decks", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove Upper limb bones from My learning", exact: true })
    .click();
  await page.getByRole("button", { name: "My learning 0", exact: true }).waitFor();
  assert.equal((await read()).events.length, 2, "Removing a deck must retain its reviews");

  await page.getByText("Backup & account settings", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download progress backup" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(backup.events.length, 2);
  const restoreContext = await browser.newContext();
  const restored = await restoreContext.newPage();
  await restored.goto(base);
  await restored.getByText("Backup & account settings", { exact: true }).click();
  await restored
    .getByLabel("Restore learning backup")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await waitEvents(2, restored);
  await restored
    .getByLabel("Restore learning backup")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await waitEvents(2, restored);
  await restoreContext.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("heading", { name: "Pick a deck. Learn the body." }).waitFor();
  assert.ok(
    await page.evaluate(() => document.querySelector(".study").scrollWidth <= innerWidth),
    "Mobile page must not overflow horizontally",
  );
  await page.screenshot({ path: new URL("mobile.png", output).pathname, fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  assert.ok(
    await page.evaluate(() => document.querySelector(".study").scrollWidth <= innerWidth),
    "Small phones must not overflow horizontally",
  );

  // Simulate the prior app on another installation and verify non-destructive migration.
  const legacyContext = await browser.newContext();
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(`${base}/state/index.html`);
  await legacyPage.evaluate(async () => {
    const t = Date.now();
    const deck = {
      id: "old-custom",
      name: "My old course",
      createdAt: t,
      updatedAt: t,
      newPerDay: 20,
      items: [{ structureId: "humerus", label: "Humerus" }],
    };
    const progress = {
      deckId: deck.id,
      savedAt: t,
      newToday: { day: "2026-10-30", count: 1 },
      cards: {
        humerus: {
          phase: "review",
          step: 0,
          ease: 2.5,
          interval: 5,
          reps: 8,
          lapses: 1,
          due: t + 432000000,
        },
      },
    };
    localStorage.setItem("human-atlas-flashcards-decks", JSON.stringify([deck]));
    localStorage.setItem("human-atlas-flashcards-progress", JSON.stringify([progress]));
    localStorage.setItem("human-atlas-flashcards-ready", "1");
    await new Promise((resolve, reject) => {
      const r = indexedDB.open("human-atlas-flashcards", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("decks", { keyPath: "id" });
        r.result.createObjectStore("progress", { keyPath: "deckId" });
        r.result
          .createObjectStore("reviews", { keyPath: "id", autoIncrement: true })
          .createIndex("deckId", "deckId");
      };
      r.onsuccess = () => {
        const tx = r.result.transaction(["decks", "progress"], "readwrite");
        tx.objectStore("decks").put(deck);
        tx.objectStore("progress").put(progress);
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = reject;
      };
      r.onerror = reject;
    });
  });
  await legacyPage.goto(base);
  await legacyPage.getByRole("button", { name: "My learning 1", exact: true }).click();
  await legacyPage.getByText("My old course · 1 cards").waitFor();
  const migrated = await read(legacyPage);
  assert.equal(migrated.events[0].initialState.reps, 8);
  assert.equal(migrated.legacyDecks[0].name, "My old course");
  assert.ok(
    await legacyPage.evaluate(() => localStorage.getItem("human-atlas-flashcards-progress")),
    "Original data is preserved",
  );
  await legacyContext.close();

  assert.deepEqual(errors, []);
  console.log(
    `${process.env.BROWSER ?? "chromium"}: deck browsing, previews, save-before-advance, failure/retry, refresh, shared progress, remove-without-reset, backup restore, migration, and mobile layouts passed.`,
  );
} finally {
  await browser.close();
}
