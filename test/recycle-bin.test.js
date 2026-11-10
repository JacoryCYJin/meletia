import test from "node:test";
import assert from "node:assert/strict";
import { state, loadLibrary, createBook, importCards, deleteCard, deleteBook, restoreTrash, purgeTrash, emptyTrash, cleanupTrash, updateSettings, saveStudyResult, previewImportUndo, saveLearnCheckpoint, updateBook, undoImportBatch } from "../src/core/library.js";
import { STORE_VERSION, migrateStore } from "../src/core/content.js";
import { DAY_MS, isTrashExpired } from "../src/core/recycle-bin.js";
import { createLearnSession } from "../src/core/session.js";

const clone = value => JSON.parse(JSON.stringify(value));
async function setup() {
  const values = new Map(); let fail = false;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error("write failed"); values.set(key, value); } };
  await loadLibrary();
  await createBook("原词书");
  await importCards([{ word: "contract", definition: "n. 合同" }, { word: "scope", definition: "n. 范围" }], { bookId: state.books[0].id });
  return { values, fail: value => { fail = value; } };
}

test("deleted card retains full content, mastery days and reviews across reload, restores once without affecting ongoing group", async () => {
  await setup();
  const book = clone(state.books[0]); const id = state.cards[0].id;
  await saveStudyResult(state.cards[0], "learn", 3);
  await saveLearnCheckpoint({ session: createLearnSession([state.cards[1]]) });
  const card = clone(state.cards[0]), reviews = clone(state.reviews), checkpoint = clone(state.learnCheckpoint), other = clone(state.cards[1]);
  const now = new Date();
  await deleteCard(id, book.id, now);
  const entry = clone(state.trash[0]);
  assert.equal(entry.retentionDays, 7);
  assert.equal(new Date(entry.expiresAt) - now, 7 * DAY_MS);
  assert.deepEqual(entry.cards, [card]); assert.deepEqual(entry.reviews, reviews);
  assert.equal(state.cards.length, 1); assert.equal(state.reviews.length, 0);
  await loadLibrary(); await restoreTrash(entry.id);
  assert.deepEqual(clone(state.cards.find(item => item.id === id)), card);
  assert.deepEqual(clone(state.reviews), reviews);
  assert.deepEqual([...state.books[0].cardIds], book.cardIds);
  assert.deepEqual(clone(state.cards.find(item => item.id === other.id)), other);
  assert.deepEqual(clone(state.learnCheckpoint), checkpoint);
  assert.equal(state.trash.length, 0);
  await assert.rejects(restoreTrash(entry.id), /已不存在/);
});

test("whole-book recovery preserves ownership, original metadata, disabled state and reversible import batches", async () => {
  await setup(); await updateBook(state.books[0].id, { active: false }); const book = clone(state.books[0]), cards = clone(state.cards), batch = clone(state.importBatches);
  await deleteBook(book.id);
  const entry = state.trash[0]; assert.equal(state.books.length, 0); assert.equal(state.cards.length, 0);
  await loadLibrary(); await restoreTrash(entry.id);
  assert.deepEqual(clone(state.books[0]), book); assert.deepEqual(clone(state.cards), cards);
  assert.deepEqual(clone(state.importBatches), batch);
  assert.deepEqual(previewImportUndo(batch[0].id).conflicts, []);
});

test("retention settings validate integers, survive reload and never retroactively shorten old entries", async () => {
  await setup(); const book = state.books[0];
  await deleteCard(state.cards[0].id, book.id); const old = clone(state.trash[0]);
  await updateSettings({ trashRetentionDays: 3 });
  await deleteCard(state.cards[0].id, book.id); assert.equal(state.trash[1].retentionDays, 3);
  assert.deepEqual(clone(state.trash[0]), old);
  for (const days of [0, -1, 366, 1.5, "7", null, NaN]) await assert.rejects(updateSettings({ trashRetentionDays: days }), /1–365/);
  await updateSettings({ trashRetentionDays: 365 }); await loadLibrary();
  assert.equal(state.settings.trashRetentionDays, 365); assert.deepEqual(clone(state.trash[0]), old);
});

test("expiry uses exact elapsed time, cannot be restored at deadline, cleans only expired entries and persists", async () => {
  const { values } = await setup(); const book = state.books[0], at = new Date();
  await deleteCard(state.cards[0].id, book.id, at); const id = state.trash[0].id;
  const deadline = new Date(at.getTime() + 7 * DAY_MS);
  assert.equal(isTrashExpired(state.trash[0], new Date(deadline.getTime() - 1)), false);
  await assert.rejects(restoreTrash(id, {}, deadline), /已到期/);
  await cleanupTrash(new Date(deadline.getTime() - 1)); assert.equal(state.trash.length, 1);
  await cleanupTrash(deadline); assert.equal(state.trash.length, 0);
  assert.equal(JSON.parse(values.get("meletia-preview")).trash.length, 0);
});

test("startup clears items that expired while app was closed, including archived book batches", async () => {
  const { values } = await setup(); await deleteBook(state.books[0].id, new Date(Date.now() - 8 * DAY_MS));
  assert.equal(state.importBatches.length, 1); await loadLibrary();
  assert.equal(state.trash.length, 0); assert.equal(state.importBatches.length, 0);
  assert.equal(JSON.parse(values.get("meletia-preview")).trash.length, 0);
});

test("delete, restore, permanent deletion, empty and cleanup are atomic on failed saves and allow retry", async () => {
  const { fail, values } = await setup();
  const snapshot = () => JSON.stringify({ cards: state.cards, books: state.books, reviews: state.reviews, trash: state.trash, batches: state.importBatches });
  let before = snapshot(), saved = values.get("meletia-preview"); fail(true);
  await assert.rejects(deleteCard(state.cards[0].id, state.books[0].id), /write failed/);
  await assert.rejects(deleteBook(state.books[0].id), /write failed/);
  assert.equal(snapshot(), before); assert.equal(values.get("meletia-preview"), saved); fail(false);
  await deleteCard(state.cards[0].id, state.books[0].id); const id = state.trash[0].id;
  before = snapshot(); saved = values.get("meletia-preview"); fail(true);
  for (const operation of [() => restoreTrash(id), () => purgeTrash(id), () => emptyTrash(), () => cleanupTrash(new Date(Date.now() + 8 * DAY_MS))]) {
    await assert.rejects(operation(), /write failed/); assert.equal(snapshot(), before); assert.equal(values.get("meletia-preview"), saved); assert.equal(state.busy, false);
  }
  fail(false); await restoreTrash(id); assert.equal(state.cards.length, 2);
});

test("same-term imports block recovery without overriding later progress or content", async () => {
  await setup(); const book = state.books[0], term = state.cards[0].term;
  await deleteCard(state.cards[0].id, book.id); const id = state.trash[0].id;
  await importCards([{ word: term, definition: "新版释义" }], { bookId: book.id });
  await saveStudyResult(state.cards.find(card => card.term === term), "learn", 3);
  const before = JSON.stringify(state.cards);
  await assert.rejects(restoreTrash(id), /已有同名词条/);
  assert.equal(JSON.stringify(state.cards), before); assert.equal(state.trash.length, 1);
});

test("recreated book has distinct ID; restore name conflicts are explicit and renamed restore keeps batch identity", async () => {
  await setup(); const original = clone(state.books[0]); await deleteBook(original.id); const id = state.trash[0].id;
  await createBook(original.name); assert.notEqual(state.books[0].id, original.id);
  await assert.rejects(restoreTrash(id), /同名词书/);
  await restoreTrash(id, { bookName: "找回的词书" });
  assert.equal(state.books.find(book => book.id === original.id).name, "找回的词书");
  assert.deepEqual(previewImportUndo(state.importBatches[0].id).conflicts, []);
});

test("separately deleted child requires parent recovery first, then restores original state", async () => {
  await setup(); const book = clone(state.books[0]); const card = clone(state.cards[0]);
  await deleteCard(card.id, book.id); const childId = state.trash[0].id;
  await deleteBook(book.id); const parentId = state.trash[1].id;
  await assert.rejects(restoreTrash(childId), /先恢复原词书/);
  await restoreTrash(parentId); assert.equal(state.cards.length, 1);
  await restoreTrash(childId); assert.equal(state.cards.length, 2); assert.deepEqual(clone(state.cards.find(item => item.id === card.id)), card);
});

test("orphaned child can restore into another existing book after permanent removal of parent", async () => {
  await setup(); const book = state.books[0], card = clone(state.cards[0]);
  await deleteCard(card.id, book.id); const childId = state.trash[0].id;
  await deleteBook(book.id); await purgeTrash(state.trash[1].id);
  await assert.rejects(restoreTrash(childId), /选择恢复/);
  await createBook("接收词书"); const target = state.books[0];
  await restoreTrash(childId, { targetBookId: target.id });
  assert.deepEqual(clone(state.cards[0]), card); assert.deepEqual([...state.books[0].cardIds], [card.id]);
});

test("purge and empty preserve active books and unrelated trash", async () => {
  await setup(); const book = state.books[0];
  await deleteCard(state.cards[0].id, book.id); await deleteCard(state.cards[0].id, book.id);
  const id = state.trash[0].id; await purgeTrash(id); assert.equal(state.trash.length, 1);
  await emptyTrash(); assert.equal(state.trash.length, 0); assert.equal(state.books.length, 1);
  assert.equal(state.books[0].cardIds.length, 0);
});

test("version 7 upgrade backs up original data, defaults to seven days and never fabricates deleted content", async () => {
  const { values } = await setup(); const old = JSON.parse(values.get("meletia-preview"));
  old.version = 7; delete old.trash; delete old.settings.trashRetentionDays;
  const raw = JSON.stringify(old); values.set("meletia-preview", raw); await loadLibrary();
  assert.equal(values.get(`meletia-preview-before-v${STORE_VERSION}`), raw);
  assert.deepEqual([...state.trash], []); assert.equal(state.settings.trashRetentionDays, 7);
  assert.equal(migrateStore(raw).trash.length, 0); assert.equal(state.cards.length, old.cards.length);
});


test("restoring a book preserves already-undone batch restrictions instead of enabling another undo", async () => {
  await setup(); const id = state.importBatches[0].id, bookId = state.books[0].id;
  await undoImportBatch(id); await deleteBook(bookId); await restoreTrash(state.trash[0].id);
  await assert.rejects(undoImportBatch(id), /已撤销/);
  assert.equal(state.cards.length, 0);
});
