import { computed, ref, shallowRef } from "vue";
import { cardById, setError, state } from "../../storage/store.js";
import {
  saveLearnCheckpoint,
  saveStudyResult,
  undoStudyResult,
} from "./actions.js";
import {
  continueQuestion,
  createLearnSession,
  createReviewSession,
  resumeLearnCheckpoint,
} from "./session.js";
import { pendingStudyCards, studySummary } from "./summary.js";
import { dayTasks } from "./tasks.js";

export function useStudySession({
  mode,
  extraNew,
  busy,
  moveTo,
  restoredChoices,
  selectedChoice,
  getCard,
  getEntry,
  getChoices,
  onClose,
  resetTransient,
}) {
  const session = ref(null);
  const previous = shallowRef(null);
  const summaryNow = ref(new Date());
  const groupIds = ref([]);
  const excludedIds = ref([]);

  const showPrevious = computed(() =>
    ["card", "choice-feedback", "detail", "spelling-ready"].includes(
      session.value?.phase,
    ),
  );
  const skippedIds = computed(() =>
    groupIds.value.filter((id) => !session.value?.done.includes(id)),
  );
  const summary = computed(() =>
    studySummary({
      session: session.value,
      cards: state.cards,
      books: state.books,
      settings: state.settings,
      reviews: state.reviews,
      now: summaryNow.value,
      extraNew,
      excludedIds: [...excludedIds.value, ...skippedIds.value],
    }),
  );

  function rememberGroup() {
    groupIds.value = [
      ...new Set([
        ...session.value.done,
        ...session.value.queue.map((entry) => entry.id),
      ]),
    ];
  }

  function buildSession() {
    if (mode === "learn" && state.learnCheckpoint) {
      const saved = resumeLearnCheckpoint(state.learnCheckpoint, state.cards);
      if (saved) {
        session.value = saved.session;
        restoredChoices.value = saved.choices ?? null;
        selectedChoice.value = saved.selectedChoice ?? null;
        rememberGroup();
        return;
      }
    }
    const tasks = dayTasks(
      state.cards,
      state.books,
      state.settings,
      new Date(),
      state.reviews,
    );
    if (mode === "learn") {
      const cards = (extraNew ? tasks.extraFresh : tasks.fresh)
        .map(cardById)
        .filter(Boolean);
      session.value = createLearnSession(cards, state.settings.groupSize);
    } else {
      session.value = createReviewSession([...tasks.recall, ...tasks.review]);
    }
    rememberGroup();
  }

  async function persistPosition(next, details) {
    busy.value = true;
    try {
      await saveLearnCheckpoint({ session: next, ...details });
      return true;
    } catch (cause) {
      setError(cause);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function moveWithCheckpoint(next) {
    if (busy.value) return;
    if (mode === "learn" && !(await persistPosition(next))) return;
    moveTo(next);
  }

  async function advance(next, rating, positionSaved = false) {
    if (busy.value) return;

    const checkpoint = {
      session: { ...session.value, phase: "card", rating: null },
      choices: getChoices(),
      saved: null,
    };
    if (next.done.length === session.value.done.length) {
      if (mode === "learn" && !positionSaved && !(await persistPosition(next))) {
        return;
      }
      previous.value = checkpoint;
      moveTo(next);
      return;
    }

    busy.value = true;
    try {
      checkpoint.saved = await saveStudyResult(
        getCard(),
        mode,
        getEntry()?.firstRating ?? rating,
        new Date(),
        mode === "learn" ? { session: next } : undefined,
        { mastered: true },
      );
      previous.value = checkpoint;
      moveTo(next);
    } catch (cause) {
      setError(cause);
    } finally {
      busy.value = false;
    }
  }

  async function goBack() {
    const checkpoint = previous.value;
    if (!checkpoint || !showPrevious.value || busy.value) return;

    busy.value = true;
    try {
      const savedPosition =
        mode === "learn" ? { session: checkpoint.session } : undefined;
      if (checkpoint.saved) {
        await undoStudyResult(checkpoint.saved, savedPosition);
      } else if (savedPosition) {
        await saveLearnCheckpoint(savedPosition);
      }
      previous.value = null;
      moveTo(checkpoint.session);
      restoredChoices.value = checkpoint.choices;
    } catch (cause) {
      setError(cause);
    } finally {
      busy.value = false;
    }
  }

  async function continueFromSummary() {
    if (busy.value || session.value?.phase !== "finished") return;
    busy.value = true;
    try {
      const skipped = [...new Set([...excludedIds.value, ...skippedIds.value])];
      const pending = pendingStudyCards({
        mode,
        cards: state.cards,
        books: state.books,
        settings: state.settings,
        reviews: state.reviews,
        now: new Date(),
        extraNew,
        excludedIds: skipped,
      });
      const next =
        mode === "learn"
          ? createLearnSession(pending, state.settings.groupSize)
          : createReviewSession(pending);
      if (mode === "learn") {
        await saveLearnCheckpoint(next.total ? { session: next } : null);
      }
      if (!next.total) {
        onClose();
        return;
      }
      excludedIds.value = skipped;
      previous.value = null;
      resetTransient();
      moveTo(next);
      rememberGroup();
    } catch (cause) {
      setError(cause);
    } finally {
      busy.value = false;
    }
  }

  return {
    session,
    previous,
    summaryNow,
    groupIds,
    excludedIds,
    showPrevious,
    skippedIds,
    summary,
    buildSession,
    rememberGroup,
    persistPosition,
    moveWithCheckpoint,
    advance,
    goBack,
    continueFromSummary,
  };
}
