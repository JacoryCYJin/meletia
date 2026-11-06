<script setup>
import Icon from "../../shared/Icon.vue";
import { setError, state, updateSettings } from "../../core/library.js";

async function save(setting, value) {
  if (state.settings[setting] === value) return;
  try {
    await updateSettings({ [setting]: value });
  } catch (cause) {
    setError(cause);
  }
}

function setDailyNew(event) {
  const value = Math.min(200, Math.max(0, Math.trunc(event.target.valueAsNumber) || 0));
  event.target.value = value;
  return save("dailyNew", value);
}

function setDailyReview(event) {
  const input = event.target;
  const value = input.valueAsNumber;
  if (!input.validity.badInput && input.value === "") return save("dailyReview", null);
  if (Number.isSafeInteger(value) && value >= 0) return save("dailyReview", value);
  input.value = state.settings.dailyReview ?? "";
  setError("每日复习上限请输入非负整数，或留空表示不限。");
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <h1>设置</h1>
      <p class="lede">调整每天的学习和复习安排。</p>
    </header>

    <div class="learning-settings">
      <label class="learning-setting">
        <span>每日新词</span>
        <input
          type="number"
          min="0"
          max="200"
          :value="state.settings.dailyNew"
          :disabled="state.busy"
          @change="setDailyNew"
        />
      </label>
      <label class="learning-setting">
        <span>每组新词量</span>
        <span class="select-control">
          <select
            :value="state.settings.groupSize"
            :disabled="state.busy"
            @change="save('groupSize', Number($event.target.value))"
          >
            <option :value="10">10</option>
            <option :value="15">15</option>
            <option :value="20">20</option>
          </select>
          <Icon name="chevronDown" :size="14" />
        </span>
      </label>
      <label class="learning-setting">
        <span>
          每日复习上限
          <small class="muted">留空表示不限，填 0 暂停安排新的复习卡片。</small>
        </span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="不限"
          :value="state.settings.dailyReview ?? ''"
          :disabled="state.busy"
          @change="setDailyReview"
        />
      </label>
    </div>
  </section>
</template>
