export const LEARN_GROUP = 10;
export const REVIEW_GROUP = 20;
export const REQUEUE_GAP = 3;

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
