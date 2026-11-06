<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { recentDays, streakOf, todayLabel } from "../../core/stats.js";

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 60000);
});
onUnmounted(() => clearInterval(timer));

const streak = computed(() => streakOf(state.reviews, now.value));
const today = computed(() => todayLabel(state.cards, state.reviews, now.value));
const days = computed(() => recentDays(state.reviews, now.value, 14));
const peak = computed(() => Math.max(1, ...days.value.map((day) => day.count)));
const learned = computed(
  () => state.cards.filter((card) => card.progress.stage !== "new").length,
);
</script>

<template>
  <section class="page">
    <header class="page-head">
      <p class="eyebrow">数据</p>
      <h1>{{ streak }} 天连续</h1>
      <p class="lede">只统计这台电脑上的词书与复习记录。</p>
    </header>

    <dl class="facts">
      <div>
        <dt>词书卡片</dt>
        <dd>{{ state.cards.length }}</dd>
      </div>
      <div>
        <dt>已开始学</dt>
        <dd>{{ learned }}</dd>
      </div>
      <div>
        <dt>今日复习</dt>
        <dd>{{ today.reviewedToday }}</dd>
      </div>
      <div>
        <dt>累计评分</dt>
        <dd>{{ state.reviews.length }}</dd>
      </div>
    </dl>

    <div class="chart">
      <p class="block-label">最近 14 天</p>
      <div class="bars">
        <div v-for="day in days" :key="day.day" class="bar-column">
          <span
            class="bar-fill"
            :class="{ empty: !day.count }"
            :style="{ height: `${Math.max(4, (day.count / peak) * 100)}%` }"
            :title="`${day.day} · ${day.count} 次`"
          ></span>
          <span class="bar-day">{{ day.day.slice(5) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
