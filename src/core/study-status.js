import { localDay } from "./content.js";

export const MASTERED = "已掌握";
export const UNMASTERED = "未掌握";

export function masteryOf(card) {
  const progress = card.progress;
  if ([MASTERED, UNMASTERED].includes(progress.masteryStatus)) return progress.masteryStatus;
  // Older data only has the saved outcome; do not infer unrecorded answers.
  if (progress.needsRecall || (progress.lastRating !== null && progress.lastRating !== undefined && progress.lastRating < 3)) return UNMASTERED;
  if (progress.stage !== "new" && (progress.lastRating === 3 || progress.introducedOn)) return MASTERED;
  return card.status === MASTERED ? MASTERED : UNMASTERED;
}

export function withStudyAttempt(card, rating, now = new Date(), mastered) {
  const masteryStatus = typeof mastered === "boolean"
    ? mastered ? MASTERED : UNMASTERED
    : rating < 3 ? UNMASTERED : masteryOf(card);
  return { ...card, progress: {
    ...card.progress,
    masteryStatus,
    studiedAt: now.toISOString(),
    masteryDays: {
      ...studyDaysOf(card),
      [localDay(now)]: { status: masteryStatus, updatedAt: now.toISOString() },
    },
  } };

}

// Read old saved outcomes without pretending to reconstruct unrecorded attempts.
export function studyDaysOf(card, reviews = []) {
  const days = {};
  const remember = (at, status) => {
    const date = new Date(at);
    if (!at || !Number.isFinite(date.getTime())) return;
    const day = localDay(date);
    if (!days[day] || date.getTime() >= new Date(days[day].updatedAt).getTime()) {
      days[day] = { status, updatedAt: date.toISOString() };
    }
  };
  for (const record of reviews) {
    if (record.cardId !== card.id) continue;
    if (record.stage === "learn") remember(record.at, MASTERED);
    else if (record.stage === "spell") remember(record.at, UNMASTERED);
    else if (record.stage === "review" && [1, 2, 3].includes(record.rating)) {
      remember(record.at, record.rating === 3 ? MASTERED : UNMASTERED);
    }
  }
  remember(card.progress.studiedAt ?? card.progress.lastSeenAt, masteryOf(card));
  // Explicit daily snapshots are authoritative, including successful remedial rounds.
  for (const [day, entry] of Object.entries(card.progress.masteryDays ?? {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && [MASTERED, UNMASTERED].includes(entry?.status)) days[day] = entry;
  }
  return days;
}
