import { bookId, normalizeBook } from "../features/books/model.js";
import {
  newCardId,
  normalizeCard,
  sourcesOf,
  wordKey,
} from "../features/library/model.js";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
} from "../features/settings/model.js";

export const STORE_VERSION = 8;

function buildBooks(cards, rawBooks, legacy) {
  if (Array.isArray(rawBooks) && (rawBooks.length || !legacy)) {
    return rawBooks
      .filter((book) => book && Array.isArray(book.cardIds))
      .map((book) => normalizeBook(book, legacy));
  }

  if (!legacy) return [];

  const groups = new Map();
  for (const card of cards) {
    const names = sourcesOf(card);
    for (const name of names.length ? names : ["未分类"]) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(card.id);
    }
  }

  return [...groups.entries()].map(([name, cardIds]) =>
    normalizeBook(
      {
        id: bookId(name),
        name,
        source: name,
        legacy: true,
        cardIds,
        active: true,
        recite: true,
        dictation: false,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      },
      legacy,
    ),
  );
}

export function migrateStore(raw, now = new Date()) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || !Array.isArray(data.cards)) {
    throw new Error("词库格式无法读取。");
  }

  const legacy = (data.version ?? 0) < 5;
  const byTerm = new Set();
  const byId = new Set();
  const cards = [];
  for (const entry of data.cards) {
    const card = normalizeCard(entry, now);
    if (!card.term) continue;
    const key = wordKey(card.term);
    if (byId.has(card.id) || ((data.version ?? 0) < 4 && byTerm.has(key))) {
      continue;
    }
    byId.add(card.id);
    byTerm.add(key);
    cards.push(card);
  }

  const byCardId = new Map(cards.map((card) => [card.id, card]));
  const owned = new Map();
  const books = buildBooks(cards, data.books, legacy).map((book) => {
    const cardIds = [];
    for (const id of new Set(book.cardIds)) {
      const card = byCardId.get(id);
      if (!card) continue;
      let ownedCard = card;
      if (owned.has(id)) {
        // The first book keeps the original ID and its historical review log.
        let copyId = newCardId();
        while (byCardId.has(copyId) || owned.has(copyId)) copyId = newCardId();
        ownedCard = { ...card, id: copyId };
      }
      owned.set(ownedCard.id, ownedCard);
      cardIds.push(ownedCard.id);
    }
    return { ...book, cardIds };
  });

  return {
    version: STORE_VERSION,
    settings: normalizeSettings(data.settings ?? {}),
    cards: [...owned.values()],
    books,
    reviews: Array.isArray(data.reviews)
      ? data.reviews.filter((review) => review?.at && owned.has(review.cardId))
      : [],
    learnCheckpoint: data.learnCheckpoint ?? null,
    importBatches: Array.isArray(data.importBatches) ? data.importBatches : [],
    trash: Array.isArray(data.trash) ? data.trash : [],
    migrated: data.version !== STORE_VERSION,
  };
}

export function emptyStore() {
  return {
    version: STORE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    cards: [],
    books: [],
    reviews: [],
    learnCheckpoint: null,
    importBatches: [],
    trash: [],
    migrated: false,
  };
}
