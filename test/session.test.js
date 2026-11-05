import assert from "node:assert/strict";
import test from "node:test";
import {
  closeDetail,
  createLearnSession,
  createReviewSession,
  currentEntry,
  learn,
  leaveIntro,
  matchSpelling,
  review,
  showDetail,
  showIntro,
  skipSpelling,
  spell,
  spellTarget,
} from "../src/core/session.js";

const cards = (...ids) => ids.map((id) => ({ id }));

test("a new word starts with an introduction before it is tested", () => {
  let session = createLearnSession(cards("a"), 10, 4);
  assert.equal(showIntro(session), true);

  session = learn(session, 3);
  assert.equal(showIntro(session), true, "grading is ignored during intro");

  session = leaveIntro(session);
  assert.equal(showIntro(session), false);
  assert.equal(currentEntry(session).intro, false);
});

test("a new card graduates only after the goal number of correct recalls", () => {
  let session = createLearnSession(cards("a"), 10, 4);
  session = leaveIntro(session);

  for (let round = 1; round < 4; round += 1) {
    session = learn(session, 3);
    assert.equal(session.done.length, 0);
    assert.equal(currentEntry(session).streak, round);
  }

  session = learn(session, 3);
  assert.deepEqual(session.done, ["a"]);
  assert.equal(session.graduated, "a");
  assert.equal(session.phase, "spell");
});

test("the goal comes from settings", () => {
  let session = createLearnSession(cards("a"), 10, 3);
  session = leaveIntro(session);
  session = learn(session, 3);
  session = learn(session, 3);
  session = learn(session, 3);
  assert.equal(session.graduated, "a");
});

test("a wrong answer resets the streak and keeps the card in the group", () => {
  let session = createLearnSession(cards("a"), 10, 4);
  session = leaveIntro(session);
  session = learn(session, 3);
  assert.equal(currentEntry(session).streak, 1);

  session = learn(session, 1);
  assert.equal(currentEntry(session).id, "a");
  assert.equal(currentEntry(session).streak, 0);
  assert.equal(session.done.length, 0);
  assert.equal(session.phase, "card");
});

test("missed cards come back a few cards later in the same group", () => {
  let session = createLearnSession(cards("a", "b", "c", "d", "e"), 10, 4);
  session = leaveIntro(session);
  session = learn(session, 2);
  assert.equal(currentEntry(session).id, "b");
  assert.equal(session.queue[3].id, "a");
  assert.equal(session.queue.length, 5);
});

test("group spelling retries mistakes until they are cleared", () => {
  let session = createLearnSession(cards("a"), 10, 4);
  session = leaveIntro(session);
  for (let round = 0; round < 4; round += 1) session = learn(session, 3);

  assert.equal(session.phase, "spell");
  assert.equal(spellTarget(session), "a");

  session = spell(session, false);
  assert.equal(session.phase, "spell");
  assert.deepEqual(session.spelling.missed, ["a"]);
  assert.equal(spellTarget(session), "a");

  session = spell(session, true);
  assert.equal(session.phase, "finished");
  assert.equal(spellTarget(session), null);
});

test("spelling can be skipped", () => {
  let session = createLearnSession(cards("a"), 10, 4);
  session = leaveIntro(session);
  for (let round = 0; round < 4; round += 1) session = learn(session, 3);
  assert.equal(skipSpelling(session).phase, "finished");
});

test("review asks for recognition first and moves on without a detail page", () => {
  let session = createReviewSession(cards("a", "b"));
  assert.equal(showIntro(session), false);

  session = review(session, 3);
  assert.equal(session.phase, "card");
  assert.equal(showDetail(session), false);
  assert.equal(currentEntry(session).id, "b");
  assert.deepEqual(session.done, ["a"]);
});

test("a fuzzy or forgotten card opens the detail page before moving on", () => {
  let session = createReviewSession(cards("a", "b"));

  session = review(session, 2);
  assert.equal(session.phase, "detail");
  assert.equal(showDetail(session), true);
  assert.equal(currentEntry(session).id, "a");
  assert.equal(session.done.length, 0);

  session = closeDetail(session);
  assert.equal(session.phase, "card");
  assert.equal(currentEntry(session).id, "b");
  assert.deepEqual(session.done, ["a"]);

  session = review(session, 1);
  assert.equal(session.phase, "detail");
  session = closeDetail(session);
  assert.equal(session.phase, "spell");
  assert.deepEqual(session.done, ["a", "b"]);
});

test("closing a detail page on the last card starts group spelling", () => {
  let session = createReviewSession(cards("a"));
  session = review(session, 1);
  assert.equal(session.phase, "detail");
  assert.equal(spellTarget(session), null);

  session = closeDetail(session);
  assert.equal(session.phase, "spell");
  assert.equal(spellTarget(session), "a");
  assert.equal(session.lastGrade, 1);
});

test("spelling comparison ignores case and extra spaces", () => {
  assert.equal(matchSpelling(" Make  Sense ", "make sense"), true);
  assert.equal(matchSpelling("make sence", "make sense"), false);
});

test("empty groups finish immediately", () => {
  const session = createLearnSession([]);
  assert.equal(session.phase, "finished");
  assert.equal(session.total, 0);
});
