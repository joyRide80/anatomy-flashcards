import type { Deck, DeckProgress, ReviewLog } from "./types";

const DB_NAME = "human-atlas-flashcards";
const VERSION = 1;
const EXPORT_FORMAT = "human-atlas-flashcards";

/**
 * iOS Safari keeps localStorage and IndexedDB in the tab process. Force-quitting
 * Safari discards writes that have not been flushed. Cookies live in a separate
 * store and survive that quit. Deck snapshots are cookie-backed under /state/
 * so card images are not sent with a large Cookie header.
 */
const DECKS_KEY = "human-atlas-flashcards-decks";
const PROGRESS_KEY = "human-atlas-flashcards-progress";
const READY_KEY = "human-atlas-flashcards-ready";
const REV_KEY = "human-atlas-flashcards-rev";
const IDB_TIMEOUT_MS = 2500;
const COOKIE_CHUNK = 3000;
const COOKIE_SLOTS = 8;
/** Stay under the server header limit on the one request that sends these cookies. */
const COOKIE_BUDGET = 12000;

const STORAGE_ERROR =
  "This browser blocked local storage, so decks cannot be saved.";

type StampedProgress = DeckProgress & { savedAt?: number };

let opening: Promise<IDBDatabase> | null = null;
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

function readRev() {
  const store = browserStorage();
  if (!store) return 0;
  try {
    const rev = Number(store.getItem(REV_KEY));
    return Number.isFinite(rev) ? rev : 0;
  } catch {
    return 0;
  }
}

function setRev(rev: number) {
  const store = browserStorage();
  if (!store) return;
  try {
    store.setItem(REV_KEY, String(rev));
  } catch {
    // The cookie snapshot still carries the revision.
  }
}

function cookieSuffix() {
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  return `; Path=/state/; SameSite=Lax${secure}`;
}

function clearRootCookies() {
  if (typeof document === "undefined") return;
  for (let i = 0; i < 24; i++) {
    document.cookie = `ha${i}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

clearRootCookies();

function slimDeck(deck: Deck): Deck {
  return {
    ...deck,
    items: deck.items.map((item) => {
      const slim: Deck["items"][number] = {
        structureId: item.structureId,
        label: "",
      };
      if (item.note) slim.note = item.note;
      const { label: _label, ...stored } = slim;
      return stored as Deck["items"][number];
    }),
  };
}

/** Writes the snapshot under /state/ so it is not attached to image requests. */
function writeCookieSnapshot(payload: unknown) {
  if (typeof document === "undefined") return false;
  let encoded: string;
  try {
    encoded = encodeURIComponent(JSON.stringify(payload));
  } catch {
    return false;
  }
  if (encoded.length > COOKIE_BUDGET) return false;
  const count = Math.max(1, Math.ceil(encoded.length / COOKIE_CHUNK));
  if (count > COOKIE_SLOTS) return false;
  const keep = cookieSuffix();
  try {
    for (let i = 0; i < count; i++) {
      const value = encoded.slice(i * COOKIE_CHUNK, (i + 1) * COOKIE_CHUNK);
      document.cookie = `ha${i}=${value}; Max-Age=31536000${keep}`;
    }
    for (let i = count; i < 24; i++) {
      document.cookie = `ha${i}=; Max-Age=0${keep}`;
    }
    return true;
  } catch {
    return false;
  }
}

function packsFor(decks: Deck[], progress: StampedProgress[], rev: number) {
  const custom = decks
    .filter((deck) => !deck.id.startsWith("default-"))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const packs: {
    rev: number;
    complete: boolean;
    decks: Deck[];
    progress: StampedProgress[];
  }[] = [];
  const push = (list: Deck[], complete: boolean) => {
    const ids = new Set(list.map((deck) => deck.id));
    packs.push({
      rev,
      complete,
      decks: list,
      progress: progress.filter((item) => ids.has(item.deckId)),
    });
    packs.push({ rev, complete, decks: list, progress: [] });
  };
  push(custom, true);
  push(custom.map(slimDeck), true);
  for (let n = custom.length - 1; n >= 0; n--)
    push(custom.slice(0, n).map(slimDeck), false);
  return packs;
}

function snapshot(decks: Deck[], progress: StampedProgress[]) {
  const rev = Date.now();
  const hasCustom = decks.some((deck) => !deck.id.startsWith("default-"));
  for (const pack of packsFor(decks, progress, rev)) {
    if (hasCustom && pack.decks.length === 0) continue;
    if (writeCookieSnapshot(pack)) return rev;
  }
  return null;
}

function commit(decks: Deck[], progress: StampedProgress[]) {
  const local =
    writeJson(DECKS_KEY, decks) && writeJson(PROGRESS_KEY, progress);
  const rev = snapshot(decks, progress);
  // A failed local write must leave the revision behind the cookie, so the
  // next launch replaces the empty browser storage with the cookie snapshot.
  if (local) setRev(rev ?? Date.now());
  return local || rev !== null;
}

function upsertDeck(deck: Deck) {
  return commit(
    [...readDecks().filter((item) => item.id !== deck.id), deck],
    readProgress(),
  );
}

function upsertProgress(progress: StampedProgress) {
  return commit(readDecks(), [
    ...readProgress().filter((item) => item.deckId !== progress.deckId),
    progress,
  ]);
}

function forgetDeck(deckId: string) {
  return commit(
    readDecks().filter((deck) => deck.id !== deckId),
    readProgress().filter((progress) => progress.deckId !== deckId),
  );
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

let frame: HTMLIFrameElement | null = null;
let frameReady: Promise<void> | null = null;
let booted: Promise<void> | null = null;
let cookieReadOk = false;
let didBoot = false;
const cookieWaits = new Map<number, (cookie: string) => void>();
let cookieWaitId = 1;

function onCookieMessage(event: MessageEvent) {
  if (event.origin !== location.origin) return;
  if (event.data?.type !== "ha-cookie") return;
  const done = cookieWaits.get(event.data.id);
  if (!done) return;
  cookieWaits.delete(event.data.id);
  done(typeof event.data.cookie === "string" ? event.data.cookie : "");
}

function ensureFrame() {
  if (frameReady) return frameReady;
  if (typeof document === "undefined") {
    return Promise.reject(new Error("No document"));
  }
  frameReady = new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    frame = iframe;
    iframe.src = "/state/index.html";
    iframe.hidden = true;
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0";
    const timer = setTimeout(
      () => reject(new Error("Cookie frame timed out")),
      4000,
    );
    const ready = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.type !== "ha-ready")
        return;
      clearTimeout(timer);
      window.removeEventListener("message", ready);
      resolve();
    };
    window.addEventListener("message", onCookieMessage);
    window.addEventListener("message", ready);
    iframe.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Cookie frame failed"));
    };
    document.documentElement.appendChild(iframe);
  });
  frameReady = frameReady.catch((error) => {
    frameReady = null;
    throw error;
  });
  return frameReady;
}

function readCookieHeader() {
  return ensureFrame().then(
    () =>
      new Promise<string | null>((resolve) => {
        const win = frame?.contentWindow;
        if (!win) {
          resolve(null);
          return;
        }
        const id = cookieWaitId++;
        const timer = setTimeout(() => {
          cookieWaits.delete(id);
          resolve(null);
        }, 2000);
        cookieWaits.set(id, (cookie) => {
          clearTimeout(timer);
          resolve(cookie);
        });
        win.postMessage({ type: "ha-read", id }, location.origin);
      }),
    () => null,
  );
}

function decodeCookieSnapshot(header: string) {
  const parts = new Map<number, string>();
  for (const piece of header.split(";")) {
    const trimmed = piece.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq);
    if (!/^ha\d+$/.test(name)) continue;
    parts.set(Number(name.slice(2)), trimmed.slice(eq + 1));
  }
  if (!parts.has(0)) return null;
  let encoded = "";
  for (let i = 0; parts.has(i); i++) encoded += parts.get(i);
  try {
    return JSON.parse(decodeURIComponent(encoded)) as {
      rev?: number;
      complete?: boolean;
      decks?: unknown;
      progress?: unknown;
    };
  } catch {
    return null;
  }
}

/** If Safari discarded localStorage on quit, the cookie snapshot is newer. */
async function restoreCookies() {
  const header = await readCookieHeader();
  if (header == null) return;
  cookieReadOk = true;
  const data = decodeCookieSnapshot(header);
  if (!data) return;
  const rev = typeof data.rev === "number" ? data.rev : 0;
  if (rev <= readRev()) return;
  const incoming = Array.isArray(data.decks) ? data.decks.filter(isDeck) : [];
  const progress = Array.isArray(data.progress)
    ? data.progress.filter(isProgress)
    : [];
  const ids = new Set(incoming.map((deck) => deck.id));
  const kept = data.complete
    ? readDecks().filter(
        (deck) => deck.id.startsWith("default-") || ids.has(deck.id),
      )
    : readDecks();
  writeJson(DECKS_KEY, mergeDecks(kept, incoming));
  writeJson(PROGRESS_KEY, mergeProgress(readProgress(), progress));
  setRev(rev);
  if (incoming.length || kept.length) markReady();
}

/** Copy any IndexedDB-only decks into localStorage once. Failures stay unready and retry. */
function ensureMigrated() {
  booted ??= boot();
  return booted;
}

async function boot() {
  try {
    await restoreCookies();
    if (!mirrorReady()) await migrate(readDecks(), readProgress());
    const decks = readDecks();
    const progress = readProgress();
    if (cookieReadOk && (decks.length || progress.length)) {
      const rev = snapshot(decks, progress);
      if (rev !== null) setRev(rev);
    }
    didBoot = true;
  } catch (error) {
    booted = null;
    throw error;
  }
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
  if (writeJson(DECKS_KEY, decks) && writeJson(PROGRESS_KEY, progress)) {
    markReady();
    const rev = snapshot(decks, progress);
    if (rev !== null) setRev(rev);
  }
}

function flushSnapshot() {
  if (!didBoot) return;
  const decks = readDecks();
  const progress = readProgress();
  if (!decks.length && !progress.length) return;
  const rev = snapshot(decks, progress);
  if (rev !== null) setRev(rev);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSnapshot);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSnapshot();
  });
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
  const mirrored = commit(
    mergeDecks(readDecks(), backup.decks),
    mergeProgress(readProgress(), stamped),
  );
  if (mirrored) markReady();
  const stored = await idbPutBackup(backup);
  if (browserStorage() && !mirrored) throw new Error(STORAGE_ERROR);
  if (!mirrored && !stored) throw new Error(STORAGE_ERROR);
  requestPersistence();
  return backup.decks.length;
}
