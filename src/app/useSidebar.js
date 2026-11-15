import { computed, onMounted, onUnmounted, ref } from "vue";

const sidebarPreference = "meletia-sidebar-width-v2";
const previousSidebarPreference = "meletia-sidebar-width";
export const minSidebarWidth = 58;

export function useSidebar() {
  const preferredSidebarWidth = ref(220);
  const windowWidth = ref(window.innerWidth);
  const maxSidebarWidth = computed(() =>
    Math.max(minSidebarWidth, Math.min(320, windowWidth.value - 448)),
  );
  const sidebarWidth = computed(() =>
    Math.max(
      minSidebarWidth,
      Math.min(maxSidebarWidth.value, preferredSidebarWidth.value),
    ),
  );
  const compactSidebar = computed(() => sidebarWidth.value < 168);
  const resizing = ref(false);
  const sidebarAnimating = ref(false);
  const sidebarElement = ref(null);
  let sidebarAnimationTimer;
  let dragOffset = 0;
  let dragStartWidth = 220;

  function rememberSidebarWidth() {
    try {
      localStorage.setItem(
        sidebarPreference,
        String(preferredSidebarWidth.value),
      );
    } catch {
      // Keep the current width for this window.
    }
  }

  function setSidebarWidth(width) {
    const next = Math.max(
      minSidebarWidth,
      Math.min(maxSidebarWidth.value, width),
    );
    if (next === sidebarWidth.value) return false;
    preferredSidebarWidth.value = next;
    return true;
  }

  function startResize(event) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    dragStartWidth = preferredSidebarWidth.value;
    stopSidebarAnimation(true);
    dragOffset = event.clientX - sidebarWidth.value;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.value = true;
  }

  function resizeSidebar(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setSidebarWidth(event.clientX - dragOffset);
    }
  }

  function finishResize() {
    resizing.value = false;
    if (dragStartWidth !== preferredSidebarWidth.value) rememberSidebarWidth();
  }

  function resizeWithKeyboard(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    stopSidebarAnimation(true);
    const widths = {
      ArrowLeft: sidebarWidth.value - 12,
      ArrowRight: sidebarWidth.value + 12,
      Home: minSidebarWidth,
      End: maxSidebarWidth.value,
    };
    if (!Object.hasOwn(widths, event.key)) return;
    event.preventDefault();
    if (setSidebarWidth(widths[event.key])) rememberSidebarWidth();
  }

  function stopSidebarAnimation(keepCurrentWidth = false) {
    if (keepCurrentWidth && sidebarAnimating.value && sidebarElement.value) {
      preferredSidebarWidth.value =
        sidebarElement.value.getBoundingClientRect().width;
    }
    clearTimeout(sidebarAnimationTimer);
    sidebarAnimating.value = false;
  }

  function finishSidebarAnimation(event) {
    if (
      event.target === event.currentTarget &&
      event.propertyName === "grid-template-columns"
    ) {
      stopSidebarAnimation();
    }
  }

  function toggleSidebar() {
    clearTimeout(sidebarAnimationTimer);
    sidebarAnimating.value = !window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    preferredSidebarWidth.value = compactSidebar.value
      ? 224
      : minSidebarWidth;
    rememberSidebarWidth();
    if (sidebarAnimating.value) {
      sidebarAnimationTimer = setTimeout(() => stopSidebarAnimation(), 360);
    }
  }

  function measureWindow() {
    stopSidebarAnimation();
    windowWidth.value = window.innerWidth;
  }

  onMounted(() => {
    try {
      const saved = localStorage.getItem(sidebarPreference);
      const previous =
        saved === null ? localStorage.getItem(previousSidebarPreference) : null;
      const width = Number(saved ?? previous);
      if (width >= minSidebarWidth && width <= 320) {
        preferredSidebarWidth.value =
          previous !== null && width === 64 ? minSidebarWidth : width;
        if (previous !== null) rememberSidebarWidth();
      }
    } catch {
      // Window resizing still works when preference storage is unavailable.
    }
    window.addEventListener("resize", measureWindow);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", measureWindow);
    clearTimeout(sidebarAnimationTimer);
  });

  return {
    preferredSidebarWidth,
    maxSidebarWidth,
    sidebarWidth,
    compactSidebar,
    resizing,
    sidebarAnimating,
    sidebarElement,
    rememberSidebarWidth,
    startResize,
    resizeSidebar,
    finishResize,
    resizeWithKeyboard,
    finishSidebarAnimation,
    toggleSidebar,
  };
}
