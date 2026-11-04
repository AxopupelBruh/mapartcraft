import MapWorker from "./workers/mapCanvas";

import coloursJSON from "./json/coloursJSON.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";

const W = 128;
const H = 128;

function buildImageData(seed) {
  const data = new Uint8ClampedArray(W * H * 4);
  let s = seed;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const v = (s >> 16) & 0xff;
    const u = (s >> 8) & 0xff;
    const w2 = s & 0xff;
    data[i * 4] = v;
    data[i * 4 + 1] = u;
    data[i * 4 + 2] = w2;
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

function buildBody(imageData, extra) {
  const selectedBlocks = {};
  const disabledTones = {};
  const ids = Object.keys(coloursJSON).slice(0, 12);
  for (const id of ids) {
    selectedBlocks[id] = "0";
    disabledTones[id] = new Set();
  }
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
    optionValue_whereSupportBlocks: WhereSupportBlocksModes.NONE.uniqueId,
    optionValue_transparency: false,
    optionValue_transparencyTolerance: 128,
    optionValue_betterColour: ColourMethods.MapartCraftDefault.uniqueId,
    optionValue_dithering: DitherMethods.Bayer44.uniqueId,
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
    // jsdom's window.onmessage doubles as a message event listener, so deliver
    // worker messages directly instead of dispatching window events.
    window.postMessage = (message) => {
      if (!message || typeof message !== "object" || message.head !== "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") return;
      clearTimeout(timeout);
      window.postMessage = originalPostMessage;
      resolve(message);
    };
    const originalOnMessage = window.onmessage;
    originalOnMessage({ data: { head: "PIXELS", body } });
  });
}

test("worker runs legacy and improved pattern dithering end to end", async () => {
  const legacyResult = await runWorker(buildBody(buildImageData(42)));
  expect(legacyResult.body.pixels).toBeTruthy();

  const improvedResult = await runWorker(
    buildBody(buildImageData(42), { optionValue_improvedPatternDithering: true })
  );
  expect(improvedResult.body.pixels).toBeTruthy();

  const legacyPixels = legacyResult.body.pixels.data;
  const improvedPixels = improvedResult.body.pixels.data;
  let diff = 0;
  for (let i = 0; i < legacyPixels.length; i++) {
    if (legacyPixels[i] !== improvedPixels[i]) diff++;
  }
  // Improved algorithm must produce a different (better) result on noise.
  expect(diff).toBeGreaterThan(0);

  // Reflect mode also runs without errors and differs from nearest mode.
  const reflectResult = await runWorker(
    buildBody(buildImageData(42), { optionValue_improvedPatternDithering: true, optionValue_patternPairMode: "reflect" })
  );
  const reflectPixels = reflectResult.body.pixels.data;
  let diffReflect = 0;
  for (let i = 0; i < reflectPixels.length; i++) {
    if (reflectPixels[i] !== improvedPixels[i]) diffReflect++;
  }
  expect(diffReflect).toBeGreaterThan(0);
}, 60000);
