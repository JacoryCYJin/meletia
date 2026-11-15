<script setup>
import Modal from "../../shared/Modal.vue";
import { DICTATION_RANGES } from "./tasks.js";

defineProps({
  open: Boolean,
  books: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
  range: { type: String, default: "all" },
  size: { type: Number, default: 10 },
  count: { type: Number, default: 0 },
});
const emit = defineEmits([
  "update:selected",
  "update:range",
  "update:size",
  "close",
  "start",
]);

function toggleBook(id, selected) {
  emit(
    "update:selected",
    selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id],
  );
}
</script>

<template>
  <Modal
    v-if="open"
    class="free-dictation-dialog"
    title="自由练习"
    description="选择词书和范围，只听发音写出英文。自由练习不写听写进度。"
    @close="emit('close')"
  >
    <div class="free-dictation-form">
      <div class="section-line"><h3>词书</h3></div>
      <div v-if="books.length" class="free-dictation-options">
        <label v-for="book in books" :key="book.id">
          <input
            type="checkbox"
            :checked="selected.includes(book.id)"
            @change="toggleBook(book.id, selected)"
          />
          <span>{{ book.name }}</span>
          <small v-if="book.dictation">听写</small>
        </label>
      </div>
      <p v-else class="muted">还没有启用的词书。</p>

      <div class="section-line"><h3>范围</h3></div>
      <div class="free-dictation-options free-dictation-ranges">
        <label v-for="item in DICTATION_RANGES" :key="item.id">
          <input
            type="radio"
            :checked="range === item.id"
            @change="emit('update:range', item.id)"
          />
          <span>{{ item.label }}</span>
        </label>
      </div>

      <label class="field free-dictation-size">
        <span>每组数量</span>
        <select
          :value="size"
          @change="emit('update:size', Number($event.target.value))"
        >
          <option :value="10">10</option>
          <option :value="15">15</option>
          <option :value="20">20</option>
          <option :value="30">30</option>
        </select>
      </label>
      <p class="muted free-dictation-count">本次可选 {{ count }} 个词。</p>
    </div>
    <template #footer>
      <button @click="emit('close')">取消</button>
      <button class="primary" :disabled="!count" @click="emit('start')">
        开始听写
      </button>
    </template>
  </Modal>
</template>

<style scoped>
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
</style>
