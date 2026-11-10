import assert from 'node:assert/strict';
import test from 'node:test';
import Papa from 'papaparse';
import { newCard, localDay } from '../src/core/content.js';
import { withStudyAttempt, studyDaysOf } from '../src/core/study-status.js';
import { studyExport, studyRows, availableStudyDays } from '../src/core/study-export.js';
import { state, loadLibrary, createBook, importCards, saveStudyAttempt, saveStudyResult, undoStudyResult, graduate, missSpelling, reviewCard } from '../src/core/library.js';
const day1 = new Date(2026,10,8,23,59), day2 = new Date(2026,10,9,0,1);
const card = word => newCard({word,definition:'释义'});
const books = cards => [{name:'雅思',cardIds:cards.map(c=>c.id)}];

test('separate daily exports preserve yesterday while today changes repeatedly, without mutating prior snapshots',()=>{
 const first=withStudyAttempt(card('contract'),3,day1,true);
 const second=withStudyAttempt(first,1,day2);
 const final=withStudyAttempt(second,3,new Date(2026,10,9,12),true);
 assert.equal(studyRows([second],books([second]),[],'2026-11-08')[0].status,'已掌握');
 assert.equal(studyRows([second],books([second]),[],'2026-11-09')[0].status,'未掌握');
 assert.equal(studyRows([final],books([final]),[],'2026-11-09')[0].status,'已掌握');
 assert.equal(second.progress.masteryDays['2026-11-09'].status,'未掌握');
 assert.deepEqual(availableStudyDays([final],[],day2),['2026-11-09','2026-11-08']);
 assert.equal(studyRows([final],books([final]),[],'2026-11-07').length,0);
});

test('CSV quotes commas, newlines and Chinese, has BOM, distinct book ownership, date-specific names and no duplicate daily word rows',()=>{
 const a=withStudyAttempt(card('say "hello",\nworld'),3,day1,true);
 const b=withStudyAttempt(card(a.term),1,day1);
 const c=withStudyAttempt(card('today only'),3,day2,true);
 const bs=[{name:'书,"一"',cardIds:[a.id,a.id,c.id]},{name:'书二',cardIds:[b.id]}];
 const file=studyExport([a,b,c],bs,[],day2,'2026-11-08');
 assert.equal(file.rows.length,2);assert.ok(file.csv.startsWith('\uFEFF'));
 assert.deepEqual(Papa.parse(file.csv.slice(1),{skipEmptyLines:true}).data,[['词书','单词','掌握状态'],...file.rows.map(r=>[r.book,r.term,r.status])]);
 assert.match(file.filename,/^词语状态_2026-11-08_2026-11-09_/);
 assert.equal(studyExport([a,b,c],bs,[],day2).rows.length,1);
});

test('legacy results use the last saved outcome of each day; explicit daily statuses win over the scheduler first-error rating',()=>{
 const c=card('old');const logs=[{cardId:c.id,at:day1.toISOString(),stage:'learn',rating:3},{cardId:c.id,at:day2.toISOString(),stage:'review',rating:1},{cardId:c.id,at:new Date(2026,10,9,2).toISOString(),stage:'review',rating:3}].reverse();
 assert.equal(studyDaysOf(c,logs)['2026-11-08'].status,'已掌握');
 assert.equal(studyDaysOf(c,logs)['2026-11-09'].status,'已掌握');
 const saved=withStudyAttempt(c,1,day2,true);
 assert.equal(studyDaysOf(saved,[logs.at(-1),{cardId:c.id,at:day2.toISOString(),stage:'review',rating:1}])['2026-11-09'].status,'已掌握');
 assert.deepEqual(studyDaysOf(c,[{cardId:c.id,at:'invalid',stage:'learn',rating:3}]),{});
});

test('legacy progress-only history survives the next scheduler update, and new cards have isolated maps',()=>{
 const c=card('legacy');c.progress={...c.progress,stage:'reviewing',lastRating:3,lastSeenAt:day1.toISOString()};
 for(const next of [graduate(c,day2),reviewCard(c,1,day2),missSpelling(c,day2)]) assert.equal(studyDaysOf(next)['2026-11-08'].status,'已掌握');
 assert.notEqual(card('a').progress.masteryDays,card('b').progress.masteryDays);
});

test('local midnight and leap day separate records by calendar day',()=>{
 let c=withStudyAttempt(card('leap'),3,new Date(2024,1,29,23,59),true);
 c=withStudyAttempt(c,1,new Date(2024,2,1,0,0));
 assert.deepEqual(Object.keys(c.progress.masteryDays),['2024-02-29','2024-03-01']);
 assert.equal(localDay(new Date(2024,2,1)),'2024-03-01');
});

test('wrong attempts persist immediately without scoring; reload, relearn, spelling retry, undo and failed saves keep export consistent',async()=>{
 const values=new Map();let fail=false;
 globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('write failed');values.set(k,v);}};
 await loadLibrary();await createBook('测试');await importCards([{word:'word',definition:'释义'}],{bookId:state.books[0].id});
 const id=state.cards[0].id;
 await saveStudyResult(state.cards[0],'learn',3,day1);
 const scheduled=JSON.stringify(state.cards[0].progress.dueAt), count=state.reviews.length;
 await saveStudyAttempt(id,1,day2);
 assert.equal(state.reviews.length,count);assert.equal(JSON.stringify(state.cards[0].progress.dueAt),scheduled);
 await loadLibrary();assert.equal(studyRows(state.cards,state.books,state.reviews,'2026-11-09')[0].status,'未掌握');
 const token=await saveStudyResult(state.cards[0],'review',1,day2,undefined,{mastered:true});
 assert.equal(state.cards[0].progress.lastRating,1);assert.equal(studyRows(state.cards,state.books,state.reviews,'2026-11-09')[0].status,'已掌握');
 await undoStudyResult(token);assert.equal(studyRows(state.cards,state.books,state.reviews,'2026-11-09')[0].status,'未掌握');
 await saveStudyResult(state.cards[0],'spell',1,day2);
 await saveStudyAttempt(id,3,day2,undefined,true);
 assert.equal(state.cards[0].progress.needsRecall,true);assert.equal(studyRows(state.cards,state.books,state.reviews,'2026-11-09')[0].status,'已掌握');
 const before=JSON.stringify(state.cards);fail=true;
 await assert.rejects(saveStudyAttempt(id,1,day2),/write failed/);assert.equal(JSON.stringify(state.cards),before);fail=false;
 await loadLibrary();assert.equal(studyRows(state.cards,state.books,state.reviews,'2026-11-08')[0].status,'已掌握');
 assert.equal(studyRows(state.cards,state.books,state.reviews,'2026-11-09')[0].status,'已掌握');
 const saved=values.get('meletia-preview');studyExport(state.cards,state.books,state.reviews,day2,'2026-11-08');assert.equal(values.get('meletia-preview'),saved);
});
