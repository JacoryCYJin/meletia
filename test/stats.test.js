import assert from "node:assert/strict";
import test from "node:test";
import { localDay } from "../src/core/content.js";
import {
  dayTasks,
  recentDays,
  streakOf,
  todayLabel,
} from "../src/core/stats.js";

const now = new Date(2026, 10, 4, 20);
const day = (offset) => {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return date;
};

const card = (id, progress = {}) => ({
  id,
  term: id,
  source: "练习",
  progress: {
    stage: "new",
    needsRecall: false,
    introducedOn: null,
    dueAt: null,
    ...progress,
  },
});

const settings = { dailyNew: 10, groupSize: 10, learnStreak: 4 };
const book = (cardIds) => ({
  id: "b",
  name: "练习",
  cardIds,
  active: true,
});

test("today mixes recall, due and fresh cards in that order", () => {
  const cards = [
    card("back", { stage: "consolidating", needsRecall: true }),
    card("ready", {
      stage: "reviewing",
      dueAt: day(-2).toISOString(),
    }),
    card("later", {
      stage: "reviewing",
      dueAt: day(3).toISOString(),
    }),
    card("fresh1"),
    card("fresh2"),
  ];
  const tasks = dayTasks(cards, [book(cards.map((item) => item.id))], settings, now);

  assert.deepEqual(tasks.recall.map((item) => item.id), ["back"]);
  assert.deepEqual(tasks.review.map((item) => item.id), ["ready"]);
  assert.deepEqual(tasks.fresh, ["fresh1", "fresh2"]);
});

test("the daily new allowance shrinks by words learned today", () => {
  const cards = Array.from({ length: 12 }, (_, index) => card(`f${index}`));
  cards[0] = card("f0", { stage: "learning", introducedOn: localDay(now) });
  cards[1] = card("f1", { stage: "learning", introducedOn: localDay(now) });
  cards[2] = card("f2", { stage: "learning", introducedOn: localDay(now) });

  const tasks = dayTasks(
    cards,
    [book(cards.map((item) => item.id))],
    settings,
    now,
  );
  assert.equal(tasks.fresh.length, 7);
  assert.equal(tasks.allowance, 7);
});

test("streak counts back from today and forgives a day that just started", () => {
  const reviews = [
    { at: day(0).toISOString() },
    { at: day(-1).toISOString() },
    { at: day(-2).toISOString() },
    { at: day(-5).toISOString() },
  ];
  assert.equal(streakOf(reviews, now), 3);
  assert.equal(streakOf([{ at: day(-1).toISOString() }], now), 1);
  assert.equal(streakOf([], now), 0);
});

test("today counts introduced and reviewed cards separately", () => {
  const cards = [card("a", { stage: "learning", introducedOn: localDay(now) })];
  const reviews = [
    { cardId: "a", at: day(0).toISOString() },
    { cardId: "a", at: day(-1).toISOString() },
  ];
  assert.deepEqual(todayLabel(cards, reviews, now), {
    introducedToday: 1,
    reviewedToday: 1,
  });
});

test("recent days fill in missing dates with zero", () => {
  const days = recentDays([{ at: day(0).toISOString() }], now, 3);
  assert.deepEqual(
    days.map((entry) => entry.count),
    [0, 0, 1],
  );
  assert.equal(days[2].day, localDay(now));
});
