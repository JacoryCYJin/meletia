import { commit, state } from "../../storage/store.js";
import { requireBook, newBook } from "../books/actions.js";
import { bookCards } from "../books/model.js";
import { newCard, parseSenses } from "../library/model.js";
import { previewImport } from "./csv.js";

function contentWithoutProgress(card) {
  const { progress, dictation, editedAt, ...content } = card;
  return content;
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

export function previewImportUndo(batchId) {
  const batch = state.importBatches.find((item) => item.id === batchId);
  if (!batch) throw new Error("导入批次已不存在。");
  const conflicts = [];
  const book = state.books.find((item) => item.id === batch.bookId);
  if (batch.status === "undone") conflicts.push("该批次已撤销。");
  if (!book || book.createdAt !== batch.bookCreatedAt) {
    conflicts.push("原目标词书已删除或变化。");
  }
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
  if (later.length) {
    conflicts.push("这些词条被后续批次修改过，请先撤销相关的后续批次。");
  }
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
    if (!unchanged) {
      conflicts.push(
        `「${original.term}」的${added ? "内容" : "单词或释义"}已被修改。`,
      );
    }
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
