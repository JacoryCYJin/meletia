<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { createBrowseSession, moveBrowse } from "../core/browse.js";
import PronunciationButtons from "./PronunciationButtons.vue";
import WordDetail from "./WordDetail.vue";
import Icon from "./Icon.vue";

const props = defineProps({
  cards: { type: Array, required: true },
  title: String,
  label: { type: String, default: "卡片过目" },
  completionTitle: { type: String, default: "过目完成" },
  completionText: String,
  emptyTitle: { type: String, default: "没有可过目的词" },
  exitLabel: String,
  showMetadata: Boolean,
});
const emit = defineEmits(["exit"]);
const session = shallowRef(createBrowseSession(props.cards));
const stage = ref(null);
const card = computed(() => session.value.cards[session.value.index]);
const total = computed(() => session.value.cards.length);
const finished = computed(() => session.value.index >= total.value);
const position = computed(() => Math.min(session.value.index + 1, total.value));
function move(direction) {
  session.value = moveBrowse(session.value, direction);
  nextTick(() => {
    stage.value?.querySelector(".stage-content")?.scrollTo(0, 0);
    stage.value?.focus({ preventScroll: true });
  });
}
function onKey(event) {
  if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey ||
      document.querySelector("dialog[open]") || event.target.closest?.("input,textarea,select,[contenteditable=true]")) return;
  if ([" ", "Enter"].includes(event.key) && event.target.closest?.("button")) return;
  if (props.exitLabel && (event.key === "Escape" || (event.key === "Enter" && finished.value))) {
    event.preventDefault(); emit("exit");
  } else if (["ArrowRight", " ", "Enter"].includes(event.key) && !finished.value) {
    event.preventDefault(); move(1);
  } else if (event.key === "ArrowLeft" && session.value.index > 0) {
    event.preventDefault(); move(-1);
  }
}
onMounted(() => {
  window.addEventListener("keydown", onKey);
  stage.value?.focus({ preventScroll: true });
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <section class="study browse-view" :aria-label="label">
    <header class="study-head browse-head">
      <span class="browse-book">{{ title }}</span>
      <div class="study-progress"><span>{{ position }} / {{ total }}</span></div>
      <button v-if="exitLabel" type="button" class="ghost preview-exit" @click="emit('exit')"><Icon name="close" :size="16" />{{ exitLabel }}</button>
    </header>
    <div ref="stage" class="stage" tabindex="-1">
      <div class="stage-content">
        <template v-if="card">
          <h2 class="term">{{ card.term }}</h2>
          <PronunciationButtons :text="card.term" :card-key="card.id" />
          <p v-if="card.phonetics?.uk || card.phonetics?.us" class="phonetic">/{{ card.phonetics.uk || card.phonetics.us }}/</p>
          <WordDetail :card="card" />
          <dl v-if="showMetadata && card.previewAttributes?.length" class="preview-metadata">
            <div v-for="attribute in card.previewAttributes" :key="attribute.label">
              <dt>{{ attribute.label }}</dt><dd>{{ attribute.value }}</dd>
            </div>
          </dl>
        </template>
        <div v-else class="browse-complete" role="status">
          <h2>{{ total ? completionTitle : emptyTitle }}</h2>
          <p>{{ total ? (completionText || `已过目 ${total} 个词，可以返回上一张继续查看。`) : (exitLabel ? `点击“${exitLabel}”返回。` : "通过顶部后退返回。") }}</p>
        </div>
      </div>
      <footer class="stage-actions">
        <button type="button" :disabled="session.index === 0" @click="move(-1)">上一个</button>
        <button v-if="exitLabel && finished" type="button" class="primary big preview-exit" @click="emit('exit')">{{ exitLabel }}</button>
        <button v-else type="button" class="primary big" :disabled="finished" @click="move(1)">Pass</button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.browse-book { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.browse-head { justify-content: space-between; }
.browse-complete { padding-block: 32px; }
.browse-complete h2 { font-size: 24px; }
.browse-complete p { color: var(--muted); margin-top: 12px; font-size: 14px; }
.stage-actions { justify-content: flex-end; }
.preview-exit { flex: none; }
.preview-metadata { margin-top: 24px; display: grid; gap: 8px; font-size: 13px; }
.preview-metadata > div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 12px; }
.preview-metadata dt { color: var(--muted); }
.preview-metadata dd { overflow-wrap: anywhere; }
</style>
