import assert from "node:assert/strict";
import test from "node:test";
import { newCard, localDay } from "../src/core/content.js";
import { graduate, reviewCard, missSpelling } from "../src/core/library.js";
import {
  nextReviewText,
  pendingStudyCards,
  studySummary,
} from "../src/core/study-summary.js";

const now = new Date(2026, 10, 8, 20);
const settings = { dailyNew: 20, dailyReview: null, groupSize: 10 };
const card = (word = "word") => newCard({ word, definition: "释义" });
const book = (cards, patch = {}) => ({
  id: "book",
  name: "词书",
  active: true,
  cardIds: cards.map((item) => item.id),
  ...patch,
});

test("summary rows use saved schedules, preserve completion order and distinguish same words from separate books", () => {
  const first = graduate(card("same"), now);
  const second = reviewCard(
    { ...card("same"), progress: { ...card().progress, step: 3 } },
    3,
    now,
  );
  const input = {
    session: {
      mode: "review",
      total: 2,
      done: [second.id, first.id, second.id],
      spelling: null,
    },
    cards: [first, second],
    books: [book([first]), book([second], { id: "other", name: "另一本" })],
    settings,
    reviews: [],
    now,
  };
  const before = JSON.stringify(input);
  const summary = studySummary(input);
  assert.equal(summary.completed, 2);
  assert.deepEqual(
    summary.rows.map((row) => row.id),
    [second.id, first.id],
  );
  assert.deepEqual(
    summary.rows.map((row) => row.bookName),
    ["另一本", "词书"],
  );
  assert.deepEqual(
    summary.rows.map((row) => row.nextReview),
    ["15 天后复习", "明天复习"],
  );
  assert.equal(summary.rows[0].dueAt, second.progress.dueAt);
  assert.equal(JSON.stringify(input), before);
});

test("next-review labels follow local dates, due status and spelling recall flags", () => {
  const item = card();
  item.progress.dueAt = new Date(2026, 10, 8, 21).toISOString();
  assert.equal(nextReviewText(item, now), "今天复习");
  assert.equal(nextReviewText(item, new Date(2026, 10, 8, 22)), "已到期");
  item.progress.dueAt = new Date(2026, 10, 9, 1).toISOString();
  assert.equal(nextReviewText(item, now), "明天复习");
  item.progress.dueAt = null;
  assert.equal(nextReviewText(item, now), "尚未安排复习");
  assert.equal(nextReviewText(missSpelling(item, now), now), "需要回炉");
});

test("today counts completed review words once and ignores learn/spelling scores", () => {
  const a = graduate(card(), now);
  const b = graduate(card(), now);
  const reviews = [
    { cardId: a.id, at: now.toISOString(), stage: "review" },
    { cardId: a.id, at: now.toISOString(), stage: "review" },
    { cardId: b.id, at: now.toISOString(), stage: "learn" },
    { cardId: b.id, at: now.toISOString(), stage: "spell" },
    { cardId: b.id, at: "2026-11-01T12:00:00Z", stage: "review" },
  ];
  const base = {
    session: { mode: "review", total: 1, done: [a.id] },
    cards: [a, b],
    books: [book([a, b])],
    settings,
    reviews,
    now,
  };
  assert.equal(studySummary(base).todayCompleted, 1);
  assert.equal(
    studySummary({ ...base, session: { ...base.session, mode: "learn" } })
      .todayCompleted,
    2,
  );
});

test("normal next groups obey the daily new quota, and extra groups return to the existing today entry", () => {
  const cards = [graduate(card("done"), now), card("next"), card("later")];
  const options = {
    mode: "learn",
    cards,
    books: [book(cards)],
    settings: { ...settings, dailyNew: 2 },
    reviews: [],
    now,
  };
  assert.deepEqual(
    pendingStudyCards(options).map((item) => item.term),
    ["next"],
  );
  assert.deepEqual(
    pendingStudyCards({ ...options, settings: { ...settings, dailyNew: 1 } }),
    [],
  );
  assert.deepEqual(pendingStudyCards({ ...options, extraNew: true }), []);
});

test("review continuation respects daily review caps and reflects immediate recall work", () => {
  const done = reviewCard(card("done"), 3, now);
  const due = {
    ...graduate(card("due"), now),
    progress: { ...done.progress, dueAt: new Date(2026, 10, 7).toISOString() },
  };
  const recall = missSpelling(graduate(card("recall"), now), now);
  const cards = [done, due, recall];
  const reviews = [{ cardId: done.id, at: now.toISOString(), stage: "review" }];
  const options = {
    mode: "review",
    cards,
    books: [book(cards)],
    settings: { ...settings, dailyReview: 2 },
    reviews,
    now,
  };
  assert.deepEqual(
    pendingStudyCards(options).map((item) => item.term),
    ["recall"],
  );
  assert.deepEqual(
    pendingStudyCards({
      ...options,
      settings: { ...settings, dailyReview: 1 },
    }),
    [],
  );
});

test("temporarily skipped words do not trap subsequent groups or consume the new-word allowance", () => {
  const skipped = Array.from({ length: 20 }, () => ({ ...card(), senses: [] }));
  const next = card("meaningful");
  const cards = [...skipped, next];
  const options = {
    mode: "learn",
    cards,
    books: [book(cards)],
    settings,
    reviews: [],
    now,
    excludedIds: skipped.map((item) => item.id),
  };
  assert.deepEqual(
    pendingStudyCards(options).map((item) => item.id),
    [next.id],
  );
  const summary = studySummary({
    ...options,
    session: { mode: "learn", total: 10, done: [] },
  });
  assert.equal(summary.skipped, 10);
  assert.equal(summary.completed, 0);
  assert.equal(summary.remaining, 1);
});

test("partial spelling uses the saved recall schedule without claiming all spelling was correct", () => {
  const saved = missSpelling(graduate(card(), now), now);
  const summary = studySummary({
    session: {
      mode: "learn",
      total: 1,
      done: [saved.id],
      spelling: { list: [saved.id, saved.id], index: 1, missed: [saved.id] },
    },
    cards: [saved],
    books: [book([saved])],
    settings,
    reviews: [],
    now,
  });
  assert.equal(summary.rows[0].nextReview, "需要回炉");
  assert.ok(summary.spellingNote.includes("错过 1 个词"));
  assert.equal(saved.progress.introducedOn, localDay(now));
});
