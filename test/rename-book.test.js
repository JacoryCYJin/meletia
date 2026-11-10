import assert from "node:assert/strict";
import test from "node:test";
import { state, loadLibrary, createBook, renameBook, importCards, undoImportBatch, saveStudyResult, saveLearnCheckpoint, previewImportUndo } from "../src/core/library.js";
import { createLearnSession } from "../src/core/session.js";
import { todayBrowseCards } from "../src/core/browse.js";

async function setup() {
  const values = new Map(); let fail = false;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error("write failed"); values.set(key, value); } };
  await loadLibrary(); await createBook("原词书");
  return { values, fail: value => { fail = value; } };
}
const stableBook = ({name, updatedAt, ...rest}) => rest;

test("rename trims the name, persists, and preserves IDs, cards, progress, checkpoint and import batches", async () => {
  await setup(); const id = state.books[0].id;
  await importCards([{word:"fresh",definition:"新词"},{word:"reviewed",definition:"已学词"}], {bookId:id});
  await saveStudyResult(state.cards[1], "learn", 3);
  await saveLearnCheckpoint({session:createLearnSession([state.cards[0]])});
  const before = { book: JSON.stringify(stableBook(state.books[0])), cards:JSON.stringify(state.cards), batches:JSON.stringify(state.importBatches), reviews:JSON.stringify(state.reviews), checkpoint:JSON.stringify(state.learnCheckpoint), count:todayBrowseCards(state.books[0],state.cards,state.importBatches).length };
  await renameBook(id, "  新名称  "); await loadLibrary();
  assert.equal(state.books[0].name, "新名称"); assert.equal(state.books[0].id,id);
  assert.equal(JSON.stringify(stableBook(state.books[0])),before.book);
  assert.equal(JSON.stringify(state.cards),before.cards);
  assert.equal(JSON.stringify(state.importBatches),before.batches);
  assert.equal(JSON.stringify(state.reviews),before.reviews);
  assert.equal(JSON.stringify(state.learnCheckpoint),before.checkpoint);
  assert.equal(todayBrowseCards(state.books[0],state.cards,state.importBatches).length,before.count);
  assert.deepEqual(previewImportUndo(state.importBatches[0].id).conflicts,[]);
  await undoImportBatch(state.importBatches[0].id);
  assert.equal(state.books[0].name,"新名称");assert.equal(state.cards.length,0);
});

test("empty, duplicate and missing-book renames fail without changing the saved library; unchanged names are no-ops", async () => {
  const {values}=await setup();await createBook("另一本");const id=state.books[0].id;
  const before=values.get("meletia-preview");
  for(const name of ["", "  ", "\n\t"])await assert.rejects(renameBook(id,name),/请输入词书名称/);
  await assert.rejects(renameBook(id,"  另一本  "),/同名/);
  await assert.rejects(renameBook("missing","新名"),/不存在/);
  await renameBook(id,"  原词书  ");
  assert.equal(values.get("meletia-preview"),before);
});

test("old names can be reused after rename without changing existing book IDs", async () => {
  await setup();const firstId=state.books[0].id;
  await renameBook(firstId,"新名称");await createBook("原词书");const secondId=state.books[1].id;
  assert.notEqual(secondId,firstId);assert.equal(state.books[0].id,firstId);
  await renameBook(secondId,"第三个名称");await createBook("原词书");
  assert.equal(new Set(state.books.map(b=>b.id)).size,3);
  assert.equal(state.books[2].name,"原词书");
  await assert.rejects(createBook("原词书"),/同名/);
});

test("failed rename saves leave names, update times and storage unchanged, and retry succeeds", async () => {
  const {values,fail}=await setup();const id=state.books[0].id;
  const before=JSON.stringify(state.books),stored=values.get("meletia-preview");fail(true);
  await assert.rejects(renameBook(id,"未保存"),/write failed/);
  assert.equal(JSON.stringify(state.books),before);assert.equal(values.get("meletia-preview"),stored);fail(false);
  await renameBook(id,"成功保存");await loadLibrary();assert.equal(state.books[0].name,"成功保存");
});
