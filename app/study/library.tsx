import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, Search } from "lucide-react";
import { counts } from "@/lib/srs";
import type { CuratedDeck } from "@/lib/flashcards/decks";
import type { DeckSelection, projectLearning } from "@/lib/flashcards/learning-model";
import type { Catalog, Category, Deck, Structure } from "@/lib/flashcards/types";
import { Thumb, latinName } from "./shared";
import { structureName, structureSearchTerms } from "./structure-glossary";
import {
  cardCount,
  categoryLabel,
  deckName,
  introducedCount,
  practiceCount,
  regionName,
  t,
  type StudyLanguage,
} from "./language";

const searchKey = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae");

export function Library({
  catalog,
  decks,
  legacyDecks,
  selections,
  projection,
  onStudy,
  onSelect,
  language,
  tab,
  onTabChange,
}: {
  catalog: Catalog;
  decks: CuratedDeck[];
  legacyDecks: Deck[];
  selections: DeckSelection[];
  projection: ReturnType<typeof projectLearning>;
  onStudy: (deck: Deck) => void;
  onSelect: (id: string, selected: boolean) => void;
  language: StudyLanguage;
  tab: "discover" | "mine";
  onTabChange: (tab: "discover" | "mine") => void;
}) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const learningRef = useRef<HTMLElement>(null);
  const maps = useMemo(() => new Map(catalog.structures.map((s) => [s.id, s])), [catalog]);
  const selected = new Set(selections.filter((s) => s.selected).map((s) => s.id));
  const available = decks.filter((deck) => {
    const structures = deck.items
      .map((item) => maps.get(item.structureId))
      .filter((structure): structure is Structure => !!structure);
    const matchesQuery = searchKey(
      [
        deck.name,
        deck.region,
        deckName(language, deck.id, deck.name),
        regionName(language, deck.region),
        categoryLabel(language, deck.category),
        ...structures.flatMap((structure) => structureSearchTerms(structure, language)),
      ].join(" "),
    ).includes(searchKey(query.trim()));
    return (
      (tab === "discover" || selected.has(deck.id)) &&
      (category === "all" || category === deck.category) &&
      matchesQuery
    );
  });
  const selectedDecks = [...decks, ...legacyDecks].filter((d) => selected.has(d.id));
  const selectedCards = new Set(selectedDecks.flatMap((d) => d.items.map((i) => i.structureId)));
  const due = [...selectedCards].filter((id) => projection.cards[id]?.due <= Date.now()).length;
  const missed = [...selectedCards].filter((id) => projection.lastGrades[id] === "again").length;
  const continueDeck =
    selectedDecks.find((d) =>
      d.items.some((i) => projection.cards[i.structureId]?.due <= Date.now()),
    ) ?? selectedDecks[0];
  const structuresFor = (deck: Deck) =>
    deck.items.map((i) => maps.get(i.structureId)).filter((s): s is Structure => !!s);
  useEffect(() => {
    if (tab === "mine") learningRef.current?.scrollIntoView({ block: "start" });
  }, [tab]);

  return (
    <div className="library">
      {selectedDecks.length > 0 && (
        <section className="today-panel" aria-label="Today’s practice">
          <div>
            <p className="eyebrow-serif">{t(language, "todayPractice")}</p>
            <h3>{t(language, "nextSession")}</h3>
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
              {t(language, "continueStudying")} <ArrowUpRight size={16} />
            </button>
          )}
        </section>
      )}
      <div className="library-filters">
        <div
          className="category-filters"
          role="group"
          aria-label={t(language, "anatomyCategories")}
        >
          {(["all", "bone", "muscle", "ligament", "joint"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value === "all" ? t(language, "allAnatomy") : categoryLabel(language, value)}
            </button>
          ))}
        </div>
        <label className="deck-search">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(language, "searchDecks")}
            aria-label={t(language, "searchDecks")}
            type="search"
          />
        </label>
      </div>
      {tab === "mine" ? (
        <section className="learning-list" ref={learningRef} aria-label="Your selected decks">
          {available.map((deck) => {
            const structures = structuresFor(deck);
            const due = structures.filter((s) => projection.cards[s.id]?.due <= Date.now()).length;
            return (
              <article className="learning-deck" key={deck.id}>
                <header>
                  <div>
                    <span className="deck-category">
                      {categoryLabel(language, deck.category)}{" "}
                      <span> / {regionName(language, deck.region)}</span>
                    </span>
                    <h3>{deckName(language, deck.id, deck.name)}</h3>
                    <p>
                      {cardCount(language, structures.length)}
                      {due ? ` · ${practiceCount(language, due)}` : ""}
                    </p>
                  </div>
                  <button type="button" className="action" onClick={() => onStudy(deck)}>
                    {t(language, "study")}
                  </button>
                </header>
                <ul className="learning-items">
                  {structures.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => onStudy(deck)}>
                        <Thumb structure={s} />
                        <span>
                          <strong>{latinName(s)}</strong>
                          <small>{structureName(s, language)}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="catalog-grid" aria-label="Ready-made anatomy decks">
          {available.map((deck) => {
            const structures = structuresFor(deck);
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
                    {categoryLabel(language, deck.category)}{" "}
                    <span> / {regionName(language, deck.region)}</span>
                  </span>
                  <button
                    className="save-deck"
                    aria-label={`${isSelected ? "Remove" : "Add"} ${deckName(language, deck.id, deck.name)} ${isSelected ? "from" : "to"} My learning`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(deck.id, !isSelected)}
                  >
                    {isSelected ? <Check size={18} /> : <Bookmark size={18} />}
                  </button>
                </div>
                <button type="button" className="catalog-card-open" onClick={() => onStudy(deck)}>
                  <div className="deck-cover">
                    {structures[0] && <Thumb structure={structures[0]} />}
                    {deck.featured && (
                      <span className="starter-label">{t(language, "goodPlaceToStart")}</span>
                    )}
                  </div>
                  <h3>{deckName(language, deck.id, deck.name)}</h3>
                </button>
                <div className="deck-metadata">
                  <span>{cardCount(language, deck.items.length)}</span>
                  <span>
                    {started ? introducedCount(language, started) : t(language, "readyToStudy")}
                  </span>
                  {c.review + c.learning > 0 && (
                    <span className="due-label">
                      {practiceCount(language, c.review + c.learning)}
                    </span>
                  )}
                </div>
                {started > 0 && (
                  <progress
                    max={deck.items.length}
                    value={started}
                    aria-label={`${introducedCount(language, started)} of ${cardCount(language, deck.items.length)}`}
                  />
                )}
                <div className="catalog-card-actions">
                  <button type="button" className="action" onClick={() => onStudy(deck)}>
                    {started ? t(language, "studyDeck") : t(language, "startDeck")}
                  </button>
                  <button
                    className="link"
                    aria-expanded={isPreview}
                    aria-controls={`preview-${deck.id}`}
                    onClick={() => setPreview(isPreview ? null : deck.id)}
                  >
                    {isPreview ? t(language, "hideCards") : t(language, "previewCards")}
                  </button>
                </div>
                {isPreview && (
                  <div className="deck-preview" id={`preview-${deck.id}`}>
                    <p>{t(language, "learnHighlighted")}</p>
                    <ul>
                      {structures.map((s) => (
                        <li key={s.id}>
                          <span>{latinName(s)}</span>
                          <small>{structureName(s, language)}</small>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
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
              onTabChange("discover");
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
