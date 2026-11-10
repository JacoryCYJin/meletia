import { computed, reactive, readonly } from "vue";

export function createNotificationCenter({
  limit = 3,
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle),
} = {}) {
  const items = reactive([]);
  const timers = new Map();
  const pauses = new Map();
  let sequence = 0;
  const visible = computed(() => items.slice(0, limit));

  function stop(id) {
    const timer = timers.get(id);
    if (!timer) return;
    cancel(timer.handle);
    timers.delete(id);
    const item = items.find((entry) => entry.id === id);
    if (item)
      item.remaining = Math.max(0, item.remaining - (now() - timer.started));
  }
  function start(item) {
    if (timers.has(item.id) || pauses.get(item.id)?.size) return;
    timers.set(item.id, {
      started: now(),
      handle: schedule(() => dismiss(item.id), item.remaining),
    });
  }
  function dismiss(id) {
    stop(id);
    pauses.delete(id);
    const index = items.findIndex((item) => item.id === id);
    if (index >= 0) items.splice(index, 1);
    visible.value.forEach(start);
  }
  function push(message, type = "info") {
    const text = String(message ?? "").trim();
    if (!text) return null;
    const duration = type === "error" ? 7000 : 5000;
    let item = items.find(
      (entry) => entry.message === text && entry.type === type,
    );
    if (item) {
      stop(item.id);
      item.remaining = duration;
    } else {
      items.push({ id: ++sequence, message: text, type, remaining: duration });
      item = items.at(-1);
    }
    visible.value.forEach(start);
    return item.id;
  }
  function pause(id, reason = "pointer") {
    if (!items.some((item) => item.id === id)) return;
    if (!pauses.has(id)) pauses.set(id, new Set());
    pauses.get(id).add(reason);
    stop(id);
  }
  function resume(id, reason = "pointer") {
    pauses.get(id)?.delete(reason);
    const item = visible.value.find((entry) => entry.id === id);
    if (item) start(item);
  }
  function clear() {
    for (const id of timers.keys()) stop(id);
    pauses.clear();
    items.splice(0);
  }
  return { visible: readonly(visible), push, dismiss, pause, resume, clear };
}

export const notifications = createNotificationCenter();
export const notify = {
  success: (message) => notifications.push(message, "success"),
  error: (message) => notifications.push(message, "error"),
  info: (message) => notifications.push(message, "info"),
};
