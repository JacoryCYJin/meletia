import { cardById, commit, state } from "../../storage/store.js";
import { trashSnapshot } from "../trash/model.js";
import { requireBook } from "../books/actions.js";
import { bookCards } from "../books/model.js";
import { wordKey } from "./model.js";

function contentWithoutProgress(card) {
  const { progress, dictation, editedAt, ...content } = card;
  return content;
}

export async function saveCard(card, bookId) {
  const book = requireBook(bookId);
  const existing = cardById(card.id);
  if (existing && !book.cardIds.includes(card.id)) {
    throw new Error("词条不属于这本词书。");
  }
  const term = wordKey(card.term);
  if (
    (!existing || wordKey(existing.term) !== term) &&
    bookCards(book, state.cards).some((item) => wordKey(item.term) === term)
  ) {
    throw new Error("这本词书里已有同名词条。");
  }
  const contentChanged =
    !existing ||
    JSON.stringify(contentWithoutProgress(existing)) !==
      JSON.stringify(contentWithoutProgress(card));
  // Imports have their own reversible batch timestamps; this records manual content edits only.
  const saved = {
    ...card,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    editedAt: contentChanged
      ? new Date().toISOString()
      : existing.editedAt ?? null,
  };
  const cards = existing
    ? state.cards.map((item) => (item.id === card.id ? saved : item))
    : [...state.cards, saved];

  await commit({
    cards,
    books: existing
      ? state.books
      : state.books.map((item) =>
          item.id === bookId
            ? {
                ...item,
                cardIds: [...item.cardIds, card.id],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
  });
}

export async function deleteCard(cardId, bookId, now = new Date()) {
  const book = requireBook(bookId);
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || !book.cardIds.includes(cardId)) {
    throw new Error("词条不属于这本词书。");
  }
  const entry = trashSnapshot(state, "card", book, [card], now);
  await commit({
    trash: [...state.trash, entry],
    cards: state.cards.filter((card) => card.id !== cardId),
    books: state.books.map((item) =>
      item.id === bookId
        ? { ...item, cardIds: item.cardIds.filter((id) => id !== cardId) }
        : item,
    ),
    reviews: state.reviews.filter((review) => review.cardId !== cardId),
  });
}
