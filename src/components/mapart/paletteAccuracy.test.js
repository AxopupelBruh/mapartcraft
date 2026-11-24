import MapWorker from "./workers/mapCanvas";

import coloursJSON from "./json/coloursJSON.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";

/* Точность палитры — это доля пикселей картинки, чей цвет точно есть в
   действующей палитре. Тесты ниже фиксируют смысл этой цифры: она считает
   именно точные попадания, а не «похожесть». */

const W = 128;
const H = 128;

function allSetsSelected() {
  const selectedBlocks = {};
  const disabledTones = {};
  for (const colourSetId of Object.keys(coloursJSON)) {
    selectedBlocks[colourSetId] = "0";
    disabledTones[colourSetId] = new Set();
  }
  return { selectedBlocks, disabledTones };
}

function imageFromPixels(pixelAt) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rgb = pixelAt(x, y);
      const i = (y * W + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

function bodyFor(imageData, extra) {
  const { selectedBlocks, disabledTones } = allSetsSelected();
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
    const timeout = setTimeout(() => reject(new Error("worker timeout")), 30000);
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
    const originalOnMessage = window.onmessage;
    originalOnMessage({ data: { head: "PIXELS", body } });
  });
}

const WHITE_NORMAL = coloursJSON["13"].tonesRGB.normal;
const WHITE_UNOBTAINABLE = coloursJSON["13"].tonesRGB.unobtainable;

test("palette accuracy is 100% when every pixel is an exact palette tone", async () => {
  const image = imageFromPixels(() => WHITE_NORMAL);
  const result = await runWorker(bodyFor(image));
  expect(result.body.accuracy).toEqual({
    exact: W * H,
    total: W * H,
    share: 1,
    missed: 0,
    misses: [],
  });
});

test("palette accuracy counts the pixels that miss the palette", async () => {
  const image = imageFromPixels((x, y) => (y < H / 2 ? WHITE_NORMAL : [7, 7, 7]));
  const result = await runWorker(bodyFor(image));
  expect(result.body.accuracy.exact).toBe((W * H) / 2);
  expect(result.body.accuracy.share).toBeCloseTo(0.5, 5);
  expect(result.body.accuracy.missed).toBe((W * H) / 2);
});

test("the report names the block and the tone the missed pixels are closest to", async () => {
  /* Цвет на единицу отличается от тона палитры: так выглядит сдвиг после
     предобработки (например, насыщенность 103%). */
  const shifted = [WHITE_NORMAL[0] + 1, WHITE_NORMAL[1], WHITE_NORMAL[2]];
  const image = imageFromPixels(() => shifted);
  const result = await runWorker(bodyFor(image));
  const accuracy = result.body.accuracy;
  expect(accuracy.share).toBe(0);
  expect(accuracy.misses).toHaveLength(1);
  expect(accuracy.misses[0].count).toBe(W * H);
  expect(accuracy.misses[0].tone).toBe("normal");
  expect(accuracy.misses[0].blockName).toBeTruthy();
  expect(accuracy.misses[0].difference).toBe(1);
});

test("the unobtainable tone is only available in the map.dat mode", async () => {
  const image = imageFromPixels(() => WHITE_UNOBTAINABLE);
  const schematic = await runWorker(bodyFor(image));
  expect(schematic.body.accuracy.share).toBe(0);

  const mapdat = await runWorker(
    bodyFor(image, {
      optionValue_modeNBTOrMapdat: MapModes.MAPDAT.uniqueId,
      optionValue_staircasing: MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId,
    })
  );
  expect(mapdat.body.accuracy.share).toBe(1);
});
