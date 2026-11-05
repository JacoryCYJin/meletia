<script setup>
defineProps({ card: { type: Object, required: true } });
</script>

<template>
  <div class="senses">
    <p v-for="(sense, index) in card.senses" :key="index" class="sense">
      <span v-if="sense.pos" class="pos">{{ sense.pos }}</span>
      <span>{{ sense.text }}</span>
    </p>
    <p v-if="!card.senses.length" class="sense muted">
      还没有释义，可以在「词库」里补。
    </p>

    <div v-if="card.phrases.length" class="block">
      <p class="block-label">词组</p>
      <p v-for="(phrase, index) in card.phrases" :key="index">
        <strong>{{ phrase.text }}</strong>
        <span>{{ phrase.meaning }}</span>
      </p>
    </div>

    <div v-if="card.examples.length" class="block">
      <p class="block-label">例句</p>
      <p v-for="(example, index) in card.examples" :key="index">
        {{ example.text }}
        <span v-if="example.translation" class="muted">
          {{ example.translation }}
        </span>
      </p>
    </div>

    <p v-if="card.note" class="block note">{{ card.note }}</p>
  </div>
</template>
