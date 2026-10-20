import { useCallback, useEffect, useState } from "react";
import "./study.css";
import {
  deleteDeck,
  exportBackup,
  getProgress,
  importBackup,
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
import { CATEGORY_LABEL, latinName } from "./shared";

type Screen =
  | { name: "library" }
  | { name: "create" }
  | { name: "study"; deck: Deck; progress: DeckProgress };

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
    document.title = "Flash cards · Human Atlas";
    prepareVoices();
    fetch("/cards/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("The card catalogue could not be loaded.");
        return r.json() as Promise<Catalog>;
      })
      .then(setCatalog)
      .catch((e) => setError(e.message));
    refresh().catch(() =>
      setError("This browser blocked local storage, so decks cannot be saved."),
    );
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
    const items = catalog.structures
      .filter((s) => s.category === category && s.images.length)
      .map((s) => ({ structureId: s.id, label: latinName(s) }));
    create(`All ${CATEGORY_LABEL[category].toLowerCase()}s`, items).catch(fail);
  };

  const study = async (deck: Deck) => {
    try {
      setScreen({ name: "study", deck, progress: await getProgress(deck.id) });
    } catch (e) {
      fail(e);
    }
  };

  const download = async () => {
    const data = await exportBackup();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `human-atlas-flashcards-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = async (file: File) => {
    const restored = await importBackup(JSON.parse(await file.text()));
    await refresh();
    setError("");
    alert(`Restored ${restored} ${restored === 1 ? "deck" : "decks"}.`);
  };

  return (
    <div className="study">
      <header className="study-head">
        <a href="/" className="brand">
          Human Atlas
        </a>
        <span className="brand-sub">Flash cards</span>
      </header>
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
            onUpdate={(d) => saveDeck(d).then(refresh).catch(fail)}
            onDelete={(d) => deleteDeck(d.id).then(refresh).catch(fail)}
            onExport={() => download().catch(fail)}
            onImport={(f) => restore(f).catch(fail)}
          />
        )}
      </main>
    </div>
  );
}
