<script setup>
import { computed, reactive, ref, shallowRef, watch } from "vue";
import Icon from "../../shared/Icon.vue";
import {
  hasKnownHeader,
  mapRows,
  parseTable,
  previewImport,
  suggestMapping,
} from "../../core/importer.js";
import {
  cardsInImportTarget,
  importCards,
  setNotice,
  state,
} from "../../core/library.js";

const emit = defineEmits(["close"]);

const requiredFields = reactive(
  [
    { id: "word", label: "词条一", defaultName: "单词" },
    { id: "definition", label: "词条二", defaultName: "释义" },
  ].map((field) => ({ ...field, name: field.defaultName })),
);
const extraFieldLabels = ["词条三", "词条四", "词条五", "词条六"];
const optionalFields = [
  { id: "source", label: "来源" },
  { id: "tags", label: "标签" },
  { id: "status", label: "掌握状态" },
  { id: "date", label: "记录日期" },
];
const delimiters = [
  { value: ",", label: "逗号" },
  { value: "\t", label: "制表符" },
  { value: ";", label: "分号" },
];

const fileName = ref("");
const fileText = ref("");
const delimiter = ref("");
const table = shallowRef(null);
const hasHeader = ref(false);
const mapping = ref({});
const extraMappings = ref([]);
let nextMappingId = 0;
const filters = ref({ status: "", source: "", date: "" });
const destination = ref("new");
const bookName = ref("");
const busy = ref(false);
const error = ref("");
const showRaw = ref(false);
const step = ref("configure");
const completed = ref(null);
const dragging = ref(false);
const resolutions = ref(Object.create(null));

const columns = computed(() =>
  Array.from({ length: table.value?.width ?? 0 }, (_, index) => {
    const position = `第 ${index + 1} 列`;
    const heading = hasHeader.value ? table.value.data[0]?.[index]?.trim() : "";
    return {
      index,
      label: heading || position,
      rawLabel: heading ? `${position} · ${heading}` : position,
    };
  }),
);
const mappingColumns = computed(() => {
  const labels = new Map();
  for (const column of columns.value)
    labels.set(column.label, (labels.get(column.label) ?? 0) + 1);
  return columns.value.map((column) => ({
    ...column,
    label: labels.get(column.label) > 1 ? column.rawLabel : column.label,
  }));
});
const sample = computed(
  () =>
    table.value?.data.slice(hasHeader.value ? 1 : 0, hasHeader.value ? 6 : 5) ??
    [],
);
const selectedMapping = computed(() => ({
  ...mapping.value,
  ...Object.fromEntries(
    extraMappings.value
      .filter(({ property, column }) => property && column >= 0)
      .map(({ property, column }) => [property, column]),
  ),
}));
const rows = computed(() =>
  table.value
    ? mapRows(table.value.data, hasHeader.value, selectedMapping.value)
    : [],
);
const filterOptions = computed(() =>
  Object.fromEntries(
    ["status", "source"].map((field) => [
      field,
      [...new Set(rows.value.map((row) => row[field]).filter(Boolean))].sort(),
    ]),
  ),
);
const validMapping = computed(
  () =>
    mapping.value.word >= 0 &&
    mapping.value.definition >= 0 &&
    mapping.value.word !== mapping.value.definition,
);
const preview = computed(() => {
  if (!table.value || !validMapping.value) return null;
  const existing =
    destination.value === "new" ? [] : cardsInImportTarget(destination.value);
  return previewImport(rows.value, existing, filters.value, resolutions.value);
});
watch(
  [destination, rows, filters],
  () => {
    resolutions.value = Object.create(null);
  },
  { deep: true },
);
const importCount = computed(
  () =>
    (preview.value?.added.length ?? 0) + (preview.value?.updated.length ?? 0),
);
const incompleteMapping = computed(() =>
  extraMappings.value.some(({ property, column }) => !property || column < 0),
);
const canImport = computed(
  () =>
    importCount.value &&
    !incompleteMapping.value &&
    (destination.value !== "new" || bookName.value.trim()),
);

function addMapping() {
  extraMappings.value.push({ id: nextMappingId++, property: "", column: -1 });
}

function clearFilter(property) {
  if (Object.hasOwn(filters.value, property)) filters.value[property] = "";
}

function setProperty(row, property) {
  clearFilter(row.property);
  row.property = property;
  if (row.column < 0) {
    row.column = suggestMapping(table.value, hasHeader.value)[property] ?? -1;
  }
}

function removeMapping(row) {
  clearFilter(row.property);
  extraMappings.value = extraMappings.value.filter(
    (item) => item.id !== row.id,
  );
}

function resetMapping() {
  const suggested = suggestMapping(table.value, hasHeader.value);
  mapping.value = { word: suggested.word, definition: suggested.definition };
  for (const row of extraMappings.value) {
    row.column = suggested[row.property] ?? -1;
  }
  filters.value = { status: "", source: "", date: "" };
}

function parseFile(detectHeader = false) {
  table.value = null;
  error.value = "";
  try {
    table.value = parseTable(fileText.value, delimiter.value);
    if (detectHeader) hasHeader.value = hasKnownHeader(table.value.data[0]);
    resetMapping();
  } catch (cause) {
    error.value = String(cause);
  }
}

async function readFile(file) {
  if (!file || busy.value) return;
  busy.value = true;
  error.value = "";
  table.value = null;
  fileName.value = "";
  showRaw.value = false;
  step.value = "configure";
  extraMappings.value = [];
  try {
    fileText.value = await file.text();
    fileName.value = file.name;
    delimiter.value = "";
    bookName.value = file.name.replace(/\.[^.]+$/, "").trim();
    destination.value = "new";
    parseFile(true);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function confirm() {
  if (!canImport.value || busy.value || state.busy) return;
  busy.value = true;
  error.value = "";
  try {
    const target =
      destination.value === "new"
        ? { name: bookName.value }
        : { bookId: destination.value };
    const updates = preview.value.updated.length;
    const duplicates = preview.value.duplicates;
    const added = await importCards(rows.value, target, {
      filters: filters.value,
      resolutions: resolutions.value,
    });
    setNotice(`已新增 ${added} 张卡片，更新 ${updates} 条释义。`);
    completed.value = {
      added,
      updated: updates,
      duplicates,
      book:
        destination.value === "new"
          ? bookName.value
          : state.books.find((b) => b.id === destination.value)?.name,
    };
    step.value = "complete";
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="page import-page">
    <div class="import-content">
      <header class="page-head import-header">
        <div>
          <h2 id="import-dialog-title" tabindex="-1" autofocus>
            {{ step === "complete" ? "导入完成" : "导入词表" }}
          </h2>
          <p v-if="!fileName" class="lede">选择文件，预览词条，再导入词书。</p>
        </div>
        <button
          type="button"
          class="ghost"
          aria-label="关闭导入"
          :disabled="busy"
          @click="emit('close')"
        >
          <Icon name="close" :size="18" />
        </button>
      </header>

      <p v-if="error" class="banner error" role="alert">{{ error }}</p>
      <div v-if="completed" class="import-complete">
        <span class="success-symbol"><Icon name="check" :size="30" /></span>
        <h3>词条已保存到「{{ completed.book }}」</h3>
        <p>下次学习时，就可以遇见它们了。</p>
        <dl class="completion-counts">
          <div>
            <dt>新增</dt>
            <dd>{{ completed.added }}</dd>
          </div>
          <div>
            <dt>释义更新</dt>
            <dd>{{ completed.updated }}</dd>
          </div>
          <div>
            <dt>重复省略</dt>
            <dd>{{ completed.duplicates }}</dd>
          </div>
        </dl>
      </div>
      <ol
        v-if="fileName && !completed"
        class="import-steps"
        aria-label="导入步骤"
      >
        <li :class="{ current: step === 'configure' }">文件与字段</li>
        <li :class="{ current: step === 'review' }">检查并导入</li>
      </ol>

      <label
        v-if="!completed"
        class="drop-zone"
        :class="{ 'import-file': fileName, dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="
          dragging = false;
          readFile($event.dataTransfer.files[0]);
        "
      >
        <Icon name="import" :size="fileName ? 18 : 22" />
        <span v-if="fileName" class="import-file-info">
          <strong :title="fileName">{{ fileName }}</strong>
          <span v-if="table" class="muted"
            >{{ rows.length }} 行 · {{ columns.length }} 列</span
          >
        </span>
        <template v-else>
          <strong>{{
            busy ? "正在读取文件…" : "拖入词表，或点击选择文件"
          }}</strong>
          <span class="muted">UTF-8 编码的 CSV、TSV 或文本文件</span>
        </template>
        <span v-if="fileName" class="import-file-replace" aria-hidden="true"
          >更换文件</span
        >
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          :aria-label="fileName ? '更换文件' : '选择词表文件'"
          :disabled="busy"
          @change="
            readFile($event.target.files[0]);
            $event.target.value = '';
          "
        />
      </label>

      <fieldset
        v-if="fileName && !completed"
        class="import-options"
        :disabled="busy"
      >
        <div v-if="table && step === 'configure'" class="import-fields">
          <label class="import-field">
            <span>目标词书</span>
            <select v-model="destination" aria-label="目标词书">
              <option value="new">新建词书</option>
              <option
                v-for="book in state.books"
                :key="book.id"
                :value="book.id"
              >
                {{ book.name }}
              </option>
            </select>
          </label>
          <label v-if="destination === 'new'" class="import-field">
            <span>新词书名称</span>
            <input v-model="bookName" type="text" />
          </label>
        </div>

        <div v-if="step === 'configure'" class="import-parsing">
          <label class="import-checkbox">
            <input v-model="hasHeader" type="checkbox" />
            <span>首行是列标题</span>
          </label>
          <label class="import-delimiter">
            <span>分隔符</span>
            <select v-model="delimiter" @change="parseFile()">
              <option value="">自动识别</option>
              <option
                v-for="item in delimiters"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </select>
          </label>
        </div>

        <template v-if="table && columns.length">
          <div
            v-if="step === 'configure'"
            class="import-mappings"
            aria-label="词条映射"
          >
            <div class="import-mapping-row import-mapping-head">
              <span></span>
              <span>CSV 源列</span>
              <span>→ 导入属性</span>
            </div>
            <div
              v-for="field in requiredFields"
              :key="field.id"
              class="import-mapping-row"
            >
              <span>{{ field.label }}</span>
              <label class="import-field">
                <select
                  v-model="mapping[field.id]"
                  :aria-label="field.label + '的源列'"
                >
                  <option :value="-1">选择一列</option>
                  <option
                    v-for="column in mappingColumns"
                    :key="column.index"
                    :value="column.index"
                  >
                    {{ column.label }}
                  </option>
                </select>
              </label>
              <label class="import-mapping-property">
                <input
                  v-model="field.name"
                  type="text"
                  :aria-label="field.label + '的显示名称'"
                  :placeholder="field.defaultName"
                />
                <small>必填</small>
              </label>
            </div>

            <div
              v-for="(row, index) in extraMappings"
              :key="row.id"
              class="import-mapping-row"
            >
              <span>{{ extraFieldLabels[index] }}</span>
              <label class="import-field">
                <select
                  v-model="row.column"
                  :aria-label="extraFieldLabels[index] + '的源列'"
                  @change="clearFilter(row.property)"
                >
                  <option :value="-1">选择一列</option>
                  <option
                    v-for="column in mappingColumns"
                    :key="column.index"
                    :value="column.index"
                  >
                    {{ column.label }}
                  </option>
                </select>
              </label>
              <label class="import-field">
                <select
                  :value="row.property"
                  :aria-label="extraFieldLabels[index] + '的属性'"
                  @change="setProperty(row, $event.target.value)"
                >
                  <option value="">选择属性</option>
                  <option
                    v-for="field in optionalFields"
                    :key="field.id"
                    :value="field.id"
                    :disabled="
                      extraMappings.some(
                        (item) =>
                          item.id !== row.id && item.property === field.id,
                      )
                    "
                  >
                    {{ field.label }}
                  </option>
                </select>
              </label>
              <button
                type="button"
                class="ghost import-remove-mapping"
                :aria-label="'删除' + extraFieldLabels[index]"
                @click="removeMapping(row)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>

            <button
              v-if="extraMappings.length < optionalFields.length"
              type="button"
              class="ghost import-add-mapping"
              @click="addMapping"
            >
              <Icon name="plus" :size="14" /> 添加词条
            </button>
            <p v-if="!validMapping" class="field-error" role="status">
              请选择两个不同的源列，分别对应单词和释义。
            </p>
            <p
              v-if="destination === 'new' && !bookName.trim()"
              class="field-error"
            >
              请填写新词书名称。
            </p>
            <p v-if="incompleteMapping" class="muted import-empty">
              请选择新增词条的属性和源列，或删除该条映射。
            </p>
          </div>

          <div
            v-if="
              step === 'configure' &&
              (filterOptions.status.length ||
                filterOptions.source.length ||
                selectedMapping.date >= 0)
            "
            class="import-fields"
          >
            <label v-if="filterOptions.status.length" class="import-field">
              <span>筛选掌握状态</span>
              <select v-model="filters.status">
                <option value="">全部</option>
                <option v-for="status in filterOptions.status" :key="status">
                  {{ status }}
                </option>
              </select>
            </label>
            <label v-if="filterOptions.source.length" class="import-field">
              <span>筛选来源</span>
              <select v-model="filters.source">
                <option value="">全部</option>
                <option v-for="source in filterOptions.source" :key="source">
                  {{ source }}
                </option>
              </select>
            </label>
            <label v-if="selectedMapping.date >= 0" class="import-field">
              <span>筛选日期</span>
              <input v-model="filters.date" type="date" />
            </label>
          </div>

          <section
            v-if="step === 'review' && preview?.conflicts.length"
            class="import-conflicts"
            aria-labelledby="import-conflicts-title"
          >
            <h2 id="import-conflicts-title">选择释义版本</h2>
            <p class="muted">
              同一个词有不同释义。每个词选择一个版本，默认采用最后一个导入版本。
            </p>
            <fieldset
              v-for="conflict in preview.conflicts"
              :key="conflict.key"
              class="import-conflict"
            >
              <legend>{{ conflict.term }}</legend>
              <div class="import-versions">
                <label
                  v-for="(version, index) in conflict.versions"
                  :key="index"
                  class="import-version"
                  :class="{ selected: conflict.selected === index }"
                >
                  <span>
                    <input
                      type="radio"
                      :name="'import-version-' + conflict.key"
                      :value="index"
                      :checked="conflict.selected === index"
                      @change="resolutions[conflict.key] = $event.target.value"
                    />
                    <strong>{{
                      version.row
                        ? "导入版本 " + (conflict.card ? index : index + 1)
                        : "当前版本"
                    }}</strong>
                    <small v-if="conflict.selected === index">将采用</small>
                  </span>
                  <span class="import-version-definition">{{
                    version.definition
                  }}</span>
                </label>
              </div>
            </fieldset>
          </section>

          <div v-if="step === 'review'" class="import-review-summary">
            <h3>
              即将导入「{{
                destination === "new"
                  ? bookName
                  : state.books.find((b) => b.id === destination)?.name
              }}」
            </h3>
            <p>
              新增 {{ preview?.added.length || 0 }} · 更新
              {{ preview?.updated.length || 0 }} · 重复省略
              {{ preview?.duplicates || 0 }} · 跳过 {{ preview?.skipped || 0 }}
            </p>
            <small>只在这本词书内查重。更新释义会保留原有学习进度。</small>
          </div>
          <section
            class="import-preview"
            aria-labelledby="import-preview-title"
          >
            <header>
              <h2 id="import-preview-title">
                {{ showRaw ? "原始表格" : "导入预览" }}
              </h2>
              <button type="button" class="ghost" @click="showRaw = !showRaw">
                {{ showRaw ? "返回导入预览" : "查看原始表格" }}
              </button>
            </header>

            <div
              v-if="showRaw"
              class="import-table"
              tabindex="0"
              aria-label="原始表格滚动区域"
            >
              <table aria-label="原始词表预览">
                <thead>
                  <tr>
                    <th
                      v-for="column in columns"
                      :key="column.index"
                      scope="col"
                    >
                      {{ column.rawLabel }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in sample" :key="index">
                    <td v-for="column in columns" :key="column.index">
                      <span :title="row[column.index]">{{
                        row[column.index]
                      }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <table
              v-else-if="preview?.added.length"
              class="import-result"
              aria-label="将要导入的词条样例"
            >
              <thead>
                <tr>
                  <th
                    v-for="field in requiredFields"
                    :key="field.id"
                    scope="col"
                  >
                    {{ field.name.trim() || field.defaultName }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in preview.added.slice(0, 3)" :key="row.word">
                  <td>{{ row.word }}</td>
                  <td>
                    <details class="import-definition">
                      <summary
                        :aria-label="'展开或收起 ' + row.word + ' 的释义'"
                      >
                        <span class="import-excerpt" aria-hidden="true">{{
                          row.definition
                        }}</span>
                        <span class="import-collapse">收起释义</span>
                        <Icon name="chevronDown" :size="14" />
                      </summary>
                      <p>{{ row.definition }}</p>
                    </details>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="import-empty muted">
              {{
                preview?.updated.length
                  ? "释义更新见上方版本选择。"
                  : preview
                    ? "没有可新增的词条。"
                    : "请为词条和释义分别选择一列。"
              }}
            </p>
          </section>
        </template>
        <p v-else-if="table" class="import-empty muted">
          文件里没有可预览的内容。
        </p>
      </fieldset>
    </div>

    <footer v-if="fileName || completed" class="import-footer">
      <p v-if="!completed" class="muted" aria-live="polite">
        <template v-if="preview">
          新增 {{ preview.added.length }} · 更新 {{ preview.updated.length }} ·
          重复 {{ preview.duplicates }} · 跳过 {{ preview.skipped }}
        </template>
        <template v-else>请检查文件和字段映射</template>
      </p>
      <button
        v-if="step === 'review'"
        :disabled="busy"
        @click="step = 'configure'"
      >
        返回配置</button
      ><button v-if="completed" class="primary" @click="emit('close')">
        完成</button
      ><button
        v-else
        type="button"
        class="primary"
        :disabled="busy || !canImport"
        @click="step === 'configure' ? (step = 'review') : confirm()"
      >
        {{
          busy
            ? "正在导入…"
            : step === "configure"
              ? "检查导入"
              : "确认导入 " + importCount + " 条"
        }}<Icon v-if="step === 'configure'" name="arrowRight" :size="16" />
      </button>
    </footer>
  </section>
</template>
