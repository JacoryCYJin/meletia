<script setup>
import { ref } from "vue";
import Icon from "./Icon.vue";

defineProps({
  modelValue: { type: String, default: "" },
  disabled: Boolean,
  invalid: Boolean,
  placeholder: { type: String, default: "输入英文" },
  ariaLabel: { type: String, default: "输入英文" },
});
const emit = defineEmits(["update:modelValue", "submit"]);

const input = ref(null);
defineExpose({
  focus: () => input.value?.focus(),
});
</script>

<template>
  <form class="type-answer" @submit.prevent="emit('submit')">
    <div class="type-answer-field">
      <input
        ref="input"
        :value="modelValue"
        :disabled="disabled"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        :aria-invalid="invalid || undefined"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        type="submit"
        class="type-answer-enter"
        :disabled="disabled || !modelValue.trim()"
        aria-label="提交（回车）"
        title="回车提交"
      >
        <Icon name="enter" :size="18" />
      </button>
    </div>
  </form>
</template>

<style scoped>
.type-answer {
  width: 100%;
}

.type-answer-field {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--bg);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.type-answer-field:focus-within {
  border-color: var(--ink);
  box-shadow: 0 0 0 3px var(--hover);
}

.type-answer-field input[type="text"] {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding-inline: 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--mono);
  font-size: 19px;
}

.type-answer-field input[type="text"]:focus,
.type-answer-field input[type="text"]:focus-visible {
  outline: none;
  box-shadow: none;
}

.type-answer-enter {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
}

.type-answer-enter:hover:not(:disabled) {
  background: var(--hover);
  color: var(--ink);
}
</style>
