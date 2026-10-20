/** Reads a card aloud with the browser's speech synthesis. No account or network. */

let generation = 0;
let held: SpeechSynthesisUtterance[] = [];
let lastKey = "";
let lastAt = 0;
let warmed = false;

function supported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Voices load asynchronously. Warm them before the first card, and resume a paused engine. */
export function prepareVoices() {
  if (!supported() || warmed) return;
  warmed = true;
  const synth = window.speechSynthesis;
  const warm = () => {
    synth.getVoices();
    synth.resume();
  };
  warm();
  synth.addEventListener("voiceschanged", warm);
  window.addEventListener("pointerdown", warm, { once: true, capture: true });
}

function pick(voices: SpeechSynthesisVoice[], prefix: string) {
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  return matches.find((v) => v.localService) ?? matches[0];
}

type Line = { text: string; lang: string; voice?: SpeechSynthesisVoice };

function linesFor(
  latin: string,
  english: string,
  voices: SpeechSynthesisVoice[],
  plain: boolean,
): Line[] {
  const term = latin.replace(/\s*\[[^\]]*\]/g, "").trim();
  const gloss = english.trim();
  const lines: Line[] = [];
  if (!term) return lines;

  // Forcing it-IT before a voice exists leaves Chrome speaking with no sound.
  const fallback =
    voices.find((v) => v.default) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    voices[0];
  if (plain || !voices.length) {
    const lang = fallback?.lang ?? "en-US";
    lines.push({ text: term, lang, voice: fallback });
    if (gloss && gloss.toLowerCase() !== term.toLowerCase())
      lines.push({ text: gloss, lang, voice: fallback });
    return lines;
  }

  const latinVoice = pick(voices, "la") ?? pick(voices, "it") ?? fallback;
  const englishVoice = pick(voices, "en") ?? fallback;
  lines.push({
    text: term,
    lang: latinVoice?.lang ?? "en-US",
    voice: latinVoice,
  });
  if (gloss && gloss.toLowerCase() !== term.toLowerCase())
    lines.push({
      text: gloss,
      lang: englishVoice?.lang ?? "en-US",
      voice: englishVoice,
    });
  return lines;
}

/**
 * Speaks the Latin term, then the English name. Latin uses a Latin voice when
 * the browser has one, otherwise Italian. `force` replays even if this card
 * just started speaking.
 */
export function speakTerms(
  latin: string,
  english: string,
  onState: (speaking: boolean) => void,
  force = false,
) {
  if (!supported()) return;
  const synth = window.speechSynthesis;
  const key = `${latin}\n${english}`;
  // A second call from the effect must not cancel speech that a click just started.
  if (!force && key === lastKey && performance.now() - lastAt < 1000) return;
  lastKey = key;
  lastAt = performance.now();

  const mine = ++generation;
  if (synth.speaking || synth.pending) synth.cancel();
  held = [];

  let started = false;
  let retried = false;

  const speakAll = (plain: boolean) => {
    if (mine !== generation) return;
    const lines = linesFor(latin, english, synth.getVoices(), plain);
    if (!lines.length) return;
    let pending = lines.length;
    const done = () => {
      pending -= 1;
      if (pending <= 0 && mine === generation) onState(false);
    };
    synth.resume();
    for (const [index, line] of lines.entries()) {
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.lang = line.lang;
      if (line.voice) utterance.voice = line.voice;
      utterance.rate = 0.9;
      utterance.volume = 1;
      if (index === 0)
        utterance.onstart = () => {
          started = true;
          if (mine === generation) onState(true);
        };
      utterance.onend = done;
      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") return;
        // A second full reading is worse than a missed voice. Retry only if nothing started.
        if (!retried && !plain && !started && mine === generation) {
          retried = true;
          synth.cancel();
          speakAll(true);
          return;
        }
        done();
      };
      // Chrome drops the utterance if nothing keeps a reference to it.
      held.push(utterance);
      synth.speak(utterance);
    }
  };

  // Speak in this turn so a Listen click still counts as the user gesture.
  speakAll(false);

  if (!synth.getVoices().length) {
    synth.addEventListener(
      "voiceschanged",
      () => {
        if (mine !== generation || started || synth.speaking || synth.pending)
          return;
        if (!synth.getVoices().length) return;
        speakAll(false);
      },
      { once: true },
    );
  }

  // Chrome sometimes accepts the utterance and then never starts. Nudge it once.
  window.setTimeout(() => {
    if (mine !== generation || started) return;
    synth.pause();
    synth.resume();
  }, 400);
}

export function stopSpeaking() {
  generation += 1;
  lastKey = "";
  lastAt = 0;
  held = [];
  if (supported()) window.speechSynthesis.cancel();
}

export function canSpeak() {
  return supported();
}
