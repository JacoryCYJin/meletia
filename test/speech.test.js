import assert from "node:assert/strict";
import test from "node:test";
import {
  SPEECH_ACCENTS,
  createSpeech,
  newSpeechToken,
  normalizeSpeechText,
  speechErrorMessage,
} from "../src/core/speech.js";

test("speech accents use exact BCP-47 language tags", () => {
  assert.deepEqual(
    SPEECH_ACCENTS.map(({ id, language }) => [id, language]),
    [
      ["uk", "en-GB"],
      ["us", "en-US"],
    ],
  );
});

test("speech text is trimmed and empty content is rejected before invoking", async () => {
  assert.equal(normalizeSpeechText("  contract  "), "contract");
  let called = false;
  const speech = createSpeech({
    isTauri: () => true,
    invoke: async () => {
      called = true;
    },
  });
  await assert.rejects(() => speech.speak("   ", "uk"), /没有可朗读/);
  assert.equal(called, false);
});

test("speak sends the request token, trimmed text and accent", async () => {
  const calls = [];
  const speech = createSpeech({
    isTauri: () => true,
    invoke: async (command, args) => {
      calls.push({ command, args });
      return true;
    },
  });
  assert.equal(await speech.speak("  contract  ", "uk", "token-1"), true);
  assert.deepEqual(calls, [
    {
      command: "speak_text",
      args: { token: "token-1", text: "contract", accent: "uk" },
    },
  ]);
});

test("speak reports superseded requests and native errors", async () => {
  const superseded = createSpeech({
    isTauri: () => true,
    invoke: async () => false,
  });
  assert.equal(await superseded.speak("contract", "us", "token-2"), false);
  const failed = createSpeech({
    isTauri: () => true,
    invoke: async () => {
      throw new Error("系统未安装英式语音（en-GB）。");
    },
  });
  await assert.rejects(
    () => failed.speak("contract", "uk", "token-3"),
    /系统未安装英式语音/,
  );
  assert.equal(speechErrorMessage(""), "发音播放失败，请重试。");
});

test("stop sends the token and ignores transport failures", async () => {
  const calls = [];
  const speech = createSpeech({
    isTauri: () => true,
    invoke: async (command, args) => {
      calls.push({ command, args });
      throw new Error("stale");
    },
  });
  await speech.stop("token-4");
  assert.deepEqual(calls, [
    { command: "stop_speech", args: { token: "token-4" } },
  ]);
});

test("non-desktop speech is rejected and stop is a no-op", async () => {
  let called = false;
  const speech = createSpeech({
    isTauri: () => false,
    invoke: async () => {
      called = true;
    },
  });
  await assert.rejects(() => speech.speak("contract", "uk"), /桌面版/);
  await speech.stop("token-5");
  assert.equal(called, false);
});

test("request tokens are unique across repeated plays", () => {
  assert.notEqual(newSpeechToken(), newSpeechToken());
});
