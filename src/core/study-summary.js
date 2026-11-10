import { localDay } from "./content.js";
import { dayTasks } from "./stats.js";

export function nextReviewText(card, now = new Date()) {
  if (card.progress.needsRecall) return "需要回炉";
  const due = new Date(card.progress.dueAt ?? "");
  if (!Number.isFinite(due.getTime())) return "尚未安排复习";
  if (due <= now) return "已到期";
  const ordinal = (date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((ordinal(due) - ordinal(now)) / 86400000);
  return days === 0 ? "今天复习" : days === 1 ? "明天复习" : `${days} 天后复习`;
}

export function pendingStudyCards({
  mode,
  cards,
  books,
  settings,
  reviews,
  now = new Date(),
  extraNew = false,
  excludedIds = [],
}) {
  const excluded = new Set(excludedIds);
  const tasks = dayTasks(
    cards.filter((card) => !excluded.has(card.id)),
    books,
    settings,
    now,
    reviews,
  );
  if (mode === "review")
    return [...tasks.recall, ...tasks.review].filter(
      (card) => !excluded.has(card.id),
    );
  if (extraNew) return [];
  const byId = new Map(cards.map((card) => [card.id, card]));
  return tasks.fresh
    .filter((id) => !excluded.has(id))
    .map((id) => byId.get(id))
    .filter(Boolean);
}

export function studySummary({
  session,
  cards,
  books,
  settings,
  reviews,
  now = new Date(),
  extraNew = false,
  excludedIds = [],
}) {
  const mode = session?.mode ?? "learn";
  const byId = new Map(cards.map((card) => [card.id, card]));
  const owners = new Map(
    books.flatMap((book) => book.cardIds.map((id) => [id, book.name])),
  );
  const done = [...new Set(session?.done ?? [])];
  const rows = done
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((card) => ({
      id: card.id,
      term: card.term,
      bookName: owners.get(card.id) ?? "",
      dueAt: card.progress.dueAt,
      nextReview: nextReviewText(card, now),
    }));
  const today = localDay(now);
  const todayCompleted =
    mode === "learn"
      ? cards.filter((card) => card.progress.introducedOn === today).length
      : new Set(
          reviews
            .filter(
              (record) =>
                record.stage === "review" &&
                localDay(new Date(record.at)) === today,
            )
            .map((record) => record.cardId),
        ).size;
  const remaining = pendingStudyCards({
    mode,
    cards,
    books,
    settings,
    reviews,
    now,
    extraNew,
    excludedIds,
  }).length;
  const spelling = session?.spelling;
  const missed = spelling?.missed.length ?? 0;
  return {
    mode,
    rows,
    completed: rows.length,
    skipped: Math.max(0, (session?.total ?? 0) - done.length),
    todayCompleted,
    remaining,
    canContinue: remaining > 0,
    spellingNote: missed
      ? `拼写错过 ${missed} 个词，下次安排见列表。`
      : spelling && spelling.index >= spelling.list.length
        ? "本组拼写全部正确。"
        : "",
  };
}
