<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { bookStats } from "../../core/books.js";
import { dayTasks } from "../../core/stats.js";
import Icon from "../../shared/Icon.vue";
import Modal from "../../shared/Modal.vue";

const emit = defineEmits(["start", "navigate", "open-book"]);
const showContinue = ref(false);

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));

const tasks = computed(() =>
  dayTasks(state.cards, state.books, state.settings, now.value, state.reviews),
);
const reviewTotal = computed(
  () => tasks.value.recall.length + tasks.value.review.length,
);
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

const dateText = computed(() => {
  const current = now.value;
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(current);
  return `${current.getMonth() + 1} 月 ${current.getDate()} 日 · ${weekday}`;
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
  <section class="page today-page">
    <header class="page-head">
      <div class="title-line">
        <h1>今日</h1>
        <span class="page-date">{{ dateText }}</span>
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
      <p class="section-note">
        每日安排可在<button
          class="text-button"
          @click="$emit('navigate', 'settings')"
        >
          设置</button
        >中调整。
      </p>
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
</template>

<style scoped>
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
