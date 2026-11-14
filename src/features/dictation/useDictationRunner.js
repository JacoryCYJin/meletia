import { computed, onUnmounted, ref, watch } from "vue";
import { definitionOf } from "../../core/content.js";
import { notify } from "../../core/notifications.js";
import {
  answerDictation,
  continueDictation,
  dictationFeedbackTarget,
  dictationSummary,
  dictationTarget,
  matchSpelling,
  replayDictation,
  skipDictation,
} from "../../core/session.js";
import {
  SPEECH_ACCENTS,
  newSpeechToken,
  speak,
  speechErrorMessage,
  stopSpeech,
} from "../../core/speech.js";

const isTyping = (event) =>
  Boolean(event.target?.closest?.("input,textarea,select,[contenteditable]"));

const AUTOPLAY_DELAY = 500;

export function useDictationRunner({
  session,
  cardOf,
  replayLimit,
  saveCorrect = async () => {},
  saveWrong = async () => {},
}) {
  const answer = ref("");
  const busy = ref(false);
  const correct = ref(false);
  const accent = ref(SPEECH_ACCENTS[0].id);
  const recorded = new Set();
  let token = "";
  let sequence = 0;
  let timer;
  let autoplayTimer;

  const dictation = computed(() => session.value?.dictation ?? null);
  const card = computed(() => {
    const id = dictationTarget(session.value);
    return id ? cardOf(id) : null;
  });
  const feedbackCard = computed(() => {
    const id = dictationFeedbackTarget(session.value);
    return id ? cardOf(id) : null;
  });
  const limit = computed(() => {
    const value = replayLimit?.value ?? replayLimit;
    return Number.isSafeInteger(value) && value >= 0 ? value : 2;
  });
  const replaysLeft = computed(() =>
    Math.max(0, limit.value - (dictation.value?.replays ?? 0)),
  );
  const summary = computed(() => {
    const result = dictationSummary(session.value);
    return {
      ...result,
      rows: result.missed
        .map((id) => {
          const item = cardOf(id);
          return item
            ? { id, term: item.term, meaning: definitionOf(item).trim() }
            : null;
        })
        .filter(Boolean),
    };
  });

  function cancelSpeech() {
    sequence += 1;
    const pending = token;
    token = "";
    if (pending) stopSpeech(pending);
  }

  async function play() {
    clearTimeout(autoplayTimer);
    const target = card.value;
    if (!target) return;
    cancelSpeech();
    const nextToken = newSpeechToken();
    token = nextToken;
    const current = sequence;
    try {
      const started = await speak(target.term, accent.value, nextToken);
      if (current !== sequence) {
        await stopSpeech(nextToken);
        return;
      }
      if (!started && token === nextToken) token = "";
    } catch (cause) {
      if (token === nextToken) token = "";
      if (current === sequence) notify.error(speechErrorMessage(cause));
    }
  }

  watch(
    () =>
      `${session.value?.phase ?? ""}:${session.value?.dictation?.index ?? ""}`,
    () => {
      clearTimeout(autoplayTimer);
      if (session.value?.phase !== "dictation") return;
      autoplayTimer = setTimeout(play, AUTOPLAY_DELAY);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    clearTimeout(timer);
    clearTimeout(autoplayTimer);
    cancelSpeech();
  });

  async function saveFirst(target, wrong) {
    if (!target || recorded.has(target.id)) return true;
    busy.value = true;
    try {
      await (wrong ? saveWrong(target) : saveCorrect(target));
      recorded.add(target.id);
      return true;
    } catch (cause) {
      notify.error(String(cause?.message ?? cause));
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function submit() {
    if (busy.value || correct.value || session.value?.phase !== "dictation") return;
    const target = card.value;
    if (!target || !answer.value.trim()) return;

    const isCorrect = matchSpelling(answer.value, target.term);
    clearTimeout(autoplayTimer);
    cancelSpeech();

    if (!isCorrect) {
      if (!(await saveFirst(target, true))) return;
      answer.value = "";
      session.value = answerDictation(session.value, false);
      return;
    }

    if (!(await saveFirst(target, false))) return;
    const next = answerDictation(session.value, true);
    answer.value = "";
    correct.value = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer = setTimeout(() => {
      correct.value = false;
      session.value = next;
    }, reduced ? 180 : 650);
  }

  async function replay() {
    if (busy.value || correct.value || session.value?.phase !== "dictation") return;
    const result = replayDictation(session.value, limit.value);
    if (result.allowed) {
      session.value = result.session;
      play();
      return;
    }

    const target = card.value;
    if (!(await saveFirst(target, true))) return;
    answer.value = "";
    session.value = answerDictation(session.value, false);
  }

  function changeAccent(id) {
    if (id === accent.value) return;
    accent.value = id;
    replay();
  }

  function continueFeedback() {
    if (busy.value) return;
    const next = continueDictation(session.value);
    if (next === session.value) return;
    session.value = next;
  }

  function skip() {
    const next = skipDictation(session.value);
    if (next === session.value) return;
    clearTimeout(timer);
    clearTimeout(autoplayTimer);
    correct.value = false;
    session.value = next;
  }

  function reset() {
    clearTimeout(timer);
    clearTimeout(autoplayTimer);
    recorded.clear();
    answer.value = "";
    correct.value = false;
    busy.value = false;
    cancelSpeech();
  }

  function handleKey(event) {
    if (event.defaultPrevented || event.isComposing) return false;
    const typing = isTyping(event);
    const onButton = Boolean(event.target?.closest?.("button"));
    const phase = session.value?.phase;

    if (phase === "dictation" && event.key === "Tab") {
      event.preventDefault();
      replay();
      return true;
    }

    if (correct.value) {
      if (!typing && !onButton && (event.key === "Enter" || event.code === "Space")) {
        event.preventDefault();
      }
      return false;
    }

    if (
      phase === "dictation-feedback" &&
      !typing &&
      !onButton &&
      (event.key === "Enter" || event.code === "Space")
    ) {
      event.preventDefault();
      continueFeedback();
      return true;
    }

    if (
      (phase === "dictation" || phase === "dictation-feedback") &&
      event.key === "Escape"
    ) {
      event.preventDefault();
      skip();
      return true;
    }

    if (phase === "dictation" && event.key === "Enter" && !typing && !onButton) {
      event.preventDefault();
      submit();
      return true;
    }

    return false;
  }

  return {
    answer,
    busy,
    correct,
    accent,
    card,
    feedbackCard,
    dictation,
    replaysLeft,
    summary,
    submit,
    replay,
    changeAccent,
    continueFeedback,
    skip,
    reset,
    handleKey,
  };
}
