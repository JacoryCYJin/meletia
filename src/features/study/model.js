import { stageForStep, stepForDays } from "./scheduler.js";

export function defaultProgress() {
  return {
    stage: "new",
    streak: 0,
    step: 0,
    lastRating: null,
    lastSeenAt: null,
    dueAt: null,
    introducedOn: null,
    needsRecall: false,
    lapses: 0,
    masteryStatus: null,
    studiedAt: null,
    masteryDays: {},
  };
}

export function normalizeProgress(raw, now = new Date()) {
  if (raw.progress && raw.progress.step !== undefined) {
    return { ...defaultProgress(), ...raw.progress };
  }

  const legacySchedule = raw.progress?.schedule ?? raw.schedule ?? null;
  const introducedOn = raw.progress?.introducedOn ?? raw.introducedOn ?? null;

  if (!introducedOn) return defaultProgress();

  const step = stepForDays(legacySchedule?.scheduled_days ?? 0);
  return {
    ...defaultProgress(),
    stage: stageForStep(step),
    step,
    introducedOn,
    dueAt: legacySchedule?.due ?? null,
    lastSeenAt: legacySchedule?.last_review ?? null,
    needsRecall: raw.progress?.needsRecall ?? false,
    lapses: raw.progress?.lapses ?? 0,
  };
}

export function isDue(card, now = new Date()) {
  const progress = card.progress;
  return Boolean(
    progress.stage !== "new" &&
      !progress.needsRecall &&
      progress.dueAt &&
      new Date(progress.dueAt) <= now,
  );
}
