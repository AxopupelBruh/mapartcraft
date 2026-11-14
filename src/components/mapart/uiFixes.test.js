import fs from "fs";
import path from "path";

import Materials from "./materials";
import { estimateMapSize, estimateRenderSeconds, getCanvasLimits, getMaxMapSize, MAP_CHUNK_BLOCKS } from "./canvasLimits";
import enStrings from "../../locale/en/strings.json";
import ruStrings from "../../locale/ru/strings.json";

/* Контроллер тянет за собой greenButtons -> worker-builder -> Worker,
   которого нет в jsdom. Подменяем воркер заглушкой.
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
   Тесты правок интерфейса по замечаниям пользователя:
     1. Кнопки экспорта одинаковой высоты.
     2. Select в настройках не наезжает на подпись.
     3. Размер карты: кнопки +/- и колесо мыши.
     4. Размер карты не ограничен искусственным 16x16.
     5. Список материалов: кнопка удаления рядом с блоком, короткие числа.
   ========================================================================== */

const readFile = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf-8");

test("кнопки экспорта одинаковой высоты: отдельного крупного стиля нет", () => {
  const js = readFile("greenButtons.js");
  const css = readFile("greenButtons.css");
  expect(js).not.toContain("greenButton_large_text");
  expect(css).not.toContain("greenButton_large_text");
  /* Все подписи кнопок используют один и тот же класс. */
  const textClasses = js.match(/className="greenButton_(text|text_dummy)"/g) || [];
  expect(new Set(textClasses)).toEqual(new Set(['className="greenButton_text"', 'className="greenButton_text_dummy"']));
  expect(js).not.toMatch(/className="greenButton_large/);
});

test("select в настройках стоит на отдельной строке и не наезжает на подпись", () => {
  const css = readFile("mapSettings.css");
  expect(css).toContain(".optionField_select");
  /* Подпись и список в разных строках: одна колонка вместо двух. */
  const selectBlock = css.slice(css.indexOf(".optionField_select {"), css.indexOf(".optionField_select select {"));
  expect(selectBlock).toContain("grid-template-columns: minmax(0, 1fr);");
});

test("у размера карты есть кнопки +/- и поддержка колеса мыши", () => {
  const field = readFile("optionCustomFields.js");
  const css = readFile("mapSettings.css");
  const input = readFile("bufferedNumberInput/bufferedNumberInput.js");
  const helper = readFile("wheelValue.js");
  expect(field).toContain("mapSizeStepButton");
  /* Колесо работает во всех числовых полях: обработчик общий, в
     BufferedNumberInput. В самом поле размера он второй раз не ставится,
     иначе значение менялось бы на два шага. */
  expect(helper).toContain("addEventListener(\"wheel\"");
  expect(helper).toContain("passive: false");
  expect(input).toContain("attachWheel(");
  expect(field).not.toContain("attachWheel(");
  expect(css).toContain(".mapSizeStepButton");
});

test("размер карты ограничен пределом браузера, а не числом 16", () => {
  const limits = getCanvasLimits();
  expect(limits.maxDimension).toBeGreaterThan(0);
  expect(limits.maxArea).toBeGreaterThan(0);
  /* Предел заметно больше прежних 16x16 — иначе снятие ограничения
     ничего бы не дало. */
  expect(getMaxMapSize()).toBeGreaterThan(16);
  /* Один пиксель карты — это 128x128 блоков. */
  expect(MAP_CHUNK_BLOCKS).toBe(128);
  expect(getMaxMapSize()).toBe(Math.floor(Math.min(limits.maxDimension, limits.maxSquareSide) / MAP_CHUNK_BLOCKS));
});

test("оценка памяти и времени считается по площади карты", () => {
  const small = estimateMapSize(16, 16);
  expect(small.width).toBe(16 * 128);
  expect(small.height).toBe(16 * 128);
  expect(small.pixels).toBe(2048 * 2048);
  /* Четыре копии пикселей: холст источника, данные, копия в воркере и
     запас на cleanup. */
  expect(small.bytes).toBe(small.pixels * 4 * 4);
  const big = estimateMapSize(100, 100);
  expect(big.pixels).toBe(12800 * 12800);
  expect(big.gigabytes).toBeGreaterThan(2);
  /* Время растёт вместе с площадью. */
  expect(estimateRenderSeconds(100, 100)).toBeGreaterThan(estimateRenderSeconds(16, 16));
  expect(estimateRenderSeconds(1, 1)).toBeGreaterThanOrEqual(0);
});

test("в контроллере больше нет жёсткого предела 16 и есть подтверждение большой карты", () => {
  const controller = readFile("mapartController.js");
  expect(controller).not.toContain("MAP_SIZE_MAX = 16");
  expect(controller).toContain("getMaxMapSize()");
  expect(controller).toContain("confirmBigMap");
});

test("материалы: короткая запись без режима «Only show max mats per split»", () => {
  const materials = new Materials({});
  materials.state = { ...materials.state, onlyMaxPerSplit: false };
  /* 2070358 = 1198SB + 3ST + 22 */
  expect(materials.formatMaterialCount(2070358)).toBe("~2m (1198SB+3ST+22)");
  expect(materials.formatMaterialCount(1500)).toBe("~2k (23ST+28)");
  expect(materials.formatMaterialCount(999)).toBe("999 (15ST+39)");
  expect(materials.formatMaterialCount(10)).toBe("10");
});

test("материалы: полное количество в режиме «Only show max mats per split»", () => {
  const materials = new Materials({});
  materials.state = { ...materials.state, onlyMaxPerSplit: true };
  expect(materials.formatMaterialCount(2070358)).toBe("2070358 (1198SB+3ST+22)");
  expect(materials.formatMaterialCount(1500)).toBe("1500 (23ST+28)");
  /* В буфер обмена всегда точное число. */
  expect(materials.formatMaterialCountExact(1500)).toBe("1500 (23ST+28)");
});

test("кнопка удаления блока стоит рядом с блоком", () => {
  const materials = readFile("materials.js");
  const css = readFile("materials.css");
  expect(materials).toContain("materialBlockCell");
  expect(materials).toContain("materialBlockRemove");
  expect(css).toContain(".materialBlockCell");
  expect(css).toContain("display: inline-flex");
});

test("у новых строк есть перевод на английский и на русский", () => {
  const keys = ["MAP-SETTINGS/MAP-SIZE-TOO-LARGE", "MAP-SETTINGS/MAP-SIZE-BIG", "MAP-SETTINGS/MAP-SIZE-CONFIRM", "MAP-SETTINGS/MAP-SIZE-INCREASE", "MAP-SETTINGS/MAP-SIZE-DECREASE", "MAP-PREVIEW/MAP-TOO-LARGE", "DOWNLOAD/HUGE-EXPORT"];
  const lookup = (strings, key) => key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), strings);
  for (const key of keys) {
    expect(typeof lookup(enStrings, key)).toBe("string");
    expect(typeof lookup(ruStrings, key)).toBe("string");
  }
});
