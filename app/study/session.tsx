import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Volume2 } from "lucide-react";
import { formatInterval, introduce, nextDue, pickNext, schedule } from "@/lib/srs";
import { studyDay, type LearningEvent } from "@/lib/flashcards/learning-model";
import { normalizeLatin } from "@/lib/flashcards/latin";
import type { Catalog, Deck, DeckProgress, Grade, ReviewLog } from "@/lib/flashcards/types";
import { ChoiceList } from "./choice";
import { buildChoices, type Game } from "./choices";
import { canSpeak, prepareVoices, speakTerms, stopSpeaking } from "./speech";
import { SwipeCard, type Recall } from "./swipe-card";
import {
  CATEGORY_LABEL,
  ExplorerOverlay,
  Plate,
  capitalize,
  catalogMaps,
  explorerHref,
  latinName,
} from "./shared";

function currentDay(p: DeckProgress): DeckProgress {
  const day = studyDay();
  return p.newToday.day === day ? p : { ...p, newToday: { day, count: 0 } };
}

function returnsIn(interval: string) {
  return interval === "now" ? "Returns in a moment." : `Returns in ${interval}.`;
}

function RevealedTerm({
  label,
  official,
  english,
  note,
  members,
  audible,
  speaking,
  onToggleSpeak,
}: {
  label: string;
  official: string;
  english: string;
  note?: string;
  members?: string;
  audible: boolean;
  speaking: boolean;
  onToggleSpeak: () => void;
}) {
  return (
    <>
      <h3 className="latin">
        {label}
        {audible && (
          <button
            type="button"
            className="speak"
            aria-label={speaking ? "Stop pronunciation" : "Listen"}
            aria-pressed={speaking}
            onPointerDown={(e) => {
              // iOS treats click as too late for speechSynthesis.
              if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
              e.preventDefault();
              onToggleSpeak();
            }}
            onClick={onToggleSpeak}
          >
            <Volume2 aria-hidden="true" />
          </button>
        )}
      </h3>
      {normalizeLatin(label) !== normalizeLatin(official) && (
        <p className="official">
          <span>Terminologia Anatomica</span> {official}
        </p>
      )}
      <p className="english">{english}</p>
      {note && <p className="note">{note}</p>}
      {members && <p className="members">Includes {members}</p>}
    </>
  );
}

export function Session({
  deck,
  catalog,
  initial,
  onExit,
  onRecord,
  saveStatus,
}: {
  deck: Deck;
  catalog: Catalog;
  initial: DeckProgress;
  onExit: () => void;
  onRecord: (event: LearningEvent) => Promise<DeckProgress>;
  saveStatus: string;
}) {
  const maps = useMemo(() => catalogMaps(catalog), [catalog]);
  const items = useMemo(
    () => deck.items.filter((i) => maps.structures.has(i.structureId)),
    [deck, maps],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.structureId, i])), [items]);
  const structures = useMemo(
    () => items.map((i) => maps.structures.get(i.structureId)!),
    [items, maps],
  );
  const inDeck = useCallback(
    (p: DeckProgress): DeckProgress => ({
      ...currentDay(p),
      cards: Object.fromEntries(
        items
          .filter((i) => p.cards[i.structureId])
          .map((i) => [i.structureId, p.cards[i.structureId]]),
      ),
    }),
    [items],
  );
  const [progress, setProgress] = useState(() => inDeck(initial));
  const [now, setNow] = useState(() => Date.now());
  const [lastId, setLastId] = useState<string>();
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(0);
  const [nudge, setNudge] = useState<Recall | null>(null);
  const [viewChoice, setViewChoice] = useState<{ id: string; index: number }>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const savingRef = useRef(false);
  const pendingEvent = useRef<LearningEvent | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [explore, setExplore] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedRef = useRef<string | null>(null);
  const audible = canSpeak();

  const newRemaining = Math.max(0, deck.newPerDay - progress.newToday.count);
  const next = useMemo(
    () => pickNext(structures, progress.cards, now, newRemaining, lastId),
    [structures, progress, now, newRemaining, lastId],
  );
  const structure = next?.structure;
  const item = structure ? itemById.get(structure.id) : undefined;
  const card = structure ? progress.cards[structure.id] : undefined;
  // Each card is recall or multiple choice, chosen once so a re-render cannot switch it.
  const structureId = structure?.id;
  const gameKey = `${structureId ?? ""}:${round}`;
  const [gamePick, setGamePick] = useState<{ key: string; game: Game }>({
    key: "",
    game: "recall",
  });
  let game: Game = gamePick.game;
  if (!structureId) game = "recall";
  else if (gamePick.key !== gameKey) {
    game = Math.random() < 0.5 ? "choice" : "recall";
    setGamePick({ key: gameKey, game });
  }
  const deckPool = useMemo(
    () =>
      items.flatMap((entry) => {
        const subject = maps.structures.get(entry.structureId);
        if (!subject) return [];
        return [
          {
            id: subject.id,
            label: entry.label,
            english: capitalize(subject.en),
            category: subject.category,
          },
        ];
      }),
    [items, maps],
  );
  const catalogPool = useMemo(
    () =>
      catalog.structures.map((subject) => ({
        id: subject.id,
        label: latinName(subject),
        english: capitalize(subject.en),
        category: subject.category,
      })),
    [catalog],
  );
  const options = useMemo(() => {
    if (game !== "choice" || !structure || !item) return [];
    return buildChoices(
      {
        id: structure.id,
        label: item.label,
        english: capitalize(structure.en),
        category: structure.category,
      },
      deckPool,
      catalogPool,
      `${structure.id}:${round}`,
    );
  }, [game, structure, item, deckPool, catalogPool, round]);

  // Reviews rotate through the rendered views so the shape is learned, not one picture.
  const view = viewChoice && viewChoice.id === structure?.id ? viewChoice.index : (card?.reps ?? 0);
  const setView = (index: number) => structure && setViewChoice({ id: structure.id, index });

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

  const toggleSpeak = useCallback(() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else if (item && structure) {
      hear(item.label, capitalize(structure.en), true);
    }
  }, [speaking, item, structure, hear]);

  const commit = useCallback(
    async (_updated: DeckProgress, id: string, log?: ReviewLog) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setError("");
      // Retain the event ID if a save/read is interrupted, so retry cannot double-count it.
      const event = pendingEvent.current ?? {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `review-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
        cardId: id,
        deckId: deck.id,
        at: log?.at ?? Date.now(),
        action: log?.grade ?? "introduce",
        mode: game,
        schedulerVersion: 1 as const,
      };
      pendingEvent.current = event;
      try {
        const saved = await onRecord(event);
        setProgress(inDeck(saved));
        pendingEvent.current = null;
        setLastId(id);
        setRevealed(false);
        setViewChoice(undefined);
        setNudge(null);
        pickedRef.current = null;
        setPicked(null);
        setRound((n) => n + 1);
        setNow(Date.now());
      } catch (e) {
        setError(
          `${e instanceof Error ? e.message : "Progress could not be saved."} Your answer has not advanced. Try again.`,
        );
        setNudge(null);
        setSaveAttempt((n) => n + 1);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [onRecord, deck.id, game, inDeck],
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

  const choose = useCallback((id: string) => {
    if (pickedRef.current) return;
    pickedRef.current = id;
    setPicked(id);
  }, []);

  const advanceChoice = useCallback(() => {
    if (!structure || !pickedRef.current) return;
    const correct = pickedRef.current === structure.id;
    const t = Date.now();
    const p = currentDay(progress);
    const existing = p.cards[structure.id];
    const g: Grade = correct ? "good" : "again";
    const updatedCard = schedule(existing ?? introduce(t), g, t);
    const updated: DeckProgress = {
      ...p,
      cards: { ...p.cards, [structure.id]: updatedCard },
      newToday: existing ? p.newToday : { day: p.newToday.day, count: p.newToday.count + 1 },
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
  }, [structure, progress, deck.id, commit]);

  useEffect(() => {
    setExplore(false);
    pickedRef.current = null;
    setPicked(null);
  }, [structure?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (explore || savingRef.current || pendingEvent.current) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (!next || !structure) return;
      if (game === "choice") {
        if (e.repeat) return;
        const digit = "1234".indexOf(e.key);
        const letter = "abcd".indexOf(e.key.toLowerCase());
        const index = digit >= 0 ? digit : letter;
        if (!picked && index >= 0) {
          const option = options[index];
          if (!option) return;
          e.preventDefault();
          choose(option.id);
          return;
        }
        if ((e.key === " " || e.key === "Enter") && picked) {
          e.preventDefault();
          advanceChoice();
        } else if ((e.key === "l" || e.key === "L") && audible && item && picked) {
          e.preventDefault();
          toggleSpeak();
        }
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (next.kind === "learn") learn();
        else if (!revealed) setRevealed(true);
      } else if (next.kind === "practice" && revealed && !e.repeat) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setNudge("good");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setNudge("again");
        }
      } else if (
        (e.key === "l" || e.key === "L") &&
        audible &&
        item &&
        (next.kind === "learn" || revealed)
      ) {
        e.preventDefault();
        toggleSpeak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    explore,
    next,
    revealed,
    learn,
    audible,
    structure,
    item,
    toggleSpeak,
    game,
    picked,
    options,
    choose,
    advanceChoice,
  ]);

  const showAnswer = game === "choice" ? picked !== null : next?.kind === "learn" || revealed;
  const official = structure ? latinName(structure) : "";

  useEffect(() => {
    return () => {
      stopSpeaking();
      setSpeaking(false);
    };
  }, [structure?.id]);
  const upcoming = nextDue(progress.cards);
  const canSwipe = next?.kind === "practice" && revealed && !!card;
  const rememberedIn = card
    ? formatInterval(Math.max(0, schedule(card, "good", now).due - now))
    : "";
  const forgottenIn = card
    ? formatInterval(Math.max(0, schedule(card, "again", now).due - now))
    : "";
  const choiceCorrect = picked !== null && picked === structure?.id;
  const choiceReturn =
    game === "choice" && picked && structure
      ? returnsIn(
          formatInterval(
            Math.max(
              0,
              schedule(card ?? introduce(now), choiceCorrect ? "good" : "again", now).due - now,
            ),
          ),
        )
      : "";

  return (
    <div className={game === "choice" ? "session is-choice" : "session"}>
      <header className="session-bar">
        <button
          type="button"
          className="back"
          onClick={() => {
            if (
              !pendingEvent.current ||
              confirm("This answer hasn’t been saved. Leave without saving it?")
            )
              onExit();
          }}
          disabled={saving}
          aria-label="Back to decks"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="session-heading">
          <h2>{deck.name}</h2>
          {game === "choice" && <p className="session-game">Multiple choice</p>}
        </div>
        <span className="session-save" role="status">
          {saving ? "Saving review…" : saveStatus}
        </span>
      </header>

      {error && (
        <div className="study-error" role="alert">
          {error}
          <button
            className="ghost"
            disabled={saving}
            onClick={() => {
              if (pendingEvent.current) void commit(progress, pendingEvent.current.cardId);
            }}
          >
            Retry saving answer
          </button>
        </div>
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
        <SwipeCard
          key={`${structure.id}-${round}-${saveAttempt}`}
          enabled={game === "recall" && canSwipe && !saving && !error}
          intent={nudge}
          yesWhen={rememberedIn}
          noWhen={forgottenIn}
          onDecide={grade}
        >
          <Plate
            structure={structure}
            view={view}
            explore={showAnswer ? () => setExplore(true) : undefined}
            onView={game === "choice" || showAnswer ? setView : undefined}
            praise={game === "choice" && choiceCorrect}
          />
          <div className="answer">
            {next!.kind === "learn" && game === "recall" && <p className="badge-new">New card</p>}
            {game === "choice" ? (
              <>
                {next!.kind === "learn" && !picked && <p className="badge-new">New card</p>}
                <p className="eyebrow-serif">{CATEGORY_LABEL[structure.category]}</p>
                {!picked ? (
                  <>
                    <h3 className="prompt">Which structure is highlighted?</h3>
                    <p className="hint">Choose its Latin name.</p>
                  </>
                ) : (
                  <>
                    <p
                      className={choiceCorrect ? "verdict verdict-yes" : "verdict verdict-no"}
                      role="status"
                    >
                      {choiceCorrect ? "Correct" : "Not this one"}
                    </p>
                    <RevealedTerm
                      label={item.label}
                      official={official}
                      english={capitalize(structure.en)}
                      note={item.note}
                      members={
                        structure.members
                          ?.map((m) => maps.structures.get(m)?.en)
                          .filter(Boolean)
                          .join(", ") || undefined
                      }
                      audible={audible}
                      speaking={speaking}
                      onToggleSpeak={toggleSpeak}
                    />
                    <p className="hint">{choiceReturn}</p>
                  </>
                )}
                <ChoiceList
                  options={options}
                  pickedId={picked}
                  correctId={structure.id}
                  onPick={choose}
                />
                {picked && (
                  <button
                    type="button"
                    className="action"
                    onClick={advanceChoice}
                    disabled={saving || !!error}
                  >
                    Next <kbd>Space</kbd>
                  </button>
                )}
              </>
            ) : !showAnswer ? (
              <>
                <p className="eyebrow-serif">{CATEGORY_LABEL[structure.category]}</p>
                <h3 className="prompt">Name the highlighted structure.</h3>
                <p className="hint">Say or write the Latin term, then check.</p>
                <button type="button" className="action" onClick={() => setRevealed(true)}>
                  Show answer <kbd>Space</kbd>
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow-serif">{CATEGORY_LABEL[structure.category]}</p>
                <RevealedTerm
                  label={item.label}
                  official={official}
                  english={capitalize(structure.en)}
                  note={item.note}
                  members={
                    structure.members
                      ?.map((m) => maps.structures.get(m)?.en)
                      .filter(Boolean)
                      .join(", ") || undefined
                  }
                  audible={audible}
                  speaking={speaking}
                  onToggleSpeak={toggleSpeak}
                />
                {next!.kind === "learn" && (
                  <button
                    type="button"
                    className="action"
                    onClick={learn}
                    disabled={saving || !!error}
                  >
                    Got it <kbd>Space</kbd>
                  </button>
                )}
              </>
            )}
          </div>
        </SwipeCard>
      )}
      {explore && structure && (
        <ExplorerOverlay
          src={explorerHref(structure)}
          title={capitalize(structure.en)}
          onClose={() => setExplore(false)}
        />
      )}
    </div>
  );
}
