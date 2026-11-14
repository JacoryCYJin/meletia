export const LEARN_GROUP = 10;
export const REVIEW_GROUP = 20;
export const REQUEUE_GAP = 3;
export const DICTATION_GROUP = 10;

const REVIEW_ROUNDS = ["recognition", "choice", "reverse"];

function createSession(cards, size, mode, round) {
  const queue = cards.slice(0, size).map(({ id }) => ({ id, round }));
  return {
    mode,
    phase: queue.length ? "card" : "finished",
    queue,
    done: [],
    total: queue.length,
    rating: null,
    spelling: null,
  };
}

export function createLearnSession(cards, size = LEARN_GROUP) {
  return createSession(cards, size, "learn", "choice");
}

export function resumeLearnCheckpoint(checkpoint, cards) {
  const session = checkpoint?.session;
  if (session?.mode !== "learn" || !Array.isArray(session.queue) ||
      !Array.isArray(session.done) || !Number.isInteger(session.total) ||
      !["card", "choice-feedback", "detail", "spelling-ready", "spell"].includes(session.phase)) {
    return null;
  }

  const ids = new Set(cards.map((card) => card.id));
  const queue = session.queue.filter((entry) => ids.has(entry?.id));
  const done = session.done.filter((id) => ids.has(id));
  const total = session.total - (session.queue.length - queue.length) - (session.done.length - done.length);
  const next = { ...session, queue, done, total };

  if (session.phase === "spell") {
    const spelling = session.spelling;
    if (!Array.isArray(spelling?.list) || !Array.isArray(spelling.missed) ||
        !Number.isInteger(spelling.index) || spelling.index < 0) return null;
    const list = spelling.list.filter((id) => ids.has(id));
    const index = spelling.list.slice(0, spelling.index).filter((id) => ids.has(id)).length;
    if (index >= list.length) return null;
    next.spelling = { list, index, missed: spelling.missed.filter((id) => ids.has(id)) };
    return { session: next };
  }

  if (!queue.length) {
    return done.length ? { session: { ...next, phase: "spelling-ready", rating: null } } : null;
  }
  if (queue[0].id !== session.queue[0].id) {
    return { session: { ...next, phase: "card", rating: null } };
  }
  if (session.phase === "choice-feedback") {
    const { choices, selectedChoice } = checkpoint;
    if (!Array.isArray(choices) || !choices.some((choice) => choice?.text === selectedChoice)) {
      return { session: { ...next, phase: "detail" } };
    }
    return { session: next, choices, selectedChoice };
  }
  return { session: next };
}

export function createReviewSession(cards, size = REVIEW_GROUP) {
  return createSession(cards, size, "review", REVIEW_ROUNDS[0]);
}

export function currentEntry(session) {
  return session?.queue[0] ?? null;
}

export function progressOf(session) {
  return { done: session.done.length, total: session.total };
}

function moveOn(session, queue, done) {
  let phase = "card";
  if (!queue.length) phase = done.length ? "spelling-ready" : "finished";
  return { ...session, queue, done, phase, rating: null };
}

export function answerQuestion(session, rating, { selectedOption = false } = {}) {
  const entry = currentEntry(session);
  if (session.phase !== "card" || !entry) return session;

  if (session.mode === "learn") {
    const phase = entry.round === "choice" && rating === 1 && selectedOption ? "choice-feedback" : "detail";
    return { ...session, phase, rating };
  }

  if (rating === 3 && ["recognition", "reverse"].includes(entry.round)) {
    return moveOn(session, session.queue.slice(1), [...session.done, entry.id]);
  }

  return { ...session, phase: "detail", rating };
}

export function showAnswerDetail(session) {
  if (session.phase !== "choice-feedback") return session;
  return { ...session, phase: "detail" };
}

function requeueQuestion(session, entry) {
  const queue = session.queue.slice(1);
  queue.splice(Math.min(REQUEUE_GAP, queue.length), 0, entry);
  return moveOn(session, queue, session.done);
}

export function continueQuestion(session) {
  if (session.phase !== "detail") return session;
  const entry = currentEntry(session);
  if (session.mode === "learn") {
    if (session.rating !== 3) return requeueQuestion(session, entry);
    if (entry.round === "choice") return requeueQuestion(session, { ...entry, round: "recall" });
    return moveOn(session, session.queue.slice(1), [...session.done, entry.id]);
  }

  const index = REVIEW_ROUNDS.indexOf(entry.round);
  const nextIndex = session.rating === 3 ? index + 1 : Math.max(1, index);
  const next = { ...entry, round: REVIEW_ROUNDS[nextIndex] };
  if (entry.round === "recognition") next.firstRating = session.rating;

  return requeueQuestion(session, next);
}

export function skipWord(session) {
  if (session.phase !== "card") return session;
  return moveOn(session, session.queue.slice(1), session.done);
}

export function startSpelling(session) {
  if (session.phase !== "spelling-ready") return session;
  return {
    ...session,
    phase: "spell",
    spelling: { list: session.done.slice(), index: 0, missed: [] },
  };
}

export function spellTarget(session) {
  const spelling = session.spelling;
  if (!spelling || spelling.index >= spelling.list.length) return null;
  return spelling.list[spelling.index];
}

export function spell(session, correct) {
  const spelling = session.spelling;
  if (session.phase !== "spell" || spelling.index >= spelling.list.length) return session;

  const list = spelling.list.slice();
  const index = spelling.index;
  const missed = spelling.missed.slice();
  if (!correct) {
    if (!missed.includes(list[index])) missed.push(list[index]);
    list.push(list[index]);
  }

  const nextIndex = index + 1;
  const finished = nextIndex >= list.length;
  return {
    ...session,
    phase: finished ? "finished" : "spell",
    spelling: { list, index: nextIndex, missed },
  };
}

export function skipSpelling(session) {
  if (session.phase !== "spelling-ready" && session.phase !== "spell") return session;
  return { ...session, phase: "finished" };
}

export function matchSpelling(input, term) {
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  return normalize(input) === normalize(term);
}

export function createDictationSession(ids, size = DICTATION_GROUP) {
  const list = ids.slice(0, Math.max(0, size));
  return {
    mode: "dictation",
    phase: "dictation",
    queue: [],
    done: [],
    total: list.length,
    rating: null,
    spelling: null,
    dictation: { list, index: 0, missed: [], replays: 0, total: list.length },
  };
}

export function dictationTarget(session) {
  const dictation = session?.dictation;
  if (session?.phase !== "dictation" || !dictation ||
      dictation.index >= dictation.list.length) return null;
  return dictation.list[dictation.index];
}

export function dictationFeedbackTarget(session) {
  const dictation = session?.dictation;
  if (session?.phase !== "dictation-feedback" || !dictation) return null;
  return dictation.list[dictation.index] ?? null;
}

function advanceDictation(session, correct) {
  const dictation = session.dictation;
  const list = dictation.list.slice();
  const missed = dictation.missed.slice();
  const id = list[dictation.index];
  if (!correct) {
    if (!missed.includes(id)) missed.push(id);
    list.push(id);
  }

  const index = dictation.index + 1;
  return {
    ...session,
    phase: index >= list.length ? "dictation-finished" : "dictation",
    dictation: { ...dictation, list, index, missed, replays: 0 },
  };
}

export function answerDictation(session, correct) {
  if (session.phase !== "dictation") return session;
  const id = dictationTarget(session);
  if (!id) return session;
  if (correct) return advanceDictation(session, true);
  const missed = session.dictation.missed.includes(id)
    ? session.dictation.missed
    : [...session.dictation.missed, id];
  return {
    ...session,
    phase: "dictation-feedback",
    dictation: { ...session.dictation, missed },
  };
}

export function continueDictation(session) {
  if (session.phase !== "dictation-feedback" || !dictationFeedbackTarget(session)) return session;
  return advanceDictation(session, false);
}

export function replayDictation(session, limit = 2) {
  if (session.phase !== "dictation" || !dictationTarget(session)) {
    return { session, allowed: false };
  }
  const used = Number.isInteger(session.dictation.replays) ? session.dictation.replays : 0;
  if (!Number.isFinite(limit) || used >= limit) return { session, allowed: false };
  return {
    session: { ...session, dictation: { ...session.dictation, replays: used + 1 } },
    allowed: true,
  };
}

export function skipDictation(session) {
  if (session.phase !== "dictation" && session.phase !== "dictation-feedback") return session;
  return { ...session, phase: "dictation-finished" };
}

export function dictationSummary(session) {
  const dictation = session?.dictation;
  if (!dictation) return { total: 0, correct: 0, wrong: 0, missed: [] };
  const missed = [...new Set(dictation.missed)];
  const total = Number.isInteger(dictation.total) ? dictation.total : new Set(dictation.list).size;
  return {
    total,
    correct: Math.max(0, total - missed.length),
    wrong: missed.length,
    missed,
  };
}
