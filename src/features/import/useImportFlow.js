import { computed, reactive, ref, shallowRef, watch } from "vue";
import { state } from "../../storage/store.js";
import { splitTags } from "../library/model.js";
import { cardsInImportTarget, importCards } from "./actions.js";
import {
  hasKnownHeader,
  mapRows,
  parseTable,
  previewImport,
  suggestMapping,
} from "./csv.js";

export function useImportFlow() {
  const requiredFields = reactive(
    [
      { id: "word", label: "词条一", defaultName: "单词" },
      { id: "definition", label: "词条二", defaultName: "释义" },
    ].map((field) => ({ ...field, name: field.defaultName })),
  );
  const extraFieldLabels = ["词条三", "词条四", "词条五", "词条六"];
  const optionalFields = [
    { id: "source", label: "来源" },
    { id: "tags", label: "标签" },
    { id: "status", label: "掌握状态" },
    { id: "date", label: "记录日期" },
  ];
  const delimiters = [
    { value: ",", label: "逗号" },
    { value: "\t", label: "制表符" },
    { value: ";", label: "分号" },
  ];

  const fileName = ref("");
  const fileText = ref("");
  const delimiter = ref("");
  const table = shallowRef(null);
  const hasHeader = ref(false);
  const mapping = ref({});
  const extraMappings = ref([]);
  let nextMappingId = 0;
  const filters = ref({ status: "", source: "", tags: "", date: "" });
  const destination = ref("new");
  const bookName = ref("");
  const books = computed(() => state.books);
  const targetName = computed(() =>
    destination.value === "new"
      ? bookName.value
      : state.books.find((book) => book.id === destination.value)?.name ?? "",
  );
  const busy = ref(false);
  const error = ref("");
  const showRaw = ref(false);
  const step = ref("configure");
  const completed = ref(null);
  const dragging = ref(false);
  const resolutions = ref(Object.create(null));

  const columns = computed(() =>
    Array.from({ length: table.value?.width ?? 0 }, (_, index) => {
      const position = `第 ${index + 1} 列`;
      const heading = hasHeader.value
        ? table.value.data[0]?.[index]?.trim()
        : "";
      return {
        index,
        label: heading || position,
        rawLabel: heading ? `${position} · ${heading}` : position,
      };
    }),
  );
  const mappingColumns = computed(() => {
    const labels = new Map();
    for (const column of columns.value) {
      labels.set(column.label, (labels.get(column.label) ?? 0) + 1);
    }
    return columns.value.map((column) => ({
      ...column,
      label:
        labels.get(column.label) > 1 ? column.rawLabel : column.label,
    }));
  });
  const sample = computed(
    () =>
      table.value?.data.slice(
        hasHeader.value ? 1 : 0,
        hasHeader.value ? 6 : 5,
      ) ?? [],
  );
  const selectedMapping = computed(() => ({
    ...mapping.value,
    ...Object.fromEntries(
      extraMappings.value
        .filter(({ property, column }) => property && column >= 0)
        .map(({ property, column }) => [property, column]),
    ),
  }));
  const rows = computed(() =>
    table.value
      ? mapRows(table.value.data, hasHeader.value, selectedMapping.value)
      : [],
  );
  const filterOptions = computed(() =>
    Object.fromEntries(
      ["status", "source"]
        .map((field) => [
          field,
          [
            ...new Set(rows.value.map((row) => row[field]).filter(Boolean)),
          ].sort(),
        ])
        .concat([
          [
            "tags",
            [...new Set(rows.value.flatMap((row) => splitTags(row.tags)))].sort(),
          ],
        ]),
    ),
  );
  const validMapping = computed(
    () =>
      mapping.value.word >= 0 &&
      mapping.value.definition >= 0 &&
      mapping.value.word !== mapping.value.definition,
  );
  const preview = computed(() => {
    if (!table.value || !validMapping.value) return null;
    const existing =
      destination.value === "new"
        ? []
        : cardsInImportTarget(destination.value);
    return previewImport(
      rows.value,
      existing,
      filters.value,
      resolutions.value,
    );
  });
  watch(
    [destination, rows, filters],
    () => {
      resolutions.value = Object.create(null);
    },
    { deep: true },
  );
  const importCount = computed(
    () =>
      (preview.value?.added.length ?? 0) +
      (preview.value?.updated.length ?? 0),
  );
  const incompleteMapping = computed(() =>
    extraMappings.value.some(
      ({ property, column }) => !property || column < 0,
    ),
  );
  const canImport = computed(
    () =>
      importCount.value &&
      !incompleteMapping.value &&
      (destination.value !== "new" || bookName.value.trim()),
  );

  function addMapping() {
    extraMappings.value.push({
      id: nextMappingId++,
      property: "",
      column: -1,
    });
  }

  function clearFilter(property) {
    if (Object.hasOwn(filters.value, property)) {
      filters.value[property] = "";
    }
  }

  function setProperty(row, property) {
    clearFilter(row.property);
    row.property = property;
    if (row.column < 0) {
      row.column =
        suggestMapping(table.value, hasHeader.value)[property] ?? -1;
    }
  }

  function removeMapping(row) {
    clearFilter(row.property);
    extraMappings.value = extraMappings.value.filter(
      (item) => item.id !== row.id,
    );
  }

  function resetMapping() {
    const suggested = suggestMapping(table.value, hasHeader.value);
    mapping.value = {
      word: suggested.word,
      definition: suggested.definition,
    };
    for (const row of extraMappings.value) {
      row.column = suggested[row.property] ?? -1;
    }
    filters.value = { status: "", source: "", tags: "", date: "" };
  }

  function parseFile(detectHeader = false) {
    table.value = null;
    error.value = "";
    try {
      table.value = parseTable(fileText.value, delimiter.value);
      if (detectHeader) {
        hasHeader.value = hasKnownHeader(table.value.data[0]);
      }
      resetMapping();
    } catch (cause) {
      error.value = String(cause);
    }
  }

  async function readFile(file) {
    if (!file || busy.value) return;
    busy.value = true;
    error.value = "";
    table.value = null;
    fileName.value = "";
    showRaw.value = false;
    step.value = "configure";
    extraMappings.value = [];
    try {
      fileText.value = await file.text();
      fileName.value = file.name;
      delimiter.value = "";
      bookName.value = file.name.replace(/\.[^.]+$/, "").trim();
      destination.value = "new";
      parseFile(true);
    } catch (cause) {
      error.value = String(cause);
    } finally {
      busy.value = false;
    }
  }

  async function confirm() {
    if (!canImport.value || busy.value || state.busy) return;
    busy.value = true;
    error.value = "";
    try {
      const target =
        destination.value === "new"
          ? { name: bookName.value }
          : { bookId: destination.value };
      const updates = preview.value.updated.length;
      const duplicates = preview.value.duplicates;
      const added = await importCards(rows.value, target, {
        filters: filters.value,
        resolutions: resolutions.value,
        fileName: fileName.value,
      });
      completed.value = {
        added,
        updated: updates,
        duplicates,
        createdAt: state.importBatches.at(-1)?.createdAt,
        book:
          destination.value === "new"
            ? bookName.value
            : state.books.find((b) => b.id === destination.value)?.name,
      };
      step.value = "complete";
    } catch (cause) {
      error.value = String(cause);
    } finally {
      busy.value = false;
    }
  }

  return {
    requiredFields,
    extraFieldLabels,
    optionalFields,
    delimiters,
    fileName,
    table,
    hasHeader,
    mapping,
    extraMappings,
    filters,
    destination,
    bookName,
    books,
    targetName,
    busy,
    error,
    showRaw,
    step,
    completed,
    dragging,
    resolutions,
    columns,
    mappingColumns,
    sample,
    selectedMapping,
    rows,
    filterOptions,
    validMapping,
    preview,
    importCount,
    incompleteMapping,
    canImport,
    addMapping,
    clearFilter,
    setProperty,
    removeMapping,
    resetMapping,
    parseFile,
    readFile,
    confirm,
  };
}
