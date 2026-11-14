/* ==========================================================================
   optionSchema.js — единый реестр опций MapArtCraft Local Studio
   ==========================================================================
   Что здесь лежит и зачем:

   1. OPTION_SCHEMA — список ВСЕХ опций приложения: и тех, что видны в
      панели настроек (MapSettings), и тех, что живут в Studio-панели и
      в превью. У каждой опции есть ключ состояния, обработчик и группа.

   2. PERSISTED_OPTION_KEYS — список ключей, которые сохраняются в сессию.
      Раньше он был продублирован в двух ручных списках
      (mapartController.getStateFromSettings и getSettingsSnapshot);
      теперь он выводится из схемы. Забыть ключ в одном из списков
      было невозможно — списка больше нет.

   3. OPTION_TABS — табы правой колонки. Каждый таб собирает одну или
      несколько групп опций.

   Правило: чтобы добавить новую опцию, достаточно добавить одну запись
   в OPTION_SCHEMA (и ключ локализации, если нужен перевод).
   Ни getStateFromSettings, ни getSettingsSnapshot править не нужно.

   Формат записи:
     key         имя ключа в state (совпадает с именем пропа)
     handler     имя обработчика в mapartController (без скобок)
     type        select | checkbox | range | number | color | custom
     valueType   event (обработчик получит DOM-событие) | value (число)
     group       группа: output | mapdat | crop | preprocessing | colour
                 | dithering | cleanup
     labelKey    ключ локализации подписи
     tooltipKey  ключ локализации подсказки (необязательно)
     min/max/step границы для range/number
     options     массив {value, labelKey|label} или функция (values) => [...]
     showIf      (values) => boolean — показывать ли поле
     disabled    (values) => boolean — заблокировать ли поле
     form        false → опция не рисуется в панели настроек
     persisted   false → опция не попадает в снимок сессии
   ========================================================================== */

import BackgroundColourModes from "./json/backgroundColourModes.json";
import ColourMethods from "./json/colourMethods.json";
import CropModes from "./json/cropModes.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import SupportedVersions from "./json/supportedVersions.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import { getMaxMapSize } from "./canvasLimits";

/* --------------------------------------------------------------------------
   Вспомогательные построители
   -------------------------------------------------------------------------- */

const localeOptions = (collection) =>
  Object.values(collection).map((entry) => ({
    value: entry.uniqueId,
    labelKey: entry.localeKey,
  }));

const rangeValidator = (min, max) => [(value) => !isNaN(value), (value) => value >= min, (value) => value <= max];

/* Все методы дизеринга, отсортированные по category, а внутри — по sortOrder.
   uniqueId в JSON идут в произвольном порядке (0, 1, 13, 14, 25, 9, …), и
   сортировка по ним разбрасывала варианты одного алгоритма по списку:
   Atkinson (/6) оказывался после Atkinson (/12), а «Sierra (Filter Lite)» —
   в начале, отдельно от «Sierra». sortOrder задаёт порядок явно: сначала
   базовый метод, потом его варианты по возрастанию параметра. */
export const DITHER_CATEGORY_ORDER = ["none", "errorDiffusion", "ordered", "halftone", "blueNoise"];

export const DITHER_CATEGORY_LABELS = {
  none: "MAP-SETTINGS/DITHERING/CATEGORY/NONE",
  errorDiffusion: "MAP-SETTINGS/DITHERING/CATEGORY/ERROR-DIFFUSION",
  ordered: "MAP-SETTINGS/DITHERING/CATEGORY/ORDERED",
  halftone: "MAP-SETTINGS/DITHERING/CATEGORY/HALFTONE",
  blueNoise: "MAP-SETTINGS/DITHERING/CATEGORY/BLUE-NOISE",
};

export const ditherMethodsByCategory = () => {
  const methods = Object.values(DitherMethods);
  const sorted = methods.slice().sort((first, second) => {
    /* У нового метода может не быть sortOrder — тогда он встаёт в конец. */
    const firstOrder = typeof first.sortOrder === "number" ? first.sortOrder : Number.MAX_SAFE_INTEGER;
    const secondOrder = typeof second.sortOrder === "number" ? second.sortOrder : Number.MAX_SAFE_INTEGER;
    if (firstOrder !== secondOrder) return firstOrder - secondOrder;
    return first.uniqueId - second.uniqueId;
  });
  const groups = [];
  for (const category of DITHER_CATEGORY_ORDER) {
    const inCategory = sorted.filter((method) => (method.category || method.algorithm) === category);
    if (inCategory.length > 0) {
      groups.push({ category, labelKey: DITHER_CATEGORY_LABELS[category], methods: inCategory });
    }
  }
  return groups;
};

/* --------------------------------------------------------------------------
   Схема
   -------------------------------------------------------------------------- */

export const OPTION_SCHEMA = [
  /* ----------------------------- Output ----------------------------- */
  {
    key: "optionValue_version",
    handler: "onOptionChange_version",
    type: "select",
    valueType: "event",
    group: "output",
    labelKey: "MAP-SETTINGS/VERSION",
    tooltipKey: "MAP-SETTINGS/VERSION-TT",
    options: () => Object.values(SupportedVersions).map((version) => ({ value: version.MCVersion, label: version.MCVersion })),
    valueFrom: (values) => (values.optionValue_version ? values.optionValue_version.MCVersion : ""),
    /* Версия восстанавливается отдельным кодом (строковая → объект). */
    persisted: false,
  },
  {
    key: "optionValue_modeNBTOrMapdat",
    handler: "onOptionChange_modeNBTOrMapdat",
    type: "select",
    valueType: "event",
    group: "output",
    labelKey: "MAP-SETTINGS/MODE",
    tooltipKey: "MAP-SETTINGS/MODE-TT",
    options: () => Object.values(MapModes).map((mapMode) => ({ value: mapMode.uniqueId, label: mapMode.name })),
  },
  {
    key: "optionValue_mapSize_x",
    handler: "onOptionChange_mapSize_x",
    type: "custom",
    valueType: "value",
    group: "output",
    labelKey: "MAP-SETTINGS/MAP-SIZE",
    tooltipKey: "MAP-SETTINGS/MAP-SIZE-TT",
    min: 1,
    max: getMaxMapSize(),
    step: 1,
    validators: rangeValidator(1, getMaxMapSize()),
    /* Рисуется парой X × Y — см. optionCustomFields.mapSize. */
    custom: "mapSize",
  },
  {
    key: "optionValue_mapSize_y",
    handler: "onOptionChange_mapSize_y",
    type: "custom",
    valueType: "value",
    group: "output",
    labelKey: "MAP-SETTINGS/MAP-SIZE",
    tooltipKey: "MAP-SETTINGS/MAP-SIZE-TT",
    min: 1,
    max: getMaxMapSize(),
    step: 1,
    validators: rangeValidator(1, getMaxMapSize()),
    custom: "mapSize",
  },
  {
    key: "optionValue_showGridOverlay",
    handler: "onOptionChange_showGridOverlay",
    type: "checkbox",
    valueType: "event",
    group: "output",
    labelKey: "MAP-SETTINGS/GRID-OVERLAY",
    tooltipKey: "MAP-SETTINGS/GRID-OVERLAY-TT",
  },
  {
    key: "optionValue_staircasing",
    handler: "onOptionChange_staircasing",
    type: "select",
    valueType: "event",
    group: "output",
    labelKey: "MAP-SETTINGS/3D/TITLE",
    tooltipKey: "MAP-SETTINGS/3D/TITLE-TT",
    options: (values) => {
      const isSchematic = values.optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId;
      const modes = isSchematic ? MapModes.SCHEMATIC_NBT.staircaseModes : MapModes.MAPDAT.staircaseModes;
      return Object.values(modes)
        .filter((staircaseMode) => values.optionValue_extras_moreStaircasingOptions || !staircaseMode.extra)
        .map((staircaseMode) => ({ value: staircaseMode.uniqueId, labelKey: staircaseMode.localeKey }));
    },
  },
  {
    key: "optionValue_extras_moreStaircasingOptions",
    handler: "onOptionChange_extras_moreStaircasingOptions",
    type: "checkbox",
    valueType: "event",
    group: "output",
    labelKey: "MAP-SETTINGS/EXTRAS/MORE-STAIRCASING-OPTIONS",
    tooltipKey: "MAP-SETTINGS/EXTRAS/MORE-STAIRCASING-OPTIONS-TT",
  },

  /* ------------------------------ map.dat ---------------------------- */
  {
    key: "optionValue_transparency",
    handler: "onOptionChange_transparency",
    type: "checkbox",
    valueType: "event",
    group: "mapdat",
    labelKey: "MAP-SETTINGS/MAPDAT-SPECIFIC/TRANSPARENCY",
    tooltipKey: "MAP-SETTINGS/MAPDAT-SPECIFIC/TRANSPARENCY-TT",
    showIf: (values) => values.optionValue_modeNBTOrMapdat !== MapModes.SCHEMATIC_NBT.uniqueId,
  },
  {
    key: "optionValue_transparencyTolerance",
    handler: "onOptionChange_transparencyTolerance",
    type: "range",
    valueType: "value",
    group: "mapdat",
    labelKey: "MAP-SETTINGS/MAPDAT-SPECIFIC/TRANSPARENCY-TOLERANCE",
    min: 0,
    max: 256,
    step: 1,
    validators: rangeValidator(0, 256),
    showIf: (values) => values.optionValue_modeNBTOrMapdat !== MapModes.SCHEMATIC_NBT.uniqueId && !!values.optionValue_transparency,
  },
  {
    key: "optionValue_mapdatFilenameUseId",
    handler: "onOptionChange_mapdatFilenameUseId",
    type: "checkbox",
    valueType: "event",
    group: "mapdat",
    labelKey: "MAP-SETTINGS/MAPDAT-SPECIFIC/MAPDAT-FILENAME-USE-ID",
    tooltipKey: "MAP-SETTINGS/MAPDAT-SPECIFIC/MAPDAT-FILENAME-USE-ID-TT",
    showIf: (values) => values.optionValue_modeNBTOrMapdat !== MapModes.SCHEMATIC_NBT.uniqueId,
  },
  {
    key: "optionValue_mapdatFilenameIdStart",
    handler: "onOptionChange_mapdatFilenameIdStart",
    type: "number",
    valueType: "value",
    group: "mapdat",
    labelKey: "MAP-SETTINGS/MAPDAT-SPECIFIC/MAPDAT-FILENAME-ID-RANGE",
    min: 0,
    step: 1,
    validators: [(value) => !isNaN(value), (value) => value >= 0],
    showIf: (values) => values.optionValue_modeNBTOrMapdat !== MapModes.SCHEMATIC_NBT.uniqueId && !!values.optionValue_mapdatFilenameUseId,
  },

  /* ------------------------------- Crop ------------------------------ */
  {
    key: "optionValue_cropImage",
    handler: "onOptionChange_cropImage",
    type: "select",
    valueType: "event",
    group: "crop",
    labelKey: "MAP-SETTINGS/CROP/TITLE",
    tooltipKey: "MAP-SETTINGS/CROP/TITLE-TT",
    options: () => localeOptions(CropModes),
  },
  {
    key: "optionValue_cropImage_zoom",
    handler: "onOptionChange_cropImage_zoom",
    type: "range",
    valueType: "value",
    group: "crop",
    labelKey: "MAP-SETTINGS/CROP/ZOOM",
    min: 10,
    max: 50,
    step: 1,
    validators: rangeValidator(10, 50),
    showIf: (values) => values.optionValue_cropImage === CropModes.MANUAL.uniqueId,
  },
  {
    key: "optionValue_cropImage_percent_x",
    handler: "onOptionChange_cropImage_percent_x",
    type: "range",
    valueType: "value",
    group: "crop",
    labelKey: "MAP-SETTINGS/CROP/TITLE",
    labelOverride: "X %",
    min: 0,
    max: 100,
    step: 1,
    validators: rangeValidator(0, 100),
    showIf: (values) => values.optionValue_cropImage === CropModes.MANUAL.uniqueId,
  },
  {
    key: "optionValue_cropImage_percent_y",
    handler: "onOptionChange_cropImage_percent_y",
    type: "range",
    valueType: "value",
    group: "crop",
    labelKey: "MAP-SETTINGS/CROP/TITLE",
    labelOverride: "Y %",
    min: 0,
    max: 100,
    step: 1,
    validators: rangeValidator(0, 100),
    showIf: (values) => values.optionValue_cropImage === CropModes.MANUAL.uniqueId,
  },

  /* --------------------------- Preprocessing ------------------------- */
  {
    key: "optionValue_preprocessingEnabled",
    handler: "onOptionChange_PreProcessingEnabled",
    type: "checkbox",
    valueType: "event",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/ENABLE",
  },
  {
    key: "preProcessingValue_brightness",
    handler: "onOptionChange_PreProcessingBrightness",
    type: "range",
    valueType: "value",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/BRIGHTNESS",
    min: 0,
    max: 200,
    step: 1,
    validators: rangeValidator(0, 200),
    disabled: (values) => !values.optionValue_preprocessingEnabled,
  },
  {
    key: "preProcessingValue_contrast",
    handler: "onOptionChange_PreProcessingContrast",
    type: "range",
    valueType: "value",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/CONTRAST",
    min: 0,
    max: 200,
    step: 1,
    validators: rangeValidator(0, 200),
    disabled: (values) => !values.optionValue_preprocessingEnabled,
  },
  {
    key: "preProcessingValue_saturation",
    handler: "onOptionChange_PreProcessingSaturation",
    type: "range",
    valueType: "value",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/SATURATION",
    min: 0,
    max: 200,
    step: 1,
    validators: rangeValidator(0, 200),
    disabled: (values) => !values.optionValue_preprocessingEnabled,
  },
  {
    key: "preProcessingValue_gamma",
    handler: "onOptionChange_PreProcessingGamma",
    type: "range",
    valueType: "value",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/GAMMA",
    tooltipKey: "MAP-SETTINGS/PREPROCESSING/GAMMA-TT",
    min: 50,
    max: 200,
    step: 1,
    validators: rangeValidator(50, 200),
    disabled: (values) => !values.optionValue_preprocessingEnabled,
  },
  {
    key: "preProcessingValue_autoLevels",
    handler: "onOptionChange_PreProcessingAutoLevels",
    type: "checkbox",
    valueType: "event",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/AUTO-LEVELS",
    tooltipKey: "MAP-SETTINGS/PREPROCESSING/AUTO-LEVELS-TT",
    disabled: (values) => !values.optionValue_preprocessingEnabled,
  },
  {
    key: "preProcessingValue_backgroundColourSelect",
    handler: "onOptionChange_PreProcessingBackgroundColourSelect",
    type: "select",
    valueType: "event",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/BACKGROUND/TITLE",
    tooltipKey: "MAP-SETTINGS/PREPROCESSING/BACKGROUND/TITLE-TT",
    options: () => localeOptions(BackgroundColourModes),
    disabled: (values) => !values.optionValue_preprocessingEnabled,
  },
  {
    key: "preProcessingValue_backgroundColour",
    handler: "onOptionChange_PreProcessingBackgroundColour",
    type: "color",
    valueType: "event",
    group: "preprocessing",
    labelKey: "MAP-SETTINGS/PREPROCESSING/BACKGROUND-COLOUR",
    disabled: (values) =>
      !values.optionValue_preprocessingEnabled || values.preProcessingValue_backgroundColourSelect === BackgroundColourModes.OFF.uniqueId,
  },

  /* ------------------------------ Colour ----------------------------- */
  {
    key: "optionValue_betterColour",
    handler: "onOptionChange_BetterColour",
    type: "select",
    valueType: "event",
    group: "colour",
    labelKey: "MAP-SETTINGS/BETTER-COLOUR",
    tooltipKey: "MAP-SETTINGS/BETTER-COLOUR-TT",
    options: () =>
      Object.values(ColourMethods).map((colourMethod) => ({
        value: colourMethod.uniqueId,
        labelKey: colourMethod.localeKey,
        label: colourMethod.name,
      })),
  },
  {
    key: "optionValue_whereSupportBlocks",
    handler: "onOptionChange_WhereSupportBlocks",
    type: "select",
    valueType: "event",
    group: "colour",
    labelKey: "MAP-SETTINGS/NBT-SPECIFIC/WHERE-SUPPORT-BLOCKS/TITLE",
    options: () => localeOptions(WhereSupportBlocksModes),
    showIf: (values) => values.optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId,
  },
  {
    key: "optionValue_supportBlock",
    handler: "setOption_SupportBlock",
    type: "custom",
    valueType: "value",
    group: "colour",
    labelKey: "MAP-SETTINGS/NBT-SPECIFIC/SUPPORT-BLOCK-TO-ADD",
    custom: "supportBlock",
    showIf: (values) => values.optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId,
  },

  /* ---------------------------- Dithering ---------------------------- */
  {
    key: "optionValue_dithering",
    handler: "onOptionChange_dithering",
    type: "select",
    valueType: "event",
    group: "dithering",
    labelKey: "MAP-SETTINGS/DITHERING/TITLE",
    tooltipKey: "MAP-SETTINGS/DITHERING/TITLE-TT",
    options: () => ditherMethodsByCategory(),
    grouped: true,
  },
  {
    key: "optionValue_improvedPatternDithering",
    handler: "onOptionChange_improvedPatternDithering",
    type: "checkbox",
    valueType: "event",
    group: "dithering",
    labelKey: "MAP-SETTINGS/DITHERING/IMPROVED",
    tooltipKey: "MAP-SETTINGS/DITHERING/IMPROVED-TT",
    showIf: (values) => isPatternDithering(values.optionValue_dithering),
  },
  {
    key: "optionValue_patternPairMode",
    handler: "onOptionChange_patternPairMode",
    type: "select",
    valueType: "event",
    group: "dithering",
    labelKey: "MAP-SETTINGS/DITHERING/TITLE",
    labelKeyOverride: "MAP-SETTINGS/DITHERING/PAIR-MODE",
    options: () => [
      { value: "nearest", labelKey: "MAP-SETTINGS/DITHERING/PAIR-NEAREST" },
      { value: "reflect", labelKey: "MAP-SETTINGS/DITHERING/PAIR-REFLECT" },
    ],
    showIf: (values) => isPatternDithering(values.optionValue_dithering) && !!values.optionValue_improvedPatternDithering,
  },
  {
    /* Сколько тонов палитры разрешено использовать. Задаётся пресетом
       стиля, в форме не показывается, но обязано сохраняться вместе с
       остальными настройками. */
    key: "optionValue_paletteStrategy",
    handler: "onOptionChange_paletteStrategy",
    type: "select",
    valueType: "event",
    group: "dithering",
    labelKey: "MAP-SETTINGS/DITHERING/TITLE",
    options: () => [
      { value: "all", label: "all" },
      { value: "twoTones", label: "twoTones" },
      { value: "luminance", label: "luminance" },
    ],
    form: false,
  },
  {
    key: "optionValue_maxTones",
    handler: "onOptionChange_maxTones",
    type: "number",
    valueType: "value",
    group: "dithering",
    labelKey: "MAP-SETTINGS/DITHERING/TITLE",
    min: 0,
    max: 256,
    step: 1,
    validators: rangeValidator(0, 256),
    form: false,
  },
  {
    key: "optionValue_dithering_propagation_red",
    handler: "onOptionChange_dithering_propagation_red",
    type: "range",
    valueType: "value",
    group: "ditherBalance",
    labelKey: "MAP-SETTINGS/DITHERING/PROPAGATION-RED",
    min: 0,
    max: 200,
    step: 1,
    validators: rangeValidator(0, 200),
  },
  {
    key: "optionValue_dithering_propagation_green",
    handler: "onOptionChange_dithering_propagation_green",
    type: "range",
    valueType: "value",
    group: "ditherBalance",
    labelKey: "MAP-SETTINGS/DITHERING/PROPAGATION-GREEN",
    min: 0,
    max: 200,
    step: 1,
    validators: rangeValidator(0, 200),
  },
  {
    key: "optionValue_dithering_propagation_blue",
    handler: "onOptionChange_dithering_propagation_blue",
    type: "range",
    valueType: "value",
    group: "ditherBalance",
    labelKey: "MAP-SETTINGS/DITHERING/PROPAGATION-BLUE",
    min: 0,
    max: 200,
    step: 1,
    validators: rangeValidator(0, 200),
  },
  {
    key: "optionValue_dithering_strength",
    handler: "onOptionChange_dithering_strength",
    type: "range",
    valueType: "value",
    group: "dithering",
    labelKey: "STUDIO/DITHER-STRENGTH",
    min: 0,
    max: 200,
    step: 5,
    validators: rangeValidator(0, 200),
    /* Управление живёт в Studio-панели слева, но опция — в реестре. */
    form: false,
  },

  /* ----------------------------- Cleanup ----------------------------- */
  {
    key: "optionValue_cleanup_enabled",
    handler: "onOptionChange_cleanup_enabled",
    type: "checkbox",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/CLEANUP-ENABLE",
  },
  {
    key: "optionValue_cleanup_denoiseMethod",
    handler: "onOptionChange_cleanup_denoiseMethod",
    type: "select",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/DENOISE-METHOD",
    options: () => [
      { value: "median", labelKey: "STUDIO/DENOISE-MEDIAN" },
      { value: "bilateral", labelKey: "STUDIO/DENOISE-BILATERAL" },
      { value: "guided", labelKey: "STUDIO/DENOISE-GUIDED" },
    ],
    disabled: (values) => !values.optionValue_cleanup_enabled,
  },
  {
    key: "optionValue_cleanup_denoise",
    handler: "onOptionChange_cleanup_denoise",
    type: "range",
    valueType: "value",
    group: "cleanup",
    labelKey: "STUDIO/DENOISE",
    min: 0,
    max: 100,
    step: 5,
    validators: rangeValidator(0, 100),
    disabled: (values) => !values.optionValue_cleanup_enabled,
  },
  {
    key: "optionValue_cleanup_edges",
    handler: "onOptionChange_cleanup_edges",
    type: "range",
    valueType: "value",
    group: "cleanup",
    labelKey: "STUDIO/PRESERVE-EDGES",
    min: 0,
    max: 100,
    step: 5,
    validators: rangeValidator(0, 100),
    disabled: (values) => !values.optionValue_cleanup_enabled,
  },
  {
    key: "optionValue_cleanup_despeckle",
    handler: "onOptionChange_cleanup_despeckle",
    type: "select",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/ISLANDS",
    hintKey: "STUDIO/ISLANDS-HINT",
    options: () => [
      { value: 0, labelKey: "STUDIO/OFF" },
      { value: 1, label: "1 px" },
      { value: 2, label: "2 px" },
      { value: 4, label: "4 px" },
    ],
    disabled: (values) => !values.optionValue_cleanup_enabled,
  },
  {
    key: "optionValue_cleanup_islandsSmart",
    handler: "onOptionChange_cleanup_islandsSmart",
    type: "checkbox",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/ISLANDS-SMART",
    disabled: (values) => !values.optionValue_cleanup_enabled || values.optionValue_cleanup_despeckle === 0,
  },
  {
    key: "optionValue_cleanup_paletteIslands",
    handler: "onOptionChange_cleanup_paletteIslands",
    type: "checkbox",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/PALETTE-ISLANDS",
    disabled: (values) => !values.optionValue_cleanup_enabled || values.optionValue_cleanup_despeckle === 0,
  },
  {
    key: "optionValue_cleanup_colours",
    handler: "onOptionChange_cleanup_colours",
    type: "select",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/SIMPLIFY",
    options: () => [
      { value: 0, labelKey: "STUDIO/OFF" },
      { value: 16, label: "16" },
      { value: 24, label: "24" },
      { value: 32, label: "32" },
      { value: 48, label: "48" },
      { value: 64, label: "64" },
    ],
    disabled: (values) => !values.optionValue_cleanup_enabled,
  },
  {
    key: "optionValue_cleanup_coloursPerceptual",
    handler: "onOptionChange_cleanup_coloursPerceptual",
    type: "checkbox",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/SIMPLIFY-PERCEPTUAL",
    disabled: (values) => !values.optionValue_cleanup_enabled || values.optionValue_cleanup_colours === 0,
  },
  {
    key: "optionValue_cleanup_adaptiveDither",
    handler: "onOptionChange_cleanup_adaptiveDither",
    type: "checkbox",
    valueType: "event",
    group: "cleanup",
    labelKey: "STUDIO/ADAPTIVE",
    disabled: (values) => !values.optionValue_cleanup_enabled,
  },

  /* --------------- Опции вне панели настроек (Studio / Preview) --------- */
  { key: "optionValue_resizeMethod", handler: "onOptionChange_resizeMethod", type: "select", group: "studio", form: false },
  { key: "optionValue_pixelPerfect", handler: "onOptionChange_pixelPerfect", type: "checkbox", group: "studio", form: false },
  { key: "optionValue_autoDetectPixelScale", handler: "onOptionChange_autoDetectPixelScale", type: "checkbox", group: "studio", form: false },
  { key: "optionValue_showPixelGrid", handler: "onOptionChange_showPixelGrid", type: "checkbox", group: "studio", form: false },
  { key: "optionValue_previewScale", handler: "onOptionChange_previewScale", type: "range", group: "preview", form: false },
  { key: "optionValue_style", handler: "applyStylePreset", type: "select", group: "studio", form: false },
  { key: "stylePreset", handler: "applyStylePreset", type: "select", group: "studio", form: false },
  { key: "selectedPresetName", handler: "handlePresetChange", type: "select", group: "palette", form: false },
];

/* --------------------------------------------------------------------------
   Производные списки
   -------------------------------------------------------------------------- */

/* Метод дизеринга, у которого есть матрица, но нет делителя — матричный
   (упорядоченный) дизеринг. */
export const isPatternDithering = (ditheringUniqueId) => {
  const method = Object.values(DitherMethods).find((entry) => entry.uniqueId === ditheringUniqueId);
  return method !== undefined && method.ditherMatrix !== undefined && method.ditherDivisor === undefined;
};

export const OPTION_SCHEMA_BY_KEY = OPTION_SCHEMA.reduce((accumulator, option) => {
  accumulator[option.key] = option;
  return accumulator;
}, {});

/* Ключи, которые сохраняются в сессию. */
export const PERSISTED_OPTION_KEYS = OPTION_SCHEMA.filter((option) => option.persisted !== false).map((option) => option.key);

/* Табы правой колонки. */
export const OPTION_TABS = [
  { id: "output", labelKey: "MAP-SETTINGS/TAB/OUTPUT", groups: ["output", "mapdat"] },
  { id: "image", labelKey: "MAP-SETTINGS/TAB/IMAGE", groups: ["crop", "preprocessing"] },
  { id: "colour", labelKey: "MAP-SETTINGS/TAB/COLOUR", groups: ["colour"] },
  { id: "dithering", labelKey: "MAP-SETTINGS/TAB/DITHERING", groups: ["dithering", "ditherBalance"] },
  { id: "cleanup", labelKey: "MAP-SETTINGS/TAB/CLEANUP", groups: ["cleanup"] },
];

/* Заголовки групп внутри таба. */
export const OPTION_GROUP_TITLES = {
  output: "MAP-SETTINGS/GROUP/OUTPUT",
  mapdat: "MAP-SETTINGS/GROUP/MAPDAT",
  crop: "MAP-SETTINGS/GROUP/CROP",
  preprocessing: "MAP-SETTINGS/PREPROCESSING/TITLE",
  colour: "MAP-SETTINGS/GROUP/COLOUR",
  dithering: "MAP-SETTINGS/DITHERING/TITLE",
  ditherBalance: "MAP-SETTINGS/DITHERING/BALANCE",
  cleanup: "STUDIO/CLEANUP",
};

export const optionsForGroup = (group) => OPTION_SCHEMA.filter((option) => option.group === group && option.form !== false);
