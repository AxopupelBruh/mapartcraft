import fs from "fs";
import path from "path";

import { findDominantColours, pureColours } from "./autoPalette";
import { OPTION_SCHEMA, PERSISTED_OPTION_KEYS } from "./optionSchema";

/* ==========================================================================
   Тесты «плоских цветов» и переключателя языка.
   ========================================================================== */

const readFile = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf-8");

/* Картинка: красный фон, оранжевый круг и чёрный контур, все края
   сглажены. Сглаживание даёт полосу промежуточных цветов. */
const smoothedPicture = (size = 160) => {
  const data = new Uint8ClampedArray(size * size * 4);
  const centre = size / 2;
  const radius = size * 0.35;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const distance = Math.hypot(x - centre, y - centre);
      const onEdge = Math.abs(distance - radius) < 2;
      let red = 222;
      let green = 30;
      let blue = 40;
      if (onEdge) {
        red = 20;
        green = 20;
        blue = 25;
      } else if (distance < radius) {
        red = 240;
        green = 120;
        blue = 60;
      }
      /* Сглаживание: чем ближе к краю, тем больше подмешивается фон. */
      const mix = Math.min(1, Math.max(0, 2.5 - Math.abs(distance - radius)));
      data[index] = Math.round(red * mix + 222 * (1 - mix));
      data[index + 1] = Math.round(green * mix + 30 * (1 - mix));
      data[index + 2] = Math.round(blue * mix + 40 * (1 - mix));
      data[index + 3] = 255;
    }
  }
  return { data, width: size, height: size };
};

test("смеси на границе отбрасываются, настоящие цвета остаются", () => {
  const clusters = findDominantColours(smoothedPicture(), 32);
  const pure = pureColours(clusters);
  /* Без фильтра k-means тратит центры на полосу сглаживания. */
  expect(clusters.length).toBeGreaterThan(pure.length);
  /* Чистых цветов должно остаться немного: красный, чёрный и оранжевый. */
  expect(pure.length).toBeLessThanOrEqual(4);
  const colours = pure.map((cluster) => cluster.rgb);
  const near = (target) =>
    colours.some((rgb) => Math.hypot(rgb[0] - target[0], rgb[1] - target[1], rgb[2] - target[2]) < 25);
  expect(near([222, 30, 40])).toBe(true); // фон
  expect(near([20, 20, 25])).toBe(true); // контур
  /* Промежуточных цветов вроде (91, 24, 31) быть не должно. */
  expect(near([91, 24, 31])).toBe(false);
});

test("если фильтр убрал всё, остаются исходные цвета", () => {
  const single = [{ lab: [50, 0, 0], rgb: [128, 128, 128], share: 1 }];
  expect(pureColours(single).length).toBe(1);
});

test("опция «плоские цвета» есть в схеме и сохраняется", () => {
  const option = OPTION_SCHEMA.find((entry) => entry.key === "optionValue_flattenColours");
  expect(option).toBeTruthy();
  expect(option.type).toBe("checkbox");
  /* В форме её нет: включается кнопкой в Local Studio. */
  expect(option.form).toBe(false);
  expect(PERSISTED_OPTION_KEYS).toContain("optionValue_flattenColours");
});

test("кнопка «плоские цвета» есть в Local Studio", () => {
  const panel = readFile("studioPanel.js");
  expect(panel).toContain("studioFlattenButton");
  expect(panel).toContain("onOptionChange_flattenColours");
});

test("сглаживание убирается на исходном холсте", () => {
  const preview = readFile("mapPreview.js");
  expect(preview).toContain("applyFlattenColours");
  /* Прижимать надо к чистым цветам, иначе полоса сглаживания остаётся. */
  expect(preview).toContain("flattenColours");
  /* Одинаковые цвета считаются один раз — иначе рендер встаёт. */
  expect(preview).toContain("const cache = new Map();");
});

test("переключатель языка предлагает только русский и английский", () => {
  const languages = readFile("../languages.js");
  expect(languages).toContain("LANGUAGES");
  expect(languages).toContain('"ru"');
  expect(languages).toContain('"en"');
  /* Остальные языки в выборе не показываются. */
  for (const language of ["de", "es", "fr", "it", "ja", "pl", "tr", "ua", "zh-Hans"]) {
    expect(languages).not.toContain(`"${language}"`);
  }
  /* Флагов в шапке больше нет. */
  expect(languages).not.toContain("<img");
});
