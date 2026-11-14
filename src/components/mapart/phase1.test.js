import MapWorker from "./workers/mapCanvas";

import coloursJSON from "./json/coloursJSON.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";

const W = 128;
const H = 128;

const BLACK_SET = "28";
const WHITE_SET = "13";

// A palette of exactly two colours, so that the result is easy to read.
function twoToneSelection(extraSelected) {
  const selectedBlocks = {};
  const disabledTones = {};
  selectedBlocks[BLACK_SET] = "0";
  selectedBlocks[WHITE_SET] = "0";
  disabledTones[BLACK_SET] = new Set(["normal", "light", "unobtainable"]);
  disabledTones[WHITE_SET] = new Set(["dark", "normal", "unobtainable"]);
  for (const id of extraSelected || []) {
    selectedBlocks[id] = "0";
    disabledTones[id] = new Set();
  }
  return { selectedBlocks, disabledTones };
}

function solidImageData(value, width = W, height = H) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function noiseImageData(seed, width = W, height = H) {
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed;
  for (let i = 0; i < width * height; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    data[i * 4] = (s >> 16) & 0xff;
    data[i * 4 + 1] = (s >> 8) & 0xff;
    data[i * 4 + 2] = s & 0xff;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function baseBody(imageData, extra) {
  const { selectedBlocks, disabledTones } = twoToneSelection();
  return {
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

// A worker session that speaks the studio protocol: the palette comes with an
// INIT message, the renders carry a request id.
const originalPostMessage = window.postMessage;

function createSession() {
  MapWorker();
  const messages = [];
  window.postMessage = (message) => {
    messages.push(message);
  };
  return {
    messages,
    send(head, body) {
      messages.length = 0;
      window.onmessage({ data: { head, body } });
      const result = messages.find((message) =>
        ["PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS", "ERROR", "INIT_DONE"].includes(message.head)
      );
      return result;
    },
    init(requestId = 1, tables) {
      return this.send("INIT", {
        coloursJSON,
        MapModes,
        WhereSupportBlocksModes,
        ColourMethods,
        DitherMethods,
        ...tables,
        requestId,
      });
    },
    render(body, requestId = 2) {
      return this.send("PIXELS", { ...body, requestId });
    },
    restore() {
      window.postMessage = originalPostMessage;
    },
  };
}

function uniqueColours(pixels) {
  const colours = new Set();
  for (let i = 0; i < pixels.length; i += 4) {
    colours.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  return colours;
}

afterEach(() => {
  /* Возвращаем настоящий postMessage: сессия подменяет его заглушкой. */
  window.postMessage = originalPostMessage;
});

// ------------------------------------------------------- the studio protocol

test("the palette is taken from the INIT message and the render works without it", () => {
  const session = createSession();
  const initDone = session.init(7);
  expect(initDone.head).toBe("INIT_DONE");
  expect(initDone.requestId).toBe(7);

  const result = session.render(baseBody(solidImageData(128)), 8);
  expect(result.head).toBe("PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS");
  expect(result.requestId).toBe(8);
  // the two tone palette of the INIT message was used
  const colours = Array.from(uniqueColours(result.body.pixels.data));
  expect(colours.length).toBe(1);
  expect(["17,17,17", "255,255,255"]).toContain(colours[0]);
  session.restore();
});

test("the render answer carries the request id of the render", () => {
  const session = createSession();
  session.init(1);
  const result = session.render(baseBody(noiseImageData(7)), 42);
  expect(result.requestId).toBe(42);
  session.restore();
});

test("a broken dithering method is reported instead of killing the worker", () => {
  const session = createSession();
  session.init(1);
  const brokenMethods = JSON.parse(JSON.stringify(DitherMethods));
  brokenMethods.Broken = { uniqueId: 999, name: "Broken", algorithm: "doesNotExist" };
  session.init(1, { DitherMethods: brokenMethods });
  const result = session.render(baseBody(solidImageData(128), { optionValue_dithering: 999 }), 5);
  expect(result.head).toBe("ERROR");
  expect(result.requestId).toBe(5);
  expect(result.body.message).toEqual(expect.stringContaining("doesNotExist"));
  session.restore();
});

// ------------------------------------------------- the colour cache

test("a changed palette replaces the colours of the previous render", () => {
  // The colour cache is kept between renders, but only as long as the palette
  // is the same. With a stale cache the second render would still use the
  // colours of the first one.
  const session = createSession();
  session.init(1);

  const first = session.render(
    baseBody(noiseImageData(5), { optionValue_dithering: DitherMethods.Bayer44.uniqueId }),
    2
  );
  const firstColours = uniqueColours(first.body.pixels.data);
  expect(firstColours.size).toBe(2);

  // a different palette: one brownish colour set instead of the two tones
  const { selectedBlocks, disabledTones } = twoToneSelection(["35"]);
  selectedBlocks[BLACK_SET] = "-1";
  selectedBlocks[WHITE_SET] = "-1";
  const second = session.render(
    baseBody(noiseImageData(5), {
      selectedBlocks,
      disabledTones,
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
    }),
    3
  );
  const secondColours = uniqueColours(second.body.pixels.data);
  expect(secondColours.size).toBeGreaterThan(0);
  for (const colour of secondColours) {
    expect(firstColours.has(colour)).toBe(false);
  }
  session.restore();
});

test("the same palette gives the same result, no matter how many renders came before", () => {
  const session = createSession();
  session.init(1);
  const first = session.render(baseBody(noiseImageData(11)), 2);
  session.render(baseBody(noiseImageData(12)), 3);
  const again = session.render(baseBody(noiseImageData(11)), 4);
  expect(Array.from(again.body.pixels.data)).toEqual(Array.from(first.body.pixels.data));
  session.restore();
});

test("a changed dithering strength changes the result but keeps the palette", () => {
  const session = createSession();
  session.init(1);
  const first = session.render(
    baseBody(noiseImageData(3), { optionValue_dithering: DitherMethods.Bayer44.uniqueId }),
    2
  );
  const second = session.render(
    baseBody(noiseImageData(3), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_dithering_strength: 40,
    }),
    3
  );
  expect(Array.from(second.body.pixels.data)).not.toEqual(Array.from(first.body.pixels.data));
  expect(uniqueColours(second.body.pixels.data).size).toBe(2);
  session.restore();
});

// ------------------------------------------------- the pixel editor edits

test("a painted pixel keeps its colour and is not dithered", () => {
  const session = createSession();
  session.init(1);
  // The painted colour is the darkest tone of the palette. The dithering would
  // replace it with the light tone, a painted pixel is never dithered.
  const result = session.render(
    baseBody(noiseImageData(9), {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      pixelEdits: { 0: "#111111" },
    }),
    2
  );
  const pixels = result.body.pixels.data;
  expect([pixels[0], pixels[1], pixels[2]]).toEqual([17, 17, 17]);
  session.restore();
});

test("a protected pixel is not removed by the island cleanup", () => {
  const session = createSession();
  session.init(1);
  const result = session.render(
    baseBody(solidImageData(128), {
      pixelEdits: { 0: "protect" },
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_despeckle: 4,
      optionValue_cleanup_paletteIslands: true,
    }),
    2
  );
  const pixels = result.body.pixels.data;
  expect(pixels[3]).toBe(255);
  session.restore();
});

test("a masked pixel is drawn with the closest single tone", () => {
  const session = createSession();
  session.init(1);
  const result = session.render(
    baseBody(solidImageData(128), { pixelEdits: { 0: "mask" } }),
    2
  );
  const pixels = result.body.pixels.data;
  expect(pixels[3]).toBe(255);
  expect(uniqueColours(result.body.pixels.data).size).toBeLessThanOrEqual(2);
  session.restore();
});
