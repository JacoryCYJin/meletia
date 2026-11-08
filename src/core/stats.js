import { localDay } from "./content.js";
import { freshQueue, isDue } from "./books.js";

export function dayTasks(cards, books, settings, now = new Date(), reviews = []) {
  const recallPending = cards.filter((card) => card.progress.needsRecall);
  const recallIds = new Set(recallPending.map((card) => card.id));
  const reviewPending = cards.filter(
    (card) => !recallIds.has(card.id) && isDue(card, now),
  );

  const today = localDay(now);
  let recall = recallPending;
  let review = reviewPending;
  if (Number.isSafeInteger(settings.dailyReview) && settings.dailyReview >= 0) {
    const completed = new Set(reviews
      .filter((entry) => entry.stage === "review" && localDay(new Date(entry.at)) === today)
      .map((entry) => entry.cardId));
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
  const reviewDeferred = recallPending.length + reviewPending.length - recall.length - review.length;

  const learnedToday = cards.filter(
    (card) => card.progress.introducedOn === today,
  ).length;
  const allowance = Math.max(0, settings.dailyNew - learnedToday);
  const fresh = freshQueue(books, cards, allowance);
  const extraFresh = freshQueue(books, cards, settings.groupSize);

  return { recall, review, fresh, extraFresh, allowance, reviewDeferred };
}

export function todayLabel(cards, reviews, now = new Date()) {
  const today = localDay(now);
  return {
    introducedToday: cards.filter(
      (card) => card.progress.introducedOn === today,
    ).length,
    reviewedToday: reviews.filter(
      (entry) => localDay(new Date(entry.at)) === today,
    ).length,
  };
}

export function streakOf(reviews, now = new Date()) {
  const days = new Set(reviews.map((entry) => localDay(new Date(entry.at))));
  if (!days.size) return 0;

  const cursor = new Date(now);
  if (!days.has(localDay(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(localDay(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(localDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function recentDays(reviews, now = new Date(), length = 14) {
  const counts = new Map();
  for (const entry of reviews) {
    const day = localDay(new Date(entry.at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const days = [];
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const day = localDay(date);
    days.push({ day, count: counts.get(day) ?? 0 });
  }
  return days;
}
