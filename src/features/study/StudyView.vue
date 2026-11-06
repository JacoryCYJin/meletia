<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from "vue";
import Icon from "../../shared/Icon.vue";
import WordDetail from "../../shared/WordDetail.vue";
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
import { cardById, saveStudyResult, setError, state, undoStudyResult } from "../../core/library.js";
import { dayTasks } from "../../core/stats.js";

const props = defineProps({ mode: { type: String, required: true } });
const emit = defineEmits(["close"]);

const yes = { value: 3, label: "认识" };
const learningGrades = [yes, { value: 1, label: "不认识" }];
const reviewGrades = [yes, { value: 2, label: "模糊" }, { value: 1, label: "忘记了" }];
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
const busy = ref(false);
const stage = ref(null);
const spellingInput = ref(null);
let feedbackTimer;

const entry = computed(() => currentEntry(session.value));
const card = computed(() => (entry.value ? cardById(entry.value.id) : null));
const round = computed(() => entry.value?.round);
const meaning = computed(() => (card.value ? definitionOf(card.value).trim() : ""));
const choices = computed(() =>
  restoredChoices.value ??
  (entry.value?.round === "choice" && card.value
    ? meaningChoices(card.value, state.cards).map((choice) => {
        const match = choice.text.match(/^([a-z]+\.)\s+([\s\S]+)$/i);
        return { ...choice, pos: match?.[1], meaning: match?.[2] ?? choice.text };
      })
    : []),
);
const showMeaning = computed(() =>
  props.mode === "learn" && round.value === "choice" && meaning.value && !choices.value.length,
);
const grades = computed(() =>
  props.mode === "review" && round.value !== "choice" ? reviewGrades : learningGrades,
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
const missedCount = computed(() => session.value?.spelling?.missed.length ?? 0);
const spellingComplete = computed(() =>
  Boolean(session.value?.spelling && !spellTarget(session.value)),
);
const stageLabel = computed(() => (props.mode === "learn" ? "学习" : "复习"));
const choiceFeedback = computed(() => session.value?.phase === "choice-feedback");
const unaidedRecall = computed(() => round.value === "recall" && session.value?.phase === "card");
const showPrevious = computed(() =>
  ["card", "choice-feedback", "detail", "spelling-ready"].includes(session.value?.phase),
);

function buildSession() {
  const tasks = dayTasks(state.cards, state.books, state.settings, new Date(), state.reviews);
  if (props.mode === "learn") {
    const cards = tasks.fresh.map(cardById).filter(Boolean);
    session.value = createLearnSession(cards, state.settings.groupSize);
  } else {
    session.value = createReviewSession([...tasks.recall, ...tasks.review]);
  }
}

function focusStage() {
  nextTick(() => {
    if (session.value?.phase === "spell") spellingInput.value?.focus();
    else stage.value?.focus();
  });
}

onMounted(() => {
  buildSession();
  window.addEventListener("keydown", onKey);
  focusStage();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  clearTimeout(feedbackTimer);
});

function moveTo(next) {
  session.value = next;
  selectedChoice.value = null;
  openedChoices.value = new Set();
  restoredChoices.value = null;
  focusStage();
}

async function advance(next, rating) {
  if (busy.value) return;

  const checkpoint = {
    session: { ...session.value, phase: "card", rating: null },
    choices: choices.value,
    saved: null,
  };
  if (next.done.length === session.value.done.length) {
    previous.value = checkpoint;
    moveTo(next);
    return;
  }

  busy.value = true;
  try {
    checkpoint.saved = await saveStudyResult(
      card.value, props.mode, entry.value.firstRating ?? rating,
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
    if (checkpoint.saved) await undoStudyResult(checkpoint.saved);
    previous.value = null;
    moveTo(checkpoint.session);
    restoredChoices.value = checkpoint.choices;
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

function grade(value, choice = null) {
  if (busy.value || session.value.phase !== "card" || !meaning.value) return;
  const next = answerQuestion(session.value, value, { selectedOption: Boolean(choice) });
  if (showMeaning.value) return advance(continueQuestion(next), value);
  if (next.phase === "detail" || next.phase === "choice-feedback") {
    session.value = next;
    selectedChoice.value = choice?.text ?? null;
    focusStage();
    return;
  }
  return advance(next, value);
}

function isRevealed(choice) {
  return choiceFeedback.value &&
    (choice.correct || selectedChoice.value === choice.text || openedChoices.value.has(choice.text));
}

function chooseOption(choice) {
  if (choiceFeedback.value) {
    if (openedChoices.value.has(choice.text)) openedChoices.value.delete(choice.text);
    else openedChoices.value.add(choice.text);
    return;
  }
  grade(choice.correct ? 3 : 1, choice);
}

function openDetail() {
  session.value = showAnswerDetail(session.value);
  focusStage();
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

  busy.value = true;
  try {
    if (!correct) {
      await saveStudyResult(target, "spell", 1);
      feedback.value = "拼写不对，稍后再试。";
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        feedback.value = "";
      }, 2400);
    } else {
      feedback.value = "";
    }

    answer.value = "";
    moveTo(spell(session.value, correct));
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

function skip() {
  if (!busy.value) moveTo(skipSpelling(session.value));
}

function onKey(event) {
  if (event.defaultPrevented || event.isComposing || event.metaKey ||
      event.ctrlKey || event.altKey || event.repeat || busy.value) return;
  const typing = event.target?.closest?.("input,textarea,select,[contenteditable]");
  const onButton = event.target?.closest?.("button");
  const phase = session.value?.phase;
  const confirm = event.key === "Enter" || event.code === "Space";

  if (choiceFeedback.value && !typing &&
      (event.code === "Space" || (confirm && !onButton))) {
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
    if (props.mode === "learn" && choices.value.length && event.code === "Space") {
      event.preventDefault();
      grade(1);
      return;
    }
    if (!/^[1-4]$/.test(event.key) || !meaning.value) return;
    const key = Number(event.key);
    const choice = choices.value[key - 1];
    const item = grades.value.find(({ value }) => value === key);
    if (choices.value.length ? !choice : !item) return;
    event.preventDefault();
    if (choice) grade(choice.correct ? 3 : 1, choice);
    else grade(item.value);
    return;
  }

  if ((phase === "spelling-ready" || phase === "spell") && event.key === "Escape") {
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
    moveTo(startSpelling(session.value));
  } else if (phase === "finished" && event.key === "Enter") {
    event.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <section v-if="session" class="study">
    <header class="study-head">
      <button type="button" class="ghost" :disabled="busy" @click="emit('close')">
        <Icon name="close" :size="16" /> 结束
      </button>
      <button
        v-if="showPrevious"
        type="button"
        class="ghost"
        :disabled="busy || !previous"
        @click="goBack"
      >上一词</button>
      <p class="study-mode">{{ stageLabel }}</p>
      <div class="study-progress">
        <span>{{ progress.done }} / {{ progress.total }}</span>
        <div class="bar"><span :style="{ width: `${percent}%` }"></span></div>
      </div>
    </header>

    <div
      v-if="card && (session.phase === 'card' || session.phase === 'detail' || choiceFeedback)"
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <p class="stage-meta">
        <span>{{ showMeaning && session.phase === "card" ? "看释义" : roundLabels[round] }}</span>
        <span v-if="card.source && !unaidedRecall" class="tag">{{ card.source }}</span>
      </p>

      <div v-if="round === 'reverse' && session.phase === 'card'" class="senses">
        <p v-for="(sense, index) in card.senses" :key="index" class="sense">
          <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
          <span>{{ sense.text }}</span>
        </p>
      </div>
      <template v-else>
        <h2 class="term">{{ card.term }}</h2>
        <p v-if="!unaidedRecall && (card.phonetics?.uk || card.phonetics?.us)" class="phonetic">
          /{{ card.phonetics.uk || card.phonetics.us }}/
        </p>
      </template>

      <template v-if="session.phase === 'detail'">
        <p v-if="selectedChoice && props.mode === 'review'" class="waiting" role="status">
          {{ session.rating === 3 ? "选对了" : "选错了" }} · {{ selectedChoice }}
        </p>
        <WordDetail :card="card" />
        <div class="stage-actions">
          <button type="button" class="primary big" :disabled="busy" @click="next()">
            下一词 <kbd>空格</kbd>
          </button>
        </div>
      </template>

      <template v-else-if="!meaning">
        <p class="waiting">此词暂无释义，可以在所属词书中补充。</p>
        <div class="stage-actions">
          <button type="button" class="ghost" :disabled="busy" @click="advance(skipWord(session))">
            暂跳此词
          </button>
        </div>
      </template>

      <template v-else-if="showMeaning">
        <WordDetail :card="card" />
        <div class="stage-actions">
          <button type="button" class="primary big" :disabled="busy" @click="grade(3)">
            下一词 <kbd>空格</kbd>
          </button>
        </div>
      </template>

      <template v-else-if="choices.length">
        <p v-if="choiceFeedback" class="waiting" role="status">选错了 · 可展开其余选项查看对应单词</p>
        <div class="study-choices" role="group" aria-label="选择中文释义">
          <div v-for="(choice, index) in choices" :key="choice.text" class="choice-row">
            <button
              type="button"
              :disabled="busy || (choiceFeedback && (choice.correct || selectedChoice === choice.text))"
              :aria-expanded="choiceFeedback ? isRevealed(choice) : undefined"
              @click="chooseOption(choice)"
            >
              <kbd>{{ index + 1 }}</kbd>
              <span class="choice-pos">{{ choice.pos }}</span>
              <span>{{ choice.meaning }}</span>
              <Icon
                v-if="choiceFeedback && !choice.correct && selectedChoice !== choice.text"
                name="chevronDown"
                :size="14"
              />
            </button>
            <p v-if="isRevealed(choice)" class="choice-reveal">
              <strong>{{ choice.term }}</strong>
              <span>{{ choice.correct ? "正确答案" : selectedChoice === choice.text ? "你的选择" : "其他选项" }}</span>
            </p>
          </div>
        </div>
        <div class="stage-actions">
          <button v-if="choiceFeedback" type="button" class="primary big" @click="openDetail">
            查看详情 <kbd>空格</kbd>
          </button>
          <button v-else type="button" class="ghost" :disabled="busy" @click="grade(1)">
            看答案 <kbd v-if="props.mode === 'learn'">空格</kbd>
          </button>
        </div>
      </template>

      <template v-else>
        <p v-if="round === 'choice'" class="waiting">释义选项不足，请回想词义后自评。</p>
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
            {{ item.label }} <kbd>{{ item.value }}</kbd>
          </button>
          <button
            v-if="round === 'choice'"
            type="button"
            class="ghost"
            @click="grade(1)"
          >看答案</button>
        </div>
      </template>
    </div>

    <div v-else-if="session.phase === 'spelling-ready'" ref="stage" class="stage" tabindex="-1">
      <h2>本组单词辨识完成</h2>
      <p class="waiting">完成 {{ progress.done }} 张</p>
      <div class="stage-actions">
        <button type="button" class="primary big" :disabled="busy" @click="moveTo(startSpelling(session))">
          开始拼写 <kbd>回车</kbd>
        </button>
        <button type="button" class="ghost" :disabled="busy" @click="skip">
          跳过拼写 <kbd>Esc</kbd>
        </button>
      </div>
    </div>

    <div v-else-if="session.phase === 'spell' && spellingCard" class="stage">
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
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="输入英文，回车确认"
          aria-label="拼写英文词条"
        />
        <button type="submit" class="primary" :disabled="busy || !answer.trim()">
          确认
        </button>
      </form>

      <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>

      <div class="stage-actions">
        <button type="button" class="ghost" :disabled="busy" @click="skip">
          跳过拼写 <kbd>Esc</kbd>
        </button>
      </div>
    </div>

    <div v-else ref="stage" class="stage finished" tabindex="-1">
      <p class="stage-meta"><span>完成</span></p>
      <h2>这一轮结束了</h2>
      <p class="waiting">
        完成 {{ progress.done }} 张。
        <template v-if="progress.done < progress.total">
          {{ progress.total - progress.done }} 张暂无释义，已暂跳。
        </template>
        <template v-if="missedCount">
          拼写错过 {{ missedCount }} 个，会排到下次复习前面。
        </template>
        <template v-else-if="spellingComplete">拼写全部正确。</template>
      </p>
      <div class="stage-actions">
        <button type="button" class="primary big" @click="emit('close')">
          回到今日 <kbd>回车</kbd>
        </button>
      </div>
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
  grid-template-columns: 24px 32px minmax(0, 1fr);
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

.choice-row button:disabled[aria-expanded="true"] {
  opacity: 1;
}

.choice-reveal {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  padding: 5px 12px 10px 76px;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.choice-reveal strong {
  color: var(--ink);
}

.choice-row button > svg {
  grid-column: 4;
  align-self: center;
  color: var(--muted);
}

.choice-row button[aria-expanded="true"] > svg {
  transform: rotate(180deg);
}

.study-choices button:hover:not(:disabled) {
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
</style>
