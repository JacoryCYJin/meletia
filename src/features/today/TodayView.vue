<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { bookStats } from "../../core/books.js";
import { dayTasks, streakOf, todayLabel } from "../../core/stats.js";

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
  dayTasks(state.cards, state.books, state.settings, now.value),
);
const reviewTotal = computed(
  () => tasks.value.recall.length + tasks.value.review.length,
);
const streak = computed(() => streakOf(state.reviews, now.value));
const today = computed(() => todayLabel(state.cards, state.reviews, now.value));

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
  return parts.length ? `今天有 ${parts.join("，")}。` : "今天的任务做完了。";
});
</script>

<template>
  <section class="page">
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

      <article class="task" :class="{ quiet: !tasks.fresh.length }">
        <p class="task-label">学习</p>
        <p class="task-count">{{ tasks.fresh.length }}</p>
        <p class="task-hint">
          每日上限 {{ state.settings.dailyNew }} 个，每组
          {{ state.settings.groupSize }} 个，答对
          {{ state.settings.learnStreak }} 次进入复习。
        </p>
        <button
          type="button"
          class="primary"
          :disabled="!tasks.fresh.length"
          @click="$emit('start', 'learn')"
        >
          开始学习
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

    <dl class="facts">
      <div>
        <dt>连续</dt>
        <dd>{{ streak }} 天</dd>
      </div>
      <div>
        <dt>今日复习</dt>
        <dd>{{ today.reviewedToday }}</dd>
      </div>
      <div>
        <dt>今日学会</dt>
        <dd>{{ today.introducedToday }}</dd>
      </div>
      <div>
        <dt>词库</dt>
        <dd>{{ state.cards.length }} 张</dd>
      </div>
    </dl>

    <p v-if="!state.cards.length" class="empty-note">
      还没有词条。到「导入」页拖入飞书导出的 CSV，或在「词库」里手写一条。
    </p>
  </section>
</template>
