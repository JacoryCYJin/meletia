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
import PronunciationButtons from "../../shared/PronunciationButtons.vue";
import WordDetail from "../../shared/WordDetail.vue";
import StudySummary from "./StudySummary.vue";
import { pendingStudyCards, studySummary } from "../../core/study-summary.js";
import { definitionOf, meaningChoices } from "../../core/content.js";
import {
  answerQuestion,
  continueQuestion,
  createLearnSession,
  createReviewSession,
  currentEntry,
  matchSpelling,
  progressOf,
  showAnswerDetail,
  skipSpelling,
  skipWord,
  spell,
  spellTarget,
  startSpelling,
} from "../../core/session.js";
import {
  cardById,
  saveLearnCheckpoint,
  saveStudyResult,
  saveStudyAttempt,
  setError,
  state,
  undoStudyResult,
} from "../../core/library.js";
import { dayTasks } from "../../core/stats.js";

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

const session = ref(null);
const previous = shallowRef(null);
const restoredChoices = shallowRef(null);
const answer = ref("");
const feedback = ref("");
const selectedChoice = ref(null);
const openedChoices = ref(new Set());
const correctFeedback = ref(false);
const busy = ref(false);
const stage = ref(null);
const spellingInput = ref(null);
const summaryNow = ref(new Date());
const groupIds = ref([]);
const excludedIds = ref([]);
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
const showPrevious = computed(() =>
  ["card", "choice-feedback", "detail", "spelling-ready"].includes(
    session.value?.phase,
  ),
);
const skippedIds = computed(() =>
  groupIds.value.filter((id) => !session.value?.done.includes(id)),
);
const summary = computed(() =>
  studySummary({
    session: session.value,
    cards: state.cards,
    books: state.books,
    settings: state.settings,
    reviews: state.reviews,
    now: summaryNow.value,
    extraNew: props.extraNew,
    excludedIds: [...excludedIds.value, ...skippedIds.value],
  }),
);

function rememberGroup() {
  groupIds.value = [
    ...new Set([
      ...session.value.done,
      ...session.value.queue.map((entry) => entry.id),
    ]),
  ];
}

function buildSession() {
  if (props.mode === "learn" && state.learnCheckpoint) {
    const saved = state.learnCheckpoint;
    session.value = saved.session;
    restoredChoices.value = saved.choices ?? null;
    selectedChoice.value = saved.selectedChoice ?? null;
    rememberGroup();
    return;
  }
  const tasks = dayTasks(
    state.cards,
    state.books,
    state.settings,
    new Date(),
    state.reviews,
  );
  if (props.mode === "learn") {
    const cards = (props.extraNew ? tasks.extraFresh : tasks.fresh)
      .map(cardById)
      .filter(Boolean);
    session.value = createLearnSession(cards, state.settings.groupSize);
  } else {
    session.value = createReviewSession([...tasks.recall, ...tasks.review]);
  }
  rememberGroup();
}

function focusStage(resetScroll = false) {
  nextTick(() => {
    if (resetScroll)
      stage.value?.querySelector(".stage-content")?.scrollTo(0, 0);
    if (session.value?.phase === "spell") spellingInput.value?.focus();
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

function moveTo(next) {
  session.value = next;
  summaryNow.value = new Date();
  selectedChoice.value = null;
  openedChoices.value = new Set();
  restoredChoices.value = null;
  focusStage(true);
}

async function persistPosition(next, details) {
  busy.value = true;
  try {
    await saveLearnCheckpoint({ session: next, ...details });
    return true;
  } catch (cause) {
    setError(cause);
    return false;
  } finally {
    busy.value = false;
  }
}

async function moveWithCheckpoint(next) {
  if (busy.value) return;
  if (props.mode === "learn" && !(await persistPosition(next))) return;
  moveTo(next);
}

async function advance(next, rating, positionSaved = false) {
  if (busy.value) return;

  const checkpoint = {
    session: { ...session.value, phase: "card", rating: null },
    choices: choices.value,
    saved: null,
  };
  if (next.done.length === session.value.done.length) {
    if (props.mode === "learn" && !positionSaved && !(await persistPosition(next))) return;
    previous.value = checkpoint;
    moveTo(next);
    return;
  }

  busy.value = true;
  try {
    checkpoint.saved = await saveStudyResult(
      card.value,
      props.mode,
      entry.value.firstRating ?? rating,
      new Date(),
      props.mode === "learn" ? { session: next } : undefined,
      { mastered: true },
    );
    previous.value = checkpoint;
    moveTo(next);
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

async function goBack() {
  const checkpoint = previous.value;
  if (!checkpoint || !showPrevious.value || busy.value) return;

  busy.value = true;
  try {
    const savedPosition =
      props.mode === "learn" ? { session: checkpoint.session } : undefined;
    if (checkpoint.saved)
      await undoStudyResult(checkpoint.saved, savedPosition);
    else if (savedPosition) await saveLearnCheckpoint(savedPosition);
    previous.value = null;
    moveTo(checkpoint.session);
    restoredChoices.value = checkpoint.choices;
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
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

function isRevealed(choice) {
  if (correctFeedback.value) return choice.correct;
  return (
    choiceFeedback.value &&
    (choice.correct ||
      selectedChoice.value === choice.text ||
      openedChoices.value.has(choice.text))
  );
}

function choiceResult(choice) {
  if ((correctFeedback.value || choiceFeedback.value) && choice.correct)
    return "correct";
  if (choiceFeedback.value && selectedChoice.value === choice.text)
    return "incorrect";
  return "";
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

function mask(term) {
  return String(term ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0] + "·".repeat(word.length - 1))
    .join(" ");
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

async function continueFromSummary() {
  if (busy.value || session.value?.phase !== "finished") return;
  busy.value = true;
  try {
    const skipped = [...new Set([...excludedIds.value, ...skippedIds.value])];
    const pending = pendingStudyCards({
      mode: props.mode,
      cards: state.cards,
      books: state.books,
      settings: state.settings,
      reviews: state.reviews,
      now: new Date(),
      extraNew: props.extraNew,
      excludedIds: skipped,
    });
    const next =
      props.mode === "learn"
        ? createLearnSession(pending, state.settings.groupSize)
        : createReviewSession(pending);
    if (props.mode === "learn")
      await saveLearnCheckpoint(next.total ? { session: next } : null);
    if (!next.total) {
      emit("close");
      return;
    }
    excludedIds.value = skipped;
    previous.value = null;
    answer.value = "";
    feedback.value = "";
    correctFeedback.value = false;
    clearTimeout(feedbackTimer);
    clearTimeout(correctFeedbackTimer);
    moveTo(next);
    rememberGroup();
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
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
      <div class="stage-content">
        <p class="stage-meta">
          <span>{{
            showMeaning && session.phase === "card"
              ? "看释义"
              : roundLabels[round]
          }}</span>
          <span v-if="card.source && !unaidedRecall" class="tag">{{
            card.source
          }}</span>
        </p>

        <div
          v-if="round === 'reverse' && session.phase === 'card'"
          class="senses"
        >
          <p v-for="(sense, index) in card.senses" :key="index" class="sense">
            <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
            <span>{{ sense.text }}</span>
          </p>
        </div>
        <template v-else>
          <h2 class="term">{{ card.term }}</h2>
          <PronunciationButtons :text="card.term" :card-key="card.id" />
          <p
            v-if="!unaidedRecall && (card.phonetics?.uk || card.phonetics?.us)"
            class="phonetic"
          >
            /{{ card.phonetics.uk || card.phonetics.us }}/
          </p>
        </template>

        <template v-if="session.phase === 'detail'">
          <WordDetail
            :card="card"
            :class="{ 'choice-detail-enter': learningChoice }"
          />
        </template>

        <template v-else-if="!meaning && !choiceFeedback">
          <p class="waiting">此词暂无释义，可以在所属词书中补充。</p>
        </template>

        <template v-else-if="showMeaning">
          <WordDetail :card="card" />
        </template>

        <template v-else-if="choices.length">
          <div
            class="study-choices"
            :class="{ 'choice-cards': learningChoice }"
            role="group"
            aria-label="选择中文释义"
          >
            <span
              v-if="learningChoice"
              class="choice-announcement"
              role="status"
            >
              {{
                correctFeedback
                  ? "回答正确"
                  : choiceFeedback
                    ? "回答错误，可查看其他选项"
                    : ""
              }}
            </span>
            <div
              v-for="(choice, index) in choices"
              :key="choice.text"
              class="choice-row"
            >
              <button
                type="button"
                :data-result="
                  choiceResult(choice) ||
                  (choiceFeedback && isRevealed(choice)
                    ? 'distractor'
                    : undefined)
                "
                :disabled="
                  busy ||
                  correctFeedback ||
                  (choiceFeedback && Boolean(choiceResult(choice)))
                "
                :aria-expanded="choiceFeedback ? isRevealed(choice) : undefined"
                @click="chooseOption(choice)"
              >
                <template v-if="learningChoice">
                  <span
                    class="choice-copy"
                    :class="{ 'is-revealed': isRevealed(choice) }"
                  >
                    <span
                      class="choice-top choice-prompt choice-pos"
                      :aria-hidden="isRevealed(choice)"
                    >
                      {{ choice.pos }}
                    </span>
                    <span
                      class="choice-bottom choice-prompt"
                      :aria-hidden="isRevealed(choice)"
                    >
                      {{ choice.meaning }}
                    </span>
                    <span
                      class="choice-top choice-answer choice-word"
                      :aria-hidden="!isRevealed(choice)"
                    >
                      {{ choice.term }}
                    </span>
                    <span
                      class="choice-bottom choice-answer"
                      :aria-hidden="!isRevealed(choice)"
                    >
                      <span v-if="choice.pos" class="choice-pos">{{
                        choice.pos
                      }}</span>
                      {{ choice.meaning }}
                    </span>
                  </span>
                  <span class="choice-mark">
                    <template v-if="choiceResult(choice)">
                      <Icon
                        :name="choice.correct ? 'check' : 'close'"
                        :size="16"
                      />
                      <span class="choice-announcement">{{
                        choice.correct ? "正确答案" : "错误选项"
                      }}</span>
                    </template>
                    <Icon
                      v-else-if="choiceFeedback"
                      class="choice-chevron"
                      name="chevronDown"
                      :size="16"
                    />
                  </span>
                </template>
                <template v-else>
                  <span class="choice-pos">{{ choice.pos }}</span>
                  <span>{{ choice.meaning }}</span>
                </template>
                <kbd>{{ index + 1 }}</kbd>
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <p v-if="round === 'choice'" class="waiting">
            释义选项不足，请回想词义后自评。
          </p>
        </template>
      </div>

      <template v-if="session.phase === 'detail'">
        <div
          class="stage-actions"
          :class="{ 'choice-detail-enter': learningChoice }"
        >
          <button
            type="button"
            class="primary big"
            :disabled="busy"
            @click="next()"
          >
            下一词 <kbd>空格</kbd>
          </button>
        </div>
      </template>

      <template v-else-if="!meaning && !choiceFeedback">
        <div class="stage-actions">
          <button
            type="button"
            class="ghost"
            :disabled="busy"
            @click="advance(skipWord(session))"
          >
            暂跳此词
          </button>
        </div>
      </template>

      <template v-else-if="showMeaning">
        <div class="stage-actions">
          <button
            type="button"
            class="primary big"
            :disabled="busy"
            @click="grade(3)"
          >
            下一词 <kbd>空格</kbd>
          </button>
        </div>
      </template>

      <template v-else-if="choices.length">
        <div class="stage-actions">
          <button
            v-if="learningChoice"
            type="button"
            class="big choice-action"
            :class="choiceFeedback ? 'primary' : 'ghost'"
            :disabled="busy || correctFeedback"
            @click="choiceFeedback ? openDetail() : grade(1)"
          >
            {{ choiceFeedback ? "查看详情" : "看答案" }} <kbd>空格</kbd>
          </button>
          <button
            v-else
            type="button"
            class="ghost"
            :disabled="busy"
            @click="grade(1)"
          >
            看答案
          </button>
        </div>
      </template>

      <template v-else>
        <div class="stage-actions">
          <button
            v-for="item in grades"
            :key="item.value"
            type="button"
            class="grade"
            :class="'grade-' + item.value"
            :disabled="busy"
            @click="grade(item.value)"
          >
            {{ item.label }} <kbd>{{ item.key }}</kbd>
          </button>
          <button
            v-if="round === 'choice'"
            type="button"
            class="ghost"
            @click="grade(1)"
          >
            看答案
          </button>
        </div>
      </template>
    </div>

    <div
      v-else-if="session.phase === 'spelling-ready'"
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <div class="stage-content">
        <span class="success-symbol"><Icon name="check" :size="28" /></span>
        <h2>记住了，再拼一遍</h2>
        <p class="waiting">本组辨识与回想已完成。试试不看英文，写出它们。</p>
        <p class="waiting">完成 {{ progress.done }} 张</p>
      </div>
      <div class="stage-actions">
        <button
          type="button"
          class="primary big"
          :disabled="busy"
          @click="moveWithCheckpoint(startSpelling(session))"
        >
          开始拼写 <kbd>回车</kbd>
        </button>
        <button type="button" class="ghost" :disabled="busy" @click="skip">
          跳过拼写 <kbd>Esc</kbd>
        </button>
      </div>
    </div>

    <div v-else-if="session.phase === 'spell' && spellingCard" class="stage">
      <div class="stage-content">
        <p class="stage-meta">
          <span>拼写</span>
          <span>
            {{ (session.spelling?.index ?? 0) + 1 }} /
            {{ session.spelling?.list.length }}
          </span>
        </p>

        <div class="senses spell-prompt">
          <p
            v-for="(sense, index) in spellingCard.senses"
            :key="index"
            class="sense"
          >
            <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
            <span>{{ sense.text }}</span>
          </p>
        </div>

        <p class="hint">{{ mask(spellingCard.term) }}</p>

        <form class="spell-form" @submit.prevent="submitSpelling">
          <input
            ref="spellingInput"
            v-model="answer"
            class="spell-input"
            :aria-invalid="Boolean(feedback)"
            :disabled="busy"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="输入英文，回车确认"
            aria-label="拼写英文词条"
          />
          <button
            type="submit"
            class="primary"
            :disabled="busy || !answer.trim()"
          >
            确认
          </button>
        </form>

        <p class="feedback spelling-feedback" role="status">
          <Icon v-if="feedback" name="alert" :size="16" />{{ feedback }}
        </p>
      </div>
      <div class="stage-actions">
        <button type="button" class="ghost" :disabled="busy" @click="skip">
          跳过拼写 <kbd>Esc</kbd>
        </button>
      </div>
    </div>

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

<style scoped>
.study-choices {
  display: grid;
  padding-top: 12px;
}

.study-choices button {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-height: var(--control-height);
  width: 100%;
  height: auto;
  padding: 7px 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}

.choice-row + .choice-row {
  border-top: 1px solid var(--line);
}

.study-choices:not(.choice-cards) button:hover:not(:disabled),
.choice-cards button:not([data-result]):hover:not(:disabled) {
  background: var(--hover);
}

.study-choices button:focus-visible {
  position: relative;
  z-index: 1;
}

.choice-pos {
  font-family: var(--mono);
  color: var(--muted);
}

.choice-cards {
  position: relative;
  gap: 8px;
  --correct-fill: #eaf6ed;
  --correct-line: #a5d2b0;
  --correct-ink: #24623b;
  --incorrect-fill: #fceeed;
  --incorrect-line: #e5afaa;
  --incorrect-ink: #a13b34;
}

.choice-cards .choice-row + .choice-row {
  border-top: 0;
}

.choice-cards button {
  grid-template-columns: minmax(0, 1fr) 20px;
  gap: 12px;
  min-height: 72px;
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
  transition:
    background-color 450ms ease,
    border-color 450ms ease;
}

.choice-cards kbd {
  background: transparent;
}

.study-choices button,
.stage-actions button:has(> kbd) {
  position: relative;
  padding-inline-end: 52px;
}

.study button > kbd {
  position: absolute;
  inset-inline-end: 12px;
  top: 50%;
  margin: 0;
  transform: translateY(-50%);
}

.choice-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
  min-width: 0;
}

.choice-top {
  grid-area: 1 / 1;
}

.choice-bottom {
  grid-area: 2 / 1;
}

.choice-bottom .choice-pos {
  margin-right: 4px;
  font-size: 0.9em;
}

.choice-word {
  font-weight: 600;
}

.choice-answer,
.choice-copy.is-revealed .choice-prompt {
  opacity: 0;
  user-select: none;
  transition: opacity 200ms ease-in;
}

.choice-prompt,
.choice-copy.is-revealed .choice-answer {
  opacity: 1;
  transition: opacity 300ms ease-out 150ms;
}

.choice-mark {
  display: grid;
  place-items: center;
  align-self: center;
  color: var(--muted);
}

.choice-cards button[aria-expanded="true"] .choice-chevron {
  transform: rotate(180deg);
}

.choice-cards button[data-result="correct"] {
  background: var(--correct-fill);
  border-color: var(--correct-line);
}

.choice-cards button[data-result="correct"] :is(.choice-mark, .choice-word) {
  color: var(--correct-ink);
}

.choice-cards button:is([data-result="incorrect"], [data-result="distractor"]) {
  background: var(--incorrect-fill);
  border-color: var(--incorrect-line);
}

.choice-cards
  button:is([data-result="incorrect"], [data-result="distractor"])
  :is(.choice-mark, .choice-word) {
  color: var(--incorrect-ink);
}

.choice-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.choice-action {
  inline-size: 140px;
  justify-content: center;
}

.choice-detail-enter {
  animation: choice-detail-in 320ms ease-out both;
}

@keyframes choice-detail-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-color-scheme: dark) {
  .choice-cards {
    --correct-fill: #1d3428;
    --correct-line: #486f55;
    --correct-ink: #b0dbb9;
    --incorrect-fill: #402625;
    --incorrect-line: #80534e;
    --incorrect-ink: #f3b5ad;
  }
}

@media (prefers-reduced-motion: reduce) {
  .choice-cards button,
  .choice-cards .choice-copy :is(.choice-prompt, .choice-answer) {
    transition: none;
  }

  .choice-detail-enter {
    animation: none;
  }
}
</style>
