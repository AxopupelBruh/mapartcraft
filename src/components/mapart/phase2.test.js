import fs from "fs";
import path from "path";

import { OPTION_SCHEMA, OPTION_SCHEMA_BY_KEY, OPTION_TABS, PERSISTED_OPTION_KEYS, optionsForGroup } from "./optionSchema";
import { getMaxMapSize } from "./canvasLimits";
import DitherMethods from "./json/ditherMethods.json";
import enStrings from "../../locale/en/strings.json";
import ruStrings from "../../locale/ru/strings.json";

/* Контроллер тянет за собой greenButtons -> worker-builder -> Worker,
   которого нет в jsdom. Подменяем воркер заглушкой: тестам этапа 2 он не нужен.
   jest.mock поднимается выше импортов автоматически (babel-plugin-jest-hoist),
   поэтому его можно писать после них — иначе линтер ругается на import/first. */
jest.mock("./workers/worker-builder", () => ({
  __esModule: true,
  default: class WorkerBuilderStub {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  },
}));

/* ==========================================================================
   Тесты этапа 2 (UI/UX). Проверяют инварианты, которые раньше держались
   на честном слове: список сохраняемых опций, токены оформления,
   локализация названий методов дизеринга.
   ========================================================================== */

/* Список ключей, который раньше был продублирован в двух ручных массивах
   в mapartController.js. Зафиксирован здесь, чтобы случайно не потерять
   ни одну опцию при переходе на схему. */
const LEGACY_PERSISTED_KEYS = [
  "optionValue_modeNBTOrMapdat",
  "optionValue_mapSize_x",
  "optionValue_mapSize_y",
  "optionValue_cropImage",
  "optionValue_cropImage_zoom",
  "optionValue_cropImage_percent_x",
  "optionValue_cropImage_percent_y",
  "optionValue_showGridOverlay",
  "optionValue_staircasing",
  "optionValue_whereSupportBlocks",
  "optionValue_supportBlock",
  "optionValue_transparency",
  "optionValue_transparencyTolerance",
  "optionValue_mapdatFilenameUseId",
  "optionValue_mapdatFilenameIdStart",
  "optionValue_betterColour",
  "optionValue_dithering",
  "optionValue_dithering_propagation_red",
  "optionValue_dithering_propagation_green",
  "optionValue_dithering_propagation_blue",
  "optionValue_dithering_strength",
  "optionValue_improvedPatternDithering",
  "optionValue_patternPairMode",
  "optionValue_cleanup_enabled",
  "optionValue_cleanup_denoise",
  "optionValue_cleanup_denoiseMethod",
  "optionValue_cleanup_edges",
  "optionValue_cleanup_despeckle",
  "optionValue_cleanup_paletteIslands",
  "optionValue_cleanup_colours",
  "optionValue_cleanup_coloursPerceptual",
  "optionValue_cleanup_islandsSmart",
  "optionValue_cleanup_adaptiveDither",
  "optionValue_preprocessingEnabled",
  "preProcessingValue_brightness",
  "preProcessingValue_contrast",
  "preProcessingValue_saturation",
  "preProcessingValue_backgroundColourSelect",
  "preProcessingValue_backgroundColour",
  "preProcessingValue_gamma",
  "preProcessingValue_autoLevels",
  "optionValue_extras_moreStaircasingOptions",
  "optionValue_resizeMethod",
  "optionValue_pixelPerfect",
  "optionValue_autoDetectPixelScale",
  "optionValue_showPixelGrid",
  "optionValue_previewScale",
  "optionValue_style",
  "stylePreset",
  "selectedPresetName",
];

/* Путь ключа должен существовать. Значение может быть null — тогда
   приложение откатывается на английский (см. getLocaleString в root.js). */
const localeHas = (strings, key) => {
  const parts = key.split("/");
  let node = strings;
  for (const part of parts) {
    if (node === undefined || node === null || typeof node !== "object") return false;
    node = node[part];
  }
  return node !== undefined;
};

const localeValue = (strings, key) => {
  const parts = key.split("/");
  let node = strings;
  for (const part of parts) {
    if (node === undefined || node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
};

const readCssFiles = () => {
  const root = path.join(__dirname, "..", "..");
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  };
  walk(root);
  return files;
};

test("сохраняемые ключи совпадают с прежним ручным списком", () => {
  expect([...PERSISTED_OPTION_KEYS].sort()).toEqual([...LEGACY_PERSISTED_KEYS].sort());
});

test("в схеме нет повторяющихся ключей, и все они уникальны", () => {
  const keys = OPTION_SCHEMA.map((option) => option.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test("у каждой опции есть обработчик в контроллере", () => {
  /* Контроллер — React-компонент, его нельзя инстанцировать напрямую
     (в React 17 поле isMounted became read-only). Поэтому проверяем,
     что обработчик действительно объявлен в классе. */
  const source = fs.readFileSync(path.join(__dirname, "mapartController.js"), "utf-8");
  const missing = OPTION_SCHEMA.filter((option) => !new RegExp("\\b" + option.handler + "\\s*=").test(source)).map((option) => option.key);
  expect(missing).toEqual([]);
});

test("каждая опция, отображаемая в форме, попадает в какую-то группу", () => {
  const groupsInTabs = new Set(OPTION_TABS.flatMap((tab) => tab.groups));
  const formOptions = OPTION_SCHEMA.filter((option) => option.form !== false);
  const orphans = formOptions.filter((option) => !groupsInTabs.has(option.group)).map((option) => option.key);
  expect(orphans).toEqual([]);
  for (const group of groupsInTabs) {
    expect(optionsForGroup(group).length).toBeGreaterThan(0);
  }
});

test("у всех 26 методов дизеринга есть категория и ключ локализации", () => {
  const methods = Object.values(DitherMethods);
  expect(methods.length).toBe(26);
  for (const method of methods) {
    expect(typeof method.category).toBe("string");
    expect(typeof method.localeKey).toBe("string");
    expect(localeHas(enStrings, method.localeKey)).toBe(true);
    expect(localeHas(ruStrings, method.localeKey)).toBe(true);
  }
});

test("ключи локализации опций существуют в en и ru", () => {
  const missing = [];
  const untranslated = [];
  for (const option of OPTION_SCHEMA) {
    for (const key of [option.labelKey, option.labelKeyOverride, option.tooltipKey, option.hintKey]) {
      if (!key) continue;
      if (!localeHas(enStrings, key)) missing.push(`en: ${key}`);
      if (!localeHas(ruStrings, key)) missing.push(`ru: ${key}`);
      const english = localeValue(enStrings, key);
      if (english === undefined || english === null || english === "") untranslated.push(key);
    }
  }
  expect(missing).toEqual([]);
  expect(untranslated).toEqual([]);
});

test("в CSS нет hex-цветов вне :root", () => {
  const offenders = [];
  for (const file of readCssFiles()) {
    const content = fs.readFileSync(file, "utf-8");
    const withoutRoot = file.endsWith(path.join("src", "index.css")) ? content.replace(/:root\s*\{[^}]*\}/g, "") : content;
    const matches = withoutRoot.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (matches) offenders.push(`${path.basename(file)}: ${matches.join(", ")}`);
  }
  expect(offenders).toEqual([]);
});

test("каждая используемая CSS-переменная объявлена в :root", () => {
  const indexCss = fs.readFileSync(path.join(__dirname, "..", "..", "index.css"), "utf-8");
  const declared = new Set(Array.from(indexCss.matchAll(/(--[a-z0-9-]+)\s*:/g)).map((match) => match[1]));
  const missing = [];
  for (const file of readCssFiles()) {
    const content = fs.readFileSync(file, "utf-8");
    for (const match of content.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!declared.has(match[1])) missing.push(`${path.basename(file)}: ${match[1]}`);
    }
  }
  expect(Array.from(new Set(missing))).toEqual([]);
});

test("в CSS есть шкала скруглений и размеров шрифта", () => {
  const indexCss = fs.readFileSync(path.join(__dirname, "..", "..", "index.css"), "utf-8");
  for (const token of ["--radius-sm", "--radius-md", "--radius-lg", "--fs-xs", "--fs-sm", "--fs-md", "--fs-lg"]) {
    expect(indexCss).toContain(token + ":");
  }
});

test("размер карты ограничен пределом браузера, а не жёстким числом", () => {
  const mapSizeX = OPTION_SCHEMA_BY_KEY["optionValue_mapSize_x"];
  const mapSizeY = OPTION_SCHEMA_BY_KEY["optionValue_mapSize_y"];
  /* Предел задаёт браузер (площадь и сторона холста), поэтому он заметно
     больше прежнего искусственного предела 16. */
  expect(mapSizeX.max).toBe(getMaxMapSize());
  expect(mapSizeY.max).toBe(getMaxMapSize());
  expect(mapSizeX.max).toBeGreaterThan(16);
  const source = fs.readFileSync(path.join(__dirname, "mapartController.js"), "utf-8");
  expect(source).not.toContain("const MAP_SIZE_MAX = 16;");
  expect(source).toContain("clampMapSize");
});
