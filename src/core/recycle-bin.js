import { wordKey } from "./content.js";

export const RETENTION_OPTIONS = [3, 7, 14, 30, 90];
export const DAY_MS = 86400000;
export const validRetention = value => Number.isSafeInteger(value) && value >= 1 && value <= 365;
const copy = value => JSON.parse(JSON.stringify(value));
export const isTrashExpired = (entry, now = new Date()) => new Date(entry.expiresAt).getTime() <= now.getTime();

export function trashSnapshot(store, type, book, cards, now = new Date()) {
  const ids = new Set(cards.map(card => card.id));
  const days = validRetention(store.settings.trashRetentionDays) ? store.settings.trashRetentionDays : 7;
  return copy({
    id: globalThis.crypto?.randomUUID?.() ?? `trash-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type, book, cards,
    reviews: store.reviews.filter(review => ids.has(review.cardId)),
    importBatches: type === "book" ? store.importBatches.filter(batch => batch.bookId === book.id) : [],
    deletedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    retentionDays: days,
  });
}

export function removeTrashEntries(store, ids) {
  const removed = new Set(ids);
  return {
    trash: store.trash.filter(entry => !removed.has(entry.id)),
    importBatches: store.importBatches.filter(batch => !removed.has(batch.trashEntryId)),
  };
}

export function restoreTrashChanges(store, id, { targetBookId, bookName } = {}, now = new Date()) {
  const entry = store.trash.find(item => item.id === id);
  if (!entry) throw new Error("该回收项目已不存在。");
  if (isTrashExpired(entry, now)) throw new Error("该项目已到期，无法恢复。");
  const snapshot = copy(entry);
  let books = [...store.books];
  let target;
  if (entry.type === "book") {
    if (books.some(book => book.id === entry.book.id)) throw new Error("原词书标识已被占用，无法覆盖恢复。");
    const name = String(bookName ?? entry.book.name).trim();
    if (!name) throw new Error("请输入恢复后的词书名称。");
    if (books.some(book => book.name === name)) throw new Error("已有同名词书，请修改恢复名称。");
    target = { ...snapshot.book, name };
    books.push(target);
  } else {
    const parent = books.find(book => book.id === entry.book.id && book.createdAt === entry.book.createdAt);
    if (!parent && store.trash.some(item => item.type === "book" && item.book.id === entry.book.id && !isTrashExpired(item, now))) {
      throw new Error("原词书也在回收站，请先恢复原词书。");
    }
    target = parent ?? books.find(book => book.id === targetBookId);
    if (!target) throw new Error("原词书已不存在，请选择恢复到哪本词书。");
    const owned = new Set(target.cardIds);
    const terms = new Set(store.cards.filter(card => owned.has(card.id)).map(card => wordKey(card.term)));
    if (snapshot.cards.some(card => terms.has(wordKey(card.term)))) throw new Error("目标词书中已有同名词条，未覆盖现有内容。");
    const cardIds = [...target.cardIds];
    for (const card of snapshot.cards) {
      const originalIndex = snapshot.book.cardIds.indexOf(card.id);
      const nextId = snapshot.book.cardIds.slice(originalIndex + 1).find(id => cardIds.includes(id));
      const index = nextId ? cardIds.indexOf(nextId) : cardIds.length;
      cardIds.splice(index, 0, card.id);
    }
    books = books.map(book => book.id === target.id ? { ...book, cardIds } : book);
  }
  if (snapshot.cards.some(card => store.cards.some(current => current.id === card.id))) {
    throw new Error("词条标识已被占用，未覆盖现有内容。");
  }
  const batches = new Map(snapshot.importBatches.map(batch => [batch.id, batch]));
  const importBatches = store.importBatches.map(batch => {
    if (batch.trashEntryId !== id) return batch;
    const saved = batches.get(batch.id);
    batches.delete(batch.id);
    return saved ?? batch;
  });
  return {
    books,
    cards: [...store.cards, ...snapshot.cards],
    reviews: [...store.reviews, ...snapshot.reviews],
    importBatches: [...importBatches, ...batches.values()],
    trash: store.trash.filter(item => item.id !== id),
  };
}
