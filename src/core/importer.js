import Papa from "papaparse";
import { wordKey } from "./content.js";

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

export function previewImport(rows, cards, filters = {}) {
  const seen = new Set(cards.map((card) => wordKey(card.term)));
  const added = [];
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
      !row.word ||
      !row.definition ||
      (filters.status && row.status !== filters.status) ||
      (filters.source && row.source !== filters.source) ||
      (filters.date && normalizedDate !== filters.date)
    ) {
      skipped += 1;
      continue;
    }

    const key = wordKey(row.word);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }

    seen.add(key);
    added.push(row);
  }

  return { added, duplicates, skipped };
}
