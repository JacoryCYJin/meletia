import { localDay } from "../../shared/date.js";
import { bookRecites } from "../books/model.js";
import { isDue } from "./model.js";

export function freshQueue(
  books,
  cards,
  limit,
  isFresh = (card) => card.progress.stage === "new",
) {
  if (limit <= 0) return [];
  const byId = new Map(cards.map((card) => [card.id, card]));
  const queues = books
    .filter((book) => book.active)
    .map((book) => ({
      ids: book.cardIds.filter((id) => {
        const card = byId.get(id);
        return card ? isFresh(card) : false;
      }),
    }));

  const picked = [];
  const seen = new Set();
  let progressed = true;

  while (picked.length < limit && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= limit) break;
      while (queue.ids.length) {
        const id = queue.ids.shift();
        if (seen.has(id) || !byId.has(id)) continue;
        seen.add(id);
        picked.push(id);
        progressed = true;
        break;
      }
    }
  }

  return picked;
}

export function dayTasks(
  cards,
  books,
  settings,
  now = new Date(),
  reviews = [],
  { bookIds } = {},
) {
  const allowedBooks = bookIds
    ? books.filter((book) => bookIds.has(book.id))
    : books.filter(bookRecites);
  const owned = new Set(allowedBooks.flatMap((book) => book.cardIds));
  const recallPending = cards.filter(
    (card) => owned.has(card.id) && card.progress.needsRecall,
  );
  const recallIds = new Set(recallPending.map((card) => card.id));
  const reviewPending = cards.filter(
    (card) =>
      owned.has(card.id) && !recallIds.has(card.id) && isDue(card, now),
  );

  const today = localDay(now);
  let recall = recallPending;
  let review = reviewPending;
  if (Number.isSafeInteger(settings.dailyReview) && settings.dailyReview >= 0) {
    const completed = new Set(
      reviews
        .filter(
          (entry) =>
            entry.stage === "review" && localDay(new Date(entry.at)) === today,
        )
        .map((entry) => entry.cardId),
    );
    let remaining = Math.max(0, settings.dailyReview - completed.size);
    const withinAllowance = (card) => {
      if (completed.has(card.id)) return true;
      if (remaining <= 0) return false;
      remaining -= 1;
      return true;
    };
    recall = recallPending.filter(withinAllowance);
    review = reviewPending.filter(withinAllowance);
  }
  const reviewDeferred =
    recallPending.length + reviewPending.length - recall.length - review.length;

  const learnedToday = cards.filter(
    (card) => card.progress.introducedOn === today,
  ).length;
  const allowance = Math.max(0, settings.dailyNew - learnedToday);
  const fresh = freshQueue(allowedBooks, cards, allowance);
  const extraFresh = freshQueue(allowedBooks, cards, settings.groupSize);

  return { recall, review, fresh, extraFresh, allowance, reviewDeferred };
}
