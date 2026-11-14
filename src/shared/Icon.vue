<script setup>
import { computed } from "vue";

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 20 },
});

const paths = {
  today:
    "M8 3.5v3M16 3.5v3M4 9.5h16M7.5 5h9a3.5 3.5 0 0 1 3.5 3.5v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-8A3.5 3.5 0 0 1 7.5 5ZM8 13h2m4 0h2m-8 4h2",
  library:
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  book: "M12 7c-1.7-2-4.3-2.7-7.3-2.1A2 2 0 0 0 3 6.9v9.4a1.6 1.6 0 0 0 2 1.6c2.9-.6 5.3.1 7 2.1 1.7-2 4.1-2.7 7-2.1a1.6 1.6 0 0 0 2-1.6V6.9a2 2 0 0 0-1.7-2C16.3 4.3 13.7 5 12 7Zm0 0v13",
  import: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  insights:
    "M6 18a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 1 1 3 0v3A1.5 1.5 0 0 1 6 18Zm6 0a1.5 1.5 0 0 1-1.5-1.5v-9a1.5 1.5 0 1 1 3 0v9A1.5 1.5 0 0 1 12 18Zm6 0a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 1 1 3 0v5A1.5 1.5 0 0 1 18 18Z",
  settings:
    "M10.2 3.8h3.6l.5 2.1c.5.2 1 .5 1.5.9l2.1-.6 1.8 3.1-1.5 1.5a6 6 0 0 1 0 1.8l1.5 1.5-1.8 3.1-2.1-.6c-.5.4-1 .7-1.5.9l-.5 2.1h-3.6l-.5-2.1c-.5-.2-1-.5-1.5-.9l-2.1.6-1.8-3.1 1.5-1.5a6 6 0 0 1 0-1.8L4.3 9.3l1.8-3.1 2.1.6c.5-.4 1-.7 1.5-.9l.5-2.1ZM14.4 11.7a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  panel:
    "M9 4v16M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  history: "M3 11a9 9 0 1 1 2.6 7M3 5v6h6m3-4v5l3 2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  alert: "m12 3 10 17H2L12 3Zm0 6v4m0 3h.01",
  info: "M12 8h.01M12 11v6m0 4a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8m-8 4h5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  close: "M18 6 6 18M6 6l12 12",
  arrowLeft: "m12 5-7 7 7 7M5 12h14",
  chevronDown: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  check: "M20 6 9 17l-5-5",
  volume:
    "M11 5 6 9H3v6h3l5 4V5Zm4.5 2a5 5 0 0 1 0 10m3-13a9 9 0 0 1 0 16",
  enter: "M20 4v7a4 4 0 0 1-4 4H5m0 0 4-4m-4 4 4 4",
};

const d = computed(() => paths[props.name] ?? "");
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="d" />
  </svg>
</template>
