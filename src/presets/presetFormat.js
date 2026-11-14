/* Общий формат пресета.

   В приложении три разных понятия «пресет»:
     - пресет палитры  — какие блоки доступны;
     - пресет стиля    — дизеринг, цвет, способ масштабирования;
     - пресет очистки  — фильтры очистки карты.

   Раньше они жили в трёх местах и выглядели по-разному, а общего формата
   не было вообще — из-за этого пресеты нельзя было ни выгрузить, ни
   раздать ссылкой, ни загрузить обратно. Теперь у всех один вид:

   {
     kind: "palette" | "style" | "cleanup",
     id: "устойчивый идентификатор",
     name: "название, если нет перевода",
     nameKey: "ключ перевода названия" (необязательно),
     description: "описание" (необязательно),
     descriptionKey: "ключ перевода описания" (необязательно),
     settings: { ... }  — что пресет меняет
   }

   Поле settings у пресетов разное: у палитры это { blocks }, у стиля —
   параметры дизеринга, у очистки — значения опций. Общее у них только то,
   что это обычный объект «ключ → значение», который можно положить в
   setState как есть. */

export const PRESET_KIND = {
  PALETTE: "palette",
  STYLE: "style",
  CLEANUP: "cleanup",
};

export const PRESET_KINDS = Object.values(PRESET_KIND);

/* Версия формата файла с пресетами. Растёт, когда меняется структура. */
export const PRESET_FORMAT = "mapartcraft-presets";
export const PRESET_FORMAT_VERSION = 1;

/* Собрать пресет нужного вида. */
export const makePreset = ({ kind, id, name, nameKey, description, descriptionKey, settings }) => {
  const preset = { kind, id, name };
  if (nameKey) preset.nameKey = nameKey;
  if (description) preset.description = description;
  if (descriptionKey) preset.descriptionKey = descriptionKey;
  preset.settings = settings || {};
  return preset;
};

/* Название пресета: перевод, если он есть, иназванный текст. */
export const presetName = (preset, getLocaleString) => {
  if (preset.nameKey && getLocaleString) {
    const translated = getLocaleString(preset.nameKey);
    if (translated) return translated;
  }
  return preset.name || "";
};

/* Старый сохранённый пресет палитры: { name, blocks, localeKey? }.
   Переводит его в общий формат. У старых пресетов идентификатором было
   имя — по нему и остаётся, чтобы ссылки и сохранённые настройки не
   потеряли смысл. */
export const toPalettePreset = (stored) => {
  if (stored && stored.kind === PRESET_KIND.PALETTE && stored.settings) return stored;
  return makePreset({
    kind: PRESET_KIND.PALETTE,
    id: stored && stored.name ? stored.name : "palette",
    name: stored && stored.name ? stored.name : "palette",
    nameKey: stored ? stored.localeKey || stored.nameKey : undefined,
    settings: { blocks: stored && stored.blocks ? stored.blocks : [] },
  });
};

/* Похож ли пресет на этот: тот же вид и то же имя. */
export const samePreset = (first, second) => first.kind === second.kind && (first.id === second.id || first.name === second.name);

/* Пресеты одного вида. */
export const presetsOfKind = (presets, kind) => presets.filter((preset) => preset.kind === kind);

/* Файл с пресетами: так его можно отдать пользователю или положить в
   репозиторий. */
export const presetsToJson = (presets) =>
  JSON.stringify({ format: PRESET_FORMAT, version: PRESET_FORMAT_VERSION, presets }, null, 2);

/* Разбор файла с пресетами. Возвращает пресеты и список ошибок — битый
   файл не должен ронять приложение. */
export const presetsFromJson = (text) => {
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { presets: [], errors: [`не удалось разобрать файл: ${error.message}`] };
  }
  if (!parsed || !Array.isArray(parsed.presets)) {
    return { presets: [], errors: ["в файле нет списка пресетов"] };
  }
  const presets = [];
  for (const entry of parsed.presets) {
    if (!entry || typeof entry !== "object") {
      errors.push("запись не объект");
      continue;
    }
    if (!PRESET_KINDS.includes(entry.kind)) {
      errors.push(`неизвестный вид пресета: ${entry.kind}`);
      continue;
    }
    if (typeof entry.id !== "string" || !entry.id) {
      errors.push(`у пресета «${entry.name || "?"}» нет идентификатора`);
      continue;
    }
    if (!entry.settings || typeof entry.settings !== "object") {
      errors.push(`у пресета «${entry.name || entry.id}» нет настроек`);
      continue;
    }
    presets.push({
      kind: entry.kind,
      id: entry.id,
      name: typeof entry.name === "string" ? entry.name : entry.id,
      ...(entry.nameKey ? { nameKey: entry.nameKey } : {}),
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.descriptionKey ? { descriptionKey: entry.descriptionKey } : {}),
      settings: entry.settings,
    });
  }
  return { presets, errors };
};
