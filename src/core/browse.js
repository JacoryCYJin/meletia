import { localDay } from "./content.js";

function onDay(value, day) {
  if (!value) return false;
  const at = new Date(value);
  return Number.isFinite(at.getTime()) && localDay(at) === day;
}

// Only additions are eligible. Edits, study progress and review logs are never consulted.
export function todayBrowseCards(book, cards, importBatches, now = new Date()) {
  const day = localDay(now);
  const imported = new Set();
  for (const batch of importBatches) {
    if (batch.status === "undone" || !onDay(batch.createdAt, day)) continue;
    for (const card of batch.added) imported.add(card.id);
  }
  const byId = new Map(cards.map(card => [card.id, card]));
  const seen = new Set();
  return (book?.cardIds ?? []).flatMap(id => {
    const card = byId.get(id);
    if (!card || seen.has(id)) return [];
    seen.add(id);
    return imported.has(id) || onDay(card.createdAt, day)
      ? [card] : [];
  });
}

export function createBrowseSession(cards) {
  // Freeze the day's selection and content without retaining mutable library references.
  return { cards: JSON.parse(JSON.stringify(cards)), index: 0 };
}

export function moveBrowse(session, direction) {
  return {
    ...session,
    index: Math.max(0, Math.min(session.cards.length, session.index + direction)),
  };
}
