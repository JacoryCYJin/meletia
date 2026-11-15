import { senseLine, wordKey } from "../library/model.js";

export function meaningChoices(card, cards) {
  const partsOf = ({ text }) =>
    text
      .normalize("NFKC")
      .toLowerCase()
      .split(/[，、,；;。/]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  const correct = card.senses.find((sense) => partsOf(sense).length);
  if (!correct) return [];

  const seen = new Set(card.senses.flatMap(partsOf));
  const samePartOfSpeech = [];
  const otherPartsOfSpeech = [];
  const term = wordKey(card.term);
  for (const item of cards) {
    if (item.id === card.id || wordKey(item.term) === term) continue;
    const candidates = item.senses
      .map((sense) => ({ sense, parts: partsOf(sense), term: item.term }))
      .filter(
        ({ parts }) => parts.length && parts.every((part) => !seen.has(part)),
      );
    const matching = candidates.filter(
      ({ sense }) =>
        sense.pos.toLowerCase() === correct.pos.toLowerCase(),
    );
    if (matching.length) samePartOfSpeech.push(matching);
    else if (candidates.length) otherPartsOfSpeech.push(candidates);
  }

  const choices = [
    { text: senseLine(correct), term: card.term, correct: true },
  ];
  for (const pool of [samePartOfSpeech, otherPartsOfSpeech]) {
    while (pool.length && choices.length < 4) {
      const pick = Math.floor(Math.random() * pool.length);
      const [candidates] = pool.splice(pick, 1);
      const choice = candidates.find(({ parts }) =>
        parts.every((part) => !seen.has(part)),
      );
      if (!choice) continue;
      choice.parts.forEach((part) => seen.add(part));
      choices.push({
        text: senseLine(choice.sense),
        term: choice.term,
        correct: false,
      });
    }
  }
  if (choices.length < 2) return [];

  const position = Math.floor(Math.random() * choices.length);
  [choices[0], choices[position]] = [choices[position], choices[0]];
  return choices;
}
