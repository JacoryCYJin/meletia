<script setup>
import { computed, ref } from "vue";
import Modal from "../../shared/Modal.vue";
import Icon from "../../shared/Icon.vue";
import { definitionOf } from "../../core/content.js";
import {
  state,
  previewImportUndo,
  undoImportBatch,
} from "../../core/library.js";

const props = defineProps({ book: { type: Object, required: true } });
defineEmits(["close"]);
const selectedId = ref("");
const confirming = ref(false);
const busy = ref(false);
const error = ref("");
const batches = computed(() =>
  state.importBatches
    .filter(
      (batch) =>
        batch.bookId === props.book.id &&
        batch.bookCreatedAt === props.book.createdAt,
    )
    .reverse(),
);
const selected = computed(() =>
  batches.value.find((batch) => batch.id === selectedId.value),
);
const preview = computed(() =>
  selected.value ? previewImportUndo(selected.value.id) : null,
);
const dateText = (value) =>
  new Date(value).toLocaleString("zh-CN", { hour12: false });
function select(id = "") {
  selectedId.value = id;
  confirming.value = false;
  error.value = "";
}
async function undo() {
  if (busy.value || state.busy) return;
  busy.value = true;
  error.value = "";
  try {
    await undoImportBatch(selected.value.id);
    confirming.value = false;
  } catch (cause) {
    error.value = String(cause.message ?? cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal
    :title="confirming ? '撤销此批次？' : '导入批次'"
    :description="book.name"
    :busy="busy"
    wide
    @close="$emit('close')"
  >
    <div class="batch-content">
      <p v-if="error" class="banner error" role="alert">{{ error }}</p>
      <template v-if="selected">
        <button v-if="!confirming" class="link" type="button" @click="select()">
          <Icon name="arrowLeft" :size="16" /> 返回批次列表
        </button>
        <div class="batch-summary">
          <h3>{{ selected.fileName }}</h3>
          <p>{{ dateText(selected.createdAt) }}</p>
          <p>
            新增 {{ selected.added.length }} · 释义更新
            {{ selected.updated.length }} · 重复省略 {{ selected.duplicates }}
          </p>
        </div>
        <p
          v-if="selected.status === 'undone'"
          class="batch-result"
          role="status"
        >
          已撤销 · {{ dateText(selected.undoneAt) }}
        </p>
        <template v-else-if="confirming">
          <p>
            将删除本次新增的
            <strong>{{ selected.added.length }}</strong> 个词条，并还原
            <strong>{{ selected.updated.length }}</strong>
            条旧释义。词书及其他词条保留。
          </p>
          <p
            v-if="preview.learnedCount || preview.reviewCount"
            class="batch-warning"
          >
            新增词条中有
            {{ preview.learnedCount }} 个已经学习；撤销会同时删除这些词条的
            {{ preview.reviewCount }} 条学习记录。
          </p>
          <p v-else>本次新增词条尚无学习记录。原有词条的学习进度和笔记保留。</p>
          <p>撤销完成后不能再次撤销同一批次；需要时可重新导入原文件。</p>
        </template>
        <template
          v-if="selected.status !== 'undone' && preview.conflicts.length"
        >
          <div class="batch-warning" role="alert">
            <strong>暂时无法撤销</strong>
            <ul>
              <li v-for="conflict in preview.conflicts" :key="conflict">
                {{ conflict }}
              </li>
            </ul>
          </div>
        </template>
        <template v-if="!confirming">
          <section v-if="selected.added.length" class="batch-section">
            <h4>新增词条 · {{ selected.added.length }}</h4>
            <ul class="batch-changes">
              <li v-for="card in selected.added" :key="card.id">
                <strong>{{ card.term }}</strong>
                <p>{{ definitionOf(card) }}</p>
              </li>
            </ul>
          </section>
          <section v-if="selected.updated.length" class="batch-section">
            <h4>释义更新 · {{ selected.updated.length }}</h4>
            <ul class="batch-changes">
              <li v-for="change in selected.updated" :key="change.id">
                <strong>{{ change.term }}</strong>
                <dl class="batch-diff">
                  <dt>导入前</dt>
                  <dd>{{ definitionOf({ senses: change.before }) }}</dd>
                  <dt>导入后</dt>
                  <dd>{{ definitionOf({ senses: change.after }) }}</dd>
                </dl>
              </li>
            </ul>
          </section>
          <p v-if="!selected.added.length && !selected.updated.length">
            本批次没有修改词条，无需撤销。
          </p>
        </template>
      </template>
      <template v-else>
        <p v-if="!batches.length">
          暂无导入批次。启用此功能后，每次导入都会在这里保留记录；此前的导入无法按批次撤销。
        </p>
        <ul v-else class="batch-list">
          <li v-for="batch in batches" :key="batch.id">
            <button type="button" class="batch-row" @click="select(batch.id)">
              <span class="batch-row-content">
                <strong>{{ batch.fileName }}</strong>
                <span>{{ dateText(batch.createdAt) }}</span>
                <span
                  >新增 {{ batch.added.length }} · 更新
                  {{ batch.updated.length }} · 重复 {{ batch.duplicates }}</span
                >
              </span>
              <span class="batch-state">{{
                batch.status === "undone" ? "已撤销" : "已导入"
              }}</span>
              <Icon name="arrowRight" :size="16" />
            </button>
          </li>
        </ul>
      </template>
    </div>
    <template #footer>
      <template v-if="confirming">
        <button type="button" :disabled="busy" @click="confirming = false">
          取消
        </button>
        <button
          type="button"
          class="danger"
          :disabled="busy || state.busy || preview.conflicts.length > 0"
          @click="undo"
        >
          {{ busy ? "正在撤销…" : "确认撤销" }}
        </button>
      </template>
      <template v-else>
        <button type="button" @click="$emit('close')">关闭</button>
        <button
          v-if="
            selected &&
            selected.status !== 'undone' &&
            (selected.added.length || selected.updated.length)
          "
          type="button"
          class="danger"
          :disabled="state.busy || preview.conflicts.length > 0"
          @click="confirming = true"
        >
          撤销此批次
        </button>
      </template>
    </template>
  </Modal>
</template>

<style scoped>
.batch-content {
  display: grid;
  gap: 20px;
  overflow-wrap: anywhere;
}
.batch-content > .link {
  justify-self: start;
}
.batch-summary h3 {
  font-size: 17px;
}
.batch-summary p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
.batch-list,
.batch-changes {
  list-style: none;
  padding: 0;
  margin: 0;
}
.batch-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  text-align: left;
  white-space: normal;
  height: auto;
  padding: 16px 0;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
}
.batch-row-content {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.batch-row-content > span,
.batch-state {
  font-size: 12px;
  color: var(--muted);
}
.batch-state {
  flex: none;
}
.batch-row:hover {
  background: var(--hover);
}
.batch-section h4 {
  font-size: 14px;
  margin-bottom: 8px;
}
.batch-changes li {
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.batch-changes p {
  color: var(--muted);
  font-size: 13px;
  margin-top: 6px;
}
.batch-diff {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 12px;
  font-size: 13px;
  margin-top: 8px;
}
.batch-diff dt {
  color: var(--muted);
}
.batch-diff dd {
  margin: 0;
}
.batch-warning {
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.batch-warning ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
.batch-result {
  color: var(--success);
}
</style>
