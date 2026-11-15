import { reactive } from "vue";
import { DEFAULT_SETTINGS } from "../features/settings/model.js";
import { resumeLearnCheckpoint } from "../features/study/session.js";
import {
  isTrashExpired,
  removeTrashEntries,
} from "../features/trash/model.js";
import { notify } from "../shared/notifications.js";
import { emptyStore, migrateStore } from "./migrate.js";
import {
  migrateRaw,
  payload,
  readRaw,
  writeRaw,
} from "./persistence.js";

export const state = reactive({
  books: [],
  cards: [],
  reviews: [],
  importBatches: [],
  trash: [],
  learnCheckpoint: null,
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
  busy: false,
  error: "",
});

export async function loadLibrary() {
  try {
    const raw = await readRaw();
    const store = raw ? migrateStore(raw) : emptyStore();
    store.learnCheckpoint = resumeLearnCheckpoint(
      store.learnCheckpoint,
      store.cards,
    );
    if (store.migrated) {
      await migrateRaw(raw, payload(store, state));
    }
    state.books = store.books;
    state.cards = store.cards;
    state.reviews = store.reviews;
    state.importBatches = store.importBatches;
    state.trash = store.trash;
    state.learnCheckpoint = store.learnCheckpoint;
    state.settings = store.settings;
    // Persist expiry cleanup before exposing the loaded library.
    const expired = store.trash.filter((entry) => isTrashExpired(entry));
    if (expired.length) {
      await commit(removeTrashEntries(state, expired.map((entry) => entry.id)));
    }
    state.ready = true;
  } catch (cause) {
    state.error = String(cause);
  }
}

export async function commit(next) {
  if (state.busy) throw new Error("上一项更改正在保存，请稍后再试。");
  state.busy = true;
  try {
    const changes = {
      ...next,
      learnCheckpoint: resumeLearnCheckpoint(
        next.learnCheckpoint === undefined
          ? state.learnCheckpoint
          : next.learnCheckpoint,
        next.cards ?? state.cards,
      ),
    };
    await writeRaw(payload(changes, state));
    Object.assign(state, changes);
  } finally {
    state.busy = false;
  }
}

export function setError(cause) {
  if (!state.ready) state.error = String(cause);
  else return notify.error(String(cause));
}

export function cardById(id) {
  return state.cards.find((card) => card.id === id) ?? null;
}
