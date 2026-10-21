/** Reads a card aloud with the browser's speech synthesis. No account or network. */

let generation = 0;
let held: SpeechSynthesisUtterance[] = [];
let lastKey = "";
let lastAt = 0;
let warmed = false;
let unlocked = false;
let keepAlive = 0;

function supported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function isPhone() {
  return (
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  );
}

function isAppleTouch() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function langOf(voice: SpeechSynthesisVoice) {
  return voice.lang.toLowerCase().replace(/_/g, "-");
}

function pick(voices: SpeechSynthesisVoice[], prefix: string) {
  const matches = voices.filter((v) => langOf(v).startsWith(prefix));
  return (
    matches.find((v) => v.localService && v.default) ??
    matches.find((v) => v.localService) ??
    matches[0]
  );
}

function fallbackVoice(voices: SpeechSynthesisVoice[]) {
  // iOS marks every voice as default, so the first `default` may be Arabic or
  // Chinese and then refuse to speak Latin or English (silence, no error).
  return (
    voices.find((v) => langOf(v).startsWith("en") && v.localService) ??
    voices.find((v) => langOf(v).startsWith("en")) ??
    voices.find((v) => v.default) ??
    voices[0]
  );
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

  // Forcing it-IT before a working voice exists leaves Chrome speaking with no
  // sound. Phones list Italian voices that are not downloaded, same result.
  const fallback = fallbackVoice(voices);
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

function unlockAudio() {
  if (!supported() || unlocked) return;
  unlocked = true;
  const synth = window.speechSynthesis;
  synth.getVoices();
  synth.resume();
  try {
    const AudioCtx =
      window.AudioContext ||
      (
        window as Window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* Unlocking the audio session is best-effort. */
  }
}

/** iOS pauses speechSynthesis after ~15s idle. Keep the engine awake. */
function stayAwake() {
  if (keepAlive || !isAppleTouch() || !supported()) return;
  keepAlive = window.setInterval(() => {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
    synth.pause();
    synth.resume();
  }, 8000);
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
  stayAwake();
  synth.addEventListener("voiceschanged", warm);
  window.addEventListener("pointerdown", unlockAudio, { capture: true });
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
  unlockAudio();

  let started = false;
  let retried = false;
  const phone = isPhone() || isAppleTouch();

  const speakAll = (plain: boolean) => {
    if (mine !== generation) return;
    const lines = linesFor(latin, english, synth.getVoices(), plain);
    if (!lines.length) return;

    const speakAt = (index: number) => {
      if (mine !== generation) return;
      const line = lines[index];
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.lang = line.lang;
      if (line.voice) utterance.voice = line.voice;
      utterance.rate = 0.9;
      utterance.volume = 1;
      utterance.onstart = () => {
        started = true;
        if (mine === generation) onState(true);
      };
      utterance.onend = () => {
        if (mine !== generation) return;
        if (index + 1 < lines.length) speakAt(index + 1);
        else onState(false);
      };
      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") return;
        // A second full reading is worse than a missed voice. Retry only if nothing started.
        if (!retried && !plain && !started && mine === generation) {
          retried = true;
          synth.cancel();
          speakAll(true);
          return;
        }
        if (index + 1 < lines.length) speakAt(index + 1);
        else if (mine === generation) onState(false);
      };
      // Chrome drops the utterance if nothing keeps a reference to it.
      held.push(utterance);
      synth.resume();
      synth.speak(utterance);
    };

    speakAt(0);
  };

  // Phones list Italian voices that are not installed. Speaking with those is
  // silent. Use the system English voice, which is always present.
  // Speak in this turn so a Listen click still counts as the user gesture.
  speakAll(phone);

  if (!synth.getVoices().length) {
    synth.addEventListener(
      "voiceschanged",
      () => {
        if (mine !== generation || started || synth.speaking || synth.pending)
          return;
        if (!synth.getVoices().length) return;
        speakAll(phone);
      },
      { once: true },
    );
  }

  if (!phone) {
    // Chrome desktop sometimes accepts the utterance and then never starts.
    window.setTimeout(() => {
      if (mine !== generation || started) return;
      synth.pause();
      synth.resume();
    }, 400);
  }

  window.setTimeout(
    () => {
      if (mine !== generation || started || retried) return;
      retried = true;
      synth.cancel();
      speakAll(true);
    },
    phone ? 800 : 1400,
  );
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
