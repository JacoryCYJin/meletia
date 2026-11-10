<script setup>
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { notifications } from "../core/notifications.js";
import Icon from "./Icon.vue";

const { visible, dismiss, pause, resume } = notifications;
const surface = ref(null);
const target = shallowRef(document.body);
let observer;
let mounted = false;

async function syncSurface() {
  await nextTick();
  const element = surface.value;
  if (!mounted || !element?.isConnected) return;
  if (typeof element.showPopover !== "function") {
    element.removeAttribute("popover");
  } else {
    if (visible.value.length && !element.matches(":popover-open"))
      element.showPopover();
    else if (!visible.value.length && element.matches(":popover-open"))
      element.hidePopover();
  }
  // Moving between the page and a dialog can end hover/focus without a leave event.
  for (const node of element.querySelectorAll(".toast-message")) {
    const id = Number(node.dataset.toastId);
    if (!node.matches(":hover")) resume(id, "pointer");
    if (!node.contains(document.activeElement)) resume(id, "focus");
  }
}
function updateTarget(records = []) {
  // A toast belongs to the active dialog so it stays interactive inside a modal.
  const opened = records.filter(
    (record) =>
      record.type === "attributes" && record.target.matches("dialog[open]"),
  );
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  const destination =
    opened.at(-1)?.target ??
    (target.value.isConnected && target.value.matches?.("dialog[open]")
      ? target.value
      : dialogs.at(-1)) ??
    document.body;
  if (destination !== target.value) {
    target.value = destination;
    syncSurface();
  }
}
watch(() => visible.value.length, syncSurface);
onMounted(() => {
  mounted = true;
  updateTarget();
  observer = new MutationObserver(updateTarget);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  syncSurface();
});
onBeforeUnmount(() => {
  mounted = false;
  observer?.disconnect();
  notifications.clear();
});
function leaveFocus(event, id) {
  if (!event.currentTarget.contains(event.relatedTarget)) resume(id, "focus");
}
</script>

<template>
  <Teleport :to="target">
    <div
      ref="surface"
      popover="manual"
      class="toast-host"
      :style="{ '--toast-count': visible.length || 1 }"
      :class="{ 'toast-host-empty': !visible.length }"
    >
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <div
          v-for="item in visible"
          :key="item.id"
          class="toast-message"
          :class="`toast-${item.type}`"
          :data-toast-id="item.id"
          :role="item.type === 'error' ? 'alert' : 'status'"
          aria-atomic="true"
          @mouseenter="pause(item.id, 'pointer')"
          @mouseleave="resume(item.id, 'pointer')"
          @focusin="pause(item.id, 'focus')"
          @focusout="leaveFocus($event, item.id)"
        >
          <Icon
            :name="
              item.type === 'success'
                ? 'check'
                : item.type === 'error'
                  ? 'alert'
                  : 'info'
            "
            :size="18"
          />
          <span>{{ item.message }}</span>
          <button
            type="button"
            class="icon-button"
            aria-label="关闭提示"
            @click="dismiss(item.id)"
          >
            <Icon name="close" :size="16" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  inset: 60px 24px auto auto;
  width: min(320px, calc(100vw - 32px));
  max-width: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  overflow: visible;
  pointer-events: none;
  z-index: 100;
}
.toast-host-empty {
  visibility: hidden;
}
.toast-host::backdrop {
  background: transparent;
  pointer-events: none;
}
.toast-stack {
  display: grid;
  gap: 12px;
}
.toast-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px 14px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--bg);
  box-shadow: var(--shadow);
  font-size: 13px;
  line-height: 1.6;
  pointer-events: auto;
}
.toast-message > svg {
  margin-top: 2px;
  flex: none;
}
.toast-success > svg {
  color: var(--success);
}
.toast-error > svg {
  color: var(--danger);
}
.toast-info > svg {
  color: var(--muted);
}
.toast-message > span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  max-height: calc(
    (100dvh - 84px - (var(--toast-count) - 1) * 12px) / var(--toast-count) -
      28px
  );
  overflow: auto;
}
.toast-message .icon-button {
  width: 26px;
  height: 26px;
  margin-top: -2px;
}
.toast-enter-active,
.toast-leave-active,
.toast-move {
  transition:
    opacity 160ms ease-out,
    transform 160ms ease-out;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
.toast-leave-active {
  position: absolute;
  width: 100%;
}
@media (max-width: 740px) {
  .toast-host {
    right: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: none;
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
