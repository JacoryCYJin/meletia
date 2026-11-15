import { computed, ref } from "vue";
import { cardById, state } from "../../storage/store.js";
import { saveDictationResult } from "./actions.js";
import { createDictationSession } from "./session.js";
import {
  buildFreeDictationQueue,
  dictationTasks,
} from "./tasks.js";
import { useDictationRunner } from "./useDictationRunner.js";

export function useTodayDictation(now, setActive = () => {}) {
  const tasks = computed(() =>
    dictationTasks(
      state.cards,
      state.books,
      state.settings,
      now.value,
      state.reviews,
    ),
  );
  const size = computed(() =>
    Number.isSafeInteger(state.settings.dictationGroupSize)
      ? state.settings.dictationGroupSize
      : 10,
  );
  const session = ref(null);
  const kind = ref("fresh");
  const queueIds = ref([]);
  const freeOpen = ref(false);
  const freeBooks = ref([]);
  const freeRange = ref("all");
  const freeSize = ref(10);

  const runner = useDictationRunner({
    session,
    cardOf: cardById,
    replayLimit: computed(() => state.settings.dictationReplays ?? 2),
    saveCorrect: async (card) => {
      if (kind.value !== "free") await saveDictationResult(card, true);
    },
    saveWrong: async (card) => {
      if (kind.value !== "free") await saveDictationResult(card, false);
    },
  });

  const freeQueue = computed(() =>
    buildFreeDictationQueue({
      cards: state.cards,
      books: state.books,
      bookIds: freeBooks.value,
      range: freeRange.value,
      limit: freeSize.value,
    }),
  );

  function startRound(ids, nextKind) {
    if (!ids.length) return;
    kind.value = nextKind;
    queueIds.value = ids;
    session.value = createDictationSession(ids, ids.length);
    runner.reset();
    setActive(true);
  }

  function start(nextKind) {
    const source = nextKind === "fresh" ? tasks.value.fresh : tasks.value.due;
    startRound(
      source.slice(0, size.value).map((item) => item.id),
      nextKind,
    );
  }

  function exit() {
    session.value = null;
    setActive(false);
  }

  function restart() {
    if (kind.value === "free") {
      startRound(queueIds.value, "free");
      return;
    }
    const source = kind.value === "fresh" ? tasks.value.fresh : tasks.value.due;
    const next = source.slice(0, size.value).map((item) => item.id);
    if (!next.length) {
      exit();
      return;
    }
    startRound(next, kind.value);
  }

  function openFreePractice(activeBooks) {
    const defaults = activeBooks.filter((book) => book.dictation === true);
    freeBooks.value = (defaults.length ? defaults : activeBooks).map(
      (book) => book.id,
    );
    freeRange.value = "all";
    freeSize.value = size.value;
    freeOpen.value = true;
  }

  function startFreePractice() {
    const ids = freeQueue.value.map((item) => item.id);
    if (!ids.length) return;
    freeOpen.value = false;
    startRound(ids, "free");
  }

  function handleKey(event) {
    if (!session.value) return;
    if (
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.repeat
    ) {
      return;
    }
    if (session.value.phase === "dictation-finished") {
      if (event.key === "Enter" && !event.target?.closest?.("button")) {
        event.preventDefault();
        restart();
      }
      return;
    }
    runner.handleKey(event);
  }

  return {
    tasks,
    size,
    session,
    kind,
    freeOpen,
    freeBooks,
    freeRange,
    freeSize,
    freeQueue,
    runner,
    start,
    exit,
    restart,
    openFreePractice,
    startFreePractice,
    handleKey,
  };
}
