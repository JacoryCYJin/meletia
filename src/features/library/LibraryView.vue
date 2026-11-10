<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Modal from "../../shared/Modal.vue";
import Icon from "../../shared/Icon.vue";
import ImportBatches from "../import/ImportBatches.vue";
import RenameBookDialog from "../../shared/RenameBookDialog.vue";
import { blankCard, senseLine } from "../../core/content.js";
import {
  deleteCard,
  deleteBook,
  saveCard,
  setNotice,
  state,
} from "../../core/library.js";
import { bookCards, bookUpdatedText, isDue } from "../../core/books.js";
import { todayBrowseCards } from "../../core/browse.js";

const props = defineProps({ book: { type: Object, required: true } });
const emit = defineEmits(["back", "browse"]);

const cards = computed(() => bookCards(props.book, state.cards));

const filters = [
  { id: "all", label: "全部" },
  { id: "new", label: "未学" },
  { id: "due", label: "到期" },
  { id: "learned", label: "已学" },
];

const now = ref(new Date());
const browseCount = computed(() => todayBrowseCards(props.book, state.cards, state.importBatches, now.value).length);
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));

const search = ref("");
const batchesOpen = ref(false);
const renaming = ref(false);
const bookMenu = ref(null);
async function closeRename() {
  renaming.value = false;
  await nextTick();
  bookMenu.value?.querySelector("summary")?.focus({ preventScroll: true });
}
const filter = ref("all");
const draft = ref(null);
const isNew = ref(false);
const tagsText = ref("");
const busy = ref(false);
const editorError = ref("");
const termError = ref("");
const discardOpen = ref(false);
let originalDraft = "";
const dirty = computed(
  () =>
    draft.value &&
    JSON.stringify([draft.value, tagsText.value]) !== originalDraft,
);
const cardDeleteDialog = ref(null);
const cardDeleteError = ref("");
const cardDeleteKeyboard = ref(false);
const cardDeleteName = computed(() => state.cards.find(card => card.id === draft.value?.id)?.term ?? "");
let cardDeleteOpener;
async function openDeleteCard(event) {
  if (!draft.value || busy.value) return;
  cardDeleteOpener = event.currentTarget;
  cardDeleteKeyboard.value = event.detail === 0;
  cardDeleteError.value = "";
  await nextTick();
  cardDeleteDialog.value?.showModal();
  cardDeleteDialog.value?.querySelector(".cancel-delete-card")?.focus();
}
function closeDeleteCard() {
  if (busy.value) return;
  cardDeleteDialog.value?.close();
  cardDeleteOpener?.focus({ preventScroll: true });
}
const deleteDialog = ref(null);
const deleteConfirmation = ref("");
const deleteError = ref("");
const deletePhrase = computed(() => `我确定要删除${props.book.name}`);

function openDeleteBook() {
  deleteConfirmation.value = "";
  deleteError.value = "";
  deleteDialog.value.showModal();
}

function closeDeleteBook(event) {
  if (state.busy) {
    event?.preventDefault();
    return;
  }
  deleteDialog.value?.close();
}

async function removeBook() {
  if (state.busy || deleteConfirmation.value !== deletePhrase.value) return;
  const name = props.book.name;
  try {
    await deleteBook(props.book.id);
    deleteDialog.value?.close();
    setNotice(`「${name}」已移入回收站。`);
    emit("back");
  } catch (cause) {
    deleteError.value = String(cause);
  }
}

function statusOf(card) {
  const progress = card.progress;
  if (progress.stage === "new") return { id: "new", label: "未学" };
  if (progress.needsRecall) return { id: "due", label: "待回炉" };
  if (isDue(card, now.value)) return { id: "due", label: "到期" };
  if (progress.stage === "mastered") return { id: "learned", label: "已掌握" };
  return { id: "learned", label: "学习中" };
}

const rows = computed(() => {
  const query = search.value.trim().toLowerCase();
  return cards.value
    .filter(
      (card) => filter.value === "all" || statusOf(card).id === filter.value,
    )
    .filter((card) => {
      if (!query) return true;
      const haystack = [
        card.term,
        card.note,
        ...(card.senses ?? []).map(senseLine),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => a.term.localeCompare(b.term, "en"));
});

const counts = computed(() => {
  const result = { all: cards.value.length, new: 0, due: 0, learned: 0 };
  for (const card of cards.value) result[statusOf(card).id] += 1;
  return result;
});

function openCard(card) {
  draft.value = JSON.parse(JSON.stringify(card));
  tagsText.value = (card.tags ?? []).join("，");
  isNew.value = false;
  cardDeleteError.value = "";
  editorError.value = "";
  termError.value = "";
  discardOpen.value = false;
  originalDraft = JSON.stringify([draft.value, tagsText.value]);
}

function openNew() {
  draft.value = blankCard();
  tagsText.value = "";
  isNew.value = true;
  cardDeleteError.value = "";
  editorError.value = "";
  termError.value = "";
  discardOpen.value = false;
  originalDraft = JSON.stringify([draft.value, tagsText.value]);
}

function requestClose() {
  if (busy.value) return;
  if (dirty.value) discardOpen.value = true;
  else close();
}

function close() {
  cardDeleteDialog.value?.close();
  draft.value = null;
  cardDeleteError.value = "";
  editorError.value = "";
  termError.value = "";
  discardOpen.value = false;
  originalDraft = JSON.stringify([draft.value, tagsText.value]);
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
    setNotice(isNew.value ? "已加入词书。" : "已保存。");
    close();
  } catch (cause) {
    editorError.value = "保存失败，请重试。" + String(cause);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!draft.value || busy.value) return;
  busy.value = true;
  try {
    await deleteCard(draft.value.id, props.book.id);
    setNotice("已移入回收站。");
    close();
  } catch (cause) {
    cardDeleteError.value = "删除失败，请重试。" + String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="page library-page">
    <header class="page-head">
      <div class="library-heading">
        <span class="book-cover"><Icon name="book" :size="28" /></span>
        <div>
          <h1>{{ book.name }}</h1>
          <p class="lede">
            {{ cards.length }} 个词条<span class="dot-separator">·</span
            >{{ bookUpdatedText(book) }}
          </p>
        </div>
      </div>
    </header>

    <div class="toolbar">
      <label class="search">
        <Icon name="search" :size="16" />
        <input
          v-model="search"
          type="search"
          placeholder="搜索词条、释义或笔记"
          aria-label="搜索词条"
        />
      </label>
      <div class="segmented" role="group" aria-label="筛选">
        <button
          v-for="item in filters"
          :key="item.id"
          type="button"
          :class="{ selected: filter === item.id }"
          @click="filter = item.id"
        >
          {{ item.label }}
          <span>{{ counts[item.id] }}</span>
        </button>
      </div>
      <button
        type="button"
        class="browse-today"
        :disabled="!browseCount || state.busy"
        :title="browseCount ? '只读浏览今日新增词，不改变学习状态' : '今天暂无新增词'"
        @click="emit('browse')"
      >今日过目 · {{ browseCount }}</button>
      <button type="button" class="primary" @click="openNew">
        <Icon name="plus" :size="16" /> 新建
      </button>
      <details ref="bookMenu" class="action-menu">
        <summary class="icon-button" aria-label="词书管理">
          <Icon name="more" :size="20" />
        </summary>
        <div>
          <button type="button" :disabled="state.busy" @click="renaming = true; $event.target.closest('details').open = false;">重命名</button>
          <button
            type="button"
            @click="
              batchesOpen = true;
              $event.target.closest('details').open = false;
            "
          >
            导入批次
          </button>
          <button
            type="button"
            class="danger"
            :disabled="state.busy"
            @click="
              openDeleteBook();
              $event.target.closest('details').open = false;
            "
          >
            删除词书
          </button>
        </div>
      </details>
    </div>

    <RenameBookDialog v-if="renaming" :book="book" @close="closeRename" />
    <ImportBatches
      v-if="batchesOpen"
      :book="book"
      @close="batchesOpen = false"
    />
    <dialog
      ref="deleteDialog"
      class="book-delete-dialog"
      aria-labelledby="book-delete-title"
      aria-describedby="book-delete-description"
      @cancel="closeDeleteBook"
    >
      <form @submit.prevent="removeBook">
        <h2 id="book-delete-title">删除「{{ book.name }}」？</h2>
        <p id="book-delete-description">
          词书及其中 {{ cards.length }} 个词条和学习记录将移入回收站，保留 {{ state.settings.trashRetentionDays }} 天，到期后永久删除。
        </p>
        <label class="field">
          <span>请输入「{{ deletePhrase }}」以确认删除</span>
          <input
            v-model="deleteConfirmation"
            aria-label="删除确认文字"
            type="text"
            autocomplete="off"
            :spellcheck="false"
            :disabled="state.busy"
            autofocus
          />
        </label>
        <p v-if="deleteError" class="feedback" role="alert">
          {{ deleteError }}
        </p>
        <div class="book-delete-actions">
          <button type="button" :disabled="state.busy" @click="closeDeleteBook">
            取消
          </button>
          <button
            type="submit"
            class="destructive"
            :disabled="state.busy || deleteConfirmation !== deletePhrase"
          >
            {{ state.busy ? "正在删除…" : "删除词书" }}
          </button>
        </div>
      </form>
    </dialog>

    <div v-if="rows.length" class="list-labels">
      <span>单词 / 词组</span><span>释义</span><span>学习状态</span>
    </div>
    <ul class="word-list">
      <li v-for="card in rows" :key="card.id">
        <button type="button" class="word-row" @click="openCard(card)">
          <span class="word-term">{{ card.term }}</span>
          <span class="word-sense">{{
            senseLine(card.senses?.[0] ?? { pos: "", text: "还没有释义" })
          }}</span>
          <span class="badge" :class="`badge-${statusOf(card).id}`">
            {{ statusOf(card).label }}
          </span>
        </button>
      </li>
      <li v-if="!rows.length" class="empty-state">
        <Icon :name="cards.length ? 'search' : 'book'" :size="30" />
        <h2>
          {{
            !cards.length
              ? "这本词书还是空的"
              : search.trim()
                ? "没有找到这个词"
                : "这个分类下还没有词条"
          }}
        </h2>
        <p>
          {{
            !cards.length
              ? "手动添加第一个词，或从词书页面导入词表。"
              : "换一个关键词，或查看全部词条。"
          }}
        </p>
        <button v-if="!cards.length" class="primary" @click="openNew">
          <Icon name="plus" :size="16" />添加词条</button
        ><button
          v-else
          @click="
            search = '';
            filter = 'all';
          "
        >
          查看全部
        </button>
      </li>
    </ul>

    <Modal
      v-if="draft"
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
                <input
                  v-model="draft.phonetics.uk"
                  type="text"
                  placeholder="可选"
                />
              </label>
              <label class="field">
                <span>美式音标</span>
                <input
                  v-model="draft.phonetics.us"
                  type="text"
                  placeholder="可选"
                />
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
                <input
                  v-model="phrase.meaning"
                  type="text"
                  placeholder="释义"
                />
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
                <input
                  v-model="example.text"
                  type="text"
                  placeholder="英文例句"
                />
                <input
                  v-model="example.translation"
                  type="text"
                  placeholder="中文"
                />
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
              <textarea
                v-model="draft.note"
                rows="3"
                placeholder="记法、易错点、语境"
              />
            </label>

            <div class="field-row">
              <label class="field">
                <span>标签</span>
                <input
                  v-model="tagsText"
                  type="text"
                  placeholder="用逗号分隔"
                />
              </label>
              <label class="field">
                <span>来源</span>
                <input
                  v-model="draft.source"
                  type="text"
                  placeholder="练习 / 媒体"
                />
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
    <dialog
      ref="cardDeleteDialog"
      class="modal card-delete-dialog"
      role="alertdialog"
      aria-labelledby="card-delete-title"
      aria-describedby="card-delete-description"
      :aria-busy="busy"
      :data-keyboard="cardDeleteKeyboard"
      @keydown="cardDeleteKeyboard = true"
      @pointerdown="cardDeleteKeyboard = false"
      @cancel.prevent="closeDeleteCard"
      @keydown.esc.prevent.stop="closeDeleteCard"
    >
      <header class="modal-head">
        <h2 id="card-delete-title">删除「{{ cardDeleteName }}」？</h2>
        <button type="button" class="icon-button" aria-label="关闭删除确认" :disabled="busy" @click="closeDeleteCard">
          <Icon name="close" :size="18" />
        </button>
      </header>
      <div class="modal-body">
        <p id="card-delete-description">词条及其学习记录将移入回收站，保留 {{ state.settings.trashRetentionDays }} 天，到期后永久删除。</p>
        <p v-if="cardDeleteError" class="field-error" role="alert">{{ cardDeleteError }}</p>
      </div>
      <footer class="modal-foot">
        <button type="button" class="cancel-delete-card" :disabled="busy" @click="closeDeleteCard">取消</button>
        <button type="button" class="danger" :disabled="busy" @click="remove">{{ busy ? "正在删除…" : "删除词条" }}</button>
      </footer>
    </dialog>
  </section>
</template>

<style scoped>
.card-delete-dialog { width: min(380px, calc(100% - 32px)); }
.card-delete-dialog[data-keyboard="false"] button:focus-visible { outline: none; }
.card-delete-dialog h2 { overflow-wrap: anywhere; }
.card-delete-dialog .modal-body { color: var(--muted); line-height: 1.7; }
.card-delete-dialog .field-error { margin-top: 12px; }
</style>
