<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
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
const openBook = computed(() =>
  state.books.find((book) => book.id === openBookId.value),
);
const session = ref("");
const extraNew = ref(false);
const view = computed(() => views[page.value]);
const mainPanel = ref(null);
const navigation = ref([{ page: "today", bookId: "", scrollTop: 0 }]);
const navigationIndex = ref(0);
function historyIndex(direction) {
  for (
    let index = navigationIndex.value + direction;
    index >= 0 && index < navigation.value.length;
    index += direction
  ) {
    const route = navigation.value[index];
    if (!route.bookId || state.books.some((book) => book.id === route.bookId))
      return index;
  }
  return -1;
}
const canGoBack = computed(
  () => state.ready && !state.busy && !session.value && historyIndex(-1) >= 0,
);
const canGoForward = computed(
  () => state.ready && !state.busy && !session.value && historyIndex(1) >= 0,
);
function saveScroll() {
  if (session.value) return;
  navigation.value[navigationIndex.value].scrollTop =
    mainPanel.value?.scrollTop ?? 0;
}
function showRoute(route) {
  session.value = "";
  page.value = route.page;
  openBookId.value = route.bookId;
  nextTick(() =>
    mainPanel.value?.scrollTo({ top: route.scrollTop, behavior: "auto" }),
  );
}
function navigate(target, clearMessages = true) {
  if (state.busy) return;
  if (clearMessages) {
    state.notice = "";
    state.error = "";
  }
  saveScroll();
  const current = navigation.value[navigationIndex.value];
  if (current.page === target.page && current.bookId === target.bookId) {
    showRoute(current);
    return;
  }
  const route = { ...target, scrollTop: 0 };
  navigation.value = [
    ...navigation.value.slice(0, navigationIndex.value + 1),
    route,
  ];
  navigationIndex.value = navigation.value.length - 1;
  showRoute(route);
}
function traverseHistory(direction) {
  if (
    state.busy ||
    !state.ready ||
    session.value ||
    document.querySelector("dialog[open]")
  )
    return;
  const index = historyIndex(direction);
  if (index < 0) return;
  saveScroll();
  navigationIndex.value = index;
  state.notice = "";
  state.error = "";
  showRoute(navigation.value[index]);
}
function openBookPage(bookId) {
  navigate({ page: "books", bookId });
}
function backToBooks() {
  navigate({ page: "books", bookId: "" }, false);
}

const sidebarPreference = "meletia-sidebar-width-v2";
const previousSidebarPreference = "meletia-sidebar-width";
const minSidebarWidth = 58;
const preferredSidebarWidth = ref(220);
const windowWidth = ref(window.innerWidth);
const maxSidebarWidth = computed(() =>
  Math.max(minSidebarWidth, Math.min(320, windowWidth.value - 448)),
);
const sidebarWidth = computed(() =>
  Math.max(
    minSidebarWidth,
    Math.min(maxSidebarWidth.value, preferredSidebarWidth.value),
  ),
);
const compactSidebar = computed(() => sidebarWidth.value < 168);
const resizing = ref(false);
const sidebarAnimating = ref(false);
const sidebarElement = ref(null);
let sidebarAnimationTimer;
let dragOffset = 0;
let dragStartWidth = 220;

function measureWindow() {
  stopSidebarAnimation();
  windowWidth.value = window.innerWidth;
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(sidebarPreference);
    const previous =
      saved === null ? localStorage.getItem(previousSidebarPreference) : null;
    const width = Number(saved ?? previous);
    if (width >= minSidebarWidth && width <= 320) {
      preferredSidebarWidth.value =
        previous !== null && width === 64 ? minSidebarWidth : width;
      if (previous !== null) rememberSidebarWidth();
    }
  } catch {
    // Window resizing still works when preference storage is unavailable.
  }
  window.addEventListener("resize", measureWindow);
  loadLibrary();
});
onUnmounted(() => {
  window.removeEventListener("resize", measureWindow);
  clearTimeout(sidebarAnimationTimer);
});

function rememberSidebarWidth() {
  try {
    localStorage.setItem(
      sidebarPreference,
      String(preferredSidebarWidth.value),
    );
  } catch {
    // Keep the current width for this window.
  }
}

function setSidebarWidth(width) {
  const next = Math.max(
    minSidebarWidth,
    Math.min(maxSidebarWidth.value, width),
  );
  if (next === sidebarWidth.value) return false;
  preferredSidebarWidth.value = next;
  return true;
}

function startResize(event) {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  dragStartWidth = preferredSidebarWidth.value;
  stopSidebarAnimation(true);
  dragOffset = event.clientX - sidebarWidth.value;
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
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  stopSidebarAnimation(true);
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

function stopSidebarAnimation(keepCurrentWidth = false) {
  if (keepCurrentWidth && sidebarAnimating.value && sidebarElement.value) {
    preferredSidebarWidth.value =
      sidebarElement.value.getBoundingClientRect().width;
  }
  clearTimeout(sidebarAnimationTimer);
  sidebarAnimating.value = false;
}

function finishSidebarAnimation(event) {
  if (
    event.target === event.currentTarget &&
    event.propertyName === "grid-template-columns"
  ) {
    stopSidebarAnimation();
  }
}

function toggleSidebar() {
  clearTimeout(sidebarAnimationTimer);
  sidebarAnimating.value = !window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  preferredSidebarWidth.value = compactSidebar.value ? 224 : minSidebarWidth;
  rememberSidebarWidth();
  if (sidebarAnimating.value) {
    sidebarAnimationTimer = setTimeout(() => stopSidebarAnimation(), 360);
  }
}

function go(id) {
  navigate({ page: id, bookId: "" });
}

function start(mode, options = {}) {
  saveScroll();
  state.notice = "";
  state.error = "";
  extraNew.value = mode === "learn" && options.extraNew === true;
  session.value = mode;
}

function finish() {
  navigate({ page: "today", bookId: "" }, false);
}
</script>

<template>
  <div
    class="shell"
    :class="{ resizing, 'sidebar-animating': sidebarAnimating }"
    @transitionend="finishSidebarAnimation"
    :style="{ '--sidebar-width': sidebarWidth + 'px' }"
  >
    <div class="window-chrome" data-tauri-drag-region>
      <div class="window-navigation" role="toolbar" aria-label="页面导航">
        <button
          type="button"
          class="icon-button"
          aria-label="后退"
          title="后退"
          :disabled="!canGoBack"
          @click="traverseHistory(-1)"
        >
          <Icon name="arrowLeft" :size="18" /></button
        ><button
          type="button"
          class="icon-button"
          aria-label="前进"
          title="前进"
          :disabled="!canGoForward"
          @click="traverseHistory(1)"
        >
          <Icon name="arrowRight" :size="18" /></button
        ><button
          type="button"
          class="icon-button sidebar-toggle"
          :aria-label="compactSidebar ? '展开侧栏' : '收起侧栏'"
          :title="compactSidebar ? '展开侧栏' : '收起侧栏'"
          :aria-expanded="!compactSidebar"
          aria-controls="main-sidebar"
          @click="toggleSidebar"
        >
          <Icon name="panel" :size="18" />
        </button>
      </div>
    </div>
    <aside
      id="main-sidebar"
      ref="sidebarElement"
      class="sidebar"
      :class="{ compact: compactSidebar }"
    >
      <div class="brand">
        <span
          class="brand-mark"
          :aria-label="compactSidebar ? 'Meletia' : undefined"
          >M</span
        >
        <span class="brand-name sidebar-label" :aria-hidden="compactSidebar"
          >Meletia</span
        >
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
          <span class="sidebar-label" :aria-hidden="compactSidebar">{{
            tab.label
          }}</span>
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
        <span class="sidebar-label" :aria-hidden="compactSidebar">设置</span>
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

    <main ref="mainPanel" :class="{ 'study-main': session }">
      <div v-if="state.error" class="banner error" role="alert">
        <Icon name="alert" :size="18" /><span>{{
          state.ready ? state.error : "暂时无法载入词书，请重试。"
        }}</span
        ><button
          v-if="!state.ready"
          @click="
            state.error = '';
            loadLibrary();
          "
        >
          重新载入</button
        ><button
          v-else
          class="icon-button"
          aria-label="关闭错误提示"
          @click="state.error = ''"
        >
          <Icon name="close" :size="16" />
        </button>
      </div>
      <div v-if="state.notice" class="banner" role="status">
        <Icon name="check" :size="18" /><span>{{ state.notice }}</span
        ><button
          class="icon-button"
          aria-label="关闭提示"
          @click="state.notice = ''"
        >
          <Icon name="close" :size="16" />
        </button>
      </div>

      <div
        v-if="!state.ready"
        v-show="!state.error"
        class="boot"
        aria-busy="true"
        role="status"
      >
        <span class="sr-only">正在载入词书…</span>
        <div class="skeleton skeleton-title" />
        <div class="skeleton" />
        <div class="skeleton" />
      </div>
      <StudyView v-else-if="session" :mode="session" :extra-new="extraNew" @close="finish" />
      <LibraryView
        v-else-if="page === 'books' && openBook"
        :key="openBook.id"
        :book="openBook"
        @back="backToBooks"
      />
      <component
        :is="view"
        v-else
        @start="start"
        @navigate="go"
        @open-book="openBookPage"
      />
    </main>
  </div>
</template>
