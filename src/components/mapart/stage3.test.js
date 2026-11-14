import fs from "fs";
import path from "path";

import { STYLE_PRESETS } from "./stylePresets";
import { PERSISTED_OPTION_KEYS } from "./optionSchema";
import enStrings from "../../locale/en/strings.json";
import ruStrings from "../../locale/ru/strings.json";

/* ==========================================================================
   Тесты этапа 3 (пресеты и дизеринг).
   ========================================================================== */

const readFile = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf-8");

const lookup = (strings, key) => key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), strings);

test("3.8 воркер работает с числами, а не с названием стиля", () => {
  const worker = readFile("workers/mapCanvas.js");
  /* Название стиля в воркер больше не передаётся: новый стиль не должен
     требовать правок здесь. */
  expect(worker).not.toContain('optionValue_style === "retro1bit"');
  expect(worker).not.toContain('optionValue_style === "lowBlock"');
  expect(worker).toContain("optionValue_paletteStrategy");
  expect(worker).toContain("optionValue_maxTones");
});

test("3.8 каждый пресет стиля задаёт стратегию палитры", () => {
  for (const preset of STYLE_PRESETS) {
    expect(["all", "twoTones", "luminance"]).toContain(preset.paletteStrategy);
    expect(typeof preset.maxTones).toBe("number");
  }
  /* Прежнее поведение сохранено: два тона и 16 тонов. */
  expect(STYLE_PRESETS.find((preset) => preset.id === "retro1bit").paletteStrategy).toBe("twoTones");
  expect(STYLE_PRESETS.find((preset) => preset.id === "lowBlock").maxTones).toBe(16);
  expect(STYLE_PRESETS.find((preset) => preset.id === "clean").paletteStrategy).toBe("all");
});

test("3.8 ручная правка снимает ограничения палитры", () => {
  const controller = readFile("mapartController.js");
  expect(controller).toContain("customStyleState");
  expect(controller).toContain('optionValue_paletteStrategy: "all"');
  expect(controller).toContain("optionValue_maxTones: 0");
});

test("3.8 ограничения палитры сохраняются вместе с настройками", () => {
  expect(PERSISTED_OPTION_KEYS).toContain("optionValue_paletteStrategy");
  expect(PERSISTED_OPTION_KEYS).toContain("optionValue_maxTones");
});

test("3.9 названия стилей переведены", () => {
  for (const preset of STYLE_PRESETS) {
    expect(typeof preset.nameKey).toBe("string");
    expect(typeof lookup(enStrings, preset.nameKey)).toBe("string");
    expect(typeof lookup(ruStrings, preset.nameKey)).toBe("string");
  }
  const panel = readFile("studioPanel.js");
  expect(panel).toContain("this.t(style.nameKey, style.name)");
});
