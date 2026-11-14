export function bookCards(book, cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return book.cardIds.map((id) => byId.get(id)).filter(Boolean);
}

export function bookUpdatedText(book) {
  const date = new Date(book.updatedAt ?? "");
  if (Number.isNaN(date.getTime())) return "更新时间未记录";
  return "更新于 " + new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function isDue(card, now = new Date()) {
  const progress = card.progress;
  return Boolean(
    progress.stage !== "new" &&
      !progress.needsRecall &&
      progress.dueAt &&
      new Date(progress.dueAt) <= now,
  );
}

export function bookRecites(book) {
  return book.active !== false && book.recite !== false;
}

export function bookDictates(book) {
  return book.active !== false && book.dictation === true;
}

export function bookStats(book, cards, now = new Date()) {
  const list = bookCards(book, cards);
  return {
    total: list.length,
    learned: list.filter((card) => card.progress.stage !== "new").length,
    due: list.filter((card) => isDue(card, now)).length,
    recall: list.filter((card) => card.progress.needsRecall).length,
    fresh: list.filter((card) => card.progress.stage === "new").length,
  };
}

export function dictationStats(book, cards, now = new Date()) {
  const list = bookCards(book, cards);
  return {
    total: list.length,
    introduced: list.filter((card) => card.dictation).length,
    due: list.filter(
      (card) => card.dictation?.dueAt && new Date(card.dictation.dueAt) <= now,
    ).length,
  };
}

export function freshQueue(books, cards, limit, isFresh = (card) => card.progress.stage === "new") {
  if (limit <= 0) return [];
  const byId = new Map(cards.map((card) => [card.id, card]));
  const queues = books
    .filter((book) => book.active)
    .map((book) => ({
      ids: book.cardIds.filter((id) => {
        const card = byId.get(id);
        return card ? isFresh(card) : false;
      }),
    }));

  const picked = [];
  const seen = new Set();
  let progressed = true;

  while (picked.length < limit && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= limit) break;
      while (queue.ids.length) {
        const id = queue.ids.shift();
        if (seen.has(id) || !byId.has(id)) continue;
        seen.add(id);
        picked.push(id);
        progressed = true;
        break;
      }
    }
  }

  return picked;
}
