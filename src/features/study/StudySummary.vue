<script setup>
import ExportStudyStatusButton from "../../shared/ExportStudyStatusButton.vue";
defineProps({ summary: { type: Object, required: true }, busy: Boolean });
defineEmits(["continue", "close"]);
const dueDate = (value) => {
  const date = new Date(value ?? "");
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-CN", { hour12: false })
    : "尚未安排复习";
};
</script>

<template>
  <section class="study-summary" aria-labelledby="study-summary-title">
    <header class="summary-head">
      <div class="summary-title-row">
      <h2 id="study-summary-title">
        {{ summary.mode === "learn" ? "学习小结" : "复习小结" }}
      </h2>
      <ExportStudyStatusButton :disabled="busy" />
      </div>
      <p>
        本组完成 {{ summary.completed }} 个词<span v-if="summary.skipped"
          >，{{ summary.skipped }} 个暂无释义，已暂跳</span
        >。
      </p>
      <p v-if="summary.spellingNote">{{ summary.spellingNote }}</p>
    </header>
    <div
      class="summary-list-scroll"
      tabindex="0"
      role="region"
      aria-label="本组词条及下次复习安排"
    >
      <table v-if="summary.rows.length" class="summary-table">
        <caption class="sr-only">
          本组完成词条及下次复习安排
        </caption>
        <thead>
          <tr>
            <th scope="col">单词 / 词组</th>
            <th scope="col">下次复习</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary.rows" :key="row.id">
            <th scope="row">
              <span class="summary-term">{{ row.term }}</span
              ><span class="summary-book">{{ row.bookName }}</span>
            </th>
            <td>
              <time
                v-if="row.dueAt"
                :datetime="row.dueAt"
                :title="dueDate(row.dueAt)"
                >{{ row.nextReview }}</time
              ><span v-else>{{ row.nextReview }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="summary-empty">
        本组没有完成的词条。补充释义后，可以再来学习。
      </p>
    </div>
    <footer class="summary-footer">
      <p>
        今日已{{ summary.mode === "learn" ? "学习" : "复习" }}
        <strong>{{ summary.todayCompleted }}</strong> 个词<span
          class="summary-divider"
          >·</span
        >本次还剩 <strong>{{ summary.remaining }}</strong> 个词
      </p>
      <div class="summary-actions">
        <button
          v-if="summary.canContinue"
          type="button"
          :disabled="busy"
          @click="$emit('close')"
        >
          回到今日
        </button>
        <button
          type="button"
          class="primary big"
          :disabled="busy"
          @click="$emit('continue')"
        >
          {{
            busy
              ? "正在准备…"
              : summary.canContinue
                ? summary.mode === "learn"
                  ? "继续学习"
                  : "继续复习"
                : "回到今日"
          }}<kbd>回车</kbd>
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.study-summary {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.summary-head {
  flex: none;
  padding: 24px 40px 16px;
}
.summary-title-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.summary-head h2 {
  font-size: 20px;
}
.summary-head p {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}
.summary-list-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 40px 20px;
  scrollbar-width: thin;
}
.summary-list-scroll:focus-visible {
  outline: 2px solid var(--muted);
  outline-offset: -4px;
}
.summary-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;
}
.summary-table th,
.summary-table td {
  border: 0;
  padding: 10px 8px;
  text-align: left;
  overflow-wrap: anywhere;
}
.summary-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  padding-block: 12px;
}
.summary-table th:last-child,
.summary-table td:last-child {
  width: 160px;
  text-align: right;
}
.summary-table tbody th {
  font-weight: 500;
}
.summary-table tbody td {
  color: var(--muted);
  font-size: 13px;
}
.summary-table tbody tr:hover {
  background: var(--hover);
}
.summary-term,
.summary-book {
  display: block;
}
.summary-book {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
  margin-top: 2px;
}
.summary-empty {
  color: var(--muted);
  padding: 16px 8px;
  font-size: 14px;
}
.summary-footer {
  flex: none;
  padding: 18px 32px 24px;
  border-top: 1px solid var(--line);
}
.summary-footer > p {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.summary-footer strong {
  font-weight: 500;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.summary-divider {
  margin-inline: 12px;
}
.summary-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
}
@media (max-width: 740px) {
  .summary-head {
    padding: 20px 24px 12px;
  }
  .summary-list-scroll {
    padding-inline: 16px;
  }
  .summary-table th:last-child,
  .summary-table td:last-child {
    width: 120px;
  }
  .summary-footer {
    padding: 16px 20px;
  }
}
</style>
