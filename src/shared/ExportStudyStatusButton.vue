<script setup>
import { computed, ref } from "vue";
import { state } from "../core/library.js";
import { studyExport, saveStudyExport } from "../core/study-export.js";
import { notify } from "../core/notifications.js";
import { localDay } from "../core/content.js";
import Icon from "./Icon.vue";

const props = defineProps({ disabled: Boolean, day: String, compact: Boolean });
const label = computed(() => props.day ? "导出所选日期" : "导出今日词语状态");
const exporting = ref(false);
async function exportToday() {
  if (exporting.value || state.busy) return;
  const file = studyExport(state.cards, state.books, state.reviews, new Date(), props.day || localDay(new Date()));
  if (!file.rows.length) {
    notify.info(`${props.day || "今天"}没有可导出的学习记录。`);
    return;
  }
  exporting.value = true;
  try {
    await saveStudyExport(file);
    notify.success(`已导出 ${props.day || "今天"} 的 ${file.rows.length} 个词。`);
  } catch (cause) {
    notify.error(`导出失败，请重试。${String(cause.message ?? cause)}`);
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <button type="button" class="export-study-status" :class="{ compact }" :title="label" :aria-label="label" :disabled="disabled || exporting || state.busy" @click="exportToday">
    <Icon name="import" :size="16" /><span v-if="!compact">{{ exporting ? '正在导出…' : label }}</span>
  </button>
</template>

<style scoped>
.compact { width: 34px; min-width: 34px; padding: 8px; }
</style>
