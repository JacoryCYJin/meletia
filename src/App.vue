<script setup>
import { computed, onMounted, ref } from "vue";
import TodayView from "./features/today/TodayView.vue";
import BooksView from "./features/books/BooksView.vue";
import LibraryView from "./features/library/LibraryView.vue";
import ImportView from "./features/import/ImportView.vue";
import InsightsView from "./features/insights/InsightsView.vue";
import StudyView from "./features/study/StudyView.vue";
import Icon from "./shared/Icon.vue";
import { loadLibrary, state } from "./core/library.js";

const tabs = [
  { id: "today", label: "今日", icon: "today" },
  { id: "books", label: "词书", icon: "book" },
  { id: "library", label: "词库", icon: "library" },
  { id: "import", label: "导入", icon: "import" },
  { id: "insights", label: "数据", icon: "insights" },
];

const views = {
  today: TodayView,
  books: BooksView,
  library: LibraryView,
  import: ImportView,
  insights: InsightsView,
};

const page = ref("today");
const session = ref("");
const view = computed(() => views[page.value]);

onMounted(loadLibrary);

function go(id) {
  page.value = id;
  state.notice = "";
  state.error = "";
}

function start(mode) {
  state.notice = "";
  state.error = "";
  session.value = mode;
}

function finish() {
  session.value = "";
  page.value = "today";
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-name">Meletia</span>
      </div>
      <nav aria-label="主导航">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :class="{ selected: page === tab.id }"
          :aria-current="page === tab.id ? 'page' : undefined"
          @click="go(tab.id)"
        >
          <Icon :name="tab.icon" />
          {{ tab.label }}
        </button>
      </nav>
      <p class="sidebar-foot">
        <span>{{ state.cards.length }}</span> 张卡片 ·
        <span>{{ state.books.length }}</span> 本词书
      </p>
    </aside>

    <main>
      <div v-if="state.error" class="banner error" role="alert">
        {{ state.error }}
      </div>
      <div v-if="state.notice" class="banner" role="status">
        {{ state.notice }}
      </div>

      <p v-if="!state.ready && !state.error" class="boot">正在载入词库…</p>
      <StudyView v-else-if="session" :mode="session" @close="finish" />
      <component :is="view" v-else @start="start" />
    </main>
  </div>
</template>
