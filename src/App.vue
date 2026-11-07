<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import TodayView from "./features/today/TodayView.vue";
import BooksView from "./features/books/BooksView.vue";
import LibraryView from "./features/library/LibraryView.vue";
import InsightsView from "./features/insights/InsightsView.vue";
import SettingsView from "./features/settings/SettingsView.vue";
import StudyView from "./features/study/StudyView.vue";
import Icon from "./shared/Icon.vue";
import { loadLibrary, state } from "./core/library.js";

const tabs = [
  { id: "today", label: "今日", icon: "today" },
  { id: "books", label: "词书", icon: "book" },
  { id: "insights", label: "数据", icon: "insights" },
];

const views = {
  today: TodayView,
  books: BooksView,
  insights: InsightsView,
  settings: SettingsView,
};

const page = ref("today");
const openBookId = ref("");
const openBook = computed(() => state.books.find((book) => book.id === openBookId.value));
const session = ref("");
const view = computed(() => views[page.value]);

const sidebarPreference = "meletia-sidebar-width-v2";
const previousSidebarPreference = "meletia-sidebar-width";
const minSidebarWidth = 58;
const preferredSidebarWidth = ref(220);
const windowWidth = ref(window.innerWidth);
const maxSidebarWidth = computed(() => Math.max(minSidebarWidth, Math.min(320, windowWidth.value - 448)));
const sidebarWidth = computed(() =>
  Math.max(minSidebarWidth, Math.min(maxSidebarWidth.value, preferredSidebarWidth.value)),
);
const compactSidebar = computed(() => sidebarWidth.value < 116);
const resizing = ref(false);
let dragOffset = 0;
let dragStartWidth = 220;

function measureWindow() {
  windowWidth.value = window.innerWidth;
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(sidebarPreference);
    const previous = saved === null ? localStorage.getItem(previousSidebarPreference) : null;
    const width = Number(saved ?? previous);
    if (width >= minSidebarWidth && width <= 320) {
      preferredSidebarWidth.value = previous !== null && width === 64 ? minSidebarWidth : width;
      if (previous !== null) rememberSidebarWidth();
    }
  } catch {
    // Window resizing still works when preference storage is unavailable.
  }
  window.addEventListener("resize", measureWindow);
  loadLibrary();
});
onUnmounted(() => window.removeEventListener("resize", measureWindow));

function rememberSidebarWidth() {
  try {
    localStorage.setItem(sidebarPreference, String(preferredSidebarWidth.value));
  } catch {
    // Keep the current width for this window.
  }
}

function setSidebarWidth(width) {
  const next = Math.max(minSidebarWidth, Math.min(maxSidebarWidth.value, width));
  if (next === sidebarWidth.value) return false;
  preferredSidebarWidth.value = next;
  return true;
}

function startResize(event) {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  dragOffset = event.clientX - sidebarWidth.value;
  dragStartWidth = preferredSidebarWidth.value;
  event.currentTarget.focus();
  event.currentTarget.setPointerCapture(event.pointerId);
  resizing.value = true;
}

function resizeSidebar(event) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    setSidebarWidth(event.clientX - dragOffset);
  }
}

function finishResize() {
  resizing.value = false;
  if (dragStartWidth !== preferredSidebarWidth.value) rememberSidebarWidth();
}

function resizeWithKeyboard(event) {
  const widths = {
    ArrowLeft: sidebarWidth.value - 12,
    ArrowRight: sidebarWidth.value + 12,
    Home: minSidebarWidth,
    End: maxSidebarWidth.value,
  };
  if (!Object.hasOwn(widths, event.key)) return;
  event.preventDefault();
  if (setSidebarWidth(widths[event.key])) rememberSidebarWidth();
}

function go(id) {
  if (state.busy) return;
  page.value = id;
  openBookId.value = "";
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
  <div class="shell" :class="{ resizing }" :style="{ '--sidebar-width': sidebarWidth + 'px' }">
    <aside id="main-sidebar" class="sidebar" :class="{ compact: compactSidebar }">
      <div class="brand">
        <span class="brand-name" aria-label="Meletia">{{ compactSidebar ? "M" : "Meletia" }}</span>
      </div>
      <nav aria-label="主导航">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :class="{ selected: page === tab.id }"
          :aria-current="page === tab.id ? 'page' : undefined"
          :aria-label="tab.label"
          :title="compactSidebar ? tab.label : undefined"
          :disabled="state.busy"
          @click="go(tab.id)"
        >
          <Icon :name="tab.icon" />
          <span v-if="!compactSidebar">{{ tab.label }}</span>
        </button>
      </nav>
      <button
        type="button"
        class="sidebar-settings"
        :class="{ selected: page === 'settings' }"
        :aria-current="page === 'settings' ? 'page' : undefined"
        :title="compactSidebar ? '设置' : undefined"
        aria-label="设置"
        :disabled="state.busy || Boolean(session)"
        @click="go('settings')"
      >
        <Icon name="settings" />
        <span v-if="!compactSidebar">设置</span>
      </button>
    </aside>

    <div
      class="sidebar-divider"
      role="separator"
      tabindex="0"
      aria-label="导航侧栏宽度"
      aria-controls="main-sidebar"
      aria-orientation="vertical"
      :aria-valuemin="minSidebarWidth"
      :aria-valuemax="maxSidebarWidth"
      :aria-valuenow="sidebarWidth"
      @pointerdown="startResize"
      @pointermove="resizeSidebar"
      @lostpointercapture="finishResize"
      @keydown="resizeWithKeyboard"
    ></div>

    <main :class="{ 'study-main': session }">
      <div v-if="state.error" class="banner error" role="alert">
        {{ state.error }}
      </div>
      <div v-if="state.notice" class="banner" role="status">
        {{ state.notice }}
      </div>

      <p v-if="!state.ready" v-show="!state.error" class="boot">正在载入词书…</p>
      <StudyView v-else-if="session" :mode="session" @close="finish" />
      <LibraryView
        v-else-if="page === 'books' && openBook"
        :key="openBook.id"
        :book="openBook"
        @back="go('books')"
      />
      <component :is="view" v-else @start="start" @open-book="openBookId = $event" />
    </main>
  </div>
</template>
