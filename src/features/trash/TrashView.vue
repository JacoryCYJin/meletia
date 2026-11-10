<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state, restoreTrash, purgeTrash, emptyTrash, cleanupTrash } from "../../core/library.js";
import { DAY_MS, isTrashExpired } from "../../core/recycle-bin.js";
import { notify } from "../../core/notifications.js";
import Modal from "../../shared/Modal.vue";
import Icon from "../../shared/Icon.vue";

const search = ref("");
const type = ref("all");
const now = ref(new Date());
const selected = ref(null);
const action = ref("");
const name = ref("");
const target = ref("");
const pending = ref(false);
const error = ref("");
let timer;
onMounted(() => { timer = setInterval(() => { now.value = new Date(); }, 1000); });
onUnmounted(() => clearInterval(timer));
const live = computed(() => state.trash.filter(entry => !isTrashExpired(entry, now.value)));
const rows = computed(() => live.value.filter(entry => (type.value === "all" || entry.type === type.value) &&
  [entry.book.name, ...entry.cards.map(card => card.term)].join(" ").toLowerCase().includes(search.value.trim().toLowerCase()))
  .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)));
const titleOf = entry => entry.type === "book" ? entry.book.name : entry.cards[0]?.term ?? "词条";
const formatTime = value => new Date(value).toLocaleString("zh-CN", { hour12: false });
const timeLeft = entry => {
  const remaining = new Date(entry.expiresAt) - now.value;
  return remaining < DAY_MS ? "不足 1 天后到期" : `${Math.ceil(remaining / DAY_MS)} 天后到期`;
};
const parent = computed(() => selected.value && state.books.find(book => book.id === selected.value.book.id && book.createdAt === selected.value.book.createdAt));
const trashedParent = computed(() => selected.value && live.value.find(entry => entry.type === "book" && entry.book.id === selected.value.book.id));
function open(entry, nextAction) {
  selected.value = entry;
  action.value = nextAction;
  name.value = entry?.book.name ?? "";
  target.value = "";
  error.value = "";
}
function close() { if (!pending.value) { action.value = ""; selected.value = null; } }
async function confirm() {
  if (pending.value || state.busy) return;
  pending.value = true;
  error.value = "";
  try {
    if (action.value === "restore") {
      await restoreTrash(selected.value.id, { bookName: name.value, targetBookId: target.value });
      notify.success(`已恢复「${titleOf(selected.value)}」。`);
    } else if (action.value === "purge") {
      await purgeTrash(selected.value.id);
      notify.success("已永久删除。");
    } else {
      await emptyTrash();
      notify.success("已清空回收站。");
    }
    action.value = ""; selected.value = null;
  } catch (cause) { error.value = String(cause.message ?? cause); }
  finally { pending.value = false; }
}
async function refresh() {
  now.value = new Date();
  try { await cleanupTrash(); } catch (cause) { notify.error(`清理回收站失败，请重试。${String(cause.message ?? cause)}`); }
}
</script>

<template>
  <section class="page trash-page">
    <header class="page-head page-head-actions">
      <div><h1>回收站 <span class="heading-count">{{ live.length }}</span></h1><p class="lede">找回误删的词条、词书和学习记录。</p></div>
      <div class="actions">
        <button type="button" :disabled="state.busy" @click="refresh"><Icon name="history" :size="18" />刷新</button>
        <button type="button" class="danger" :disabled="!live.length || state.busy" @click="open(null, 'empty')">清空回收站</button>
      </div>
    </header>
    <p class="trash-policy">新删除的项目保留 {{ state.settings.trashRetentionDays }} 天。每项到期时间以删除时的设置为准。</p>
    <div class="trash-toolbar">
      <label class="search"><Icon name="search" :size="18" /><input v-model="search" aria-label="搜索回收站" placeholder="搜索词条或词书" type="search" /></label>
      <select v-model="type" aria-label="回收项目类型"><option value="all">全部类型</option><option value="card">词条</option><option value="book">词书</option></select>
    </div>
    <ul v-if="rows.length" class="trash-list">
      <li v-for="entry in rows" :key="entry.id" class="trash-row">
        <Icon :name="entry.type === 'book' ? 'book' : 'file'" :size="22" />
        <div class="trash-info"><h2>{{ titleOf(entry) }}</h2>
          <p>{{ entry.type === 'book' ? `词书 · ${entry.cards.length} 个词条` : `词条 · ${entry.book.name}` }}</p>
          <p>删除于 {{ formatTime(entry.deletedAt) }}</p>
        </div>
        <span class="trash-expiry" :title="`到期时间：${formatTime(entry.expiresAt)}`">{{ timeLeft(entry) }}</span>
        <div class="actions"><button type="button" :disabled="state.busy" @click="open(entry, 'restore')">恢复</button><button type="button" class="danger" :disabled="state.busy" @click="open(entry, 'purge')">永久删除</button></div>
      </li>
    </ul>
    <div v-else class="empty-state"><Icon name="trash" :size="32" /><h2>{{ live.length ? '没有匹配的项目' : '回收站是空的' }}</h2><p>{{ live.length ? '试试其他搜索内容或类型。' : '删除的词条和词书会暂存在这里。' }}</p></div>
    <Modal v-if="action" class="trash-action-dialog" :title="action === 'restore' ? `恢复「${titleOf(selected)}」？` : action === 'purge' ? `永久删除「${titleOf(selected)}」？` : '清空回收站？'" :busy="pending" @close="close">
      <form id="trash-action-form" @submit.prevent="confirm">
        <template v-if="action === 'restore'">
          <p>保留删除前的词条内容、掌握状态和复习记录。</p>
          <label v-if="selected.type === 'book'" class="field"><span>恢复后的词书名称</span><input v-model="name" aria-label="恢复后的词书名称" :disabled="pending" required maxlength="120" /></label>
          <template v-else-if="!parent">
            <p v-if="trashedParent">原词书也在回收站，请先恢复原词书。</p>
            <label v-else class="field"><span>恢复到词书</span><select v-model="target" aria-label="恢复到词书" :disabled="pending" required><option value="">选择一本词书</option><option v-for="book in state.books" :key="book.id" :value="book.id">{{ book.name }}</option></select></label>
            <p v-if="!trashedParent && !state.books.length">请先到词书页新建一本词书，再回来恢复。</p>
          </template>
          <p v-else>恢复到「{{ parent.name }}」。原有复习时间保持不变。</p>
          <p class="trash-detail-note">遇到同名词条或词书时，不会覆盖现有内容。</p>
        </template>
        <p v-else>{{ action === 'empty' ? '将永久删除回收站内的所有项目及其保存的学习记录。' : '将永久删除此项目及其保存的学习记录。' }}此操作无法撤销。</p>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" :disabled="pending" @click="close">取消</button>
        <button v-if="action === 'restore' && selected.type === 'card' && !parent && trashedParent" type="button" class="primary" :disabled="pending" @click="open(trashedParent, 'restore')">先恢复原词书</button>
        <button v-else type="submit" form="trash-action-form" :class="action === 'restore' ? 'primary' : 'danger'" :disabled="pending || state.busy || (action === 'restore' && selected.type === 'card' && !parent && !target)">{{ pending ? '正在处理…' : action === 'restore' ? '恢复' : action === 'purge' ? '永久删除' : '清空回收站' }}</button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.trash-policy, .trash-info p, .trash-expiry, .trash-detail-note { color: var(--muted); font-size: 13px; line-height: 1.6; }
.trash-policy { margin-bottom: 24px; }
.trash-toolbar { display: flex; gap: 12px; margin-bottom: 24px; }
.trash-toolbar .search { flex: 1; }
.trash-toolbar select { width: 130px; }
.trash-list { list-style: none; padding: 0; }
.trash-row { display: flex; align-items: center; gap: 20px; padding: 24px 0; border-top: 1px solid var(--line); }
.trash-row > svg { color: var(--muted); flex: none; }
.trash-info { flex: 1; min-width: 0; }
.trash-info h2 { font-size: 16px; overflow-wrap: anywhere; margin-bottom: 6px; }
.trash-row .actions { flex: none; }
.trash-action-dialog { width: min(420px, calc(100% - 32px)); }
.trash-action-dialog form { display: grid; gap: 16px; line-height: 1.7; }
@media (max-width: 760px) {
  .trash-row { flex-wrap: wrap; gap: 12px; }
  .trash-info { flex-basis: calc(100% - 40px); }
  .trash-expiry { margin-left: 34px; flex: 1; }
}
</style>
