<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { learningCalendar } from "../../core/stats.js";

const props = defineProps({
  reviews: { type: Array, required: true },
  now: { type: Date, required: true },
});
const calendar = computed(() => learningCalendar(props.reviews, props.now));
const days = computed(() =>
  calendar.value.weeks.flat().filter((day) => day.inRange),
);
const selectedDay = ref("");
const tabDay = ref(calendar.value.end);
const tooltip = ref(null);
const scroller = ref(null);
const cellSize = ref(10);
let resizeObserver;
function fitCells() {
  const width = scroller.value?.clientWidth;
  if (!width) return;
  const gap = Number.parseFloat(getComputedStyle(scroller.value.parentElement).getPropertyValue("--calendar-gap")) || 3;
  const columns = calendar.value.weeks.length;
  cellSize.value = Math.max(10, Math.floor((width - 36 - gap * (columns + 2)) / columns * 100) / 100);
  refreshTooltip();
  nextTick(showLatest);
}
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const ranges = ["0 次", "1–9 次", "10–29 次", "30–59 次", "60 次及以上"];
const total = computed(() =>
  days.value.reduce((sum, day) => sum + day.count, 0),
);
const description = (day) => `${day.day}，${day.count} 次学习与复习评分`;

function showTooltip(event, day) {
  const rect = event.currentTarget.getBoundingClientRect();
  tooltip.value = {
    day: day.day,
    text: description(day),
    x: Math.max(
      128,
      Math.min(window.innerWidth - 128, rect.x + rect.width / 2),
    ),
    y: rect.y - 8,
  };
}
function leaveCell(event) {
  if (document.activeElement !== event.currentTarget) tooltip.value = null;
}
function focusCell(event, day) {
  tabDay.value = day.day;
  showTooltip(event, day);
}
async function move(event, day) {
  const index = days.value.findIndex((item) => item.day === day.day);
  const deltas = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
  let destination;
  if (event.key in deltas)
    destination =
      days.value[
        Math.max(0, Math.min(days.value.length - 1, index + deltas[event.key]))
      ];
  else if (event.key === "Home" || event.key === "End") {
    const row = event.ctrlKey
      ? days.value
      : days.value.filter((item) => item.weekday === day.weekday);
    destination = event.key === "Home" ? row[0] : row.at(-1);
  } else return;
  event.preventDefault();
  tabDay.value = destination.day;
  await nextTick();
  const element = scroller.value.querySelector(
    `[data-day="${destination.day}"]`,
  );
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function refreshTooltip() {
  if (!tooltip.value) return;
  const element = scroller.value?.querySelector(
    `[data-day="${tooltip.value.day}"]`,
  );
  const day = days.value.find((item) => item.day === tooltip.value.day);
  if (element && day) showTooltip({ currentTarget: element }, day);
}
function hideTooltip(event) {
  if (event.key === "Escape") tooltip.value = null;
}
function showLatest() {
  if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth;
}
watch(
  () => calendar.value.end,
  async () => {
    if (!days.value.some((day) => day.day === tabDay.value))
      tabDay.value = calendar.value.end;
    if (!days.value.some((day) => day.day === selectedDay.value))
      selectedDay.value = "";
    tooltip.value = null;
    await nextTick();
    fitCells();
    showLatest();
  },
);
onMounted(() => {
  fitCells();
  resizeObserver = new ResizeObserver(fitCells);
  resizeObserver.observe(scroller.value);
  showLatest();
  window.addEventListener("resize", fitCells);
  window.addEventListener("scroll", refreshTooltip, true);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", fitCells);
  window.removeEventListener("scroll", refreshTooltip, true);
});
</script>

<template>
  <section class="learning-calendar" :style="{ '--calendar-cell': `${cellSize}px`, '--calendar-weeks': calendar.weeks.length }">
    <div class="section-line">
      <h2>最近一年</h2>
      <span>学习与复习评分次数</span>
    </div>
    <div ref="scroller" class="calendar-scroll" @keydown="hideTooltip">
      <table
        class="calendar-grid"
        role="grid"
        aria-readonly="true"
        aria-label="最近一年的每日学习与复习评分次数"
      >
        <caption class="sr-only">
          {{
            calendar.start
          }}
          至
          {{
            calendar.end
          }}；使用方向键浏览日期，按回车查看该日记录。
        </caption>
        <thead>
          <tr>
            <td class="calendar-weekday"></td>
            <td
              v-for="month in calendar.months"
              :key="month.key"
              :colspan="Math.max(1, month.span)"
              class="calendar-month"
            >
              <span :class="{ 'sr-only': month.span < 2 }">{{
                month.label
              }}</span>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(weekday, row) in weekdays" :key="weekday">
            <th scope="row" class="calendar-weekday">
              <span :class="{ 'sr-only': ![1, 3, 5].includes(row) }">{{
                weekday
              }}</span>
            </th>
            <td
              v-for="(week, column) in calendar.weeks"
              :key="column"
              role="gridcell"
              :aria-selected="
                week[row].inRange ? selectedDay === week[row].day : undefined
              "
            >
              <button
                v-if="week[row].inRange"
                type="button"
                class="calendar-cell"
                :data-level="week[row].level"
                :data-day="week[row].day"
                :class="{ 'calendar-selected': selectedDay === week[row].day }"
                :tabindex="tabDay === week[row].day ? 0 : -1"
                :aria-label="description(week[row])"
                :aria-describedby="
                  tooltip?.day === week[row].day
                    ? 'learning-day-tooltip'
                    : undefined
                "
                @mouseenter="showTooltip($event, week[row])"
                @mouseleave="leaveCell"
                @focus="focusCell($event, week[row])"
                @blur="tooltip = null"
                @click="
                  selectedDay = week[row].day;
                  tabDay = week[row].day;
                "
                @keydown="move($event, week[row])"
              ></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="calendar-footer">
    <p class="calendar-note">
      {{
        total
          ? `${calendar.start} 至 ${calendar.end}，共 ${total} 次评分记录。`
          : "还没有学习记录，完成第一组学习后，这里会逐日留下你的进度。"
      }}
    </p>
      <div class="calendar-legend" aria-label="颜色由浅到深代表评分次数增加">
        <span>少</span
        ><span
          v-for="(range, level) in ranges"
          :key="level"
          class="calendar-swatch"
          :data-level="level"
          :title="range"
          ><span class="sr-only">{{ range }}</span></span
        ><span>多</span>
      </div>
    </div>
    <Teleport to="body"
      ><div
        v-if="tooltip"
        id="learning-day-tooltip"
        role="tooltip"
        class="calendar-tooltip"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      >
        {{ tooltip.text }}
      </div></Teleport
    >
  </section>
</template>

<style scoped>
.learning-calendar {
  --calendar-gap: 3px;
  --calendar-0: #eff2f5;
  --calendar-1: #f8e6d5;
  --calendar-2: #edc29b;
  --calendar-3: #ce9565;
  --calendar-4: #9a6039;
}
.calendar-scroll {
  overflow-x: auto;
  scroll-padding-inline: 36px 4px;
  padding: 8px 0;
  margin-top: 8px;
  scrollbar-width: thin;
}
.calendar-grid {
  width: 100%;
  min-width: calc(36px + var(--calendar-weeks) * (10px + var(--calendar-gap)) + 2 * var(--calendar-gap));
  border-collapse: separate;
  border-spacing: var(--calendar-gap);
  table-layout: fixed;
}
.calendar-grid :is(td, th) {
  padding: 0;
  border: 0;
  height: var(--calendar-cell);
  line-height: var(--calendar-cell);
}
.calendar-grid td:not(.calendar-month, .calendar-weekday) {
  width: var(--calendar-cell);
  min-width: 10px;
}
.calendar-grid .calendar-weekday {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--bg);
  width: 36px;
  min-width: 28px;
  padding-right: 8px;
  font-size: 10px;
  font-weight: 400;
  color: var(--muted);
  text-align: left;
}
.calendar-grid .calendar-month {
  height: 24px;
  font-size: 11px;
  line-height: 16px;
  color: var(--muted);
  vertical-align: top;
  text-align: left;
  white-space: nowrap;
}
.calendar-cell,
.calendar-swatch {
  --cell-color: var(--calendar-0);
  width: 10px;
  height: 10px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: var(--cell-color);
}
[data-level="1"] {
  --cell-color: var(--calendar-1);
}
[data-level="2"] {
  --cell-color: var(--calendar-2);
}
[data-level="3"] {
  --cell-color: var(--calendar-3);
}
[data-level="4"] {
  --cell-color: var(--calendar-4);
}
.calendar-cell {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  min-height: 10px;
  display: block;
}
.calendar-cell:hover,
.calendar-cell:active {
  background: var(--cell-color);
  filter: brightness(0.9);
}
.calendar-cell.calendar-selected {
  box-shadow: 0 0 0 1px var(--ink);
}
.calendar-cell:focus-visible {
  outline-offset: 1px;
}
.calendar-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.calendar-note {
  font-size: 12px;
  color: var(--muted);
}
.calendar-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--muted);
}
.calendar-legend > span:first-child {
  margin-right: 4px;
}
.calendar-legend > span:last-child {
  margin-left: 4px;
}
.calendar-note {
  margin-top: 0;
  flex: 1;
  min-width: 0;
}
.calendar-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  z-index: 20;
  pointer-events: none;
  background: var(--ink);
  color: var(--bg);
  border: 0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  max-width: calc(100vw - 24px);
  width: max-content;
}
@media (max-height: 750px), (min-width: 1400px) and (min-aspect-ratio: 2/1) {
  .learning-calendar { --calendar-gap: 2px; }
  .section-line { margin-bottom: 4px; gap: 8px; }
  .section-line h2 { font-size: 14px; }
  .section-line > span { font-size: 11px; }
  .calendar-scroll { padding: 2px 0; margin-top: 0; }
  .calendar-grid .calendar-month { height: 20px; }
  .calendar-footer { margin-top: 4px; gap: 4px 12px; }
  .calendar-note { font-size: 11px; line-height: 1.4; }
  .calendar-note { margin-top: 0; }
}
@media (prefers-color-scheme: dark) {
  .learning-calendar {
    --calendar-0: #252b30;
    --calendar-1: #493629;
    --calendar-2: #79553c;
    --calendar-3: #b17c50;
    --calendar-4: #e6b887;
  }
}
</style>
