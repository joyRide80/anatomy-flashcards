export type SystemId =
  | "skeletal"
  | "joints"
  | "muscular"
  | "arterial"
  | "venous"
  | "nervous"
  | "digestive"
  | "respiratory"
  | "urinary"
  | "reproductive"
  | "lymphatic"
  | "endocrine"
  | "integumentary"
  | "connective"
  | "sensory"
  | "cardiac";
export const SYSTEMS: {
  id: SystemId;
  name: string;
  color: string;
  description: string;
}[] = [
  {
    id: "skeletal",
    name: "Skeleton",
    color: "#e7c397",
    description:
      "Bones form the supporting framework of the body, protect organs, and provide attachment points for muscles. Their internal tissue also stores minerals and produces blood cells.",
  },
  {
    id: "joints",
    name: "Joints",
    color: "#ffffff",
    description:
      "Joints are where bones meet. Capsules, ligaments, discs, menisci, and labra hold those meetings together and guide how the bones move.",
  },
  {
    id: "muscular",
    name: "Muscles",
    color: "#a85b50",
    description:
      "Skeletal muscles generate movement by pulling on their attachments. Together with tendons, they move joints, stabilize posture, and produce heat.",
  },
  {
    id: "cardiac",
    name: "Heart",
    color: "#b96760",
    description:
      "The heart is a muscular pump with four chambers. Its valves direct blood forward through the pulmonary and systemic circuits.",
  },
  {
    id: "sensory",
    name: "Sensory organs",
    color: "#b0c8ce",
    description:
      "These structures contribute to special senses, including sight, hearing, and balance. Their specialized tissues detect stimuli and work with the nervous system to convey information.",
  },
  {
    id: "arterial",
    name: "Arteries",
    color: "#c05245",
    description:
      "The heart drives blood through the circulation. Arteries carry blood away from the heart to supply tissues or, in the pulmonary circuit, to the lungs.",
  },
  {
    id: "venous",
    name: "Veins",
    color: "#527c9f",
    description:
      "Veins return blood toward the heart. Superficial and deep networks collect blood from the tissues; the pulmonary veins bring oxygenated blood back from the lungs.",
  },
  {
    id: "nervous",
    name: "Nervous system",
    color: "#d8b565",
    description:
      "The brain, spinal cord, and peripheral nerves carry and process signals. They support sensation, movement, coordination, and automatic regulation of body functions.",
  },
  {
    id: "respiratory",
    name: "Respiratory",
    color: "#b98991",
    description:
      "The airways conduct air to the lungs, where oxygen and carbon dioxide move between air and blood. Breathing depends on pressure changes produced by respiratory muscles.",
  },
  {
    id: "digestive",
    name: "Digestive",
    color: "#b8916b",
    description:
      "The digestive tract breaks down food, absorbs nutrients and water, and moves waste onward. Accessory organs contribute bile and digestive enzymes.",
  },
  {
    id: "urinary",
    name: "Urinary",
    color: "#b47961",
    description:
      "The kidneys filter blood and regulate fluid, electrolyte, and acid–base balance. Urine travels through the ureters to the bladder and exits through the urethra.",
  },
  {
    id: "lymphatic",
    name: "Lymphatic",
    color: "#879f7c",
    description:
      "Lymphatic vessels return excess tissue fluid to the circulation. Lymph nodes and other lymphoid organs support immune surveillance and responses.",
  },
  {
    id: "endocrine",
    name: "Endocrine",
    color: "#c5a09a",
    description:
      "Endocrine organs release hormones into the blood to coordinate processes such as metabolism, growth, stress responses, and reproduction.",
  },
  {
    id: "reproductive",
    name: "Reproductive",
    color: "#bda098",
    description:
      "The male reproductive structures represented here contribute to sperm production, maturation, transport, and the production of sex hormones.",
  },
  {
    id: "integumentary",
    name: "Body surface",
    color: "#ba9b7d",
    description:
      "The body surface provides an outer anatomical reference. The integumentary system forms a protective barrier and contributes to sensation and temperature regulation.",
  },
  {
    id: "connective",
    name: "Connective tissue",
    color: "#aec3bb",
    description:
      "Cartilage, tendons, and other connective tissues support and separate structures. Named joint ligaments, capsules, discs, and menisci are grouped in the Joints layer.",
  },
];
export interface Part {
  id: string;
  name: string;
  conceptId: string;
  system: SystemId;
  chunk: number;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: [number[], number[]];
}
export interface Concept {
  id: string;
  name: string;
  elements: string[];
}
export interface Atlas {
  version: string;
  sex?: "male";
  source?: string;
  scope?: string;
  parts: Part[];
  concepts: Concept[];
  chunks: { url: string; bytes: number; gzip?: string; gzipBytes?: number }[];
  triangles: number;
}
export type View = "three-quarter" | "front" | "back" | "side";
/** Studio lighting. Intensities are three.js light and environment units. */
export interface Lighting {
  exposure: number;
  environment: number;
  softness: number;
  hemisphere: number;
  key: number;
  fill: number;
  rim: number;
}
/**
 * View-locked suns from the Blender atlas file. Positions are camera-space,
 * opposite the ray direction, so each light stays put as the view orbits.
 * Colors are the file's linear sun colors converted to sRGB.
 */
export const STUDIO_LIGHTS = {
  hemisphereSky: 0xfff4e6,
  hemisphereGround: 0x6a5344,
  key: { color: 0xfffcca, position: [0.707, 0.5, 0.5] as const },
  fill: { color: 0xffd09e, position: [-0.592, -0.362, -0.72] as const },
  rim: { color: 0xdda5ff, position: [-0.242, -0.85, 0.468] as const },
};
export const DEFAULT_LIGHTING: Lighting = {
  exposure: 0.92,
  environment: 0.16,
  softness: 0.55,
  hemisphere: 0.16,
  key: 1.75,
  fill: 1.05,
  rim: 0.2,
};
export interface SceneState {
  inspectorOpen?: boolean;
  explode: number;
  visible: SystemId[];
  selected: string[];
  isolate: boolean;
  view: View;
  rotate: boolean;
  reset: number;
  /** Piece ids hidden by knife mode. Reset clears this list. */
  removed: string[];
  knife: boolean;
  context?: string[];
  frame?: string[];
}
export const DEFAULT_VISIBLE: SystemId[] = [
  "cardiac",
  "sensory",
  "skeletal",
  "joints",
  "muscular",
  "arterial",
  "venous",
  "nervous",
  "respiratory",
  "digestive",
  "urinary",
  "lymphatic",
  "endocrine",
  "reproductive",
  "connective",
];
export const EXPLANATIONS: Record<string, string> = {
  heart:
    "A muscular pump in the chest. Its right side sends blood to the lungs; its left side sends blood through the systemic circulation.",
  liver:
    "A large organ beneath the right side of the diaphragm. It processes absorbed nutrients, produces bile, and synthesizes many proteins carried in the blood.",
  brain:
    "The central organ of the nervous system. Its interconnected regions support perception, movement, memory, language, and the regulation of bodily functions.",
  stomach:
    "A muscular chamber between the esophagus and small intestine. It stores and mixes food with acid and enzymes before releasing it into the duodenum.",
  spleen:
    "A lymphoid organ in the upper left abdomen. It filters blood, removes aging blood cells, and participates in immune responses.",
  pancreas:
    "An abdominal organ with digestive and endocrine roles. It supplies enzymes to the small intestine and releases hormones including insulin and glucagon.",
  "urinary bladder":
    "A muscular reservoir in the pelvis that stores urine arriving from the kidneys through the ureters.",
  trachea:
    "The main airway connecting the larynx to the bronchi. Its cartilage supports keep the airway open during breathing.",
  diaphragm:
    "A broad muscle separating the chest and abdomen. When it contracts, it increases chest volume and helps draw air into the lungs.",
};
export function explanation(name: string, system: SystemId) {
  return (
    EXPLANATIONS[name.toLowerCase()] ??
    SYSTEMS.find((s) => s.id === system)?.description ??
    ""
  );
}

/** Bones, ligaments, and the closest muscles around a structure, so a close-up keeps its neighborhood. */
export function neighborhood(atlas: Atlas, ids: string[]): string[] {
  const own = new Set(ids);
  const byId = new Map(atlas.parts.map((part) => [part.id, part]));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const part = byId.get(id);
    if (!part) continue;
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.bounds[0][axis]);
      max[axis] = Math.max(max[axis], part.bounds[1][axis]);
    }
  }
  if (!Number.isFinite(min[0])) return [];
  // Pad each axis from that axis's own length, so a long bone keeps the joint
  // beyond its end without also pulling in a limb that merely hangs beside it.
  const low = min.map(
    (value, axis) => value - Math.max((max[axis] - value) * 0.55, 0.04),
  );
  const high = max.map(
    (value, axis) => value + Math.max((value - min[axis]) * 0.55, 0.04),
  );
  const origin = min.map((value, axis) => (value + max[axis]) / 2);
  const midpoint = (part: Part) =>
    part.bounds[0].map((value, axis) => (value + part.bounds[1][axis]) / 2) as [
      number,
      number,
      number,
    ];
  const distance = (part: Part) => {
    const center = midpoint(part);
    return Math.hypot(
      center[0] - origin[0],
      center[1] - origin[1],
      center[2] - origin[2],
    );
  };
  const near = (part: Part) =>
    midpoint(part).every(
      (value, axis) => value >= low[axis] && value <= high[axis],
    );
  const muscles: Part[] = [];
  const bones: string[] = [];
  for (const part of atlas.parts) {
    if (own.has(part.id) || !near(part)) continue;
    if (part.system === "muscular") muscles.push(part);
    else if (
      part.system === "skeletal" ||
      part.system === "connective" ||
      part.system === "joints"
    )
      bones.push(part.id);
  }
  muscles.sort((a, b) => distance(a) - distance(b));
  return [...bones, ...muscles.slice(0, 12).map((part) => part.id)];
}

/** Neighborhood of each side, so a paired structure keeps context on the side that is off camera too. */
export function studyContext(
  atlas: Atlas,
  selected: string[],
  focus: string[],
): string[] {
  const framed = focus.filter((id) => selected.includes(id));
  const framedSet = new Set(framed);
  const clusters = [framed.length ? framed : selected];
  const other = selected.filter((id) => !framedSet.has(id));
  if (other.length) clusters.push(other);
  const own = new Set(selected);
  const ids = new Set<string>();
  for (const cluster of clusters)
    for (const id of neighborhood(atlas, cluster))
      if (!own.has(id)) ids.add(id);
  return [...ids];
}
