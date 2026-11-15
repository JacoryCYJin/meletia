<script setup>
import { computed, ref } from "vue";
import Modal from "../../../shared/Modal.vue";
import Icon from "../../../shared/Icon.vue";
import { notify } from "../../../shared/notifications.js";
import { state } from "../../../storage/store.js";
import { deleteCard, saveCard } from "../actions.js";
import { blankCard } from "../model.js";
import DeleteCardDialog from "./DeleteCardDialog.vue";

const props = defineProps({
  book: { type: Object, required: true },
  card: { type: Object, default: null },
  isNew: Boolean,
});
const emit = defineEmits(["close", "saved", "deleted"]);

const draft = ref(
  props.isNew
    ? blankCard()
    : JSON.parse(JSON.stringify(props.card ?? blankCard())),
);
const tagsText = ref((draft.value.tags ?? []).join("，"));
const busy = ref(false);
const editorError = ref("");
const termError = ref("");
const discardOpen = ref(false);
const deleteError = ref("");
const deleteDialog = ref(null);
const originalDraft = ref(JSON.stringify([draft.value, tagsText.value]));

const dirty = computed(
  () => JSON.stringify([draft.value, tagsText.value]) !== originalDraft.value,
);

function close() {
  if (busy.value) return;
  emit("close");
}

function requestClose() {
  if (busy.value) return;
  if (dirty.value) discardOpen.value = true;
  else close();
}

function addSense() {
  draft.value.senses.push({ pos: "", text: "" });
}
function removeSense(index) {
  draft.value.senses.splice(index, 1);
}
function addPhrase() {
  draft.value.phrases.push({ text: "", meaning: "" });
}
function removePhrase(index) {
  draft.value.phrases.splice(index, 1);
}
function addExample() {
  draft.value.examples.push({ text: "", translation: "" });
}
function removeExample(index) {
  draft.value.examples.splice(index, 1);
}

async function save() {
  const card = draft.value;
  if (!card || busy.value) return;
  const term = card.term.trim();
  if (!term) {
    termError.value = "请输入单词或词组。";
    return;
  }

  const clean = {
    ...card,
    term,
    kind: /\s/.test(term) ? "phrase" : card.kind,
    senses: card.senses
      .map((sense) => ({ pos: sense.pos.trim(), text: sense.text.trim() }))
      .filter((sense) => sense.text),
    phrases: card.phrases
      .map((phrase) => ({
        text: phrase.text.trim(),
        meaning: phrase.meaning.trim(),
      }))
      .filter((phrase) => phrase.text),
    examples: card.examples
      .map((example) => ({
        text: example.text.trim(),
        translation: example.translation.trim(),
      }))
      .filter((example) => example.text),
    tags: tagsText.value
      .split(/[,，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  };

  editorError.value = "";
  termError.value = "";
  busy.value = true;
  try {
    await saveCard(clean, props.book.id);
    notify.success(props.isNew ? "已加入词书。" : "已保存。");
    emit("saved");
    emit("close");
  } catch (cause) {
    editorError.value = "保存失败，请重试。" + String(cause);
  } finally {
    busy.value = false;
  }
}

function openDeleteCard(event) {
  if (busy.value) return;
  deleteError.value = "";
  deleteDialog.value?.open(event);
}

async function remove() {
  if (busy.value) return;
  busy.value = true;
  try {
    await deleteCard(draft.value.id, props.book.id);
    notify.success("已移入回收站。");
    deleteDialog.value?.close();
    emit("deleted");
    emit("close");
  } catch (cause) {
    deleteError.value = "删除失败，请重试。" + String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal
    :title="isNew ? '添加词条' : '编辑词条'"
    :description="'保存在「' + book.name + '」中'"
    :busy="busy"
    wide
    @close="requestClose"
  >
    <div v-if="discardOpen" class="discard-notice" role="alert">
      <div>
        <strong>有尚未保存的修改</strong>
        <p>放弃后，这次修改不会保留。</p>
      </div>
      <button @click="discardOpen = false">继续编辑</button
      ><button class="danger" @click="close">放弃修改</button>
    </div>
    <form id="word-editor-form" @submit.prevent="save">
      <fieldset class="editor-fields" :disabled="busy">
        <div class="editor-sections">
          <label class="field">
            <span>单词或词组 <span class="required-label">必填</span></span>
            <input
              v-model="draft.term"
              type="text"
              placeholder="例如：make sense"
              aria-label="单词或词组"
              :aria-invalid="Boolean(termError)"
              @input="termError = ''"
              autofocus
            /><small v-if="termError" class="field-error" role="alert">{{
              termError
            }}</small>
          </label>

          <div class="field-row">
            <label class="field">
              <span>英式音标</span>
              <input v-model="draft.phonetics.uk" type="text" placeholder="可选" />
            </label>
            <label class="field">
              <span>美式音标</span>
              <input v-model="draft.phonetics.us" type="text" placeholder="可选" />
            </label>
          </div>

          <fieldset class="field editor-group">
            <legend>释义</legend>
            <div
              v-for="(sense, index) in draft.senses"
              :key="index"
              class="edit-row"
            >
              <input
                v-model="sense.pos"
                class="pos-input"
                type="text"
                placeholder="词性"
                aria-label="词性"
              />
              <input
                v-model="sense.text"
                type="text"
                placeholder="中文释义"
                aria-label="中文释义"
              />
              <button
                type="button"
                class="icon-button"
                aria-label="删除这条释义"
                @click="removeSense(index)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <button type="button" class="ghost add-field" @click="addSense">
              <Icon name="plus" :size="15" />添加义项
            </button>
          </fieldset>

          <fieldset class="field">
            <legend>词组</legend>
            <div
              v-for="(phrase, index) in draft.phrases"
              :key="index"
              class="edit-row pair"
            >
              <input v-model="phrase.text" type="text" placeholder="词组" />
              <input v-model="phrase.meaning" type="text" placeholder="释义" />
              <button
                type="button"
                class="icon-button"
                aria-label="删除这个词组"
                @click="removePhrase(index)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <button type="button" class="ghost add-field" @click="addPhrase">
              <Icon name="plus" :size="15" />添加词组
            </button>
          </fieldset>

          <fieldset class="field">
            <legend>例句</legend>
            <div
              v-for="(example, index) in draft.examples"
              :key="index"
              class="edit-row pair"
            >
              <input v-model="example.text" type="text" placeholder="英文例句" />
              <input v-model="example.translation" type="text" placeholder="中文" />
              <button
                type="button"
                class="icon-button"
                aria-label="删除这个例句"
                @click="removeExample(index)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <button type="button" class="ghost add-field" @click="addExample">
              <Icon name="plus" :size="15" />添加例句
            </button>
          </fieldset>

          <label class="field">
            <span>笔记</span>
            <textarea v-model="draft.note" rows="3" placeholder="记法、易错点、语境" />
          </label>

          <div class="field-row">
            <label class="field">
              <span>标签</span>
              <input v-model="tagsText" type="text" placeholder="用逗号分隔" />
            </label>
            <label class="field">
              <span>来源</span>
              <input v-model="draft.source" type="text" placeholder="练习 / 媒体" />
            </label>
          </div>
        </div>
      </fieldset>
    </form>
    <template #footer
      ><p v-if="editorError" class="field-error" role="alert">
        {{ editorError }}
      </p>
      <button
        v-if="!isNew"
        type="button"
        class="danger"
        :disabled="busy"
        @click="openDeleteCard"
      >
        删除词条</button
      ><span class="spacer" /><button
        type="button"
        :disabled="busy"
        @click="requestClose"
      >
        取消</button
      ><button
        type="submit"
        form="word-editor-form"
        class="primary"
        :disabled="busy"
      >
        {{ busy ? "正在保存…" : "保存词条" }}
      </button></template
    >
  </Modal>

  <DeleteCardDialog
    ref="deleteDialog"
    :name="draft.term"
    :retention-days="state.settings.trashRetentionDays"
    :busy="busy"
    :error="deleteError"
    @close="deleteError = ''"
    @confirm="remove"
  />
</template>
