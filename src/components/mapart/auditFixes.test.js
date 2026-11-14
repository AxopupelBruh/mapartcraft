import fs from "fs";
import path from "path";

import { BIG_MAP_MEGABYTES, isBigMap, estimateMapSize, getMaxMapSize } from "./canvasLimits";
import { optionControlId } from "./optionControl";
import enStrings from "../../locale/en/strings.json";
import ruStrings from "../../locale/ru/strings.json";

/* ==========================================================================
   Тесты правок по итогам аудита этапа 2 (13–14.11.2026).
   ========================================================================== */

const readFile = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf-8");

const lookup = (strings, key) => key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), strings);

test("в CSS нет свойств, побитых заменой (var(--x)- вместо white-space)", () => {
  const cssFiles = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith(".css")) cssFiles.push(full);
    }
  };
  collect(path.join(__dirname, ".."));
  expect(cssFiles.length).toBeGreaterThan(0);
  for (const file of cssFiles) {
    const source = fs.readFileSync(file, "utf-8");
    /* var(--text-1)-space: nowrap — невалидное свойство: браузер молча
       выбрасывает декларацию, и white-space перестаёт работать. */
    expect(source).not.toMatch(/var\(--[a-z0-9-]+\)-[a-z-]+\s*:/);
  }
  expect(readFile("mapPreview.css")).toContain("white-space: nowrap;");
});

test("проверка памяти подключена: большая карта проверяется пробой холста", () => {
  const field = readFile("optionCustomFields.js");
  const limits = readFile("canvasLimits.js");
  expect(limits).toContain("export const canAllocateCanvas");
  expect(field).toContain("canAllocateCanvas");
  /* Проба выделяет столько же памяти, сколько сама карта, поэтому её
     делают только для больших размеров. */
  expect(field).toContain("BIG_MAP_MEGABYTES");
});

test("порог «большой карты» один и для настроек, и для экспорта", () => {
  const controller = readFile("mapartController.js");
  const buttons = readFile("greenButtons.js");
  expect(controller).toContain("isBigMap(");
  expect(buttons).toContain("isBigMap(");
  /* Старый порог в блоках (4.2 млн) больше не используется. */
  expect(buttons).not.toContain("4194304");
  /* 20x20 — ещё обычная карта, 60x60 — уже большая. */
  expect(isBigMap(20, 20)).toBe(false);
  expect(isBigMap(60, 60)).toBe(true);
  expect(BIG_MAP_MEGABYTES).toBe(512);
});

test("подтверждение большой карты спрашивается один раз, а не на каждый шаг", () => {
  const controller = readFile("mapartController.js");
  expect(controller).toContain("bigMapConfirmed");
  /* Флаг ставится в конструкторе и сбрасывается, когда размер снова мал. */
  expect(controller).toContain("this.bigMapConfirmed = false;");
});

test("значения и обработчики опций не пересоздаются на каждом рендере", () => {
  const controller = readFile("mapartController.js");
  expect(controller).toContain("this.optionValuesState === this.state");
  expect(controller).toContain("this.optionHandlersCache");
});

test("подсветка стиля учитывает режим выбора пары цветов", () => {
  const controller = readFile("mapartController.js");
  expect(controller).toContain("optionValue_patternPairMode");
  expect(controller).toContain("pairModeMatches");
});

test("методы шумоподавления переведены", () => {
  for (const key of ["STUDIO/DENOISE-MEDIAN", "STUDIO/DENOISE-BILATERAL", "STUDIO/DENOISE-GUIDED"]) {
    expect(typeof lookup(enStrings, key)).toBe("string");
    expect(typeof lookup(ruStrings, key)).toBe("string");
  }
  const schema = readFile("optionSchema.js");
  expect(schema).toContain("STUDIO/DENOISE-MEDIAN");
});

test("у поля «Блок-опора» есть доступное имя", () => {
  const field = readFile("optionCustomFields.js");
  const autoComplete = readFile("autoCompleteInputBlockToAdd/autoCompleteInputBlockToAdd.js");
  expect(field).toContain("ariaLabel={label}");
  expect(autoComplete).toContain("aria-label={ariaLabel}");
  expect(autoComplete).toContain("id={id}");
});

test("идентификатор контрола вынесен в отдельный модуль (нет циклического импорта)", () => {
  const control = readFile("optionControl.js");
  expect(control).toContain("export const optionControlId");
  /* optionField тянет optionCustomFields, поэтому optionControlId не может
     жить в optionField — иначе циклический импорт. */
  expect(readFile("optionCustomFields.js")).toContain('from "./optionControl"');
  expect(optionControlId({ key: "optionValue_mapSize_x" })).toBe("opt-optionValue_mapSize_x");
});

test("экспорт в zip собирается в одном порядке", () => {
  const buttons = readFile("greenButtons.js");
  expect(buttons).toContain("splitFiles");
  expect(buttons).toContain("sort((a, b)");
});

test("новый ключ про нехватку памяти есть в обоих языках", () => {
  expect(typeof lookup(enStrings, "MAP-SETTINGS/MAP-SIZE-NO-MEMORY")).toBe("string");
  expect(typeof lookup(ruStrings, "MAP-SETTINGS/MAP-SIZE-NO-MEMORY")).toBe("string");
});

test("оценка размера карты считает блоки по 128 на пиксель карты", () => {
  const size = estimateMapSize(4, 4);
  expect(size.width).toBe(512);
  expect(size.height).toBe(512);
  expect(getMaxMapSize()).toBeGreaterThan(16);
});

test("колесо мыши работает на всех ползунках и числовых полях", () => {
  const helper = readFile("wheelValue.js");
  const field = readFile("optionField.js");
  const input = readFile("bufferedNumberInput/bufferedNumberInput.js");
  const studio = readFile("studioPanel.js");
  const preview = readFile("mapPreview.js");
  /* Слушатель ставится вручную, иначе preventDefault внутри
     React-обработчика не сработал бы (React подписывается на wheel как
     на passive-событие) и страница прокручивалась бы вместо изменения. */
  expect(helper).toContain("addEventListener(\"wheel\"");
  expect(helper).toContain("passive: false");
  expect(helper).toContain("preventDefault");
  /* Значение не выходит за min/max. */
  expect(helper).toContain("if (min !== undefined && next < min) next = min;");
  expect(helper).toContain("if (max !== undefined && next > max) next = max;");
  /* Ползунок настроек, числовое поле рядом с ним, сила дизеринга в
     Studio-панели и допуск в редакторе пикселей. */
  expect(field).toContain("attachWheel(");
  expect(field).toContain("ref={rangeRef}");
  expect(input).toContain("attachWheel(");
  expect(studio).toContain("attachWheel(");
  expect(preview).toContain("attachWheel(");
});

test("текстуры блоков в списке материалов не съезжают", () => {
  const materials = readFile("materials.css");
  const blockImage = readFile("blockImage.css");
  const index = readFile("../../index.css");
  /* Спрайт-лист: 31 колонка и 65 строк. Ячейка выбирается процентами в
     background-position, и проценты попадают в ячейку только когда размер
     фона кратен размеру картинки. */
  expect(materials).toContain("--block-cell: 26px;");
  expect(materials).toContain("background-size: calc(31 * var(--block-cell)) calc(65 * var(--block-cell));");
  expect(blockImage).toContain("width: var(--block-cell);");
  expect(index).toContain("--block-cell: 32px;");
});
