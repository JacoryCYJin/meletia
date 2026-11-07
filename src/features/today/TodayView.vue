<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { bookStats } from "../../core/books.js";
import { dayTasks } from "../../core/stats.js";

defineEmits(["start"]);

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
const canLearn = computed(() => Boolean(state.learnCheckpoint || tasks.value.fresh.length));

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
  if (!state.cards.length) return "还没有词。先导入一份 CSV，再开始。";
  const parts = [];
  if (tasks.value.recall.length)
    parts.push(`${tasks.value.recall.length} 个要回炉`);
  if (tasks.value.review.length)
    parts.push(`${tasks.value.review.length} 个到期`);
  if (tasks.value.fresh.length) parts.push(`${tasks.value.fresh.length} 个新词`);
  if (!parts.length && tasks.value.reviewDeferred) return "已达每日复习上限，还有待复习词。";
  if (parts.length) return `今天有 ${parts.join("，")}。`;
  return state.learnCheckpoint ? "还有一组学习待继续。" : "今天的任务做完了。";
});
</script>

<template>
  <section class="page today-page">
    <header class="page-head">
      <p class="eyebrow">{{ dateText }}</p>
      <h1>今日</h1>
      <p class="lede">{{ summary }}</p>
    </header>

    <div class="task-grid">
      <article class="task" :class="{ quiet: !reviewTotal }">
        <p class="task-label">复习</p>
        <p class="task-count">{{ reviewTotal }}</p>
        <p class="task-hint">
          <template v-if="tasks.recall.length">
            {{ tasks.recall.length }} 个上次没答对，先回炉；
          </template>
          {{ tasks.review.length }} 个按间隔到期。
          <template v-if="tasks.reviewDeferred">
            另有 {{ tasks.reviewDeferred }} 个因每日上限未安排。
          </template>
        </p>
        <button
          type="button"
          class="primary"
          :disabled="!reviewTotal"
          @click="$emit('start', 'review')"
        >
          开始复习
        </button>
      </article>

      <article class="task" :class="{ quiet: !canLearn }">
        <p class="task-label">学习</p>
        <p class="task-count">{{ tasks.fresh.length }}</p>
        <p class="task-hint">
          每日上限 {{ state.settings.dailyNew }} 个，每组
          {{ state.settings.groupSize }} 个。
        </p>
        <button
          type="button"
          class="primary"
          :disabled="!canLearn"
          @click="$emit('start', 'learn')"
        >
          {{ state.learnCheckpoint ? "继续学习" : "开始学习" }}
        </button>
      </article>
    </div>

    <div v-if="books.length" class="book-strip">
      <div v-for="{ book, stats } in books" :key="book.id" class="book-row">
        <div class="book-row-head">
          <span class="book-name">{{ book.name }}</span>
          <span class="muted">
            {{ stats.learned }} / {{ stats.total }}
            <template v-if="stats.due"> · {{ stats.due }} 到期</template>
          </span>
        </div>
        <div class="meter">
          <span
            :style="{
              width: `${stats.total ? (stats.learned / stats.total) * 100 : 0}%`,
            }"
          ></span>
        </div>
      </div>
    </div>

    <p v-if="!state.cards.length" class="empty-note">
      还没有词条。可以导入词表，或打开一本词书手动添加。
    </p>
  </section>
</template>
