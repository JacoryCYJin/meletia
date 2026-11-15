import { normalizeDictation } from "../dictation/model.js";
import { defaultProgress, normalizeProgress } from "../study/model.js";

const PART_OF_SPEECH =
  /(?:n|v|vi|vt|adj|adv|prep|pron|conj|det|interj|aux|num|art|abbr)\./gi;

export const LISTEN_TAG = "听辨";

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
    const stop =
      index + 1 < markers.length ? markers[index + 1].start : text.length;
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

export function newCardId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `c${Math.random().toString(16).slice(2)}`
  );
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

export function normalizeCard(raw, now = new Date()) {
  const term = String(raw.term ?? raw.word ?? "").trim();
  const senses = Array.isArray(raw.senses)
    ? raw.senses.map((sense) => ({
        pos: sense.pos ?? "",
        text: sense.text ?? "",
      }))
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
