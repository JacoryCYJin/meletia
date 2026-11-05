<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { state, updateBook, updateSettings } from "../../core/library.js";
import { bookStats } from "../../core/books.js";

const now = ref(new Date());
let timer;
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onUnmounted(() => clearInterval(timer));

const books = computed(() =>
  state.books.map((book) => ({
    book,
    stats: bookStats(book, state.cards, now.value),
  })),
);

const activeCount = computed(
  () => state.books.filter((book) => book.active).length,
);

async function setDailyNew(event) {
  const value = Math.min(200, Math.max(0, Number(event.target.value) || 0));
  await updateSettings({ dailyNew: value });
}

async function setGroup(event) {
  await updateSettings({ groupSize: Number(event.target.value) });
}

async function setStreak(event) {
  await updateSettings({ learnStreak: Number(event.target.value) });
}

async function toggle(book) {
  await updateBook(book.id, { active: !book.active });
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <p class="eyebrow">词书</p>
      <h1>{{ state.books.length }} 本词书</h1>
      <p class="lede">
        同时启用的词书会轮流取新词；一张卡可以属于多本，只学一次。
      </p>
    </header>

    <div class="settings">
      <label class="field">
        <span>每日新词</span>
        <input
          type="number"
          min="0"
          max="200"
          :value="state.settings.dailyNew"
          @change="setDailyNew"
        />
      </label>
      <label class="field">
        <span>每组词量</span>
        <select :value="state.settings.groupSize" @change="setGroup">
          <option :value="10">10</option>
          <option :value="15">15</option>
          <option :value="20">20</option>
        </select>
      </label>
      <label class="field">
        <span>答对几次进入复习</span>
        <select :value="state.settings.learnStreak" @change="setStreak">
          <option :value="3">3</option>
          <option :value="4">4</option>
          <option :value="5">5</option>
        </select>
      </label>
      <p class="settings-note">
        {{ activeCount }} 本启用中；新词按启用的词书交替出现。
      </p>
    </div>

    <ul class="book-list">
      <li v-for="{ book, stats } in books" :key="book.id" class="book-item">
        <div class="book-item-head">
          <div>
            <p class="book-title">{{ book.name }}</p>
            <p class="muted">
              {{ stats.total }} 张 · 已学 {{ stats.learned }} · 待学
              {{ stats.fresh }}
              <template v-if="stats.due"> · {{ stats.due }} 到期</template>
              <template v-if="stats.recall">
                · {{ stats.recall }} 回炉
              </template>
            </p>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ on: book.active }"
            :aria-pressed="book.active"
            @click="toggle(book)"
          >
            {{ book.active ? "启用中" : "已停用" }}
          </button>
        </div>
        <div class="meter">
          <span
            :style="{
              width: `${stats.total ? (stats.learned / stats.total) * 100 : 0}%`,
            }"
          ></span>
        </div>
      </li>
      <li v-if="!books.length" class="word-empty">
        还没有词书。导入 CSV 后会按来源自动分组。
      </li>
    </ul>
  </section>
</template>
