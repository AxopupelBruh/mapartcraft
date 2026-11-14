import fs from "fs";
import path from "path";

import { STYLE_PRESETS } from "../../presets/stylePresets";
import { CLEANUP_PRESETS } from "../../presets/cleanupPresets";
import palettePresets from "../../presets/palettePresets.json";
import { makePreset, PRESET_KIND, presetsFromJson, presetsToJson, toPalettePreset } from "../../presets/presetFormat";
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
    expect(["all", "twoTones", "luminance"]).toContain(preset.settings.paletteStrategy);
    expect(typeof preset.settings.maxTones).toBe("number");
  }
  /* Прежнее поведение сохранено: два тона и 16 тонов. */
  expect(STYLE_PRESETS.find((preset) => preset.id === "retro1bit").settings.paletteStrategy).toBe("twoTones");
  expect(STYLE_PRESETS.find((preset) => preset.id === "lowBlock").settings.maxTones).toBe(16);
  expect(STYLE_PRESETS.find((preset) => preset.id === "clean").settings.paletteStrategy).toBe("all");
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

test("3.1 у всех трёх видов пресетов один формат", () => {
  const all = [...palettePresets, ...STYLE_PRESETS, ...CLEANUP_PRESETS];
  expect(all.length).toBeGreaterThan(10);
  for (const preset of all) {
    expect(Object.values(PRESET_KIND)).toContain(preset.kind);
    expect(typeof preset.id).toBe("string");
    expect(typeof preset.name).toBe("string");
    expect(typeof preset.settings).toBe("object");
  }
  /* Палитры, стили и очистка лежат в трёх разных файлах, но выглядят
     одинаково. */
  expect(palettePresets.every((preset) => preset.kind === PRESET_KIND.PALETTE)).toBe(true);
  expect(STYLE_PRESETS.every((preset) => preset.kind === PRESET_KIND.STYLE)).toBe(true);
  expect(CLEANUP_PRESETS.every((preset) => preset.kind === PRESET_KIND.CLEANUP)).toBe(true);
});

test("3.1 старый формат пресета палитры переводится в новый", () => {
  const legacy = toPalettePreset({ name: "Мой", blocks: [[0, 0]], localeKey: "BLOCK-SELECTION/PRESETS/EVERYTHING" });
  expect(legacy.kind).toBe(PRESET_KIND.PALETTE);
  expect(legacy.id).toBe("Мой");
  expect(legacy.nameKey).toBe("BLOCK-SELECTION/PRESETS/EVERYTHING");
  expect(legacy.settings.blocks).toEqual([[0, 0]]);
  /* Уже новый формат не трогаем. */
  const fresh = makePreset({ kind: PRESET_KIND.PALETTE, id: "x", name: "x", settings: { blocks: [] } });
  expect(toPalettePreset(fresh)).toBe(fresh);
});

test("3.1 пресеты выгружаются и загружаются без потерь", () => {
  const all = [...palettePresets, ...STYLE_PRESETS, ...CLEANUP_PRESETS];
  const { presets, errors } = presetsFromJson(presetsToJson(all));
  expect(errors).toEqual([]);
  expect(presets.length).toBe(all.length);
  for (let i = 0; i < all.length; i++) {
    expect(presets[i].kind).toBe(all[i].kind);
    expect(presets[i].id).toBe(all[i].id);
    expect(presets[i].settings).toEqual(all[i].settings);
  }
});

test("3.1 битый файл не ломает приложение", () => {
  expect(presetsFromJson("не json").errors.length).toBeGreaterThan(0);
  expect(presetsFromJson("не json").presets).toEqual([]);
  expect(presetsFromJson(JSON.stringify({ presets: "нет" })).errors.length).toBeGreaterThan(0);
  const mixed = presetsFromJson(
    JSON.stringify({
      format: "mapartcraft-presets",
      version: 1,
      presets: [
        { kind: "palette", id: "a", name: "a", settings: { blocks: [] } },
        { kind: "что-то", id: "b", name: "b", settings: {} },
        { kind: "palette", name: "без id", settings: {} },
      ],
    })
  );
  expect(mixed.presets.length).toBe(1);
  expect(mixed.errors.length).toBe(2);
});

test("3.1 импорт берёт только пресеты палитр", () => {
  const controller = readFile("mapartController.js");
  expect(controller).toContain("preset.kind === PRESET_KIND.PALETTE");
});
