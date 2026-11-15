export const DICTATION_GROUP = 10;

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
