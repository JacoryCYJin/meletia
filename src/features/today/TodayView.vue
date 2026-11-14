<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { cardById, saveDictationResult, state } from "../../core/library.js";
import { bookStats } from "../../core/books.js";
import { dayTasks } from "../../core/stats.js";
import {
  DICTATION_RANGES,
  buildFreeDictationQueue,
  dictationTasks,
} from "../../core/dictation.js";
import { createDictationSession } from "../../core/session.js";
import DictationPanel from "../dictation/DictationPanel.vue";
import { useDictationRunner } from "../dictation/useDictationRunner.js";
import Icon from "../../shared/Icon.vue";
import Modal from "../../shared/Modal.vue";

const emit = defineEmits([
  "start",
  "navigate",
  "open-book",
  "dictation-active",
]);
const showContinue = ref(false);

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
  window.addEventListener("keydown", onDictationKey);
});
onUnmounted(() => {
  clearInterval(timer);
  window.removeEventListener("keydown", onDictationKey);
  emit("dictation-active", false);
});

const tasks = computed(() =>
  dayTasks(state.cards, state.books, state.settings, now.value, state.reviews),
);
const reviewTotal = computed(
  () => tasks.value.recall.length + tasks.value.review.length,
);
const dictation = computed(() =>
  dictationTasks(
    state.cards,
    state.books,
    state.settings,
    now.value,
    state.reviews,
  ),
);
const dictationSize = computed(() =>
  Number.isSafeInteger(state.settings.dictationGroupSize)
    ? state.settings.dictationGroupSize
    : 10,
);
const dictationSession = ref(null);
const dictationKind = ref("fresh");
const dictationQueueIds = ref([]);
const freeOpen = ref(false);
const freeBooks = ref([]);
const freeRange = ref("all");
const freeSize = ref(10);

const runner = useDictationRunner({
  session: dictationSession,
  cardOf: cardById,
  replayLimit: computed(() => state.settings.dictationReplays ?? 2),
  saveCorrect: async (card) => {
    if (dictationKind.value !== "free") await saveDictationResult(card, true);
  },
  saveWrong: async (card) => {
    if (dictationKind.value !== "free") await saveDictationResult(card, false);
  },
});
const {
  answer: dictationAnswer,
  busy: dictationBusy,
  correct: dictationCorrect,
  accent: dictationAccent,
  card: dictationCard,
  feedbackCard: dictationFeedbackCard,
  dictation: dictationRound,
  replaysLeft: dictationReplaysLeft,
  summary: dictationRoundSummary,
  submit: submitDictation,
  replay: replayDictation,
  changeAccent: changeDictationAccent,
  continueFeedback: continueDictation,
  skip: skipDictation,
  handleKey: handleDictationKey,
} = runner;

const freeQueue = computed(() =>
  buildFreeDictationQueue({
    cards: state.cards,
    books: state.books,
    bookIds: freeBooks.value,
    range: freeRange.value,
    limit: freeSize.value,
  }),
);

function startRound(ids, kind) {
  if (!ids.length) return;
  dictationKind.value = kind;
  dictationQueueIds.value = ids;
  dictationSession.value = createDictationSession(ids, ids.length);
  runner.reset();
  emit("dictation-active", true);
}

function startDictation(kind) {
  const source = kind === "fresh" ? dictation.value.fresh : dictation.value.due;
  startRound(
    source.slice(0, dictationSize.value).map((item) => item.id),
    kind,
  );
}

function exitDictation() {
  dictationSession.value = null;
  emit("dictation-active", false);
}

function restartDictation() {
  if (dictationKind.value === "free") {
    startRound(dictationQueueIds.value, "free");
    return;
  }
  const source =
    dictationKind.value === "fresh" ? dictation.value.fresh : dictation.value.due;
  const next = source.slice(0, dictationSize.value).map((item) => item.id);
  if (!next.length) {
    exitDictation();
    return;
  }
  startRound(next, dictationKind.value);
}

function openFreePractice() {
  const defaults = activeBooks.value.filter((book) => book.dictation === true);
  freeBooks.value = (defaults.length ? defaults : activeBooks.value).map(
    (book) => book.id,
  );
  freeRange.value = "all";
  freeSize.value = dictationSize.value;
  freeOpen.value = true;
}

function startFreePractice() {
  const ids = freeQueue.value.map((item) => item.id);
  if (!ids.length) return;
  freeOpen.value = false;
  startRound(ids, "free");
}

function onDictationKey(event) {
  if (!dictationSession.value) return;
  if (
    event.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.repeat
  )
    return;
  if (dictationSession.value.phase === "dictation-finished") {
    if (event.key === "Enter" && !event.target?.closest?.("button")) {
      event.preventDefault();
      restartDictation();
    }
    return;
  }
  handleDictationKey(event);
}

const canLearn = computed(() =>
  Boolean(state.learnCheckpoint || tasks.value.extraFresh.length),
);
const newGoalComplete = computed(() => tasks.value.allowance === 0);

function startLearning() {
  if (!state.learnCheckpoint && newGoalComplete.value) {
    showContinue.value = true;
  } else {
    emit("start", "learn");
  }
}

function startReview() {
  if (!reviewTotal.value) return;
  showContinue.value = false;
  emit("start", "review");
}

function continueNewWords() {
  if (!tasks.value.extraFresh.length) return;
  showContinue.value = false;
  emit("start", "learn", { extraNew: true });
}

const activeBooks = computed(() => state.books.filter((b) => b.active));
const books = computed(() =>
  state.books
    .map((book) => ({ book, stats: bookStats(book, state.cards, now.value) }))
    .sort((a, b) => b.stats.total - a.stats.total),
);

const dateParts = computed(() => {
  const current = now.value;
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(current);
  const year = current.getFullYear();
  const month = current.getMonth() + 1;
  const day = current.getDate();
  return {
    day,
    weekday,
    yearMonth: `${year}年${month}月`,
    dateTime: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label: `${year}年${month}月${day}日，${weekday}`,
  };
});

const summary = computed(() => {
  if (!state.cards.length) return "把想记住的词，留在自己的词书里。";
  const parts = [];
  if (tasks.value.recall.length)
    parts.push(`${tasks.value.recall.length} 个要回炉`);
  if (tasks.value.review.length)
    parts.push(`${tasks.value.review.length} 个到期`);
  if (tasks.value.fresh.length)
    parts.push(`${tasks.value.fresh.length} 个新词`);
  if (!parts.length && tasks.value.reviewDeferred)
    return "已达每日复习上限，还有待复习词。";
  if (parts.length) return `今天有 ${parts.join("，")}。`;
  if (state.learnCheckpoint) return "还有一组学习待继续。";
  if (newGoalComplete.value && tasks.value.extraFresh.length)
    return "今日目标已完成。还想再学一点？可以继续学习新词。";
  return "今日暂无待办，可以查看词书中的学习进度。";
});
</script>

<template>
  <section class="page today-page" :class="{ 'dictation-inline': dictationSession }">
    <DictationPanel
      v-if="dictationSession"
      :phase="dictationSession.phase"
      :dictation="dictationRound"
      :card="dictationCard"
      :feedback-card="dictationFeedbackCard"
      :answer="dictationAnswer"
      :busy="dictationBusy"
      :correct="dictationCorrect"
      :replays-left="dictationReplaysLeft"
      :accent="dictationAccent"
      :summary="dictationRoundSummary"
      secondary-label="回今日"
      @update:answer="dictationAnswer = $event"
      @submit="submitDictation"
      @replay="replayDictation"
      @accent="changeDictationAccent"
      @continue="continueDictation"
      @skip="skipDictation"
      @restart="restartDictation"
      @secondary="exitDictation"
    />
    <template v-else>
    <header class="page-head">
      <div class="title-line">
        <h1>今日</h1>
        <time class="page-date today-date" :datetime="dateParts.dateTime" :aria-label="dateParts.label">
          <span class="date-day" aria-hidden="true">{{ dateParts.day }}</span>
          <span class="date-info" aria-hidden="true">
            <span class="date-week">{{ dateParts.weekday }}</span>
            <span class="date-month">{{ dateParts.yearMonth }}</span>
          </span>
        </time>
      </div>
      <p class="lede">{{ summary }}</p>
    </header>
    <div v-if="!state.cards.length" class="empty-state first-use">
      <span class="empty-symbol"><Icon name="book" :size="36" /></span>
      <h2>每天记住一点</h2>
      <p>先创建或导入一本词书。你的词条与学习记录，都保存在这台电脑上。</p>
      <button class="primary" @click="$emit('navigate', 'books')">
        前往词书<Icon name="arrowRight" :size="18" />
      </button>
    </div>
    <template v-else>
      <div v-if="state.learnCheckpoint" class="resume-panel">
        <Icon name="history" :size="24" />
        <div>
          <h2>接着上次的位置</h2>
          <p>已保存当前词、轮次与答题状态，可以继续这组学习。</p>
        </div>
        <button class="primary" @click="$emit('start', 'learn')">
          继续学习<Icon name="arrowRight" :size="18" />
        </button>
      </div>
      <div v-if="!activeBooks.length" class="inline-message">
        <Icon name="book" :size="20" />
        <p>还没有启用的词书。启用后，系统才会安排每日新词。</p>
        <button class="ghost" @click="$emit('navigate', 'books')">
          管理词书
        </button>
      </div>
      <div class="section-line study-tasks-line"><h2>学习任务</h2></div>
      <div class="task-grid">
        <article class="task" :class="{ quiet: !canLearn }">
          <div class="task-heading">
            <Icon name="book" :size="22" />
            <h2>学习新词</h2>
            <span class="task-count">{{ tasks.fresh.length }}</span>
          </div>
          <p class="task-hint">
            {{
              tasks.fresh.length
                ? "从启用的词书中，按组慢慢记住。"
                : state.learnCheckpoint
                  ? "当前学习已保存，继续完成这一组。"
                  : tasks.extraFresh.length
                    ? "今日新词目标已完成，还可以再学一组。"
                    : !activeBooks.length
                      ? "启用词书后，就可以开始学习新词。"
                      : "启用词书中的新词已学完，可以导入更多词条。"
            }}
          </p>
          <button
            :class="state.learnCheckpoint ? '' : 'primary'"
            :disabled="!canLearn"
            @click="startLearning"
          >
            {{
              state.learnCheckpoint
                ? "继续当前学习"
                : tasks.fresh.length
                  ? "开始学习"
                  : tasks.extraFresh.length
                    ? "继续学习"
                    : "暂无新词"
            }}<Icon v-if="canLearn" name="arrowRight" :size="16" />
          </button>
        </article>
        <article class="task" :class="{ quiet: !reviewTotal }">
          <div class="task-heading">
            <Icon name="history" :size="22" />
            <h2>复习旧词</h2>
            <span class="task-count">{{ reviewTotal }}</span>
          </div>
          <p class="task-hint">
            <template v-if="reviewTotal"
              >{{ tasks.review.length }} 个到期<template
                v-if="tasks.recall.length"
                >，{{ tasks.recall.length }} 个需要回炉</template
              >。趁还记得，再见一面。</template
            ><template v-else>{{
              tasks.reviewDeferred
                ? "已达到每日复习上限，剩余复习会保留。"
                : "暂时没有到期词，下一次复习时再见。"
            }}</template>
          </p>
          <button :disabled="!reviewTotal" @click="startReview">
            {{ reviewTotal ? "开始复习" : "暂无到期复习"
            }}<Icon v-if="reviewTotal" name="arrowRight" :size="16" />
          </button>
        </article>
      </div>
      <div class="section-line dictation-line">
        <h2>听写任务</h2>
        <button class="link" @click="openFreePractice">
          自由练习<Icon name="arrowRight" :size="15" />
        </button>
      </div>
      <div class="task-grid dictation-grid">
        <article class="task" :class="{ quiet: !dictation.fresh.length }">
          <div class="task-heading">
            <Icon name="volume" :size="22" />
            <h2>听写新词</h2>
            <span class="task-count">{{ dictation.fresh.length }}</span>
          </div>
          <p class="task-hint">
            {{
              dictation.fresh.length
                ? "只听发音，写出还没听写过的词。"
                : "没有待听写的新词。可以在词书页给词书打开「听写」。"
            }}
          </p>
          <button
            class="primary"
            :disabled="!dictation.fresh.length"
            @click="startDictation('fresh')"
          >
            {{ dictation.fresh.length ? "开始听写" : "暂无新词"
            }}<Icon v-if="dictation.fresh.length" name="arrowRight" :size="16" />
          </button>
        </article>
        <article class="task" :class="{ quiet: !dictation.due.length }">
          <div class="task-heading">
            <Icon name="history" :size="22" />
            <h2>听写复习</h2>
            <span class="task-count">{{ dictation.due.length }}</span>
          </div>
          <p class="task-hint">
            <template v-if="dictation.due.length"
              >{{ dictation.due.length }} 个到期。趁还记得声音，再写一遍。</template
            ><template v-else-if="dictation.reviewDeferred"
              >已达每日听写复习上限，还有 {{ dictation.reviewDeferred }} 个词待复习。</template
            ><template v-else
              >暂时没有到期的听写词。</template
            >
          </p>
          <button
            :disabled="!dictation.due.length"
            @click="startDictation('due')"
          >
            {{ dictation.due.length ? "开始听写" : "暂无到期复习"
            }}<Icon v-if="dictation.due.length" name="arrowRight" :size="16" />
          </button>
        </article>
      </div>
      <div class="section-line">
        <h2>词书进度</h2>
        <button class="link" @click="$emit('navigate', 'books')">
          全部词书<Icon name="arrowRight" :size="15" />
        </button>
      </div>
      <div class="today-books">
        <button
          v-for="{ book, stats } in books"
          :key="book.id"
          class="today-book"
          @click="$emit('open-book', book.id)"
        >
          <Icon name="book" :size="22" /><span class="today-book-name"
            >{{ book.name
            }}<small>{{ book.active ? "参与每日学习" : "已停用" }}</small></span
          ><span class="today-book-progress"
            ><span
              >{{ stats.learned }}
              <span class="muted">/ {{ stats.total }}</span></span
            ><span class="meter"
              ><i
                :style="{
                  width:
                    (stats.total ? (stats.learned / stats.total) * 100 : 0) +
                    '%',
                }" /></span></span
          ><Icon name="arrowRight" :size="16" />
        </button>
      </div>
    </template>
    </template>
  </section>
  <Modal
    v-if="showContinue"
    class="continue-dialog"
    title="今日学习目标已完成"
    description="可以去复习，也可以继续学习一组新词。"
    @close="showContinue = false"
  >
    <div class="continue-options">
      <button class="continue-option" :disabled="!reviewTotal" @click="startReview">
        <Icon name="history" :size="23" />
        <span><strong>去复习</strong><small>{{ reviewTotal ? `${reviewTotal} 个待复习词，接着完成今日复习。` : tasks.reviewDeferred ? "已达到每日复习上限。" : "暂无待复习词。" }}</small></span>
        <Icon name="arrowRight" :size="17" />
      </button>
      <button class="continue-option" :disabled="!tasks.extraFresh.length" @click="continueNewWords">
        <Icon name="book" :size="23" />
        <span><strong>继续学习新词</strong><small>{{ tasks.extraFresh.length ? `再学 ${tasks.extraFresh.length} 个新词，不改变每日目标。` : "启用词书中的新词已学完。" }}</small></span>
        <Icon name="arrowRight" :size="17" />
      </button>
    </div>
    <template #footer>
      <button @click="showContinue = false">今天先到这里</button>
    </template>
  </Modal>

  <Modal
    v-if="freeOpen"
    class="free-dictation-dialog"
    title="自由练习"
    description="选择词书和范围，只听发音写出英文。自由练习不写听写进度。"
    @close="freeOpen = false"
  >
    <div class="free-dictation-form">
      <div class="section-line"><h3>词书</h3></div>
      <div v-if="activeBooks.length" class="free-dictation-options">
        <label v-for="book in activeBooks" :key="book.id">
          <input v-model="freeBooks" type="checkbox" :value="book.id" />
          <span>{{ book.name }}</span>
          <small v-if="book.dictation">听写</small>
        </label>
      </div>
      <p v-else class="muted">还没有启用的词书。</p>

      <div class="section-line"><h3>范围</h3></div>
      <div class="free-dictation-options free-dictation-ranges">
        <label v-for="item in DICTATION_RANGES" :key="item.id">
          <input v-model="freeRange" type="radio" :value="item.id" />
          <span>{{ item.label }}</span>
        </label>
      </div>

      <label class="field free-dictation-size">
        <span>每组数量</span>
        <select v-model="freeSize">
          <option :value="10">10</option>
          <option :value="15">15</option>
          <option :value="20">20</option>
          <option :value="30">30</option>
        </select>
      </label>
      <p class="muted free-dictation-count">
        本次可选 {{ freeQueue.length }} 个词。
      </p>
    </div>
    <template #footer>
      <button @click="freeOpen = false">取消</button>
      <button
        class="primary"
        :disabled="!freeQueue.length"
        @click="startFreePractice"
      >
        开始听写
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.study-tasks-line { margin-top: 0; }
.dictation-line { margin-top: 28px; }
.dictation-grid { margin-bottom: 24px; }
.dictation-inline {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.free-dictation-form {
  display: grid;
  gap: 6px;
}
.free-dictation-form .section-line {
  margin-top: 10px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
}
.free-dictation-form h3 {
  font-size: 14px;
}
.free-dictation-options {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.free-dictation-options label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  font-size: 14px;
}
.free-dictation-options small {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--panel);
  color: var(--muted);
  font-size: 11px;
}
.free-dictation-ranges {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.free-dictation-size {
  margin-top: 16px;
}
.free-dictation-size select {
  width: 100px;
}
.free-dictation-count {
  margin-top: 12px;
  font-size: 13px;
}
.today-page > .page-head { position: relative; }
.today-date {
  position: absolute;
  right: 0;
  top: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ink);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.date-day { font-size: 48px; font-weight: 450; line-height: 1.05; letter-spacing: -2px; }
.date-info { border-left: 1px solid var(--line-strong); padding-left: 14px; }
.date-week { display: block; font-size: 14px; line-height: 1.5; color: var(--ink); }
.date-month { display: block; margin-top: 5px; font-size: 12px; line-height: 1.5; color: var(--muted); }
@media (max-width: 760px) {
  .today-page .title-line { flex-direction: row; }
}

.continue-dialog { background: var(--bg); color: var(--ink); }
.continue-options { display: grid; }
.continue-option {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  height: auto;
  min-height: 96px;
  padding: 20px 8px;
  text-align: left;
  white-space: normal;
  border: 0;
  background: transparent;
  border-radius: 8px;
}
.continue-option + .continue-option { border-top: 1px solid var(--line); }
.continue-option > span { flex: 1; min-width: 0; }
.continue-option strong { display: block; font-size: 15px; font-weight: 600; }
.continue-option small { display: block; margin-top: 6px; font-size: 13px; color: var(--muted); line-height: 1.6; }
.continue-option > svg { flex-shrink: 0; }
.continue-option:hover:not(:disabled) { background: var(--hover); }
</style>
