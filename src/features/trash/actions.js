import { commit, state } from "../../storage/store.js";
import {
  isTrashExpired,
  removeTrashEntries,
  restoreTrashChanges,
} from "./model.js";

export async function restoreTrash(id, options = {}, now = new Date()) {
  await commit(restoreTrashChanges(state, id, options, now));
}

export async function purgeTrash(id) {
  if (!state.trash.some((entry) => entry.id === id)) {
    throw new Error("该回收项目已不存在。");
  }
  await commit(removeTrashEntries(state, [id]));
}

export async function emptyTrash() {
  await commit(removeTrashEntries(state, state.trash.map((entry) => entry.id)));
}

export async function cleanupTrash(now = new Date()) {
  if (!state.ready || state.busy) return;
  const ids = state.trash
    .filter((entry) => isTrashExpired(entry, now))
    .map((entry) => entry.id);
  if (ids.length) await commit(removeTrashEntries(state, ids));
}
