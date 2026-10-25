import type { CardState, Grade, Structure } from "./flashcards/types";

const MINUTE = 60_000;
const DAY = 86_400_000;

export const LEARNING_STEPS = [1 * MINUTE, 10 * MINUTE];
export const RELEARNING_STEPS = [10 * MINUTE];
export const GRADUATING_INTERVAL = 1;
export const EASY_INTERVAL = 4;
export const STARTING_EASE = 2.5;
export const MIN_EASE = 1.3;
/** Cards still in (re)learning may be shown this early when nothing else is left. */
export const LEARN_AHEAD = 20 * MINUTE;

/** Practice card created when the user taps "Got it" on a learning card. */
export function introduce(now: number): CardState {
  return {
    phase: "learning",
    step: 0,
    ease: STARTING_EASE,
    interval: 0,
    reps: 0,
    lapses: 0,
    due: now + LEARNING_STEPS[0],
  };
}

function graduate(card: CardState, interval: number, now: number): CardState {
  return {
    ...card,
    phase: "review",
    step: 0,
    interval,
    due: now + interval * DAY,
  };
}

/** SM-2 with Anki-style learning steps. */
export function schedule(
  card: CardState,
  grade: Grade,
  now: number,
): CardState {
  const reps = grade === "again" ? card.reps : card.reps + 1;
  const c = { ...card, reps };

  if (c.phase === "learning" || c.phase === "relearning") {
    const steps = c.phase === "learning" ? LEARNING_STEPS : RELEARNING_STEPS;
    const graduateTo =
      c.phase === "learning" ? GRADUATING_INTERVAL : Math.max(1, c.interval);
    switch (grade) {
      case "again":
        return { ...c, step: 0, due: now + steps[0] };
      case "hard":
        return {
          ...c,
          due: now + steps[Math.min(c.step, steps.length - 1)] * 1.5,
        };
      case "good": {
        const step = c.step + 1;
        if (step >= steps.length) return graduate(c, graduateTo, now);
        return { ...c, step, due: now + steps[step] };
      }
      case "easy":
        return graduate(
          c,
          c.phase === "learning" ? EASY_INTERVAL : graduateTo + 1,
          now,
        );
    }
  }

  switch (grade) {
    case "again":
      return {
        ...c,
        phase: "relearning",
        step: 0,
        lapses: c.lapses + 1,
        ease: Math.max(MIN_EASE, c.ease - 0.2),
        interval: Math.max(1, Math.round(c.interval * 0.5)),
        due: now + RELEARNING_STEPS[0],
      };
    case "hard": {
      const interval = Math.max(c.interval + 1, Math.round(c.interval * 1.2));
      return {
        ...c,
        ease: Math.max(MIN_EASE, c.ease - 0.15),
        interval,
        due: now + interval * DAY,
      };
    }
    case "good": {
      const interval = Math.max(
        c.interval + 1,
        Math.round(c.interval * c.ease),
      );
      return { ...c, interval, due: now + interval * DAY };
    }
    case "easy": {
      const interval = Math.max(
        c.interval + 1,
        Math.round(c.interval * c.ease * 1.3),
      );
      return { ...c, ease: c.ease + 0.15, interval, due: now + interval * DAY };
    }
  }
}

export type QueueItem = { kind: "learn" | "practice"; structure: Structure };

/** One random card, skipping `avoidId` when another card is available. */
function choose(pool: Structure[], avoidId?: string): Structure | undefined {
  const source = avoidId ? pool.filter((s) => s.id !== avoidId) : pool;
  if (!source.length) return undefined;
  return source[Math.floor(Math.random() * source.length)];
}

/**
 * Picks the next card. Priority: anything due now, then a new card (within the
 * daily limit), then (re)learning cards due soon. Cards inside a priority are
 * in random order. Avoids repeating `lastId` when another card can be shown.
 */
export function pickNext(
  deck: Structure[],
  cards: Record<string, CardState>,
  now: number,
  newRemaining: number,
  lastId?: string,
): QueueItem | null {
  const started = deck.filter((s) => cards[s.id]);
  const dueNow = started.filter((s) => cards[s.id].due <= now);
  const fresh = newRemaining > 0 ? deck.filter((s) => !cards[s.id]) : [];
  const soon = started.filter(
    (s) =>
      cards[s.id].phase !== "review" && cards[s.id].due <= now + LEARN_AHEAD,
  );

  const due = choose(dueNow, lastId);
  if (due) return { kind: "practice", structure: due };
  const nextFresh = choose(fresh);
  if (nextFresh) return { kind: "learn", structure: nextFresh };
  const ahead = choose(soon, lastId) ?? dueNow[0] ?? soon[0];
  if (ahead) return { kind: "practice", structure: ahead };
  return null;
}

export function counts(
  deck: Structure[],
  cards: Record<string, CardState>,
  now: number,
  newRemaining: number,
) {
  let learning = 0;
  let review = 0;
  let unseen = 0;
  for (const s of deck) {
    const c = cards[s.id];
    if (!c) unseen++;
    else if (c.phase !== "review" && c.due <= now + LEARN_AHEAD) learning++;
    else if (c.phase === "review" && c.due <= now) review++;
  }
  return { fresh: Math.min(unseen, newRemaining), learning, review, unseen };
}

export function nextDue(cards: Record<string, CardState>): number | null {
  const dues = Object.values(cards).map((c) => c.due);
  return dues.length ? Math.min(...dues) : null;
}

export function formatInterval(ms: number): string {
  if (ms < MINUTE) return "now";
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)} min`;
  if (ms < 20 * 60 * MINUTE) return `${Math.round(ms / (60 * MINUTE))} h`;
  const days = Math.round(ms / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}
