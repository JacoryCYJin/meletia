import { isDue } from "../study/model.js";

export function bookId(name) {
  const key = String(name ?? "").trim();
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash, 33) ^ key.charCodeAt(index);
  }
  return `b${(hash >>> 0).toString(16)}`;
}

export function normalizeBook(book, legacy = false) {
  return {
    id: book.id || bookId(book.name),
    name: String(book.name ?? "未命名词书"),
    source: String(book.source ?? ""),
    legacy:
      book.legacy ??
      (legacy &&
        Boolean(book.source || ["自建", "未分类"].includes(book.name))),
    cardIds: Array.isArray(book.cardIds) ? book.cardIds.filter(Boolean) : [],
    active: book.active !== false,
    recite: book.recite !== false,
    dictation: book.dictation === true,
    createdAt: book.createdAt ?? new Date().toISOString(),
    updatedAt: book.updatedAt ?? null,
  };
}

export function bookCards(book, cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return book.cardIds.map((id) => byId.get(id)).filter(Boolean);
}

export function bookUpdatedText(book) {
  const date = new Date(book.updatedAt ?? "");
  if (Number.isNaN(date.getTime())) return "更新时间未记录";
  return (
    "更新于 " +
    new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  );
}

export function bookRecites(book) {
  return book.active !== false && book.recite !== false;
}

export function bookDictates(book) {
  return book.active !== false && book.dictation === true;
}

export function bookStats(book, cards, now = new Date()) {
  const list = bookCards(book, cards);
  return {
    total: list.length,
    learned: list.filter((card) => card.progress.stage !== "new").length,
    due: list.filter((card) => isDue(card, now)).length,
    recall: list.filter((card) => card.progress.needsRecall).length,
    fresh: list.filter((card) => card.progress.stage === "new").length,
  };
}

export function dictationStats(book, cards, now = new Date()) {
  const list = bookCards(book, cards);
  return {
    total: list.length,
    introduced: list.filter((card) => card.dictation).length,
    due: list.filter(
      (card) => card.dictation?.dueAt && new Date(card.dictation.dueAt) <= now,
    ).length,
  };
}
