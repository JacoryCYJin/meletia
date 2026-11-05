export const LADDER = [1, 2, 4, 7, 15, 30, 60, 120];

export const MASTERED_STEP = 6;

export function stepForDays(days) {
  let step = 0;
  for (let index = 0; index < LADDER.length; index += 1) {
    if (days >= LADDER[index]) step = index;
  }
  return step;
}

export function intervalDays(step) {
  return LADDER[Math.min(Math.max(step, 0), LADDER.length - 1)];
}

export function dueAfter(step, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + intervalDays(step));
  return date.toISOString();
}

export function nextStep(step, rating) {
  if (rating >= 3) return Math.min(step + 1, LADDER.length - 1);
  if (rating === 2) return Math.max(0, step - 1);
  return 0;
}

export function stageForStep(step) {
  if (step >= MASTERED_STEP) return "mastered";
  if (step >= 2) return "reviewing";
  return "consolidating";
}
