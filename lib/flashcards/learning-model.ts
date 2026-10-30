import { introduce, schedule } from "../srs.ts";
import type { CardState, Grade } from "./types";

export interface LearningEvent {
  id: string;
  cardId: string;
  deckId: string;
  at: number;
  action: Grade | "introduce" | "import";
  mode: "recall" | "choice" | "migration";
  /** Preserves the scheduling state when importing the previous app. */
  initialState?: CardState;
  schedulerVersion: 1;
}

export interface DeckSelection {
  id: string;
  selected: boolean;
  updatedAt: number;
}

export function studyDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(d.getHours() - 4);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function validEvent(value: unknown): value is LearningEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as LearningEvent;
  if (
    typeof e.id !== "string" ||
    !e.id ||
    typeof e.cardId !== "string" ||
    !e.cardId ||
    typeof e.deckId !== "string" ||
    !Number.isFinite(e.at) ||
    e.at <= 0 ||
    e.schedulerVersion !== 1 ||
    !["again", "hard", "good", "easy", "introduce", "import"].includes(e.action) ||
    !["recall", "choice", "migration"].includes(e.mode)
  )
    return false;
  if (e.action !== "import") return true;
  const s = e.initialState;
  return (
    !!s &&
    ["learning", "review", "relearning"].includes(s.phase) &&
    [s.step, s.ease, s.interval, s.reps, s.lapses, s.due].every(Number.isFinite) &&
    s.step >= 0 &&
    s.ease >= 1.3 &&
    s.interval >= 0 &&
    s.reps >= 0 &&
    s.lapses >= 0
  );
}

/** A union of immutable events yields the same schedule on every device. */
export function projectLearning(events: LearningEvent[], now = Date.now()) {
  const unique = new Map(events.map((e) => [e.id, e]));
  const ordered = [...unique.values()].sort((a, b) => {
    if (a.action === "import" && b.action !== "import") return -1;
    if (b.action === "import" && a.action !== "import") return 1;
    return (a.action === "import" ? b.at - a.at : a.at - b.at) || a.id.localeCompare(b.id);
  });
  const cards: Record<string, CardState> = Object.create(null);
  const lastGrades: Record<string, Grade> = Object.create(null);
  let newToday = 0;
  let reviewsToday = 0;
  const day = studyDay(now);
  for (const event of ordered) {
    const current = cards[event.cardId];
    if (event.action === "import") {
      // Imports are baselines only; never overwrite an actual study event.
      if (!current && event.initialState) cards[event.cardId] = event.initialState;
      continue;
    }
    if (!current && studyDay(event.at) === day) newToday++;
    if (event.action === "introduce") {
      if (!current) cards[event.cardId] = introduce(event.at);
    } else {
      cards[event.cardId] = schedule(current ?? introduce(event.at), event.action, event.at);
      lastGrades[event.cardId] = event.action;
      if (studyDay(event.at) === day) reviewsToday++;
    }
  }
  return { cards, lastGrades, newToday, reviewsToday, day };
}
