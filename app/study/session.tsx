import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Volume2 } from "lucide-react";
import {
  counts,
  formatInterval,
  introduce,
  nextDue,
  pickNext,
  schedule,
} from "@/lib/srs";
import { recordReview, studyDay } from "@/lib/flashcards/db";
import { normalizeLatin } from "@/lib/flashcards/latin";
import type {
  Catalog,
  Deck,
  DeckProgress,
  Grade,
  ReviewLog,
} from "@/lib/flashcards/types";
import { canSpeak, prepareVoices, speakTerms, stopSpeaking } from "./speech";
import {
  CATEGORY_LABEL,
  Plate,
  capitalize,
  catalogMaps,
  explorerHref,
  latinName,
} from "./shared";

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: "again", label: "Again", key: "1" },
  { grade: "hard", label: "Hard", key: "2" },
  { grade: "good", label: "Good", key: "3" },
  { grade: "easy", label: "Easy", key: "4" },
];

function currentDay(p: DeckProgress): DeckProgress {
  const day = studyDay();
  return p.newToday.day === day ? p : { ...p, newToday: { day, count: 0 } };
}

export function Session({
  deck,
  catalog,
  initial,
  onExit,
  onSaved,
}: {
  deck: Deck;
  catalog: Catalog;
  initial: DeckProgress;
  onExit: () => void;
  onSaved: (p: DeckProgress) => void;
}) {
  const maps = useMemo(() => catalogMaps(catalog), [catalog]);
  const items = useMemo(
    () => deck.items.filter((i) => maps.structures.has(i.structureId)),
    [deck, maps],
  );
  const itemById = useMemo(
    () => new Map(items.map((i) => [i.structureId, i])),
    [items],
  );
  const structures = useMemo(
    () => items.map((i) => maps.structures.get(i.structureId)!),
    [items, maps],
  );
  const figureOf = useMemo(
    () => new Map(items.map((i, n) => [i.structureId, n + 1])),
    [items],
  );

  const [progress, setProgress] = useState(() => currentDay(initial));
  const [now, setNow] = useState(() => Date.now());
  const [lastId, setLastId] = useState<string>();
  const [revealed, setRevealed] = useState(false);
  const [viewChoice, setViewChoice] = useState<{ id: string; index: number }>();
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const audible = canSpeak();

  const newRemaining = Math.max(0, deck.newPerDay - progress.newToday.count);
  const next = useMemo(
    () => pickNext(structures, progress.cards, now, newRemaining, lastId),
    [structures, progress, now, newRemaining, lastId],
  );
  const tally = counts(structures, progress.cards, now, newRemaining);
  const structure = next?.structure;
  const item = structure ? itemById.get(structure.id) : undefined;
  const card = structure ? progress.cards[structure.id] : undefined;

  // Reviews rotate through the rendered views so the shape is learned, not one picture.
  const view =
    viewChoice && viewChoice.id === structure?.id
      ? viewChoice.index
      : (card?.reps ?? 0);
  const setView = (index: number) =>
    structure && setViewChoice({ id: structure.id, index });

  useEffect(() => {
    if (next) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [next]);

  useEffect(() => {
    prepareVoices();
    return () => stopSpeaking();
  }, []);

  const hear = useCallback((latin: string, english: string, force = false) => {
    speakTerms(latin, english, setSpeaking, force);
  }, []);

  const commit = useCallback(
    (updated: DeckProgress, id: string, log?: ReviewLog) => {
      setProgress(updated);
      setLastId(id);
      setRevealed(false);
      setViewChoice(undefined);
      setNow(Date.now());
      onSaved(updated);
      recordReview(updated, log).catch((e) =>
        setError(
          e instanceof Error ? e.message : "Progress could not be saved.",
        ),
      );
    },
    [onSaved],
  );

  const learn = useCallback(() => {
    if (!structure) return;
    const t = Date.now();
    const p = currentDay(progress);
    const updated: DeckProgress = {
      ...p,
      cards: { ...p.cards, [structure.id]: introduce(t) },
      newToday: { day: p.newToday.day, count: p.newToday.count + 1 },
    };
    commit(updated, structure.id);
  }, [structure, progress, commit]);

  const grade = useCallback(
    (g: Grade) => {
      if (!structure || !card) return;
      const t = Date.now();
      const updatedCard = schedule(card, g, t);
      const updated: DeckProgress = {
        ...currentDay(progress),
        cards: { ...progress.cards, [structure.id]: updatedCard },
      };
      commit(updated, structure.id, {
        deckId: deck.id,
        structureId: structure.id,
        grade: g,
        at: t,
        phase: updatedCard.phase,
        interval: updatedCard.interval,
        due: updatedCard.due,
      });
    },
    [structure, card, progress, deck.id, commit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey)
        return;
      if (!next) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (next.kind === "learn") learn();
        else if (!revealed) setRevealed(true);
        else grade("good");
      } else if (next.kind === "practice" && revealed) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) grade(g.grade);
      } else if (
        (e.key === "l" || e.key === "L") &&
        audible &&
        structure &&
        item &&
        (next.kind === "learn" || revealed)
      ) {
        e.preventDefault();
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
        } else hear(item.label, capitalize(structure.en), true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, revealed, learn, grade, audible, speaking, structure, item, hear]);

  const showAnswer = next?.kind === "learn" || revealed;
  const official = structure ? latinName(structure) : "";

  useEffect(() => {
    return () => {
      stopSpeaking();
      setSpeaking(false);
    };
  }, [structure?.id]);
  const upcoming = nextDue(progress.cards);

  return (
    <div className="session">
      <header className="session-bar">
        <button type="button" className="back" onClick={onExit}>
          <ArrowLeft size={16} /> Decks
        </button>
        <h2>{deck.name}</h2>
        <div className="session-tools">
          <div className="tally" aria-label="Cards remaining">
            <span className="tally-new" title="New today">
              {tally.fresh}
            </span>
            <span className="tally-learning" title="Learning">
              {tally.learning}
            </span>
            <span className="tally-review" title="Due for review">
              {tally.review}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <p className="study-error" role="alert">
          {error}
        </p>
      )}

      {!structure || !item ? (
        <section className="session-done">
          <p className="eyebrow-serif">Session complete</p>
          <h3>Nothing is due right now.</h3>
          <p>
            {upcoming
              ? `The next card returns in ${formatInterval(Math.max(0, upcoming - now))}.`
              : "Add cards to this deck to begin."}
            {newRemaining === 0 &&
              items.some((i) => !progress.cards[i.structureId]) &&
              ` You have reached today's limit of ${deck.newPerDay} new cards.`}
          </p>
          <button type="button" className="action" onClick={onExit}>
            Back to decks
          </button>
        </section>
      ) : (
        <section
          className="session-card"
          key={`${structure.id}-${card?.reps ?? "new"}`}
        >
          <Plate
            structure={structure}
            view={view}
            figure={figureOf.get(structure.id)}
            onView={showAnswer ? setView : undefined}
          />
          <div className="answer">
            {next!.kind === "learn" && <p className="badge-new">New card</p>}
            {!showAnswer ? (
              <>
                <p className="eyebrow-serif">
                  {CATEGORY_LABEL[structure.category]}
                </p>
                <h3 className="prompt">Name the highlighted structure.</h3>
                <p className="hint">Say or write the Latin term, then check.</p>
                <button
                  type="button"
                  className="action"
                  onClick={() => setRevealed(true)}
                >
                  Show answer <kbd>Space</kbd>
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow-serif">
                  {CATEGORY_LABEL[structure.category]}
                </p>
                <div className="latin-row">
                  <h3 className="latin">{item.label}</h3>
                  {audible && (
                    <button
                      type="button"
                      className="speak"
                      aria-pressed={speaking}
                      onClick={() => {
                        if (speaking) {
                          stopSpeaking();
                          setSpeaking(false);
                        } else hear(item.label, capitalize(structure.en), true);
                      }}
                    >
                      <Volume2 size={16} />
                      <span>{speaking ? "Stop" : "Listen"}</span>
                      <kbd>L</kbd>
                    </button>
                  )}
                </div>
                {normalizeLatin(item.label) !== normalizeLatin(official) && (
                  <p className="official">
                    <span>Terminologia Anatomica</span> {official}
                  </p>
                )}
                <p className="english">{capitalize(structure.en)}</p>
                {item.note && <p className="note">{item.note}</p>}
                {structure.members && (
                  <p className="members">
                    Includes{" "}
                    {structure.members
                      .map((m) => maps.structures.get(m)?.en)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                <a
                  className="explore"
                  href={explorerHref(structure)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore in 3D <ArrowUpRight size={14} />
                </a>
                {next!.kind === "learn" ? (
                  <button type="button" className="action" onClick={learn}>
                    Got it <kbd>Space</kbd>
                  </button>
                ) : (
                  <div
                    className="grades"
                    role="group"
                    aria-label="How well did you remember?"
                  >
                    {GRADES.map(({ grade: g, label, key }) => (
                      <button
                        type="button"
                        key={g}
                        className={`grade grade-${g}`}
                        onClick={() => grade(g)}
                      >
                        <span>{label}</span>
                        <small>
                          {formatInterval(schedule(card!, g, now).due - now)}
                        </small>
                        <kbd>{key}</kbd>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
