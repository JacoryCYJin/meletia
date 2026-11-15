<script setup>
import { ref } from "vue";
import Modal from "../../../shared/Modal.vue";
import { createBook } from "../actions.js";

const emit = defineEmits(["close", "created"]);
const name = ref("");
const pending = ref(false);
const error = ref("");

async function save() {
  if (!name.value.trim() || pending.value) return;
  error.value = "";
  pending.value = true;
  try {
    await createBook(name.value);
    name.value = "";
    emit("created");
  } catch (cause) {
    error.value = String(cause);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <Modal
    title="新建词书"
    description="给这本词书起个容易找到的名字。"
    :busy="pending"
    @close="emit('close')"
  >
    <form id="create-book-form" @submit.prevent="save">
      <label class="field"
        ><span>词书名称</span
        ><input
          v-model="name"
          aria-label="词书名称"
          placeholder="例如：阅读中遇到的词"
          maxlength="120"
          :disabled="pending"
          autofocus
          required
      /></label>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    </form>
    <template #footer
      ><button :disabled="pending" @click="emit('close')">取消</button
      ><button
        class="primary"
        form="create-book-form"
        :disabled="pending || !name.trim()"
      >
        {{ pending ? "正在创建…" : "创建词书" }}
      </button></template
    >
  </Modal>
</template>
