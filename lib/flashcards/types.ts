export type Category = "bone" | "muscle" | "ligament";

/** A card subject: one structure (left/right meshes merged) or a composite such as a whole muscle. */
export interface Structure {
  id: string;
  en: string;
  /** Latin terms, preferred term first. */
  la: string[];
  category: Category;
  /** Every atlas mesh belonging to the structure, both sides. */
  parts: string[];
  /** Meshes highlighted on the card (one side for paired structures). */
  focus: string[];
  /** Structure ids of the pieces that make up a composite. */
  members?: string[];
  images: CardImage[];
}

export interface CardImage {
  src: string;
  /** Anatomical viewing direction, e.g. "anterior". */
  view: string;
}

/** A Latin collective term (e.g. "costae") that expands to several structures. */
export interface StructureGroup {
  id: string;
  en: string;
  la: string[];
  members: string[];
}

export interface Catalog {
  version: number;
  sources: string[];
  structures: Structure[];
  groups: StructureGroup[];
}

export type Grade = "again" | "hard" | "good" | "easy";
export type Phase = "learning" | "review" | "relearning";

export interface CardState {
  phase: Phase;
  step: number;
  ease: number;
  /** Days. */
  interval: number;
  reps: number;
  lapses: number;
  /** Epoch milliseconds. */
  due: number;
}

export interface DeckItem {
  structureId: string;
  /** The term as the learner wrote it. */
  label: string;
  note?: string;
}

export interface Deck {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  newPerDay: number;
  items: DeckItem[];
}

export interface DeckProgress {
  deckId: string;
  cards: Record<string, CardState>;
  newToday: { day: string; count: number };
}

export interface ReviewLog {
  id?: number;
  deckId: string;
  structureId: string;
  grade: Grade;
  at: number;
  phase: Phase;
  interval: number;
  due: number;
}
