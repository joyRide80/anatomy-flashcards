import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningStore } from "./learning-store";
import type { DeckSelection, LearningEvent } from "./learning-model";
type SyncStore = Pick<LearningStore, "pending" | "acknowledge" | "merge" | "setMeta">;

export function createLearningSync(client: SupabaseClient) {
const flights = new Map<string, Promise<void>>();
return function syncLearning(store: SyncStore, userId: string): Promise<void> {
  if (flights.has(userId)) return flights.get(userId)!;
  const job = (async () => {
    do {
      await synchronize(client, store, userId);
    } while ((await store.pending()).length > 0);
  })().finally(() => flights.delete(userId));
  flights.set(userId, job);
  return job;
}

}
async function synchronize(client: SupabaseClient, store: SyncStore, userId: string) {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new Error(
      "You’re offline. Reviews are saved on this device and will sync when you reconnect.",
    );
  const pending = await store.pending();
  for (let offset = 0; offset < pending.length; offset += 200) {
    const batch = pending.slice(offset, offset + 200);
    const events = batch.filter((p) => p.kind === "event");
    if (events.length) {
      const { error } = await client.from("learning_events").upsert(
        events.map(({ value }) => ({
          user_id: userId,
          id: value.id,
          payload: value,
        })),
        { onConflict: "user_id,id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
    const selections = batch.filter((p) => p.kind === "selection");
    if (selections.length) {
      const { error } = await client.rpc("save_deck_selections", {
        owner_id: userId,
        changes: selections.map(({ value }) => ({
          deck_id: value.id,
          selected: value.selected,
          updated_at: value.updatedAt,
        })),
      });
      if (error) throw error;
    }
    await store.acknowledge(batch);
  }

  // Fetch the event union on each sync for this pilot. A sequence allocated by an
  // uncommitted concurrent insert is not a safe permanent replication watermark.
  let cursor = 0;
  for (;;) {
    const { data, error } = await client
      .from("learning_events")
      .select("sequence,payload")
      .eq("user_id", userId)
      .gt("sequence", cursor)
      .order("sequence")
      .limit(500);
    if (error) throw error;
    if (!data?.length) break;
    await store.merge(
      data.map((row) => row.payload as LearningEvent),
      [],
    );
    cursor = data[data.length - 1].sequence;
    if (data.length < 500) break;
  }
  const { data, error } = await client
    .from("deck_selections")
    .select("deck_id,selected,updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  const selections: DeckSelection[] = (data ?? []).map((row) => ({
    id: row.deck_id,
    selected: row.selected,
    updatedAt: row.updated_at,
  }));
  await store.merge([], selections);
  await store.setMeta("lastSyncedAt", Date.now());
}
