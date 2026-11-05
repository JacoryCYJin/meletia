import { localDay } from "./content.js";
import { freshQueue, isDue } from "./books.js";

export function dayTasks(cards, books, settings, now = new Date()) {
  const recall = cards.filter((card) => card.progress.needsRecall);
  const recallIds = new Set(recall.map((card) => card.id));
  const review = cards.filter(
    (card) => !recallIds.has(card.id) && isDue(card, now),
  );

  const learnedToday = cards.filter(
    (card) => card.progress.introducedOn === localDay(now),
  ).length;
  const allowance = Math.max(0, settings.dailyNew - learnedToday);
  const fresh = freshQueue(books, cards, allowance);

  return { recall, review, fresh, allowance };
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
