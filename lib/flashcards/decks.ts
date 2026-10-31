import type { Catalog, Category, Deck } from "./types";

export interface CuratedDeck extends Deck {
  description: string;
  region: string;
  category: Category;
  version: number;
  featured?: boolean;
}

type Definition = {
  id: string;
  name: string;
  description: string;
  region: string;
  category: Category;
  featured?: boolean;
  ids?: string[];
  match?: RegExp;
};

/** Editorial membership uses stable catalogue IDs, never fuzzy name matching. */
const DEFINITIONS: Definition[] = [
  {
    id: "bones-upper-limb",
    name: "Upper limb bones",
    category: "bone",
    region: "Upper limb",
    featured: true,
    description:
      "Start with the shoulder girdle, arm and forearm. Identify each highlighted bone and learn its Latin name.",
    ids: ["clavicle", "scapula", "humerus", "radius", "ulna"],
  },
  {
    id: "bones-lower-limb",
    name: "Lower limb bones",
    category: "bone",
    region: "Lower limb",
    featured: true,
    description: "A short introduction to the hip bone, thigh, knee and leg.",
    ids: ["hip-bone", "femur", "patella", "tibia", "fibula"],
  },
  {
    id: "bones-hand",
    name: "Bones of the hand",
    category: "bone",
    region: "Upper limb",
    description:
      "Practise the carpals, metacarpals and phalanges from several viewing angles.",
    ids: [
      "scaphoid",
      "lunate",
      "triquetral",
      "pisiform",
      "trapezium",
      "trapezoid",
      "capitate",
      "hamate",
    ],
    match:
      /metacarpal|phalanx-of-(thumb|index-finger|middle-finger|ring-finger|little-finger)/,
  },
  {
    id: "bones-foot",
    name: "Bones of the foot",
    category: "bone",
    region: "Lower limb",
    description:
      "Identify the tarsals, metatarsals and toe phalanges included in this atlas.",
    ids: [
      "talus",
      "calcaneus",
      "navicular-bone-of-foot",
      "cuboid-bone",
      "medial-cuneiform-bone",
      "intermediate-cuneiform-bone",
      "lateral-cuneiform-bone",
    ],
    match: /metatarsal|phalanx-of-.*toe|sesamoid-bone-of-foot/,
  },
  {
    id: "bones-skull",
    name: "Skull & hyoid",
    category: "bone",
    region: "Head & neck",
    description:
      "Learn the cranial and facial bones represented in the atlas, including the auditory ossicles and the hyoid.",
    ids: [
      "frontal-bone",
      "parietal-bone",
      "temporal-bone",
      "occipital-bone",
      "sphenoid-bone",
      "ethmoid",
      "maxilla",
      "mandible",
      "zygomatic-bone",
      "nasal-bone",
      "lacrimal",
      "inferior-nasal-concha",
      "palatine-bone",
      "vomer",
      "malleus",
      "incus",
      "stapes",
      "hyoid-bone",
    ],
  },
  {
    id: "default-columna-vertebralis",
    name: "Vertebral column",
    category: "bone",
    region: "Trunk",
    description:
      "Identify the cervical, thoracic and lumbar vertebrae, including atlas, axis, and the coccyx.",
    ids: ["atlas", "axis", "coccyx"],
    match: /vertebra$/,
  },
  {
    id: "default-thorax",
    name: "Ribs & sternum",
    category: "bone",
    region: "Trunk",
    description:
      "Study the twelve numbered ribs and the sternum, including its component parts.",
    ids: ["sternum", "manubrium", "body-of-sternum", "xiphoid-process"],
    match: /-rib$/,
  },
  {
    id: "muscles-shoulder",
    name: "Shoulder & arm muscles",
    category: "muscle",
    region: "Upper limb",
    featured: true,
    description:
      "A focused set of shoulder and arm muscles. Whole-muscle cards keep this first deck approachable.",
    ids: [
      "deltoid",
      "supraspinatus",
      "infraspinatus-muscle",
      "teres-minor",
      "subscapularis",
      "teres-major",
      "biceps-brachii",
      "triceps-brachii",
      "brachialis",
      "coracobrachialis",
      "anconeus",
    ],
  },
  {
    id: "muscles-forearm",
    name: "Forearm muscles",
    category: "muscle",
    region: "Upper limb",
    description:
      "Recognise the forearm muscles in the catalogue through image recall and multiple choice.",
    ids: [
      "brachioradialis",
      "pronator-quadratus",
      "supinator",
      "flexor-carpi-radialis",
      "flexor-carpi-ulnaris",
      "palmaris-longus",
      "flexor-digitorum-profundus",
      "flexor-pollicis-longus",
      "extensor-carpi-radialis-longus",
      "extensor-carpi-radialis-brevis",
      "extensor-digitorum",
      "extensor-digiti-minimi",
      "extensor-indicis",
      "extensor-pollicis-longus",
      "extensor-pollicis-brevis",
      "abductor-pollicis-longus",
    ],
  },
  {
    id: "muscles-hip-thigh",
    name: "Hip & thigh muscles",
    category: "muscle",
    region: "Lower limb",
    description:
      "Build recognition of the gluteal, thigh and deep hip muscles represented in the atlas.",
    ids: [
      "gluteus-maximus",
      "gluteus-medius",
      "gluteus-minimus",
      "tensor-fasciae-latae",
      "iliacus",
      "psoas-major",
      "sartorius",
      "rectus-femoris",
      "vastus-lateralis",
      "vastus-medialis",
      "vastus-intermedius",
      "biceps-femoris",
      "semitendinosus",
      "semimembranosus",
      "adductor-longus",
      "adductor-brevis",
      "adductor-magnus",
      "gracilis",
      "pectineus",
      "piriformis",
      "obturator-internus",
      "obturator-externus",
      "gemellus-superior",
      "gemellus-inferior",
      "quadratus-femoris",
    ],
  },
  {
    id: "muscles-leg",
    name: "Leg muscles",
    category: "muscle",
    region: "Lower limb",
    description: "A compact deck for the muscles between the knee and ankle.",
    ids: [
      "tibialis-anterior",
      "extensor-digitorum-longus",
      "extensor-hallucis-longus",
      "fibularis-tertius",
      "fibularis-longus",
      "fibularis-brevis",
      "gastrocnemius",
      "soleus",
      "plantaris",
      "popliteus",
      "tibialis-posterior",
      "flexor-digitorum-longus",
      "flexor-hallucis-longus",
    ],
  },
  {
    id: "muscles-neck",
    name: "Neck muscles",
    category: "muscle",
    region: "Head & neck",
    description:
      "Practise a selection of superficial, deep and hyoid-related neck muscles.",
    ids: [
      "sternocleidomastoid",
      "platysma",
      "scalenus-anterior",
      "scalenus-medius",
      "scalenus-posterior",
      "longus-capitis",
      "splenius-capitis",
      "mylohyoid",
      "geniohyoid",
      "stylohyoid",
      "sternohyoid",
      "sternothyroid",
      "thyrohyoid",
      "omohyoid",
    ],
  },
  {
    id: "muscles-thorax",
    name: "Thorax & shoulder girdle muscles",
    category: "muscle",
    region: "Trunk",
    description:
      "Recognise selected chest, back and shoulder girdle muscles, together with the diaphragm.",
    ids: [
      "pectoralis-major",
      "pectoralis-minor",
      "subclavius",
      "serratus-anterior",
      "trapezius",
      "rhomboid-major",
      "rhomboid-minor",
      "levator-scapulae",
      "diaphragm",
      "transversus-thoracis",
    ],
  },
  {
    id: "muscles-face",
    name: "Face & mastication",
    category: "muscle",
    region: "Head & neck",
    description:
      "Facial expression muscles and the muscles of mastication, including the parts of masseter, orbicularis oculi, and lateral pterygoid.",
    ids: [
      "frontalis",
      "occipitalis",
      "temporoparietalis",
      "orbicularis-oculi",
      "orbital-part-of-orbicularis-oculi",
      "palpebral-part-of-orbicularis-oculi",
      "corrugator-supercilii",
      "procerus",
      "nasalis",
      "levator-nasolabialis",
      "depressor-septi-nasi",
      "orbicularis-oris",
      "levator-labii-superioris",
      "levator-anguli-oris",
      "zygomaticus-major",
      "zygomaticus-minor",
      "risorius",
      "bucinator",
      "depressor-anguli-oris",
      "depressor-labii-inferioris",
      "mentalis",
      "temporalis",
      "masseter",
      "superficial-part-of-masseter",
      "deep-part-of-masseter",
      "medial-pterygoid",
      "lateral-pterygoid",
      "superior-head-of-lateral-pterygoid",
      "inferior-head-of-lateral-pterygoid",
    ],
  },
  {
    id: "all-bones",
    name: "All available bones",
    category: "bone",
    region: "Whole body",
    description:
      "The complete bone identification collection in this atlas. Regional decks are a gentler place to start.",
  },
  {
    id: "default-all-muscles",
    name: "All available muscles",
    category: "muscle",
    region: "Whole body",
    description:
      "The complete muscle collection, including individual heads and parts as well as whole muscles.",
  },
  {
    id: "ligaments-membranes",
    name: "Ligaments & membranes",
    category: "ligament",
    region: "Whole body",
    description:
      "Ligaments and membranes from the joint layer, including the limbs, spine, and skull.",
  },
  {
    id: "joints",
    name: "Joint structures",
    category: "joint",
    region: "Whole body",
    description:
      "Capsules, discs, menisci, and labra. Ligaments and membranes have their own deck.",
  },
];

export function curatedDecks(catalog: Catalog): CuratedDeck[] {
  return DEFINITIONS.map((definition) => {
    const explicit = new Set(definition.ids ?? []);
    const structures = catalog.structures.filter(
      (s) =>
        s.images.length &&
        s.category === definition.category &&
        ((!definition.ids && !definition.match) ||
          explicit.has(s.id) ||
          definition.match?.test(s.id)),
    );
    for (const id of explicit) {
      if (!structures.some((s) => s.id === id))
        throw new Error(
          `Deck ${definition.id} references a missing card: ${id}`,
        );
    }
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      region: definition.region,
      category: definition.category,
      featured: definition.featured,
      version: 1,
      createdAt: 0,
      updatedAt: 0,
      newPerDay: 20,
      items: structures.map((s) => ({
        structureId: s.id,
        label: (s.la[0] ?? s.en).replace(/\s*\[[^\]]*\]/g, ""),
      })),
    };
  });
}
