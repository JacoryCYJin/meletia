<script setup>
import { ref } from "vue";
import Icon from "../../../shared/Icon.vue";

defineProps({
  done: { type: Number, default: 0 },
  busy: Boolean,
});
defineEmits(["start", "skip"]);

const root = ref(null);
defineExpose({
  focus: () => root.value?.focus(),
});
</script>

<template>
  <div ref="root" class="stage" tabindex="-1">
    <div class="stage-content">
      <span class="success-symbol"><Icon name="check" :size="28" /></span>
      <h2>记住了，再拼一遍</h2>
      <p class="waiting">本组辨识与回想已完成。试试不看英文，写出它们。</p>
      <p class="waiting">完成 {{ done }} 张</p>
    </div>
    <div class="stage-actions">
      <button
        type="button"
        class="primary big"
        :disabled="busy"
        @click="$emit('start')"
      >
        开始拼写 <kbd>回车</kbd>
      </button>
      <button type="button" class="ghost" :disabled="busy" @click="$emit('skip')">
        跳过拼写 <kbd>Esc</kbd>
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage-actions {
  justify-content: center;
}
</style>
