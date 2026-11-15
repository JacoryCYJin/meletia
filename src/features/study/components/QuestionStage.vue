<script setup>
import Icon from "../../../shared/Icon.vue";
import PronunciationButtons from "../../speech/PronunciationButtons.vue";
import WordDetail from "../../library/components/WordDetail.vue";

const props = defineProps({
  card: { type: Object, required: true },
  phase: { type: String, required: true },
  round: { type: String, default: "" },
  roundLabel: { type: String, default: "" },
  meaning: { type: String, default: "" },
  choices: { type: Array, default: () => [] },
  grades: { type: Array, default: () => [] },
  showMeaning: Boolean,
  unaidedRecall: Boolean,
  learningChoice: Boolean,
  choiceFeedback: Boolean,
  correctFeedback: Boolean,
  selectedChoice: { type: String, default: null },
  openedChoices: { type: Set, default: () => new Set() },
  busy: Boolean,
  canMarkWrong: Boolean,
});
const emit = defineEmits([
  "choose",
  "grade",
  "open-detail",
  "next",
  "mark-wrong",
  "skip-word",
]);

function isRevealed(choice) {
  if (props.correctFeedback) return choice.correct;
  return (
    props.choiceFeedback &&
    (choice.correct ||
      props.selectedChoice === choice.text ||
      props.openedChoices.has(choice.text))
  );
}

function choiceResult(choice) {
  if ((props.correctFeedback || props.choiceFeedback) && choice.correct) {
    return "correct";
  }
  if (props.choiceFeedback && props.selectedChoice === choice.text) {
    return "incorrect";
  }
  return "";
}
</script>

<template>
  <div class="stage-content">
    <p class="stage-meta">
      <span>{{ showMeaning && phase === "card" ? "看释义" : roundLabel }}</span>
      <span v-if="card.source && !unaidedRecall" class="tag">{{
        card.source
      }}</span>
    </p>

    <div v-if="round === 'reverse' && phase === 'card'" class="senses">
      <p v-for="(sense, index) in card.senses" :key="index" class="sense">
        <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
        <span>{{ sense.text }}</span>
      </p>
    </div>
    <template v-else>
      <h2 class="term">{{ card.term }}</h2>
      <PronunciationButtons :text="card.term" :card-key="card.id" />
      <p
        v-if="!unaidedRecall && (card.phonetics?.uk || card.phonetics?.us)"
        class="phonetic"
      >
        /{{ card.phonetics.uk || card.phonetics.us }}/
      </p>
    </template>

    <template v-if="phase === 'detail'">
      <WordDetail
        :card="card"
        :class="{ 'choice-detail-enter': learningChoice }"
      />
    </template>

    <template v-else-if="!meaning && !choiceFeedback">
      <p class="waiting">此词暂无释义，可以在所属词书中补充。</p>
    </template>

    <template v-else-if="showMeaning">
      <WordDetail :card="card" />
    </template>

    <template v-else-if="choices.length">
      <div
        class="study-choices"
        :class="{ 'choice-cards': learningChoice }"
        role="group"
        aria-label="选择中文释义"
      >
        <span v-if="learningChoice" class="choice-announcement" role="status">
          {{
            correctFeedback
              ? "回答正确"
              : choiceFeedback
                ? "回答错误，可查看其他选项"
                : ""
          }}
        </span>
        <div
          v-for="(choice, index) in choices"
          :key="choice.text"
          class="choice-row"
        >
          <button
            type="button"
            :data-result="
              choiceResult(choice) ||
              (choiceFeedback && isRevealed(choice) ? 'distractor' : undefined)
            "
            :disabled="
              busy ||
              correctFeedback ||
              (choiceFeedback && Boolean(choiceResult(choice)))
            "
            :aria-expanded="choiceFeedback ? isRevealed(choice) : undefined"
            :title="choice.meaning"
            @click="emit('choose', choice)"
          >
            <template v-if="learningChoice">
              <span
                class="choice-copy"
                :class="{ 'is-revealed': isRevealed(choice) }"
              >
                <span
                  class="choice-top choice-prompt choice-pos"
                  :aria-hidden="isRevealed(choice)"
                >
                  {{ choice.pos }}
                </span>
                <span
                  class="choice-bottom choice-prompt"
                  :aria-hidden="isRevealed(choice)"
                >
                  {{ choice.meaning }}
                </span>
                <span
                  class="choice-top choice-answer choice-word"
                  :aria-hidden="!isRevealed(choice)"
                >
                  {{ choice.term }}
                </span>
                <span
                  class="choice-bottom choice-answer"
                  :aria-hidden="!isRevealed(choice)"
                >
                  <span v-if="choice.pos" class="choice-pos">{{
                    choice.pos
                  }}</span>
                  {{ choice.meaning }}
                </span>
              </span>
              <span class="choice-mark">
                <template v-if="choiceResult(choice)">
                  <Icon
                    :name="choice.correct ? 'check' : 'close'"
                    :size="16"
                  />
                  <span class="choice-announcement">{{
                    choice.correct ? "正确答案" : "错误选项"
                  }}</span>
                </template>
                <Icon
                  v-else-if="choiceFeedback"
                  class="choice-chevron"
                  name="chevronDown"
                  :size="16"
                />
              </span>
            </template>
            <template v-else>
              <span class="choice-pos">{{ choice.pos }}</span>
              <span>{{ choice.meaning }}</span>
            </template>
            <kbd>{{ index + 1 }}</kbd>
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <p v-if="round === 'choice'" class="waiting">
        释义选项不足，请回想词义后自评。
      </p>
    </template>
  </div>

  <template v-if="phase === 'detail'">
    <div
      class="stage-actions"
      :class="{ 'choice-detail-enter': learningChoice }"
    >
      <button
        v-if="canMarkWrong"
        type="button"
        class="ghost"
        :disabled="busy"
        @click="emit('mark-wrong')"
      >
        记错了 <kbd>E</kbd>
      </button>
      <button
        type="button"
        class="primary big"
        :disabled="busy"
        @click="emit('next')"
      >
        下一词 <kbd>空格</kbd>
      </button>
    </div>
  </template>

  <template v-else-if="!meaning && !choiceFeedback">
    <div class="stage-actions">
      <button
        type="button"
        class="ghost"
        :disabled="busy"
        @click="emit('skip-word')"
      >
        暂跳此词
      </button>
    </div>
  </template>

  <template v-else-if="showMeaning">
    <div class="stage-actions">
      <button
        type="button"
        class="primary big"
        :disabled="busy"
        @click="emit('grade', 3)"
      >
        下一词 <kbd>空格</kbd>
      </button>
    </div>
  </template>

  <template v-else-if="choices.length">
    <div class="stage-actions">
      <button
        v-if="learningChoice"
        type="button"
        class="big choice-action"
        :class="choiceFeedback ? 'primary' : 'ghost'"
        :disabled="busy || correctFeedback"
        @click="choiceFeedback ? emit('open-detail') : emit('grade', 1)"
      >
        {{ choiceFeedback ? "查看详情" : "看答案" }} <kbd>空格</kbd>
      </button>
      <button
        v-else
        type="button"
        class="ghost"
        :disabled="busy"
        @click="emit('grade', 1)"
      >
        看答案
      </button>
    </div>
  </template>

  <template v-else>
    <div class="stage-actions">
      <button
        v-for="item in grades"
        :key="item.value"
        type="button"
        class="grade"
        :class="'grade-' + item.value"
        :disabled="busy"
        @click="emit('grade', item.value)"
      >
        {{ item.label }} <kbd>{{ item.key }}</kbd>
      </button>
      <button
        v-if="round === 'choice'"
        type="button"
        class="ghost"
        @click="emit('grade', 1)"
      >
        看答案
      </button>
    </div>
  </template>
</template>

<style scoped>
.study-choices {
  display: grid;
  padding-top: 12px;
}

.study-choices button {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-height: var(--control-height);
  width: 100%;
  height: auto;
  padding: 7px 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}

.choice-row + .choice-row {
  border-top: 1px solid var(--line);
}

.study-choices:not(.choice-cards) button:hover:not(:disabled),
.choice-cards button:not([data-result]):hover:not(:disabled) {
  background: var(--hover);
}

.study-choices button:focus-visible {
  position: relative;
  z-index: 1;
}

.choice-pos {
  font-family: var(--mono);
  color: var(--muted);
}

.choice-cards {
  position: relative;
  gap: 8px;
  --correct-fill: #eaf6ed;
  --correct-line: #a5d2b0;
  --correct-ink: #24623b;
  --incorrect-fill: #fceeed;
  --incorrect-line: #e5afaa;
  --incorrect-ink: #a13b34;
}

.choice-cards .choice-row + .choice-row {
  border-top: 0;
}

.choice-cards button {
  grid-template-columns: minmax(0, 1fr) 20px;
  gap: 12px;
  min-height: 72px;
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
  transition:
    background-color 450ms ease,
    border-color 450ms ease;
}

.choice-cards kbd {
  background: transparent;
}

.study-choices button,
.stage-actions button:has(> kbd) {
  position: relative;
  padding-inline-end: 52px;
}

.study button > kbd {
  position: absolute;
  inset-inline-end: 12px;
  top: 50%;
  margin: 0;
  transform: translateY(-50%);
}

.choice-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
  min-width: 0;
}

.choice-top {
  grid-area: 1 / 1;
}

.choice-bottom {
  grid-area: 2 / 1;
}

.choice-cards .choice-top,
.choice-cards .choice-bottom {
  display: block;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.choice-bottom .choice-pos {
  margin-right: 4px;
  font-size: 0.9em;
}

.choice-word {
  font-weight: 600;
}

.choice-answer,
.choice-copy.is-revealed .choice-prompt {
  opacity: 0;
  user-select: none;
  transition: opacity 200ms ease-in;
}

.choice-prompt,
.choice-copy.is-revealed .choice-answer {
  opacity: 1;
  transition: opacity 300ms ease-out 150ms;
}

.choice-mark {
  display: grid;
  place-items: center;
  align-self: center;
  color: var(--muted);
}

.choice-cards button[aria-expanded="true"] .choice-chevron {
  transform: rotate(180deg);
}

.choice-cards button[data-result="correct"] {
  background: var(--correct-fill);
  border-color: var(--correct-line);
}

.choice-cards button[data-result="correct"] :is(.choice-mark, .choice-word) {
  color: var(--correct-ink);
}

.choice-cards button:is([data-result="incorrect"], [data-result="distractor"]) {
  background: var(--incorrect-fill);
  border-color: var(--incorrect-line);
}

.choice-cards
  button:is([data-result="incorrect"], [data-result="distractor"])
  :is(.choice-mark, .choice-word) {
  color: var(--incorrect-ink);
}

.choice-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.choice-action {
  inline-size: 140px;
  justify-content: center;
}

.stage-actions {
  justify-content: center;
}

.stage-content > .stage-meta {
  justify-content: center;
}

.stage-content > .term,
.stage-content > .phonetic {
  text-align: center;
}

.stage-content :deep(.pronunciations) {
  justify-content: center;
}

.choice-detail-enter {
  animation: choice-detail-in 320ms ease-out both;
}

@keyframes choice-detail-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-color-scheme: dark) {
  .choice-cards {
    --correct-fill: #1d3428;
    --correct-line: #486f55;
    --correct-ink: #b0dbb9;
    --incorrect-fill: #402625;
    --incorrect-line: #80534e;
    --incorrect-ink: #f3b5ad;
  }
}

@media (prefers-reduced-motion: reduce) {
  .choice-cards button,
  .choice-cards .choice-copy :is(.choice-prompt, .choice-answer) {
    transition: none;
  }

  .choice-detail-enter {
    animation: none;
  }
}

</style>
