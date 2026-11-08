<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { recentDays, streakOf, todayLabel } from "../../core/stats.js";
import Icon from "../../shared/Icon.vue";
const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 60000);
});
onUnmounted(() => clearInterval(timer));
const streak = computed(() => streakOf(state.reviews, now.value));
const today = computed(() => todayLabel(state.cards, state.reviews, now.value));
const days = computed(() => recentDays(state.reviews, now.value, 14));
const peak = computed(() => Math.max(1, ...days.value.map((d) => d.count)));
const learned = computed(
  () => state.cards.filter((c) => c.progress.stage !== "new").length,
);
const selectedDay = ref("");
const activeDay = computed(
  () =>
    days.value.find((d) => d.day === selectedDay.value) || days.value.at(-1),
);
</script>
<template>
  <section class="page insights-page">
    <header class="page-head">
      <h1>学习记录</h1>
      <p class="lede">一点一滴，都有迹可循。</p>
    </header>
    <div class="record-intro">
      <Icon name="history" :size="24" />
      <p>
        <strong>{{
          streak ? `已连续学习 ${streak} 天` : "今天也可以是新的开始"
        }}</strong
        ><span>{{
          state.reviews.length
            ? "记录你的每次学习与复习，不与别人比较。"
            : "完成第一组学习后，你的记录就会出现在这里。"
        }}</span>
      </p>
    </div>
    <dl class="record-facts">
      <div>
        <dt>今日复习</dt>
        <dd>{{ today.reviewedToday }}<small>个词</small></dd>
      </div>
      <div>
        <dt>已开始学习</dt>
        <dd>{{ learned }}<small>个词</small></dd>
      </div>
      <div>
        <dt>词书中的词条</dt>
        <dd>{{ state.cards.length }}<small>个词</small></dd>
      </div>
      <div>
        <dt>累计评分记录</dt>
        <dd>{{ state.reviews.length }}<small>次</small></dd>
      </div>
    </dl>
    <section class="activity-section">
      <div class="section-line">
        <h2>最近 14 天</h2>
        <span>学习与复习评分次数</span>
      </div>
      <div
        v-if="state.reviews.length"
        class="activity-readout"
        aria-live="polite"
      >
        <span>{{ activeDay?.day }}</span
        ><strong>{{ activeDay?.count ?? 0 }} 次</strong>
      </div>
      <div v-if="state.reviews.length" class="activity-chart">
        <button
          v-for="day in days"
          :key="day.day"
          class="activity-day"
          :class="{ active: activeDay?.day === day.day }"
          :aria-label="`${day.day}，${day.count} 次记录`"
          :aria-pressed="activeDay?.day === day.day"
          @click="selectedDay = day.day"
          @focus="selectedDay = day.day"
        >
          <span class="activity-track"
            ><span
              class="activity-fill"
              :class="{ empty: !day.count }"
              :style="{
                height: `${Math.max(2, (day.count / peak) * 100)}%`,
              }" /></span
          ><span>{{ day.day.slice(5).replace("-", "/") }}</span>
        </button>
      </div>
      <div v-else class="chart-empty">
        <Icon name="insights" :size="28" />
        <h3>还没有学习记录</h3>
        <p>完成第一组学习后，这里会逐日留下你的进度。</p>
      </div>
    </section>
    <p class="section-note">
      统计仅来自本机词书与评分记录，同词在不同词书中独立计算。
    </p>
  </section>
</template>
