import assert from "node:assert/strict";
import test from "node:test";
import Papa from "papaparse";
import { parseTable, hasKnownHeader } from "../src/core/importer.js";
import { createCsvPreviewCards, previewMappingError, selectCsvPreviewRows, suggestCsvPreviewMapping } from "../src/core/csv-preview.js";
import { createBrowseSession, moveBrowse } from "../src/core/browse.js";
import { loadLibrary, state } from "../src/core/library.js";

const data = [
  ["单词", "中文释义", "来源", "学习重点", "掌握状态", "记录日期"],
  ["contract", "n. 合同，契约\nv. 收缩", "阅读", "拼写，听辨", "未掌握", "2026/11/10"],
  ["contract", "n. 合约　协议", "阅读", "听辨", "未掌握", "2026-11-10 12:30"],
  ["scope", "n. 范围", "听力", "拼写", "已掌握", "2026/11/09"],
  ["missing", "", "阅读", "", "未掌握", "2026/11/10"],
  ["", "无单词", "", "", "", ""],
];
function fixture(input = data) {
  const table = parseTable("\uFEFF" + Papa.unparse(input));
  const header = hasKnownHeader(table.data[0]);
  return { table, header, mapping: suggestCsvPreviewMapping(table, header) };
}

test("temporary CSV selection preserves duplicate terms, file order, multiline and fullwidth spacing, and counts invalid rows", () => {
  const { table, header, mapping } = fixture();
  const before = JSON.stringify(table);
  const result = selectCsvPreviewRows(table, header, mapping);
  assert.equal(result.total, 5); assert.equal(result.invalid, 2); assert.equal(result.filtered, 0);
  assert.deepEqual(result.rows.map(row => row.word), ["contract", "contract", "scope"]);
  assert.equal(result.rows[0].definition, "n. 合同，契约\nv. 收缩");
  assert.equal(result.rows[1].definition, "n. 合约　协议");
  assert.equal(JSON.stringify(table), before);
});

test("source, status and normalized date filters apply only to file rows and preserve selected attributes", () => {
  const {table, header, mapping} = fixture();
  const result = selectCsvPreviewRows(table, header, mapping, {source:"阅读",status:"未掌握",date:"2026-11-10"});
  assert.equal(result.rows.length, 2); assert.equal(result.filtered, 1); assert.equal(result.invalid, 2);
  const cards = createCsvPreviewCards(result.rows, mapping);
  assert.notEqual(cards[0].id, cards[1].id);
  assert.deepEqual(cards[0].senses, [{pos:"n.",text:"合同，契约"},{pos:"v.",text:"收缩"}]);
  assert.equal(cards[0].previewAttributes.find(a=>a.label==="掌握状态").value, "未掌握");
  assert.equal(cards[0].previewAttributes.find(a=>a.label==="标签").value, "拼写，听辨");
  assert.equal(cards[0].progress.stage, "new");
  const empty = selectCsvPreviewRows(table, header, mapping, {source:"不存在"});
  assert.equal(empty.rows.length,0); assert.equal(empty.filtered,3);
});

test("mapping errors reject missing, duplicate and out-of-range columns; optional mappings can be omitted", () => {
  const {table, header, mapping} = fixture();
  assert.equal(previewMappingError(mapping,table.width), "");
  for(const bad of [{...mapping,word:-1},{...mapping,definition:0},{...mapping,tags:0},{...mapping,source:999},{...mapping,word:0.5}]) {
    assert.ok(previewMappingError(bad,table.width));
    assert.throws(()=>selectCsvPreviewRows(table,header,bad));
  }
  const minimal={word:0,definition:1};
  const result=selectCsvPreviewRows(table,header,minimal);
  assert.ok(createCsvPreviewCards(result.rows,minimal).every(c=>c.previewAttributes.length===0));
});

test("headerless TSV and semicolon files use manual column mappings and do not lose the first term", () => {
  const table=parseTable('合同\tcontract\nn. 范围\tscope');
  const result=selectCsvPreviewRows(table,false,{word:1,definition:0});
  assert.deepEqual(result.rows.map(r=>r.word),["contract","scope"]);
  const semicolon=parseTable('word;meaning\ncontract;"n. 合同;契约"', ';');
  assert.equal(selectCsvPreviewRows(semicolon,true,{word:0,definition:1}).rows[0].definition,"n. 合同;契约");
  assert.throws(()=>parseTable('word,definition\ncontract,"not closed'),/引号/);
});

test("empty and header-only data cannot produce cards", () => {
  const {table,header,mapping}=fixture([data[0]]);
  assert.equal(selectCsvPreviewRows(table,header,mapping).rows.length,0);
  assert.ok(previewMappingError({},0));
});

test("CSV preparation and card traversal do not read or write the existing library", async () => {
  const store = JSON.stringify({version:7,cards:[],books:[],reviews:[],importBatches:[],learnCheckpoint:null});
  globalThis.localStorage = {getItem:()=>store,setItem:()=>{throw Error("unexpected write")}};
  await loadLibrary();
  const before=JSON.stringify(state);
  globalThis.localStorage = {getItem:()=>{throw Error("unexpected read")},setItem:()=>{throw Error("unexpected write")}};
  const {table,header,mapping}=fixture();
  const rows=selectCsvPreviewRows(table,header,mapping).rows;
  const beforeRows=JSON.stringify(rows);
  let session=createBrowseSession(createCsvPreviewCards(rows,mapping));
  for(let i=0;i<rows.length;i++)session=moveBrowse(session,1);
  session=moveBrowse(session,-1);
  assert.equal(JSON.stringify(rows),beforeRows);
  assert.equal(JSON.stringify(state),before);
});
