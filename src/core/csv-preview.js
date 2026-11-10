import { mapRows, suggestMapping } from "./importer.js";
import { newCard } from "./content.js";

export const CSV_PREVIEW_FIELDS = [
  { id: "word", label: "单词", required: true },
  { id: "definition", label: "释义", required: true },
  { id: "source", label: "来源" },
  { id: "tags", label: "标签" },
  { id: "status", label: "掌握状态" },
  { id: "date", label: "记录日期" },
];

export function suggestCsvPreviewMapping(table, hasHeader) {
  const mapping = suggestMapping(table, hasHeader);
  if (hasHeader) {
    for (const field of CSV_PREVIEW_FIELDS) {
      if (mapping[field.id] >= 0) continue;
      const index = table.data[0].findIndex(value => String(value).trim() === field.label);
      if (index >= 0 && !Object.values(mapping).includes(index)) mapping[field.id] = index;
    }
  }
  return mapping;
}

export function previewMappingError(mapping, width) {
  const selected = new Set();
  for (const field of CSV_PREVIEW_FIELDS) {
    const column = mapping[field.id] ?? -1;
    if (column === -1 && !field.required) continue;
    if (!Number.isInteger(column) || column < 0 || column >= width) return `请选择${field.label}对应的源列。`;
    if (selected.has(column)) return "每个属性请选择不同的源列。";
    selected.add(column);
  }
  return "";
}

function dateOf(value) {
  const match = String(value ?? "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match ? match.slice(1).map(part => part.padStart(2, "0")).join("-") : "";
}

export function selectCsvPreviewRows(table, hasHeader, mapping, filters = {}) {
  const error = previewMappingError(mapping, table.width);
  if (error) throw new Error(error);
  const rows = mapRows(table.data, hasHeader, mapping);
  const selected = [];
  let invalid = 0, filtered = 0;
  for (const row of rows) {
    if (!row.word || !row.definition) { invalid++; continue; }
    if ((filters.source && row.source !== filters.source) ||
        (filters.status && row.status !== filters.status) ||
        (filters.date && dateOf(row.date) !== filters.date)) { filtered++; continue; }
    selected.push(row);
  }
  return { rows: selected, total: rows.length, invalid, filtered };
}

// These cards exist only in the preview component's memory; no library or persistence API is imported.
export function createCsvPreviewCards(rows, mapping) {
  return rows.map(row => ({
    ...newCard(row),
    previewAttributes: CSV_PREVIEW_FIELDS.filter(field => !field.required && mapping[field.id] >= 0 && row[field.id])
      .map(field => ({ label: field.label, value: row[field.id] })),
  }));
}
