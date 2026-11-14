import assert from "node:assert/strict";
import test from "node:test";
import {
  blankCard,
  definitionOf,
  hasTag,
  idFor,
  migrateStore,
  parseSenses,
  senseLine,
  splitTags,
  STORE_VERSION,
  wordKey,
} from "../src/core/content.js";

test("tags split on the same separators and match whole entries", () => {
  assert.deepEqual(splitTags("听辨, 拼写，阅读；写作"), ["听辨", "拼写", "阅读", "写作"]);
  assert.deepEqual(splitTags(""), []);
  assert.equal(hasTag({ tags: ["听辨", "拼写"] }, "听辨"), true);
  assert.equal(hasTag({ tags: ["听辨重点"] }, "听辨"), false);
  assert.equal(hasTag({ tags: [] }, ""), true);
  assert.equal(hasTag({}, "听辨"), false);
});

test("book modes default to recitation and card dictation survives normalization", () => {
  const card = { ...blankCard(new Date(2026, 10, 14)), term: "scope" };
  const store = migrateStore({
    version: 8,
    cards: [card],
    books: [{ id: "b", name: "书", cardIds: [card.id] }],
    reviews: [],
  });
  assert.equal(store.books[0].recite, true);
  assert.equal(store.books[0].dictation, false);
  assert.equal(store.cards[0].dictation, undefined);

  const tracked = migrateStore({
    version: 8,
    cards: [{
      ...card,
      dictation: { step: 2, stage: "consolidating", dueAt: "2026-11-20T00:00:00.000Z" },
    }],
    books: [{
      id: "b",
      name: "书",
      cardIds: [card.id],
      recite: false,
      dictation: true,
    }],
    reviews: [],
  });
  assert.equal(tracked.books[0].recite, false);
  assert.equal(tracked.books[0].dictation, true);
  assert.equal(tracked.cards[0].dictation.step, 2);
  assert.equal(tracked.cards[0].dictation.lapses, 0);
  assert.equal(tracked.cards[0].dictation.introducedOn, null);
});

test("dictation replay defaults survive old settings and reject invalid values", () => {
  const read = (settings) =>
    migrateStore({ version: 8, settings, cards: [], books: [], reviews: [] }).settings.dictationReplays;
  assert.equal(read(undefined), 2);
  assert.equal(read({ dictationReplays: 0 }), 0);
  assert.equal(read({ dictationReplays: 5 }), 5);
  assert.equal(read({ dictationReplays: 9 }), 2);
  assert.equal(read({ dictationReplays: 1.5 }), 2);
});

test("senses split at part-of-speech boundaries and keep the marker", () => {
  assert.deepEqual(
    parseSenses("n. 合同，契约；vi. 收缩，缩小；签订合同；vt. 使收缩"),
    [
      { pos: "n.", text: "合同，契约" },
      { pos: "vi.", text: "收缩，缩小；签订合同" },
      { pos: "vt.", text: "使收缩" },
    ],
  );
});

test("definitions without a part of speech stay as one sense", () => {
  assert.deepEqual(parseSenses("有道理；说得通"), [
    { pos: "", text: "有道理；说得通" },
  ]);
  assert.deepEqual(parseSenses(""), []);
});

test("sense lines render back to the original text", () => {
  const senses = parseSenses("n. 范围；v. 仔细观察，审视");
  assert.equal(definitionOf({ senses }), "n. 范围；v. 仔细观察，审视");
  assert.equal(senseLine({ pos: "n.", text: "范围" }), "n. 范围");
});

test("version 1 cards become new-progress cards grouped into source books", () => {
  const store = migrateStore({
    version: 1,
    cards: [
      {
        word: "contract",
        definition: "n. 合同；vi. 收缩",
        source: "练习",
        status: "未掌握",
        date: "2026/11/4",
        introducedOn: null,
      },
      { word: "CONTRACT", definition: "n. 合同", source: "媒体" },
      { word: "make sense", definition: "说得通", source: "练习、媒体" },
    ],
  });

  assert.equal(store.version, STORE_VERSION);
  assert.equal(store.migrated, true);
  assert.equal(store.cards.length, 3);
  assert.equal(store.cards[0].progress.stage, "new");
  assert.equal(store.cards[0].progress.needsRecall, false);
  assert.equal(store.settings.dailyNew, 20);

  const names = store.books.map((book) => book.name).sort();
  assert.deepEqual(names, ["媒体", "练习"]);
  assert.equal(store.books.find((book) => book.name === "练习").cardIds.length, 2);
});

test("version 2 schedules carry over into learning progress", () => {
  const schedule = {
    due: "2026-11-10T00:00:00.000Z",
    state: 2,
    reps: 3,
    lapses: 0,
    scheduled_days: 5,
    elapsed_days: 5,
    learning_steps: 0,
    stability: 5,
    difficulty: 5,
  };
  const store = migrateStore({
    version: 2,
    cards: [
      {
        id: "c-contract",
        term: "contract",
        senses: [{ pos: "n.", text: "合同" }],
        source: "练习",
        introducedOn: "2026-10-29",
        schedule,
      },
    ],
  });

  const [card] = store.cards;
  assert.equal(card.progress.step, 2);
  assert.equal(card.progress.stage, "reviewing");
  assert.equal(card.progress.introducedOn, "2026-10-29");
  assert.equal(card.progress.dueAt, schedule.due);
  assert.equal(store.books[0].name, "练习");
});

test("migrating version 4 keeps books, settings and review logs", () => {
  const card = { ...blankCard(new Date(2026, 10, 4, 9)), term: "make sense" };
  const store = migrateStore({
    version: 4,
    settings: { dailyNew: 30, groupSize: 20, learnStreak: 3 },
    books: [
      {
        id: "b1",
        name: "雅思练习生词",
        cardIds: [card.id],
        active: false,
      },
    ],
    cards: [card],
    reviews: [{ cardId: card.id, at: "2026-11-04T09:00:00.000Z", rating: 3 }],
  });

  assert.equal(store.migrated, true);
  assert.deepEqual(store.settings, {
    dailyNew: 30,
    groupSize: 20,
    dailyReview: null,
    trashRetentionDays: 7,
    dictationReplays: 2,
    dictationDailyNew: 10,
    dictationDailyReview: 20,
    dictationGroupSize: 10,
  });
  assert.equal(store.books[0].name, "雅思练习生词");
  assert.equal(store.books[0].active, false);
  assert.equal(store.reviews.length, 1);
  assert.equal(store.cards[0].progress.step, 0);
});

test("keys ignore case and surrounding space", () => {
  assert.equal(wordKey("  Make Sense "), "make sense");
  assert.equal(idFor("SCOPE"), idFor("scope"));
  assert.notEqual(idFor("scope"), idFor("contract"));
});

test("migration removes unowned cards and splits shared cards without duplicating review history", () => {
  const card = { ...blankCard(), term: "contract" };
  const orphan = { ...blankCard(), term: "scope" };
  const store = migrateStore({
    version: 5,
    cards: [card, orphan],
    books: [
      { id: "a", name: "A", cardIds: [card.id] },
      { id: "b", name: "B", cardIds: [card.id] },
    ],
    reviews: [
      { cardId: card.id, at: "2026-11-04T09:00:00.000Z" },
      { cardId: orphan.id, at: "2026-11-04T09:00:00.000Z" },
    ],
  });
  assert.deepEqual(store.cards.map((item) => item.term), ["contract", "contract"]);
  assert.equal(store.books[0].cardIds[0], card.id);
  assert.notEqual(store.books[1].cardIds[0], card.id);
  assert.deepEqual(store.reviews.map((record) => record.cardId), [card.id]);
});
