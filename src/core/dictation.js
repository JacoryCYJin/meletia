import { DEFAULT_SETTINGS, LISTEN_TAG, hasTag, localDay } from "./content.js";
import { bookDictates, freshQueue } from "./books.js";
import { UNMASTERED, masteryOf } from "./study-status.js";

export const DICTATION_RANGES = [
  { id: "all", label: "全部" },
  { id: "unmastered", label: "未掌握" },
  { id: "listen", label: "只有「听辨」标签" },
];

function dailyLimit(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function dictationTasks(cards, books, settings, now = new Date(), reviews = []) {
  const bookList = books.filter(bookDictates);
  const owned = new Set(bookList.flatMap((book) => book.cardIds));
  const pool = cards.filter((card) => owned.has(card.id));
  const byId = new Map(cards.map((card) => [card.id, card]));
  const today = localDay(now);
  const completed = new Set(
    reviews
      .filter((entry) => entry.stage === "dictation" && localDay(new Date(entry.at)) === today)
      .map((entry) => entry.cardId),
  );

  const duePending = pool.filter((card) => {
    if (!card.dictation?.dueAt || completed.has(card.id)) return false;
    return new Date(card.dictation.dueAt) <= now;
  });

  const introducedToday = pool.filter(
    (card) => card.dictation?.introducedOn === today,
  );
  const introducedIds = new Set(introducedToday.map((card) => card.id));
  const completedReviews = new Set(
    reviews
      .filter(
        (entry) =>
          entry.stage === "dictation" &&
          localDay(new Date(entry.at)) === today &&
          !introducedIds.has(entry.cardId),
      )
      .map((entry) => entry.cardId),
  );
  const reviewLimit = Number.isSafeInteger(settings.dictationDailyReview)
    ? Math.max(0, settings.dictationDailyReview - completedReviews.size)
    : Number.POSITIVE_INFINITY;
  const due = duePending.slice(0, reviewLimit);

  const introducedCount = introducedToday.length;
  const allowance = Math.max(
    0,
    dailyLimit(settings.dictationDailyNew, DEFAULT_SETTINGS.dictationDailyNew) -
      introducedCount,
  );
  const fresh = freshQueue(bookList, pool, allowance, (card) => !card.dictation)
    .map((id) => byId.get(id))
    .filter(Boolean);

  return {
    due,
    fresh,
    allowance,
    reviewDeferred: duePending.length - due.length,
  };
}

export function buildFreeDictationQueue({
  cards,
  books,
  bookIds = null,
  range = "all",
  limit = 10,
}) {
  const selected = Array.isArray(bookIds)
    ? books.filter((book) => bookIds.includes(book.id))
    : books;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const matches = (card) => {
    if (range === "unmastered") return masteryOf(card) === UNMASTERED;
    if (range === "listen") return hasTag(card, LISTEN_TAG);
    return true;
  };

  const queue = [];
  for (const book of selected) {
    for (const id of book.cardIds) {
      const card = byId.get(id);
      if (!card || !matches(card)) continue;
      queue.push(card);
      if (queue.length >= limit) return queue;
    }
  }
  return queue;
}
