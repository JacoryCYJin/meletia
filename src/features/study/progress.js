import { localDay } from "../../shared/date.js";
import { studyDaysOf, withStudyAttempt } from "./mastery.js";
import {
  dueAfter,
  nextStep,
  stageForStep,
} from "./scheduler.js";

export function graduate(card, now = new Date()) {
  const step = 0;
  return withStudyAttempt(
    {
      ...card,
      progress: {
        ...card.progress,
        masteryDays: studyDaysOf(card),
        stage: stageForStep(step),
        step,
        streak: 0,
        lastRating: 3,
        lastSeenAt: now.toISOString(),
        introducedOn: card.progress.introducedOn ?? localDay(now),
        needsRecall: false,
        dueAt: dueAfter(step, now),
      },
    },
    3,
    now,
    true,
  );
}

export function reviewCard(card, rating, now = new Date()) {
  const step = nextStep(card.progress.step, rating);
  return withStudyAttempt(
    {
      ...card,
      progress: {
        ...card.progress,
        masteryDays: studyDaysOf(card),
        stage: stageForStep(step),
        step,
        streak: 0,
        lastRating: rating,
        lastSeenAt: now.toISOString(),
        needsRecall: false,
        lapses: card.progress.lapses + (rating === 1 ? 1 : 0),
        dueAt: dueAfter(step, now),
      },
    },
    rating,
    now,
    rating >= 3,
  );
}

export function missSpelling(card, now = new Date()) {
  return withStudyAttempt(
    {
      ...card,
      progress: {
        ...card.progress,
        masteryDays: studyDaysOf(card),
        stage: stageForStep(0),
        step: 0,
        needsRecall: true,
        lapses: card.progress.lapses + 1,
        lastSeenAt: now.toISOString(),
        dueAt: now.toISOString(),
      },
    },
    1,
    now,
    false,
  );
}
