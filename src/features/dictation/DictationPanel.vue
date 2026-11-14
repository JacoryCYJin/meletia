<script setup>
import { nextTick, ref, watch } from "vue";
import Icon from "../../shared/Icon.vue";
import PronunciationButtons from "../../shared/PronunciationButtons.vue";
import WordDetail from "../../shared/WordDetail.vue";
import TypeAnswerInput from "../../shared/TypeAnswerInput.vue";
import DictationSummary from "../study/DictationSummary.vue";
import { SPEECH_ACCENTS } from "../../core/speech.js";

const props = defineProps({
  phase: { type: String, required: true },
  dictation: { type: Object, default: null },
  card: { type: Object, default: null },
  feedbackCard: { type: Object, default: null },
  answer: { type: String, default: "" },
  busy: Boolean,
  correct: Boolean,
  replaysLeft: { type: Number, default: 0 },
  accent: { type: String, required: true },
  summary: { type: Object, required: true },
  secondaryLabel: { type: String, default: "换词书" },
});
const emit = defineEmits([
  "update:answer",
  "submit",
  "replay",
  "accent",
  "continue",
  "skip",
  "restart",
  "secondary",
]);

const inputEl = ref(null);
watch(
  () => `${props.phase}:${props.card?.id ?? ""}`,
  () => {
    if (props.phase !== "dictation") return;
    nextTick(() => inputEl.value?.focus());
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="phase === 'dictation' && card" class="stage">
    <div class="stage-content dictation-stage">
      <div class="dictation-column">
        <p class="dictation-progress">
          听写 {{ (dictation?.index ?? 0) + 1 }} / {{ dictation?.list.length }}
        </p>

        <div class="dictation-listen">
          <button
            type="button"
            class="dictation-play"
            :disabled="busy || correct"
            @click="emit('replay')"
          >
            <Icon name="volume" :size="19" />
            <span>{{ replaysLeft ? "再听一次" : "听不出，查看答案" }}</span>
            <kbd>Tab</kbd>
          </button>
          <div class="dictation-accents" role="group" aria-label="发音口音">
            <button
              v-for="item in SPEECH_ACCENTS"
              :key="item.id"
              type="button"
              :class="{ selected: accent === item.id }"
              :aria-pressed="accent === item.id"
              :disabled="busy || correct"
              @click="emit('accent', item.id)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <p class="dictation-left">本轮还可重播 {{ replaysLeft }} 次</p>
        <p class="dictation-hint">只听发音，写出你听到的英文。</p>

        <div class="dictation-form">
          <TypeAnswerInput
            ref="inputEl"
            :model-value="answer"
            :disabled="busy || correct"
            aria-label="听写英文词条"
            @update:model-value="emit('update:answer', $event)"
            @submit="emit('submit')"
          />
        </div>

        <p v-if="correct" class="dictation-correct" role="status">
          <Icon name="check" :size="16" />回答正确
        </p>
      </div>
    </div>
    <div class="stage-actions dictation-actions">
      <button type="button" class="ghost" :disabled="busy" @click="emit('skip')">
        结束听写 <kbd>Esc</kbd>
      </button>
    </div>
  </div>

  <div v-else-if="phase === 'dictation-feedback' && feedbackCard" class="stage">
    <div class="stage-content dictation-stage">
      <div class="dictation-column">
        <p class="dictation-progress">
          听写 {{ (dictation?.index ?? 0) + 1 }} / {{ dictation?.list.length }}
        </p>
        <h2 class="dictation-answer">{{ feedbackCard.term }}</h2>
        <PronunciationButtons :text="feedbackCard.term" :card-key="feedbackCard.id" />
        <div class="dictation-detail">
          <WordDetail :card="feedbackCard" />
        </div>
        <p class="dictation-wrong" role="status">
          <Icon name="alert" :size="16" />没听出来，这个词会在本轮末尾再考一次。
        </p>
      </div>
    </div>
    <div class="stage-actions dictation-actions">
      <button
        type="button"
        class="primary big"
        :disabled="busy"
        @click="emit('continue')"
      >
        继续 <kbd>回车</kbd>
      </button>
    </div>
  </div>

  <div v-else-if="phase === 'dictation-finished'" class="stage summary-stage">
    <DictationSummary
      :summary="summary"
      :busy="busy"
      :secondary-label="secondaryLabel"
      @restart="emit('restart')"
      @secondary="emit('secondary')"
    />
  </div>
</template>

<style scoped>
.dictation-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 40px;
}

.dictation-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(560px, 100%);
  text-align: center;
}

.dictation-progress {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.dictation-listen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

.dictation-play {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  padding-inline: 18px;
  border: 0;
  border-radius: 10px;
  background: var(--ink);
  color: var(--bg);
  font-size: 14px;
  font-weight: 500;
}

.dictation-play:hover:not(:disabled) {
  opacity: 0.88;
}

.dictation-play kbd {
  background: rgba(127, 127, 127, 0.22);
  color: inherit;
}

.dictation-accents {
  display: inline-flex;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.dictation-accents button {
  height: 100%;
  padding-inline: 15px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
}

.dictation-accents button + button {
  border-left: 1px solid var(--line);
}

.dictation-accents button.selected {
  background: var(--ink);
  color: var(--bg);
}

.dictation-accents button:hover:not(:disabled):not(.selected) {
  background: var(--hover);
  color: var(--ink);
}

.dictation-left {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.dictation-hint {
  margin-top: 22px;
  color: var(--muted);
  font-size: 14px;
}

.dictation-form {
  width: 100%;
  margin-top: 14px;
}

.dictation-correct {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: var(--success);
  font-size: 13px;
}

.dictation-answer {
  margin-top: 14px;
  font-size: 40px;
  line-height: 1.2;
  letter-spacing: -0.03em;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.dictation-detail {
  width: 100%;
  margin-top: 18px;
  text-align: left;
}

.dictation-wrong {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  color: var(--danger);
  font-size: 13px;
}

.dictation-actions {
  justify-content: center;
}

@media (max-width: 740px) {
  .dictation-stage {
    padding: 24px;
  }
}
</style>
