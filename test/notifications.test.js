import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotificationCenter,
  notifications,
} from "../src/core/notifications.js";
import { setNotice, setError, state } from "../src/core/library.js";

function fixture() {
  let time = 0;
  let sequence = 0;
  const timers = new Map();
  const center = createNotificationCenter({
    now: () => time,
    schedule(callback, delay) {
      const id = ++sequence;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    cancel: (id) => timers.delete(id),
  });
  function advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  }
  return { center, advance, timers };
}

test("success and info expire after 5 seconds, errors after 7 seconds", () => {
  const { center, advance } = fixture();
  center.push("已保存", "success");
  center.push("提示", "info");
  center.push("保存失败", "error");
  advance(4999);
  assert.equal(center.visible.value.length, 3);
  advance(1);
  assert.deepEqual(
    center.visible.value.map((item) => item.message),
    ["保存失败"],
  );
  advance(2000);
  assert.equal(center.visible.value.length, 0);
});

test("same text and type merge and restart the full lifetime", () => {
  const { center, advance, timers } = fixture();
  const id = center.push("已删除", "success");
  advance(4000);
  assert.equal(center.push("已删除", "success"), id);
  assert.equal(center.visible.value.length, 1);
  assert.equal(timers.size, 1);
  advance(4999);
  assert.equal(center.visible.value.length, 1);
  advance(1);
  assert.equal(center.visible.value.length, 0);
});

test("only three messages count down; queued messages get their full display duration", () => {
  const { center, advance } = fixture();
  center.push("一", "error");
  center.push("二", "error");
  center.push("三", "error");
  center.push("四", "success");
  assert.equal(center.visible.value.length, 3);
  advance(7000);
  assert.deepEqual(
    center.visible.value.map((item) => item.message),
    ["四"],
  );
  advance(4999);
  assert.equal(center.visible.value.length, 1);
  advance(1);
  assert.equal(center.visible.value.length, 0);
});

test("pointer and keyboard focus pause independently and resume only the remaining duration", () => {
  const { center, advance } = fixture();
  const id = center.push("保留阅读时间");
  advance(2000);
  center.pause(id, "pointer");
  center.pause(id, "focus");
  advance(10000);
  center.resume(id, "pointer");
  advance(10000);
  assert.equal(center.visible.value.length, 1);
  center.resume(id, "focus");
  advance(2999);
  assert.equal(center.visible.value.length, 1);
  advance(1);
  assert.equal(center.visible.value.length, 0);
});

test("duplicates received while paused stay paused and restart after leaving", () => {
  const { center, advance } = fixture();
  const id = center.push("已保存");
  advance(4000);
  center.pause(id);
  center.push("已保存");
  advance(9000);
  assert.equal(center.visible.value.length, 1);
  center.resume(id);
  advance(4999);
  assert.equal(center.visible.value.length, 1);
  advance(1);
  assert.equal(center.visible.value.length, 0);
});

test("manual dismissal immediately promotes queued messages and clear cancels every timer", () => {
  const { center, advance, timers } = fixture();
  const id = center.push("一");
  center.push("二");
  center.push("三");
  center.push("四");
  center.dismiss(id);
  assert.deepEqual(
    center.visible.value.map((item) => item.message),
    ["二", "三", "四"],
  );
  assert.equal(timers.size, 3);
  center.clear();
  assert.equal(timers.size, 0);
  advance(10000);
  assert.equal(center.visible.value.length, 0);
  center.push("重新使用");
  assert.equal(timers.size, 1);
  center.clear();
});

test("empty messages are ignored and identical text with a different type remains distinct", () => {
  const { center } = fixture();
  assert.equal(center.push("  "), null);
  center.push("消息", "success");
  center.push("消息", "error");
  assert.equal(center.visible.value.length, 2);
});

test("existing global callers use toast while blocking startup errors stay recoverable", () => {
  notifications.clear();
  state.ready = true;
  state.error = "";
  setNotice("已删除。");
  setError("保存失败");
  assert.deepEqual(
    notifications.visible.value.map((item) => item.type),
    ["success", "error"],
  );
  assert.equal(state.error, "");
  state.ready = false;
  setError("启动失败");
  assert.equal(state.error, "启动失败");
  assert.equal(notifications.visible.value.length, 2);
  notifications.clear();
});
