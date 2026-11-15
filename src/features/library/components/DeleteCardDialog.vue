<script setup>
import { nextTick, ref } from "vue";
import Icon from "../../../shared/Icon.vue";

const props = defineProps({
  name: { type: String, default: "" },
  retentionDays: { type: Number, default: 7 },
  busy: Boolean,
  error: { type: String, default: "" },
});
const emit = defineEmits(["close", "confirm"]);

const dialog = ref(null);
const keyboard = ref(false);
let opener;

async function open(event) {
  opener = event?.currentTarget ?? null;
  keyboard.value = event?.detail === 0;
  await nextTick();
  dialog.value?.showModal();
  dialog.value?.querySelector(".cancel-delete-card")?.focus();
}

function close() {
  if (props.busy) return;
  dialog.value?.close();
  opener?.focus({ preventScroll: true });
  emit("close");
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialog"
    class="modal card-delete-dialog"
    role="alertdialog"
    aria-labelledby="card-delete-title"
    aria-describedby="card-delete-description"
    :aria-busy="busy"
    :data-keyboard="keyboard"
    @keydown="keyboard = true"
    @pointerdown="keyboard = false"
    @cancel.prevent="close"
    @keydown.esc.prevent.stop="close"
  >
    <header class="modal-head">
      <h2 id="card-delete-title">删除「{{ name }}」？</h2>
      <button
        type="button"
        class="icon-button"
        aria-label="关闭删除确认"
        :disabled="busy"
        @click="close"
      >
        <Icon name="close" :size="18" />
      </button>
    </header>
    <div class="modal-body">
      <p id="card-delete-description">
        词条及其学习记录将移入回收站，保留 {{ retentionDays }} 天，到期后永久删除。
      </p>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    </div>
    <footer class="modal-foot">
      <button
        type="button"
        class="cancel-delete-card"
        :disabled="busy"
        @click="close"
      >
        取消
      </button>
      <button type="button" class="danger" :disabled="busy" @click="emit('confirm')">
        {{ busy ? "正在删除…" : "删除词条" }}
      </button>
    </footer>
  </dialog>
</template>

<style scoped>
.card-delete-dialog {
  width: min(380px, calc(100% - 32px));
}
.card-delete-dialog[data-keyboard="false"] button:focus-visible {
  outline: none;
}
.card-delete-dialog h2 {
  overflow-wrap: anywhere;
}
.card-delete-dialog .modal-body {
  color: var(--muted);
  line-height: 1.7;
}
.card-delete-dialog .field-error {
  margin-top: 12px;
}
</style>
