import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Plus, Settings, X } from "lucide-react";
import { counts } from "@/lib/srs";
import { studyDay } from "@/lib/flashcards/db";
import type {
  Catalog,
  Category,
  Deck,
  DeckProgress,
} from "@/lib/flashcards/types";
import { PREFILL_LISTS, prefillItems } from "./lists";
import { CATEGORY_LABEL, Thumb } from "./shared";

export function Library({
  catalog,
  decks,
  progress,
  onStudy,
  onCreate,
  onPreset,
  onPrefill,
  onUpdate,
  onDelete,
}: {
  catalog: Catalog;
  decks: Deck[];
  progress: Record<string, DeckProgress>;
  onStudy: (deck: Deck) => void;
  onCreate: () => void;
  onPreset: (category: Category) => void;
  onPrefill: (name: string) => void;
  onUpdate: (deck: Deck) => void;
  onDelete: (deck: Deck) => void;
}) {
  const structures = new Map(catalog.structures.map((s) => [s.id, s]));
  const previewOf = (items: { structureId: string }[]) => {
    for (const item of items) {
      const structure = structures.get(item.structureId);
      if (structure?.images.length) return structure;
    }
  };
  const regions = PREFILL_LISTS.map((list) => ({
    name: list.name,
    count: prefillItems(catalog, list.name).length,
  }));
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const now = Date.now();
  const sizes = catalog.structures.reduce(
    (n, s) => ({ ...n, [s.category]: (n[s.category] ?? 0) + 1 }),
    {} as Record<Category, number>,
  );
  const hasDecks = decks.length > 0;
  const deckSection = (
    <section className="decks" aria-label="Your decks">
      {!hasDecks ? (
        <p className="empty">
          No decks yet. Your decks and progress stay in this browser.
        </p>
      ) : (
        <ul className="deck-list">
          {decks.map((deck) => {
            const p = progress[deck.id];
            const cards = p?.cards ?? {};
            const used = p?.newToday.day === studyDay() ? p.newToday.count : 0;
            const list = deck.items
              .map((i) => structures.get(i.structureId))
              .filter((s) => !!s);
            const c = counts(
              list,
              cards,
              now,
              Math.max(0, deck.newPerDay - used),
            );
            const preview = previewOf(deck.items);
            return (
              <li key={deck.id} className="deck">
                {preview ? (
                  <Thumb structure={preview} />
                ) : (
                  <span className="thumb" aria-hidden="true" />
                )}
                <div className="deck-main">
                  <h4>{deck.name}</h4>
                  <div className="tally" aria-label="Today">
                    <span className="tally-new" title="New today">
                      {c.fresh}
                    </span>
                    <span className="tally-learning" title="Learning">
                      {c.learning}
                    </span>
                    <span className="tally-review" title="Due for review">
                      {c.review}
                    </span>
                  </div>
                </div>
                <div className="deck-actions">
                  <button
                    type="button"
                    className="deck-settings-button"
                    aria-label="Settings"
                    aria-expanded={editing === deck.id}
                    onClick={() =>
                      setEditing(editing === deck.id ? null : deck.id)
                    }
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    type="button"
                    className="action"
                    onClick={() => onStudy(deck)}
                  >
                    Study
                  </button>
                </div>
                {editing === deck.id && (
                  <DeckSettings
                    deck={deck}
                    cards={list.length}
                    onSave={(d) => {
                      onUpdate(d);
                      setEditing(null);
                    }}
                    onDelete={() => onDelete(deck)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="library">
      <section className="intro">
        <div className="library-top">
          <h2>
            Learn the body <em>by its Latin names.</em>
          </h2>
          <button
            type="button"
            className="action"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Plus size={16} /> New deck
          </button>
        </div>
      </section>
      {deckSection}
      {menu && (
        <NewDeckMenu
          sizes={sizes}
          regions={regions}
          onClose={closeMenu}
          onCreate={onCreate}
          onPreset={onPreset}
          onPrefill={onPrefill}
        />
      )}

      <footer className="study-footer">
        <a href="/atlas">
          3D explorer <ArrowUpRight size={12} />
        </a>
        <span>{catalog.sources.join(" · ")}</span>
      </footer>
    </div>
  );
}

function NewDeckMenu({
  sizes,
  regions,
  onClose,
  onCreate,
  onPreset,
  onPrefill,
}: {
  sizes: Record<Category, number>;
  regions: { name: string; count: number }[];
  onClose: () => void;
  onCreate: () => void;
  onPreset: (category: Category) => void;
  onPrefill: (name: string) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>("button")];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="deck-menu" onClick={onClose}>
      <div
        ref={sheet}
        className="deck-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-deck-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="deck-menu-head">
          <h3 id="new-deck-title">New deck</h3>
          <button
            type="button"
            className="deck-settings-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="intro-actions">
          <button
            type="button"
            className="action"
            onClick={() => {
              onClose();
              onCreate();
            }}
          >
            <Plus size={16} /> New deck from your Latin list
          </button>
          <span className="or">or start with</span>
          {(["muscle", "bone", "ligament"] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              className="ghost"
              onClick={() => {
                onClose();
                onPreset(c);
              }}
            >
              All {CATEGORY_LABEL[c].toLowerCase()}s{" "}
              <small>{sizes[c] ?? 0}</small>
            </button>
          ))}
          <span className="or">or a region</span>
          {regions.map((list) => (
            <button
              key={list.name}
              type="button"
              className="ghost"
              onClick={() => {
                onClose();
                onPrefill(list.name);
              }}
            >
              {list.name} <small>{list.count}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeckSettings({
  deck,
  cards,
  onSave,
  onDelete,
}: {
  deck: Deck;
  cards: number;
  onSave: (deck: Deck) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(deck.name);
  const [perDay, setPerDay] = useState(deck.newPerDay);
  return (
    <form
      className="deck-settings"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...deck,
          name: name.trim() || deck.name,
          newPerDay: Math.max(1, Math.min(200, perDay || 1)),
          updatedAt: Date.now(),
        });
      }}
    >
      <label className="field inline">
        <span>
          Name
          <span className="field-meta">
            {` · ${cards.toLocaleString()} ${cards === 1 ? "card" : "cards"}`}
          </span>
        </span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field inline narrow">
        <span>New cards per day</span>
        <input
          type="number"
          min={1}
          max={200}
          value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
        />
      </label>
      <button type="submit" className="ghost">
        Save
      </button>
      <button
        type="button"
        className="link danger"
        onClick={() => {
          if (confirm(`Delete “${deck.name}” and its progress?`)) onDelete();
        }}
      >
        Delete deck
      </button>
    </form>
  );
}
