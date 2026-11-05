import { reactive } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DEFAULT_SETTINGS,
  bookId,
  emptyStore,
  localDay,
  migrateStore,
  sourcesOf,
} from "./content.js";
import { dueAfter, nextStep, stageForStep } from "./scheduler.js";

const PREVIEW_KEY = "meletia-preview";

export const state = reactive({
  books: [],
  cards: [],
  reviews: [],
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
  busy: false,
  error: "",
  notice: "",
});

function payload(next = {}) {
  return JSON.stringify({
    version: 4,
    settings: next.settings ?? state.settings,
    books: next.books ?? state.books,
    cards: next.cards ?? state.cards,
    reviews: next.reviews ?? state.reviews,
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
    state.books = store.books;
    state.cards = store.cards;
    state.reviews = store.reviews;
    state.settings = store.settings;
    state.ready = true;
    if (store.migrated) await persist();
  } catch (cause) {
    state.error = String(cause);
  }
}

export async function persist() {
  await writeRaw(payload());
}

export async function commit(next) {
  await writeRaw(payload(next));
  if (next.books) state.books = next.books;
  if (next.cards) state.cards = next.cards;
  if (next.reviews) state.reviews = next.reviews;
  if (next.settings) state.settings = next.settings;
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

export function booksOfCard(card) {
  return state.books.filter((book) => book.cardIds.includes(card.id));
}

function withMembership(books, cardId, bookIds) {
  return books.map((book) => {
    const wanted = bookIds.includes(book.id);
    const has = book.cardIds.includes(cardId);
    if (wanted && !has) return { ...book, cardIds: [...book.cardIds, cardId] };
    if (!wanted && has)
      return { ...book, cardIds: book.cardIds.filter((id) => id !== cardId) };
    return book;
  });
}

function ensureBook(books, name, source = "") {
  const found = books.find((book) => book.name === name);
  if (found) return books;
  return [
    ...books,
    {
      id: bookId(name),
      name,
      source,
      cardIds: [],
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];
}

export async function saveCard(card, bookIds) {
  const exists = state.cards.some((item) => item.id === card.id);
  const cards = exists
    ? state.cards.map((item) => (item.id === card.id ? card : item))
    : [...state.cards, card];

  let books = state.books;
  let targets = bookIds;

  if (!exists && (!targets || !targets.length)) {
    books = ensureBook(books, "自建");
    targets = [books.find((book) => book.name === "自建").id];
  }

  if (targets) books = withMembership(books, card.id, targets);

  await commit({ cards, books });
}

export async function addCards(cards) {
  if (!cards.length) return;

  let books = state.books;
  for (const card of cards) {
    const names = sourcesOf(card);
    for (const name of names.length ? names : ["未分类"]) {
      books = ensureBook(books, name, name);
      const book = books.find((item) => item.name === name);
      if (!book.cardIds.includes(card.id)) {
        books = books.map((item) =>
          item.id === book.id
            ? { ...item, cardIds: [...item.cardIds, card.id] }
            : item,
        );
      }
    }
  }

  await commit({ cards: [...state.cards, ...cards], books });
}

export async function deleteCard(cardId) {
  await commit({
    cards: state.cards.filter((card) => card.id !== cardId),
    books: state.books.map((book) => ({
      ...book,
      cardIds: book.cardIds.filter((id) => id !== cardId),
    })),
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
      needsRecall: rating === 1,
      lapses: card.progress.lapses + (rating === 1 ? 1 : 0),
      dueAt: rating === 1 ? now.toISOString() : dueAfter(step, now),
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

export async function recordReview(entry) {
  await commit({ reviews: [...state.reviews, entry] });
}
