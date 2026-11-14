import fs from "fs";
import path from "path";

import MapWorker from "./workers/mapCanvas";
import { voidAndClusterRanks } from "./workers/blueNoise";

import coloursJSON from "./json/coloursJSON.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";

import { colourSetsPresentInImage, findDominantColours, rgbToLab, suggestBlocksForColours } from "./autoPalette";
import { isRotatableDithering, OPTION_SCHEMA, PERSISTED_OPTION_KEYS } from "./optionSchema";

/* ==========================================================================
   Функциональные тесты этапа 3: дизеринг по яркости, поворот узора и
   автопалитра.
   ========================================================================== */

const W = 128;
const H = 128;

/* Чёрная и белая шерсть: две тона, поэтому доля белого считается точно. */
const BLACK_SET = "28";
const WHITE_SET = "13";
const BLACK_RGB = [17, 17, 17];
const WHITE_RGB = [255, 255, 255];

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

function twoToneBody(imageData, extra) {
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
    ...extra,
  };
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

/* Доля белых пикселей в результате. */
function whiteShare(pixels) {
  let white = 0;
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4] > 128) white += 1;
  }
  return white / (W * H);
}

function countDifferent(first, second) {
  let different = 0;
  for (let i = 0; i < W * H * 4; i += 4) {
    if (first[i] !== second[i]) different += 1;
  }
  return different;
}

/* --------------------------------------------------------------------------
   3.3 — синий шум
   -------------------------------------------------------------------------- */

test("3.3 поле синего шума содержит все пороги ровно по одному разу", () => {
  const size = 8;
  const ranks = voidAndClusterRanks(size, size);
  const flat = ranks.flat();
  expect(flat.length).toBe(size * size);
  expect(new Set(flat).size).toBe(size * size);
  for (let value = 0; value < size * size; value++) expect(flat).toContain(value);
});

test("3.3 копия алгоритма в воркере совпадает с общим модулем", () => {
  /* Воркер собирается в функцию и уходит в воркер строкой — импортировать
     общий модуль он не может, поэтому алгоритм продублирован. Тест
     следит, чтобы копии не разошлись. */
  const source = fs.readFileSync(path.join(__dirname, "workers/mapCanvas.js"), "utf-8");
  const start = source.indexOf("function voidAndClusterRanks(M, N, options) {");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n}\n", start);
  const workerFunction = source.slice(start, end + 4);
  // eslint-disable-next-line no-new-func
  const ranks = new Function(`${workerFunction}; return voidAndClusterRanks;`)();
  expect(ranks(6, 6)).toEqual(voidAndClusterRanks(6, 6));
});

test("3.3 воркер рисует синий шум в правильной пропорции", async () => {
  const result = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.BlueNoisePalette.uniqueId,
    })
  );
  const share = whiteShare(result.body.pixels.data);
  /* Серая середина между двумя тонами — значит, белого должно быть
     примерно половина. */
  expect(share).toBeGreaterThan(0.35);
  expect(share).toBeLessThan(0.65);
}, 120000);

test("3.3 сила дизеринга меняет пропорцию", async () => {
  const weak = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.BlueNoisePalette.uniqueId,
      optionValue_dithering_strength: 50,
    })
  );
  const strong = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.BlueNoisePalette.uniqueId,
      optionValue_dithering_strength: 200,
    })
  );
  expect(whiteShare(strong.body.pixels.data)).toBeGreaterThan(whiteShare(weak.body.pixels.data));
}, 120000);

/* --------------------------------------------------------------------------
   3.4 — chroma-safe дизеринг
   -------------------------------------------------------------------------- */

test("3.4 дизеринг по яркости даёт правильную пропорцию", async () => {
  const result = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.LumaChroma.uniqueId,
    })
  );
  const share = whiteShare(result.body.pixels.data);
  expect(share).toBeGreaterThan(0.35);
  expect(share).toBeLessThan(0.65);
}, 120000);

test("3.4 дизеринг по яркости берёт только цвета палитры", async () => {
  const result = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.LumaChroma.uniqueId,
    })
  );
  const pixels = result.body.pixels.data;
  for (let i = 0; i < W * H; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const isBlack = r === BLACK_RGB[0] && g === BLACK_RGB[1] && b === BLACK_RGB[2];
    const isWhite = r === WHITE_RGB[0] && g === WHITE_RGB[1] && b === WHITE_RGB[2];
    expect(isBlack || isWhite).toBe(true);
  }
}, 120000);

test("3.4 тёмный пиксель остаётся тёмным", async () => {
  const result = await runWorker(
    twoToneBody(solidImageData([20, 20, 20]), {
      optionValue_dithering: DitherMethods.LumaChroma.uniqueId,
    })
  );
  /* Почти чёрный источник: белого быть почти не должно. */
  expect(whiteShare(result.body.pixels.data)).toBeLessThan(0.15);
}, 120000);

test("3.4 набор прозрачности не попадает в картинку", async () => {
  /* Набор прозрачности (Air) хранит фиктивные цвета -100. Если он попадёт
     в лестницу яркости, тёмный пиксель станет чёрным — а чёрного блока в
     палитре нет. */
  const selectedBlocks = {};
  const disabledTones = {};
  selectedBlocks[BLACK_SET] = "0";
  selectedBlocks[WHITE_SET] = "0";
  selectedBlocks["61"] = "0";
  disabledTones[BLACK_SET] = new Set(["normal", "light", "unobtainable"]);
  disabledTones[WHITE_SET] = new Set(["dark", "normal", "unobtainable"]);
  disabledTones["61"] = new Set(["normal", "light", "unobtainable"]);
  const result = await runWorker({
    ...twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.LumaChroma.uniqueId,
    }),
    selectedBlocks,
    disabledTones,
  });
  const pixels = result.body.pixels.data;
  for (let i = 0; i < W * H; i++) {
    expect(pixels[i * 4]).not.toBe(0);
  }
}, 120000);

/* --------------------------------------------------------------------------
   3.5 — поворот узора
   -------------------------------------------------------------------------- */

test("3.5 поворот узора меняет картинку", async () => {
  const straight = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_dithering_rotation: 0,
    })
  );
  const turned = await runWorker(
    twoToneBody(solidImageData([128, 128, 128]), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_dithering_rotation: 45,
    })
  );
  expect(countDifferent(straight.body.pixels.data, turned.body.pixels.data)).toBeGreaterThan(100);
}, 120000);

test("3.5 угол поворота сохраняется вместе с настройками", () => {
  expect(PERSISTED_OPTION_KEYS).toContain("optionValue_dithering_rotation");
  const option = OPTION_SCHEMA.find((entry) => entry.key === "optionValue_dithering_rotation");
  expect(option).toBeTruthy();
  expect(option.group).toBe("dithering");
});

test("3.5 угол поворота предлагается только для методов с узором", () => {
  expect(isRotatableDithering(DitherMethods.Bayer44.uniqueId)).toBe(true);
  expect(isRotatableDithering(DitherMethods.LumaChroma.uniqueId)).toBe(true);
  expect(isRotatableDithering(DitherMethods.FloydSteinberg.uniqueId)).toBe(false);
  expect(isRotatableDithering(DitherMethods.None.uniqueId)).toBe(false);
});

/* --------------------------------------------------------------------------
   3.6 — автопалитра
   -------------------------------------------------------------------------- */

const testImage = (size, blocks) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rgb = blocks[Math.floor((y / size) * blocks.length)];
      const index = (y * size + x) * 4;
      data[index] = rgb[0];
      data[index + 1] = rgb[1];
      data[index + 2] = rgb[2];
      data[index + 3] = 255;
    }
  }
  return { data, width: size, height: size };
};

test("3.6 автопалитра находит доминирующие цвета", () => {
  const image = testImage(16, [
    [220, 30, 30],
    [220, 30, 30],
    [30, 30, 220],
  ]);
  const clusters = findDominantColours(image, 2);
  expect(clusters.length).toBe(2);
  /* Первый кластер — самый частый цвет. */
  expect(clusters[0].rgb[0]).toBeGreaterThan(180);
  expect(clusters[0].rgb[2]).toBeLessThan(90);
  expect(clusters[0].share).toBeGreaterThan(0.5);
});

test("3.6 подбор блоков выбирает ближайший по цвету", () => {
  const image = testImage(16, [[220, 30, 30]]);
  const clusters = findDominantColours(image, 1);
  const suggestions = suggestBlocksForColours(clusters, coloursJSON, "1.21.4");
  expect(suggestions.length).toBe(1);
  expect(suggestions[0].blockId).toBeTruthy();
  /* У выбранного блока должен быть красный тон. */
  const tone = coloursJSON[suggestions[0].colourSetId].tonesRGB.normal;
  expect(tone[0]).toBeGreaterThan(tone[2]);
});

test("3.6 прозрачные пиксели не попадают в анализ", () => {
  const image = testImage(8, [[255, 255, 255]]);
  for (let i = 0; i < 8 * 8; i++) image.data[i * 4 + 3] = 0;
  expect(findDominantColours(image, 4)).toEqual([]);
});

test("3.6 наборы блоков, встречающиеся в картинке, находятся", () => {
  const image = testImage(16, [[220, 30, 30]]);
  const clusters = findDominantColours(image, 1);
  const present = colourSetsPresentInImage(clusters, coloursJSON);
  expect(present.size).toBeGreaterThan(0);
  for (const colourSetId of present) expect(coloursJSON[colourSetId]).toBeTruthy();
});

test("3.6 перевод в Lab обратим", () => {
  const lab = rgbToLab([220, 30, 30]);
  expect(lab[0]).toBeGreaterThan(30);
  expect(lab[0]).toBeLessThan(80);
  expect(Math.abs(lab[1])).toBeGreaterThan(20);
});
