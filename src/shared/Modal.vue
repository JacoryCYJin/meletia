<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "./Icon.vue";
const props = defineProps({
  title: String,
  description: String,
  busy: Boolean,
  wide: Boolean,
});
const emit = defineEmits(["close"]);
const dialog = ref(null);
onBeforeUnmount(() => dialog.value?.close());
onMounted(async () => {
  await nextTick();
  dialog.value?.showModal();
  dialog.value
    ?.querySelector(
      ".modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea",
    )
    ?.focus();
});
function requestClose() {
  if (!props.busy) emit("close");
}
</script>
<template>
  <dialog
    ref="dialog"
    class="modal"
    :class="{ 'modal-wide': wide }"
    aria-labelledby="modal-title"
    :aria-describedby="description ? 'modal-description' : undefined"
    @cancel.prevent="requestClose"
  >
    <header class="modal-head">
      <div>
        <h2 id="modal-title">{{ title }}</h2>
        <p v-if="description" id="modal-description">{{ description }}</p>
      </div>
      <button
        type="button"
        class="icon-button"
        aria-label="关闭窗口"
        :disabled="busy"
        @click="requestClose"
      >
        <Icon name="close" :size="18" />
      </button>
    </header>
    <div class="modal-body"><slot /></div>
    <footer v-if="$slots.footer" class="modal-foot">
      <slot name="footer" />
    </footer>
  </dialog>
</template>
