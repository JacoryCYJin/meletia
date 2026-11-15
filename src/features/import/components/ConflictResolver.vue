<script setup>
const props = defineProps({
  conflicts: { type: Array, required: true },
  resolutions: { type: Object, required: true },
});
const emit = defineEmits(["update:resolutions"]);

function selectVersion(key, value) {
  emit("update:resolutions", { ...props.resolutions, [key]: value });
}
</script>

<template>
  <section class="import-conflicts" aria-labelledby="import-conflicts-title">
    <h2 id="import-conflicts-title">选择释义版本</h2>
    <p class="muted">
      同一个词有不同释义。每个词选择一个版本，默认采用最后一个导入版本。
    </p>
    <fieldset
      v-for="conflict in conflicts"
      :key="conflict.key"
      class="import-conflict"
    >
      <legend>{{ conflict.term }}</legend>
      <div class="import-versions">
        <label
          v-for="(version, index) in conflict.versions"
          :key="index"
          class="import-version"
          :class="{ selected: conflict.selected === index }"
        >
          <span>
            <input
              type="radio"
              :name="'import-version-' + conflict.key"
              :value="index"
              :checked="conflict.selected === index"
              @change="selectVersion(conflict.key, $event.target.value)"
            />
            <strong>{{
              version.row
                ? "导入版本 " + (conflict.card ? index : index + 1)
                : "当前版本"
            }}</strong>
            <small v-if="conflict.selected === index">将采用</small>
          </span>
          <span class="import-version-definition">{{
            version.definition
          }}</span>
        </label>
      </div>
    </fieldset>
  </section>
</template>
