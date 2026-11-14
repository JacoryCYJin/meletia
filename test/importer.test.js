import assert from "node:assert/strict";
import test from "node:test";
import { hasKnownHeader, mapRows, parseTable, previewImport, suggestMapping } from "../src/core/importer.js";
import { newCard } from "../src/core/content.js";
import { computed, reactive } from "vue";

function parseWords(text) {
  const table = parseTable(text);
  const hasHeader = hasKnownHeader(table.data[0]);
  return { rows: mapRows(table.data, hasHeader, suggestMapping(table, hasHeader)) };
}

test("Feishu CSV filters full phrases by status, source and date", () => {
  const { rows } = parseWords(
    '\uFEFF单词,掌握状态,中文释义,来源,记录时间\r\nmake sense,未掌握,"说得通, 有道理",练习,2026/11/4\r\nMAKE SENSE,未掌握,有道理,练习,2026/11/4\r\nscope,已掌握,范围,练习,2026/11/4\r\nword,未掌握,词,媒体,2026/11/3',
  );
  const filters = { status: "未掌握", source: "练习", date: "2026-11-04" };
  const first = previewImport(rows, [], filters);

  assert.equal(first.added[0].word, "MAKE SENSE");
  assert.equal(first.added[0].definition, "有道理");
  assert.equal(first.conflicts.length, 1);
  assert.equal(first.duplicates, 0);
  assert.equal(first.skipped, 2);

  const cards = [newCard({ word: "make sense", definition: "有道理" })];
  const next = previewImport(rows, cards, filters);
  assert.equal(next.duplicates, 1);
  assert.equal(next.updated.length, 0);
  assert.equal(next.conflicts.length, 1);
});

test("meaning conflicts default to the latest incoming version and allow selecting current or earlier versions", () => {
  const card = newCard({ word: "contract", definition: "n. 合同" });
  const rows = [
    { word: " CONTRACT ", definition: "n. 合同" },
    { word: "contract", definition: "v. 收缩" },
    { word: "contract", definition: "v. 收缩" },
    { word: "contract", definition: "n. 契约" },
  ];
  const preview = previewImport(rows, [card]);
  assert.equal(preview.duplicates, 2);
  assert.equal(preview.added.length, 0);
  assert.equal(preview.updated[0].row.definition, "n. 契约");
  assert.equal(preview.conflicts[0].versions.length, 3);
  assert.equal(previewImport(rows, [card], {}, { contract: 0 }).updated.length, 0);
  assert.equal(previewImport(rows, [card], {}, { contract: 1 }).updated[0].row.definition, "v. 收缩");
  assert.equal(previewImport(rows, [card], {}, { contract: 99 }).updated[0].row.definition, "n. 契约");
  assert.equal(previewImport(rows, [], {}, { contract: 0 }).added[0].definition, "n. 合同");
  const latest = newCard({ word: "contract", definition: "n. 契约" });
  assert.equal(previewImport(rows, [latest]).updated.length, 0);
});

test("the first version selection immediately refreshes a reactive import preview", () => {
  const card = newCard({ word: "contract", definition: "合同" });
  const rows = [{ word: "contract", definition: "契约" }];
  const resolutions = reactive(Object.create(null));
  const preview = computed(() => previewImport(rows, [card], {}, resolutions));
  assert.equal(preview.value.updated.length, 1);
  resolutions.contract = "0";
  assert.equal(preview.value.updated.length, 0);
  resolutions.contract = "1";
  assert.equal(preview.value.updated.length, 1);
});

test("tag filters keep only rows whose 学习重点 contains the requested tag", () => {
  const { rows } = parseWords(
    '单词,中文释义,学习重点\nscope,范围,"听辨,拼写"\ncontract,合同,拼写\nword,词,听辨',
  );
  const preview = previewImport(rows, [], { tags: "听辨" });
  assert.deepEqual(preview.added.map((row) => row.word), ["scope", "word"]);
  assert.equal(preview.skipped, 1);
  assert.deepEqual(
    previewImport(rows, []).added.map((row) => row.word),
    ["scope", "contract", "word"],
  );
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

test("arbitrary titles and column order can be mapped with or without a header", () => {
  const table = parseTable('说明;类别;项目\n"有道理;说得通";work;make sense', ";");
  assert.equal(hasKnownHeader(table.data[0]), false);
  const mapping = { word: 2, definition: 0, tags: 1 };
  assert.deepEqual(mapRows(table.data, true, mapping), [
    { word: "make sense", definition: "有道理;说得通", tags: "work" },
  ]);
  assert.equal(mapRows(table.data, false, mapping)[0].word, "项目");
});
