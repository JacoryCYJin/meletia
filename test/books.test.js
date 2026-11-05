import assert from "node:assert/strict";
import test from "node:test";
import { bookStats, freshQueue, isDue } from "../src/core/books.js";

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

const book = (id, cardIds, active = true) => ({ id, name: id, cardIds, active });

test("new words alternate between active books", () => {
  const cards = ["a1", "a2", "a3", "b1", "b2"].map((id) => card(id));
  const books = [book("a", ["a1", "a2", "a3"]), book("b", ["b1", "b2"])];
  assert.deepEqual(freshQueue(books, cards, 4), ["a1", "b1", "a2", "b2"]);
});

test("learned cards are skipped without losing book order", () => {
  const cards = [
    card("a1", { stage: "reviewing" }),
    card("a2"),
    card("b1"),
  ];
  const books = [book("a", ["a1", "a2"]), book("b", ["b1"])];
  assert.deepEqual(freshQueue(books, cards, 5), ["a2", "b1"]);
});

test("a card that belongs to two books is only picked once", () => {
  const cards = [card("shared"), card("b1")];
  const books = [book("a", ["shared"]), book("b", ["shared", "b1"])];
  assert.deepEqual(freshQueue(books, cards, 5), ["shared", "b1"]);
});

test("inactive books and a zero limit contribute nothing", () => {
  const cards = [card("a1"), card("b1")];
  const books = [book("a", ["a1"]), book("b", ["b1"], false)];
  assert.deepEqual(freshQueue(books, cards, 5), ["a1"]);
  assert.deepEqual(freshQueue(books, cards, 0), []);
});

test("book stats separate learned, due and recall counts", () => {
  const now = new Date(2026, 10, 4, 20);
  const cards = [
    card("fresh"),
    card("ready", {
      stage: "reviewing",
      dueAt: new Date(2026, 10, 4, 9).toISOString(),
    }),
    card("later", {
      stage: "reviewing",
      dueAt: new Date(2026, 10, 9, 9).toISOString(),
    }),
    card("back", { stage: "consolidating", needsRecall: true }),
  ];
  const stats = bookStats(book("a", ["fresh", "ready", "later", "back"]), cards, now);
  assert.deepEqual(stats, {
    total: 4,
    learned: 3,
    due: 1,
    recall: 1,
    fresh: 1,
  });
});

test("recall cards never count as due at the same time", () => {
  const now = new Date(2026, 10, 4, 20);
  const cardWithRecall = card("back", {
    stage: "consolidating",
    needsRecall: true,
    dueAt: new Date(2026, 10, 1).toISOString(),
  });
  assert.equal(isDue(cardWithRecall, now), false);
});
