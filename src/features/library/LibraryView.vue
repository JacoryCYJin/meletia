<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import Icon from "../../shared/Icon.vue";
import { blankCard, senseLine } from "../../core/content.js";
import {
  deleteCard,
  saveCard,
  setError,
  setNotice,
  state,
} from "../../core/library.js";
import { bookCards, isDue } from "../../core/books.js";

const props = defineProps({ book: { type: Object, required: true } });
defineEmits(["back"]);

const cards = computed(() => bookCards(props.book, state.cards));

const filters = [
  { id: "all", label: "全部" },
  { id: "new", label: "未学" },
  { id: "due", label: "到期" },
  { id: "learned", label: "已学" },
];

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));

const search = ref("");
const filter = ref("all");
const draft = ref(null);
const isNew = ref(false);
const tagsText = ref("");
const busy = ref(false);
const confirming = ref(false);

function statusOf(card) {
  const progress = card.progress;
  if (progress.stage === "new") return { id: "new", label: "未学" };
  if (progress.needsRecall) return { id: "due", label: "待回炉" };
  if (isDue(card, now.value)) return { id: "due", label: "到期" };
  if (progress.stage === "mastered") return { id: "learned", label: "已掌握" };
  return { id: "learned", label: "学习中" };
}

const rows = computed(() => {
  const query = search.value.trim().toLowerCase();
  return cards.value
    .filter((card) => filter.value === "all" || statusOf(card).id === filter.value)
    .filter((card) => {
      if (!query) return true;
      const haystack = [card.term, card.note, ...(card.senses ?? []).map(senseLine)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => a.term.localeCompare(b.term, "en"));
});

const counts = computed(() => {
  const result = { all: cards.value.length, new: 0, due: 0, learned: 0 };
  for (const card of cards.value) result[statusOf(card).id] += 1;
  return result;
});

function openCard(card) {
  draft.value = JSON.parse(JSON.stringify(card));
  tagsText.value = (card.tags ?? []).join("，");
  isNew.value = false;
  confirming.value = false;
}

function openNew() {
  draft.value = blankCard();
  tagsText.value = "";
  isNew.value = true;
  confirming.value = false;
}

function close() {
  draft.value = null;
  confirming.value = false;
}

function addSense() {
  draft.value.senses.push({ pos: "", text: "" });
}

function removeSense(index) {
  draft.value.senses.splice(index, 1);
}

function addPhrase() {
  draft.value.phrases.push({ text: "", meaning: "" });
}

function removePhrase(index) {
  draft.value.phrases.splice(index, 1);
}

function addExample() {
  draft.value.examples.push({ text: "", translation: "" });
}

function removeExample(index) {
  draft.value.examples.splice(index, 1);
}

async function save() {
  const card = draft.value;
  if (!card || busy.value) return;
  const term = card.term.trim();
  if (!term) {
    setError("词条不能为空。");
    return;
  }

  const clean = {
    ...card,
    term,
    kind: /\s/.test(term) ? "phrase" : card.kind,
    senses: card.senses
      .map((sense) => ({ pos: sense.pos.trim(), text: sense.text.trim() }))
      .filter((sense) => sense.text),
    phrases: card.phrases
      .map((phrase) => ({
        text: phrase.text.trim(),
        meaning: phrase.meaning.trim(),
      }))
      .filter((phrase) => phrase.text),
    examples: card.examples
      .map((example) => ({
        text: example.text.trim(),
        translation: example.translation.trim(),
      }))
      .filter((example) => example.text),
    tags: tagsText.value
      .split(/[,，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  };

  busy.value = true;
  try {
    await saveCard(clean, props.book.id);
    setNotice(isNew.value ? "已加入词书。" : "已保存。");
    close();
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!draft.value || busy.value) return;
  if (!confirming.value) {
    confirming.value = true;
    return;
  }
  busy.value = true;
  try {
    await deleteCard(draft.value.id, props.book.id);
    setNotice("已删除。");
    close();
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
      <button type="button" class="link" @click="$emit('back')">返回词书</button>
      <h1>{{ book.name }}</h1>
      <p class="lede">{{ cards.length }} 张卡片</p>
    </header>

    <div class="toolbar">
      <label class="search">
        <Icon name="search" :size="16" />
        <input
          v-model="search"
          type="search"
          placeholder="搜索词条、释义或笔记"
          aria-label="搜索词条"
        />
      </label>
      <div class="segmented" role="group" aria-label="筛选">
        <button
          v-for="item in filters"
          :key="item.id"
          type="button"
          :class="{ selected: filter === item.id }"
          @click="filter = item.id"
        >
          {{ item.label }}
          <span>{{ counts[item.id] }}</span>
        </button>
      </div>
      <button type="button" class="primary" @click="openNew">
        <Icon name="plus" :size="16" /> 新建
      </button>
    </div>

    <ul class="word-list">
      <li v-for="card in rows" :key="card.id">
        <button type="button" class="word-row" @click="openCard(card)">
          <span class="word-term">{{ card.term }}</span>
          <span class="word-sense">{{ senseLine(card.senses?.[0] ?? { pos: '', text: '还没有释义' }) }}</span>
          <span class="badge" :class="`badge-${statusOf(card).id}`">
            {{ statusOf(card).label }}
          </span>
        </button>
      </li>
      <li v-if="!rows.length" class="word-empty">没有符合条件的词条。</li>
    </ul>

    <div v-if="draft" class="overlay" @click.self="close">
      <form class="editor" @submit.prevent="save">
        <header class="editor-head">
          <div>
            <p class="eyebrow">{{ isNew ? "新建词条" : "编辑词条" }}</p>
            <h2>{{ draft.term || "未命名词条" }}</h2>
          </div>
          <button type="button" class="ghost" @click="close">
            <Icon name="close" :size="16" />
          </button>
        </header>

        <div class="editor-body">
          <label class="field">
            <span>词条</span>
            <input v-model="draft.term" type="text" placeholder="单词或词组" />
          </label>

          <div class="field-row">
            <label class="field">
              <span>英式音标</span>
              <input v-model="draft.phonetics.uk" type="text" placeholder="可选" />
            </label>
            <label class="field">
              <span>美式音标</span>
              <input v-model="draft.phonetics.us" type="text" placeholder="可选" />
            </label>
          </div>

          <fieldset class="field">
            <legend>释义</legend>
            <div
              v-for="(sense, index) in draft.senses"
              :key="index"
              class="edit-row"
            >
              <input
                v-model="sense.pos"
                class="pos-input"
                type="text"
                placeholder="词性"
                aria-label="词性"
              />
              <input
                v-model="sense.text"
                type="text"
                placeholder="中文释义"
                aria-label="中文释义"
              />
              <button
                type="button"
                class="icon-button"
                aria-label="删除这条释义"
                @click="removeSense(index)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <button type="button" class="link" @click="addSense">
              + 添加义项
            </button>
          </fieldset>

          <fieldset class="field">
            <legend>词组</legend>
            <div
              v-for="(phrase, index) in draft.phrases"
              :key="index"
              class="edit-row pair"
            >
              <input v-model="phrase.text" type="text" placeholder="词组" />
              <input v-model="phrase.meaning" type="text" placeholder="释义" />
              <button
                type="button"
                class="icon-button"
                aria-label="删除这个词组"
                @click="removePhrase(index)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <button type="button" class="link" @click="addPhrase">
              + 添加词组
            </button>
          </fieldset>

          <fieldset class="field">
            <legend>例句</legend>
            <div
              v-for="(example, index) in draft.examples"
              :key="index"
              class="edit-row pair"
            >
              <input v-model="example.text" type="text" placeholder="英文例句" />
              <input v-model="example.translation" type="text" placeholder="中文" />
              <button
                type="button"
                class="icon-button"
                aria-label="删除这个例句"
                @click="removeExample(index)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <button type="button" class="link" @click="addExample">
              + 添加例句
            </button>
          </fieldset>

          <label class="field">
            <span>笔记</span>
            <textarea v-model="draft.note" rows="3" placeholder="记法、易错点、语境" />
          </label>

          <div class="field-row">
            <label class="field">
              <span>标签</span>
              <input v-model="tagsText" type="text" placeholder="用逗号分隔" />
            </label>
            <label class="field">
              <span>来源</span>
              <input v-model="draft.source" type="text" placeholder="练习 / 媒体" />
            </label>
          </div>
        </div>

        <footer class="editor-foot">
          <button
            v-if="!isNew"
            type="button"
            class="danger"
            :disabled="busy"
            @click="remove"
          >
            {{ confirming ? "再点一次确认删除" : "删除" }}
          </button>
          <span class="spacer"></span>
          <button type="button" class="ghost" @click="close">取消</button>
          <button type="submit" class="primary" :disabled="busy">保存</button>
        </footer>
      </form>
    </div>
  </section>
</template>
