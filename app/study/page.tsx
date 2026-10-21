import { useCallback, useEffect, useState } from "react";
import "./study.css";
import {
  deleteDeck,
  getProgress,
  listDecks,
  listProgress,
  saveDeck,
} from "@/lib/flashcards/db";
import type {
  Catalog,
  Category,
  Deck,
  DeckItem,
  DeckProgress,
} from "@/lib/flashcards/types";
import { CreateDeck } from "./create-deck";
import { Library } from "./library";
import { prepareVoices } from "./speech";
import { Session } from "./session";
import { prefillItems } from "./lists";
import { CATEGORY_LABEL, latinName } from "./shared";

type Screen =
  | { name: "library" }
  | { name: "create" }
  | { name: "study"; deck: Deck; progress: DeckProgress };

const APP_NAME = "Anatomy Flashcards";
const SEEDED_KEY = "human-atlas-default-decks";

/** Shown on a first visit so the library is not an empty list. */
const DEFAULT_DECKS = ["All muscles", "Thorax", "Columna vertebralis"] as const;

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function categoryItems(catalog: Catalog, category: Category): DeckItem[] {
  return catalog.structures
    .filter((s) => s.category === category && s.images.length)
    .map((s) => ({ structureId: s.id, label: latinName(s) }));
}

function defaultDeckItems(catalog: Catalog, name: string): DeckItem[] {
  if (name === "All muscles") return categoryItems(catalog, "muscle");
  return prefillItems(catalog, name);
}

let seeding: Promise<void> | null = null;

/** Adds the starter decks once. Deleting one later leaves it deleted. */
function ensureDefaultDecks(catalog: Catalog) {
  seeding ??= seedDefaultDecks(catalog).catch((error) => {
    seeding = null;
    throw error;
  });
  return seeding;
}

async function seedDefaultDecks(catalog: Catalog) {
  if (localStorage.getItem(SEEDED_KEY)) return;
  const existing = new Set((await listDecks()).map((deck) => deck.name));
  const now = Date.now();
  for (let i = 0; i < DEFAULT_DECKS.length; i++) {
    const name = DEFAULT_DECKS[i];
    if (existing.has(name)) continue;
    const items = defaultDeckItems(catalog, name);
    if (!items.length) continue;
    const t = now - i;
    await saveDeck({
      id: `default-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      createdAt: t,
      updatedAt: t,
      newPerDay: 20,
      items,
    });
  }
  localStorage.setItem(SEEDED_KEY, "1");
}

export default function StudyPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [progress, setProgress] = useState<Record<string, DeckProgress>>({});
  const [screen, setScreen] = useState<Screen>({ name: "library" });
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [d, p] = await Promise.all([listDecks(), listProgress()]);
    setDecks(d);
    setProgress(Object.fromEntries(p.map((x) => [x.deckId, x])));
  }, []);

  useEffect(() => {
    document.title = APP_NAME;
  }, [APP_NAME]);

  useEffect(() => {
    prepareVoices();
    let cancelled = false;
    fetch("/cards/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("The card catalogue could not be loaded.");
        return r.json() as Promise<Catalog>;
      })
      .then(async (catalog) => {
        if (cancelled) return;
        setCatalog(catalog);
        try {
          await ensureDefaultDecks(catalog);
          if (!cancelled) await refresh();
        } catch {
          if (!cancelled)
            setError(
              "This browser blocked local storage, so decks cannot be saved.",
            );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Something went wrong.");

  const create = async (name: string, items: DeckItem[]) => {
    const t = Date.now();
    const deck: Deck = {
      id: newId(),
      name,
      createdAt: t,
      updatedAt: t,
      newPerDay: 20,
      items,
    };
    await saveDeck(deck);
    await refresh();
    setScreen({ name: "library" });
  };

  const preset = (category: Category) => {
    if (!catalog) return;
    create(
      `All ${CATEGORY_LABEL[category].toLowerCase()}s`,
      categoryItems(catalog, category),
    ).catch(fail);
  };

  const prefill = (name: string) => {
    if (!catalog) return;
    const items = prefillItems(catalog, name);
    if (items.length) create(name, items).catch(fail);
  };

  const study = async (deck: Deck) => {
    try {
      setScreen({ name: "study", deck, progress: await getProgress(deck.id) });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="study">
      {screen.name !== "study" && (
        <header className="study-head">
          <a href="/" className="brand">
            {APP_NAME}
          </a>
        </header>
      )}
      <main className="study-main">
        {error && (
          <p className="study-error" role="alert">
            {error}
          </p>
        )}
        {!catalog ? (
          !error && <p className="loading-line">Loading the card catalogue…</p>
        ) : screen.name === "create" ? (
          <CreateDeck
            catalog={catalog}
            onCancel={() => setScreen({ name: "library" })}
            onCreate={create}
          />
        ) : screen.name === "study" ? (
          <Session
            deck={screen.deck}
            catalog={catalog}
            initial={screen.progress}
            onExit={() => {
              setScreen({ name: "library" });
              refresh().catch(fail);
            }}
            onSaved={(p) => setProgress((all) => ({ ...all, [p.deckId]: p }))}
          />
        ) : (
          <Library
            catalog={catalog}
            decks={decks}
            progress={progress}
            onStudy={study}
            onCreate={() => setScreen({ name: "create" })}
            onPreset={preset}
            onPrefill={prefill}
            onUpdate={(d) => saveDeck(d).then(refresh).catch(fail)}
            onDelete={(d) => deleteDeck(d.id).then(refresh).catch(fail)}
          />
        )}
      </main>
    </div>
  );
}
