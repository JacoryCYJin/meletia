import assert from "node:assert/strict";
import test from "node:test";
import { createBook } from "../src/features/books/actions.js";
import { saveDictationResult } from "../src/features/dictation/actions.js";
import { createDictationSession } from "../src/features/dictation/session.js";
import { importCards, undoImportBatch } from "../src/features/import/actions.js";
import { deleteCard } from "../src/features/library/actions.js";
import { restoreTrash } from "../src/features/trash/actions.js";
import {
  saveLearnCheckpoint,
  saveStudyResult,
} from "../src/features/study/actions.js";
import {
  answerQuestion,
  continueQuestion,
  createLearnSession,
} from "../src/features/study/session.js";
import { loadLibrary, state } from "../src/storage/store.js";

function useStorage(t) {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  t.after(() => {
    delete globalThis.localStorage;
  });
}

async function seed() {
  await loadLibrary();
  await createBook("流程词书");
  const book = state.books[0];
  await importCards(
    [{ word: "contract", definition: "n. 合同" }],
    { bookId: book.id },
  );
  return book;
}

test("learning flow writes no completion log before recall finishes, then saves progress, log and checkpoint together", async (t) => {
  useStorage(t);
  await seed();
  const card = state.cards[0];
  let session = createLearnSession([card]);

  session = answerQuestion(session, 3);
  assert.equal(session.phase, "detail");
  assert.equal(state.reviews.length, 0);

  session = continueQuestion(session);
  assert.equal(session.queue[0].round, "recall");
  assert.equal(state.reviews.length, 0);

  session = answerQuestion(session, 3);
  assert.equal(session.phase, "detail");
  assert.equal(state.reviews.length, 0);

  session = continueQuestion(session);
  assert.equal(session.phase, "spelling-ready");
  assert.equal(state.reviews.length, 0);

  await saveStudyResult(state.cards[0], "learn", 3, new Date(), {
    session,
  });
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].stage, "learn");
  assert.notEqual(state.cards[0].progress.stage, "new");
  assert.equal(state.learnCheckpoint.session.phase, "spelling-ready");

  await loadLibrary();
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].stage, "learn");
  assert.notEqual(state.cards[0].progress.stage, "new");
  assert.equal(state.learnCheckpoint.session.phase, "spelling-ready");
});

test("dictation flow writes its own track without touching recitation progress", async (t) => {
  useStorage(t);
  await seed();
  await saveStudyResult(state.cards[0], "learn", 3, new Date());
  const current = state.cards[0];
  const before = JSON.parse(JSON.stringify(current.progress));

  const round = createDictationSession([current.id], 1);
  assert.equal(round.phase, "dictation");
  await saveDictationResult(current, false, new Date());

  assert.deepEqual(JSON.parse(JSON.stringify(state.cards[0].progress)), before);
  assert.equal(state.cards[0].dictation.step, 0);
  assert.equal(state.cards[0].dictation.lapses, 1);
  assert.deepEqual(
    state.reviews.map((entry) => entry.stage),
    ["learn", "dictation"],
  );
});

test("import can be undone and trash can be restored in isolated storage", async (t) => {
  useStorage(t);
  const book = await seed();
  assert.equal(state.cards.length, 1);
  assert.equal(state.importBatches.length, 1);

  await undoImportBatch(state.importBatches[0].id);
  assert.equal(state.cards.length, 0);
  assert.equal(state.books[0].id, book.id);

  await importCards(
    [{ word: "scope", definition: "n. 范围" }],
    { bookId: book.id },
  );
  const card = state.cards[0];
  await saveStudyResult(card, "learn", 3, new Date());
  const reviewCount = state.reviews.length;

  await deleteCard(card.id, book.id);
  assert.equal(state.cards.length, 0);
  assert.equal(state.trash.length, 1);
  assert.equal(state.reviews.length, 0);

  await restoreTrash(state.trash[0].id);
  assert.equal(state.cards.length, 1);
  assert.equal(state.reviews.length, reviewCount);
  assert.equal(state.books[0].cardIds.includes(state.cards[0].id), true);
});
