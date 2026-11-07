import assert from "node:assert/strict";
import test from "node:test";
import { newCard } from "../src/core/content.js";
import {
  cardsInImportTarget,
  createBook,
  deleteBook,
  importCards,
  loadLibrary,
  mergeBooks,
  previewBookMerge,
  saveCard,
  saveStudyResult,
  state,
} from "../src/core/library.js";

test("reimport only adds new words in the selected book and preserves independent cards", async () => {
  let stored = null;
  let failWrite = false;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_, value) => {
      if (failWrite) throw new Error("write failed");
      stored = value;
    },
  };
  await loadLibrary();

  const contract = { word: "contract", definition: "合同", tags: "work,law" };
  const scope = { word: "scope", definition: "范围" };
  await createBook("雅思");
  const [first] = state.books;
  assert.equal(await importCards([contract, contract], { bookId: first.id }), 1);
  const [learned] = cardsInImportTarget(first.id);
  await saveCard({
    ...learned,
    progress: { ...learned.progress, stage: "reviewing", step: 2 },
  }, first.id);
  assert.equal(await importCards([{ ...contract, word: " CONTRACT ", definition: "契约" }, scope], { bookId: first.id }), 1);
  assert.equal(await importCards([contract, scope], { bookId: first.id }), 0);
  assert.equal(await importCards([{ ...contract, definition: "契约" }], { name: "商务英语" }), 1);
  await assert.rejects(importCards([contract], {}), /词书已不存在/);

  failWrite = true;
  await assert.rejects(importCards([scope], { name: "失败的导入" }), /write failed/);
  assert.equal(state.books.length, 2);
  assert.equal(state.busy, false);
  assert.equal(state.cards.length, 3);
  failWrite = false;

  await loadLibrary();
  const [ielts, business] = state.books;
  const [original, added] = cardsInImportTarget(ielts.id);
  const [independent] = cardsInImportTarget(business.id);
  assert.notEqual(original.id, independent.id);
  assert.equal(original.senses[0].text, "合同");
  assert.equal(independent.senses[0].text, "契约");
  assert.equal(original.progress.step, 2);
  assert.equal(independent.progress.stage, "new");
  assert.deepEqual(original.tags, ["work", "law"]);
  assert.equal(added.term, "scope");
  await saveStudyResult(independent, "learn", 3);
  await deleteBook(business.id);
  assert.deepEqual(cardsInImportTarget(ielts.id).map((card) => card.term), ["contract", "scope"]);
  assert.equal(state.reviews.length, 0);
});

test("merge keeps the preferred card, moves unique cards with progress and preserves review history", async () => {
  let stored = null;
  globalThis.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  await loadLibrary();
  await importCards([{ word: "contract", definition: "合同" }], { name: "A" });
  await importCards([
    { word: "CONTRACT", definition: "契约" },
    { word: "scope", definition: "范围" },
  ], { name: "B" });
  const [a, b] = state.books;
  const [preferred] = cardsInImportTarget(a.id);
  const [duplicate, moved] = cardsInImportTarget(b.id);
  await saveStudyResult(duplicate, "learn", 3);
  await saveStudyResult(moved, "learn", 3);
  const preview = previewBookMerge(a.id, b.id);
  assert.equal(preview.moved, 1);
  assert.equal(preview.duplicates.size, 1);
  await mergeBooks(a.id, b.id);
  assert.deepEqual(state.books.map((book) => book.name), ["A"]);
  assert.deepEqual(state.reviews.map((record) => record.cardId), [preferred.id, moved.id]);
  assert.equal(cardsInImportTarget(a.id)[0].senses[0].text, "合同");
  assert.equal(cardsInImportTarget(a.id)[0].progress.stage, "new");
  assert.notEqual(cardsInImportTarget(a.id)[1].progress.stage, "new");

  await importCards([{ word: "contract", definition: "契约" }], { name: "C" });
  const c = state.books.find((book) => book.name === "C");
  const combined = await mergeBooks(c.id, a.id, "D");
  await loadLibrary();
  assert.deepEqual(state.books.map((book) => book.name), ["D"]);
  assert.equal(cardsInImportTarget(combined.id)[0].senses[0].text, "契约");
  assert.equal(state.reviews.length, 2);
});

test("book update times survive reload and change only when new words are added", async () => {
  const originalTime = "2000-01-01T00:00:00.000Z";
  const contract = newCard({ word: "contract", definition: "合同" });
  const scope = newCard({ word: "scope", definition: "范围" });
  const fixture = {
    version: 6,
    cards: [contract, scope],
    books: [
      { id: "a", name: "A", cardIds: [contract.id], updatedAt: originalTime },
      { id: "b", name: "B", cardIds: [scope.id], updatedAt: originalTime },
    ],
    reviews: [],
  };
  let stored;
  let failWrite = false;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      if (failWrite) throw new Error("write failed");
      stored = value;
    },
  };
  for (const add of [
    () => saveCard(newCard({ word: "cloud", definition: "云" }), "a"),
    () => importCards([{ word: "cloud", definition: "云" }], { bookId: "a" }),
    () => mergeBooks("a", "b"),
  ]) {
    stored = JSON.stringify(fixture);
    await loadLibrary();
    await add();
    const updated = state.books[0].updatedAt;
    assert.ok(new Date(updated) > new Date(originalTime));
    await loadLibrary();
    assert.equal(state.books[0].updatedAt, updated);
    assert.equal(state.books[0].cardIds.length, 2);
  }
  stored = JSON.stringify(fixture);
  await loadLibrary();
  await importCards([{ word: "contract", definition: "合同" }], { bookId: "a" });
  await saveCard({ ...state.cards[0], note: "edited" }, "a");
  assert.equal(state.books[0].updatedAt, originalTime);
  failWrite = true;
  await assert.rejects(importCards([{ word: "cloud", definition: "云" }], { bookId: "a" }), /write failed/);
  assert.equal(state.books[0].updatedAt, originalTime);
  assert.equal(state.books[0].cardIds.length, 1);
});

test("importing changed meanings preserves card identity, learning progress and personal content", async () => {
  let stored = null;
  let failWrite = false;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      if (failWrite) throw new Error("write failed");
      stored = value;
    },
  };
  await loadLibrary();
  await importCards([{ word: "contract", definition: "n. 合同" }], { name: "A" });
  const [book] = state.books;
  await importCards([{ word: "contract", definition: "n. 合同" }], { name: "B" });
  const card = state.cards[0];
  await saveStudyResult(card, "learn", 3);
  await saveCard({ ...state.cards[0], note: "my note" }, book.id);
  const progress = { ...state.cards[0].progress };
  const changed = [{ word: "contract", definition: "v. 收缩" }];
  failWrite = true;
  await assert.rejects(importCards(changed, { bookId: book.id }), /write failed/);
  assert.equal(state.cards[0].senses[0].text, "合同");
  failWrite = false;
  await importCards(changed, { bookId: book.id });
  await loadLibrary();
  const saved = cardsInImportTarget(book.id)[0];
  assert.equal(saved.id, card.id);
  assert.equal(saved.senses[0].text, "收缩");
  assert.equal(saved.note, "my note");
  assert.deepEqual(saved.progress, progress);
  assert.equal(state.reviews.length, 1);
  assert.equal(cardsInImportTarget(state.books[1].id)[0].senses[0].text, "合同");
  await importCards([{ word: "contract", definition: "n. 契约" }], { bookId: book.id }, {
    resolutions: { contract: 0 },
  });
  assert.equal(cardsInImportTarget(book.id)[0].senses[0].text, "收缩");
});
