import assert from "node:assert/strict";
import test from "node:test";
import { STORE_VERSION, migrateStore } from "../src/core/content.js";
import {
  state,
  loadLibrary,
  createBook,
  importCards,
  saveCard,
  saveStudyResult,
  saveLearnCheckpoint,
  previewImportUndo,
  undoImportBatch,
  deleteCard,
  mergeBooks,
  deleteBook,
} from "../src/core/library.js";
import { createLearnSession } from "../src/core/session.js";

async function setup() {
  const values = new Map();
  let fail = false;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new Error("write failed");
      values.set(key, value);
    },
  };
  await loadLibrary();
  await createBook("原词书");
  const book = state.books[0];
  await importCards([{ word: "contract", definition: "合同" }], {
    bookId: book.id,
  });
  return {
    book,
    values,
    fail: (value) => {
      fail = value;
    },
  };
}
const row = (word, definition) => ({ word, definition });
const latest = () => state.importBatches.at(-1);

test("batch undo persists, removes only additions and restores old meanings while preserving personal content and progress", async () => {
  const { book } = await setup();
  const original = state.cards[0];
  await importCards(
    [row("contract", "契约"), row("scope", "范围"), row("scope", "范围")],
    { bookId: book.id },
    { fileName: "词表.csv" },
  );
  const id = latest().id;
  assert.equal(latest().duplicates, 1);
  await saveStudyResult(state.cards[0], "learn", 3);
  await saveCard(
    { ...state.cards[0], note: "保留我的笔记", tags: ["personal"] },
    book.id,
  );
  const progress = JSON.parse(JSON.stringify(state.cards[0].progress));
  await saveStudyResult(state.cards[1], "learn", 3);
  await loadLibrary();
  assert.equal(latest().fileName, "词表.csv");
  assert.deepEqual(previewImportUndo(id).conflicts, []);
  assert.equal(previewImportUndo(id).reviewCount, 1);
  assert.equal(previewImportUndo(id).learnedCount, 1);
  await undoImportBatch(id);
  await loadLibrary();
  assert.equal(state.cards.length, 1);
  assert.equal(state.cards[0].id, original.id);
  assert.equal(state.cards[0].senses[0].text, "合同");
  assert.equal(state.cards[0].note, "保留我的笔记");
  assert.deepEqual(state.cards[0].tags, ["personal"]);
  assert.deepEqual(state.cards[0].progress, progress);
  assert.equal(state.reviews.length, 1);
  assert.equal(latest().status, "undone");
  await assert.rejects(undoImportBatch(id), /已撤销/);
});

test("failed import and failed undo keep the entire saved and in-memory state unchanged", async () => {
  const { book, values, fail } = await setup();
  const before = values.get("meletia-preview");
  const previous = JSON.stringify({
    cards: state.cards,
    batches: state.importBatches,
  });
  fail(true);
  await assert.rejects(
    importCards([row("scope", "范围")], { bookId: book.id }),
    /write failed/,
  );
  assert.equal(
    JSON.stringify({ cards: state.cards, batches: state.importBatches }),
    previous,
  );
  assert.equal(values.get("meletia-preview"), before);
  fail(false);
  await importCards([row("scope", "范围")], { bookId: book.id });
  const saved = values.get("meletia-preview");
  const snapshot = JSON.stringify({
    cards: state.cards,
    batches: state.importBatches,
  });
  fail(true);
  await assert.rejects(undoImportBatch(latest().id), /write failed/);
  assert.equal(
    JSON.stringify({ cards: state.cards, batches: state.importBatches }),
    snapshot,
  );
  assert.equal(values.get("meletia-preview"), saved);
  assert.equal(state.busy, false);
});

test("overlapping later batches must be undone first, unrelated batches and other books survive", async () => {
  const { book } = await setup();
  const first = latest().id;
  await importCards([row("contract", "契约")], { bookId: book.id });
  const second = latest().id;
  await importCards([row("river", "河流")], { bookId: book.id });
  await importCards([row("contract", "其他词书")], { name: "其他词书" });
  await assert.rejects(undoImportBatch(first), /后续批次/);
  await undoImportBatch(second);
  await undoImportBatch(first);
  assert.deepEqual(state.cards.map((card) => card.term).sort(), [
    "contract",
    "river",
  ]);
  assert.equal(
    state.cards.find((card) => card.term === "contract").senses[0].text,
    "其他词书",
  );
});

test("editing or deleting affected content blocks the whole undo without partially removing additions", async () => {
  const { book } = await setup();
  await importCards([row("contract", "契约"), row("scope", "范围")], {
    bookId: book.id,
  });
  const id = latest().id;
  await saveCard(
    { ...state.cards[0], senses: [{ pos: "", text: "手工释义" }] },
    book.id,
  );
  await assert.rejects(undoImportBatch(id), /已被修改/);
  assert.equal(state.cards.length, 2);
  await deleteCard(state.cards[0].id, book.id);
  await assert.rejects(undoImportBatch(id), /已删除/);
  assert.equal(state.cards.length, 1);
  await saveCard({ ...state.cards[0], note: "新增词的后续编辑" }, book.id);
  assert.ok(
    previewImportUndo(id).conflicts.some((message) => message.includes("内容")),
  );
});

test("merging a target book invalidates its batches even when the primary book remains", async () => {
  const { book } = await setup();
  const id = latest().id;
  await importCards([row("river", "河流")], { name: "待合并" });
  await mergeBooks(book.id, state.books[1].id);
  await loadLibrary();
  await assert.rejects(undoImportBatch(id), /参与过合并/);
});

test("undo keeps a newly imported book empty, and a deleted and recreated book cannot reuse old batches", async () => {
  await setup();
  await importCards([row("river", "河流")], { name: "新词书" });
  const id = latest().id;
  const book = state.books[1];
  await undoImportBatch(id);
  assert.equal(
    state.books.find((item) => item.id === book.id).cardIds.length,
    0,
  );
  await deleteBook(book.id);
  await createBook("新词书");
  await assert.rejects(undoImportBatch(id), /已撤销/);
});

test("duplicate-only imports retain a zero-change batch without altering the book update time", async () => {
  const { book } = await setup();
  const updated = state.books[0].updatedAt;
  assert.equal(
    await importCards([row("contract", "合同")], { bookId: book.id }),
    0,
  );
  assert.equal(latest().added.length, 0);
  assert.equal(latest().updated.length, 0);
  assert.equal(latest().duplicates, 1);
  assert.equal(state.books[0].updatedAt, updated);
});

test("version 6 migration makes a backup and does not fabricate historical batches", async () => {
  const { values } = await setup();
  const old = JSON.stringify({
    ...JSON.parse(values.get("meletia-preview")),
    version: 6,
    importBatches: undefined,
  });
  values.set("meletia-preview", old);
  await loadLibrary();
  assert.equal(values.get(`meletia-preview-before-v${STORE_VERSION}`), old);
  assert.equal(
    JSON.parse(values.get("meletia-preview")).version,
    STORE_VERSION,
  );
  assert.deepEqual(state.importBatches, []);
  assert.equal(state.cards[0].term, "contract");
  assert.deepEqual(migrateStore(old).importBatches, []);
});

test("undo prunes removed words from saved learning checkpoints and preserves remaining words", async () => {
  const { book } = await setup();
  await importCards([row("scope", "范围")], { bookId: book.id });
  const id = latest().id;
  await saveLearnCheckpoint({ session: createLearnSession(state.cards) });
  await undoImportBatch(id);
  assert.equal(state.learnCheckpoint.session.total, 1);
  assert.deepEqual(
    state.learnCheckpoint.session.queue.map((entry) => entry.id),
    [state.cards[0].id],
  );
  await undoImportBatch(state.importBatches[0].id);
  assert.equal(state.learnCheckpoint, null);
});
