<script setup>
import { reactive, ref, watch } from "vue";
import { state, updateSettings } from "../../core/library.js";
import { notify } from "../../core/notifications.js";
import { RETENTION_OPTIONS, validRetention } from "../../core/recycle-bin.js";
import Icon from "../../shared/Icon.vue";
const values = reactive({ ...state.settings });
const errors = reactive({});
const saving = ref("");
const retentionChoice = ref(RETENTION_OPTIONS.includes(state.settings.trashRetentionDays) ? state.settings.trashRetentionDays : "custom");
async function changeRetentionChoice() {
  if (retentionChoice.value === "custom") return;
  values.trashRetentionDays = Number(retentionChoice.value);
  await saveRetention();
}
async function saveRetention() {
  errors.trashRetentionDays = "";
  const days = Number(values.trashRetentionDays);
  if (!validRetention(days)) { errors.trashRetentionDays = "请输入 1–365 之间的整数天数。"; return; }
  if (days === state.settings.trashRetentionDays) return;
  saving.value = "trashRetentionDays";
  try {
    await updateSettings({ trashRetentionDays: days });
    notify.success(`回收站保留时间已设为 ${days} 天。`);
  } catch (cause) { errors.trashRetentionDays = "未能保存，请重试。" + String(cause.message ?? cause); }
  finally { saving.value = ""; }
}
watch(
  () => state.settings,
  (settings) => Object.assign(values, settings),
);
async function save(key) {
  errors[key] = "";
  const raw = values[key];
  const optional = key === "dailyReview" || key === "dictationDailyReview";
  const value = optional && (raw === "" || raw === null) ? null : Number(raw);
  if (
    value !== null &&
    (!Number.isSafeInteger(value) ||
      value < 0 ||
      ((key === "dailyNew" || key === "dictationDailyNew") && value > 200))
  ) {
    errors[key] =
      key === "dailyNew" || key === "dictationDailyNew"
        ? "请输入 0–200 之间的整数。"
        : "请输入非负整数，或留空表示不限。";
    return;
  }
  if (key === "dictationReplays" && value > 5) {
    errors[key] = "请输入 0–5 之间的整数。";
    return;
  }
  if (key === "dictationGroupSize" && (value < 1 || value > 50)) {
    errors[key] = "请输入 1–50 之间的整数。";
    return;
  }
  if (state.settings[key] === value) return;
  saving.value = key;
  try {
    await updateSettings({ [key]: value });
    notify.success(
      `已保存「${fields.find((field) => field.key === key).label}」。`,
    );
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
    hint: "完成一组辨识与回想后，再进入拼写或听写。",
    unit: "个 / 组",
  },
  {
    key: "dictationReplays",
    label: "听写重播",
    hint: "听写时每个词最多可再听几次；用完仍未写出，按未听出处理。",
    unit: "次 / 词",
    max: 5,
  },
  {
    key: "dailyReview",
    label: "每日复习上限",
    hint: "留空表示不限；填 0 暂停安排新的复习卡片。",
    unit: "个 / 天",
  },
  {
    key: "dictationDailyNew",
    label: "听写每日新词",
    hint: "每天最多安排多少个没听写过的词。填 0 暂停安排。",
    unit: "个 / 天",
    max: 200,
  },
  {
    key: "dictationDailyReview",
    label: "听写每日复习上限",
    hint: "留空表示不限；填 0 暂停安排到期的听写词。",
    unit: "个 / 天",
  },
  {
    key: "dictationGroupSize",
    label: "听写每组词数",
    hint: "今日听写每次最多练多少个词。",
    unit: "个 / 组",
    max: 50,
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
                v-if="field.key === 'groupSize' || field.key === 'dictationGroupSize'"
                :id="field.key"
                v-model="values[field.key]"
                :disabled="Boolean(saving)"
                @change="save(field.key)"
              >
                <option :value="10">10</option>
                <option :value="15">15</option>
                <option :value="20">20</option>
                <option :value="30">30</option></select
              ><select
                v-else-if="field.key === 'dictationReplays'"
                :id="field.key"
                v-model="values[field.key]"
                :disabled="Boolean(saving)"
                @change="save(field.key)"
              >
                <option v-for="count in 6" :key="count" :value="count - 1">
                  {{ count - 1 }} 次
                </option></select
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
        <div class="section-line trash-settings-heading"><h2>回收站</h2><span>修改后自动保存</span></div>
        <div class="setting-row">
          <div>
            <label for="trash-retention">保留时间</label>
            <p>默认 7 天。仅影响之后删除的项目，已有项目的到期时间保持不变。</p>
            <p v-if="errors.trashRetentionDays" id="trash-retention-error" class="field-error" role="alert">{{ errors.trashRetentionDays }}</p>
          </div>
          <div class="setting-value">
            <div class="number-unit">
              <select id="trash-retention" v-model="retentionChoice" :disabled="Boolean(saving)" @change="changeRetentionChoice">
                <option v-for="days in RETENTION_OPTIONS" :key="days" :value="days">{{ days }} 天{{ days === 7 ? '（默认）' : '' }}</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div v-if="retentionChoice === 'custom'" class="number-unit">
              <input id="trash-retention-custom" v-model="values.trashRetentionDays" aria-label="自定义回收站保留天数" type="number" min="1" max="365" step="1" :disabled="Boolean(saving)" :aria-invalid="Boolean(errors.trashRetentionDays)" :aria-describedby="errors.trashRetentionDays ? 'trash-retention-error' : undefined" @change="saveRetention" /><span>天</span>
            </div>
            <span class="save-status" role="status"><template v-if="saving === 'trashRetentionDays'">正在保存…</template><button v-else-if="errors.trashRetentionDays" type="button" class="text-button" @click="saveRetention">重试保存</button></span>
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

<style scoped>
.trash-settings-heading { margin-top: 40px; }
#trash-retention { width: 100%; }
#trash-retention-custom { margin-top: 8px; }
</style>
