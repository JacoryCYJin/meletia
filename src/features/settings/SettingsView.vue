<script setup>
import { reactive, ref, watch } from "vue";
import { state, updateSettings } from "../../core/library.js";
import Icon from "../../shared/Icon.vue";
const values = reactive({ ...state.settings });
const errors = reactive({});
const saved = ref("");
const saving = ref("");
watch(
  () => state.settings,
  (settings) => Object.assign(values, settings),
);
async function save(key) {
  saved.value = "";
  errors[key] = "";
  const raw = values[key];
  const value =
    key === "dailyReview" && (raw === "" || raw === null) ? null : Number(raw);
  if (
    value !== null &&
    (!Number.isSafeInteger(value) ||
      value < 0 ||
      (key === "dailyNew" && value > 200))
  ) {
    errors[key] =
      key === "dailyNew"
        ? "请输入 0–200 之间的整数。"
        : "请输入非负整数，或留空表示不限。";
    return;
  }
  if (state.settings[key] === value) return;
  saving.value = key;
  try {
    await updateSettings({ [key]: value });
    saved.value = key;
  } catch (cause) {
    errors[key] = "未能保存，请重试。" + String(cause);
  } finally {
    saving.value = "";
  }
}
const fields = [
  {
    key: "dailyNew",
    label: "每日新词",
    hint: "每天最多安排多少个新词。填 0 暂停安排新词。",
    unit: "个 / 天",
    max: 200,
  },
  {
    key: "groupSize",
    label: "每组新词",
    hint: "完成一组辨识与回想后，再进入拼写。",
    unit: "个 / 组",
  },
  {
    key: "dailyReview",
    label: "每日复习上限",
    hint: "留空表示不限；填 0 暂停安排新的复习卡片。",
    unit: "个 / 天",
  },
];
</script>
<template>
  <section class="page settings-page">
    <header class="page-head">
      <h1>设置</h1>
      <p class="lede">找到适合自己的学习节奏。</p>
    </header>
    <div class="settings-layout">
      <section class="settings-section">
        <div class="section-line">
          <h2>学习与复习</h2>
          <span>修改后自动保存</span>
        </div>
        <div v-for="field in fields" :key="field.key" class="setting-row">
          <div>
            <label :for="field.key">{{ field.label }}</label>
            <p>{{ field.hint }}</p>
            <p
              v-if="errors[field.key]"
              :id="field.key + '-error'"
              class="field-error"
              role="alert"
            >
              {{ errors[field.key] }}
            </p>
          </div>
          <div class="setting-value">
            <div class="number-unit">
              <select
                v-if="field.key === 'groupSize'"
                :id="field.key"
                v-model="values[field.key]"
                :disabled="Boolean(saving)"
                @change="save(field.key)"
              >
                <option :value="10">10</option>
                <option :value="15">15</option>
                <option :value="20">20</option></select
              ><input
                v-else
                :id="field.key"
                v-model="values[field.key]"
                type="number"
                min="0"
                :max="field.max"
                step="1"
                :placeholder="field.key === 'dailyReview' ? '不限' : '0'"
                :aria-invalid="Boolean(errors[field.key])"
                :aria-describedby="
                  errors[field.key] ? field.key + '-error' : undefined
                "
                :disabled="Boolean(saving)"
                @change="save(field.key)"
              /><span>{{ field.unit }}</span>
            </div>
            <span class="save-status" role="status"
              ><template v-if="saving === field.key">正在保存…</template
              ><template v-else-if="saved === field.key"
                ><Icon name="check" :size="14" />已保存</template
              ><button
                v-else-if="errors[field.key]"
                class="text-button"
                @click="save(field.key)"
              >
                重试保存
              </button></span
            >
          </div>
        </div>
      </section>
      <aside class="settings-aside">
        <Icon name="history" :size="22" />
        <h3>进度会被记住</h3>
        <p>调整每日安排不会重置已完成的学习，也不会清除当前组的进度。</p>
        <p>词书、词条与复习记录只保存在这台电脑上。</p>
      </aside>
    </div>
  </section>
</template>
