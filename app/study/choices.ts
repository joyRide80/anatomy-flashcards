import { normalizeLatin } from "@/lib/flashcards/latin";
import type { Category } from "@/lib/flashcards/types";

export type Game = "recall" | "choice";

export interface ChoiceOption {
  id: string;
  label: string;
  english: string;
  category: Category;
}

const CHOICE_COUNT = 4;
/** Leading generics dropped so "m. biceps brachii" and "biceps brachii" count as one option. */
const GENERIC = new Set([
  "musculus",
  "musculi",
  "ligamentum",
  "ligamenta",
  "os",
  "ossa",
]);

function choiceKey(label: string) {
  const words = normalizeLatin(label).split(" ").filter(Boolean);
  if (words.length > 1 && GENERIC.has(words[0])) words.shift();
  return words.join(" ");
}

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rand: () => number) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

/**
 * Four Latin names: the highlighted structure and distractors from the deck,
 * filled from the catalogue when the deck is smaller than a question.
 */
export function buildChoices(
  correct: ChoiceOption,
  deck: readonly ChoiceOption[],
  catalog: readonly ChoiceOption[],
  seed: string,
): ChoiceOption[] {
  const correctKey = choiceKey(correct.label);
  const seenIds = new Set<string>([correct.id]);
  const seenLabels = new Set<string>(correctKey ? [correctKey] : []);
  const picked: ChoiceOption[] = [];
  const rand = mulberry32(hash(`${seed}:${correct.id}`));

  const take = (source: readonly ChoiceOption[], sameCategory: boolean) => {
    if (seenIds.size >= CHOICE_COUNT) return;
    const candidates = source.filter((item) => {
      if (seenIds.has(item.id)) return false;
      if (sameCategory && item.category !== correct.category) return false;
      const key = choiceKey(item.label);
      return key.length > 0 && !seenLabels.has(key);
    });
    for (const item of shuffle(candidates, rand)) {
      if (seenIds.size >= CHOICE_COUNT) break;
      const key = choiceKey(item.label);
      if (seenLabels.has(key)) continue;
      seenIds.add(item.id);
      seenLabels.add(key);
      picked.push(item);
    }
  };

  take(deck, true);
  take(deck, false);
  take(catalog, true);
  take(catalog, false);

  return shuffle([correct, ...picked], rand);
}
