import { invoke, isTauri } from "@tauri-apps/api/core";
import { STORE_VERSION } from "./migrate.js";

export const PREVIEW_KEY = "meletia-preview";

export async function readRaw() {
  if (isTauri()) return invoke("load_library");
  return localStorage.getItem(PREVIEW_KEY);
}

export async function writeRaw(data) {
  if (isTauri()) {
    await invoke("save_library", { data });
    return;
  }
  localStorage.setItem(PREVIEW_KEY, data);
}

export function payload(next, state) {
  return JSON.stringify({
    version: STORE_VERSION,
    settings: next.settings ?? state.settings,
    books: next.books ?? state.books,
    cards: next.cards ?? state.cards,
    reviews: next.reviews ?? state.reviews,
    importBatches: next.importBatches ?? state.importBatches,
    trash: next.trash ?? state.trash,
    learnCheckpoint:
      next.learnCheckpoint === undefined
        ? state.learnCheckpoint
        : next.learnCheckpoint,
  });
}

export async function migrateRaw(original, data) {
  if (isTauri()) {
    await invoke("migrate_library", { original, data });
    return;
  }
  localStorage.setItem(`${PREVIEW_KEY}-before-v${STORE_VERSION}`, original);
  await writeRaw(data);
}
