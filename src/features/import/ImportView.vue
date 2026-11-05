<script setup>
import { computed, ref } from "vue";
import Icon from "../../shared/Icon.vue";
import { newCard } from "../../core/content.js";
import { parseWords, previewImport } from "../../core/importer.js";
import { addCards, setError, setNotice, state } from "../../core/library.js";

const fileName = ref("");
const parsed = ref(null);
const filters = ref({ status: "", source: "", date: "" });
const busy = ref(false);

const preview = computed(
  () =>
    parsed.value &&
    previewImport(parsed.value.rows, state.cards, filters.value),
);

async function readFile(file) {
  if (!file || busy.value) return;
  busy.value = true;
  setNotice("");
  parsed.value = null;
  try {
    parsed.value = parseWords(await file.text());
    fileName.value = file.name;
    filters.value = { status: "", source: "", date: "" };
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

async function confirm() {
  if (!preview.value?.added.length || busy.value) return;
  busy.value = true;
  try {
    const cards = preview.value.added.map((row) => newCard(row));
    await addCards(cards);
    setNotice(`已导入 ${cards.length} 张卡片，可以在词库里继续编辑。`);
    parsed.value = null;
    fileName.value = "";
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <p class="eyebrow">导入</p>
      <h1>把词表带进来</h1>
      <p class="lede">
        支持飞书导出的 CSV，也支持英文、中文两列的简单词表。重复的词会跳过，
        导入后按「来源」自动分到对应词书。
      </p>
    </header>

    <label
      class="drop-zone"
      @dragover.prevent
      @drop.prevent="readFile($event.dataTransfer.files[0])"
    >
      <Icon name="import" :size="22" />
      <strong>{{ parsed ? fileName : "拖入 CSV，或点击选择文件" }}</strong>
      <span class="muted">UTF-8 编码，表头不必固定</span>
      <input
        type="file"
        accept=".csv,text/csv"
        :disabled="busy"
        @change="
          readFile($event.target.files[0]);
          $event.target.value = '';
        "
      />
    </label>

    <template v-if="preview">
      <div v-if="parsed.fields.length" class="filters">
        <label v-if="parsed.fields.includes('掌握状态')">
          <span>掌握状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option>未掌握</option>
            <option>已掌握</option>
          </select>
        </label>
        <label v-if="parsed.fields.includes('来源')">
          <span>来源</span>
          <select v-model="filters.source">
            <option value="">全部</option>
            <option>练习</option>
            <option>媒体</option>
            <option>背单词</option>
          </select>
        </label>
        <label v-if="parsed.fields.includes('记录时间')">
          <span>登记日期</span>
          <input v-model="filters.date" type="date" />
        </label>
      </div>

      <dl class="import-summary">
        <div>
          <dt>新增</dt>
          <dd>{{ preview.added.length }}</dd>
        </div>
        <div>
          <dt>重复</dt>
          <dd>{{ preview.duplicates }}</dd>
        </div>
        <div>
          <dt>跳过</dt>
          <dd>{{ preview.skipped }}</dd>
        </div>
      </dl>

      <ul class="word-list">
        <li v-for="row in preview.added.slice(0, 12)" :key="row.word">
          <div class="preview-row">
            <span class="word-term">{{ row.word }}</span>
            <span class="word-sense">{{ row.definition }}</span>
          </div>
        </li>
      </ul>
      <p v-if="preview.added.length > 12" class="muted">
        还有 {{ preview.added.length - 12 }} 条未显示。
      </p>

      <button
        type="button"
        class="primary"
        :disabled="busy || !preview.added.length"
        @click="confirm"
      >
        <Icon name="check" :size="16" /> 确认导入
      </button>
    </template>
  </section>
</template>
