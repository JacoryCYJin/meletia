import { commit, state } from "../../storage/store.js";
import { withDictationAttempt } from "./model.js";

export async function saveDictationResult(card, correct, now = new Date()) {
  const updated = withDictationAttempt(card, correct ? 3 : 1, now);
  const record = {
    cardId: card.id,
    at: now.toISOString(),
    stage: "dictation",
    rating: correct ? 3 : 1,
  };
  await commit({
    cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
    reviews: [...state.reviews, record],
  });
  return { record, card: updated };
}
