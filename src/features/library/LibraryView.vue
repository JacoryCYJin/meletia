<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Modal from "../../shared/Modal.vue";
import Icon from "../../shared/Icon.vue";
import ImportBatches from "../import/ImportBatches.vue";
import RenameBookDialog from "../books/components/RenameBookDialog.vue";
import { notify } from "../../shared/notifications.js";
import { state } from "../../storage/store.js";
import { deleteBook } from "../books/actions.js";
import { senseLine } from "./model.js";
import { bookCards, bookUpdatedText } from "../books/model.js";
import { isDue } from "../study/model.js";
import { todayBrowseCards } from "./browse.js";
import CardEditorDialog from "./components/CardEditorDialog.vue";

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
const editorOpen = ref(false);
const editorCard = ref(null);
const editorNew = ref(false);
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
    notify.success(`「${name}」已移入回收站。`);
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
  editorCard.value = card;
  editorNew.value = false;
  editorOpen.value = true;
}

function openNew() {
  editorCard.value = null;
  editorNew.value = true;
  editorOpen.value = true;
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

    <CardEditorDialog
      v-if="editorOpen"
      :book="book"
      :card="editorCard"
      :is-new="editorNew"
      @close="editorOpen = false"
    />
  </section>
</template>
