<script setup>
import { nextTick, ref, watch } from "vue";
import Icon from "../../../shared/Icon.vue";
import TypeAnswerInput from "../../../shared/TypeAnswerInput.vue";

const props = defineProps({
  card: { type: Object, required: true },
  index: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  answer: { type: String, default: "" },
  busy: Boolean,
  feedback: { type: String, default: "" },
});
const emit = defineEmits(["update:answer", "submit", "skip"]);

const inputEl = ref(null);
defineExpose({
  focus: () => inputEl.value?.focus(),
});

watch(
  () => props.card.id,
  () => nextTick(() => inputEl.value?.focus()),
  { immediate: true },
);

function mask(term) {
  return String(term ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0] + "·".repeat(word.length - 1))
    .join(" ");
}
</script>

<template>
  <div class="stage">
    <div class="stage-content spell-stage">
      <div class="spell-column">
        <p class="stage-meta">
          <span>拼写</span>
          <span>{{ index + 1 }} / {{ total }}</span>
        </p>

        <div class="senses spell-prompt">
          <p v-for="(sense, i) in card.senses" :key="i" class="sense">
            <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
            <span>{{ sense.text }}</span>
          </p>
        </div>

        <p class="hint">{{ mask(card.term) }}</p>

        <div class="spell-input-wrap">
          <TypeAnswerInput
            ref="inputEl"
            :model-value="answer"
            :disabled="busy"
            :invalid="Boolean(feedback)"
            aria-label="拼写英文词条"
            @update:model-value="emit('update:answer', $event)"
            @submit="emit('submit')"
          />
        </div>

        <p class="feedback spelling-feedback" role="status">
          <Icon v-if="feedback" name="alert" :size="16" />{{ feedback }}
        </p>
      </div>
    </div>
    <div class="stage-actions">
      <button type="button" class="ghost" :disabled="busy" @click="emit('skip')">
        跳过拼写 <kbd>Esc</kbd>
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage-actions {
  justify-content: center;
}

.spell-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 40px;
}

.spell-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(560px, 100%);
  text-align: center;
}

.spell-column .stage-meta {
  justify-content: center;
}

.spell-column .spell-prompt {
  justify-items: center;
  width: 100%;
  margin: 16px 0 8px;
}

.spell-column .spell-prompt .sense {
  justify-content: center;
}

.spell-column .hint {
  margin-top: 8px;
  margin-bottom: 12px;
}

.spell-input-wrap {
  width: 100%;
  margin-top: 4px;
}

.spell-column .spelling-feedback {
  justify-content: center;
  text-align: center;
}
</style>
