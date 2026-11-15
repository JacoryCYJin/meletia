import { commit, state } from "../../storage/store.js";
import { validRetention } from "../trash/model.js";

export async function updateSettings(patch) {
  if (
    Object.hasOwn(patch, "trashRetentionDays") &&
    !validRetention(patch.trashRetentionDays)
  ) {
    throw new Error("请输入 1–365 之间的整数天数。");
  }
  await commit({ settings: { ...state.settings, ...patch } });
}
