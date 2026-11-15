import { commit, state } from "../../storage/store.js";
import { trashSnapshot } from "../trash/model.js";
import { bookCards, bookId } from "./model.js";
import { wordKey } from "../library/model.js";

export function requireBook(id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) throw new Error("词书已不存在。");
  return book;
}

export function newBook(title) {
  const name = String(title ?? "").trim();
  if (!name) throw new Error("请输入词书名称。");
  if (state.books.some((book) => book.name === name)) {
    throw new Error("已有同名词书，请选择已有词书或换个名称。");
  }
  const baseId = bookId(name);
  let id = baseId;
  let suffix = 1;
  while (
    state.books.some((book) => book.id === id) ||
    state.trash.some((entry) => entry.book.id === id)
  ) {
    id = `${baseId}-${suffix++}`;
  }
  const createdAt = new Date().toISOString();
  return {
    id,
    name,
    source: "",
    legacy: false,
    cardIds: [],
    active: true,
    recite: true,
    dictation: false,
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
  if (state.books.some((item) => item.id !== id && item.name === name)) {
    throw new Error("已有同名词书，请换个名称。");
  }
  if (name === book.name) return;
  await commit({
    books: state.books.map((item) =>
      item.id === id
        ? { ...item, name, updatedAt: new Date().toISOString() }
        : item,
    ),
  });
}

export async function updateBook(id, patch) {
  await commit({
    books: state.books.map((book) =>
      book.id === id ? { ...book, ...patch } : book,
    ),
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

  return {
    primary,
    secondary,
    cardIds: [...byTerm.values()],
    duplicates,
    moved,
  };
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

export async function deleteBook(id, now = new Date()) {
  const book = requireBook(id);
  const removed = new Set(book.cardIds);
  const entry = trashSnapshot(
    state,
    "book",
    book,
    state.cards.filter((card) => removed.has(card.id)),
    now,
  );
  await commit({
    trash: [...state.trash, entry],
    importBatches: state.importBatches.map((batch) =>
      batch.bookId === id
        ? {
            ...batch,
            invalidated:
              "原目标词书已移入回收站，恢复后可继续检查撤销。",
            trashEntryId: entry.id,
          }
        : batch,
    ),
    books: state.books.filter((book) => book.id !== id),
    cards: state.cards.filter((card) => !removed.has(card.id)),
    reviews: state.reviews.filter((review) => !removed.has(review.cardId)),
  });
}
