import type { Structure } from "./types";

export const VERTEBRAL_DECK_ID = "default-columna-vertebralis";

export type VertebralKind = "atlas" | "axis" | "cervical" | "thoracic" | "lumbar";

/** Atlas and axis keep their own names; numbered vertebrae use their region. */
export function vertebralKind(structure: Pick<Structure, "id" | "en">): VertebralKind | null {
  if (structure.id === "atlas" || structure.id === "axis") return structure.id;
  const kind = /^(?:\w+ )(cervical|thoracic|lumbar) vertebra$/.exec(structure.en)?.[1];
  return (kind as VertebralKind | undefined) ?? null;
}

export const vertebralLatin: Record<VertebralKind, string> = {
  atlas: "atlas",
  axis: "axis",
  cervical: "vertebra cervicalis",
  thoracic: "vertebra thoracica",
  lumbar: "vertebra lumbalis",
};
