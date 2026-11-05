<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Icon from "../../shared/Icon.vue";
import WordDetail from "../../shared/WordDetail.vue";
import {
  closeDetail,
  createLearnSession,
  createReviewSession,
  currentEntry,
  learn,
  leaveIntro,
  matchSpelling,
  progressOf,
  review,
  showDetail,
  showIntro,
  skipSpelling,
  spell,
  spellTarget,
} from "../../core/session.js";
import {
  cardById,
  commit,
  graduate,
  missSpelling,
  recordReview,
  reviewCard,
  setError,
  state,
} from "../../core/library.js";
import { dayTasks } from "../../core/stats.js";

const props = defineProps({ mode: { type: String, required: true } });
const emit = defineEmits(["close"]);

const learnGrades = [
  { value: 1, label: "不认识" },
  { value: 2, label: "模糊" },
  { value: 3, label: "认识" },
];

const session = ref(null);
const revealed = ref(false);
const answer = ref("");
const feedback = ref("");
const busy = ref(false);
const stage = ref(null);
const spellingInput = ref(null);
let feedbackTimer;

const grades = learnGrades;
const entry = computed(() =>
  session.value ? currentEntry(session.value) : null,
);
const card = computed(() => (entry.value ? cardById(entry.value.id) : null));
const intro = computed(() => showIntro(session.value));
const detail = computed(() => showDetail(session.value));
const progress = computed(() =>
  session.value ? progressOf(session.value) : { done: 0, total: 0 },
);
const percent = computed(() => {
  const { done, total } = progress.value;
  return total ? Math.round((done / total) * 100) : 0;
});
const spellingId = computed(() =>
  session.value ? spellTarget(session.value) : null,
);
const spellingCard = computed(() =>
  spellingId.value ? cardById(spellingId.value) : null,
);
const missedCount = computed(() => session.value?.spelling?.missed.length ?? 0);
const stageLabel = computed(() => (props.mode === "learn" ? "学习" : "复习"));
const reviewCount = computed(() =>
  card.value
    ? state.reviews.filter((item) => item.cardId === card.value.id).length + 1
    : 1,
);

function buildSession() {
  const now = new Date();
  const tasks = dayTasks(state.cards, state.books, state.settings, now);
  if (props.mode === "learn") {
    const cards = tasks.fresh.map((id) => cardById(id)).filter(Boolean);
    session.value = createLearnSession(
      cards,
      state.settings.groupSize,
      state.settings.learnStreak,
    );
  } else {
    session.value = createReviewSession([
      ...tasks.recall,
      ...tasks.review,
    ]);
  }
}

onMounted(() => {
  buildSession();
  window.addEventListener("keydown", onKey);
  nextTick(() => stage.value?.focus());
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  clearTimeout(feedbackTimer);
});

function begin() {
  if (!intro.value || busy.value) return;
  session.value = leaveIntro(session.value);
  nextTick(() => stage.value?.focus());
}

function flip() {
  if (!card.value || busy.value || revealed.value || intro.value) return;
  revealed.value = true;
}

async function grade(value) {
  if (busy.value || !session.value) return;
  if (props.mode === "learn" && !revealed.value) return;
  const current = card.value;
  if (!current) return;

  busy.value = true;
  try {
    const now = new Date();
    const next =
      props.mode === "learn"
        ? learn(session.value, value)
        : review(session.value, value);

    if (props.mode === "learn" && next.graduated) {
      const updated = graduate(current, now);
      await commit({
        cards: state.cards.map((item) =>
          item.id === current.id ? updated : item,
        ),
      });
    } else if (props.mode === "review") {
      const updated = reviewCard(current, value, now);
      await commit({
        cards: state.cards.map((item) =>
          item.id === current.id ? updated : item,
        ),
      });
    }

    await recordReview({
      cardId: current.id,
      at: now.toISOString(),
      stage: props.mode === "learn" ? "learn" : "review",
      rating: value,
    });

    session.value = next;
    revealed.value = false;

    nextTick(() => {
      if (session.value?.phase === "card") stage.value?.focus();
      if (session.value?.phase === "spell") spellingInput.value?.focus();
    });
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

function next() {
  if (busy.value) return;
  session.value = closeDetail(session.value);
  nextTick(() => stage.value?.focus());
}

function gradeLabel(value) {
  if (value === 3) return "认识";
  if (value === 2) return "模糊";
  return "不认识";
}

function mask(term) {
  return String(term ?? "")
    .split(" ")
    .map((word) => word[0] + "·".repeat(Math.max(0, word.length - 1)))
    .join(" ");
}

async function submitSpelling() {
  const target = spellingCard.value;
  if (!target || busy.value) return;
  const correct = matchSpelling(answer.value, target.term);

  busy.value = true;
  try {
    if (!correct) {
      feedback.value = "拼写不对，再来一次。";
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        feedback.value = "";
      }, 2400);

      const updated = missSpelling(target);
      await commit({
        cards: state.cards.map((item) =>
          item.id === target.id ? updated : item,
        ),
      });
      await recordReview({
        cardId: target.id,
        at: new Date().toISOString(),
        stage: "spell",
        rating: 1,
      });
    } else {
      feedback.value = "";
    }

    session.value = spell(session.value, correct);
    answer.value = "";
    nextTick(() => spellingInput.value?.focus());
  } catch (cause) {
    setError(cause);
  } finally {
    busy.value = false;
  }
}

function skip() {
  if (busy.value) return;
  session.value = skipSpelling(session.value);
}

function onKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  const typing = event.target?.closest?.("input,textarea,select");
  const phase = session.value?.phase;

  if (phase === "detail") {
    if (event.code === "Space" || event.key === "Enter") {
      event.preventDefault();
      next();
    }
    return;
  }

  if (phase === "card") {
    if (event.code === "Space" || event.key === "Enter") {
      event.preventDefault();
      if (intro.value) begin();
      else flip();
      return;
    }
    if (/^[1-3]$/.test(event.key) && (props.mode === "review" || revealed.value)) {
      event.preventDefault();
      grade(Number(event.key));
    }
    return;
  }

  if (phase === "spell") {
    if (event.key === "Escape") {
      event.preventDefault();
      skip();
      return;
    }
    if (!typing) nextTick(() => spellingInput.value?.focus());
    return;
  }

  if (phase === "finished" && event.key === "Enter") {
    event.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <section v-if="session" class="study">
    <header class="study-head">
      <button type="button" class="ghost" @click="emit('close')">
        <Icon name="close" :size="16" /> 结束
      </button>
      <p class="study-mode">{{ stageLabel }}</p>
      <div class="study-progress">
        <span>{{ progress.done }} / {{ progress.total }}</span>
        <div class="bar"><span :style="{ width: `${percent}%` }"></span></div>
      </div>
    </header>

    <div
      v-if="session.phase === 'card' && card && intro"
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <p class="stage-meta">
        <span>初识</span>
        <span>先看清这个词，等会儿要回忆</span>
        <span v-if="card.source" class="tag">{{ card.source }}</span>
      </p>

      <h2 class="term">{{ card.term }}</h2>
      <p v-if="card.phonetics?.uk || card.phonetics?.us" class="phonetic">
        /{{ card.phonetics.uk || card.phonetics.us }}/
      </p>

      <WordDetail :card="card" />

      <div class="stage-actions">
        <button type="button" class="primary big" @click="begin">
          开始回忆 <kbd>空格</kbd>
        </button>
      </div>
    </div>

    <div
      v-else-if="session.phase === 'card' && card && mode === 'review'"
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <p class="stage-meta">
        <span>复习</span>
        <span>第 {{ reviewCount }} 次见面</span>
        <span v-if="card.source" class="tag">{{ card.source }}</span>
      </p>

      <h2 class="term">{{ card.term }}</h2>
      <p v-if="card.phonetics?.uk || card.phonetics?.us" class="phonetic">
        /{{ card.phonetics.uk || card.phonetics.us }}/
      </p>

      <p class="waiting">先判断记不记得，不用急着看释义。</p>

      <div class="stage-actions">
        <button
          v-for="item in grades"
          :key="item.value"
          type="button"
          class="grade"
          :class="`grade-${item.value}`"
          :disabled="busy"
          @click="grade(item.value)"
        >
          {{ item.label }} <kbd>{{ item.value }}</kbd>
        </button>
      </div>
    </div>

    <div
      v-else-if="session.phase === 'detail' && card"
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <p class="stage-meta">
        <span>{{ gradeLabel(session.lastGrade) }}</span>
        <span>看一遍再继续</span>
        <span v-if="card.source" class="tag">{{ card.source }}</span>
      </p>

      <h2 class="term">{{ card.term }}</h2>
      <p v-if="card.phonetics?.uk || card.phonetics?.us" class="phonetic">
        /{{ card.phonetics.uk || card.phonetics.us }}/
      </p>

      <WordDetail :card="card" />

      <div class="stage-actions">
        <button type="button" class="primary big" @click="next">
          下一个 <kbd>空格</kbd>
        </button>
      </div>
    </div>

    <div
      v-else-if="session.phase === 'card' && card"
      ref="stage"
      class="stage"
      tabindex="-1"
    >
      <p class="stage-meta">
        <span>新词</span>
        <span>答对 {{ entry?.streak ?? 0 }} / {{ session.goal }} 次</span>
        <span v-if="card.source" class="tag">{{ card.source }}</span>
      </p>

      <h2 class="term">{{ card.term }}</h2>
      <p v-if="card.phonetics?.uk || card.phonetics?.us" class="phonetic">
        /{{ card.phonetics.uk || card.phonetics.us }}/
      </p>

      <p v-if="!revealed" class="waiting">先在心里回忆一遍，再显示释义。</p>
      <WordDetail v-else :card="card" />

      <div class="stage-actions">
        <button
          v-if="!revealed"
          type="button"
          class="primary big"
          @click="flip"
        >
          显示释义 <kbd>空格</kbd>
        </button>
        <template v-else>
          <button
            v-for="item in grades"
            :key="item.value"
            type="button"
            class="grade"
            :class="`grade-${item.value}`"
            :disabled="busy"
            @click="grade(item.value)"
          >
            {{ item.label }} <kbd>{{ item.value }}</kbd>
          </button>
        </template>
      </div>
    </div>

    <div v-else-if="session.phase === 'spell' && spellingCard" class="stage">
      <p class="stage-meta">
        <span>拼写</span>
        <span>
          {{ (session.spelling?.index ?? 0) + 1 }} /
          {{ session.spelling?.list.length }}
        </span>
      </p>

      <div class="senses spell-prompt">
        <p
          v-for="(sense, index) in spellingCard.senses"
          :key="index"
          class="sense"
        >
          <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
          <span>{{ sense.text }}</span>
        </p>
      </div>

      <p class="hint">{{ mask(spellingCard.term) }}</p>

      <form class="spell-form" @submit.prevent="submitSpelling">
        <input
          ref="spellingInput"
          v-model="answer"
          class="spell-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="输入英文，回车确认"
          aria-label="拼写英文词条"
        />
        <button type="submit" class="primary" :disabled="!answer.trim()">
          确认
        </button>
      </form>

      <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>

      <div class="stage-actions">
        <button type="button" class="ghost" @click="skip">
          跳过拼写 <kbd>Esc</kbd>
        </button>
      </div>
    </div>

    <div v-else class="stage finished">
      <p class="stage-meta"><span>完成</span></p>
      <h2>这一轮结束了</h2>
      <p class="waiting">
        完成 {{ progress.total }} 张{{ progress.total ? "，" : "" }}
        <template v-if="missedCount">
          拼写错过 {{ missedCount }} 个，会排到下次复习前面。
        </template>
        <template v-else-if="progress.total">拼写全部正确。</template>
      </p>
      <div class="stage-actions">
        <button type="button" class="primary big" @click="emit('close')">
          回到今日 <kbd>回车</kbd>
        </button>
      </div>
    </div>
  </section>
</template>
