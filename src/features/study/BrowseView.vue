<script setup>
import { state } from "../../core/library.js";
import { todayBrowseCards } from "../../core/browse.js";
import ReadOnlyCards from "../../shared/ReadOnlyCards.vue";
const props = defineProps({ book: { type: Object, required: true } });
const emit = defineEmits(["close"]);
const cards = todayBrowseCards(props.book, state.cards, state.importBatches);
</script>

<template>
  <ReadOnlyCards :cards="cards" :title="book.name" label="今日过目" completion-title="今日过目完成" :completion-text="`已过目本词书的 ${cards.length} 个词，可以退出过目，或返回上一张继续查看。`" empty-title="今天暂无新增词" exit-label="退出过目" @exit="emit('close')" />
</template>
