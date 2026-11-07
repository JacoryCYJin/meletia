import { reactive, toRaw } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DEFAULT_SETTINGS,
  STORE_VERSION,
  bookId,
  emptyStore,
  localDay,
  migrateStore,
  newCard,
  parseSenses,
  wordKey,
} from "./content.js";
import { previewImport } from "./importer.js";
import { bookCards } from "./books.js";
import { dueAfter, nextStep, stageForStep } from "./scheduler.js";
import { resumeLearnCheckpoint } from "./session.js";

const PREVIEW_KEY = "meletia-preview";

export const state = reactive({
  books: [],
  cards: [],
  reviews: [],
  learnCheckpoint: null,
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
  busy: false,
  error: "",
  notice: "",
});

function payload(next = {}) {
  return JSON.stringify({
    version: STORE_VERSION,
    settings: next.settings ?? state.settings,
    books: next.books ?? state.books,
    cards: next.cards ?? state.cards,
    reviews: next.reviews ?? state.reviews,
    learnCheckpoint: next.learnCheckpoint === undefined ? state.learnCheckpoint : next.learnCheckpoint,
  });
}

async function readRaw() {
  if (isTauri()) return invoke("load_library");
  return localStorage.getItem(PREVIEW_KEY);
}

async function writeRaw(data) {
  if (isTauri()) {
    await invoke("save_library", { data });
    return;
  }
  localStorage.setItem(PREVIEW_KEY, data);
}

export async function loadLibrary() {
  try {
    const raw = await readRaw();
    const store = raw ? migrateStore(raw) : emptyStore();
    store.learnCheckpoint = resumeLearnCheckpoint(store.learnCheckpoint, store.cards);
    if (store.migrated) {
      const data = payload(store);
      if (isTauri()) {
        await invoke("migrate_library", { original: raw, data });
      } else {
        localStorage.setItem(`${PREVIEW_KEY}-before-v${STORE_VERSION}`, raw);
        await writeRaw(data);
      }
    }
    state.books = store.books;
    state.cards = store.cards;
    state.reviews = store.reviews;
    state.learnCheckpoint = store.learnCheckpoint;
    state.settings = store.settings;
    state.ready = true;
  } catch (cause) {
    state.error = String(cause);
  }
}

async function commit(next) {
  if (state.busy) throw new Error("上一项更改正在保存，请稍后再试。");
  state.busy = true;
  try {
    const changes = {
      ...next,
      learnCheckpoint: resumeLearnCheckpoint(
        next.learnCheckpoint === undefined ? state.learnCheckpoint : next.learnCheckpoint,
        next.cards ?? state.cards,
      ),
    };
    await writeRaw(payload(changes));
    Object.assign(state, changes);
  } finally {
    state.busy = false;
  }
}

export async function saveLearnCheckpoint(learnCheckpoint) {
  await commit({ learnCheckpoint });
}

export function setNotice(message) {
  state.notice = message;
  state.error = "";
}

export function setError(cause) {
  state.error = String(cause);
}

export function cardById(id) {
  return state.cards.find((card) => card.id === id) ?? null;
}

function requireBook(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) throw new Error("词书已不存在。");
  return book;
}

function newBook(title) {
  const name = String(title ?? "").trim();
  if (!name) throw new Error("请输入词书名称。");
  const id = bookId(name);
  if (state.books.some((book) => book.name === name || book.id === id)) {
    throw new Error("已有同名词书，请选择已有词书或换个名称。");
  }
  const createdAt = new Date().toISOString();
  return {
    id,
    name,
    source: "",
    legacy: false,
    cardIds: [],
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function createBook(name) {
  await commit({ books: [...state.books, newBook(name)] });
}

export async function saveCard(card, bookId) {
  const book = requireBook(bookId);
  const existing = cardById(card.id);
  if (existing && !book.cardIds.includes(card.id)) throw new Error("词条不属于这本词书。");
  const term = wordKey(card.term);
  if ((!existing || wordKey(existing.term) !== term) &&
      bookCards(book, state.cards).some((item) => wordKey(item.term) === term)) {
    throw new Error("这本词书里已有同名词条。");
  }
  const cards = existing
    ? state.cards.map((item) => (item.id === card.id ? card : item))
    : [...state.cards, card];

  await commit({
    cards,
    books: existing ? state.books : state.books.map((item) =>
      item.id === bookId
        ? { ...item, cardIds: [...item.cardIds, card.id], updatedAt: new Date().toISOString() }
        : item,
    ),
  });
}

export function cardsInImportTarget(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  return book ? bookCards(book, state.cards) : [];
}

export async function importCards(rows, target, { filters = {}, resolutions = {} } = {}) {
  const creating = target.name !== undefined;
  const book = creating ? newBook(target.name) : requireBook(target.bookId);
  const { added, updated: changed } = previewImport(rows, bookCards(book, state.cards), filters, resolutions);
  if (!added.length && !changed.length) return 0;
  const cards = added.map((row) => newCard(row));
  const replacements = new Map(changed.map(({ card, row }) => [card.id, parseSenses(row.definition)]));
  const updated = {
    ...book, cardIds: [...book.cardIds, ...cards.map((card) => card.id)],
    updatedAt: new Date().toISOString(),
  };
  const books = creating
    ? [...state.books, updated]
    : state.books.map((item) => item.id === book.id ? updated : item);
  await commit({
    cards: [
      ...state.cards.map((card) => replacements.has(card.id)
        ? { ...card, senses: replacements.get(card.id) } : card),
      ...cards,
    ],
    books,
  });
  return cards.length;
}

export async function deleteBook(id) {
  const removed = new Set(requireBook(id).cardIds);
  await commit({
    books: state.books.filter((book) => book.id !== id),
    cards: state.cards.filter((card) => !removed.has(card.id)),
    reviews: state.reviews.filter((review) => !removed.has(review.cardId)),
  });
}

export function previewBookMerge(primaryId, secondaryId) {
  if (primaryId === secondaryId) throw new Error("请选择两本不同的词书。");
  const primary = requireBook(primaryId);
  const secondary = requireBook(secondaryId);
  const byTerm = new Map();
  const duplicates = new Map();
  let moved = 0;

  for (const book of [primary, secondary]) {
    for (const card of bookCards(book, state.cards)) {
      const term = wordKey(card.term);
      if (byTerm.has(term)) {
        duplicates.set(card.id, byTerm.get(term));
      } else {
        byTerm.set(term, card.id);
        if (book.id === secondaryId) moved += 1;
      }
    }
  }

  return { primary, secondary, cardIds: [...byTerm.values()], duplicates, moved };
}

export async function mergeBooks(primaryId, secondaryId, newName) {
  const { primary, secondary, cardIds, duplicates, moved } = previewBookMerge(primaryId, secondaryId);
  const creating = newName !== undefined;
  const destination = creating
    ? { ...newBook(newName), active: primary.active || secondary.active }
    : primary;
  const books = state.books.filter((book) => book.id !== secondaryId);
  const merged = {
    ...destination, cardIds,
    updatedAt: creating || moved > 0 ? new Date().toISOString() : destination.updatedAt,
  };

  await commit({
    books: creating
      ? [...books.filter((book) => book.id !== primaryId), merged]
      : books.map((book) => book.id === primaryId ? merged : book),
    cards: state.cards.filter((card) => !duplicates.has(card.id)),
    reviews: state.reviews.map((review) => duplicates.has(review.cardId)
      ? { ...review, cardId: duplicates.get(review.cardId) }
      : review),
  });
  return merged;
}

export async function deleteCard(cardId, bookId) {
  const book = requireBook(bookId);
  if (!book.cardIds.includes(cardId)) throw new Error("词条不属于这本词书。");
  await commit({
    cards: state.cards.filter((card) => card.id !== cardId),
    books: state.books.map((item) => item.id === bookId
      ? { ...item, cardIds: item.cardIds.filter((id) => id !== cardId) }
      : item),
    reviews: state.reviews.filter((review) => review.cardId !== cardId),
  });
}

export async function updateBook(id, patch) {
  await commit({
    books: state.books.map((book) =>
      book.id === id ? { ...book, ...patch } : book,
    ),
  });
}

export async function updateSettings(patch) {
  await commit({ settings: { ...state.settings, ...patch } });
}

export function graduate(card, now = new Date()) {
  const step = 0;
  return {
    ...card,
    progress: {
      ...card.progress,
      stage: stageForStep(step),
      step,
      streak: 0,
      lastRating: 3,
      lastSeenAt: now.toISOString(),
      introducedOn: card.progress.introducedOn ?? localDay(now),
      needsRecall: false,
      dueAt: dueAfter(step, now),
    },
  };
}

export function reviewCard(card, rating, now = new Date()) {
  const step = nextStep(card.progress.step, rating);
  return {
    ...card,
    progress: {
      ...card.progress,
      stage: stageForStep(step),
      step,
      streak: 0,
      lastRating: rating,
      lastSeenAt: now.toISOString(),
      needsRecall: false,
      lapses: card.progress.lapses + (rating === 1 ? 1 : 0),
      dueAt: dueAfter(step, now),
    },
  };
}

export function missSpelling(card, now = new Date()) {
  return {
    ...card,
    progress: {
      ...card.progress,
      stage: stageForStep(0),
      step: 0,
      needsRecall: true,
      lapses: card.progress.lapses + 1,
      lastSeenAt: now.toISOString(),
      dueAt: now.toISOString(),
    },
  };
}

export async function saveStudyResult(card, stage, rating, now = new Date(), learnCheckpoint) {
  const updated = {
    learn: graduate,
    review: (item, at) => reviewCard(item, rating, at),
    spell: missSpelling,
  }[stage](card, now);
  const record = { cardId: card.id, at: now.toISOString(), stage, rating };
  await commit({
    cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
    reviews: [...state.reviews, record],
    learnCheckpoint,
  });
  return { record, previousProgress: card.progress, savedProgress: updated.progress };
}

export async function undoStudyResult({ record, previousProgress, savedProgress }, learnCheckpoint) {
  const card = cardById(record.cardId);
  const index = state.reviews.findIndex((entry) => toRaw(entry) === record);
  if (!card || toRaw(card.progress) !== savedProgress || index < 0) {
    throw new Error("学习进度已经变化，无法返回上一词。");
  }

  const cards = state.cards.map((item) =>
    item.id === card.id ? { ...item, progress: previousProgress } : item,
  );
  const reviews = state.reviews.slice();
  reviews.splice(index, 1);
  await commit({ cards, reviews, learnCheckpoint });
}
