import assert from "node:assert/strict";
import test from "node:test";
import { parseWords, previewImport } from "../src/core/importer.js";

test("Feishu CSV filters full phrases by status, source and date", () => {
  const { rows } = parseWords(
    '\uFEFF单词,掌握状态,中文释义,来源,记录时间\r\nmake sense,未掌握,"说得通, 有道理",练习,2026/11/4\r\nMAKE SENSE,未掌握,有道理,练习,2026/11/4\r\nscope,已掌握,范围,练习,2026/11/4\r\nword,未掌握,词,媒体,2026/11/3',
  );
  const filters = { status: "未掌握", source: "练习", date: "2026-11-04" };
  const first = previewImport(rows, [], filters);

  assert.equal(first.added[0].word, "make sense");
  assert.equal(first.added[0].definition, "说得通, 有道理");
  assert.equal(first.duplicates, 1);
  assert.equal(first.skipped, 2);

  const cards = [{ term: "make sense" }];
  assert.equal(previewImport(rows, cards, filters).duplicates, 2);
});

test("plain two-column CSV keeps its first word", () => {
  assert.equal(parseWords("scope,范围\ncontract,合同").rows[0].word, "scope");
});

test("rows without a definition are skipped", () => {
  const { rows } = parseWords("单词,中文释义\nscope,范围\ncontract,");
  const preview = previewImport(rows, []);
  assert.equal(preview.added.length, 1);
  assert.equal(preview.skipped, 1);
});
