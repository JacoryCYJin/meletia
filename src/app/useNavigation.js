import { computed, nextTick, ref } from "vue";
import { state } from "../storage/store.js";

export function useNavigation({ session, dictationActive, mainPanel }) {
  const page = ref("today");
  const openBookId = ref("");
  const openBook = computed(() =>
    state.books.find((book) => book.id === openBookId.value),
  );
  const navigation = ref([{ page: "today", bookId: "", scrollTop: 0 }]);
  const navigationIndex = ref(0);

  function historyIndex(direction) {
    for (
      let index = navigationIndex.value + direction;
      index >= 0 && index < navigation.value.length;
      index += direction
    ) {
      const route = navigation.value[index];
      if (
        !route.bookId ||
        state.books.some((book) => book.id === route.bookId)
      ) {
        return index;
      }
    }
    return -1;
  }

  const canGoBack = computed(
    () =>
      state.ready &&
      !state.busy &&
      !session.value &&
      historyIndex(-1) >= 0,
  );
  const canGoForward = computed(
    () =>
      state.ready &&
      !state.busy &&
      !session.value &&
      historyIndex(1) >= 0,
  );

  function saveScroll() {
    if (session.value) return;
    navigation.value[navigationIndex.value].scrollTop =
      mainPanel.value?.scrollTop ?? 0;
  }

  function showRoute(route) {
    session.value = "";
    dictationActive.value = false;
    page.value = route.page;
    openBookId.value = route.bookId;
    nextTick(() =>
      mainPanel.value?.scrollTo({
        top: route.scrollTop,
        behavior: "auto",
      }),
    );
  }

  function navigate(target, clearMessages = true) {
    if (state.busy) return;
    if (clearMessages) state.error = "";
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
    ) {
      return;
    }
    const index = historyIndex(direction);
    if (index < 0) return;
    saveScroll();
    navigationIndex.value = index;
    state.error = "";
    showRoute(navigation.value[index]);
  }

  function openBookPage(bookId) {
    navigate({ page: "books", bookId });
  }

  function openBrowse(bookId) {
    navigate({ page: "browse", bookId });
  }

  function openCsvPreview() {
    navigate({ page: "csv-preview", bookId: "" });
  }

  function backToBooks() {
    navigate({ page: "books", bookId: "" }, false);
  }

  return {
    page,
    openBookId,
    openBook,
    navigation,
    navigationIndex,
    canGoBack,
    canGoForward,
    saveScroll,
    showRoute,
    navigate,
    traverseHistory,
    openBookPage,
    openBrowse,
    openCsvPreview,
    backToBooks,
  };
}
