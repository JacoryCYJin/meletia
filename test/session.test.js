import assert from "node:assert/strict";
import test from "node:test";
import { meaningChoices, newCard } from "../src/core/content.js";
import {
  loadLibrary, saveLearnCheckpoint, saveStudyResult, state, undoStudyResult,
} from "../src/core/library.js";
import {
  answerQuestion,
  continueQuestion,
  createLearnSession,
  createReviewSession,
  currentEntry,
  matchSpelling,
  showAnswerDetail,
  skipSpelling,
  skipWord,
  spell,
  spellTarget,
  startSpelling,
} from "../src/core/session.js";

const cards = (...ids) => ids.map((id) => ({ id }));

function answerAndContinue(session, rating) {
  return continueQuestion(answerQuestion(session, rating));
}

test("a correct answer shows detail before unaided recall and before completion", () => {
  let session = createLearnSession(cards("a"));
  assert.equal(currentEntry(session).round, "choice");

  session = answerQuestion(session, 3);
  assert.equal(session.phase, "detail");
  assert.equal(currentEntry(session).round, "choice");
  session = continueQuestion(session);
  assert.equal(currentEntry(session).round, "recall");

  assert.deepEqual(session.done, []);
  session = answerQuestion(session, 3);
  assert.equal(session.phase, "detail");
  assert.deepEqual(session.done, []);
  session = continueQuestion(session);
  assert.deepEqual(session.done, ["a"]);
  assert.equal(session.phase, "spelling-ready");
  assert.equal(spellTarget(session), null);
});

test("a selected wrong option locks the question until detail is opened", () => {
  const start = createLearnSession(cards("a", "b", "c", "d", "e"));
  const feedback = answerQuestion(start, 1, { selectedOption: true });
  assert.equal(feedback.phase, "choice-feedback");
  assert.equal(feedback.queue, start.queue);
  assert.equal(answerQuestion(feedback, 3, { selectedOption: true }), feedback);
  assert.equal(continueQuestion(feedback), feedback);
  const detail = showAnswerDetail(feedback);
  assert.equal(detail.phase, "detail");
  assert.equal(currentEntry(detail).id, "a");
  assert.deepEqual(continueQuestion(detail), answerAndContinue(start, 1));
});

test("skipping a choice or forgetting during recall shows detail and repeats that round", () => {
  let session = createLearnSession(cards("a"));
  session = answerQuestion(session, 1);
  assert.equal(session.phase, "detail");
  session = continueQuestion(session);
  assert.equal(currentEntry(session).round, "choice");

  session = answerAndContinue(session, 3);
  session = answerQuestion(session, 1);
  assert.equal(session.phase, "detail");
  session = continueQuestion(session);
  assert.equal(currentEntry(session).round, "recall");
  assert.deepEqual(session.done, []);
});

test("new words advance and repeat among other words in the group", () => {
  let session = createLearnSession(cards("a", "b", "c", "d", "e"));
  session = answerAndContinue(session, 1);
  assert.equal(currentEntry(session).id, "b");
  assert.deepEqual(session.queue[3], { id: "a", round: "choice" });

  session = answerAndContinue(session, 3);
  assert.equal(currentEntry(session).id, "c");
  assert.deepEqual(session.queue[3], { id: "b", round: "recall" });
});

test("recognizing an old word immediately advances to the next word", () => {
  const session = answerQuestion(createReviewSession(cards("a", "b")), 3);
  assert.equal(session.phase, "card");
  assert.deepEqual(currentEntry(session), { id: "b", round: "recognition" });
  assert.deepEqual(session.done, ["a"]);
});

test("both weak review ratings require two follow-up questions without changing the first rating", () => {
  for (const rating of [1, 2]) {
    let session = createReviewSession(cards("a", "b"));
    session = answerQuestion(session, rating);
    assert.equal(session.phase, "detail");
    assert.equal(currentEntry(session).id, "a");

    session = continueQuestion(session);
    assert.equal(currentEntry(session).id, "b");
    assert.deepEqual(session.done, []);
    session = answerQuestion(session, 3);
    assert.deepEqual(currentEntry(session), { id: "a", round: "choice", firstRating: rating });

    session = answerAndContinue(session, 1);
    assert.equal(currentEntry(session).round, "choice");
    session = answerAndContinue(session, 3);
    assert.equal(currentEntry(session).round, "reverse");
    session = answerAndContinue(session, 2);
    assert.equal(currentEntry(session).round, "reverse");
    assert.equal(currentEntry(session).firstRating, rating);
    assert.deepEqual(session.done, ["b"]);

    session = answerQuestion(session, 3);
    assert.equal(session.phase, "spelling-ready");
    assert.deepEqual(session.done, ["b", "a"]);
  }
});

test("spelling starts on request and retries mistakes until cleared", () => {
  const ready = answerQuestion(createReviewSession(cards("a")), 3);
  assert.equal(spell(ready, true), ready);
  let session = startSpelling(ready);
  assert.equal(spellTarget(session), "a");
  session = spell(session, false);
  assert.equal(session.phase, "spell");
  assert.deepEqual(session.spelling.missed, ["a"]);
  assert.equal(spellTarget(session), "a");
  session = spell(session, true);
  assert.equal(session.phase, "finished");
  assert.equal(spellTarget(session), null);
});

test("spelling can be skipped before it starts or while in progress", () => {
  const ready = answerQuestion(createReviewSession(cards("a")), 3);
  assert.equal(skipSpelling(ready).phase, "finished");
  assert.equal(skipSpelling(ready).spelling, null);
  assert.equal(skipSpelling(startSpelling(ready)).phase, "finished");
});

test("skipped words stay incomplete and an empty group finishes immediately", () => {
  const empty = createLearnSession([]);
  assert.equal(empty.phase, "finished");
  assert.equal(empty.total, 0);

  const skipped = skipWord(createLearnSession(cards("a")));
  assert.equal(skipped.phase, "finished");
  assert.deepEqual(skipped.done, []);
  assert.equal(skipped.total, 1);
});

test("meaning choices avoid shared glosses and support a small word library", () => {
  const card = newCard({ word: "contract", definition: "n. 合同，契约" });
  const synonym = newCard({ word: "agreement", definition: "协定，合同" });
  const others = [
    newCard({ word: "river", definition: "河流" }),
    newCard({ word: "station", definition: "车站" }),
    newCard({ word: "cloud", definition: "云" }),
  ];
  const choices = meaningChoices(card, [card, synonym, ...others]);
  assert.equal(choices.length, 4);
  assert.equal(choices.filter(({ correct }) => correct).length, 1);
  assert.ok(!choices.some(({ text }) => text.includes("协定")));
  assert.equal(meaningChoices(card, [card, others[0]]).length, 2);
  assert.deepEqual(meaningChoices(card, [card, synonym]), []);
});

test("choices show one sense, favor matching parts of speech and avoid other valid meanings", () => {
  const card = newCard({ word: "contract", definition: "n. 合同，契约；vi. 收缩" });
  const overlap = newCard({ word: "shrinkage", definition: "n. 收缩" });
  const cards = [
    card,
    overlap,
    newCard({ word: "garden", definition: "n. 庭院；vi. 做园艺" }),
    newCard({ word: "station", definition: "vt. 驻扎；n. 车站" }),
    newCard({ word: "cloud", definition: "n. 云" }),
    newCard({ word: "borrow", definition: "vt. 借入" }),
  ];
  const choices = meaningChoices(card, cards);
  assert.deepEqual(choices.find(({ correct }) => correct), {
    text: "n. 合同，契约", term: "contract", correct: true,
  });
  assert.equal(choices.find(({ text }) => text === "n. 车站").term, "station");
  assert.deepEqual(choices.map(({ text }) => text).sort(), [
    "n. 合同，契约", "n. 庭院", "n. 车站", "n. 云",
  ].sort());
});

test("spelling comparison ignores case and extra spaces", () => {
  assert.equal(matchSpelling(" Make  Sense ", "make sense"), true);
  assert.equal(matchSpelling("make sence", "make sense"), false);
});

test("saving and undoing a finished word write the log and due date together, including on retry", async (t) => {
  const now = new Date("2026-11-06T12:00:00");
  const card = newCard({ word: "contract", definition: "合同" });
  card.progress = { ...card.progress, stage: "reviewing", step: 3, lapses: 2 };
  let raw = JSON.stringify({ version: 4, cards: [card], books: [], reviews: [] });
  let writes = 0;
  let fail = false;
  const storage = globalThis.localStorage;
  t.after(() => {
    if (storage) globalThis.localStorage = storage;
    else delete globalThis.localStorage;
  });
  globalThis.localStorage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      if (fail) throw new Error("write failed");
      writes += 1;
      raw = value;
    },
  };

  await loadLibrary();
  const before = writes;
  fail = true;
  await assert.rejects(saveStudyResult(state.cards[0], "review", 1, now), /write failed/);
  assert.equal(state.cards[0].progress.lapses, 2);
  assert.deepEqual(state.reviews, []);
  fail = false;
  const receipt = await saveStudyResult(state.cards[0], "review", 1, now);
  assert.equal(writes, before + 1);
  const saved = JSON.parse(raw);
  const progress = saved.cards[0].progress;
  assert.equal(progress.needsRecall, false);
  assert.equal(progress.step, 0);
  assert.equal(progress.lapses, 3);
  assert.equal(progress.dueAt, new Date("2026-11-07T12:00:00").toISOString());
  assert.deepEqual(saved.reviews.map(({ stage, rating }) => [stage, rating]), [["review", 1]]);

  fail = true;
  await assert.rejects(undoStudyResult(receipt), /write failed/);
  assert.deepEqual(state.cards[0].progress, progress);
  assert.equal(state.reviews.length, 1);
  fail = false;
  await undoStudyResult(receipt);
  assert.equal(writes, before + 2);
  assert.deepEqual(state.cards[0].progress, card.progress);
  assert.deepEqual(JSON.parse(raw).reviews, []);

  await saveStudyResult(state.cards[0], "review", 2, now);
  await assert.rejects(undoStudyResult(receipt), /无法返回上一词/);
  assert.equal(state.cards[0].progress.step, 2);
  assert.deepEqual(state.reviews.map(({ rating }) => rating), [2]);
});

test("learning resumes from a saved answer and advances together with its completion record", async (t) => {
  const now = new Date("2026-11-06T12:00:00");
  const card = newCard({ word: "contract", definition: "合同" }, now);
  let raw = JSON.stringify({
    version: 6, cards: [card], books: [{ id: "practice", name: "练习", cardIds: [card.id] }], reviews: [],
  });
  const storage = globalThis.localStorage;
  t.after(() => {
    if (storage) globalThis.localStorage = storage;
    else delete globalThis.localStorage;
  });
  let fail = false;
  globalThis.localStorage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      if (fail) throw new Error("write failed");
      raw = value;
    },
  };

  await loadLibrary();
  assert.equal(state.learnCheckpoint, null);
  const firstAnswer = answerQuestion(createLearnSession(state.cards), 3, { selectedOption: true });
  await saveLearnCheckpoint({ session: firstAnswer });
  await loadLibrary();
  assert.equal(state.learnCheckpoint.session.phase, "detail");
  const recall = continueQuestion(state.learnCheckpoint.session);
  assert.equal(currentEntry(recall).round, "recall");
  await saveLearnCheckpoint({ session: recall });
  await loadLibrary();
  assert.equal(currentEntry(state.learnCheckpoint.session).round, "recall");

  const recalled = continueQuestion(answerQuestion(state.learnCheckpoint.session, 3));
  const complete = () => saveStudyResult(state.cards[0], "learn", 3, now, { session: recalled });
  fail = true;
  await assert.rejects(complete(), /write failed/);
  assert.equal(state.reviews.length, 0);
  assert.equal(currentEntry(state.learnCheckpoint.session).round, "recall");
  fail = false;
  await complete();
  await loadLibrary();
  assert.equal(state.learnCheckpoint.session.phase, "spelling-ready");
  assert.equal(state.reviews.length, 1);
  await saveLearnCheckpoint({ session: skipSpelling(state.learnCheckpoint.session) });
  await loadLibrary();
  assert.equal(state.learnCheckpoint, null);
  assert.equal(state.reviews.length, 1);
});
