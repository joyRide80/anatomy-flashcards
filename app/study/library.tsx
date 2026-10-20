import { useRef, useState } from "react";
import { ArrowUpRight, Download, Plus, Upload } from "lucide-react";
import { counts } from "@/lib/srs";
import { studyDay } from "@/lib/flashcards/db";
import type {
  Catalog,
  Category,
  Deck,
  DeckProgress,
} from "@/lib/flashcards/types";
import { CATEGORY_LABEL } from "./shared";

export function Library({
  catalog,
  decks,
  progress,
  onStudy,
  onCreate,
  onPreset,
  onUpdate,
  onDelete,
  onExport,
  onImport,
}: {
  catalog: Catalog;
  decks: Deck[];
  progress: Record<string, DeckProgress>;
  onStudy: (deck: Deck) => void;
  onCreate: () => void;
  onPreset: (category: Category) => void;
  onUpdate: (deck: Deck) => void;
  onDelete: (deck: Deck) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const structures = new Map(catalog.structures.map((s) => [s.id, s]));
  const [editing, setEditing] = useState<string | null>(null);
  const backup = useRef<HTMLInputElement>(null);
  const now = Date.now();
  const sizes = catalog.structures.reduce(
    (n, s) => ({ ...n, [s.category]: (n[s.category] ?? 0) + 1 }),
    {} as Record<Category, number>,
  );

  return (
    <div className="library">
      <section className="intro">
        <p className="eyebrow-serif">Flash cards</p>
        <h2>
          Learn the body <em>by its Latin names.</em>
        </h2>
        <p>
          Upload your course list of muscles, bones, and ligaments. Each term is
          matched to the 3D atlas and becomes a card with a rendered view of the
          structure, scheduled with spaced repetition.
        </p>
        <div className="intro-actions">
          <button type="button" className="action" onClick={onCreate}>
            <Plus size={16} /> New deck from your Latin list
          </button>
          <span className="or">or start with</span>
          {(["muscle", "bone", "ligament"] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              className="ghost"
              onClick={() => onPreset(c)}
            >
              All {CATEGORY_LABEL[c].toLowerCase()}s{" "}
              <small>{sizes[c] ?? 0}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="decks" aria-label="Your decks">
        <div className="section-head">
          <h3>Your decks</h3>
          <div className="backup">
            <button
              type="button"
              className="link"
              onClick={onExport}
              disabled={!decks.length}
            >
              <Download size={14} /> Export backup
            </button>
            <button
              type="button"
              className="link"
              onClick={() => backup.current?.click()}
            >
              <Upload size={14} /> Import backup
            </button>
            <input
              ref={backup}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {!decks.length ? (
          <p className="empty">
            No decks yet. Your decks and progress stay in this browser; export a
            backup to keep them safe or move them to another device.
          </p>
        ) : (
          <ul className="deck-list">
            {decks.map((deck) => {
              const p = progress[deck.id];
              const cards = p?.cards ?? {};
              const used =
                p?.newToday.day === studyDay() ? p.newToday.count : 0;
              const list = deck.items
                .map((i) => structures.get(i.structureId))
                .filter((s) => !!s);
              const c = counts(
                list,
                cards,
                now,
                Math.max(0, deck.newPerDay - used),
              );
              const learned = list.filter(
                (s) => cards[s.id]?.phase === "review",
              ).length;
              return (
                <li key={deck.id} className="deck">
                  <div className="deck-main">
                    <h4>{deck.name}</h4>
                    <p>
                      {list.length} cards · {learned} learned
                    </p>
                  </div>
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
                  <div className="deck-actions">
                    <button
                      type="button"
                      className="action"
                      onClick={() => onStudy(deck)}
                    >
                      Study
                    </button>
                    <button
                      type="button"
                      className="link"
                      aria-expanded={editing === deck.id}
                      onClick={() =>
                        setEditing(editing === deck.id ? null : deck.id)
                      }
                    >
                      Settings
                    </button>
                  </div>
                  {editing === deck.id && (
                    <DeckSettings
                      deck={deck}
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

      <footer className="study-footer">
        <a href="/atlas">
          3D explorer <ArrowUpRight size={12} />
        </a>
        <span>{catalog.sources.join(" · ")}</span>
      </footer>
    </div>
  );
}

function DeckSettings({
  deck,
  onSave,
  onDelete,
}: {
  deck: Deck;
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
        <span>Name</span>
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
