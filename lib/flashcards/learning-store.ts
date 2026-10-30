import type { Deck } from "./types";
import { validEvent, type DeckSelection, type LearningEvent } from "./learning-model.ts";

type Pending =
  | { key: string; kind: "event"; value: LearningEvent }
  | { key: string; kind: "selection"; value: DeckSelection };
export interface LearningSnapshot {
  events: LearningEvent[];
  selections: DeckSelection[];
  legacyDecks: Deck[];
}
export interface LearningBackup extends LearningSnapshot {
  format: "human-atlas-learning";
  version: 2;
  exportedAt: string;
}
type GuestTransfer = { accountId: string; eventIds: string[]; selections: DeckSelection[]; deckIds: string[] };
const STORES = ["events", "selections", "pending", "legacyDecks", "meta"];
const changeEvent = "human-atlas:learning-changed";
const stores = new Map<string, LearningStore>();
type Change = { accountId: string; local: boolean };
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("human-atlas-learning") : null;
channel?.addEventListener("message", (event: MessageEvent<Change>) =>
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: event.data })),
);

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function completed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(tx.error ?? new Error("Progress could not be saved. Please retry."));
  });
}
function wins(next: DeckSelection, old?: DeckSelection) {
  return (
    !old || next.updatedAt > old.updatedAt || (next.updatedAt === old.updatedAt && !next.selected)
  );
}

export class LearningStore {
  private connection: Promise<IDBDatabase> | null = null;
  constructor(readonly accountId: string) {}

  private database() {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(
          new Error("This browser cannot save learning history. Please enable website storage."),
        );
        return;
      }
      const opening = indexedDB.open(`human-atlas-learning-v2-${this.accountId}`, 1);
      opening.onupgradeneeded = () => {
        for (const name of STORES)
          opening.result.createObjectStore(name, {
            keyPath: name === "pending" || name === "meta" ? "key" : "id",
          });
      };
      opening.onsuccess = () => {
        const db = opening.result;
        db.onversionchange = () => {
          db.close();
          this.connection = null;
        };
        db.onclose = () => {
          this.connection = null;
        };
        resolve(db);
      };
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () =>
        reject(
          new Error("Close other Anatomy Flashcards tabs, then reload to finish updating storage."),
        );
    }).catch((error) => {
      this.connection = null;
      throw error;
    });
    return this.connection;
  }

  private async transaction(names: string[], mode: IDBTransactionMode = "readonly") {
    const db = await this.database();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(names, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
    } catch {
      tx = db.transaction(names, mode);
    }
    return { tx, done: completed(tx) };
  }

  private changed(local = true) {
    const detail: Change = { accountId: this.accountId, local };
    window.dispatchEvent(new CustomEvent(changeEvent, { detail }));
    channel?.postMessage(detail);
  }

  async read(): Promise<LearningSnapshot> {
    const { tx, done } = await this.transaction(["events", "selections", "legacyDecks"]);
    const [events, selections, legacyDecks] = await Promise.all([
      request(tx.objectStore("events").getAll()),
      request(tx.objectStore("selections").getAll()),
      request(tx.objectStore("legacyDecks").getAll()),
      done,
    ]);
    return { events, selections, legacyDecks };
  }

  async append(event: LearningEvent) {
    if (!validEvent(event))
      throw new Error("This review could not be validated. Please reload and retry.");
    const { tx, done } = await this.transaction(["events", "pending"], "readwrite");
    tx.objectStore("events").put(event);
    tx.objectStore("pending").put({ key: `event:${event.id}`, kind: "event", value: event });
    await done;
    this.changed();
    void navigator.storage?.persist?.().catch(() => {});
  }

  async select(id: string, selected: boolean) {
    const value: DeckSelection = { id, selected, updatedAt: Date.now() };
    const { tx, done } = await this.transaction(["selections", "pending"], "readwrite");
    tx.objectStore("selections").put(value);
    tx.objectStore("pending").put({ key: `selection:${id}`, kind: "selection", value });
    await done;
    this.changed();
  }

  async pending(): Promise<Pending[]> {
    const { tx, done } = await this.transaction(["pending"]);
    const [items] = await Promise.all([request(tx.objectStore("pending").getAll()), done]);
    return items;
  }

  async acknowledge(items: Pending[]) {
    const { tx, done } = await this.transaction(["pending"], "readwrite");
    const pending = tx.objectStore("pending");
    for (const item of items) {
      const read = pending.get(item.key);
      read.onsuccess = () => {
        if (JSON.stringify(read.result) === JSON.stringify(item)) pending.delete(item.key);
      };
    }
    await done;
  }

  async merge(
    events: LearningEvent[],
    selections: DeckSelection[],
    queue = false,
    legacyDecks: Deck[] = [],
  ) {
    if (!events.every(validEvent))
      throw new Error(
        "The learning history contains an unsupported review. Update the app and retry.",
      );
    const { tx, done } = await this.transaction(
      ["events", "selections", "pending", "legacyDecks"],
      "readwrite",
    );
    let changed = false;
    for (const event of events) {
      const read = tx.objectStore("events").get(event.id);
      read.onsuccess = () => {
        if (!read.result) {
          tx.objectStore("events").add(event);
          changed = true;
        }
        if (queue) tx.objectStore("pending").put({ key: `event:${event.id}`, kind: "event", value: read.result ?? event });
      };
    }
    for (const value of selections) {
      const read = tx.objectStore("selections").get(value.id);
      read.onsuccess = () => {
        if (!wins(value, read.result)) return;
        if (read.result?.selected === value.selected && read.result?.updatedAt === value.updatedAt) return;
        tx.objectStore("selections").put(value);
        changed = true;
        if (queue)
          tx.objectStore("pending").put({ key: `selection:${value.id}`, kind: "selection", value });
      };
    }
    for (const deck of legacyDecks) { tx.objectStore("legacyDecks").put(deck); changed = true; }
    await done;
    if (changed || queue) this.changed(queue);
  }

  async meta(key: string): Promise<unknown> {
    const { tx, done } = await this.transaction(["meta"]);
    const [row] = await Promise.all([request(tx.objectStore("meta").get(key)), done]);
    return row?.value;
  }

  async setMeta(key: string, value: unknown) {
    const { tx, done } = await this.transaction(["meta"], "readwrite");
    tx.objectStore("meta").put({ key, value });
    await done;
  }

  async export(): Promise<LearningBackup> {
    return {
      format: "human-atlas-learning",
      version: 2,
      exportedAt: new Date().toISOString(),
      ...(await this.read()),
    };
  }

  async finishGuestTransfer() {
    const { tx, done } = await this.transaction(
      ["events", "selections", "pending", "legacyDecks", "meta"],
      "readwrite",
    );
    const claim = tx.objectStore("meta").get("claimedBy");
    claim.onsuccess = () => {
      const transfer = claim.result?.value as GuestTransfer | undefined;
      if (!transfer) return;
      for (const id of transfer.eventIds) {
        tx.objectStore("events").delete(id);
        tx.objectStore("pending").delete(`event:${id}`);
      }
      for (const selection of transfer.selections) {
        const current = tx.objectStore("selections").get(selection.id);
        current.onsuccess = () => {
          if (current.result?.updatedAt !== selection.updatedAt || current.result?.selected !== selection.selected) return;
          tx.objectStore("selections").delete(selection.id);
          tx.objectStore("pending").delete(`selection:${selection.id}`);
        };
      }
      for (const id of transfer.deckIds) tx.objectStore("legacyDecks").delete(id);
      tx.objectStore("meta").delete("claimedBy");
    };
    await done;
    this.changed();
  }
}

export function learningStore(accountId = "guest") {
  if (!stores.has(accountId)) stores.set(accountId, new LearningStore(accountId));
  return stores.get(accountId)!;
}

export function onLearningChange(callback: (local: boolean, accountId: string) => void) {
  const handler = (event: Event) => {
    const { local, accountId } = (event as CustomEvent<Change>).detail;
    callback(local, accountId);
  };
  window.addEventListener(changeEvent, handler);
  return () => window.removeEventListener(changeEvent, handler);
}

/** One migration, keeping all old data intact for recovery. */
export async function migratePreviousApp() {
  const guest = learningStore();
  if (await guest.meta("legacyMigrated")) return;
  const databases = await indexedDB.databases?.();
  const hasOldDb = databases?.some((db) => db.name === "human-atlas-flashcards");
  let hasMirror = false;
  try {
    hasMirror =
      !!localStorage.getItem("human-atlas-flashcards-progress") ||
      !!localStorage.getItem("human-atlas-flashcards-decks");
  } catch {
    /* IndexedDB remains the authoritative store. */
  }
  if (!databases || hasOldDb || hasMirror) {
    const { legacyMigrationData } = await import("./db");
    const old = await legacyMigrationData();
    const events: LearningEvent[] = old.progress.flatMap((p) =>
      Object.entries(p.cards).map(([cardId, state]) => ({
        id: `legacy:${p.deckId}:${cardId}`,
        cardId,
        deckId: p.deckId,
        at: p.savedAt ?? 1,
        action: "import",
        mode: "migration",
        schedulerVersion: 1,
        initialState: state,
      })),
    );
    const custom = old.decks.filter((d) => !d.id.startsWith("default-"));
    await guest.merge(
      events.filter(validEvent),
      old.decks.map((d) => ({ id: d.id, selected: true, updatedAt: d.updatedAt })),
      true,
      custom,
    );
    await guest.setMeta("legacyArchive", old);
  }
  await guest.setMeta("legacyMigrated", true);
}

/** Claim guest work once, preventing it from leaking into a different signed-in account. */
export async function adoptGuestProgress(accountId: string) {
  const transfer = async () => {
    const guest = learningStore();
    if (await guest.meta("claimedBy")) await guest.finishGuestTransfer();
    const data = await guest.read();
    if (!data.events.length && !data.selections.length) return;
    await learningStore(accountId).merge(data.events, data.selections, true, data.legacyDecks);
    const claim: GuestTransfer = { accountId, eventIds: data.events.map((e) => e.id), selections: data.selections, deckIds: data.legacyDecks.map((d) => d.id) };
    await guest.setMeta("claimedBy", claim);
    await guest.finishGuestTransfer();
  };
  if (navigator.locks) await navigator.locks.request("human-atlas-guest-transfer", transfer);
  else await transfer();
}

export function parseLearningBackup(data: unknown): LearningBackup {
  const b = data as LearningBackup;
  if (
    b?.format !== "human-atlas-learning" ||
    b.version !== 2 ||
    !Array.isArray(b.events) ||
    !b.events.every(validEvent) ||
    !Array.isArray(b.selections) ||
    !b.selections.every(
      (s) =>
        typeof s.id === "string" && typeof s.selected === "boolean" && Number.isFinite(s.updatedAt),
    ) ||
    !Array.isArray(b.legacyDecks) ||
    !b.legacyDecks.every(
      (d) =>
        typeof d.id === "string" &&
        typeof d.name === "string" &&
        Array.isArray(d.items) &&
        d.items.every((i) => typeof i.structureId === "string" && typeof i.label === "string"),
    )
  ) {
    throw new Error("Choose a learning backup exported by this version of Anatomy Flashcards.");
  }
  return b;
}
