<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  createBook, mergeBooks, previewBookMerge, setError, setNotice,
  state, updateBook,
} from "../../core/library.js";
import { bookStats, bookUpdatedText } from "../../core/books.js";
import Icon from "../../shared/Icon.vue";
import ImportView from "../import/ImportView.vue";

const emit = defineEmits(["open-book"]);

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));

const books = computed(() =>
  state.books.map((book) => ({
    book,
    stats: bookStats(book, state.cards, now.value),
  })),
);

const activeCount = computed(
  () => state.books.filter((book) => book.active).length,
);
const groups = computed(() => [
  { label: "我的词书", books: books.value.filter(({ book }) => !book.legacy) },
  { label: "旧分组", books: books.value.filter(({ book }) => book.legacy) },
]);
const newName = ref("");
const creating = ref(false);
const pending = ref(false);
const importDialog = ref(null);
const importOpen = ref(false);
const mergeSource = ref("");
const mergeOther = ref("");
const mergeMode = ref("existing");
const mergePriority = ref("source");
const mergeName = ref("");
const mergePreview = computed(() => {
  if (!mergeSource.value || !mergeOther.value) return null;
  const sourceFirst = mergeMode.value === "new" && mergePriority.value === "source";
  const [first, second] = sourceFirst
    ? [mergeSource.value, mergeOther.value]
    : [mergeOther.value, mergeSource.value];
  return previewBookMerge(first, second);
});

async function openImport() {
  if (importOpen.value || state.busy) return;
  importOpen.value = true;
  await nextTick();
  importDialog.value?.showModal();
}

function closeImport() {
  if (!state.busy) importDialog.value?.close();
}

function cancelImport(event) {
  if (state.busy) event.preventDefault();
}

function openMerge(book) {
  mergeSource.value = book.id;
  mergeOther.value = "";
  mergeMode.value = "existing";
  mergePriority.value = "source";
  mergeName.value = "";
}

async function saveNewBook() {
  if (!newName.value.trim() || pending.value) return;
  pending.value = true;
  try {
    await createBook(newName.value);
    newName.value = "";
    creating.value = false;
  } catch (cause) {
    setError(cause);
  } finally {
    pending.value = false;
  }
}

async function confirmMerge() {
  const preview = mergePreview.value;
  if (!preview || pending.value) return;
  pending.value = true;
  try {
    const book = await mergeBooks(
      preview.primary.id,
      preview.secondary.id,
      mergeMode.value === "new" ? mergeName.value : undefined,
    );
    mergeSource.value = "";
    mergeOther.value = "";
    setNotice(`已合并到「${book.name}」。`);
    emit("open-book", book.id);
  } catch (cause) {
    setError(cause);
  } finally {
    pending.value = false;
  }
}

async function convertLegacy(book) {
  try {
    await updateBook(book.id, { legacy: false });
  } catch (cause) {
    setError(cause);
  }
}

async function toggle(book) {
  try {
    await updateBook(book.id, { active: !book.active });
  } catch (cause) {
    setError(cause);
  }
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <p class="eyebrow">词书</p>
      <h1>{{ state.books.length }} 本词书</h1>
      <p class="lede">
        同时启用的词书会轮流取新词。不同词书导入的同词卡片各自记录进度。
      </p>
    </header>

    <p class="muted">{{ activeCount }} 本启用中</p>

    <div class="book-actions">
      <button v-if="!creating" type="button" class="primary" @click="creating = true">
        <Icon name="plus" :size="16" /> 新建词书
      </button>
      <form v-else class="book-create" @submit.prevent="saveNewBook">
        <input v-model="newName" aria-label="词书名称" placeholder="词书名称" :disabled="pending" />
        <button class="primary" :disabled="pending || !newName.trim()">创建</button>
        <button type="button" :disabled="pending" @click="creating = false">取消</button>
      </form>
      <button type="button" :disabled="state.busy" @click="openImport">
        <Icon name="import" :size="16" /> 导入词表
      </button>
    </div>
    <dialog
      ref="importDialog"
      class="import-dialog"
      aria-labelledby="import-dialog-title"
      @cancel="cancelImport"
      @close="importOpen = false"
    >
      <ImportView v-if="importOpen" @close="closeImport" />
    </dialog>

    <section v-for="group in groups" :key="group.label" class="book-group">
      <template v-if="group.books.length">
        <h2>{{ group.label }}</h2>
        <ul class="book-list">
          <li v-for="{ book, stats } in group.books" :key="book.id" class="book-item">
            <div class="book-item-head">
              <div>
                <button
                  type="button"
                  class="link book-title"
                  :disabled="state.busy"
                  @click="emit('open-book', book.id)"
                >
                  {{ book.name }}
                </button>
                <p class="muted">
                  {{ stats.total }} 张 · 已学 {{ stats.learned }} · 待学
                  {{ stats.fresh }}
                  <template v-if="stats.due"> · {{ stats.due }} 到期</template>
                  <template v-if="stats.recall">
                    · {{ stats.recall }} 回炉
                  </template>
                </p>
                <p class="book-updated">{{ bookUpdatedText(book) }}</p>
              </div>
              <button
                type="button"
                class="toggle"
                :class="{ on: book.active }"
                :aria-pressed="book.active"
                :disabled="state.busy"
                @click="toggle(book)"
              >
                {{ book.active ? "启用中" : "已停用" }}
              </button>
            </div>
            <div class="meter">
              <span
                :style="{
                  width: `${stats.total ? (stats.learned / stats.total) * 100 : 0}%`,
                }"
              ></span>
            </div>
            <div v-if="book.legacy || books.length > 1" class="book-actions">
              <button v-if="book.legacy" type="button" class="ghost" :disabled="state.busy" @click="convertLegacy(book)">转为我的词书</button>
              <button v-if="books.length > 1" type="button" class="ghost" :disabled="state.busy" @click="openMerge(book)">合并</button>
            </div>
            <form v-if="mergeSource === book.id" class="book-merge" @submit.prevent="confirmMerge">
              <div class="filters">
                <label>
                  <span>合并方式</span>
                  <select v-model="mergeMode" :disabled="pending">
                    <option value="existing">合入已有词书</option>
                    <option value="new">合为新词书</option>
                  </select>
                </label>
                <label>
                  <span>{{ mergeMode === "new" ? "另一本词书" : "目标词书" }}</span>
                  <select v-model="mergeOther" :disabled="pending">
                    <option value="">选择词书</option>
                    <option v-for="other in state.books.filter((item) => item.id !== book.id)" :key="other.id" :value="other.id">
                      {{ other.name }}
                    </option>
                  </select>
                </label>
                <template v-if="mergeMode === 'new' && mergeOther">
                  <label>
                    <span>新词书名称</span>
                    <input v-model="mergeName" :disabled="pending" />
                  </label>
                  <label>
                    <span>同词优先保留</span>
                    <select v-model="mergePriority" :disabled="pending">
                      <option value="source">{{ book.name }}</option>
                      <option value="other">{{ state.books.find((item) => item.id === mergeOther)?.name }}</option>
                    </select>
                  </label>
                </template>
              </div>
              <template v-if="mergePreview">
                <p>从「{{ mergePreview.secondary.name }}」移入 {{ mergePreview.moved }} 张，重复 {{ mergePreview.duplicates.size }} 张，合并后共 {{ mergePreview.cardIds.length }} 张。</p>
                <p class="muted">同词保留「{{ mergePreview.primary.name }}」的释义和进度。{{ mergeMode === "new" ? "原来的两本词书将被移除。" : `「${book.name}」将被移除。` }}</p>
              </template>
              <div class="book-actions">
                <button class="primary" :disabled="pending || !mergePreview || (mergeMode === 'new' && !mergeName.trim())">确认合并</button>
                <button type="button" :disabled="pending" @click="mergeSource = ''; mergeOther = ''">取消</button>
              </div>
            </form>
          </li>
        </ul>
      </template>
    </section>
    <p v-if="!books.length" class="muted">还没有词书。可以先创建一本，也可以在导入时创建。</p>
  </section>
</template>
