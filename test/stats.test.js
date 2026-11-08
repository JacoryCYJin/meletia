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

const settings = { dailyNew: 10, groupSize: 10 };
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

test("daily review allowance counts distinct completed reviews and gives recall priority", () => {
  const due = (id) => card(id, { stage: "reviewing", dueAt: day(-1).toISOString() });
  const recall = card("back", { stage: "consolidating", needsRecall: true });
  const cards = [due("a"), due("b"), recall, card("fresh")];
  const books = [book(cards.map((item) => item.id))];
  const at = now.toISOString();
  const reviews = [
    { cardId: "done", stage: "review", at },
    { cardId: "done", stage: "review", at },
    { cardId: "fresh", stage: "learn", at },
    { cardId: "back", stage: "spell", at },
    { cardId: "previous", stage: "review", at: day(-1).toISOString() },
  ];

  const limited = dayTasks(cards, books, { ...settings, dailyReview: 2 }, now, reviews);
  assert.deepEqual(limited.recall.map((item) => item.id), ["back"]);
  assert.deepEqual(limited.review, []);
  assert.equal(limited.reviewDeferred, 2);
  assert.deepEqual(limited.fresh, ["fresh"]);

  const capped = dayTasks(cards, books, { ...settings, dailyReview: 1 }, now, reviews);
  assert.deepEqual(capped.recall, []);
  assert.equal(capped.reviewDeferred, 3);
  const unlimited = dayTasks(cards, books, { ...settings, dailyReview: null }, now, reviews);
  assert.equal(unlimited.reviewDeferred, 0);
  assert.equal(unlimited.review.length, 2);
});

test("extra learning stays available after the daily goal without changing settings or review tasks", () => {
  const cards = [
    card("done", { stage: "reviewing", introducedOn: localDay(now), dueAt: day(2).toISOString() }),
    card("a"), card("b"), card("c"), card("inactive"),
    card("due", { stage: "reviewing", dueAt: day(-1).toISOString() }),
  ];
  const books = [book(["done", "a", "c", "due"]),
    { ...book(["b"]), id: "second" },
    { ...book(["inactive"]), id: "off", active: false }];
  const preferences = { dailyNew: 1, groupSize: 2 };
  const tasks = dayTasks(cards, books, preferences, now);
  assert.equal(tasks.allowance, 0);
  assert.deepEqual(tasks.fresh, []);
  assert.deepEqual(tasks.extraFresh, ["a", "b"]);
  assert.deepEqual(tasks.review.map(item => item.id), ["due"]);
  assert.deepEqual(preferences, { dailyNew: 1, groupSize: 2 });

  cards[1].progress = { ...cards[1].progress, stage: "reviewing", introducedOn: localDay(now) };
  assert.deepEqual(dayTasks(cards, books, preferences, now).extraFresh, ["c", "b"]);
});

test("extra learning stops only when active books have no new words", () => {
  const cards = [card("done", { stage: "reviewing" }), card("inactive")];
  const books = [book(["done"]), { ...book(["inactive"]), id: "off", active: false }];
  assert.deepEqual(dayTasks(cards, books, settings, now).extraFresh, []);
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
