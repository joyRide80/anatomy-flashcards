import type { Deck, DeckProgress, ReviewLog } from "./types";

const DB_NAME = "human-atlas-flashcards";
const VERSION = 1;
const EXPORT_FORMAT = "human-atlas-flashcards";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("decks", { keyPath: "id" });
      db.createObjectStore("progress", { keyPath: "deckId" });
      const reviews = db.createObjectStore("reviews", {
        keyPath: "id",
        autoIncrement: true,
      });
      reviews.createIndex("deckId", "deckId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
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

/** Study days roll over at 4 a.m. local time so late-night sessions count toward the same day. */
export function studyDay(now = Date.now()) {
  const d = new Date(now - 4 * 3_600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function listDecks(): Promise<Deck[]> {
  const db = await open();
  const decks = await result(
    db.transaction("decks").objectStore("decks").getAll() as IDBRequest<Deck[]>,
  );
  return decks.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveDeck(deck: Deck) {
  const db = await open();
  const tx = db.transaction("decks", "readwrite");
  tx.objectStore("decks").put(deck);
  await done(tx);
}

export async function deleteDeck(deckId: string) {
  const db = await open();
  const tx = db.transaction(["decks", "progress", "reviews"], "readwrite");
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
}

export async function getProgress(deckId: string): Promise<DeckProgress> {
  const db = await open();
  const stored = await result(
    db
      .transaction("progress")
      .objectStore("progress")
      .get(deckId) as IDBRequest<DeckProgress | undefined>,
  );
  return (
    stored ?? { deckId, cards: {}, newToday: { day: studyDay(), count: 0 } }
  );
}

export async function listProgress(): Promise<DeckProgress[]> {
  const db = await open();
  return result(
    db.transaction("progress").objectStore("progress").getAll() as IDBRequest<
      DeckProgress[]
    >,
  );
}

/** Saves the new scheduling state and its review log entry together. */
export async function recordReview(progress: DeckProgress, review?: ReviewLog) {
  const db = await open();
  const tx = db.transaction(["progress", "reviews"], "readwrite");
  tx.objectStore("progress").put(progress);
  if (review) tx.objectStore("reviews").add(review);
  await done(tx);
}

export async function listReviews(deckId: string): Promise<ReviewLog[]> {
  const db = await open();
  return result(
    db
      .transaction("reviews")
      .objectStore("reviews")
      .index("deckId")
      .getAll(deckId) as IDBRequest<ReviewLog[]>,
  );
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
  const db = await open();
  const tx = db.transaction(["decks", "progress", "reviews"]);
  const [decks, progress, reviews] = await Promise.all([
    result(tx.objectStore("decks").getAll() as IDBRequest<Deck[]>),
    result(tx.objectStore("progress").getAll() as IDBRequest<DeckProgress[]>),
    result(tx.objectStore("reviews").getAll() as IDBRequest<ReviewLog[]>),
  ]);
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
    progress,
    reviews,
  };
}

/** Restores a backup. Decks with the same id are replaced along with their progress and history. */
export async function importBackup(data: unknown): Promise<number> {
  const backup = data as Partial<Backup>;
  if (
    backup?.format !== EXPORT_FORMAT ||
    !Array.isArray(backup.decks) ||
    !Array.isArray(backup.progress) ||
    !Array.isArray(backup.reviews)
  )
    throw new Error("This file is not a Human Atlas flash card backup.");
  for (const deck of backup.decks) await deleteDeck(deck.id);
  const db = await open();
  const tx = db.transaction(["decks", "progress", "reviews"], "readwrite");
  for (const deck of backup.decks) tx.objectStore("decks").put(deck);
  for (const p of backup.progress) tx.objectStore("progress").put(p);
  for (const { id: _id, ...review } of backup.reviews)
    tx.objectStore("reviews").add(review);
  await done(tx);
  return backup.decks.length;
}
