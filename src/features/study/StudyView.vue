<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from "vue";
import Icon from "../../shared/Icon.vue";
import QuestionStage from "./components/QuestionStage.vue";
import SpellingReadyStage from "./components/SpellingReadyStage.vue";
import SpellingStage from "./components/SpellingStage.vue";
import StudySummary from "./StudySummary.vue";
import { definitionOf } from "../library/model.js";
import { meaningChoices } from "./choices.js";
import {
  answerQuestion,
  continueQuestion,
  currentEntry,
  matchSpelling,
  progressOf,
  showAnswerDetail,
  skipSpelling,
  skipWord,
  spell,
  spellTarget,
  startSpelling,
} from "./session.js";
import { saveStudyAttempt } from "./actions.js";
import { cardById, setError, state } from "../../storage/store.js";
import { useStudySession } from "./useStudySession.js";

const props = defineProps({
  mode: { type: String, required: true },
  extraNew: Boolean,
});
const emit = defineEmits(["close"]);

const yes = { value: 3, label: "认识", key: "Q" };
const learningGrades = [yes, { value: 1, label: "不认识", key: "E" }];
const reviewGrades = [
  yes,
  { value: 2, label: "模糊", key: "2" },
  { value: 1, label: "忘记了", key: "E" },
];
const roundLabels = {
  choice: "选释义",
  recall: "无提示回想词义",
  recognition: "回想词义",
  reverse: "看中文回想英文",
};

const restoredChoices = shallowRef(null);
const answer = ref("");
const feedback = ref("");
const selectedChoice = ref(null);
const openedChoices = ref(new Set());
const correctFeedback = ref(false);
const busy = ref(false);
const stage = ref(null);
const spellingInput = ref(null);
const spellingReadyStage = ref(null);
let summaryTimer;
let feedbackTimer;
let correctFeedbackTimer;

const entry = computed(() => currentEntry(session.value));
const card = computed(() => (entry.value ? cardById(entry.value.id) : null));
const round = computed(() => entry.value?.round);
const meaning = computed(() =>
  card.value ? definitionOf(card.value).trim() : "",
);
const choices = computed(
  () =>
    restoredChoices.value ??
    (entry.value?.round === "choice" && card.value
      ? meaningChoices(card.value, state.cards).map((choice) => {
          const match = choice.text.match(/^([a-z]+\.)\s+([\s\S]+)$/i);
          return {
            ...choice,
            pos: match?.[1],
            meaning: match?.[2] ?? choice.text,
          };
        })
      : []),
);
const showMeaning = computed(
  () =>
    props.mode === "learn" &&
    round.value === "choice" &&
    meaning.value &&
    !choices.value.length,
);
const grades = computed(() =>
  props.mode === "review" && round.value !== "choice"
    ? reviewGrades
    : learningGrades,
);
const progress = computed(() =>
  session.value ? progressOf(session.value) : { done: 0, total: 0 },
);
const percent = computed(() => {
  const { done, total } = progress.value;
  return total ? Math.round((done / total) * 100) : 0;
});
const spellingCard = computed(() =>
  session.value ? cardById(spellTarget(session.value)) : null,
);
const choiceFeedback = computed(
  () => session.value?.phase === "choice-feedback",
);
const learningChoice = computed(
  () => props.mode === "learn" && round.value === "choice",
);
const unaidedRecall = computed(
  () => round.value === "recall" && session.value?.phase === "card",
);
const canMarkWrong = computed(
  () =>
    props.mode === "learn" &&
    round.value === "recall" &&
    session.value?.phase === "detail" &&
    session.value?.rating === 3,
);
const {
  session,
  previous,
  summaryNow,
  showPrevious,
  summary,
  buildSession,
  persistPosition,
  moveWithCheckpoint,
  advance,
  goBack,
  continueFromSummary,
} = useStudySession({
  mode: props.mode,
  extraNew: props.extraNew,
  busy,
  moveTo,
  restoredChoices,
  selectedChoice,
  getCard: () => card.value,
  getEntry: () => entry.value,
  getChoices: () => choices.value,
  onClose: () => emit("close"),
  resetTransient,
});

function focusStage(resetScroll = false) {
  nextTick(() => {
    if (resetScroll)
      stage.value?.querySelector(".stage-content")?.scrollTo(0, 0);
    if (session.value?.phase === "spell") spellingInput.value?.focus();
    else if (session.value?.phase === "spelling-ready")
      spellingReadyStage.value?.focus();
    else stage.value?.focus();
  });
}

onMounted(() => {
  buildSession();
  window.addEventListener("keydown", onKey);
  focusStage();
  summaryTimer = setInterval(() => {
    if (session.value?.phase === "finished") summaryNow.value = new Date();
  }, 30000);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  clearTimeout(feedbackTimer);
  clearTimeout(correctFeedbackTimer);
  clearInterval(summaryTimer);
});

function resetTransient() {
  answer.value = "";
  feedback.value = "";
  correctFeedback.value = false;
  clearTimeout(feedbackTimer);
  clearTimeout(correctFeedbackTimer);
}

function moveTo(next) {
  session.value = next;
  summaryNow.value = new Date();
  selectedChoice.value = null;
  openedChoices.value = new Set();
  restoredChoices.value = null;
  focusStage(true);
}

async function grade(value, choice = null) {
  if (
    busy.value ||
    correctFeedback.value ||
    session.value.phase !== "card" ||
    !meaning.value
  )
    return;
  const next = answerQuestion(session.value, value, {
    selectedOption: Boolean(choice),
  });
  const position = showMeaning.value ? continueQuestion(next) : next;
  if (position.done.length > session.value.done.length) return advance(position, value);
  // Updating the card's export status must not regenerate the current choices.
  restoredChoices.value = choices.value;
  const details = next.phase === "choice-feedback"
    ? { choices: choices.value, selectedChoice: choice.text } : {};
  busy.value = true;
  try {
    await saveStudyAttempt(card.value.id, value, new Date(),
      props.mode === "learn" ? { session: position, ...details } : undefined);
  } catch (cause) {
    setError(cause);
    return;
  } finally {
    busy.value = false;
  }
  if (showMeaning.value) return advance(position, value, true);
  if (learningChoice.value && choice?.correct) {
    selectedChoice.value = choice.text;
    correctFeedback.value = true;
    focusStage();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    correctFeedbackTimer = setTimeout(
      () => {
        correctFeedback.value = false;
        session.value = next;
        focusStage(true);
      },
      reducedMotion ? 180 : 650,
    );
    return;
  }
  if (next.phase === "detail" || next.phase === "choice-feedback") {
    session.value = next;
    selectedChoice.value = choice?.text ?? null;
    focusStage(next.phase === "detail");
    return;
  }
  return advance(next, value, true);
}

function chooseOption(choice) {
  if (choiceFeedback.value) {
    if (openedChoices.value.has(choice.text))
      openedChoices.value.delete(choice.text);
    else openedChoices.value.add(choice.text);
    return;
  }
  grade(choice.correct ? 3 : 1, choice);
}

async function openDetail() {
  if (busy.value) return;
  const next = showAnswerDetail(session.value);
  if (!(await persistPosition(next))) return;
  session.value = next;
  focusStage(true);
}

function next() {
  if (busy.value || session.value.phase !== "detail") return;
  return advance(continueQuestion(session.value), session.value.rating);
}

async function markWrong() {
  if (busy.value || !canMarkWrong.value) return;
  return advance(continueQuestion({ ...session.value, rating: 1 }), 1);
}

async function submitSpelling() {
  const target = spellingCard.value;
  if (!target || busy.value || !answer.value.trim()) return;
  const correct = matchSpelling(answer.value, target.term);
  const next = spell(session.value, correct);

  busy.value = true;
  try {
    if (!correct) {
      await saveStudyResult(
        target,
        "spell",
        1,
        new Date(),
        props.mode === "learn" ? { session: next } : undefined,
      );
      feedback.value = "拼写不对，稍后再试。";
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        feedback.value = "";
      }, 2400);
    } else {
      await saveStudyAttempt(target.id, 3, new Date(),
        props.mode === "learn" ? { session: next } : undefined, true);
      feedback.value = "";
    }

    answer.value = "";
    moveTo(next);
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

async function skip() {
  if (busy.value) return;
  const next = skipSpelling(session.value);
  if (next === session.value) return;
  if (props.mode === "learn" && !(await persistPosition(next))) return;
  moveTo(next);
}

function requestEnd() {
  if (busy.value) return;
  if (["spelling-ready", "spell"].includes(session.value?.phase)) return skip();
  emit("close");
}

function onKey(event) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.repeat ||
    busy.value
  )
    return;
  const typing = event.target?.closest?.(
    "input,textarea,select,[contenteditable]",
  );
  const onButton = event.target?.closest?.("button");
  const phase = session.value?.phase;
  const confirm = event.key === "Enter" || event.code === "Space";

  if (correctFeedback.value) {
    if (confirm && !onButton && !typing) event.preventDefault();
    return;
  }

  if (
    choiceFeedback.value &&
    !typing &&
    (event.code === "Space" || (confirm && !onButton))
  ) {
    event.preventDefault();
    openDetail();
    return;
  }

  if (phase === "card" && !typing) {
    if (showMeaning.value) {
      if (confirm && !onButton) {
        event.preventDefault();
        grade(3);
      }
      return;
    }
    if (
      props.mode === "learn" &&
      choices.value.length &&
      event.code === "Space"
    ) {
      event.preventDefault();
      grade(1);
      return;
    }
    if (!meaning.value) return;
    if (choices.value.length) {
      if (!/^[1-4]$/.test(event.key)) return;
      const choice = choices.value[Number(event.key) - 1];
      if (!choice) return;
      event.preventDefault();
      grade(choice.correct ? 3 : 1, choice);
    } else {
      const item = grades.value.find(
        ({ key }) => key.toLowerCase() === event.key.toLowerCase(),
      );
      if (!item) return;
      event.preventDefault();
      grade(item.value);
    }
    return;
  }

  if (
    (phase === "spelling-ready" || phase === "spell") &&
    event.key === "Escape"
  ) {
    event.preventDefault();
    skip();
    return;
  }

  if (
    phase === "detail" &&
    canMarkWrong.value &&
    event.key.toLowerCase() === "e"
  ) {
    event.preventDefault();
    markWrong();
    return;
  }

  if (!confirm || typing || onButton) return;
  if (phase === "detail") {
    event.preventDefault();
    next();
  } else if (phase === "spelling-ready") {
    event.preventDefault();
    moveWithCheckpoint(startSpelling(session.value));
  } else if (phase === "finished" && event.key === "Enter") {
    event.preventDefault();
    continueFromSummary();
  }
}
</script>

<template>
  <section v-if="session" class="study">
    <header class="study-head">
      <button type="button" class="ghost" :disabled="busy" @click="requestEnd">
        <Icon name="close" :size="16" /> 结束
      </button>
      <button
        v-if="showPrevious"
        type="button"
        class="ghost"
        :disabled="busy || correctFeedback || !previous"
        @click="goBack"
      >
        上一词
      </button>
      <div class="study-progress">
        <span>{{ progress.done }} / {{ progress.total }}</span>
        <div class="bar"><span :style="{ width: `${percent}%` }"></span></div>
      </div>
    </header>

    <div
      v-if="
        card &&
        (session.phase === 'card' ||
          session.phase === 'detail' ||
          choiceFeedback)
      "
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <QuestionStage
        :card="card"
        :phase="session.phase"
        :round="round"
        :round-label="roundLabels[round] ?? ''"
        :meaning="meaning"
        :choices="choices"
        :grades="grades"
        :show-meaning="showMeaning"
        :unaided-recall="unaidedRecall"
        :learning-choice="learningChoice"
        :choice-feedback="choiceFeedback"
        :correct-feedback="correctFeedback"
        :selected-choice="selectedChoice"
        :opened-choices="openedChoices"
        :busy="busy"
        :can-mark-wrong="canMarkWrong"
        @choose="chooseOption"
        @grade="(value, choice) => grade(value, choice)"
        @open-detail="openDetail"
        @next="next"
        @mark-wrong="markWrong"
        @skip-word="advance(skipWord(session))"
      />
    </div>

    <SpellingReadyStage
      v-else-if="session.phase === 'spelling-ready'"
      ref="spellingReadyStage"
      :done="progress.done"
      :busy="busy"
      @start="moveWithCheckpoint(startSpelling(session))"
      @skip="skip"
    />

    <SpellingStage
      v-else-if="session.phase === 'spell' && spellingCard"
      ref="spellingInput"
      :card="spellingCard"
      :index="session.spelling?.index ?? 0"
      :total="session.spelling?.list.length ?? 0"
      :answer="answer"
      :busy="busy"
      :feedback="feedback"
      @update:answer="answer = $event"
      @submit="submitSpelling"
      @skip="skip"
    />

    <div v-else ref="stage" class="stage summary-stage" tabindex="-1">
      <StudySummary
        :summary="summary"
        :busy="busy"
        @continue="continueFromSummary"
        @close="emit('close')"
      />
    </div>
  </section>
</template>
