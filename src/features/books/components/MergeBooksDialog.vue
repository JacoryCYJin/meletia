<script setup>
import { computed, ref } from "vue";
import Modal from "../../../shared/Modal.vue";
import { state } from "../../../storage/store.js";
import { mergeBooks, previewBookMerge } from "../actions.js";

const props = defineProps({
  book: { type: Object, required: true },
});
const emit = defineEmits(["close", "merged"]);

const other = ref("");
const mode = ref("existing");
const priority = ref("source");
const name = ref("");
const pending = ref(false);
const error = ref("");

const preview = computed(() => {
  if (!props.book.id || !other.value) return null;
  const sourceFirst = mode.value === "new" && priority.value === "source";
  const [first, second] = sourceFirst
    ? [props.book.id, other.value]
    : [other.value, props.book.id];
  return previewBookMerge(first, second);
});

async function confirm() {
  if (!preview.value || pending.value) return;
  pending.value = true;
  error.value = "";
  try {
    const merged = await mergeBooks(
      preview.value.primary.id,
      preview.value.secondary.id,
      mode.value === "new" ? name.value : undefined,
    );
    emit("merged", merged);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <Modal
    wide
    title="合并词书"
    :description="'将「' + book.name + '」与另一本词书合并。'"
    :busy="pending"
    @close="emit('close')"
  >
    <form
      id="merge-book-form"
      class="stack-form merge-form"
      @submit.prevent="confirm"
    >
      <label class="field"
        ><span>合并方式</span
        ><select v-model="mode" :disabled="pending">
          <option value="existing">合入已有词书</option>
          <option value="new">合为一本新词书</option>
        </select></label
      >
      <label class="field"
        ><span>{{ mode === "new" ? "另一本词书" : "合入哪本词书" }}</span
        ><select v-model="other" :disabled="pending" required>
          <option value="">选择词书</option>
          <option
            v-for="item in state.books.filter((b) => b.id !== book.id)"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option>
        </select></label
      >
      <template v-if="mode === 'new'"
        ><label class="field"
          ><span>新词书名称</span
          ><input v-model="name" :disabled="pending" required placeholder="合并后的词书名称" /></label
        ><label class="field"
          ><span>重复词优先保留</span
          ><select v-model="priority" :disabled="pending">
            <option value="source">{{ book.name }}</option>
            <option value="other">
              {{
                state.books.find((b) => b.id === other)?.name || "另一本词书"
              }}
            </option>
          </select></label
        ></template
      >
      <div v-if="preview" class="result-summary">
        <h3>合并预览</h3>
        <dl>
          <div>
            <dt>移入</dt>
            <dd>{{ preview.moved }} 个词</dd>
          </div>
          <div>
            <dt>重复</dt>
            <dd>{{ preview.duplicates.size }} 个词</dd>
          </div>
          <div>
            <dt>合并后</dt>
            <dd>{{ preview.cardIds.length }} 个词</dd>
          </div>
        </dl>
        <p>
          重复词保留「{{ preview.primary.name }}」的释义和进度。{{
            mode === "new"
              ? "原来的两本词书将被移除。"
              : "「" + book.name + "」将被移除。"
          }}
        </p>
      </div>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    </form>
    <template #footer
      ><button :disabled="pending" @click="emit('close')">取消</button
      ><button
        class="primary"
        form="merge-book-form"
        :disabled="pending || !preview || (mode === 'new' && !name.trim())"
      >
        {{ pending ? "正在合并…" : "确认合并" }}
      </button></template
    >
  </Modal>
</template>
