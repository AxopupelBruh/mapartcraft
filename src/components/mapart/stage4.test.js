import fs from "fs";
import path from "path";

import React from "react";
import { render } from "@testing-library/react";

import MapWorker from "./workers/mapCanvas";
import StudioPanel from "./studioPanel";
import PaletteAccuracy from "./paletteAccuracy";

import coloursJSON from "./json/coloursJSON.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import { getSiteUrl, SITE_URL, siteUrlWithQuery } from "../../site";
import { buildProjectFile, dataUrlToBlob, parseProjectFile, PROJECT_FORMAT, projectFileName } from "./projectFile";
import { drawCompareAfter, drawCompareBefore } from "./compareView";

import enStrings from "../../locale/en/strings.json";
import ruStrings from "../../locale/ru/strings.json";

/* ==========================================================================
   Тесты этапа 4: полировка.

   Здесь четыре группы:
     1. Ссылки ведут на наш сайт (и вообще никуда не ведут «в никуда»);
     2. Проект в файл: сохранение и открытие .mapartstudio.json;
     3. Проверка перед экспортом и точность квантования;
     4. Сравнение «было/стало» и паритет локализации.
   ========================================================================== */

const srcDir = path.join(__dirname, "..", "..");

/* Подменяет адрес документа на время проверки. */
function withBaseUri(value, assertion) {
  const original = Object.getOwnPropertyDescriptor(document, "baseURI");
  Object.defineProperty(document, "baseURI", { value, configurable: true });
  try {
    assertion();
  } finally {
    if (original) Object.defineProperty(document, "baseURI", original);
    else delete document.baseURI;
  }
}

/* Blob -> текст. В этой версии jsdom у Blob нет метода text(). */
function blobToText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/* Blob -> байты. У Blob нет и arrayBuffer(), поэтому через FileReader. */
function blobToBytes(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}


/* ------------------------------------------- 1. ссылки и домены */

test("1.1 адрес сайта — наш, а не оставшийся от upstream", () => {
  expect(SITE_URL).toBe("https://axopupelbruh.github.io/mapartcraft");
  expect(SITE_URL).not.toMatch(/mike2b2t|rebane2001/);
});

test("1.2 локальный запуск ссылку не подменяет: остаётся публичный адрес", () => {
  withBaseUri("http://localhost:4173/", () => {
    expect(getSiteUrl()).toBe(SITE_URL);
  });
});

test("1.3 на опубликованной копии ссылка ведёт на эту же копию", () => {
  withBaseUri("https://axopupelbruh.github.io/mapartcraft/", () => {
    expect(getSiteUrl()).toBe("https://axopupelbruh.github.io/mapartcraft");
    expect(siteUrlWithQuery("preset=abc")).toBe("https://axopupelbruh.github.io/mapartcraft/?preset=abc");
  });
});

test("1.4 зеркало на своём домене даёт ссылку на себя, а не на github pages", () => {
  withBaseUri("https://mapart.example.org/studio/", () => {
    expect(getSiteUrl()).toBe("https://mapart.example.org/studio");
    expect(siteUrlWithQuery("preset=abc")).toBe("https://mapart.example.org/studio/?preset=abc");
  });
});

test("1.5 в коде нет адресов чужого сайта, на которые уводит пользователя", () => {
  /* Личные страницы upstream могли умереть или переехать: в интерфейсе
     на них ведут только ссылки вида «сделано на основе», и то на репозиторий,
     а не на сайт. */
  const offenders = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|html|json|webmanifest)$/.test(entry.name)) continue;
      if (entry.name.endsWith(".test.js")) continue;
      const text = fs.readFileSync(full, "utf8");
      if (text.includes("rebane2001.com")) offenders.push(`${full}: rebane2001.com`);
      if (/https?:\/\/[^\s"']*mike2b2t\.github\.io/.test(text)) offenders.push(`${full}: mike2b2t.github.io`);
    }
  };
  walk(srcDir);
  expect(offenders).toEqual([]);
});

test("1.6 ссылка «поделиться палитрой» собирается из адреса сайта, а не из строки в коде", () => {
  const controller = fs.readFileSync(path.join(__dirname, "mapartController.js"), "utf8");
  expect(controller).toContain("siteUrlWithQuery");
  expect(controller).not.toMatch(/`\$\{SITE_URL\}/);
});

/* ------------------------------------------- 2. проект в файл */

const settingsFixture = { optionValue_mapSize_x: 3, optionValue_mapSize_y: 2, optionValue_dithering: 7 };

test("2.1 имя файла проекта безопасное", () => {
  expect(projectFileName("My art/2")).toBe("My art-2.mapartstudio.json");
  expect(projectFileName("")).toBe("project.mapartstudio.json");
  expect(projectFileName(null)).toBe("project.mapartstudio.json");
});

test("2.2 проект сохраняется и открывается без потерь", async () => {
  const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const imageBlob = new Blob([imageBytes], { type: "image/png" });
  const pixelEdits = { 5: "#ff0000", 9: "mask", 12: "protect" };
  const customBlocks = [["28", { displayName: "Test", validVersions: { "1.21.11": {} } }]];

  const blob = await buildProjectFile({
    imageBlob,
    imageBaseFilename: "MyArt",
    settings: settingsFixture,
    customBlocks,
    pixelEdits,
  });
  const text = await blobToText(blob);
  const parsed = JSON.parse(text);
  expect(parsed.format).toBe(PROJECT_FORMAT);
  expect(parsed.version).toBe(1);
  expect(parsed.image.name).toBe("MyArt");
  expect(parsed.image.dataUrl.startsWith("data:image/png;base64,")).toBe(true);

  const project = parseProjectFile(text);
  expect(project.imageBaseFilename).toBe("MyArt");
  expect(project.settings).toEqual(settingsFixture);
  expect(project.customBlocks).toEqual(customBlocks);
  expect(project.pixelEdits).toEqual(pixelEdits);
  const restoredBytes = await blobToBytes(project.imageBlob);
  expect(Array.from(restoredBytes)).toEqual(Array.from(imageBytes));
});

test("2.3 чужой или битый файл не открывается, а ошибка понятна", () => {
  expect(() => parseProjectFile("not json")).toThrow(/JSON/);
  expect(() => parseProjectFile("{}")).toThrow(/project file/i);
  expect(() => parseProjectFile(JSON.stringify({ format: "something-else", version: 1 }))).toThrow(/not a MapArtCraft/);
  expect(() => parseProjectFile(JSON.stringify({ format: PROJECT_FORMAT, version: 99, image: { dataUrl: "data:image/png;base64,AA==" } }))).toThrow(
    /newer version/
  );
  expect(() => parseProjectFile(JSON.stringify({ format: PROJECT_FORMAT, version: 1 }))).toThrow(/no image/);
});

test("2.4 в проект попадают только те правки пикселей, которые воркер понимает", async () => {
  const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const blob = await buildProjectFile({
    imageBlob,
    imageBaseFilename: "Art",
    settings: {},
    customBlocks: [],
    pixelEdits: { 5: "#ff0000", 6: "mask", 7: "protect", 8: "not-a-colour", notAnIndex: "#00ff00" },
  });
  const project = parseProjectFile(await blobToText(blob));
  expect(project.pixelEdits).toEqual({ 5: "#ff0000", 6: "mask", 7: "protect" });
});

test("2.5 картинка из проекта восстанавливается как Blob", () => {
  const blob = dataUrlToBlob("data:image/png;base64,AQID");
  expect(blob.type).toBe("image/png");
  expect(blob.size).toBe(3);
});

/* ------------------------------------------- 4. точность квантования */

const W = 128;
const H = 128;
const BLACK_SET = "28";
const WHITE_SET = "13";

function solidImageData(rgb) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

function runWorker(body) {
  MapWorker();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("worker timeout")), 60000);
    const originalPostMessage = window.postMessage;
    window.postMessage = (message) => {
      if (!message || typeof message !== "object") return;
      if (message.head === "ERROR") {
        clearTimeout(timeout);
        window.postMessage = originalPostMessage;
        reject(new Error(message.body && message.body.message ? message.body.message : "worker error"));
        return;
      }
      if (message.head !== "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") return;
      clearTimeout(timeout);
      window.postMessage = originalPostMessage;
      resolve(message);
    };
    window.onmessage({ data: { head: "PIXELS", body } });
  });
}

function workerBody(imageData) {
  const selectedBlocks = {};
  const disabledTones = {};
  selectedBlocks[BLACK_SET] = "0";
  selectedBlocks[WHITE_SET] = "0";
  disabledTones[BLACK_SET] = new Set(["normal", "light", "unobtainable"]);
  disabledTones[WHITE_SET] = new Set(["dark", "normal", "unobtainable"]);
  return {
    coloursJSON,
    MapModes,
    WhereSupportBlocksModes,
    ColourMethods,
    DitherMethods,
    canvasImageData: imageData,
    selectedBlocks,
    disabledTones,
    optionValue_modeNBTOrMapdat: MapModes.SCHEMATIC_NBT.uniqueId,
    optionValue_mapSize_x: 1,
    optionValue_mapSize_y: 1,
    optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
    optionValue_whereSupportBlocks: WhereSupportBlocksModes.ALL_DOUBLE_OPTIMIZED.uniqueId,
    optionValue_transparency: false,
    optionValue_transparencyTolerance: 128,
    optionValue_betterColour: ColourMethods.MapartCraftDefault.uniqueId,
    optionValue_dithering: DitherMethods.None.uniqueId,
    optionValue_dithering_propagation_red: 100,
    optionValue_dithering_propagation_green: 100,
    optionValue_dithering_propagation_blue: 100,
    optionValue_dithering_strength: 100,
    optionValue_improvedPatternDithering: false,
    optionValue_patternPairMode: "nearest",
    optionValue_cleanup_enabled: false,
    optionValue_cleanup_denoise: 0,
    optionValue_cleanup_denoiseMethod: "median",
    optionValue_cleanup_edges: 60,
    optionValue_cleanup_despeckle: 0,
    optionValue_cleanup_paletteIslands: true,
    optionValue_cleanup_colours: 0,
    optionValue_cleanup_coloursPerceptual: false,
    optionValue_cleanup_islandsSmart: false,
    optionValue_cleanup_adaptiveDither: true,
    optionValue_style: "custom",
    pixelEdits: {},
  };
}

test("4.1 картинка, совпадающая с палитрой, даёт точность 100%", async () => {
  const result = await runWorker(workerBody(solidImageData([17, 17, 17])));
  const accuracy = result.body.accuracy;
  expect(accuracy).toBeDefined();
  expect(accuracy.total).toBe(W * H);
  expect(accuracy.exact).toBe(W * H);
  expect(accuracy.share).toBeCloseTo(1, 5);
}, 120000);

test("4.2 цвет, которого нет в палитре, даёт точность 0%", async () => {
  const result = await runWorker(workerBody(solidImageData([128, 128, 128])));
  const accuracy = result.body.accuracy;
  expect(accuracy.exact).toBe(0);
  expect(accuracy.share).toBe(0);
}, 120000);

/* ------------------------------------------- 5. сравнение «было/стало» */

test("5.1 «до» рисует картинку-источник, «после» — пиксели рендера", () => {
  const calls = [];
  const context = {
    imageSmoothingEnabled: true,
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    putImageData: (...args) => calls.push(["putImageData", ...args]),
  };
  const source = { width: 128, height: 128 };
  const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

  expect(drawCompareBefore(context, source, 128, 128)).toBe(true);
  expect(calls[calls.length - 1][0]).toBe("drawImage");
  expect(calls[calls.length - 1][1]).toBe(source);

  expect(drawCompareAfter(context, imageData)).toBe(true);
  expect(calls[calls.length - 1][0]).toBe("putImageData");
  expect(calls[calls.length - 1][1]).toBe(imageData);
});

test("5.2 без картинки сравнение ничего не ломает", () => {
  const context = { clearRect: jest.fn(), drawImage: jest.fn(), putImageData: jest.fn() };
  expect(drawCompareBefore(context, null, 128, 128)).toBe(false);
  expect(drawCompareAfter(context, null)).toBe(false);
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.putImageData).not.toHaveBeenCalled();
});

/* ------------------------------------------- 6. локализация */

function flattenKeys(object, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(object || {})) {
    const fullKey = prefix ? `${prefix}/${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

test("6.1 русский перевод полон: те же ключи, что и в английском", () => {
  const enKeys = flattenKeys(enStrings).sort();
  const ruKeys = flattenKeys(ruStrings).sort();
  expect(ruKeys).toEqual(enKeys);
});

test("6.2 в русском переводе нет пустых значений", () => {
  const empty = flattenKeys(ruStrings).filter((key) => {
    const value = key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), ruStrings);
    return value === null || value === undefined || value === "";
  });
  expect(empty).toEqual([]);
});

test("6.3 ключи новых функций есть в обоих языках", () => {
  for (const key of [
    "PROJECT/SAVE",
    "PROJECT/OPEN",
    "STUDIO/ACCURACY",
    "MAP-SETTINGS/MAP-SIZE-SUMMARY",
    "MAP-PREVIEW/COMPARE",
  ]) {
    for (const strings of [enStrings, ruStrings]) {
      const value = key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), strings);
      expect(value).toBeTruthy();
    }
  }
});

/* ------------------------------------------- 7. интерфейс панели */

const studioPanelProps = (overrides) => ({
  getLocaleString: (key) => {
    const value = key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), enStrings);
    return value || key;
  },
  stylePreset: "clean",
  optionValue_style: "clean",
  activeStyleId: "clean",
  styleModified: false,
  onApplyStyle: jest.fn(),
  optionValue_resizeMethod: "pixel",
  onOptionChange_resizeMethod: jest.fn(),
  optionValue_autoDetectPixelScale: true,
  onOptionChange_autoDetectPixelScale: jest.fn(),
  optionValue_showPixelGrid: false,
  onOptionChange_showPixelGrid: jest.fn(),
  optionValue_dithering: 1,
  optionValue_dithering_strength: 100,
  optionValue_dithering_propagation_red: 100,
  optionValue_dithering_propagation_green: 100,
  optionValue_dithering_propagation_blue: 100,
  onOptionChange_dithering_strength: jest.fn(),
  detectedPixelScale: 1,
  sessionStatus: "",
  onResetSession: jest.fn(),
  sessionResetAvailable: false,
  onSaveProject: jest.fn(),
  onOpenProject: jest.fn(),
  projectSaveAvailable: true,
  projectStatus: "",
  ...overrides,
});

const paletteAccuracyProps = (overrides) => ({
  getLocaleString: (key) => {
    const value = key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), enStrings);
    return value || key;
  },
  accuracy: null,
  ...overrides,
});

test("7.1 в панели студии есть кнопки сохранения и открытия проекта", () => {
  const { container } = render(<StudioPanel {...studioPanelProps()} />);
  const buttons = container.querySelectorAll(".studioProjectButton");
  expect(buttons.length).toBe(2);
  expect(container.textContent).toContain("Save project");
  expect(container.textContent).toContain("Open project");
  /* Кнопка сохранения работает только когда есть картинка. */
  expect(buttons[0].disabled).toBe(false);
});

test("7.2 без картинки сохранение проекта недоступно", () => {
  const { container } = render(<StudioPanel {...studioPanelProps({ projectSaveAvailable: false })} />);
  expect(container.querySelectorAll(".studioProjectButton")[0].disabled).toBe(true);
});

test("7.3 индикатор точности показывает долю пикселей, попавших в палитру", () => {
  const { container } = render(<PaletteAccuracy {...paletteAccuracyProps({ accuracy: { exact: 2000, total: 2500, share: 0.8 } })} />);
  expect(container.textContent).toContain("80%");
  /* Подробности — в подсказке: сама строка остаётся короткой. */
  expect(container.querySelector(".tooltipText").textContent).toContain("2000 of 2500");
  expect(container.querySelector(".mapAccuracyHint").textContent).not.toContain("2000 of 2500");
});

test("7.4 без рендера точность не выдумывается", () => {
  const { container } = render(<PaletteAccuracy {...paletteAccuracyProps({ accuracy: null })} />);
  expect(container.textContent).toBe("");
});

/* ------------------------------------------- 8. мобильная раскладка */

const layoutCss = fs.readFileSync(path.join(__dirname, "mapartController.css"), "utf-8");
const studioCss = fs.readFileSync(path.join(__dirname, "studioPanel.css"), "utf-8");
const accuracyCss = fs.readFileSync(path.join(__dirname, "paletteAccuracy.css"), "utf-8");

test("8.1 на телефоне кнопки и поля достаются для пальца", () => {
  const mobile = layoutCss.slice(layoutCss.lastIndexOf("@media (max-width: 720px)"));
  expect(mobile).toMatch(/min-height:\s*40px/);
  expect(mobile).toMatch(/\.materialsDiv[\s\S]*overflow-x:\s*auto/);
});

test("8.2 у кнопок экспорта текст не уезжает вверх на большой высоте", () => {
  const mobile = layoutCss.slice(layoutCss.lastIndexOf("@media (max-width: 720px)"));
  expect(mobile).toMatch(/\.greenButton_text[\s\S]*line-height:\s*38px/);
});

test("8.3 кнопки экспорта на телефоне занимают всю ширину", () => {
  const mobile = layoutCss.slice(layoutCss.lastIndexOf("@media (max-width: 720px)"));
  expect(mobile).toMatch(/\.greenButtonsRow[\s\S]*width:\s*100%/);
});

test("8.4 панель проекта и индикатор точности размечены стилями", () => {
  expect(studioCss).toContain(".studioProjectRow");
  /* Точность палитры живёт под превью, а не внизу панели студии: там её
     перекрывала липкая полоса экспорта. */
  expect(accuracyCss).toContain(".mapAccuracyHint");
  expect(studioCss).not.toContain(".studioAccuracy");
});
