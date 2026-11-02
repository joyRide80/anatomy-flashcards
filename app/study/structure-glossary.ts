import type { Structure } from "@/lib/flashcards/types";
import type { StudyLanguage } from "./language";

/**
 * App-owned, student-facing names for the line beneath the Latin answer.
 *
 * These are deliberately kept apart from Terminologia Anatomica: Latin remains
 * the answer being learned, while this file contains the plain-language aid a
 * learner sees in the chosen interface language.  Entries are keyed by the
 * stable catalogue ID so a change to an English source name cannot silently
 * change a translation.
 */
type LocalNames = { nb: string; da: string; aliases?: Partial<Record<"nb" | "da", string[]>> };

const names: Record<string, LocalNames> = {
  atlas: { nb: "første nakkevirvel", da: "første halshvirvel" },
  axis: { nb: "andre nakkevirvel", da: "anden halshvirvel" },
  "body-of-sternum": { nb: "brystbeinets kropp", da: "brystbenets krop" },
  calcaneus: { nb: "hælbein", da: "hælben" },
  capitate: { nb: "hodebein", da: "hovedben" },
  clavicle: { nb: "kragebein", da: "kraveben" },
  coccyx: { nb: "halebein", da: "haleben" },
  "cuboid-bone": { nb: "terningbein", da: "terningben" },
  ethmoid: { nb: "silbein", da: "siben" },
  femur: { nb: "lårbein", da: "lårben" },
  fibula: { nb: "leggbein", da: "lægben" },
  "frontal-bone": { nb: "pannebein", da: "pandeben" },
  hamate: { nb: "hakebein", da: "krogben" },
  "hip-bone": { nb: "hoftebein", da: "hofteben" },
  humerus: { nb: "overarmsbein", da: "overarmsben" },
  "hyoid-bone": { nb: "tungebein", da: "tungeben" },
  incus: { nb: "ambolt", da: "ambolt" },
  "inferior-nasal-concha": { nb: "nedre nesemusling", da: "nedre næsemusling" },
  "intermediate-cuneiform-bone": { nb: "mellomliggende kilebein", da: "mellemste kileben" },
  lacrimal: { nb: "tårebein", da: "tåreben" },
  "lateral-cuneiform-bone": { nb: "ytre kilebein", da: "laterale kileben" },
  lunate: { nb: "månebein", da: "måneben" },
  malleus: { nb: "hammer", da: "hammer" },
  mandible: { nb: "underkjeve", da: "underkæbe" },
  manubrium: { nb: "brystbeinets håndtak", da: "brystbenets håndtag" },
  maxilla: { nb: "overkjeve", da: "overkæbe" },
  "medial-cuneiform-bone": { nb: "indre kilebein", da: "mediale kileben" },
  "nasal-bone": { nb: "nesebein", da: "næseben" },
  "navicular-bone-of-foot": { nb: "båtbein i foten", da: "fodens bådben" },
  "occipital-bone": { nb: "bakbein", da: "nakkeben" },
  "palatine-bone": { nb: "ganebein", da: "ganeben" },
  "parietal-bone": { nb: "issebein", da: "isseben" },
  patella: { nb: "kneskål", da: "knæskal" },
  pisiform: { nb: "ertebein", da: "ærtben" },
  radius: { nb: "spolebein", da: "spoleben" },
  sacrum: { nb: "korsbein", da: "korsben" },
  scaphoid: { nb: "båtbein", da: "bådben" },
  scapula: { nb: "skulderblad", da: "skulderblad" },
  "sesamoid-bone-of-foot": { nb: "sesambein i foten", da: "sesamknogle i foden" },
  sphenoid: { nb: "kilebein", da: "kileben" },
  "sphenoid-bone": { nb: "kilebein", da: "kileben" },
  stapes: { nb: "stigbøyle", da: "stigbøjle" },
  sternum: { nb: "brystbein", da: "brystben" },
  talus: { nb: "rullebein", da: "rulleben" },
  "temporal-bone": { nb: "tinningbein", da: "tindingeben" },
  tibia: { nb: "skinnebein", da: "skinneben" },
  trapezium: { nb: "store mangekantbein", da: "store mangekantben" },
  trapezoid: { nb: "lille mangekantbein", da: "lille mangekantben" },
  triquetral: { nb: "trekantbein", da: "trekantben" },
  ulna: { nb: "albuebein", da: "albueben", aliases: { nb: ["ulna"], da: ["ulna"] } },
  vomer: { nb: "plogbein", da: "plovskærben" },
  "xiphoid-process": { nb: "sverdspiss", da: "sværdspids" },
  "zygomatic-bone": { nb: "kinnbein", da: "kindben" },

  // Common muscles in the ready-made learning decks.
  deltoid: { nb: "deltamuskel", da: "deltamuskel" },
  "biceps-brachii": { nb: "tohodet overarmsmuskel", da: "tohovedet overarmsmuskel" },
  "triceps-brachii": { nb: "trehodet overarmsmuskel", da: "trehovedet overarmsmuskel" },
  brachialis: { nb: "dyp overarmsmuskel", da: "dyb overarmsmuskel" },
  coracobrachialis: { nb: "ravnenebb-overarmsmuskel", da: "ravnenæb-overarmsmuskel" },
  anconeus: { nb: "albue muskel", da: "albue muskel" },
  supraspinatus: { nb: "øvre skulderbladsmuskel", da: "øvre skulderbladsmuskel" },
  "infraspinatus-muscle": { nb: "nedre skulderbladsmuskel", da: "nedre skulderbladsmuskel" },
  "teres-minor": { nb: "lille runde muskel", da: "lille runde muskel" },
  "teres-major": { nb: "store runde muskel", da: "store runde muskel" },
  subscapularis: { nb: "muskel under skulderbladet", da: "muskel under skulderbladet" },
  brachioradialis: { nb: "overarms-spolebeinsmuskel", da: "overarms-spolebensmuskel" },
  "pronator-quadratus": { nb: "firkantet innoverdreier", da: "firkantet indaddrejer" },
  supinator: { nb: "utoverdreier", da: "udadrejer" },
  "flexor-carpi-radialis": { nb: "spolebeinsidens håndleddsbøyer", da: "spolebenssidens håndledsbøjer" },
  "flexor-carpi-ulnaris": { nb: "albuebeinsidens håndleddsbøyer", da: "albuebenssidens håndledsbøjer" },
  "palmaris-longus": { nb: "lang håndflatemuskel", da: "lang håndflademuskel" },
  "flexor-digitorum-profundus": { nb: "dyp fingerbøyer", da: "dyb fingerbøjer" },
  "flexor-pollicis-longus": { nb: "lang tommelbøyer", da: "lang tommelbøjer" },
  "extensor-digitorum": { nb: "fingerstrekker", da: "fingerstrækker" },
  "extensor-indicis": { nb: "pekefingerstrekker", da: "pegefingerstrækker" },
  "extensor-pollicis-longus": { nb: "lang tommelstrekker", da: "lang tommelstrækker" },
  "extensor-pollicis-brevis": { nb: "kort tommelstrekker", da: "kort tommelstrækker" },
  "abductor-pollicis-longus": { nb: "lang tommelbortfører", da: "lang tommelbortfører" },
  "gluteus-maximus": { nb: "store setemuskel", da: "store sædemuskel" },
  "gluteus-medius": { nb: "mellomste setemuskel", da: "mellemste sædemuskel" },
  "gluteus-minimus": { nb: "lille setemuskel", da: "lille sædemuskel" },
  "tensor-fasciae-latae": { nb: "lårfasciens strammer", da: "lårfasciens strammer" },
  iliacus: { nb: "hoftebensmuskel", da: "hoftebensmuskel" },
  "psoas-major": { nb: "store lendemuskel", da: "store lændemuskel" },
  sartorius: { nb: "skreddermuskel", da: "skræddermuskel" },
  "rectus-femoris": { nb: "rett lårmuskel", da: "lige lårmuskel" },
  "vastus-lateralis": { nb: "ytre brede lårmuskel", da: "ydre brede lårmuskel" },
  "vastus-medialis": { nb: "indre brede lårmuskel", da: "indre brede lårmuskel" },
  "vastus-intermedius": { nb: "mellomliggende brede lårmuskel", da: "mellemste brede lårmuskel" },
  "biceps-femoris": { nb: "tohodet lårmuskel", da: "tohovedet lårmuskel" },
  semitendinosus: { nb: "halvsene-muskel", da: "halvsene-muskel" },
  semimembranosus: { nb: "halvhinnemuskel", da: "halvhindemuskel" },
  "adductor-longus": { nb: "lang innoverfører", da: "lang indadfører" },
  "adductor-brevis": { nb: "kort innoverfører", da: "kort indadfører" },
  "adductor-magnus": { nb: "stor innoverfører", da: "stor indadfører" },
  gracilis: { nb: "slank muskel", da: "slank muskel" },
  pectineus: { nb: "kam-muskel", da: "kam-muskel" },
  piriformis: { nb: "pæreformet muskel", da: "pæreformet muskel" },
  "obturator-internus": { nb: "indre lukketarmsmuskel", da: "indre lukkemuskel" },
  "obturator-externus": { nb: "ytre lukketarmsmuskel", da: "ydre lukkemuskel" },
  "quadratus-femoris": { nb: "firkantet lårmuskel", da: "firkantet lårmuskel" },
  "tibialis-anterior": { nb: "fremre skinnebensmuskel", da: "forreste skinnebensmuskel" },
  "tibialis-posterior": { nb: "bakre skinnebensmuskel", da: "bageste skinnebensmuskel" },
  "gastrocnemius": { nb: "tohodet leggmuskel", da: "tohovedet lægmuskel" },
  soleus: { nb: "kappemuskel", da: "kappemuskel" },
  plantaris: { nb: "plantarmuskel", da: "plantarmuskel" },
  popliteus: { nb: "knehase-muskel", da: "knæhasemuskel" },
  diaphragm: { nb: "mellomgulv", da: "mellemgulv" },
  "rectus-abdominis": { nb: "rett bukmuskel", da: "lige mavemuskel" },
  "transversus-abdominis": { nb: "tverrgående bukmuskel", da: "tværgående mavemuskel" },
  "external-oblique": { nb: "ytre skrå bukmuskel", da: "ydre skrå mavemuskel" },
  "internal-abdominal-oblique": { nb: "indre skrå bukmuskel", da: "indre skrå mavemuskel" },
  trapezius: { nb: "kappemuskel", da: "kappemuskel" },
  "latissimus-dorsi": { nb: "brede ryggmuskel", da: "brede rygmuskel" },
  "levator-scapulae": { nb: "skulderbladsløfter", da: "skulderbladsløfter" },
  "sternocleidomastoid": { nb: "brystbein-kragebein-brystvortemuskel", da: "brystben-kraveben-brystvortemuskel" },

  // Terms a learner often meets before their Latin form.
  "anterior-cruciate-ligament": { nb: "fremre korsbånd", da: "forreste korsbånd" },
  "posterior-cruciate-ligament": { nb: "bakre korsbånd", da: "bageste korsbånd" },
  "tibial-collateral-ligament": { nb: "indre sidebånd i kneet", da: "indre sideledbånd i knæet" },
  "fibular-collateral-ligament": { nb: "ytre sidebånd i kneet", da: "ydre sideledbånd i knæet" },
  "ligament-of-head-of-femur": { nb: "lårhodets leddbånd", da: "lårbenshovedets ledbånd" },
  "inguinal-ligament": { nb: "lyskebånd", da: "lyskebånd" },
  "nuchal-ligament": { nb: "nakkebånd", da: "nakkebånd" },
  "interosseous-membrane-of-forearm": { nb: "mellombeinsmembran i underarmen", da: "mellembensmembran i underarmen" },
  "interosseous-membrane-of-leg": { nb: "mellombeinsmembran i leggen", da: "mellembensmembran i underbenet" },
  "lateral-meniscus": { nb: "ytre menisk", da: "ydre menisk" },
  "medial-meniscus": { nb: "indre menisk", da: "indre menisk" },
  "pubic-symphysis": { nb: "skambensfuge", da: "skambensfuge" },
  "sacrococcygeal-symphysis": { nb: "korsbein-halebein-fuge", da: "korsben-haleben-fuge" },
  "glenoid-labrum": { nb: "leddlepp i skulderen", da: "ledlæbe i skulderen" },
  "acetabular-labrum": { nb: "leddlepp i hoften", da: "ledlæbe i hoften" },
};

const ordinal: Record<string, LocalNames> = {
  first: { nb: "første", da: "første" },
  second: { nb: "andre", da: "anden" },
  third: { nb: "tredje", da: "tredje" },
  fourth: { nb: "fjerde", da: "fjerde" },
  fifth: { nb: "femte", da: "femte" },
  sixth: { nb: "sjette", da: "sjette" },
  seventh: { nb: "sjuende", da: "syvende" },
  eighth: { nb: "åttende", da: "ottende" },
  ninth: { nb: "niende", da: "niende" },
  tenth: { nb: "tiende", da: "tiende" },
  eleventh: { nb: "ellevte", da: "ellevte" },
  twelfth: { nb: "tolvte", da: "tolvte" },
};

const finger: Record<string, LocalNames> = {
  thumb: { nb: "tommel", da: "tommelfinger" },
  "index finger": { nb: "pekefinger", da: "pegefinger" },
  "middle finger": { nb: "langfinger", da: "langefinger" },
  "ring finger": { nb: "ringfinger", da: "ringfinger" },
  "little finger": { nb: "lillefinger", da: "lillefinger" },
  "big toe": { nb: "stortå", da: "storetå" },
  "second toe": { nb: "andre tå", da: "anden tå" },
  "third toe": { nb: "tredje tå", da: "tredje tå" },
  "fourth toe": { nb: "fjerde tå", da: "fjerde tå" },
  "little toe": { nb: "lilletå", da: "lilletå" },
};

const phalanx: Record<string, LocalNames> = {
  proximal: { nb: "grunnfalang", da: "grundstykke" },
  middle: { nb: "mellomfalang", da: "mellemstykke" },
  distal: { nb: "ytterfalang", da: "yderstykke" },
};

function seriesName(english: string, language: "nb" | "da") {
  let match = /^(first|second|third|fourth|fifth) (metacarpal|metatarsal) bone$/.exec(english);
  if (match) {
    const number = ordinal[match[1]][language];
    const bone =
      match[2] === "metacarpal"
        ? language === "nb"
          ? "mellomhåndsbein"
          : "mellemhåndsben"
        : language === "nb"
          ? "mellomfotsbein"
          : "mellemfodsben";
    return `${number} ${bone}`;
  }
  match = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib$/.exec(english);
  if (match) return `${ordinal[match[1]][language]} ${language === "nb" ? "ribbein" : "ribben"}`;
  match = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) (cervical|thoracic|lumbar) vertebra$/.exec(english);
  if (match) {
    const region =
      match[2] === "cervical"
        ? language === "nb"
          ? "nakkevirvel"
          : "halshvirvel"
        : match[2] === "thoracic"
          ? language === "nb"
            ? "brystvirvel"
            : "brysthvirvel"
          : language === "nb"
            ? "lendevirvel"
            : "lændehvirvel";
    return `${ordinal[match[1]][language]} ${region}`;
  }
  match = /^(proximal|middle|distal) phalanx of (.+)$/.exec(english);
  if (match && finger[match[2]]) return `${phalanx[match[1]][language]} på ${finger[match[2]][language]}`;
  return null;
}

const wordMap: Record<"nb" | "da", Record<string, string>> = {
  nb: {
    "articular capsules": "leddkapsler",
    "articular capsule": "leddkapsel",
    "articular disc": "leddskive",
    "intervertebral disc": "mellomvirvelskive",
    "interphalangeal joints": "finger- og tåledd",
    "interphalangeal joint": "finger- eller tåledd",
    "acromioclavicular joint": "skuldertak-kragebeinsledd",
    "elbow joint": "albueledd",
    "hip joint": "hofteledd",
    "knee joint": "kneledd",
    "wrist joint": "håndledd",
    "ligaments": "leddbånd",
    ligament: "leddbånd",
    muscles: "muskler",
    muscle: "muskel",
    membrane: "membran",
    membranes: "membraner",
    joint: "ledd",
    joints: "ledd",
    capsule: "kapsel",
    capsules: "kapsler",
    disc: "skive",
    labrum: "leddleppe",
    symphysis: "fuge",
    meniscus: "menisk",
    menisci: "menisker",
    anterior: "fremre",
    posterior: "bakre",
    superior: "øvre",
    inferior: "nedre",
    medial: "indre",
    lateral: "ytre",
    dorsal: "bakre",
    palmar: "håndflate-",
    plantar: "fotsåle-",
    transverse: "tverrgående",
    oblique: "skrå",
    deep: "dyp",
    superficial: "overflatisk",
    external: "ytre",
    internal: "indre",
    "long head": "langt hode",
    "short head": "kort hode",
    abductor: "bortfører",
    adductor: "innoverfører",
    flexor: "bøyer",
    extensor: "strekker",
    levator: "løfter",
    depressor: "senker",
    constrictor: "sammentrekker",
    sphincter: "lukkemuskel",
    pronator: "innoverdreier",
    supinator: "utoverdreier",
    opponens: "motsetter",
    longus: "lang",
    brevis: "kort",
    major: "stor",
    minor: "liten",
    maximus: "størst",
    minimus: "minst",
    medius: "mellomste",
    lateralis: "ytre",
    medialis: "indre",
    intermedius: "mellomliggende",
    profundus: "dyp",
    superficialis: "overflatisk",
    transversus: "tverrgående",
    obliquus: "skrå",
    rectus: "rett",
    quadratus: "firkantet",
    teres: "rund",
    biceps: "tohodet",
    triceps: "trehodet",
    digiti: "finger",
    digitorum: "fingrenes",
    pollicis: "tommels",
    hallucis: "stortås",
    carpi: "håndleddets",
    radialis: "spolebeins-",
    ulnaris: "albuebeins-",
    femoris: "lår-",
    tibialis: "skinnebeins-",
    fibularis: "leggbeins-",
    capitis: "hode-",
    colli: "nakke-",
    thoracis: "brystkasse-",
    lumborum: "lende-",
    brachii: "overarms-",
    oculi: "øye-",
    oris: "munn-",
    nasi: "nese-",
    labii: "leppe-",
    linguae: "tunge-",
    hyoideus: "tungebeins-",
    "of foot": "i foten",
    "of hand": "i hånden",
    "of forearm": "i underarmen",
    "of leg": "i leggen",
    "of knee": "i kneet",
    "of radius": "på spolebeinet",
    "of femur": "på lårbeinet",
    "of rib": "på ribbeinet",
    "of wrist": "i håndleddet",
    "of head": "av hodet",
    "of": "av",
  },
  da: {
    "articular capsules": "ledkapsler",
    "articular capsule": "ledkapsel",
    "articular disc": "ledskive",
    "intervertebral disc": "mellemhvirvelskive",
    "interphalangeal joints": "finger- og tåled",
    "interphalangeal joint": "finger- eller tåled",
    "acromioclavicular joint": "skuldertag-kravebensled",
    "elbow joint": "albueled",
    "hip joint": "hofteled",
    "knee joint": "knæled",
    "wrist joint": "håndled",
    "ligaments": "ledbånd",
    ligament: "ledbånd",
    muscles: "muskler",
    muscle: "muskel",
    membrane: "membran",
    membranes: "membraner",
    joint: "led",
    joints: "led",
    capsule: "kapsel",
    capsules: "kapsler",
    disc: "skive",
    labrum: "ledlæbe",
    symphysis: "fuge",
    meniscus: "menisk",
    menisci: "menisker",
    anterior: "forreste",
    posterior: "bageste",
    superior: "øvre",
    inferior: "nedre",
    medial: "indre",
    lateral: "ydre",
    dorsal: "dorsal",
    palmar: "håndflade-",
    plantar: "fodsåle-",
    transverse: "tværgående",
    oblique: "skrå",
    deep: "dyb",
    superficial: "overfladisk",
    external: "ydre",
    internal: "indre",
    "long head": "langt hoved",
    "short head": "kort hoved",
    abductor: "bortfører",
    adductor: "indadfører",
    flexor: "bøjer",
    extensor: "strækker",
    levator: "løfter",
    depressor: "sænker",
    constrictor: "sammentrækker",
    sphincter: "lukkemuskel",
    pronator: "indaddrejer",
    supinator: "udadrejer",
    opponens: "modsætter",
    longus: "lang",
    brevis: "kort",
    major: "stor",
    minor: "lille",
    maximus: "størst",
    minimus: "mindst",
    medius: "mellemste",
    lateralis: "ydre",
    medialis: "indre",
    intermedius: "mellemste",
    profundus: "dyb",
    superficialis: "overfladisk",
    transversus: "tværgående",
    obliquus: "skrå",
    rectus: "lige",
    quadratus: "firkantet",
    teres: "rund",
    biceps: "tohovedet",
    triceps: "trehovedet",
    digiti: "finger",
    digitorum: "fingrenes",
    pollicis: "tommelens",
    hallucis: "storetås",
    carpi: "håndleddets",
    radialis: "spolebens-",
    ulnaris: "albuebens-",
    femoris: "lår-",
    tibialis: "skinnebens-",
    fibularis: "lægbenets-",
    capitis: "hoved-",
    colli: "hals-",
    thoracis: "brystkasse-",
    lumborum: "lænd-",
    brachii: "overarms-",
    oculi: "øje-",
    oris: "mund-",
    nasi: "næse-",
    labii: "læbe-",
    linguae: "tunge-",
    hyoideus: "tungebens-",
    "of foot": "i foden",
    "of hand": "i hånden",
    "of forearm": "i underarmen",
    "of leg": "i underbenet",
    "of knee": "i knæet",
    "of radius": "på spolebenet",
    "of femur": "på lårbenet",
    "of rib": "på ribbenet",
    "of wrist": "i håndleddet",
    "of head": "af hovedet",
    "of": "af",
  },
};

function replaceWords(english: string, language: "nb" | "da") {
  return Object.entries(wordMap[language])
    .sort(([a], [b]) => b.length - a.length)
    .reduce(
      (value, [from, to]) => value.replace(new RegExp(`\\b${from.replace(/ /g, "\\s+")}\\b`, "gi"), to),
      english,
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim();
}

function title(value: string) {
  return value ? `${value[0].toLocaleUpperCase()}${value.slice(1)}` : value;
}

/** The visible, local-language meaning beneath a Latin anatomical answer. */
export function structureName(structure: Structure, language: StudyLanguage) {
  if (language === "en") return title(structure.en);
  const manual = names[structure.id]?.[language];
  if (manual) return title(manual);
  return title(seriesName(structure.en, language) ?? replaceWords(structure.en, language));
}

/** Search should recognise the student-facing name as well as Latin and English. */
export function structureSearchTerms(structure: Structure, language: StudyLanguage) {
  const manual = language === "en" ? undefined : names[structure.id];
  return [
    structure.en,
    ...structure.la,
    structureName(structure, language),
    ...(language === "nb" || language === "da" ? manual?.aliases?.[language] ?? [] : []),
  ];
}
