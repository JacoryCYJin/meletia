<script setup>
import Icon from "../../../shared/Icon.vue";

defineProps({
  requiredFields: { type: Array, required: true },
  extraFieldLabels: { type: Array, required: true },
  optionalFields: { type: Array, required: true },
  mapping: { type: Object, required: true },
  extraMappings: { type: Array, required: true },
  mappingColumns: { type: Array, required: true },
  validMapping: Boolean,
  incompleteMapping: Boolean,
  destination: { type: String, default: "new" },
  bookName: { type: String, default: "" },
});
const emit = defineEmits([
  "add",
  "remove",
  "set-property",
  "clear-filter",
]);
</script>

<template>
  <div class="import-mappings" aria-label="词条映射">
    <div class="import-mapping-row import-mapping-head">
      <span></span>
      <span>CSV 源列</span>
      <span>→ 导入属性</span>
    </div>
    <div
      v-for="field in requiredFields"
      :key="field.id"
      class="import-mapping-row"
    >
      <span>{{ field.label }}</span>
      <label class="import-field">
        <select v-model="mapping[field.id]" :aria-label="field.label + '的源列'">
          <option :value="-1">选择一列</option>
          <option
            v-for="column in mappingColumns"
            :key="column.index"
            :value="column.index"
          >
            {{ column.label }}
          </option>
        </select>
      </label>
      <label class="import-mapping-property">
        <input
          v-model="field.name"
          type="text"
          :aria-label="field.label + '的显示名称'"
          :placeholder="field.defaultName"
        />
        <small>必填</small>
      </label>
    </div>

    <div
      v-for="(row, index) in extraMappings"
      :key="row.id"
      class="import-mapping-row"
    >
      <span>{{ extraFieldLabels[index] }}</span>
      <label class="import-field">
        <select
          v-model="row.column"
          :aria-label="extraFieldLabels[index] + '的源列'"
          @change="emit('clear-filter', row.property)"
        >
          <option :value="-1">选择一列</option>
          <option
            v-for="column in mappingColumns"
            :key="column.index"
            :value="column.index"
          >
            {{ column.label }}
          </option>
        </select>
      </label>
      <label class="import-field">
        <select
          :value="row.property"
          :aria-label="extraFieldLabels[index] + '的属性'"
          @change="emit('set-property', row, $event.target.value)"
        >
          <option value="">选择属性</option>
          <option
            v-for="field in optionalFields"
            :key="field.id"
            :value="field.id"
            :disabled="
              extraMappings.some(
                (item) => item.id !== row.id && item.property === field.id,
              )
            "
          >
            {{ field.label }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="ghost import-remove-mapping"
        :aria-label="'删除' + extraFieldLabels[index]"
        @click="emit('remove', row)"
      >
        <Icon name="close" :size="14" />
      </button>
    </div>

    <button
      v-if="extraMappings.length < optionalFields.length"
      type="button"
      class="ghost import-add-mapping"
      @click="emit('add')"
    >
      <Icon name="plus" :size="14" /> 添加词条
    </button>
    <p v-if="!validMapping" class="field-error" role="status">
      请选择两个不同的源列，分别对应单词和释义。
    </p>
    <p v-if="destination === 'new' && !bookName.trim()" class="field-error">
      请填写新词书名称。
    </p>
    <p v-if="incompleteMapping" class="muted import-empty">
      请选择新增词条的属性和源列，或删除该条映射。
    </p>
  </div>
</template>
