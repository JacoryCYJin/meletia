import assert from "node:assert/strict";
import test from "node:test";
import {
  LADDER,
  MASTERED_STEP,
  dueAfter,
  intervalDays,
  nextStep,
  stageForStep,
  stepForDays,
} from "../src/core/scheduler.js";

test("the review ladder starts at one day and ends at four months", () => {
  assert.deepEqual(LADDER, [1, 2, 4, 7, 15, 30, 60, 120]);
  assert.equal(intervalDays(0), 1);
  assert.equal(intervalDays(99), 120);
});

test("recognition advances one step, fuzzy retreats one, forgotten resets", () => {
  assert.equal(nextStep(0, 3), 1);
  assert.equal(nextStep(3, 3), 4);
  assert.equal(nextStep(LADDER.length - 1, 3), LADDER.length - 1);

  assert.equal(nextStep(4, 2), 3);
  assert.equal(nextStep(0, 2), 0);

  assert.equal(nextStep(6, 1), 0);
});

test("the next due date follows the current step", () => {
  const now = new Date(2026, 10, 4, 9);
  assert.equal(new Date(dueAfter(0, now)).getDate(), 5);
  assert.equal(new Date(dueAfter(3, now)).getDate(), 11);
});

test("legacy intervals map onto the nearest ladder step", () => {
  assert.equal(stepForDays(0), 0);
  assert.equal(stepForDays(1), 0);
  assert.equal(stepForDays(3), 1);
  assert.equal(stepForDays(5), 2);
  assert.equal(stepForDays(90), 6);
});

test("stage follows the ladder position", () => {
  assert.equal(stageForStep(0), "consolidating");
  assert.equal(stageForStep(2), "reviewing");
  assert.equal(stageForStep(MASTERED_STEP), "mastered");
  assert.equal(stageForStep(7), "mastered");
});
