import Papa from "papaparse";
import { wordKey } from "./content.js";

export function parseWords(csv) {
  const { data, errors } = Papa.parse(String(csv ?? "").replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (errors.length) throw new Error("CSV 格式有误，请检查分隔符与引号。");

  const headers = data[0]?.map((header) => String(header).trim()) ?? [];
  const wordIndex = headers.indexOf("单词");
  const definitionIndex = headers.indexOf("中文释义");
  if ((wordIndex < 0 || definitionIndex < 0) && headers.length !== 2) {
    throw new Error("请使用飞书导出的 CSV，或提供英文、中文两列的词表。");
  }

  const hasHeaders = wordIndex >= 0 && definitionIndex >= 0;
  const field = (row, name) =>
    hasHeaders ? String(row[headers.indexOf(name)] ?? "").trim() : "";

  return {
    fields: hasHeaders ? headers : [],
    rows: (hasHeaders ? data.slice(1) : data).map((row) => ({
      word: String(row[hasHeaders ? wordIndex : 0] ?? "").trim(),
      definition: String(row[hasHeaders ? definitionIndex : 1] ?? "").trim(),
      source: field(row, "来源"),
      status: field(row, "掌握状态"),
      date: field(row, "记录时间"),
      tags: field(row, "学习重点"),
    })),
  };
}

export function previewImport(rows, cards, filters = {}) {
  const seen = new Set(cards.map((card) => wordKey(card.term)));
  const added = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of rows) {
    const date = row.date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
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
      (filters.source && !row.source.includes(filters.source)) ||
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
