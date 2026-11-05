import { stageForStep, stepForDays } from "./scheduler.js";

const PART_OF_SPEECH =
  /(?:n|v|vi|vt|adj|adv|prep|pron|conj|det|interj|aux|num|art|abbr)\./gi;

export const STORE_VERSION = 4;

export const DEFAULT_SETTINGS = {
  dailyNew: 20,
  groupSize: 10,
  learnStreak: 4,
};

export function wordKey(term) {
  return String(term ?? "")
    .trim()
    .toLowerCase();
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
  };
}

export function newCard(row, now = new Date()) {
  const term = String(row.word ?? "").trim();
  return {
    id: idFor(term),
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
    tags: [],
    createdAt: now.toISOString(),
    progress: defaultProgress(),
  };
}

export function blankCard(now = new Date()) {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `c${Math.random().toString(16).slice(2, 10)}`;
  return {
    id,
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
    progress: normalizeProgress(raw, now),
  };
}

export function sourcesOf(card) {
  return String(card.source ?? "")
    .split(/[,，、;；/\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildBooks(cards, rawBooks) {
  if (Array.isArray(rawBooks) && rawBooks.length) {
    return rawBooks
      .filter((book) => book && Array.isArray(book.cardIds))
      .map((book) => ({
        id: book.id || bookId(book.name),
        name: String(book.name ?? "未命名词书"),
        source: String(book.source ?? ""),
        cardIds: book.cardIds.filter(Boolean),
        active: book.active !== false,
        createdAt: book.createdAt ?? new Date().toISOString(),
      }));
  }

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
    cardIds,
    active: true,
    createdAt: new Date().toISOString(),
  }));
}

export function migrateStore(raw, now = new Date()) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || !Array.isArray(data.cards)) {
    throw new Error("词库格式无法读取。");
  }

  const seen = new Set();
  const cards = [];
  for (const entry of data.cards) {
    const card = normalizeCard(entry, now);
    if (!card.term) continue;
    const key = wordKey(card.term);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }

  const known = new Set(cards.map((card) => card.id));
  const books = buildBooks(cards, data.books).map((book) => ({
    ...book,
    cardIds: book.cardIds.filter((id) => known.has(id)),
  }));

  const assigned = new Set(books.flatMap((book) => book.cardIds));
  const orphans = cards
    .filter((card) => !assigned.has(card.id))
    .map((card) => card.id);
  if (orphans.length) {
    books.push({
      id: bookId("未分类"),
      name: "未分类",
      source: "",
      cardIds: orphans,
      active: true,
      createdAt: now.toISOString(),
    });
  }

  return {
    version: STORE_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    cards,
    books,
    reviews: Array.isArray(data.reviews)
      ? data.reviews.filter((review) => review && review.at && review.cardId)
      : [],
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
