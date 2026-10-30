import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import "./study.css";
import { cloud, syncLearning } from "@/lib/flashcards/cloud";
import { curatedDecks } from "@/lib/flashcards/decks";
import { projectLearning, type LearningEvent } from "@/lib/flashcards/learning-model";
import {
  adoptGuestProgress,
  learningStore,
  migratePreviousApp,
  onLearningChange,
  parseLearningBackup,
  type LearningSnapshot,
} from "@/lib/flashcards/learning-store";
import type { Catalog, Deck, DeckProgress } from "@/lib/flashcards/types";
import { Library } from "./library";
import { Session } from "./session";
import { prepareVoices } from "./speech";

const empty: LearningSnapshot = { events: [], selections: [], legacyDecks: [] };
type SyncState = { kind: "local" | "syncing" | "synced" | "error"; message: string };
let migration: Promise<void> | null = null;

export default function StudyPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!cloud);
  const [snapshot, setSnapshot] = useState(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [sync, setSync] = useState<SyncState>({ kind: "local", message: "Saved on this device" });
  const [screen, setScreen] = useState<{ deck: Deck; progress: DeckProgress } | null>(null);
  const [clock, setClock] = useState(Date.now());
  const store = useMemo(() => learningStore(user?.id), [user?.id]);
  const projection = useMemo(
    () => projectLearning(snapshot.events, clock),
    [snapshot.events, clock],
  );
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof Error
          ? e.message
          : ((e as { message?: string })?.message ?? "Something went wrong. Please retry."),
      ),
    [],
  );

  useEffect(() => {
    document.title = "Anatomy Flashcards";
    prepareVoices();
    const controller = new AbortController();
    fetch("/cards/catalog.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok)
          throw new Error("The card library could not be loaded. Please reload to try again.");
        return r.json() as Promise<Catalog>;
      })
      .then(setCatalog)
      .catch((e) => {
        if (e.name !== "AbortError") fail(e);
      });
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [fail]);

  useEffect(() => {
    if (!cloud) return;
    let live = true;
    void cloud.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) fail(error);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = cloud.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [fail]);

  useEffect(() => {
    if (!authReady) return;
    let live = true;
    let initialized = false;
    let generation = 0;
    setReady(false);
    setScreen(null);
    setSnapshot(empty);
    setError("");
    const refresh = async () => {
      const ticket = ++generation;
      const data = await store.read();
      if (live && ticket === generation) {
        setSnapshot(data);
        setClock(Date.now());
      }
    };
    const synchronize = async () => {
      if (!initialized || !user || !live) return;
      setSync({ kind: "syncing", message: "Saving to your account…" });
      try {
        await syncLearning(store, user.id);
        if (live) setSync({ kind: "synced", message: "Saved to your account" });
      } catch (e) {
        if (live)
          setSync({
            kind: "error",
            message: navigator.onLine
              ? "Saved on this device · Cloud sync needs attention"
              : "Offline · Saved on this device",
          });
        console.warn(
          "Learning sync failed",
          e instanceof Error ? e.message : "Please check the backend configuration.",
        );
      }
    };
    const changed = (local = true) => {
      if (!initialized) return;
      void refresh().catch(fail);
      if (local) void synchronize();
    };
    const unsubscribe = onLearningChange((local, accountId) => {
      if (accountId === store.accountId) changed(local);
    });
    const reconnected = () => changed();
    const foreground = () => {
      if (document.visibilityState === "visible") changed();
    };
    window.addEventListener("online", reconnected);
    document.addEventListener("visibilitychange", foreground);
    const timer = window.setInterval(() => {
      void synchronize();
    }, 30_000);
    void (async () => {
      migration ??= migratePreviousApp().catch((e) => {
        migration = null;
        throw e;
      });
      await migration;
      if (!live) return;
      if (user) await adoptGuestProgress(user.id);
      else if (await store.meta("claimedBy")) await store.finishGuestTransfer();
      if (!live) return;
      initialized = true;
      await refresh();
      if (!live) return;
      setReady(true);
      setSync({ kind: "local", message: "Saved on this device" });
      void synchronize();
    })().catch((e) => {
      if (live) fail(e);
    });
    return () => {
      live = false;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("online", reconnected);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [store, user?.id, authReady, fail]);

  const progressFor = (deckId: string, events = snapshot.events): DeckProgress => {
    const p = projectLearning(events);
    return { deckId, cards: p.cards, newToday: { day: p.day, count: p.newToday } };
  };
  const study = async (deck: Deck) => {
    try {
      setError("");
      await store.select(deck.id, true);
      const data = await store.read();
      setScreen({ deck, progress: progressFor(deck.id, data.events) });
    } catch (e) {
      fail(e);
    }
  };
  const record = async (event: LearningEvent) => {
    await store.append(event);
    return progressFor(event.deckId, (await store.read()).events);
  };
  const decks = useMemo(() => (catalog ? curatedDecks(catalog) : []), [catalog]);

  return (
    <div className="study">
      {!screen && (
        <header className="study-head">
          <a href="/" className="brand">
            Anatomy Flashcards
          </a>
          <span className={`save-status ${sync.kind}`} role="status">
            {sync.message}
          </span>
        </header>
      )}
      <main className="study-main">
        {error && (
          <p className="study-error" role="alert">
            {error}
          </p>
        )}
        {!catalog || !ready ? (
          <p className="loading-line">
            {error
              ? "Reload this page to try again. Your previous data has been kept."
              : "Opening your anatomy library…"}
          </p>
        ) : screen ? (
          <Session
            key={`${store.accountId}:${screen.deck.id}`}
            deck={screen.deck}
            catalog={catalog}
            initial={screen.progress}
            onExit={() => {
              setScreen(null);
              setClock(Date.now());
            }}
            onRecord={record}
            saveStatus={sync.message}
          />
        ) : (
          <>
            <Library
              catalog={catalog}
              decks={decks}
              legacyDecks={snapshot.legacyDecks}
              selections={snapshot.selections}
              projection={projection}
              onStudy={study}
              onSelect={(id, selected) => {
                void store.select(id, selected).catch(fail);
              }}
            />
            <AccountPanel
              user={user}
              sync={sync}
              onError={fail}
              onExport={async () => {
                const blob = new Blob([JSON.stringify(await store.export(), null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `anatomy-learning-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              onImport={async (file) => {
                const backup = parseLearningBackup(JSON.parse(await file.text()));
                await store.merge(backup.events, backup.selections, true, backup.legacyDecks);
              }}
              onRetry={async () => {
                if (!user) return;
                setSync({ kind: "syncing", message: "Saving to your account…" });
                try {
                  await syncLearning(store, user.id);
                  setSync({ kind: "synced", message: "Saved to your account" });
                } catch (e) {
                  setSync({
                    kind: "error",
                    message: "Saved on this device · Cloud sync needs attention",
                  });
                  throw e;
                }
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}

function AccountPanel({
  user,
  sync,
  onError,
  onExport,
  onImport,
  onRetry,
}: {
  user: User | null;
  sync: SyncState;
  onError: (e: unknown) => void;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <section className="account-panel" aria-label="Progress backup">
      <div>
        <h3>{user ? "Your learning is connected" : "Keep your learning history"}</h3>
        <p>
          {user
            ? user.email
            : cloud
              ? "Sign in to recover your progress on another device. You can start studying before signing in."
              : "Cloud backup isn’t connected in this preview. Progress is stored in this browser; download a backup before clearing website data."}
        </p>
      </div>
      {cloud && !user && (
        <form
          className="signin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const { error } = await cloud!.auth.signInWithOtp({
                email: email.trim(),
                options: { emailRedirectTo: `${location.origin}/` },
              });
              if (error) throw error;
              setMessage(
                "Check your email. Open the sign-in link in this browser to back up the progress saved here.",
              );
            } catch (e) {
              onError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>
          <button className="action" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <details className="backup-details">
        <summary>Backup & account settings</summary>
        <p>
          Reviews of the same card are shared across decks. Removing a deck from My learning keeps
          its history. Your daily allowance is 20 new cards across all decks.
        </p>
        {user && (
          <p>
            {sync.message}. Previously imported custom decks stay on this device and are included in
            downloaded backups.
          </p>
        )}
        <div className="backup-actions">
          <button
            className="ghost"
            onClick={() => {
              void onExport().catch(onError);
            }}
          >
            Download progress backup
          </button>
          <button className="link" onClick={() => fileInput.current?.click()}>
            Restore progress backup
          </button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            aria-label="Restore learning backup"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                await onImport(file);
                setMessage("Your learning backup has been restored.");
              } catch (e) {
                onError(e);
              }
            }}
          />
          {user && (
            <>
              <button
                className="link"
                onClick={() => {
                  void onRetry().catch(onError);
                }}
              >
                Sync now
              </button>
              <button
                className="link"
                onClick={async () => {
                  const { error } = await cloud!.auth.signOut();
                  if (error) onError(error);
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
