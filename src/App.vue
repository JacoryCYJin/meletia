<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useNavigation } from "./app/useNavigation.js";
import { minSidebarWidth, useSidebar } from "./app/useSidebar.js";
import TrashView from "./features/trash/TrashView.vue";
import { cleanupTrash } from "./features/trash/actions.js";
import { notify } from "./shared/notifications.js";
import TodayView from "./features/today/TodayView.vue";
import BooksView from "./features/books/BooksView.vue";
import LibraryView from "./features/library/LibraryView.vue";
import InsightsView from "./features/insights/InsightsView.vue";
import SettingsView from "./features/settings/SettingsView.vue";
import StudyView from "./features/study/StudyView.vue";
import BrowseView from "./features/library/BrowseView.vue";
import CsvPreviewView from "./features/import/CsvPreviewView.vue";
import Icon from "./shared/Icon.vue";
import ToastHost from "./shared/ToastHost.vue";
import { loadLibrary, state } from "./storage/store.js";

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
  trash: TrashView,
};

const session = ref("");
const extraNew = ref(false);
const dictationActive = ref(false);
const mainPanel = ref(null);

const {
  page,
  openBook,
  canGoBack,
  canGoForward,
  saveScroll,
  navigate,
  traverseHistory,
  openBookPage,
  openBrowse,
  openCsvPreview,
  backToBooks,
} = useNavigation({ session, dictationActive, mainPanel });

const view = computed(() => views[page.value]);

const {
  maxSidebarWidth,
  sidebarWidth,
  compactSidebar,
  resizing,
  sidebarAnimating,
  sidebarElement,
  startResize,
  resizeSidebar,
  finishResize,
  resizeWithKeyboard,
  finishSidebarAnimation,
  toggleSidebar,
} = useSidebar();

let trashCleanupTimer;
async function cleanExpiredTrash() {
  try {
    await cleanupTrash();
  } catch (cause) {
    notify.error(
      `回收站清理失败，请重试。${String(cause.message ?? cause)}`,
    );
  }
}

onMounted(() => {
  loadLibrary();
  trashCleanupTimer = setInterval(cleanExpiredTrash, 60000);
  window.addEventListener("focus", cleanExpiredTrash);
});
onUnmounted(() => {
  clearInterval(trashCleanupTimer);
  window.removeEventListener("focus", cleanExpiredTrash);
});

function go(id) {
  navigate({ page: id, bookId: "" });
}

function start(mode, options = {}) {
  saveScroll();
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
          :class="{ selected: page === tab.id || (['browse', 'csv-preview', 'trash'].includes(page) && tab.id === 'books') }"
          :aria-current="page === tab.id || (['browse', 'csv-preview', 'trash'].includes(page) && tab.id === 'books') ? 'page' : undefined"
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

    <main ref="mainPanel" :class="{ 'study-main': session || ['browse', 'csv-preview'].includes(page) || (page === 'today' && dictationActive), 'insights-main': !session && page === 'insights', 'no-scrollbar': page === 'today' }">
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
      <CsvPreviewView v-else-if="page === 'csv-preview'" @close="backToBooks" />
      <BrowseView v-else-if="page === 'browse' && openBook" :key="openBook.id" :book="openBook" @close="openBookPage(openBook.id)" />
      <LibraryView
        v-else-if="page === 'books' && openBook"
        :key="openBook.id"
        :book="openBook"
        @back="backToBooks"
        @browse="openBrowse(openBook.id)"
      />
      <component
        :is="view"
        v-else
        @start="start"
        @navigate="go"
        @open-book="openBookPage"
        @csv-preview="openCsvPreview"
        @trash="navigate({ page: 'trash', bookId: '' })"
        @dictation-active="dictationActive = $event"
      />
    </main>
    <ToastHost />
  </div>
</template>
