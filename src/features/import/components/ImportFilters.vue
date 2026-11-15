<script setup>
const props = defineProps({
  filterOptions: { type: Object, required: true },
  filters: { type: Object, required: true },
  selectedMapping: { type: Object, required: true },
});
const emit = defineEmits(["update:filters"]);

function setFilter(field, value) {
  emit("update:filters", { ...props.filters, [field]: value });
}
</script>

<template>
  <div class="import-fields">
    <label v-if="filterOptions.status.length" class="import-field">
      <span>筛选掌握状态</span>
      <select
        :value="filters.status"
        @change="setFilter('status', $event.target.value)"
      >
        <option value="">全部</option>
        <option v-for="status in filterOptions.status" :key="status">
          {{ status }}
        </option>
      </select>
    </label>
    <label v-if="filterOptions.source.length" class="import-field">
      <span>筛选来源</span>
      <select
        :value="filters.source"
        @change="setFilter('source', $event.target.value)"
      >
        <option value="">全部</option>
        <option v-for="source in filterOptions.source" :key="source">
          {{ source }}
        </option>
      </select>
    </label>
    <label v-if="filterOptions.tags.length" class="import-field">
      <span>筛选标签</span>
      <select
        :value="filters.tags"
        @change="setFilter('tags', $event.target.value)"
      >
        <option value="">全部</option>
        <option v-for="tag in filterOptions.tags" :key="tag">
          {{ tag }}
        </option>
      </select>
    </label>
    <label v-if="selectedMapping.date >= 0" class="import-field">
      <span>筛选日期</span>
      <input
        :value="filters.date"
        type="date"
        @input="setFilter('date', $event.target.value)"
      />
    </label>
  </div>
</template>
