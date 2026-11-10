import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { learningCalendar } from "../src/core/stats.js";

const valid = (calendar) => calendar.weeks.flat().filter((day) => day.inRange);
const date = (year, month, day, hour = 12) =>
  new Date(year, month - 1, day, hour);

test("the rolling year has complete Sunday-first week columns and only past/today cells in range", () => {
  const calendar = learningCalendar([], date(2026, 11, 8));
  assert.equal(calendar.start, "2025-11-09");
  assert.equal(calendar.end, "2026-11-08");
  assert.equal(valid(calendar).length, 365);
  assert.equal(new Set(valid(calendar).map((day) => day.day)).size, 365);
  assert.ok(
    calendar.weeks.every(
      (week) =>
        week.length === 7 && week[0].weekday === 0 && week[6].weekday === 6,
    ),
  );
  assert.deepEqual(
    calendar.weeks
      .at(-1)
      .slice(1)
      .map((day) => day.inRange),
    Array(6).fill(false),
  );
  assert.ok(valid(calendar).every((day) => day.count === 0 && day.level === 0));
});

test("leap-year anniversaries clamp correctly instead of dropping or duplicating a day", () => {
  for (const [now, first, length] of [
    [date(2024, 2, 29), "2023-03-01", 366],
    [date(2025, 2, 28), "2024-02-29", 366],
    [date(2026, 2, 28), "2025-03-01", 365],
  ]) {
    const calendar = learningCalendar([], now);
    assert.equal(calendar.start, first);
    assert.equal(valid(calendar).length, length);
    assert.equal(new Set(valid(calendar).map((day) => day.day)).size, length);
  }
});

test("ratings from all study modes count separately, with exact color boundaries", () => {
  const counts = [0, 1, 9, 10, 29, 30, 59, 60];
  const reviews = counts.flatMap((count, index) =>
    Array.from({ length: count }, (_, n) => ({
      at: date(2026, 11, index + 1).toISOString(),
      cardId: "same-word",
      stage: n % 2 ? "learn" : "review",
    })),
  );
  const before = JSON.stringify(reviews);
  const days = valid(learningCalendar(reviews, date(2026, 11, 8))).slice(-8);
  assert.deepEqual(
    days.map((day) => day.count),
    counts,
  );
  assert.deepEqual(
    days.map((day) => day.level),
    [0, 1, 1, 2, 2, 3, 3, 4],
  );
  assert.equal(JSON.stringify(reviews), before);
});

test("calendar boundaries include full local days while excluding old, future and invalid records", () => {
  const entries = [
    date(2025, 11, 8),
    date(2025, 11, 9, 0),
    date(2026, 11, 8, 0),
    date(2026, 11, 8, 23),
    date(2026, 11, 9),
  ].map((at) => ({ at: at.toISOString() }));
  entries.push({ at: "invalid" });
  const days = valid(learningCalendar(entries, date(2026, 11, 8)));
  assert.equal(days[0].count, 1);
  assert.equal(days.at(-1).count, 2);
  assert.equal(
    days.reduce((total, day) => total + day.count, 0),
    3,
  );
});

test("month labels cover every week without duplicate columns at short partial months", () => {
  for (let month = 1; month <= 12; month++) {
    const calendar = learningCalendar([], date(2026, month, 29));
    assert.equal(calendar.months[0].column, 0);
    assert.equal(
      calendar.months.reduce((sum, item) => sum + item.span, 0),
      calendar.weeks.length,
    );
    assert.ok(calendar.months.every((item) => item.span > 0));
    assert.equal(
      new Set(calendar.months.map((item) => item.column)).size,
      calendar.months.length,
    );
  }
});

test("local calendar days remain contiguous across daylight-saving changes", () => {
  const moduleURL = new URL("../src/core/stats.js", import.meta.url).href;
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { learningCalendar } from ${JSON.stringify(moduleURL)};
    const calendar = learningCalendar([
      { at: '2026-03-08T04:59:00Z' }, { at: '2026-03-08T05:01:00Z' },
    ], new Date(2026, 10, 8, 12));
    const days = calendar.weeks.flat().filter(day => day.inRange);
    console.log(JSON.stringify({ length: days.length, unique: new Set(days.map(d=>d.day)).size,
      march: days.filter(day => ['2026-03-07','2026-03-08'].includes(day.day)).map(day=>day.count) }));
  `,
    ],
    { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(result), {
    length: 365,
    unique: 365,
    march: [1, 1],
  });
});
