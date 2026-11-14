import assert from "node:assert/strict";
import test from "node:test";
import { newCard } from "../src/core/content.js";
import {
  deleteBook,
  loadLibrary,
  mergeBooks,
  restoreTrash,
  state,
} from "../src/core/library.js";

function useStorage(t, build) {
  let raw = JSON.stringify(build());
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
  return () => JSON.parse(raw);
}

function twoBooks() {
  const first = newCard({ word: "scope", definition: "范围" });
  const second = newCard({ word: "contract", definition: "合同" });
  return {
    version: 8,
    cards: [first, second],
    reviews: [],
    books: [
      {
        id: "dictation",
        name: "听写书",
        cardIds: [first.id],
        active: true,
        recite: false,
        dictation: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "recite",
        name: "背诵书",
        cardIds: [second.id],
        active: true,
        recite: true,
        dictation: false,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  };
}

test("merging into an existing book keeps its two practice switches", async (t) => {
  useStorage(t, twoBooks);
  await loadLibrary();

  const merged = await mergeBooks("dictation", "recite");
  assert.equal(merged.recite, false);
  assert.equal(merged.dictation, true);
  assert.equal(state.books.length, 1);
});

test("merging into a new book starts from the default switches", async (t) => {
  useStorage(t, twoBooks);
  await loadLibrary();

  const merged = await mergeBooks("dictation", "recite", "合并书");
  assert.equal(merged.recite, true);
  assert.equal(merged.dictation, false);
});

test("restoring a deleted book preserves its practice switches", async (t) => {
  useStorage(t, twoBooks);
  await loadLibrary();

  await deleteBook("dictation");
  const entry = state.trash.at(-1);
  await restoreTrash(entry.id);

  const restored = state.books.find((book) => book.name === "听写书");
  assert.equal(restored.recite, false);
  assert.equal(restored.dictation, true);
});
