import { localDay } from "../../shared/date.js";
import {
  dueAfter,
  nextStep,
  stageForStep,
} from "../study/scheduler.js";

export function defaultDictationProgress() {
  return {
    stage: "new",
    step: 0,
    streak: 0,
    lastRating: null,
    lastSeenAt: null,
    introducedOn: null,
    lapses: 0,
    dueAt: null,
  };
}

export function normalizeDictation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const progress = defaultDictationProgress();
  return {
    ...progress,
    ...raw,
    stage: typeof raw.stage === "string" ? raw.stage : progress.stage,
    step: Number.isInteger(raw.step) && raw.step >= 0 ? raw.step : 0,
    lapses: Number.isInteger(raw.lapses) && raw.lapses >= 0 ? raw.lapses : 0,
  };
}

export function withDictationAttempt(card, rating, now = new Date()) {
  const first = !card.dictation;
  const current = normalizeDictation(card.dictation) ?? defaultDictationProgress();
  const correct = rating >= 3;
  const step = first ? 0 : correct ? nextStep(current.step, 3) : 0;
  return {
    ...card,
    dictation: {
      stage: stageForStep(step),
      step,
      streak: 0,
      lastRating: rating,
      lastSeenAt: now.toISOString(),
      introducedOn: current.introducedOn ?? localDay(now),
      lapses: (current.lapses ?? 0) + (correct ? 0 : 1),
      // A first miss still waits until tomorrow so it does not consume both the
      // new-word and due-review allowances on the same day.
      dueAt: !first && !correct ? now.toISOString() : dueAfter(step, now),
    },
  };
}
