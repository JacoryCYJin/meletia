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
import { notify } from "./notifications.js";
import { studyDaysOf, withStudyAttempt } from "./study-status.js";

import { trashSnapshot, restoreTrashChanges, removeTrashEntries, isTrashExpired, validRetention } from "./recycle-bin.js";

const PREVIEW_KEY = "meletia-preview";

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

function payload(next = {}) {
  return JSON.stringify({
    version: STORE_VERSION,
    settings: next.settings ?? state.settings,
    books: next.books ?? state.books,
    cards: next.cards ?? state.cards,
    reviews: next.reviews ?? state.reviews,
    importBatches: next.importBatches ?? state.importBatches,
    trash: next.trash ?? state.trash,
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
    state.importBatches = store.importBatches;
    state.trash = store.trash;
    state.learnCheckpoint = store.learnCheckpoint;
    state.settings = store.settings;
    // Persist expiry cleanup before exposing the loaded library.
    const expired = store.trash.filter(entry => isTrashExpired(entry));
    if (expired.length) await commit(removeTrashEntries(state, expired.map(entry => entry.id)));
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

export async function saveStudyAttempt(cardId, rating, now = new Date(), learnCheckpoint, mastered) {
  const card = cardById(cardId);
  if (!card) throw new Error("词条已不存在。");
  const updated = withStudyAttempt(card, rating, now, mastered);
  await commit({
    cards: state.cards.map((item) => item.id === cardId ? updated : item),
    learnCheckpoint,
  });
}

export function setNotice(message) {
  return notify.success(message);
}

export function setError(cause) {
  if (!state.ready) state.error = String(cause);
  else return notify.error(String(cause));
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
  if (state.books.some((book) => book.name === name)) {
    throw new Error("已有同名词书，请选择已有词书或换个名称。");
  }
  const baseId = bookId(name);
  let id = baseId;
  let suffix = 1;
  while (state.books.some((book) => book.id === id) || state.trash.some(entry => entry.book.id === id)) id = `${baseId}-${suffix++}`;
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

export async function renameBook(id, title) {
  const book = requireBook(id);
  const name = String(title ?? "").trim();
  if (!name) throw new Error("请输入词书名称。");
  if (state.books.some(item => item.id !== id && item.name === name)) {
    throw new Error("已有同名词书，请换个名称。");
  }
  if (name === book.name) return;
  await commit({ books: state.books.map(item => item.id === id
    ? { ...item, name, updatedAt: new Date().toISOString() } : item) });
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
  const contentChanged = !existing ||
    JSON.stringify(contentWithoutProgress(existing)) !== JSON.stringify(contentWithoutProgress(card));
  // Imports have their own reversible batch timestamps; this records manual content edits only.
  const saved = {
    ...card,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    editedAt: contentChanged ? new Date().toISOString() : existing.editedAt ?? null,
  };
  const cards = existing
    ? state.cards.map((item) => (item.id === card.id ? saved : item))
    : [...state.cards, saved];

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

export async function importCards(
  rows,
  target,
  { filters = {}, resolutions = {}, fileName = "" } = {},
) {
  const creating = target.name !== undefined;
  const book = creating ? newBook(target.name) : requireBook(target.bookId);
  const {
    added,
    updated: changed,
    duplicates,
  } = previewImport(rows, bookCards(book, state.cards), filters, resolutions);
  const cards = added.map((row) => newCard(row));
  const replacements = new Map(
    changed.map(({ card, row }) => [card.id, parseSenses(row.definition)]),
  );
  const updated = {
    ...book,
    cardIds: [...book.cardIds, ...cards.map((card) => card.id)],
    updatedAt: new Date().toISOString(),
  };
  const books =
    !creating && !cards.length && !changed.length
      ? state.books
      : creating
        ? [...state.books, updated]
        : state.books.map((item) => (item.id === book.id ? updated : item));
  const batch = {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `import-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    bookId: book.id,
    bookCreatedAt: book.createdAt,
    createdAt: new Date().toISOString(),
    fileName: fileName || "导入词表",
    status: "imported",
    duplicates,
    added: JSON.parse(JSON.stringify(cards)),
    updated: changed.map(({ card }) => ({
      id: card.id,
      term: card.term,
      before: JSON.parse(JSON.stringify(card.senses)),
      after: JSON.parse(JSON.stringify(replacements.get(card.id))),
    })),
  };
  await commit({
    importBatches: [...state.importBatches, batch],
    cards: [
      ...state.cards.map((card) =>
        replacements.has(card.id)
          ? { ...card, senses: replacements.get(card.id) }
          : card,
      ),
      ...cards,
    ],
    books,
  });
  return cards.length;
}

function contentWithoutProgress(card) {
  const { progress, editedAt, ...content } = card;
  return content;
}

export function previewImportUndo(batchId) {
  const batch = state.importBatches.find((item) => item.id === batchId);
  if (!batch) throw new Error("导入批次已不存在。");
  const conflicts = [];
  const book = state.books.find((item) => item.id === batch.bookId);
  if (batch.status === "undone") conflicts.push("该批次已撤销。");
  if (!book || book.createdAt !== batch.bookCreatedAt)
    conflicts.push("原目标词书已删除或变化。");
  if (batch.invalidated) conflicts.push(batch.invalidated);
  const touched = new Set(
    [...batch.added, ...batch.updated].map((item) => item.id),
  );
  const later = state.importBatches
    .slice(state.importBatches.indexOf(batch) + 1)
    .filter(
      (item) =>
        item.status !== "undone" &&
        item.updated.some((entry) => touched.has(entry.id)),
    );
  if (later.length)
    conflicts.push("这些词条被后续批次修改过，请先撤销相关的后续批次。");
  const cardsById = new Map(state.cards.map((card) => [card.id, card]));
  const owned = new Set(book?.cardIds ?? []);
  const addedIds = new Set(batch.added.map((card) => card.id));
  for (const original of [...batch.added, ...batch.updated]) {
    const card = cardsById.get(original.id);
    if (!card || !owned.has(original.id)) {
      conflicts.push(`「${original.term}」已删除或不再属于原词书。`);
      continue;
    }
    const added = addedIds.has(original.id);
    const unchanged = added
      ? JSON.stringify(contentWithoutProgress(card)) ===
        JSON.stringify(contentWithoutProgress(original))
      : card.term === original.term &&
        JSON.stringify(card.senses) === JSON.stringify(original.after);
    if (!unchanged)
      conflicts.push(
        `「${original.term}」的${added ? "内容" : "单词或释义"}已被修改。`,
      );
  }
  const removed = new Set(batch.added.map((card) => card.id));
  return {
    batch,
    conflicts,
    reviewCount: state.reviews.filter((record) => removed.has(record.cardId))
      .length,
    learnedCount: state.cards.filter(
      (card) => removed.has(card.id) && card.progress.stage !== "new",
    ).length,
  };
}

export async function undoImportBatch(batchId) {
  const { batch, conflicts } = previewImportUndo(batchId);
  if (conflicts.length) throw new Error(conflicts.join("\n"));
  const removed = new Set(batch.added.map((card) => card.id));
  const restored = new Map(batch.updated.map((item) => [item.id, item.before]));
  await commit({
    cards: state.cards
      .filter((card) => !removed.has(card.id))
      .map((card) =>
        restored.has(card.id)
          ? {
              ...card,
              senses: JSON.parse(JSON.stringify(restored.get(card.id))),
            }
          : card,
      ),
    books: state.books.map((book) =>
      book.id === batch.bookId
        ? {
            ...book,
            cardIds: book.cardIds.filter((id) => !removed.has(id)),
            updatedAt: new Date().toISOString(),
          }
        : book,
    ),
    reviews: state.reviews.filter((record) => !removed.has(record.cardId)),
    importBatches: state.importBatches.map((item) =>
      item.id === batchId
        ? { ...item, status: "undone", undoneAt: new Date().toISOString() }
        : item,
    ),
  });
}

export async function deleteBook(id, now = new Date()) {
  const book = requireBook(id);
  const removed = new Set(book.cardIds);
  const entry = trashSnapshot(state, "book", book, state.cards.filter(card => removed.has(card.id)), now);
  await commit({
    trash: [...state.trash, entry],
    importBatches: state.importBatches.map(batch => batch.bookId === id
      ? { ...batch, invalidated: "原目标词书已移入回收站，恢复后可继续检查撤销。", trashEntryId: entry.id } : batch),
    books: state.books.filter(book => book.id !== id),
    cards: state.cards.filter(card => !removed.has(card.id)),
    reviews: state.reviews.filter(review => !removed.has(review.cardId)),
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
  const { primary, secondary, cardIds, duplicates, moved } = previewBookMerge(
    primaryId,
    secondaryId,
  );
  const creating = newName !== undefined;
  const destination = creating
    ? { ...newBook(newName), active: primary.active || secondary.active }
    : primary;
  const books = state.books.filter((book) => book.id !== secondaryId);
  const merged = {
    ...destination,
    cardIds,
    updatedAt:
      creating || moved > 0 ? new Date().toISOString() : destination.updatedAt,
  };

  await commit({
    importBatches: state.importBatches.map((batch) =>
      [primaryId, secondaryId].includes(batch.bookId)
        ? { ...batch, invalidated: "目标词书参与过合并，无法安全撤销此批次。" }
        : batch,
    ),
    books: creating
      ? [...books.filter((book) => book.id !== primaryId), merged]
      : books.map((book) => (book.id === primaryId ? merged : book)),
    cards: state.cards.filter((card) => !duplicates.has(card.id)),
    reviews: state.reviews.map((review) =>
      duplicates.has(review.cardId)
        ? { ...review, cardId: duplicates.get(review.cardId) }
        : review,
    ),
  });
  return merged;
}

export async function deleteCard(cardId, bookId, now = new Date()) {
  const book = requireBook(bookId);
  const card = state.cards.find(item => item.id === cardId);
  if (!card || !book.cardIds.includes(cardId)) throw new Error("词条不属于这本词书。");
  const entry = trashSnapshot(state, "card", book, [card], now);
  await commit({
    trash: [...state.trash, entry],
    cards: state.cards.filter(card => card.id !== cardId),
    books: state.books.map(item => item.id === bookId
      ? { ...item, cardIds: item.cardIds.filter(id => id !== cardId) } : item),
    reviews: state.reviews.filter(review => review.cardId !== cardId),
  });
}

export async function restoreTrash(id, options = {}, now = new Date()) {
  await commit(restoreTrashChanges(state, id, options, now));
}

export async function purgeTrash(id) {
  if (!state.trash.some(entry => entry.id === id)) throw new Error("该回收项目已不存在。");
  await commit(removeTrashEntries(state, [id]));
}

export async function emptyTrash() {
  await commit(removeTrashEntries(state, state.trash.map(entry => entry.id)));
}

export async function cleanupTrash(now = new Date()) {
  if (!state.ready || state.busy) return;
  const ids = state.trash.filter(entry => isTrashExpired(entry, now)).map(entry => entry.id);
  if (ids.length) await commit(removeTrashEntries(state, ids));
}

export async function updateBook(id, patch) {
  await commit({
    books: state.books.map((book) =>
      book.id === id ? { ...book, ...patch } : book,
    ),
  });
}

export async function updateSettings(patch) {
  if (Object.hasOwn(patch, "trashRetentionDays") && !validRetention(patch.trashRetentionDays)) throw new Error("请输入 1–365 之间的整数天数。");
  await commit({ settings: { ...state.settings, ...patch } });
}

export function graduate(card, now = new Date()) {
  const step = 0;
  return withStudyAttempt({
    ...card,
    progress: {
      ...card.progress,
      masteryDays: studyDaysOf(card),
      stage: stageForStep(step),
      step,
      streak: 0,
      lastRating: 3,
      lastSeenAt: now.toISOString(),
      introducedOn: card.progress.introducedOn ?? localDay(now),
      needsRecall: false,
      dueAt: dueAfter(step, now),
    },
  }, 3, now, true);
}

export function reviewCard(card, rating, now = new Date()) {
  const step = nextStep(card.progress.step, rating);
  return withStudyAttempt({
    ...card,
    progress: {
      ...card.progress,
      masteryDays: studyDaysOf(card),
      stage: stageForStep(step),
      step,
      streak: 0,
      lastRating: rating,
      lastSeenAt: now.toISOString(),
      needsRecall: false,
      lapses: card.progress.lapses + (rating === 1 ? 1 : 0),
      dueAt: dueAfter(step, now),
    },
  }, rating, now, rating >= 3);
}

export function missSpelling(card, now = new Date()) {
  return withStudyAttempt({
    ...card,
    progress: {
      ...card.progress,
      masteryDays: studyDaysOf(card),
      stage: stageForStep(0),
      step: 0,
      needsRecall: true,
      lapses: card.progress.lapses + 1,
      lastSeenAt: now.toISOString(),
      dueAt: now.toISOString(),
    },
  }, 1, now, false);
}

export async function saveStudyResult(card, stage, rating, now = new Date(), learnCheckpoint, { mastered } = {}) {
  let updated = {
    learn: graduate,
    review: (item, at) => reviewCard(item, rating, at),
    spell: missSpelling,
  }[stage](card, now);
  if (typeof mastered === "boolean") updated = withStudyAttempt(updated, rating, now, mastered);
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
