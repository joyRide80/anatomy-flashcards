import type { Deck, DeckProgress, ReviewLog } from "./types";

const DB_NAME = "human-atlas-flashcards";
const VERSION = 1;
const EXPORT_FORMAT = "human-atlas-flashcards";

/**
 * Mobile Safari often drops IndexedDB on refresh (the write is reported as
 * committed, then the database is empty after reload). Deck lists are small,
 * so a synchronous localStorage copy is what actually survives that reload.
 * After the first successful read, the copy is the source of truth.
 */
const DECKS_KEY = "human-atlas-flashcards-decks";
const PROGRESS_KEY = "human-atlas-flashcards-progress";
const READY_KEY = "human-atlas-flashcards-ready";
const IDB_TIMEOUT_MS = 2500;

const STORAGE_ERROR =
  "This browser blocked local storage, so decks cannot be saved.";

type StampedProgress = DeckProgress & { savedAt?: number };

let opening: Promise<IDBDatabase> | null = null;
let migrating: Promise<void> | null = null;
let askedToPersist = false;

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, accept: (value: unknown) => value is T): T[] {
  const store = browserStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(accept) : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown): boolean {
  const store = browserStorage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isDeck(value: unknown): value is Deck {
  if (!value || typeof value !== "object") return false;
  const deck = value as Deck;
  return (
    typeof deck.id === "string" &&
    typeof deck.name === "string" &&
    typeof deck.updatedAt === "number" &&
    Array.isArray(deck.items)
  );
}

function isProgress(value: unknown): value is StampedProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as StampedProgress;
  return (
    typeof progress.deckId === "string" &&
    !!progress.cards &&
    typeof progress.cards === "object" &&
    !!progress.newToday &&
    typeof progress.newToday.day === "string"
  );
}

function readDecks() {
  return readJson(DECKS_KEY, isDeck);
}

function readProgress() {
  return readJson(PROGRESS_KEY, isProgress);
}

function mirrorReady() {
  const store = browserStorage();
  if (!store) return false;
  try {
    return store.getItem(READY_KEY) === "1";
  } catch {
    return false;
  }
}

function markReady() {
  const store = browserStorage();
  if (!store) return;
  try {
    store.setItem(READY_KEY, "1");
  } catch {
    // The next load will try IndexedDB again.
  }
}

function stripProgress(progress: StampedProgress): DeckProgress {
  const { savedAt: _savedAt, ...rest } = progress;
  return rest;
}

function sortDecks(decks: Deck[]) {
  return [...decks].sort((a, b) => b.updatedAt - a.updatedAt);
}

function mergeDecks(primary: Deck[], secondary: Deck[]) {
  const map = new Map(primary.map((deck) => [deck.id, deck]));
  for (const deck of secondary) {
    const prev = map.get(deck.id);
    if (!prev || deck.updatedAt >= prev.updatedAt) map.set(deck.id, deck);
  }
  return [...map.values()];
}

function mergeProgress(
  primary: StampedProgress[],
  secondary: StampedProgress[],
) {
  const map = new Map(primary.map((progress) => [progress.deckId, progress]));
  for (const progress of secondary) {
    const prev = map.get(progress.deckId);
    if (!prev || (progress.savedAt ?? 0) >= (prev.savedAt ?? 0))
      map.set(progress.deckId, progress);
  }
  return [...map.values()];
}

/** Ids present before an IndexedDB await, then removed locally, stay removed. */
function reconcileDecks(before: Deck[], idbDecks: Deck[], localNow: Deck[]) {
  const gone = new Set(before.map((deck) => deck.id));
  for (const deck of localNow) gone.delete(deck.id);
  return mergeDecks(idbDecks, localNow).filter((deck) => !gone.has(deck.id));
}

function reconcileProgress(
  before: StampedProgress[],
  idbProgress: StampedProgress[],
  localNow: StampedProgress[],
) {
  const gone = new Set(before.map((progress) => progress.deckId));
  for (const progress of localNow) gone.delete(progress.deckId);
  return mergeProgress(idbProgress, localNow).filter(
    (progress) => !gone.has(progress.deckId),
  );
}

function upsertDeck(deck: Deck) {
  return writeJson(DECKS_KEY, [
    ...readDecks().filter((item) => item.id !== deck.id),
    deck,
  ]);
}

function upsertProgress(progress: StampedProgress) {
  return writeJson(PROGRESS_KEY, [
    ...readProgress().filter((item) => item.deckId !== progress.deckId),
    progress,
  ]);
}

function forgetDeck(deckId: string) {
  const decksOk = writeJson(
    DECKS_KEY,
    readDecks().filter((deck) => deck.id !== deckId),
  );
  const progressOk = writeJson(
    PROGRESS_KEY,
    readProgress().filter((progress) => progress.deckId !== deckId),
  );
  return decksOk && progressOk;
}

function requestPersistence() {
  if (askedToPersist || typeof navigator === "undefined") return;
  askedToPersist = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Persistence is optional. The local copy is already written.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("IndexedDB timed out")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (/timed out/i.test(error.message)) return false;
  return (
    error.name === "InvalidStateError" ||
    error.name === "UnknownError" ||
    /connection.*lost|connection is closing/i.test(error.message)
  );
}

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      opening = null;
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("decks"))
        db.createObjectStore("decks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress"))
        db.createObjectStore("progress", { keyPath: "deckId" });
      if (!db.objectStoreNames.contains("reviews")) {
        const reviews = db.createObjectStore("reviews", {
          keyPath: "id",
          autoIncrement: true,
        });
        reviews.createIndex("deckId", "deckId");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      db.onclose = () => {
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("IndexedDB could not be opened"));
    };
  });
  return opening;
}

async function database(): Promise<IDBDatabase | null> {
  try {
    return await withTimeout(open(), IDB_TIMEOUT_MS);
  } catch {
    return null;
  }
}

function readwrite(db: IDBDatabase, stores: string[]) {
  try {
    return db.transaction(stores, "readwrite", { durability: "strict" });
  } catch {
    return db.transaction(stores, "readwrite");
  }
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDatabase<T>(
  run: (db: IDBDatabase) => Promise<T>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = await database();
    if (!db) return null;
    try {
      return await withTimeout(run(db), IDB_TIMEOUT_MS);
    } catch (error) {
      opening = null;
      if (attempt === 1 || !isConnectionError(error)) return null;
    }
  }
  return null;
}

async function idbListDecks(): Promise<Deck[] | null> {
  return withDatabase(async (db) => {
    const decks = await result(
      db.transaction("decks").objectStore("decks").getAll() as IDBRequest<
        Deck[]
      >,
    );
    return decks.filter(isDeck);
  });
}

async function idbListProgress(): Promise<StampedProgress[] | null> {
  return withDatabase(async (db) => {
    const progress = await result(
      db.transaction("progress").objectStore("progress").getAll() as IDBRequest<
        StampedProgress[]
      >,
    );
    return progress.filter(isProgress);
  });
}

async function idbPutDeck(deck: Deck) {
  return withDatabase(async (db) => {
    const tx = readwrite(db, ["decks"]);
    tx.objectStore("decks").put(deck);
    await done(tx);
    return true;
  });
}

async function idbPutProgress(progress: StampedProgress, review?: ReviewLog) {
  return withDatabase(async (db) => {
    const tx = readwrite(db, ["progress", "reviews"]);
    tx.objectStore("progress").put(progress);
    if (review) tx.objectStore("reviews").add(review);
    await done(tx);
    return true;
  });
}

async function idbDelete(deckId: string) {
  return withDatabase(async (db) => {
    const tx = readwrite(db, ["decks", "progress", "reviews"]);
    tx.objectStore("decks").delete(deckId);
    tx.objectStore("progress").delete(deckId);
    const index = tx.objectStore("reviews").index("deckId");
    index.openKeyCursor(IDBKeyRange.only(deckId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursor | null>).result;
      if (!cursor) return;
      tx.objectStore("reviews").delete(cursor.primaryKey);
      cursor.continue();
    };
    await done(tx);
    return true;
  });
}

async function idbListReviews(): Promise<ReviewLog[] | null> {
  return withDatabase(async (db) =>
    result(
      db.transaction("reviews").objectStore("reviews").getAll() as IDBRequest<
        ReviewLog[]
      >,
    ),
  );
}

async function idbPutBackup(backup: Backup) {
  return withDatabase(async (db) => {
    const tx = readwrite(db, ["decks", "progress", "reviews"]);
    for (const deck of backup.decks) tx.objectStore("decks").put(deck);
    for (const progress of backup.progress)
      tx.objectStore("progress").put({ ...progress, savedAt: Date.now() });
    for (const { id: _id, ...review } of backup.reviews)
      tx.objectStore("reviews").add(review);
    await done(tx);
    return true;
  });
}

/** Copy any IndexedDB-only decks into localStorage once. Failures stay unready and retry. */
function ensureMigrated() {
  if (mirrorReady()) return Promise.resolve();
  if (!migrating) {
    const decksBefore = readDecks();
    const progressBefore = readProgress();
    migrating = migrate(decksBefore, progressBefore).finally(() => {
      migrating = null;
    });
  }
  return migrating;
}

async function migrate(decksBefore: Deck[], progressBefore: StampedProgress[]) {
  if (mirrorReady()) return;
  const [idbDecks, idbProgress] = await Promise.all([
    idbListDecks(),
    idbListProgress(),
  ]);
  if (!idbDecks || !idbProgress) return;
  if (mirrorReady()) return;
  const decks = reconcileDecks(decksBefore, idbDecks, readDecks());
  const progress = reconcileProgress(
    progressBefore,
    idbProgress,
    readProgress(),
  );
  if (writeJson(DECKS_KEY, decks) && writeJson(PROGRESS_KEY, progress))
    markReady();
}

function backfillDecks(decks: Deck[]) {
  void (async () => {
    const stored = await idbListDecks();
    if (!stored) return;
    const have = new Set(stored.map((deck) => deck.id));
    for (const deck of decks) {
      if (have.has(deck.id)) continue;
      const latest = readDecks().find((item) => item.id === deck.id);
      if (latest) await idbPutDeck(latest);
    }
  })();
}

function backfillProgress(progress: StampedProgress[]) {
  void (async () => {
    const stored = await idbListProgress();
    if (!stored) return;
    const have = new Set(stored.map((item) => item.deckId));
    for (const item of progress) {
      if (have.has(item.deckId)) continue;
      const latest = readProgress().find(
        (candidate) => candidate.deckId === item.deckId,
      );
      if (latest) await idbPutProgress(latest);
    }
  })();
}

/** Decks already on this device, readable before IndexedDB responds. */
export function cachedDecks(): Deck[] {
  return sortDecks(readDecks());
}

/** Progress already on this device, readable before IndexedDB responds. */
export function cachedProgress(): Record<string, DeckProgress> {
  return Object.fromEntries(
    readProgress().map((progress) => [
      progress.deckId,
      stripProgress(progress),
    ]),
  );
}

/** Study days roll over at 4 a.m. local time so late-night sessions count toward the same day. */
export function studyDay(now = Date.now()) {
  const d = new Date(now - 4 * 3_600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function listDecks(): Promise<Deck[]> {
  await ensureMigrated();
  const local = readDecks();
  if (mirrorReady()) {
    backfillDecks(local);
    return sortDecks(local);
  }
  const stored = await idbListDecks();
  return sortDecks(mergeDecks(stored ?? [], local));
}

export async function saveDeck(deck: Deck) {
  const mirrored = upsertDeck(deck);
  const stored = await idbPutDeck(deck);
  // localStorage is the copy that survives a phone refresh. If it is available
  // and the write failed, saving only to IndexedDB would vanish on reload.
  if (browserStorage() && !mirrored) throw new Error(STORAGE_ERROR);
  if (!mirrored && !stored) throw new Error(STORAGE_ERROR);
  requestPersistence();
}

export async function deleteDeck(deckId: string) {
  const mirrored = forgetDeck(deckId);
  const stored = await idbDelete(deckId);
  if (browserStorage() && !mirrored) throw new Error(STORAGE_ERROR);
  if (!mirrored && !stored) throw new Error(STORAGE_ERROR);
}

export async function getProgress(deckId: string): Promise<DeckProgress> {
  const all = await listProgress();
  return (
    all.find((progress) => progress.deckId === deckId) ?? {
      deckId,
      cards: {},
      newToday: { day: studyDay(), count: 0 },
    }
  );
}

export async function listProgress(): Promise<DeckProgress[]> {
  await ensureMigrated();
  const local = readProgress();
  if (mirrorReady()) {
    backfillProgress(local);
    return local.map(stripProgress);
  }
  const stored = await idbListProgress();
  return mergeProgress(stored ?? [], local).map(stripProgress);
}

/** Saves the new scheduling state and its review log entry together. */
export async function recordReview(progress: DeckProgress, review?: ReviewLog) {
  const stamped: StampedProgress = { ...progress, savedAt: Date.now() };
  const mirrored = upsertProgress(stamped);
  const stored = await idbPutProgress(stamped, review);
  if (browserStorage() && !mirrored) throw new Error(STORAGE_ERROR);
  if (!mirrored && !stored) throw new Error(STORAGE_ERROR);
  requestPersistence();
}

export async function listReviews(deckId: string): Promise<ReviewLog[]> {
  const reviews = await withDatabase(async (db) =>
    result(
      db
        .transaction("reviews")
        .objectStore("reviews")
        .index("deckId")
        .getAll(deckId) as IDBRequest<ReviewLog[]>,
    ),
  );
  return reviews ?? [];
}

export interface Backup {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  decks: Deck[];
  progress: DeckProgress[];
  reviews: ReviewLog[];
}

export async function exportBackup(): Promise<Backup> {
  const [decks, progress, reviews] = await Promise.all([
    listDecks(),
    listProgress(),
    idbListReviews(),
  ]);
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
    progress,
    reviews: reviews ?? [],
  };
}

function parseBackup(data: unknown): Backup {
  const backup = data as Partial<Backup>;
  if (
    backup?.format !== EXPORT_FORMAT ||
    !Array.isArray(backup.decks) ||
    !Array.isArray(backup.progress) ||
    !Array.isArray(backup.reviews)
  )
    throw new Error("This file is not a Human Atlas flash card backup.");
  return backup as Backup;
}

/** Restores a backup. Decks with the same id are replaced along with their progress and history. */
export async function importBackup(data: unknown): Promise<number> {
  const backup = parseBackup(data);
  for (const deck of backup.decks) await deleteDeck(deck.id);
  const stamped = backup.progress.map((progress) => ({
    ...progress,
    savedAt: Date.now(),
  }));
  const mirrored =
    writeJson(DECKS_KEY, mergeDecks(readDecks(), backup.decks)) &&
    writeJson(PROGRESS_KEY, mergeProgress(readProgress(), stamped));
  if (mirrored) markReady();
  const stored = await idbPutBackup(backup);
  if (browserStorage() && !mirrored) throw new Error(STORAGE_ERROR);
  if (!mirrored && !stored) throw new Error(STORAGE_ERROR);
  requestPersistence();
  return backup.decks.length;
}
