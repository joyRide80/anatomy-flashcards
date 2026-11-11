import type { Category } from "@/lib/flashcards/types";
import type { VertebralKind } from "@/lib/flashcards/vertebrae";

export type StudyLanguage = "en" | "nb" | "da";

export const STUDY_LANGUAGES: { value: StudyLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "nb", label: "Norsk bokmål" },
  { value: "da", label: "Dansk" },
];

type Copy = Record<string, string>;

const copy: Record<StudyLanguage, Copy> = {
  en: {
    language: "Language",
    decks: "Decks",
    backToDecks: "Back to decks",
    multipleChoice: "Multiple choice",
    savingReview: "Saving review…",
    sessionComplete: "Session complete",
    nothingDue: "Nothing is due right now.",
    addCards: "Add cards to this deck to begin.",
    newCard: "New card",
    whichStructure: "Which structure is highlighted?",
    chooseLatin: "Choose its Latin name.",
    vertebraQuestion: "What is the name of this bone?",
    correct: "Correct",
    notThis: "Not this one",
    next: "Next",
    nameStructure: "Name the highlighted structure.",
    sayLatin: "Say or write the Latin term, then check.",
    showAnswer: "Show answer",
    gotIt: "Got it",
    includes: "Includes",
    anatomyTerm: "Anatomical term",
    englishName: "English reference",
    structureName: "Structure name",
    discover: "Discover decks",
    myLearning: "My learning",
    searchDecks: "Search by deck or region",
    allAnatomy: "All anatomy",
    study: "Study",
    startDeck: "Start deck",
    studyDeck: "Study deck",
    previewCards: "Preview cards",
    hideCards: "Hide cards",
    readyToStudy: "Ready to study",
    cards: "cards",
    learnHighlighted: "Learn to name these highlighted structures:",
    libraryScope:
      "Bones, muscles, ligaments, and the other joint structures in this atlas. Each deck teaches visual identification and anatomical names.",
    practicePrepared: "Your anatomy practice, prepared.",
    pickDeck: "Pick a deck.",
    learnBody: "Learn the body.",
    todayPractice: "A little, every day",
    nextSession: "Your next session",
    continueStudying: "Continue studying",
    deckLibrary: "Deck library",
    anatomyCategories: "Anatomy categories",
    explore3d: "Explore in 3D",
    views: "Views",
    goodPlaceToStart: "Good place to start",
    primaryNavigation: "Primary navigation",
    flashcards: "Flashcards",
    explore: "Explore",
    progress: "Progress",
  },
  nb: {
    language: "Språk",
    decks: "Kortstokker",
    backToDecks: "Tilbake til kortstokkene",
    multipleChoice: "Flervalg",
    savingReview: "Lagrer repetisjon…",
    sessionComplete: "Økten er fullført",
    nothingDue: "Ingen kort skal repeteres akkurat nå.",
    addCards: "Legg til kort i denne kortstokken for å begynne.",
    newCard: "Nytt kort",
    whichStructure: "Hvilken struktur er markert?",
    chooseLatin: "Velg det latinske navnet.",
    vertebraQuestion: "Hva heter denne knokkelen?",
    correct: "Riktig",
    notThis: "Ikke denne",
    next: "Neste",
    nameStructure: "Navngi den markerte strukturen.",
    sayLatin: "Si eller skriv det latinske navnet, og sjekk deretter.",
    showAnswer: "Vis svaret",
    gotIt: "Jeg kan det",
    includes: "Inkluderer",
    anatomyTerm: "Anatomisk term",
    englishName: "Engelsk referanse",
    structureName: "Norsk navn",
    discover: "Utforsk kortstokker",
    myLearning: "Min læring",
    searchDecks: "Søk etter kortstokk eller område",
    allAnatomy: "All anatomi",
    study: "Øv",
    startDeck: "Start kortstokk",
    studyDeck: "Øv på kortstokk",
    previewCards: "Forhåndsvis kort",
    hideCards: "Skjul kort",
    readyToStudy: "Klar til øving",
    cards: "kort",
    learnHighlighted: "Lær navnene på disse markerte strukturene:",
    libraryScope:
      "Knogler, muskler, leddbånd og andre leddstrukturer i dette atlaset. Hver kortstokk trener visuell identifikasjon og anatomiske navn.",
    practicePrepared: "Anatomiøvelsen din, klar.",
    pickDeck: "Velg en kortstokk.",
    learnBody: "Lær kroppen.",
    todayPractice: "Litt hver dag",
    nextSession: "Din neste økt",
    continueStudying: "Fortsett å øve",
    deckLibrary: "Kortstokkbibliotek",
    anatomyCategories: "Anatomikategorier",
    explore3d: "Utforsk i 3D",
    views: "Visninger",
    goodPlaceToStart: "Godt sted å starte",
    primaryNavigation: "Hovednavigasjon",
    flashcards: "Kort",
    explore: "Utforsk",
    progress: "Fremgang",
  },
  da: {
    language: "Sprog",
    decks: "Kortbunker",
    backToDecks: "Tilbage til kortbunkerne",
    multipleChoice: "Multiple choice",
    savingReview: "Gemmer repetition…",
    sessionComplete: "Sessionen er afsluttet",
    nothingDue: "Der er ingen kort til repetition lige nu.",
    addCards: "Tilføj kort til denne kortbunke for at begynde.",
    newCard: "Nyt kort",
    whichStructure: "Hvilken struktur er fremhævet?",
    chooseLatin: "Vælg det latinske navn.",
    vertebraQuestion: "Hvad hedder denne knogle?",
    correct: "Korrekt",
    notThis: "Ikke denne",
    next: "Næste",
    nameStructure: "Navngiv den fremhævede struktur.",
    sayLatin: "Sig eller skriv det latinske navn, og tjek derefter.",
    showAnswer: "Vis svar",
    gotIt: "Jeg kan det",
    includes: "Omfatter",
    anatomyTerm: "Anatomisk term",
    englishName: "Engelsk reference",
    structureName: "Dansk navn",
    discover: "Udforsk kortbunker",
    myLearning: "Min læring",
    searchDecks: "Søg efter kortbunke eller område",
    allAnatomy: "Al anatomi",
    study: "Øv",
    startDeck: "Start kortbunke",
    studyDeck: "Øv kortbunke",
    previewCards: "Vis kort",
    hideCards: "Skjul kort",
    readyToStudy: "Klar til øvelse",
    cards: "kort",
    learnHighlighted: "Lær navnene på disse fremhævede strukturer:",
    libraryScope:
      "Knogler, muskler, ledbånd og andre ledstrukturer i dette atlas. Hver kortbunke træner visuel identifikation og anatomiske navne.",
    practicePrepared: "Din anatomiøvelse er klar.",
    pickDeck: "Vælg en kortbunke.",
    learnBody: "Lær kroppen.",
    todayPractice: "Lidt hver dag",
    nextSession: "Din næste session",
    continueStudying: "Fortsæt med at øve",
    deckLibrary: "Kortbunke-bibliotek",
    anatomyCategories: "Anatomikategorier",
    explore3d: "Udforsk i 3D",
    views: "Visninger",
    goodPlaceToStart: "Godt sted at starte",
    primaryNavigation: "Hovednavigation",
    flashcards: "Kort",
    explore: "Udforsk",
    progress: "Fremskridt",
  },
};

export function t(language: StudyLanguage, key: string) {
  return copy[language][key] ?? copy.en[key] ?? key;
}

const vertebralNames: Record<StudyLanguage, Record<VertebralKind, string>> = {
  en: { atlas: "Atlas", axis: "Axis", cervical: "Cervical vertebra", thoracic: "Thoracic vertebra", lumbar: "Lumbar vertebra" },
  nb: { atlas: "Atlas", axis: "Axis", cervical: "Nakkevirvel", thoracic: "Brystvirvel", lumbar: "Lendevirvel" },
  da: { atlas: "Atlas", axis: "Axis", cervical: "Halshvirvel", thoracic: "Brysthvirvel", lumbar: "Lændehvirvel" },
};

export function vertebralBoneName(language: StudyLanguage, kind: VertebralKind) {
  return vertebralNames[language][kind];
}

const categories: Record<StudyLanguage, Record<Category, string>> = {
  en: { bone: "Bone", muscle: "Muscle", ligament: "Ligament", joint: "Joint", artery: "Artery" },
  nb: { bone: "Knokkel", muscle: "Muskel", ligament: "Leddbånd", joint: "Ledd", artery: "Arterie" },
  da: { bone: "Knogel", muscle: "Muskel", ligament: "Ledbånd", joint: "Led", artery: "Arterie" },
};

export function categoryLabel(language: StudyLanguage, category: Category) {
  return categories[language][category];
}

const deckNames: Partial<Record<StudyLanguage, Record<string, string>>> = {
  nb: {
    "bones-upper-limb": "Knogler i overekstremiteten",
    "bones-lower-limb": "Knogler i underekstremiteten",
    "bones-hand": "Håndens knokler",
    "bones-foot": "Fotens knokler",
    "bones-skull": "Hodeskalle og tungeben",
    "default-columna-vertebralis": "Ryggsøylen",
    "default-thorax": "Ribbein og brystbein",
    "muscles-shoulder": "Muskler i skulder og arm",
    "muscles-forearm": "Underarmens muskler",
    "muscles-hip-thigh": "Muskler i hofte og lår",
    "muscles-leg": "Leggens muskler",
    "muscles-neck": "Nakkens muskler",
    "muscles-thorax": "Muskler i brystkasse og skulderbue",
    "muscles-face": "Ansikts- og tyggemuskler",
    "all-bones": "Alle tilgjengelige knokler",
    "default-all-muscles": "Alle tilgjengelige muskler",
    "ligaments-membranes": "Leddbånd og membraner",
    joints: "Leddstrukturer",
  },
  da: {
    "bones-upper-limb": "Knogler i overekstremiteten",
    "bones-lower-limb": "Knogler i underekstremiteten",
    "bones-hand": "Håndens knogler",
    "bones-foot": "Fodens knogler",
    "bones-skull": "Kranium og tungeben",
    "default-columna-vertebralis": "Rygsøjlen",
    "default-thorax": "Ribben og brystben",
    "muscles-shoulder": "Muskler i skulder og arm",
    "muscles-forearm": "Underarmens muskler",
    "muscles-hip-thigh": "Muskler i hofte og lår",
    "muscles-leg": "Underbenets muskler",
    "muscles-neck": "Nakkens muskler",
    "muscles-thorax": "Muskler i brystkasse og skulderbælte",
    "muscles-face": "Ansigts- og tyggemuskler",
    "all-bones": "Alle tilgængelige knogler",
    "default-all-muscles": "Alle tilgængelige muskler",
    "ligaments-membranes": "Ledbånd og membraner",
    joints: "Ledstrukturer",
  },
};

const regions: Partial<Record<StudyLanguage, Record<string, string>>> = {
  nb: {
    "Upper limb": "Overekstremitet",
    "Lower limb": "Underekstremitet",
    "Head & neck": "Hode og hals",
    Trunk: "Kropp",
    "Whole body": "Hele kroppen",
  },
  da: {
    "Upper limb": "Overekstremitet",
    "Lower limb": "Underekstremitet",
    "Head & neck": "Hoved og hals",
    Trunk: "Krop",
    "Whole body": "Hele kroppen",
  },
};

export function deckName(language: StudyLanguage, id: string, fallback: string) {
  return deckNames[language]?.[id] ?? fallback;
}

export function regionName(language: StudyLanguage, region: string) {
  return regions[language]?.[region] ?? region;
}

const viewNames: Record<StudyLanguage, Record<string, string>> = {
  en: {
    anterior: "Anterior",
    posterior: "Posterior",
    superior: "Superior",
    inferior: "Inferior",
    "left anterolateral": "Left anterolateral",
    "left lateral": "Left lateral",
    "left posterolateral": "Left posterolateral",
    "right anterolateral": "Right anterolateral",
    "right lateral": "Right lateral",
    "right posterolateral": "Right posterolateral",
  },
  nb: {
    anterior: "Forfra",
    posterior: "Bakfra",
    superior: "Ovenfra",
    inferior: "Nedenfra",
    "left anterolateral": "Venstre skrått forfra",
    "left lateral": "Venstre side",
    "left posterolateral": "Venstre skrått bakfra",
    "right anterolateral": "Høyre skrått forfra",
    "right lateral": "Høyre side",
    "right posterolateral": "Høyre skrått bakfra",
  },
  da: {
    anterior: "Forfra",
    posterior: "Bagfra",
    superior: "Ovenfra",
    inferior: "Nedefra",
    "left anterolateral": "Venstre skråt forfra",
    "left lateral": "Venstre side",
    "left posterolateral": "Venstre skråt bagfra",
    "right anterolateral": "Højre skråt forfra",
    "right lateral": "Højre side",
    "right posterolateral": "Højre skråt bagfra",
  },
};

export function viewName(language: StudyLanguage, view: string) {
  return viewNames[language][view] ?? view;
}

export function cardCount(language: StudyLanguage, count: number) {
  if (language === "nb" || language === "da") return `${count} kort`;
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

export function introducedCount(language: StudyLanguage, count: number) {
  if (language === "nb") return `${count} introdusert`;
  if (language === "da") return `${count} introduceret`;
  return `${count} introduced`;
}

export function practiceCount(language: StudyLanguage, count: number) {
  if (language === "nb") return `${count} til øving`;
  if (language === "da") return `${count} til øvelse`;
  return `${count} to practise`;
}
