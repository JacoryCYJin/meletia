<script setup>
import Icon from "../../shared/Icon.vue";

defineProps({
  summary: { type: Object, required: true },
  busy: Boolean,
  secondaryLabel: { type: String, default: "回今日" },
});
defineEmits(["restart", "secondary"]);
</script>

<template>
  <section class="dictation-summary" aria-labelledby="dictation-summary-title">
    <header class="dictation-summary-head">
      <span class="success-symbol"><Icon name="volume" :size="28" /></span>
      <h2 id="dictation-summary-title">听写小结</h2>
      <p>本轮听了 {{ summary.total }} 个词。</p>
    </header>

    <dl class="dictation-counts">
      <div>
        <dt>正确</dt>
        <dd>{{ summary.correct }}</dd>
      </div>
      <div>
        <dt>错误</dt>
        <dd>{{ summary.wrong }}</dd>
      </div>
    </dl>

    <div class="dictation-missed-scroll" tabindex="0" role="region" aria-label="本轮错词">
      <table v-if="summary.rows.length" class="dictation-missed">
        <caption class="sr-only">本轮听写错误的词条</caption>
        <thead>
          <tr>
            <th scope="col">错词</th>
            <th scope="col">中文释义</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary.rows" :key="row.id">
            <th scope="row">{{ row.term }}</th>
            <td>{{ row.meaning || "暂无释义" }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="dictation-empty">这一轮全部听出来了。</p>
    </div>

    <footer class="dictation-summary-footer">
      <div class="dictation-summary-actions">
        <button type="button" :disabled="busy" @click="$emit('secondary')">
          {{ secondaryLabel }}
        </button>
        <button
          type="button"
          class="primary big"
          :disabled="busy"
          @click="$emit('restart')"
        >
          再来一轮<kbd>回车</kbd>
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.dictation-summary {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.dictation-summary-head {
  flex: none;
  padding: 24px 40px 16px;
}
.dictation-summary-head h2 {
  font-size: 20px;
}
.dictation-summary-head p {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}
.dictation-counts {
  flex: none;
  display: flex;
  gap: 48px;
  padding: 0 40px 20px;
}
.dictation-counts dt {
  font-size: 12px;
  color: var(--muted);
}
.dictation-counts dd {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
}
.dictation-missed-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 40px 20px;
  scrollbar-width: thin;
}
.dictation-missed-scroll:focus-visible {
  outline: 2px solid var(--muted);
  outline-offset: -4px;
}
.dictation-missed {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;
}
.dictation-missed th,
.dictation-missed td {
  border: 0;
  padding: 10px 8px;
  text-align: left;
  overflow-wrap: anywhere;
}
.dictation-missed thead th {
  position: sticky;
  top: 0;
  background: var(--bg);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  padding-block: 12px;
}
.dictation-missed th:last-child,
.dictation-missed td:last-child {
  width: 55%;
}
.dictation-missed tbody th {
  font-weight: 500;
}
.dictation-missed tbody td {
  color: var(--muted);
  font-size: 13px;
}
.dictation-missed tbody tr:hover {
  background: var(--hover);
}
.dictation-empty {
  color: var(--muted);
  padding: 16px 8px;
  font-size: 14px;
}
.dictation-summary-footer {
  flex: none;
  padding: 18px 32px 24px;
  border-top: 1px solid var(--line);
}
.dictation-summary-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.dictation-summary-actions button {
  position: relative;
}
.dictation-summary-actions button > kbd {
  position: absolute;
  inset-inline-end: 12px;
  top: 50%;
  margin: 0;
  transform: translateY(-50%);
}
.dictation-summary-actions .primary {
  padding-inline-end: 52px;
}
@media (max-width: 740px) {
  .dictation-summary-head {
    padding: 20px 24px 12px;
  }
  .dictation-missed-scroll {
    padding-inline: 16px;
  }
  .dictation-counts {
    padding-inline: 24px;
  }
  .dictation-summary-footer {
    padding: 16px 20px;
  }
}
</style>
