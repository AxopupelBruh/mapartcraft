import MapWorker from "./workers/mapCanvas";

import coloursJSON from "./json/coloursJSON.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";
import { STYLE_PRESETS, STYLE_PRESET_IDS } from "../../presets/stylePresets";

const W = 128;
const H = 128;

// Two colour sets that give a clean black/white pair: Black Wool (dark tone)
// and White Wool (light tone). Using exactly two tones makes the dither
// pattern fully deterministic.
const BLACK_SET = "28";
const WHITE_SET = "13";

function solidImageData(rgb, holes) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  if (holes) {
    for (const [x, y, holeRgb] of holes) {
      const i = (y * W + x) * 4;
      data[i] = holeRgb[0];
      data[i + 1] = holeRgb[1];
      data[i + 2] = holeRgb[2];
    }
  }
  return { data, width: W, height: H };
}

function twoToneBody(imageData, extra) {
  const selectedBlocks = {};
  const disabledTones = {};
  selectedBlocks[BLACK_SET] = "0";
  selectedBlocks[WHITE_SET] = "0";
  // keep only one tone per colour set so the palette has exactly two colours
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

function pixelAt(pixels, x, y) {
  const i = (y * W + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}

// ---------------------------------------------------------------- C3: matrices

test("every ordered dither matrix is a permutation of 1..N", () => {
  for (const method of Object.values(DitherMethods)) {
    if (method.algorithm !== "ordered") continue;
    const matrix = method.ditherMatrix;
    expect(Array.isArray(matrix)).toBe(true);
    const size = matrix.length;
    expect(matrix.every((row) => row.length === size)).toBe(true);
    const flat = matrix.flat();
    expect(flat).toHaveLength(size * size);
    expect(new Set(flat).size).toBe(size * size);
    for (let i = 1; i <= size * size; i++) {
      expect(flat).toContain(i);
    }
  }
});

test("the Bayer matrices match Bryce Bayer's recursive definition", () => {
  // M(2n) = [[4Mn, 4Mn+2], [4Mn+3, 4Mn+1]]
  const bayer = (n) => {
    let m = [[0]];
    while (m.length < n) {
      const s = m.length;
      const out = Array.from({ length: s * 2 }, () => new Array(s * 2).fill(0));
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const v = m[y][x];
          out[y][x] = 4 * v;
          out[y][x + s] = 4 * v + 2;
          out[y + s][x] = 4 * v + 3;
          out[y + s][x + s] = 4 * v + 1;
        }
      }
      m = out;
    }
    return m.map((row) => row.map((v) => v + 1));
  };
  expect(DitherMethods.Bayer22.ditherMatrix).toEqual(bayer(2));
  expect(DitherMethods.Bayer44.ditherMatrix).toEqual(bayer(4));
  expect(DitherMethods.Bayer88.ditherMatrix).toEqual(bayer(8));
});

test("the stored Bayer matrices match the generated ones", () => {
  // The matrices are generated by tools/generateDitherMatrices.js; a hand
  // edited table would reintroduce the duplicate thresholds this replaces.
  const generated = require("../../tools/generateDitherMatrices");
  const matrices = generated.build();
  for (const [name, matrix] of Object.entries(matrices)) {
    expect(DitherMethods[name].ditherMatrix).toEqual(matrix);
  }
});

// ------------------------------------------------------------ C1 + C4: output

test("the Bayer 4x4 pattern is mixed evenly at mid grey", async () => {
  // 136 is exactly half way between the two palette tones, so the pattern has
  // to pick each of them for half of the tile.
  const result = await runWorker(
    twoToneBody(solidImageData([136, 136, 136]), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_betterColour: ColourMethods.Euclidian.uniqueId,
    })
  );
  const pixels = result.body.pixels.data;
  const counts = new Map();
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const key = pixelAt(pixels, x, y).join(",");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const distribution = Array.from(counts.values()).sort();
  expect(distribution).toEqual([8, 8]);
}, 60000);

test("the Bayer 4x4 pattern is laid out in raster order", async () => {
  // 65 mixes the two tones so that only the three lowest thresholds of the
  // canonical Bayer 4x4 table are used
  //   [ 1  9  3 11]
  //   [13  5 15  7]
  //   [ 4 12  2 10]
  //   [16  8 14  6]
  // which are the cells (0,0), (2,0) and (2,2). A transposed table would pick
  // (0,2) instead of (2,0), and the 2x2 Bayer could not produce this pattern.
  const result = await runWorker(
    twoToneBody(solidImageData([65, 65, 65]), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_betterColour: ColourMethods.Euclidian.uniqueId,
    })
  );
  const pixels = result.body.pixels.data;
  const patternCells = [
    [0, 0], [2, 0], [2, 2],
  ];
  const reference = pixelAt(pixels, 0, 0);
  for (const [x, y] of patternCells) {
    expect(pixelAt(pixels, x, y)).toEqual(reference);
  }
  const otherCells = [
    [1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1],
    [0, 2], [1, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3],
  ];
  for (const [x, y] of otherCells) {
    expect(pixelAt(pixels, x, y)).not.toEqual(reference);
  }
}, 60000);

test("the improved pattern path mixes evenly at mid grey too", async () => {
  const result = await runWorker(
    twoToneBody(solidImageData([136, 136, 136]), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_improvedPatternDithering: true,
    })
  );
  const pixels = result.body.pixels.data;
  const counts = new Map();
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const key = pixelAt(pixels, x, y).join(",");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  expect(Array.from(counts.values()).sort()).toEqual([8, 8]);
}, 60000);

test("no dithering produces a flat result", async () => {
  const result = await runWorker(
    twoToneBody(solidImageData([136, 136, 136]), { optionValue_dithering: DitherMethods.None.uniqueId })
  );
  const pixels = result.body.pixels.data;
  const first = pixelAt(pixels, 0, 0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      expect(pixelAt(pixels, x, y)).toEqual(first);
    }
  }
}, 60000);

// ---------------------------------------------------------- C6: method dispatch

test("every dithering method declares an algorithm and renders", async () => {
  /* blueNoise и orderedLuma added in stage 3: dithering by brightness. */
  const algorithms = new Set(["none", "errorDiffusion", "ordered", "blueNoise", "orderedLuma"]);
  for (const method of Object.values(DitherMethods)) {
    expect(algorithms.has(method.algorithm)).toBe(true);
  }
  for (const method of Object.values(DitherMethods)) {
    const result = await runWorker(
      twoToneBody(solidImageData([136, 136, 136]), { optionValue_dithering: method.uniqueId })
    );
    expect(result.body.pixels).toBeTruthy();
    expect(result.body.maps.length).toBe(1);
  }
}, 120000);

test("a method with an unknown algorithm fails loudly instead of silently", async () => {
  const brokenMethods = JSON.parse(JSON.stringify(DitherMethods));
  brokenMethods.Broken = { uniqueId: 999, name: "Broken", algorithm: "doesNotExist" };
  await expect(
    runWorker(
      twoToneBody(solidImageData([136, 136, 136]), {
        optionValue_dithering: 999,
        DitherMethods: brokenMethods,
      })
    )
  ).rejects.toThrow();
}, 60000);

// ---------------------------------------------- C5: support blocks after islands

test("the support block count matches the final pixels after island cleanup", async () => {
  const grey = [65, 65, 65];
  const black = [21, 21, 21];
  // one black pixel in a grey field: a single pixel island
  const withIsland = solidImageData(grey, [[64, 64, black]]);

  // run 1: the island cleanup removes the stray pixel
  const cleaned = await runWorker(
    twoToneBody(withIsland, {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_despeckle: 1,
      optionValue_cleanup_paletteIslands: true,
    })
  );
  const cleanedPixels = cleaned.body.pixels.data;
  // the island is gone, the pixel now matches its surroundings
  expect(pixelAt(cleanedPixels, 64, 64)).toEqual(pixelAt(cleanedPixels, 63, 64));
  const cleanedSupport = cleaned.body.maps[0][0].supportBlockCount;

  // run 2: feed the cleaned pixels back in without any cleanup, so the
  // support blocks are counted from exactly the same pixels
  const recounted = await runWorker(
    twoToneBody({ data: new Uint8ClampedArray(cleanedPixels), width: W, height: H }, {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_despeckle: 0,
      optionValue_cleanup_paletteIslands: true,
    })
  );
  expect(recounted.body.maps[0][0].supportBlockCount).toBe(cleanedSupport);
}, 120000);

test("the material counts add up to the number of painted pixels", async () => {
  const grey = [65, 65, 65];
  const black = [21, 21, 21];
  const withIsland = solidImageData(grey, [[64, 64, black]]);
  const result = await runWorker(
    twoToneBody(withIsland, {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_despeckle: 1,
      optionValue_cleanup_paletteIslands: true,
    })
  );
  const materials = result.body.maps[0][0].materials;
  const total = Object.values(materials).reduce((sum, value) => sum + value, 0);
  expect(total).toBe(W * H);
}, 120000);

// ------------------------------------- worker state: reused worker stays clean

test("the worker resets its state between renders", async () => {
  const first = await runWorker(twoToneBody(solidImageData([136, 136, 136])));
  expect(first.body.maps.length).toBe(1);
  expect(first.body.maps[0].length).toBe(1);
  const second = await runWorker(twoToneBody(solidImageData([136, 136, 136])));
  expect(second.body.maps.length).toBe(1);
  expect(second.body.maps[0].length).toBe(1);
}, 60000);

// ------------------------------------------------- C2 / C7: style preset wiring

test("the style presets that use an ordered dither enable the improved pattern", () => {
  for (const preset of STYLE_PRESETS) {
    const method = Object.values(DitherMethods).find((candidate) => candidate.uniqueId === preset.dithering);
    if (!method || method.algorithm !== "ordered") continue;
    expect(preset.improvedPattern).toBe(true);
  }
});

test("the valid style ids are derived from the preset list", () => {
  for (const preset of STYLE_PRESETS) {
    expect(STYLE_PRESET_IDS).toContain(preset.id);
  }
  expect(STYLE_PRESET_IDS).toContain("custom");
  expect(STYLE_PRESET_IDS).not.toContain("doesNotExist");
});
