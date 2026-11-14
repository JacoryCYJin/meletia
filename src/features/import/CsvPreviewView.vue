<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { hasKnownHeader, mapRows, parseTable } from "../../core/importer.js";
import { CSV_PREVIEW_FIELDS, createCsvPreviewCards, previewMappingError, selectCsvPreviewRows, suggestCsvPreviewMapping } from "../../core/csv-preview.js";
import { splitTags } from "../../core/content.js";
import ReadOnlyCards from "../../shared/ReadOnlyCards.vue";
import Icon from "../../shared/Icon.vue";

const emit = defineEmits(["close"]);
const fileName = ref("");
const fileText = ref("");
const table = shallowRef(null);
const hasHeader = ref(false);
const delimiter = ref("");
const mapping = ref({});
const filters = ref({ source: "", status: "", tags: "", date: "" });
const cards = shallowRef(null);
const busy = ref(false);
const dragging = ref(false);
const error = ref("");
let disposed = false;
let readTicket = 0;
const columns = computed(() => Array.from({ length: table.value?.width ?? 0 }, (_, index) => ({
  index,
  label: hasHeader.value && table.value.data[0]?.[index]?.trim()
    ? `第 ${index + 1} 列 · ${table.value.data[0][index].trim()}` : `第 ${index + 1} 列`,
})));
const mappingError = computed(() => table.value ? previewMappingError(mapping.value, table.value.width) : "");
const rows = computed(() => table.value && !mappingError.value ? mapRows(table.value.data, hasHeader.value, mapping.value) : []);
const filterOptions = computed(() => Object.fromEntries(["source", "status"].map(field => [field,
  [...new Set(rows.value.map(row => row[field]).filter(Boolean))].sort(),
]).concat([["tags", [...new Set(rows.value.flatMap(row => splitTags(row.tags)))].sort()]])));
const selection = computed(() => table.value && !mappingError.value
  ? selectCsvPreviewRows(table.value, hasHeader.value, mapping.value, filters.value)
  : { rows: [], total: 0, invalid: 0, filtered: 0 });
const sample = computed(() => table.value?.data.slice(hasHeader.value ? 1 : 0, hasHeader.value ? 6 : 5) ?? []);
const rowCount = computed(() => Math.max(0, (table.value?.data.length ?? 0) - (hasHeader.value ? 1 : 0)));
const canStart = computed(() => !busy.value && !error.value && !mappingError.value && selection.value.rows.length > 0);
function resetFilters() { filters.value = { source: "", status: "", tags: "", date: "" }; }
watch(mapping, resetFilters, { deep: true });
function resetMapping() {
  mapping.value = table.value ? suggestCsvPreviewMapping(table.value, hasHeader.value) : {};
  resetFilters();
}
function parseFile(detectHeader = false) {
  error.value = "";
  table.value = null;
  try {
    const parsed = parseTable(fileText.value, delimiter.value);
    if (!parsed.width || !parsed.data.length) throw new Error("文件中没有可读取的数据，请重新选择文件。");
    table.value = parsed;
    if (detectHeader) hasHeader.value = hasKnownHeader(parsed.data[0]);
    resetMapping();
  } catch (cause) {
    error.value = String(cause.message ?? cause);
  }
}
async function readFile(file) {
  if (!file || busy.value || disposed) return;
  const ticket = ++readTicket;
  busy.value = true;
  error.value = "";
  table.value = null;
  fileName.value = "";
  fileText.value = "";
  cards.value = null;
  resetMapping();
  try {
    const text = await file.text();
    if (disposed || ticket !== readTicket) return;
    fileText.value = text;
    fileName.value = file.name;
    delimiter.value = "";
    parseFile(true);
  } catch (cause) {
    if (!disposed && ticket === readTicket) error.value = `读取失败，请重新选择文件。${String(cause.message ?? cause)}`;
  } finally {
    if (!disposed && ticket === readTicket) busy.value = false;
  }
}
function start() {
  if (canStart.value) cards.value = createCsvPreviewCards(selection.value.rows, mapping.value);
}
function clear() {
  readTicket++;
  cards.value = null;
  table.value = null;
  fileText.value = "";
  fileName.value = "";
  mapping.value = {};
  resetFilters();
}
function exit() { clear(); emit("close"); }
onBeforeUnmount(() => { disposed = true; clear(); });
</script>

<template>
  <ReadOnlyCards
    v-if="cards"
    :cards="cards"
    :title="fileName"
    label="CSV 临时过目"
    completion-title="本次预览完成"
    :completion-text="`已过目 ${cards.length} 个词，可以回看或退出本次预览。`"
    exit-label="退出预览"
    show-metadata
    @exit="exit"
  />
  <section v-else class="study csv-preview-setup" aria-label="CSV 过目配置">
    <div class="csv-config-scroll">
      <header class="page-head">
        <h1>CSV 过目</h1>
        <p class="lede">选择词表，配置后直接浏览卡片。本次内容仅临时预览，不加入词书。</p>
      </header>
      <label class="drop-zone" :class="{ 'import-file': fileName, dragging }"
        @dragover.prevent="dragging = true" @dragleave="dragging = false"
        @drop.prevent="dragging = false; readFile($event.dataTransfer.files[0])">
        <Icon name="file" :size="fileName ? 18 : 22" />
        <span v-if="fileName" class="import-file-info"><strong :title="fileName">{{ fileName }}</strong><span v-if="table" class="muted">{{ rowCount }} 行 · {{ columns.length }} 列</span></span>
        <template v-else><strong>{{ busy ? "正在读取文件…" : "拖入 CSV，或点击选择文件" }}</strong><span class="muted">UTF-8 编码的 CSV、TSV 或文本文件</span></template>
        <span v-if="fileName" class="import-file-replace" aria-hidden="true">更换文件</span>
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" aria-label="选择预览文件" :disabled="busy" @change="readFile($event.target.files[0]); $event.target.value = ''" />
      </label>
      <p v-if="error" class="field-error csv-feedback" role="alert">{{ error }}</p>
      <template v-if="table">
        <div class="import-parsing csv-parsing">
          <label class="import-checkbox"><input v-model="hasHeader" type="checkbox" @change="resetMapping" />第一行是表头</label>
          <label class="import-delimiter">分隔符<select v-model="delimiter" aria-label="预览分隔符" @change="parseFile(false)"><option value="">自动识别</option><option value=",">逗号</option><option :value="'\t'">制表符</option><option value=";">分号</option></select></label>
        </div>
        <section class="csv-mappings" aria-labelledby="csv-mapping-title">
          <h2 id="csv-mapping-title">列对应关系</h2>
          <div class="csv-field-grid">
            <label v-for="field in CSV_PREVIEW_FIELDS" :key="field.id" class="field">
              <span>{{ field.label }}<small v-if="field.required">必填</small></span>
              <select v-model="mapping[field.id]" :aria-label="field.label + '对应列'">
                <option :value="-1">{{ field.required ? "选择一列" : "不使用" }}</option>
                <option v-for="column in columns" :key="column.index" :value="column.index" :disabled="CSV_PREVIEW_FIELDS.some(other => other.id !== field.id && mapping[other.id] === column.index)">{{ column.label }}</option>
              </select>
            </label>
          </div>
          <p v-if="mappingError" class="field-error" role="status">{{ mappingError }}</p>
        </section>
        <section v-if="!mappingError && (filterOptions.source.length || filterOptions.status.length || filterOptions.tags.length || mapping.date >= 0)" class="csv-filters" aria-labelledby="csv-filter-title">
          <h2 id="csv-filter-title">筛选本次内容</h2>
          <div class="csv-field-grid">
            <label v-if="filterOptions.source.length" class="field"><span>来源</span><select v-model="filters.source" aria-label="预览筛选来源"><option value="">全部</option><option v-for="value in filterOptions.source" :key="value">{{ value }}</option></select></label>
            <label v-if="filterOptions.status.length" class="field"><span>掌握状态</span><select v-model="filters.status" aria-label="预览筛选掌握状态"><option value="">全部</option><option v-for="value in filterOptions.status" :key="value">{{ value }}</option></select></label>
            <label v-if="filterOptions.tags.length" class="field"><span>标签</span><select v-model="filters.tags" aria-label="预览筛选标签"><option value="">全部</option><option v-for="value in filterOptions.tags" :key="value">{{ value }}</option></select></label>
            <label v-if="mapping.date >= 0" class="field"><span>记录日期</span><input v-model="filters.date" type="date" aria-label="预览筛选日期" /></label>
          </div>
        </section>
        <section class="csv-sample" aria-labelledby="csv-sample-title">
          <h2 id="csv-sample-title">文件样例</h2>
          <div class="csv-sample-scroll" tabindex="0" role="region" aria-label="文件前五行">
            <table :style="{ width: `${Math.max(columns.length * 180, 400)}px` }"><thead><tr><th v-for="column in columns" :key="column.index" scope="col">{{ column.label }}</th></tr></thead><tbody><tr v-for="(row, index) in sample" :key="index"><td v-for="column in columns" :key="column.index"><span :title="row[column.index]">{{ row[column.index] }}</span></td></tr></tbody></table>
          </div>
        </section>
        <p v-if="!mappingError" class="csv-selection" role="status">本次过目 {{ selection.rows.length }} 个词 · 缺少单词或释义 {{ selection.invalid }} 行 · 筛选排除 {{ selection.filtered }} 行</p>
      </template>
    </div>
    <footer class="stage-actions csv-setup-actions">
      <span v-if="table && !mappingError" class="csv-count">{{ selection.rows.length }} 个词</span>
      <button type="button" class="csv-preview-exit" @click="exit">退出预览</button>
      <button type="button" class="primary big csv-preview-start" :disabled="!canStart" @click="start">开始过目</button>
    </footer>
  </section>
</template>

<style scoped>
.csv-config-scroll { flex: 1; min-height: 0; overflow: auto; padding: 32px 40px; scrollbar-width: thin; }
.csv-config-scroll .page-head { margin-bottom: 24px; }
.csv-feedback { margin-top: 16px; }
.csv-parsing { margin-top: 24px; }
.csv-mappings, .csv-filters, .csv-sample { margin-top: 28px; }
.csv-mappings h2, .csv-filters h2, .csv-sample h2 { font-size: 15px; margin-bottom: 16px; }
.csv-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; }
.field small { font-size: 11px; color: var(--muted); margin-left: 8px; }
.csv-sample-scroll { overflow: auto; scrollbar-width: thin; }
.csv-sample table { table-layout: fixed; min-width: 100%; border-collapse: collapse; font-size: 12px; }
.csv-sample th, .csv-sample td { padding: 10px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.csv-sample th { color: var(--muted); font-weight: 400; }
.csv-sample td span { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
.csv-selection { margin-top: 16px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.csv-setup-actions { justify-content: flex-end; }
.csv-count { color: var(--muted); font-size: 13px; margin-right: auto; }
@media (max-width: 740px) {
  .csv-config-scroll { padding: 24px; }
  .csv-field-grid { grid-template-columns: 1fr; }
  .csv-setup-actions { padding: 16px 24px; gap: 8px; }
}
</style>
