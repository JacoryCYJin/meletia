<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  createBook,
  mergeBooks,
  previewBookMerge,
  setError,
  setNotice,
  state,
  updateBook,
} from "../../core/library.js";
import { bookStats, bookUpdatedText, dictationStats } from "../../core/books.js";
import Icon from "../../shared/Icon.vue";
import Modal from "../../shared/Modal.vue";
import ImportView from "../import/ImportView.vue";

const emit = defineEmits(["open-book", "csv-preview", "trash"]);

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));

const books = computed(() =>
  state.books.map((book) => {
    const stats = bookStats(book, state.cards, now.value);
    const dictation = dictationStats(book, state.cards, now.value);
    const recite = book.recite !== false;
    return {
      book,
      stats,
      dictation,
      recite,
      current: recite ? stats.learned : dictation.introduced,
      total: recite ? stats.total : dictation.total,
    };
  }),
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
const formError = ref("");
const mergeBook = computed(() =>
  state.books.find((book) => book.id === mergeSource.value),
);
const importDialog = ref(null);
const importOpen = ref(false);
const mergeSource = ref("");
const mergeOther = ref("");
const mergeMode = ref("existing");
const mergePriority = ref("source");
const mergeName = ref("");
const mergePreview = computed(() => {
  if (!mergeSource.value || !mergeOther.value) return null;
  const sourceFirst =
    mergeMode.value === "new" && mergePriority.value === "source";
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
  formError.value = "";
  mergeSource.value = book.id;
  mergeOther.value = "";
  mergeMode.value = "existing";
  mergePriority.value = "source";
  mergeName.value = "";
}

async function saveNewBook() {
  if (!newName.value.trim() || pending.value) return;
  formError.value = "";
  pending.value = true;
  try {
    await createBook(newName.value);
    newName.value = "";
    creating.value = false;
  } catch (cause) {
    formError.value = String(cause);
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
    formError.value = String(cause);
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

async function toggleMode(book, mode) {
  const current = mode === "recite" ? book.recite !== false : book.dictation === true;
  try {
    await updateBook(book.id, { [mode]: !current });
  } catch (cause) {
    setError(cause);
  }
}
</script>

<template>
  <section class="page books-page books-page-modes">
    <header class="page-head page-head-actions">
      <div>
        <h1>
          词书 <span class="heading-count">{{ books.length }}</span>
        </h1>
        <p class="lede">分开整理词条，各自记录学习进度。</p>
      </div>
      <div class="actions">
        <button type="button" class="open-trash" :disabled="state.busy" @click="emit('trash')"><Icon name="trash" :size="18" />回收站</button>
        <button type="button" class="open-csv-preview" :disabled="state.busy" @click="emit('csv-preview')">
          <Icon name="file" :size="18" />CSV 过目
        </button>
        <button type="button" :disabled="state.busy" @click="openImport">
          <Icon name="import" :size="18" />导入词表</button
        ><button
          type="button"
          class="primary"
          :disabled="state.busy"
          @click="
            creating = true;
            newName = '';
            formError = '';
          "
        >
          <Icon name="plus" :size="18" />新建词书
        </button>
      </div>
    </header>
    <div v-if="books.length" class="section-line">
      <h2>我的词书</h2>
      <span>{{ activeCount }} 本已启用</span>
    </div>
    <section v-for="group in groups" :key="group.label" class="book-group">
      <template v-if="group.books.length"
        ><h2 v-if="group.label === '旧分组'">旧分组</h2>
        <ul class="book-list">
          <li
            v-for="{ book, stats, dictation, recite, current, total } in group.books"
            :key="book.id"
            class="book-item"
          >
            <div class="book-item-head">
              <button
                class="book-open"
                @click="emit('open-book', book.id)"
                :disabled="state.busy"
              >
                <span class="book-cover"><Icon name="book" :size="26" /></span
                ><span
                  ><strong>{{ book.name }}</strong
                  ><small
                    >{{ bookUpdatedText(book)
                    }}<template v-if="book.dictation"> · 听写</template></small
                  ></span
                ><Icon name="arrowRight" :size="18" />
              </button>
              <div class="book-item-controls">
                <button
                  class="toggle"
                  :class="{ on: book.recite !== false }"
                  :aria-pressed="book.recite !== false"
                  :disabled="state.busy"
                  :title="'背诵：' + (book.recite !== false ? '开' : '关')"
                  @click="toggleMode(book, 'recite')"
                >
                  <span class="switch-track"><i /></span>背诵
                </button>
                <button
                  class="toggle"
                  :class="{ on: book.dictation === true }"
                  :aria-pressed="book.dictation === true"
                  :disabled="state.busy"
                  :title="'听写：' + (book.dictation === true ? '开' : '关')"
                  @click="toggleMode(book, 'dictation')"
                >
                  <span class="switch-track"><i /></span>听写
                </button>
                <button
                  v-if="book.legacy"
                  class="ghost"
                  :disabled="state.busy"
                  @click="convertLegacy(book)"
                >
                  转为词书</button
                ><button
                  v-if="books.length > 1"
                  class="ghost"
                  :disabled="state.busy"
                  @click="openMerge(book)"
                >
                  合并</button
                ><button
                  class="toggle"
                  :class="{ on: book.active }"
                  :aria-pressed="book.active"
                  :disabled="state.busy"
                  @click="toggle(book)"
                >
                  <span class="switch-track"><i /></span
                  >{{ book.active ? "已启用" : "已停用" }}
                </button>
              </div>
            </div>
            <div class="book-progress-copy">
              <span v-if="recite">{{ stats.learned }} / {{ stats.total }} 已学</span
              ><span v-else
                >{{ dictation.introduced }} / {{ dictation.total }} 听过</span
              ><span v-if="recite"
                >{{ stats.fresh }} 个待学<template v-if="stats.due">
                  · {{ stats.due }} 个到期</template
                ><template v-if="stats.recall">
                  · {{ stats.recall }} 个待回炉</template
                ><template v-if="book.dictation">
                  · 听写 {{ dictation.introduced }}</template
                ></span
              ><span v-else>{{ dictation.due }} 个听写到期</span>
            </div>
            <div
              class="meter"
              role="progressbar"
              :aria-label="book.name + (recite ? '学习进度' : '听写进度')"
              :aria-valuenow="current"
              :aria-valuemin="0"
              :aria-valuemax="total || 1"
            >
              <span
                :style="{
                  width: (total ? (current / total) * 100 : 0) + '%',
                }"
              />
            </div>
          </li>
        </ul>
      </template>
    </section>
    <div v-if="!books.length" class="empty-state">
      <Icon name="book" :size="32" />
      <h2>从第一本词书开始</h2>
      <p>导入已有词表，或创建一本空词书，慢慢收集想记住的词。</p>
      <button class="primary" @click="openImport">
        <Icon name="import" :size="18" />导入词表
      </button>
    </div>
    <p v-else class="section-note">
      启用多本词书时，新词会交替安排。同一个词在不同词书中独立记录进度。
    </p>

    <Modal
      v-if="creating"
      title="新建词书"
      description="给这本词书起个容易找到的名字。"
      :busy="pending"
      @close="creating = false"
    >
      <form id="create-book-form" @submit.prevent="saveNewBook">
        <label class="field"
          ><span>词书名称</span
          ><input
            v-model="newName"
            aria-label="词书名称"
            placeholder="例如：阅读中遇到的词"
            maxlength="120"
            :disabled="pending"
            autofocus
            required
        /></label>
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer
        ><button :disabled="pending" @click="creating = false">取消</button
        ><button
          class="primary"
          form="create-book-form"
          :disabled="pending || !newName.trim()"
        >
          {{ pending ? "正在创建…" : "创建词书" }}
        </button></template
      >
    </Modal>
    <Modal
      v-if="mergeBook"
      wide
      title="合并词书"
      :description="'将「' + mergeBook.name + '」与另一本词书合并。'"
      :busy="pending"
      @close="mergeSource = ''"
    >
      <form
        id="merge-book-form"
        class="stack-form merge-form"
        @submit.prevent="confirmMerge"
      >
        <label class="field"
          ><span>合并方式</span
          ><select v-model="mergeMode" :disabled="pending">
            <option value="existing">合入已有词书</option>
            <option value="new">合为一本新词书</option>
          </select></label
        >
        <label class="field"
          ><span>{{ mergeMode === "new" ? "另一本词书" : "合入哪本词书" }}</span
          ><select v-model="mergeOther" :disabled="pending" required>
            <option value="">选择词书</option>
            <option
              v-for="other in state.books.filter((b) => b.id !== mergeSource)"
              :key="other.id"
              :value="other.id"
            >
              {{ other.name }}
            </option>
          </select></label
        >
        <template v-if="mergeMode === 'new'"
          ><label class="field"
            ><span>新词书名称</span
            ><input
              v-model="mergeName"
              :disabled="pending"
              required
              placeholder="合并后的词书名称" /></label
          ><label class="field"
            ><span>重复词优先保留</span
            ><select v-model="mergePriority" :disabled="pending">
              <option value="source">{{ mergeBook.name }}</option>
              <option value="other">
                {{
                  state.books.find((b) => b.id === mergeOther)?.name ||
                  "另一本词书"
                }}
              </option>
            </select></label
          ></template
        >
        <div v-if="mergePreview" class="result-summary">
          <h3>合并预览</h3>
          <dl>
            <div>
              <dt>移入</dt>
              <dd>{{ mergePreview.moved }} 个词</dd>
            </div>
            <div>
              <dt>重复</dt>
              <dd>{{ mergePreview.duplicates.size }} 个词</dd>
            </div>
            <div>
              <dt>合并后</dt>
              <dd>{{ mergePreview.cardIds.length }} 个词</dd>
            </div>
          </dl>
          <p>
            重复词保留「{{ mergePreview.primary.name }}」的释义和进度。{{
              mergeMode === "new"
                ? "原来的两本词书将被移除。"
                : "「" + mergeBook.name + "」将被移除。"
            }}
          </p>
        </div>
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer
        ><button :disabled="pending" @click="mergeSource = ''">取消</button
        ><button
          class="primary"
          form="merge-book-form"
          :disabled="
            pending ||
            !mergePreview ||
            (mergeMode === 'new' && !mergeName.trim())
          "
        >
          {{ pending ? "正在合并…" : "确认合并" }}
        </button></template
      >
    </Modal>
    <dialog
      ref="importDialog"
      class="import-dialog"
      aria-labelledby="import-dialog-title"
      @cancel="cancelImport"
      @close="importOpen = false"
    >
      <ImportView v-if="importOpen" @close="closeImport" />
    </dialog>
  </section>
</template>

<style scoped>
.books-page-modes .book-item-controls {
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 62%;
}

.books-page-modes .book-progress-copy {
  row-gap: 6px;
}
</style>
