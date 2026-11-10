<script setup>
import { ref } from "vue";
import { renameBook, state } from "../core/library.js";
import { notify } from "../core/notifications.js";
import Modal from "./Modal.vue";

const props = defineProps({ book: { type: Object, required: true } });
const emit = defineEmits(["close"]);
const name = ref(props.book.name);
const busy = ref(false);
const error = ref("");
async function save() {
  if (busy.value || state.busy) return;
  error.value = "";
  busy.value = true;
  try {
    const changed = name.value.trim() !== props.book.name;
    await renameBook(props.book.id, name.value);
    if (changed) notify.success("词书名称已更新。");
    emit("close");
  } catch (cause) {
    error.value = String(cause.message ?? cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal class="rename-book-dialog" title="重命名词书" :busy="busy" @close="emit('close')">
    <form id="rename-book-form" @submit.prevent="save">
      <label class="field" for="rename-book-name">
        <span>词书名称</span>
        <input id="rename-book-name" v-model="name" maxlength="120" :disabled="busy" :aria-invalid="Boolean(error)" :aria-describedby="error ? 'rename-book-error' : undefined" @input="error = ''" />
      </label>
      <p v-if="error" id="rename-book-error" class="field-error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button type="button" :disabled="busy" @click="emit('close')">取消</button>
      <button type="submit" form="rename-book-form" class="primary" :disabled="busy || state.busy">{{ busy ? "正在保存…" : "保存" }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.rename-book-dialog { width: min(400px, calc(100% - 32px)); }
</style>
