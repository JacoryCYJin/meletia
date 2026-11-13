<script setup>
import { computed, onBeforeUnmount, watch } from "vue";
import Icon from "./Icon.vue";
import {
  SPEECH_ACCENTS,
  newSpeechToken,
  speak,
  speechErrorMessage,
  stopSpeech,
} from "../core/speech.js";
import { notify } from "../core/notifications.js";

const props = defineProps({
  text: { type: String, required: true },
  cardKey: { type: [String, Number], default: "" },
});

const isSingleWord = computed(() => {
  const word = props.text.trim();
  return word.length > 0 && !/\s/.test(word);
});

let currentToken = "";
let requestSequence = 0;
let disposed = false;

function cancelCurrent() {
  requestSequence += 1;
  const token = currentToken;
  currentToken = "";
  if (token) stopSpeech(token);
}

async function play(accent) {
  const token = newSpeechToken();
  currentToken = token;
  const sequence = ++requestSequence;
  try {
    const started = await speak(props.text, accent, token);
    if (disposed || sequence !== requestSequence) {
      await stopSpeech(token);
      return;
    }
    if (!started && currentToken === token) currentToken = "";
  } catch (cause) {
    if (!disposed && sequence === requestSequence) {
      if (currentToken === token) currentToken = "";
      notify.error(speechErrorMessage(cause));
    }
  }
}

watch([() => props.text, () => props.cardKey], cancelCurrent);

onBeforeUnmount(() => {
  disposed = true;
  cancelCurrent();
});
</script>

<template>
  <div v-if="isSingleWord" class="pronunciations" role="group" aria-label="播放发音">
    <button
      v-for="accent in SPEECH_ACCENTS"
      :key="accent.id"
      type="button"
      :aria-label="`播放${accent.label}发音`"
      :title="`播放${accent.label}发音（${accent.language}）`"
      @click.stop="play(accent.id)"
    >
      <Icon name="volume" :size="15" />
      <span>{{ accent.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.pronunciations {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.pronunciations button {
  height: 30px;
  padding: 0 8px;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}

.pronunciations button:hover:not(:disabled) {
  border-color: var(--line-strong);
  background: var(--hover);
  color: var(--ink);
}

</style>
