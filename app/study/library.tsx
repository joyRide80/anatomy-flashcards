import { useMemo, useState } from "react";
import { ArrowUpRight, Bookmark, Check, Search } from "lucide-react";
import { counts } from "@/lib/srs";
import type { CuratedDeck } from "@/lib/flashcards/decks";
import type { DeckSelection, projectLearning } from "@/lib/flashcards/learning-model";
import type { Catalog, Category, Deck } from "@/lib/flashcards/types";
import { Thumb, latinName } from "./shared";

const labels: Record<Category, string> = {
  bone: "Bones",
  muscle: "Muscles",
  ligament: "Ligaments",
};

export function Library({
  catalog,
  decks,
  legacyDecks,
  selections,
  projection,
  onStudy,
  onSelect,
}: {
  catalog: Catalog;
  decks: CuratedDeck[];
  legacyDecks: Deck[];
  selections: DeckSelection[];
  projection: ReturnType<typeof projectLearning>;
  onStudy: (deck: Deck) => void;
  onSelect: (id: string, selected: boolean) => void;
}) {
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const maps = useMemo(() => new Map(catalog.structures.map((s) => [s.id, s])), [catalog]);
  const selected = new Set(selections.filter((s) => s.selected).map((s) => s.id));
  const available = decks.filter(
    (d) =>
      (tab === "discover" || selected.has(d.id)) &&
      (category === "all" || category === d.category) &&
      `${d.name} ${d.region} ${d.description}`.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const selectedDecks = [...decks, ...legacyDecks].filter((d) => selected.has(d.id));
  const selectedCards = new Set(selectedDecks.flatMap((d) => d.items.map((i) => i.structureId)));
  const due = [...selectedCards].filter((id) => projection.cards[id]?.due <= Date.now()).length;
  const missed = [...selectedCards].filter((id) => projection.lastGrades[id] === "again").length;
  const continueDeck =
    selectedDecks.find((d) =>
      d.items.some((i) => projection.cards[i.structureId]?.due <= Date.now()),
    ) ?? selectedDecks[0];

  return (
    <div className="library">
      <section className="intro catalog-intro">
        <p className="eyebrow-serif">Your anatomy practice, prepared.</p>
        <h2>
          Pick a deck.
          <br />
          <em>Learn the body.</em>
        </h2>
        <p>
          Ready-made decks, real anatomy images, and practice that brings back the cards you forget.
          Start with a region that interests you.
        </p>
        <div className="catalog-facts">
          <span>{decks.length} ready-made decks</span>
          <span>{catalog.structures.length} structures</span>
          <span>Latin & English</span>
        </div>
      </section>
      {selectedDecks.length > 0 && (
        <section className="today-panel" aria-label="Today’s practice">
          <div>
            <p className="eyebrow-serif">A little, every day</p>
            <h3>Your next session</h3>
            <p>
              {due
                ? `${due} ${due === 1 ? "card is" : "cards are"} ready for review.`
                : "Keep building your anatomy knowledge."}
            </p>
          </div>
          <dl className="today-stats">
            <div>
              <dt>Reviews today</dt>
              <dd>{projection.reviewsToday}</dd>
            </div>
            <div>
              <dt>Needs practice</dt>
              <dd>{missed}</dd>
            </div>
          </dl>
          {continueDeck && (
            <button className="action" onClick={() => onStudy(continueDeck)}>
              Continue studying <ArrowUpRight size={16} />
            </button>
          )}
        </section>
      )}
      <div className="library-toolbar">
        <div className="library-tabs" role="group" aria-label="Deck library">
          <button aria-pressed={tab === "discover"} onClick={() => setTab("discover")}>
            Discover decks
          </button>
          <button aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
            My learning <span>{selectedDecks.length}</span>
          </button>
        </div>
        <label className="deck-search">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by deck or region"
            aria-label="Search decks"
            type="search"
          />
        </label>
      </div>
      <div className="category-filters" role="group" aria-label="Anatomy categories">
        {(["all", "bone", "muscle", "ligament"] as const).map((value) => (
          <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>
            {value === "all" ? "All anatomy" : labels[value]}
          </button>
        ))}
      </div>
      <p className="catalog-scope">
        This first collection covers bones, muscles, and the ligaments available in our atlas. Each
        deck teaches visual identification and anatomical names.
      </p>
      <section
        className="catalog-grid"
        aria-label={tab === "mine" ? "Your selected decks" : "Ready-made anatomy decks"}
      >
        {available.map((deck) => {
          const structures = deck.items.map((i) => maps.get(i.structureId)).filter((s) => !!s);
          const c = counts(
            structures,
            projection.cards,
            Date.now(),
            Math.max(0, 20 - projection.newToday),
          );
          const started = structures.filter((s) => projection.cards[s.id]).length;
          const isSelected = selected.has(deck.id);
          const isPreview = preview === deck.id;
          return (
            <article className="catalog-card" key={deck.id}>
              <div className="catalog-card-top">
                <span className="deck-category">
                  {labels[deck.category]} <span> / {deck.region}</span>
                </span>
                <button
                  className="save-deck"
                  aria-label={`${isSelected ? "Remove" : "Add"} ${deck.name} ${isSelected ? "from" : "to"} My learning`}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(deck.id, !isSelected)}
                >
                  {isSelected ? <Check size={18} /> : <Bookmark size={18} />}
                </button>
              </div>
              <div className="deck-cover">
                {structures.slice(0, 3).map((s) => (
                  <Thumb key={s.id} structure={s} />
                ))}
                {deck.featured && <span className="starter-label">Good place to start</span>}
              </div>
              <h3>{deck.name}</h3>
              <p className="deck-description">{deck.description}</p>
              <div className="deck-metadata">
                <span>{deck.items.length} cards</span>
                <span>{started ? `${started} introduced` : "Ready to study"}</span>
                {c.review + c.learning > 0 && (
                  <span className="due-label">{c.review + c.learning} to practise</span>
                )}
              </div>
              {started > 0 && (
                <progress
                  max={deck.items.length}
                  value={started}
                  aria-label={`${started} of ${deck.items.length} cards introduced`}
                />
              )}
              <div className="catalog-card-actions">
                <button className="action" onClick={() => onStudy(deck)}>
                  {started ? "Study deck" : "Start deck"}
                </button>
                <button
                  className="link"
                  aria-expanded={isPreview}
                  aria-controls={`preview-${deck.id}`}
                  onClick={() => setPreview(isPreview ? null : deck.id)}
                >
                  {isPreview ? "Hide cards" : "Preview cards"}
                </button>
              </div>
              {isPreview && (
                <div className="deck-preview" id={`preview-${deck.id}`}>
                  <p>Learn to name these highlighted structures:</p>
                  <ul>
                    {structures.map((s) => (
                      <li key={s.id}>
                        <span>{latinName(s)}</span>
                        <small>{s.en}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </section>
      {available.length === 0 && (
        <div className="catalog-empty">
          <h3>
            {tab === "mine" && !selectedDecks.length
              ? "Your first deck is waiting."
              : "No matching decks."}
          </h3>
          <p>
            {tab === "mine" && !selectedDecks.length
              ? "Start a deck or use its bookmark to add it to My learning."
              : "Try another region or clear your filters."}
          </p>
          <button
            className="ghost"
            onClick={() => {
              setTab("discover");
              setQuery("");
              setCategory("all");
            }}
          >
            Browse all decks
          </button>
        </div>
      )}
      {tab === "mine" && legacyDecks.length > 0 && (
        <section className="legacy-decks">
          <h3>Your previously imported decks</h3>
          <p>Kept from the earlier version, along with their saved progress.</p>
          {legacyDecks.map((d) => (
            <div key={d.id}>
              <span>
                {d.name} · {d.items.length} cards
              </span>
              <button className="ghost" onClick={() => onStudy(d)}>
                Study
              </button>
            </div>
          ))}
        </section>
      )}
      <footer className="study-footer">
        <a href="/atlas">
          Explore the body in 3D <ArrowUpRight size={12} />
        </a>
        <span>{catalog.sources.join(" · ")}</span>
      </footer>
    </div>
  );
}
