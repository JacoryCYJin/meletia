export const LEARN_GROUP = 10;
export const REVIEW_GROUP = 20;
export const LEARN_STREAK = 4;
export const REQUEUE_GAP = 3;

function startSpelling(ids) {
  return { list: ids.slice(), index: 0, missed: [] };
}

function moveOn(session, queue, done, extra = {}) {
  const finished = queue.length === 0;
  return {
    ...session,
    ...extra,
    queue,
    done,
    phase: finished ? "spell" : "card",
    spelling: finished ? startSpelling(done) : session.spelling,
  };
}

export function createLearnSession(cards, size = LEARN_GROUP, goal = LEARN_STREAK) {
  const picked = cards.slice(0, size).map((card) => card.id);
  return {
    mode: "learn",
    phase: picked.length ? "card" : "finished",
    queue: picked.map((id) => ({ id, streak: 0, intro: true })),
    done: [],
    total: picked.length,
    goal,
    spelling: picked.length ? null : startSpelling([]),
  };
}

export function createReviewSession(cards, size = REVIEW_GROUP) {
  const picked = cards.slice(0, size).map((card) => card.id);
  return {
    mode: "review",
    phase: picked.length ? "card" : "finished",
    queue: picked.map((id) => ({ id })),
    done: [],
    total: picked.length,
    goal: 0,
    spelling: picked.length ? null : startSpelling([]),
  };
}

export function currentEntry(session) {
  if (!session) return null;
  return session.queue[0] ?? null;
}

export function progressOf(session) {
  return { done: session.done.length, total: session.total };
}

export function showIntro(session) {
  return Boolean(session?.mode === "learn" && currentEntry(session)?.intro);
}

export function leaveIntro(session) {
  if (!showIntro(session)) return session;
  const [entry, ...rest] = session.queue;
  return {
    ...session,
    queue: [{ ...entry, intro: false }, ...rest],
  };
}

export function learn(session, grade) {
  if (session.mode !== "learn" || session.phase !== "card") return session;
  const entry = session.queue[0];
  if (!entry || entry.intro) return session;

  const queue = session.queue.slice(1);
  const next = { ...entry, intro: false };
  const done = session.done;

  if (grade >= 3) {
    next.streak += 1;
    if (next.streak >= session.goal) {
      return moveOn(session, queue, [...done, next.id], { graduated: next.id });
    }
  } else if (grade === 1) {
    next.streak = 0;
  }

  queue.splice(Math.min(REQUEUE_GAP, queue.length), 0, next);
  return moveOn(session, queue, done, { graduated: null });
}

export function review(session, grade) {
  if (session.mode !== "review" || session.phase !== "card") return session;
  const entry = session.queue[0];
  if (!entry) return session;

  if (grade >= 3) {
    return moveOn(
      session,
      session.queue.slice(1),
      [...session.done, entry.id],
      { lastGrade: grade },
    );
  }

  return {
    ...session,
    phase: "detail",
    queue: [{ ...entry, rating: grade }, ...session.queue.slice(1)],
    lastGrade: grade,
  };
}

export function showDetail(session) {
  return session?.phase === "detail";
}

export function closeDetail(session) {
  if (session?.phase !== "detail") return session;
  const entry = session.queue[0];
  if (!entry) return session;
  return moveOn(
    session,
    session.queue.slice(1),
    [...session.done, entry.id],
    { lastGrade: entry.rating ?? session.lastGrade },
  );
}

export function spellTarget(session) {
  const spelling = session.spelling;
  if (!spelling || spelling.index >= spelling.list.length) return null;
  return spelling.list[spelling.index];
}

export function spell(session, correct) {
  const spelling = session.spelling;
  if (!spelling || session.phase === "finished") return session;

  const list = spelling.list.slice();
  const index = spelling.index;
  const missed = spelling.missed.slice();
  if (correct) {
    // Nothing to record; the entry simply leaves the queue.
  } else {
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
  if (session.phase !== "spell") return session;
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
