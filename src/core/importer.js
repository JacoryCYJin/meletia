import Papa from "papaparse";
import { definitionOf, parseSenses, splitTags, wordKey } from "./content.js";

const fieldNames = {
  word: ["单词", "词条", "英文", "word", "term", "front"],
  definition: ["中文释义", "释义", "中文", "definition", "meaning", "back"],
  source: ["来源", "source"],
  status: ["掌握状态", "status"],
  date: ["记录时间", "日期", "date"],
  tags: ["学习重点", "标签", "tags"],
};

export function parseTable(csv, delimiter = "") {
  const { data, errors, meta } = Papa.parse(String(csv ?? "").replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    delimiter,
    delimitersToGuess: [",", "\t", ";"],
  });
  if (errors.some((error) => error.type === "Quotes")) {
    throw new Error("表格格式有误，请检查引号和分隔符。");
  }
  const width = data.reduce((max, row) => Math.max(max, row.length), 0);
  return { data, width, delimiter: meta.delimiter };
}

export function hasKnownHeader(row = []) {
  const names = row.map(wordKey);
  return fieldNames.word.some((name) => names.includes(name)) &&
    fieldNames.definition.some((name) => names.includes(name));
}

export function suggestMapping({ data, width }, hasHeader) {
  const headers = hasHeader ? data[0]?.map(wordKey) ?? [] : [];
  const mapping = Object.fromEntries(Object.entries(fieldNames).map(([field, names]) =>
    [field, headers.findIndex((header) => names.includes(header))],
  ));
  const available = Array.from({ length: width }, (_, index) => index)
    .filter((index) => !Object.values(mapping).includes(index));
  for (const field of ["word", "definition"]) {
    if (mapping[field] < 0) mapping[field] = available.shift() ?? -1;
  }
  return mapping;
}

export function mapRows(data, hasHeader, mapping) {
  return data.slice(hasHeader ? 1 : 0).map((row) =>
    Object.fromEntries(Object.entries(mapping).map(([field, index]) =>
      [field, String(row[index] ?? "").trim()],
    )),
  );
}

function definitionKey(definition) {
  return JSON.stringify(parseSenses(definition).map(({ pos, text }) => [
    pos.toLowerCase(), text.normalize("NFKC").replace(/\s+/g, " ").trim(),
  ]));
}

export function previewImport(rows, cards, filters = {}, resolutions = {}) {
  const existing = new Map(cards.map((card) => [wordKey(card.term), card]));
  const candidates = new Map();
  const added = [];
  const updated = [];
  const conflicts = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of rows) {
    const date = (row.date ?? "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const normalizedDate = date
      ? date
          .slice(1)
          .map((part) => part.padStart(2, "0"))
          .join("-")
      : "";

    if (
      !wordKey(row.word) ||
      !String(row.definition ?? "").trim() ||
      (filters.status && row.status !== filters.status) ||
      (filters.source && row.source !== filters.source) ||
      (filters.tags && !splitTags(row.tags).includes(filters.tags)) ||
      (filters.date && normalizedDate !== filters.date)
    ) {
      skipped += 1;
      continue;
    }

    const key = wordKey(row.word);
    if (!candidates.has(key)) {
      const card = existing.get(key);
      const versions = card ? [{ definition: definitionOf(card), row: null }] : [];
      candidates.set(key, {
        card, versions,
        seen: new Map(versions.map(({ definition }, index) => [definitionKey(definition), index])),
        defaultSelected: versions.length - 1,
      });
    }
    const candidate = candidates.get(key);
    const meaning = definitionKey(row.definition);
    if (candidate.seen.has(meaning)) {
      candidate.defaultSelected = candidate.seen.get(meaning);
      duplicates += 1;
      continue;
    }
    candidate.defaultSelected = candidate.versions.length;
    candidate.seen.set(meaning, candidate.versions.length);
    candidate.versions.push({ definition: row.definition, row });
  }

  for (const [key, { card, versions, defaultSelected }] of candidates) {
    if (!versions.length) continue;
    const override = resolutions[key];
    const requested = Object.hasOwn(resolutions, key) ? Number(override) : defaultSelected;
    const selected = Number.isInteger(requested) && requested >= 0 && requested < versions.length
      ? requested : versions.length - 1;
    if (versions.length > 1) {
      conflicts.push({ key, term: card?.term ?? versions[0].row.word, card, versions, selected });
    }
    const row = versions[selected].row;
    if (!row) continue;
    if (card) updated.push({ card, row });
    else added.push(row);
  }

  return { added, updated, conflicts, duplicates, skipped };
}
