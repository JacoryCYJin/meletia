<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state } from "../../core/library.js";
import { localDay } from "../../core/content.js";
import { availableStudyDays, studyExport, saveStudyExport } from "../../core/study-export.js";
import { notify } from "../../core/notifications.js";
import Modal from "../../shared/Modal.vue";

const emit = defineEmits(["close"]);
const now = ref(new Date());
const selectedDay = ref("");
const exporting = ref(false);
const days = computed(() => availableStudyDays(state.cards, state.reviews, now.value));
let timer;
onMounted(() => { timer = setInterval(() => { now.value = new Date(); }, 1000); });
onUnmounted(() => clearInterval(timer));
async function exportSelected() {
  if (exporting.value || state.busy) return;
  const at = new Date();
  const day = selectedDay.value || localDay(at);
  const file = studyExport(state.cards, state.books, state.reviews, at, day);
  if (!file.rows.length) {
    notify.info(`${day} 没有可导出的学习记录。`);
    return;
  }
  exporting.value = true;
  try {
    await saveStudyExport(file);
    notify.success(`已导出 ${day} 的 ${file.rows.length} 个词。`);
    emit("close");
  } catch (cause) {
    notify.error(`导出失败，请重试。${String(cause.message ?? cause)}`);
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <Modal class="study-export-dialog" title="导出词语状态" :busy="exporting" @close="emit('close')">
    <form id="study-export-form" @submit.prevent="exportSelected">
      <label class="field" for="study-export-day">
        <span>记录日期</span>
        <select id="study-export-day" v-model="selectedDay" :disabled="exporting">
          <option value="">今天 · {{ localDay(now) }}</option>
          <option v-for="day in days.filter(day => day !== localDay(now))" :key="day" :value="day">{{ day }}</option>
        </select>
      </label>
      <p class="export-help">每次导出一天的词语状态。补导时，先导出较早日期，再导出今天。</p>
    </form>
    <template #footer>
      <button type="button" :disabled="exporting" @click="emit('close')">取消</button>
      <button type="submit" form="study-export-form" class="primary" :disabled="exporting || state.busy">{{ exporting ? "正在导出…" : "导出" }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.study-export-dialog { width: min(400px, calc(100% - 32px)); }
.export-help { color: var(--muted); font-size: 12px; line-height: 1.6; margin-top: 12px; }
</style>
