<script setup>
import Icon from "../../shared/Icon.vue";
import ColumnMapping from "./components/ColumnMapping.vue";
import ConflictResolver from "./components/ConflictResolver.vue";
import ImportFilters from "./components/ImportFilters.vue";
import { useImportFlow } from "./useImportFlow.js";

const emit = defineEmits(["close"]);
const {
  requiredFields,
  extraFieldLabels,
  optionalFields,
  delimiters,
  fileName,
  table,
  hasHeader,
  mapping,
  extraMappings,
  filters,
  destination,
  bookName,
  books,
  targetName,
  busy,
  error,
  showRaw,
  step,
  completed,
  dragging,
  resolutions,
  columns,
  mappingColumns,
  sample,
  selectedMapping,
  rows,
  filterOptions,
  validMapping,
  preview,
  importCount,
  incompleteMapping,
  canImport,
  addMapping,
  clearFilter,
  setProperty,
  removeMapping,
  resetMapping,
  parseFile,
  readFile,
  confirm,
} = useImportFlow();
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
        <p class="completion-time">
          导入于
          {{
            new Date(completed.createdAt).toLocaleString("zh-CN", {
              hour12: false,
            })
          }}
        </p>
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
                v-for="book in books"
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
          <ColumnMapping
            v-if="step === 'configure'"
            :required-fields="requiredFields"
            :extra-field-labels="extraFieldLabels"
            :optional-fields="optionalFields"
            :mapping="mapping"
            :extra-mappings="extraMappings"
            :mapping-columns="mappingColumns"
            :valid-mapping="validMapping"
            :incomplete-mapping="incompleteMapping"
            :destination="destination"
            :book-name="bookName"
            @add="addMapping"
            @remove="removeMapping"
            @set-property="setProperty"
            @clear-filter="clearFilter"
          />

          <ImportFilters
            v-if="
              step === 'configure' &&
              (filterOptions.status.length ||
                filterOptions.source.length ||
                filterOptions.tags.length ||
                selectedMapping.date >= 0)
            "
            :filter-options="filterOptions"
            :filters="filters"
            :selected-mapping="selectedMapping"
            @update:filters="filters = $event"
          />

          <ConflictResolver
            v-if="step === 'review' && preview?.conflicts.length"
            :conflicts="preview.conflicts"
            :resolutions="resolutions"
            @update:resolutions="resolutions = $event"
          />

          <div v-if="step === 'review'" class="import-review-summary">
            <h3>
              即将导入「{{
                targetName
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
