import { dueAfter, nextStep, stageForStep, stepForDays } from "./scheduler.js";

const PART_OF_SPEECH =
  /(?:n|v|vi|vt|adj|adv|prep|pron|conj|det|interj|aux|num|art|abbr)\./gi;

export const STORE_VERSION = 8;

export const LISTEN_TAG = "听辨";

export const DEFAULT_SETTINGS = {
  dailyNew: 20,
  groupSize: 10,
  dailyReview: null,
  trashRetentionDays: 7,
  dictationReplays: 2,
  dictationDailyNew: 10,
  dictationDailyReview: 20,
  dictationGroupSize: 10,
};

export function wordKey(term) {
  return String(term ?? "")
    .trim()
    .toLowerCase();
}

export function splitTags(value) {
  return String(value ?? "")
    .split(/[,，、;；]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function hasTag(card, tag) {
  if (!tag) return true;
  return (card.tags ?? []).some((item) => String(item).trim() === tag);
}

export function idFor(term) {
  const key = wordKey(term);
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `c${(hash >>> 0).toString(16)}`;
}

export function bookId(name) {
  const key = String(name ?? "").trim();
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash, 33) ^ key.charCodeAt(index);
  }
  return `b${(hash >>> 0).toString(16)}`;
}

export function parseSenses(definition) {
  const text = String(definition ?? "").trim();
  if (!text) return [];

  const markers = [];
  const pattern = new RegExp(
    `(?:^|[；;\\s])(${PART_OF_SPEECH.source})(?=\\s|[\u4e00-\u9fff])`,
    "gi",
  );
  let match;
  while ((match = pattern.exec(text))) {
    const pos = match[1];
    markers.push({
      pos,
      start: match.index + match[0].indexOf(pos),
      end: pattern.lastIndex,
    });
  }

  if (!markers.length) return [{ pos: "", text }];

  const senses = [];
  const lead = text.slice(0, markers[0].start).replace(/[；;\s]+$/, "").trim();
  if (lead) senses.push({ pos: "", text: lead });

  markers.forEach((marker, index) => {
    const stop = index + 1 < markers.length ? markers[index + 1].start : text.length;
    const body = text
      .slice(marker.end, stop)
      .replace(/^[\s：:]+/, "")
      .replace(/[\s；;]+$/, "")
      .trim();
    if (body) senses.push({ pos: marker.pos, text: body });
  });

  return senses.length ? senses : [{ pos: "", text }];
}

export function senseLine(sense) {
  return sense.pos ? `${sense.pos} ${sense.text}` : sense.text;
}

export function definitionOf(card) {
  return (card.senses ?? []).map(senseLine).join("；");
}

export function meaningChoices(card, cards) {
  const partsOf = ({ text }) =>
    text.normalize("NFKC").toLowerCase().split(/[，、,；;。/]+/)
      .map((part) => part.trim()).filter(Boolean);
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
      .filter(({ parts }) => parts.length && parts.every((part) => !seen.has(part)));
    const matching = candidates.filter(({ sense }) =>
      sense.pos.toLowerCase() === correct.pos.toLowerCase(),
    );
    if (matching.length) samePartOfSpeech.push(matching);
    else if (candidates.length) otherPartsOfSpeech.push(candidates);
  }

  const choices = [{ text: senseLine(correct), term: card.term, correct: true }];
  for (const pool of [samePartOfSpeech, otherPartsOfSpeech]) {
    while (pool.length && choices.length < 4) {
      const pick = Math.floor(Math.random() * pool.length);
      const [candidates] = pool.splice(pick, 1);
      const choice = candidates.find(({ parts }) => parts.every((part) => !seen.has(part)));
      if (!choice) continue;
      choice.parts.forEach((part) => seen.add(part));
      choices.push({ text: senseLine(choice.sense), term: choice.term, correct: false });
    }
  }
  if (choices.length < 2) return [];

  const position = Math.floor(Math.random() * choices.length);
  [choices[0], choices[position]] = [choices[position], choices[0]];
  return choices;
}

export function defaultDictationProgress() {
  return {
    stage: "new",
    step: 0,
    streak: 0,
    lastRating: null,
    lastSeenAt: null,
    introducedOn: null,
    lapses: 0,
    dueAt: null,
  };
}

export function normalizeDictation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const progress = defaultDictationProgress();
  return {
    ...progress,
    ...raw,
    stage: typeof raw.stage === "string" ? raw.stage : progress.stage,
    step: Number.isInteger(raw.step) && raw.step >= 0 ? raw.step : 0,
    lapses: Number.isInteger(raw.lapses) && raw.lapses >= 0 ? raw.lapses : 0,
  };
}

export function withDictationAttempt(card, rating, now = new Date()) {
  const first = !card.dictation;
  const current = normalizeDictation(card.dictation) ?? defaultDictationProgress();
  const correct = rating >= 3;
  const step = first ? 0 : correct ? nextStep(current.step, 3) : 0;
  return {
    ...card,
    dictation: {
      stage: stageForStep(step),
      step,
      streak: 0,
      lastRating: rating,
      lastSeenAt: now.toISOString(),
      introducedOn: current.introducedOn ?? localDay(now),
      lapses: (current.lapses ?? 0) + (correct ? 0 : 1),
      // A first miss still waits until tomorrow so it does not consume both the
      // new-word and due-review allowances on the same day.
      dueAt: !first && !correct ? now.toISOString() : dueAfter(step, now),
    },
  };
}

export function defaultProgress() {
  return {
    stage: "new",
    streak: 0,
    step: 0,
    lastRating: null,
    lastSeenAt: null,
    dueAt: null,
    introducedOn: null,
    needsRecall: false,
    lapses: 0,
    masteryStatus: null,
    studiedAt: null,
    masteryDays: {},
  };
}

export function newCard(row, now = new Date()) {
  const term = String(row.word ?? "").trim();
  return {
    id: newCardId(),
    term,
    kind: /\s/.test(term) ? "phrase" : "word",
    phonetics: { uk: "", us: "" },
    senses: parseSenses(row.definition),
    phrases: [],
    examples: [],
    note: "",
    source: String(row.source ?? "").trim(),
    status: String(row.status ?? "").trim(),
    markedOn: String(row.date ?? "").trim(),
    tags: splitTags(row.tags),
    createdAt: now.toISOString(),
    editedAt: null,
    progress: defaultProgress(),
  };
}

function newCardId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `c${Math.random().toString(16).slice(2)}`
  );
}

export function blankCard(now = new Date()) {
  return {
    id: newCardId(),
    term: "",
    kind: "word",
    phonetics: { uk: "", us: "" },
    senses: [{ pos: "", text: "" }],
    phrases: [],
    examples: [],
    note: "",
    source: "",
    status: "",
    markedOn: "",
    tags: [],
    createdAt: now.toISOString(),
    editedAt: null,
    progress: defaultProgress(),
  };
}

function normalizeProgress(raw, now) {
  if (raw.progress && raw.progress.step !== undefined) {
    return { ...defaultProgress(), ...raw.progress };
  }

  const legacySchedule = raw.progress?.schedule ?? raw.schedule ?? null;
  const introducedOn = raw.progress?.introducedOn ?? raw.introducedOn ?? null;

  if (!introducedOn) return defaultProgress();

  const step = stepForDays(legacySchedule?.scheduled_days ?? 0);
  return {
    ...defaultProgress(),
    stage: stageForStep(step),
    step,
    introducedOn,
    dueAt: legacySchedule?.due ?? null,
    lastSeenAt: legacySchedule?.last_review ?? null,
    needsRecall: raw.progress?.needsRecall ?? false,
    lapses: raw.progress?.lapses ?? 0,
  };
}

function normalizeCard(raw, now) {
  const term = String(raw.term ?? raw.word ?? "").trim();
  const senses = Array.isArray(raw.senses)
    ? raw.senses.map((sense) => ({ pos: sense.pos ?? "", text: sense.text ?? "" }))
    : parseSenses(raw.definition);

  return {
    id: raw.id || idFor(term),
    term,
    kind: raw.kind || (/\s/.test(term) ? "phrase" : "word"),
    phonetics: raw.phonetics ?? { uk: "", us: "" },
    senses,
    phrases: Array.isArray(raw.phrases) ? raw.phrases : [],
    examples: Array.isArray(raw.examples) ? raw.examples : [],
    note: String(raw.note ?? ""),
    source: String(raw.source ?? "").trim(),
    status: String(raw.status ?? "").trim(),
    markedOn: String(raw.markedOn ?? raw.date ?? "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: raw.createdAt ?? now.toISOString(),
    editedAt: raw.editedAt ?? null,
    progress: normalizeProgress(raw, now),
    dictation: normalizeDictation(raw.dictation),
  };
}

export function sourcesOf(card) {
  return String(card.source ?? "")
    .split(/[,，、;；/\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildBooks(cards, rawBooks, legacy) {
  if (Array.isArray(rawBooks) && (rawBooks.length || !legacy)) {
    return rawBooks
      .filter((book) => book && Array.isArray(book.cardIds))
      .map((book) => ({
        id: book.id || bookId(book.name),
        name: String(book.name ?? "未命名词书"),
        source: String(book.source ?? ""),
        legacy: book.legacy ??
          (legacy && Boolean(book.source || ["自建", "未分类"].includes(book.name))),
        cardIds: book.cardIds.filter(Boolean),
        active: book.active !== false,
        recite: book.recite !== false,
        dictation: book.dictation === true,
        createdAt: book.createdAt ?? new Date().toISOString(),
        updatedAt: book.updatedAt ?? null,
      }));
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

  return [...groups.entries()].map(([name, cardIds]) => ({
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
  }));
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
    if (byId.has(card.id) || ((data.version ?? 0) < 4 && byTerm.has(key))) continue;
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
    settings: {
      trashRetentionDays: Number.isSafeInteger(data.settings?.trashRetentionDays) && data.settings.trashRetentionDays >= 1 && data.settings.trashRetentionDays <= 365 ? data.settings.trashRetentionDays : 7,
      dailyNew: data.settings?.dailyNew ?? DEFAULT_SETTINGS.dailyNew,
      groupSize: data.settings?.groupSize ?? DEFAULT_SETTINGS.groupSize,
      dailyReview: Number.isSafeInteger(data.settings?.dailyReview) && data.settings.dailyReview >= 0
        ? data.settings.dailyReview
        : DEFAULT_SETTINGS.dailyReview,
      dictationReplays: Number.isSafeInteger(data.settings?.dictationReplays) &&
        data.settings.dictationReplays >= 0 && data.settings.dictationReplays <= 5
        ? data.settings.dictationReplays
        : DEFAULT_SETTINGS.dictationReplays,
      dictationDailyNew: Number.isSafeInteger(data.settings?.dictationDailyNew) &&
        data.settings.dictationDailyNew >= 0 && data.settings.dictationDailyNew <= 200
        ? data.settings.dictationDailyNew
        : DEFAULT_SETTINGS.dictationDailyNew,
      dictationDailyReview: data.settings?.dictationDailyReview === null
        ? null
        : Number.isSafeInteger(data.settings?.dictationDailyReview) &&
            data.settings.dictationDailyReview >= 0
          ? data.settings.dictationDailyReview
          : DEFAULT_SETTINGS.dictationDailyReview,
      dictationGroupSize: Number.isSafeInteger(data.settings?.dictationGroupSize) &&
        data.settings.dictationGroupSize >= 1 && data.settings.dictationGroupSize <= 50
        ? data.settings.dictationGroupSize
        : DEFAULT_SETTINGS.dictationGroupSize,
    },
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

export function localDay(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}
