import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createLearningSync } from "../lib/flashcards/learning-sync.ts";
import { projectLearning } from "../lib/flashcards/learning-model.ts";

// Exercise the actual SDK/HTTP contract against an in-memory endpoint.
// This does not replace the documented live Supabase/RLS acceptance test.
const rows = [];
const choices = new Map();
let failUploads = false;
let onUpload;
let downloads = 0;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const client = createClient("https://test-anatomy.supabase.co", "test-public-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/learning_events") && init.method === "POST") {
      if (failUploads) return response({ message: "Temporarily unavailable" }, 503);
      assert.ok(new Headers(init.headers).get("Prefer").includes("resolution=ignore-duplicates"));
      for (const row of JSON.parse(init.body)) {
        if (!rows.some((r) => r.id === row.id && r.user_id === row.user_id)) rows.push({ ...row, sequence: rows.length + 1 });
      }
      if (onUpload) { const fn = onUpload; onUpload = undefined; fn(); }
      return response(null, 201);
    }
    if (url.pathname.endsWith("/learning_events")) {
      downloads++;
      const user = url.searchParams.get("user_id").slice(3);
      const cursor = Number(url.searchParams.get("sequence").slice(3));
      return response(rows.filter((r) => r.user_id === user && r.sequence > cursor).slice(0, Number(url.searchParams.get("limit"))));
    }
    if (url.pathname.endsWith("/rpc/save_deck_selections")) {
      const { owner_id, changes } = JSON.parse(init.body);
      for (const choice of changes) {
        const key = `${owner_id}:${choice.deck_id}`;
        const old = choices.get(key);
        if (!old || choice.updated_at > old.updated_at || choice.updated_at === old.updated_at && !choice.selected) choices.set(key, { ...choice, user_id: owner_id });
      }
      return response(null);
    }
    if (url.pathname.endsWith("/deck_selections")) {
      const user = url.searchParams.get("user_id").slice(3);
      return response([...choices.values()].filter((s) => s.user_id === user));
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  } },
});

class Store {
  events = new Map(); selections = new Map(); queue = new Map();
  append(e) { this.events.set(e.id, e); this.queue.set(`event:${e.id}`, { key: `event:${e.id}`, kind: "event", value: e }); }
  select(s) { this.selections.set(s.id, s); this.queue.set(`selection:${s.id}`, { key: `selection:${s.id}`, kind: "selection", value: s }); }
  async pending() { return [...this.queue.values()]; }
  async acknowledge(items) { for (const item of items) if (this.queue.get(item.key) === item) this.queue.delete(item.key); }
  async merge(events, selections) { for (const e of events) this.events.set(e.id, e); for (const s of selections) this.selections.set(s.id, s); }
  async setMeta() {}
}
const sync = createLearningSync(client);
const t = Date.now();
const e = (id, action, at = t) => ({ id, action, at, cardId: "humerus", deckId: "bones-upper-limb", mode: "recall", schedulerVersion: 1 });
const phone = new Store();
phone.append(e("intro", "introduce"));
phone.select({ id: "bones-upper-limb", selected: true, updatedAt: t });
failUploads = true;
await assert.rejects(sync(phone, "user-a"));
assert.equal((await phone.pending()).length, 2, "Failed upload must keep the pending records");
failUploads = false;
onUpload = () => phone.append(e("review-during-sync", "good", t + 60000));
await sync(phone, "user-a");
assert.equal((await phone.pending()).length, 0, "Reviews created during sync must also upload before success");
assert.equal(rows.length, 2);

const laptop = new Store();
await sync(laptop, "user-a");
assert.equal(laptop.events.size, 2, "A fresh browser restores learning history");
laptop.append(e("missed-on-laptop", "again", t + 120000));
await sync(laptop, "user-a");
await sync(phone, "user-a");
assert.deepEqual(projectLearning([...phone.events.values()], t), projectLearning([...laptop.events.values()], t));
assert.equal(projectLearning([...phone.events.values()], t).lastGrades.humerus, "again");
await sync(phone, "user-a");
assert.equal(rows.length, 3, "Repeated sync must not duplicate reviews");
const other = new Store();
await sync(other, "user-b");
assert.equal(other.events.size, 0, "Requests must be scoped to the signed-in user");

for (let i = 0; i < 1003; i++) rows.push({ id: `old-${i}`, user_id: "large-history", sequence: rows.length + 1, payload: e(`old-${i}`, "good", t + i) });
const fresh = new Store();
downloads = 0;
await sync(fresh, "large-history");
assert.equal(fresh.events.size, 1003);
assert.equal(downloads, 3, "Restoration must paginate past the server row limit");
console.log("Validated sync retries, in-flight reviews, duplicate delivery, fresh-browser recovery, user-scoped requests, and paginated restoration with the Supabase SDK.");
