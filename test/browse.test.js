import assert from "node:assert/strict";
import test from "node:test";
import { newCard, localDay, STORE_VERSION } from "../src/core/content.js";
import { todayBrowseCards, createBrowseSession, moveBrowse } from "../src/core/browse.js";
import { state, loadLibrary, saveCard, importCards, undoImportBatch, saveStudyResult, saveStudyAttempt } from "../src/core/library.js";
import { studyExport } from "../src/core/study-export.js";

const today = new Date(2026, 10, 10, 20);
const yesterday = new Date(2026, 10, 9, 20);
const tomorrow = new Date(2026, 10, 11, 20);
const oldCard = word => newCard({ word, definition: "释义" }, yesterday);
const makeBook = cards => ({ id: "book", name: "词书", createdAt: yesterday.toISOString(), cardIds: cards.map(c => c.id), active: true });
const batch = (at, added = [], updated = [], patch = {}) => ({ createdAt: at.toISOString(), status: "imported", added, updated, ...patch });

async function withTime(at, run) {
  const Original = globalThis.Date;
  globalThis.Date = class extends Original {
    constructor(...args) { super(...(args.length ? args : [at.getTime()])); }
    static now() { return at.getTime(); }
  };
  try { return await run(); } finally { globalThis.Date = Original; }
}
async function setup(cards, batches = []) {
  const values = new Map(); let fail = false;
  const book = makeBook(cards);
  values.set("meletia-preview", JSON.stringify({ version: STORE_VERSION, cards, books: [book], reviews: [], importBatches: batches }));
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error("write failed"); values.set(key, value); } };
  await loadLibrary();
  return { book: state.books[0], values, fail: value => { fail = value; } };
}

test("daily browse includes only additions once in book order, excluding old edits, import updates and reviews", () => {
  const fresh = newCard({ word: "new", definition: "释义" }, today);
  const edited = { ...oldCard("edited"), editedAt: today.toISOString() };
  const updated = oldCard("updated"), imported = oldCard("imported");
  const studied = oldCard("studied"); studied.progress = { ...studied.progress, studiedAt: today.toISOString(), lastSeenAt: today.toISOString(), stage: "reviewing" };
  const other = newCard({ word: "new", definition: "另一本" }, today);
  const cards = [fresh, edited, updated, imported, studied, other];
  const book = makeBook(cards.slice(0, 5)); book.cardIds.push(fresh.id, "deleted");
  const batches = [batch(today, [imported], [updated]), batch(today, [fresh], [updated]), batch(yesterday, [studied]), batch(today, [studied], [], { status: "undone" }), batch(today)];
  const input = JSON.stringify({ book, cards, batches });
  assert.deepEqual(todayBrowseCards(book, cards, batches, today).map(c => c.term), ["new", "imported"]);
  assert.equal(JSON.stringify({ book, cards, batches }), input);
});

test("ownership follows the current book, including moved cards, and ignores absent cards and invalid dates", () => {
  const moved = oldCard("moved"), untouched = oldCard("untouched");
  moved.createdAt = "invalid"; moved.editedAt = "invalid";
  const book = makeBook([moved, untouched]);
  const batches = [batch(today, [moved], [], { bookId: "old-book", invalidated: "merged" }), batch(tomorrow, [untouched]), { ...batch(today, [untouched]), createdAt: "invalid" }];
  assert.deepEqual(todayBrowseCards(book, [moved, untouched], batches, today).map(c => c.id), [moved.id]);
  assert.deepEqual(todayBrowseCards(null, [moved], batches, today), []);
});

test("local midnight selects content activity by calendar date", () => {
  const before = new Date(2026, 10, 10, 23, 59, 59);
  const after = new Date(2026, 10, 11, 0, 0, 0);
  const card = newCard({ word: "midnight", definition: "释义" }, before);
  assert.equal(todayBrowseCards(makeBook([card]), [card], [], before).length, 1);
  assert.equal(todayBrowseCards(makeBook([card]), [card], [], after).length, 0);
  assert.equal(localDay(after), "2026-11-11");
});

test("browse sessions snapshot content, support previous after completion and never mutate the input", () => {
  const cards = [oldCard("first"), oldCard("second")];
  let session = createBrowseSession(cards);
  cards[0].note = "later edit"; cards.push(oldCard("later addition"));
  assert.equal(session.cards.length, 2); assert.equal(session.cards[0].note, "");
  assert.equal(moveBrowse(session, -1).index, 0);
  session = moveBrowse(session, 1); session = moveBrowse(session, 1);
  assert.equal(session.index, 2); assert.equal(moveBrowse(session, 1).index, 2);
  assert.equal(moveBrowse(session, -1).cards[1].term, "second");
  assert.equal(moveBrowse(createBrowseSession([]), 1).index, 0);
});

test("manual edits survive reload; no-op saves and study updates do not count as content changes", async () => {
  const { book } = await setup([oldCard("old")]);
  await withTime(today, () => saveCard({ ...state.cards[0], note: "edited" }, book.id));
  const editedAt = state.cards[0].editedAt;
  assert.equal(editedAt, today.toISOString());
  await loadLibrary(); assert.equal(state.cards[0].editedAt, editedAt);
  assert.equal(todayBrowseCards(state.books[0], state.cards, state.importBatches, today).length, 0);
  await withTime(tomorrow, () => saveCard(JSON.parse(JSON.stringify(state.cards[0])), book.id));
  await saveStudyResult(state.cards[0], "learn", 3, tomorrow);
  await saveStudyAttempt(state.cards[0].id, 1, tomorrow);
  await withTime(tomorrow, () => saveCard({ ...state.cards[0], progress: { ...state.cards[0].progress, lapses: 99 } }, book.id));
  assert.equal(state.cards[0].editedAt, editedAt);
  assert.equal(todayBrowseCards(state.books[0], state.cards, state.importBatches, tomorrow).length, 0);
  await withTime(tomorrow, () => saveCard(newCard({ word: "manual", definition: "手工新增" }, yesterday), book.id));
  assert.deepEqual(todayBrowseCards(state.books[0], state.cards, state.importBatches, tomorrow).map(c => c.term), ["manual"]);
});

test("import rollback removes additions; updates and manual changes remain excluded", async () => {
  const { book } = await setup([oldCard("old")]);
  await withTime(today, () => importCards([{ word: "old", definition: "导入更新" }, { word: "new", definition: "导入新增" }], { bookId: book.id }));
  assert.equal(todayBrowseCards(state.books[0], state.cards, state.importBatches, today).length, 1);
  await undoImportBatch(state.importBatches[0].id);
  assert.equal(todayBrowseCards(state.books[0], state.cards, state.importBatches, today).length, 0);
  await withTime(today, () => importCards([{ word: "old", definition: "再次更新" }], { bookId: book.id }));
  const latest = state.importBatches.at(-1).id;
  await withTime(today, () => saveCard({ ...state.cards[0], note: "独立手动编辑" }, book.id));
  await undoImportBatch(latest); await loadLibrary();
  assert.equal(state.cards[0].senses[0].text, "释义");
  assert.equal(state.cards[0].note, "独立手动编辑");
  assert.equal(todayBrowseCards(state.books[0], state.cards, state.importBatches, today).length, 0);
});

test("old data and import snapshots without edit metadata remain compatible, and failed saves do not alter content history", async () => {
  const old = oldCard("legacy"); delete old.editedAt;
  const legacy = { ...old, progress: { ...old.progress } };
  const b = { ...batch(yesterday, [legacy]), id: "legacy-batch", bookId: "book", bookCreatedAt: yesterday.toISOString() };
  const { book, fail } = await setup([old], [b]);
  assert.equal(state.cards[0].editedAt, null);
  assert.equal(todayBrowseCards(book, state.cards, state.importBatches, today).length, 0);
  const before = JSON.stringify(state.cards); fail(true);
  await assert.rejects(withTime(today, () => saveCard({ ...state.cards[0], note: "not saved" }, book.id)), /write failed/);
  assert.equal(JSON.stringify(state.cards), before); fail(false);
  await undoImportBatch("legacy-batch"); assert.equal(state.cards.length, 0);
});

test("browsing leaves the full saved library and daily state export unchanged", async () => {
  const { values } = await setup([newCard({ word: "today", definition: "释义" }, today)]);
  const before = values.get("meletia-preview");
  const beforeState = JSON.stringify(state);
  const beforeExport = studyExport(state.cards, state.books, state.reviews, today).csv;
  let session = createBrowseSession(todayBrowseCards(state.books[0], state.cards, state.importBatches, today));
  session = moveBrowse(session, 1); session = moveBrowse(session, -1); session = moveBrowse(session, 1);
  assert.equal(values.get("meletia-preview"), before);
  assert.equal(JSON.stringify(state), beforeState);
  assert.equal(studyExport(state.cards, state.books, state.reviews, today).csv, beforeExport);
});

 test("today additions remain eligible after editing and learning, but next-day edits never re-add them", () => {
  const c = newCard({word: "fresh", definition: "释义"}, today);
  c.editedAt = tomorrow.toISOString();
  c.progress.stage = "mastered";
  const book = makeBook([c]);
  const updates = [batch(tomorrow, [], [c])];
  assert.equal(todayBrowseCards(book, [c], updates, today).length, 1);
  assert.equal(todayBrowseCards(book, [c], updates, tomorrow).length, 0);
});
