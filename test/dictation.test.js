import assert from "node:assert/strict";
import test from "node:test";
import { localDay, newCard, withDictationAttempt } from "../src/core/content.js";
import {
  buildFreeDictationQueue,
  dictationTasks,
} from "../src/core/dictation.js";
import { dayTasks } from "../src/core/stats.js";
import { loadLibrary, saveDictationResult, state } from "../src/core/library.js";
import { studyDaysOf } from "../src/core/study-status.js";

const now = new Date(2026, 10, 14, 9);
const settings = {
  dailyNew: 20,
  groupSize: 10,
  dailyReview: null,
  dictationDailyNew: 2,
  dictationDailyReview: 2,
};

const card = (word) => newCard({ word, definition: "释义" }, now);
const book = (id, cards, patch = {}) => ({
  id,
  name: id,
  cardIds: cards.map((item) => item.id),
  active: true,
  recite: true,
  dictation: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: null,
  ...patch,
});

test("the first dictation attempt starts at zero and still waits until tomorrow after a miss", () => {
  const base = card("scope");
  const correct = withDictationAttempt(base, 3, now);
  assert.equal(correct.dictation.step, 0);
  assert.equal(correct.dictation.stage, "consolidating");
  assert.equal(correct.dictation.introducedOn, localDay(now));
  assert.equal(correct.dictation.dueAt, new Date(2026, 10, 15, 9).toISOString());
  assert.deepEqual(correct.progress, base.progress);

  const missed = withDictationAttempt(base, 1, now);
  assert.equal(missed.dictation.step, 0);
  assert.equal(missed.dictation.lapses, 1);
  assert.equal(missed.dictation.dueAt, new Date(2026, 10, 15, 9).toISOString());
  assert.deepEqual(missed.progress, base.progress);

  const later = withDictationAttempt(correct, 3, new Date(2026, 10, 15, 9));
  assert.equal(later.dictation.step, 1);
  assert.equal(later.dictation.dueAt, new Date(2026, 10, 17, 9).toISOString());

  const back = withDictationAttempt(later, 1, new Date(2026, 10, 17, 9));
  assert.equal(back.dictation.step, 0);
  assert.equal(back.dictation.dueAt, new Date(2026, 10, 17, 9).toISOString());
  assert.equal(back.dictation.lapses, 1);
  assert.deepEqual(back.progress, base.progress);
});

test("dictation tasks use only dictation books and independent daily quotas", () => {
  const fresh = card("fresh");
  const due = card("due");
  due.dictation = withDictationAttempt(card("due"), 3, new Date(2026, 10, 1)).dictation;
  const reciteOnly = card("recite");
  const books = [
    book("dictation", [fresh, due], { recite: false, dictation: true }),
    book("recite", [reciteOnly]),
  ];

  const tasks = dictationTasks([fresh, due, reciteOnly], books, settings, now, []);
  assert.deepEqual(tasks.due.map((item) => item.id), [due.id]);
  assert.deepEqual(tasks.fresh.map((item) => item.id), [fresh.id]);
  assert.equal(tasks.allowance, 2);
  assert.equal(tasks.reviewDeferred, 0);
});

test("dictation quotas count today's introductions and completed reviews separately", () => {
  const introduced = card("introduced");
  introduced.dictation = withDictationAttempt(introduced, 3, now).dictation;
  const due = card("due");
  due.dictation = withDictationAttempt(card("due"), 3, new Date(2026, 10, 1)).dictation;
  const next = card("next");
  const books = [
    book("dictation", [introduced, due, next], { recite: false, dictation: true }),
  ];

  const tasks = dictationTasks(
    [introduced, due, next],
    books,
    { ...settings, dictationDailyNew: 2, dictationDailyReview: 1 },
    now,
    [],
  );
  assert.equal(tasks.allowance, 1);
  assert.deepEqual(tasks.fresh.map((item) => item.id), [next.id]);
  assert.deepEqual(tasks.due.map((item) => item.id), [due.id]);

  const completed = [
    { cardId: due.id, at: now.toISOString(), stage: "dictation", rating: 3 },
  ];
  assert.deepEqual(dictationTasks([introduced, due, next], books, settings, now, completed).due, []);
});

test("recitation tasks exclude dictation-only books", () => {
  const dictationOnly = card("listen");
  const recite = card("recite");
  const books = [
    book("dictation", [dictationOnly], { recite: false, dictation: true }),
    book("recite", [recite]),
  ];
  const tasks = dayTasks([dictationOnly, recite], books, settings, now, []);
  assert.deepEqual(tasks.fresh, [recite.id]);
});

test("free practice filters by book, mastery and listening tag without writing a track", () => {
  const mastered = card("mastered");
  mastered.progress = {
    ...mastered.progress,
    stage: "mastered",
    step: 6,
    lastRating: 3,
    introducedOn: "2026-01-01",
  };
  mastered.dictation = undefined;
  const listen = card("listen");
  listen.tags = ["听辨"];
  const plain = card("plain");
  const cards = [mastered, listen, plain];
  const books = [book("one", cards)];

  assert.deepEqual(
    buildFreeDictationQueue({ cards, books, bookIds: ["one"], range: "all", limit: 10 })
      .map((item) => item.term),
    ["mastered", "listen", "plain"],
  );
  assert.deepEqual(
    buildFreeDictationQueue({ cards, books, bookIds: ["one"], range: "listen", limit: 10 })
      .map((item) => item.term),
    ["listen"],
  );
  assert.deepEqual(
    buildFreeDictationQueue({ cards, books, bookIds: ["one"], range: "unmastered", limit: 10 })
      .map((item) => item.term),
    ["listen", "plain"],
  );
  assert.deepEqual(
    buildFreeDictationQueue({ cards, books, bookIds: [], range: "all", limit: 10 }),
    [],
  );
});

test("dictation logs do not change mastery days or study status", () => {
  const item = card("scope");
  const reviews = [
    { cardId: item.id, at: now.toISOString(), stage: "dictation", rating: 3 },
  ];
  assert.deepEqual(studyDaysOf(item, reviews), {});

  const missed = withDictationAttempt(item, 1, now);
  assert.equal(missed.progress.masteryStatus, item.progress.masteryStatus);
  assert.deepEqual(missed.progress.masteryDays, item.progress.masteryDays);
});

test("saving a dictation result writes only the dictation track and its log", async (t) => {
  const item = newCard({ word: "contract", definition: "合同" }, now);
  item.progress = {
    ...item.progress,
    stage: "reviewing",
    step: 3,
    lastRating: 3,
    introducedOn: "2026-01-01",
  };
  let raw = JSON.stringify({
    version: 8,
    cards: [item],
    books: [book("one", [item], { recite: true, dictation: true })],
    reviews: [],
  });
  const storage = globalThis.localStorage;
  t.after(() => {
    if (storage) globalThis.localStorage = storage;
    else delete globalThis.localStorage;
  });
  globalThis.localStorage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };

  await loadLibrary();
  const progressBefore = JSON.parse(JSON.stringify(state.cards[0].progress));
  const result = await saveDictationResult(state.cards[0], false, now);
  const saved = JSON.parse(raw);

  assert.deepEqual(saved.cards[0].progress, progressBefore);
  assert.equal(saved.cards[0].progress.step, 3);
  assert.equal(saved.cards[0].dictation.step, 0);
  assert.equal(saved.cards[0].dictation.lapses, 1);
  assert.deepEqual(saved.reviews.map((entry) => [entry.stage, entry.rating]), [
    ["dictation", 1],
  ]);
  assert.equal(result.card.dictation.step, 0);
  assert.equal(result.card.progress.masteryStatus, item.progress.masteryStatus);
});
