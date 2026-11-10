import Papa from "papaparse";
import { localDay } from "./content.js";
import { studyDaysOf } from "./study-status.js";
import { invoke, isTauri } from "@tauri-apps/api/core";

export function availableStudyDays(cards, reviews, now = new Date()) {
  return [...new Set([localDay(now), ...cards.flatMap(card => Object.keys(studyDaysOf(card, reviews)))])].sort().reverse();
}

export function studyRows(cards, books, reviews, day = localDay(new Date())) {
  const byId = new Map(cards.map(card => [card.id, card]));
  const seen = new Set();
  const rows = [];
  for (const book of books) {
    for (const id of book.cardIds) {
      const card = byId.get(id);
      if (!card || !card.term.trim() || seen.has(id)) continue;
      seen.add(id);
      const entry = studyDaysOf(card, reviews)[day];
      if (entry) rows.push({ book: book.name, term: card.term, status: entry.status });
    }
  }
  return rows.sort((a, b) => a.book.localeCompare(b.book, "zh-CN") || a.term.localeCompare(b.term, "en"));
}

export function studyExport(cards, books, reviews, now = new Date(), day = localDay(now)) {
  const rows = studyRows(cards, books, reviews, day);
  const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, "0")).join("-");
  const filename = `词语状态_${day}_${localDay(now)}_${stamp}-${String(now.getMilliseconds()).padStart(3, "0")}.csv`;
  const csv = "\uFEFF" + Papa.unparse([
    ["词书", "单词", "掌握状态"],
    ...rows.map(row => [row.book, row.term, row.status]),
  ], { quotes: true, newline: "\r\n" }) + "\r\n";
  return { rows, filename, csv };
}

export async function saveStudyExport({ filename, csv }) {
  if (isTauri()) return invoke("save_study_export", { filename, csv });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
