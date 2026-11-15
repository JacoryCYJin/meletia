import { invoke, isTauri } from "@tauri-apps/api/core";

export const SPEECH_ACCENTS = [
  { id: "uk", label: "英式", language: "en-GB" },
  { id: "us", label: "美式", language: "en-US" },
];

let speechTokenSequence = 0;
const speechTokenPrefix =
  globalThis.crypto?.randomUUID?.() ?? `speech-${Date.now()}`;

export function newSpeechToken() {
  speechTokenSequence += 1;
  return `${speechTokenPrefix}-${speechTokenSequence}`;
}

export function normalizeSpeechText(text) {
  return String(text ?? "").trim();
}

export function speechAccent(id) {
  return SPEECH_ACCENTS.find((accent) => accent.id === id) ?? null;
}

export function speechErrorMessage(cause) {
  const detail = typeof cause === "string" ? cause : cause?.message;
  return String(detail ?? "").trim() || "发音播放失败，请重试。";
}

export function createSpeech({
  invoke: run = invoke,
  isTauri: isDesktop = isTauri,
  createToken = newSpeechToken,
} = {}) {
  async function speak(text, accent, token = createToken()) {
    const value = normalizeSpeechText(text);
    if (!value) throw new Error("没有可朗读的内容。");
    if (!speechAccent(accent)) throw new Error("未知的发音类型。");
    if (!isDesktop()) throw new Error("发音仅在 Meletia 桌面版可用。");
    try {
      return (await run("speak_text", { token, text: value, accent })) === true;
    } catch (cause) {
      throw new Error(speechErrorMessage(cause));
    }
  }

  async function stop(token) {
    if (!token || !isDesktop()) return;
    try {
      await run("stop_speech", { token });
    } catch {
      // A stale stop must never surface as a playback failure.
    }
  }

  return { speak, stop };
}

export const speech = createSpeech();
export const speak = (...args) => speech.speak(...args);
export const stopSpeech = (token) => speech.stop(token);
