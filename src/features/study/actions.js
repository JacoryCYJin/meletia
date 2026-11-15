import { toRaw } from "vue";
import { cardById, commit, state } from "../../storage/store.js";
import { withStudyAttempt } from "./mastery.js";
import { graduate, missSpelling, reviewCard } from "./progress.js";

export async function saveLearnCheckpoint(learnCheckpoint) {
  await commit({ learnCheckpoint });
}

export async function saveStudyAttempt(
  cardId,
  rating,
  now = new Date(),
  learnCheckpoint,
  mastered,
) {
  const card = cardById(cardId);
  if (!card) throw new Error("词条已不存在。");
  const updated = withStudyAttempt(card, rating, now, mastered);
  await commit({
    cards: state.cards.map((item) => (item.id === cardId ? updated : item)),
    learnCheckpoint,
  });
}

export async function saveStudyResult(
  card,
  stage,
  rating,
  now = new Date(),
  learnCheckpoint,
  { mastered } = {},
) {
  let updated = {
    learn: graduate,
    review: (item, at) => reviewCard(item, rating, at),
    spell: missSpelling,
  }[stage](card, now);
  if (typeof mastered === "boolean") {
    updated = withStudyAttempt(updated, rating, now, mastered);
  }
  const record = {
    cardId: card.id,
    at: now.toISOString(),
    stage,
    rating,
  };
  await commit({
    cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
    reviews: [...state.reviews, record],
    learnCheckpoint,
  });
  return {
    record,
    previousProgress: card.progress,
    savedProgress: updated.progress,
  };
}

export async function undoStudyResult(
  { record, previousProgress, savedProgress },
  learnCheckpoint,
) {
  const card = cardById(record.cardId);
  const index = state.reviews.findIndex((entry) => toRaw(entry) === record);
  if (!card || toRaw(card.progress) !== savedProgress || index < 0) {
    throw new Error("学习进度已经变化，无法返回上一词。");
  }

  const cards = state.cards.map((item) =>
    item.id === card.id ? { ...item, progress: previousProgress } : item,
  );
  const reviews = state.reviews.slice();
  reviews.splice(index, 1);
  await commit({ cards, reviews, learnCheckpoint });
}
