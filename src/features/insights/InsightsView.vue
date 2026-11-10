<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { streakOf, todayLabel } from "../../core/stats.js";
import Icon from "../../shared/Icon.vue";
import LearningCalendar from "./LearningCalendar.vue";
import ExportStudyStatusDialog from "./ExportStudyStatusDialog.vue";
const exportOpen = ref(false);
const exportButton = ref(null);
async function closeExport() {
  exportOpen.value = false;
  await nextTick();
  exportButton.value?.focus({ preventScroll: true });
}
const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 60000);
});
onUnmounted(() => clearInterval(timer));
const streak = computed(() => streakOf(state.reviews, now.value));
const today = computed(() => todayLabel(state.cards, state.reviews, now.value));
const learned = computed(
  () => state.cards.filter((c) => c.progress.stage !== "new").length,
);
</script>
<template>
  <section class="page insights-page">
    <header class="page-head insights-header">
      <div>
      <h1>学习记录</h1>
      <p class="lede">一点一滴，都有迹可循。</p>
      </div>
      <button type="button" class="insights-export" ref="exportButton" @click="exportOpen = true">
        <Icon name="import" :size="16" /> 导出
      </button>
    </header>
    <ExportStudyStatusDialog v-if="exportOpen" @close="closeExport" />
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
    <LearningCalendar :reviews="state.reviews" :now="now" />
    <p class="section-note">
      统计仅来自本机词书与评分记录，同词在不同词书中独立计算。
    </p>
  </section>
</template>

<style scoped>
.insights-page {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 2vh, 20px);
  max-width: none;
}
.insights-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
}
.insights-export { flex: none; }
.record-intro { padding: 8px 0; }
.record-facts { grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 20px 0; margin: 0; }
.section-note { margin: 0; max-width: none; }
@media (max-height: 750px), (min-width: 1400px) and (min-aspect-ratio: 2/1) {
  .insights-page { gap: 4px; }
  .insights-header h1 { font-size: 24px; line-height: 1.3; }
  .insights-header .lede { margin-top: 4px; font-size: 12px; line-height: 1.5; }
  .record-intro { padding: 4px 0; gap: 12px; }
  .record-intro strong { font-size: 14px; }
  .record-intro span { font-size: 11px; line-height: 1.5; margin-top: 2px; }
  .record-facts { padding: 8px 0; gap: 8px; }
  .record-facts dt { font-size: 11px; }
  .record-facts dd { margin-top: 4px; font-size: 20px; }
  .record-facts small { margin-left: 4px; }
  .section-note { font-size: 11px; line-height: 1.4; }
}
@media (max-height: 650px) and (min-width: 1000px) {
  .insights-page { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 24px; row-gap: 4px; }
  .insights-header { display: contents; }
  .insights-header > div { grid-column: 1; grid-row: 1; }
  .insights-export { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; }
  .record-intro { grid-column: 2; grid-row: 1; justify-self: center; padding: 0; }
  .record-facts, .learning-calendar, .section-note { grid-column: 1 / -1; }
  .record-facts > div { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .record-facts dd { margin: 0; }
}
</style>
