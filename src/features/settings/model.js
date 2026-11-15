export const DEFAULT_SETTINGS = {
  dailyNew: 20,
  groupSize: 10,
  dailyReview: null,
  trashRetentionDays: 7,
  dictationReplays: 2,
  dictationDailyNew: 10,
  dictationDailyReview: 20,
  dictationGroupSize: 10,
};

export function normalizeSettings(raw = {}) {
  return {
    trashRetentionDays:
      Number.isSafeInteger(raw.trashRetentionDays) &&
      raw.trashRetentionDays >= 1 &&
      raw.trashRetentionDays <= 365
        ? raw.trashRetentionDays
        : 7,
    dailyNew: raw.dailyNew ?? DEFAULT_SETTINGS.dailyNew,
    groupSize: raw.groupSize ?? DEFAULT_SETTINGS.groupSize,
    dailyReview:
      Number.isSafeInteger(raw.dailyReview) && raw.dailyReview >= 0
        ? raw.dailyReview
        : DEFAULT_SETTINGS.dailyReview,
    dictationReplays:
      Number.isSafeInteger(raw.dictationReplays) &&
      raw.dictationReplays >= 0 &&
      raw.dictationReplays <= 5
        ? raw.dictationReplays
        : DEFAULT_SETTINGS.dictationReplays,
    dictationDailyNew:
      Number.isSafeInteger(raw.dictationDailyNew) &&
      raw.dictationDailyNew >= 0 &&
      raw.dictationDailyNew <= 200
        ? raw.dictationDailyNew
        : DEFAULT_SETTINGS.dictationDailyNew,
    dictationDailyReview:
      raw.dictationDailyReview === null
        ? null
        : Number.isSafeInteger(raw.dictationDailyReview) &&
            raw.dictationDailyReview >= 0
          ? raw.dictationDailyReview
          : DEFAULT_SETTINGS.dictationDailyReview,
    dictationGroupSize:
      Number.isSafeInteger(raw.dictationGroupSize) &&
      raw.dictationGroupSize >= 1 &&
      raw.dictationGroupSize <= 50
        ? raw.dictationGroupSize
        : DEFAULT_SETTINGS.dictationGroupSize,
  };
}
