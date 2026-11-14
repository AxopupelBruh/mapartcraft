#!/usr/bin/env node
/*
 * Renders the same images with two worker files and compares the pixels.
 *
 * This is the safety net for every change of the render: the result of the
 * working copy has to be bit for bit the same as the result of the version it
 * was based on. A difference is only allowed when it is wanted.
 *
 * Usage: node src/tools/compareRender.js <oldMapCanvas.js> <newMapCanvas.js>
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const Site = path.join(__dirname, "..", "..");

function loadWorker(file) {
  const source = fs.readFileSync(file, "utf8").replace("export default function", "function");
  const module = { exports: {} };
  let captured = null;
  const sandbox = {
    module,
    exports: module.exports,
    console,
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
    Float32Array,
    Math,
    Date,
    JSON,
    Map,
    Set,
    Infinity,
    isNaN,
    parseInt,
    parseFloat,
    Number,
    String,
    Array,
    Object,
    Error,
    postMessage: (message) => {
      if (message && message.head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") captured = message;
      if (message && message.head === "ERROR") throw new Error(message.body && message.body.message);
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: file });
  vm.runInContext("MapWorker();", sandbox, { filename: file });
  return {
    send(body) {
      captured = null;
      sandbox.onmessage({ data: { head: "PIXELS", body } });
      return captured;
    },
  };
}

const W = 128;
const H = 128;

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(Site, relative), "utf8"));
}

const coloursJSON = readJson("src/components/mapart/json/coloursJSON.json");
const MapModes = readJson("src/components/mapart/json/mapModes.json");
const WhereSupportBlocksModes = readJson("src/components/mapart/json/whereSupportBlocksModes.json");
const ColourMethods = readJson("src/components/mapart/json/colourMethods.json");
const DitherMethods = readJson("src/components/mapart/json/ditherMethods.json");

// The images that are rendered: a ramp, noise, a few blocks and a picture
// like gradient.
function images() {
  const list = [];
  const ramp = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = Math.round((y / (H - 1)) * 255);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      ramp[i] = v;
      ramp[i + 1] = v;
      ramp[i + 2] = v;
      ramp[i + 3] = 255;
    }
  }
  list.push({ name: "grey ramp", data: ramp, width: W, height: H });

  const noise = new Uint8ClampedArray(W * H * 4);
  let s = 12345;
  for (let i = 0; i < W * H; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    noise[i * 4] = (s >> 16) & 0xff;
    noise[i * 4 + 1] = (s >> 8) & 0xff;
    noise[i * 4 + 2] = s & 0xff;
    noise[i * 4 + 3] = 255;
  }
  list.push({ name: "noise", data: noise, width: W, height: H });

  const blocks = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      blocks[i] = (x >> 4) * 40;
      blocks[i + 1] = (y >> 4) * 40;
      blocks[i + 2] = ((x >> 5) + (y >> 5)) * 30;
      blocks[i + 3] = 255;
    }
  }
  list.push({ name: "blocks", data: blocks, width: W, height: H });
  return list;
}

function bodyFor(imageData, extra) {
  const selectedBlocks = {};
  const disabledTones = {};
  for (const id of Object.keys(coloursJSON)) {
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
    optionValue_whereSupportBlocks: WhereSupportBlocksModes.ALL_DOUBLE_OPTIMIZED.uniqueId,
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

const [, , oldFile, newFile] = process.argv;
if (!oldFile || !newFile) {
  console.error("usage: node compareRender.js <oldMapCanvas.js> <newMapCanvas.js>");
  process.exit(1);
}

const variants = [
  { label: "bayer 4x4", extra: { optionValue_dithering: DitherMethods.Bayer44.uniqueId } },
  { label: "bayer 2x2", extra: { optionValue_dithering: DitherMethods.Bayer22.uniqueId } },
  { label: "no dithering", extra: { optionValue_dithering: DitherMethods.None.uniqueId } },
  {
    label: "floyd steinberg",
    extra: { optionValue_dithering: DitherMethods.FloydSteinberg.uniqueId },
  },
  {
    label: "improved pattern",
    extra: {
      optionValue_dithering: DitherMethods.Bayer44.uniqueId,
      optionValue_improvedPatternDithering: true,
    },
  },
  {
    label: "euclidean colours",
    extra: { optionValue_betterColour: ColourMethods.Euclidian.uniqueId },
  },
  {
    label: "cie76 lab50",
    extra: { optionValue_betterColour: ColourMethods.Cie76_Lab50.uniqueId },
  },
  {
    label: "ciede2000 lab50",
    extra: { optionValue_betterColour: ColourMethods.Ciede2000_Lab50.uniqueId },
  },
  {
    label: "hct colours",
    extra: { optionValue_betterColour: ColourMethods.Hct.uniqueId },
  },
  {
    label: "cleanup despeckle",
    extra: {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_despeckle: 4,
      optionValue_cleanup_paletteIslands: true,
    },
  },
  {
    label: "cleanup simplify colours",
    extra: { optionValue_cleanup_enabled: true, optionValue_cleanup_colours: 8 },
  },
];

const oldWorker = loadWorker(oldFile);
const newWorker = loadWorker(newFile);
let differences = 0;
let comparisons = 0;
console.log("image        variant                 different pixels");
for (const image of images()) {
  for (const variant of variants) {
    const body = bodyFor(image, variant.extra);
    const oldPixels = oldWorker.send(body).body.pixels.data;
    const newPixels = newWorker.send(body).body.pixels.data;
    let diff = 0;
    for (let i = 0; i < oldPixels.length; i++) {
      if (oldPixels[i] !== newPixels[i]) diff++;
    }
    comparisons++;
    if (diff > 0) differences++;
    console.log(
      `  ${image.name.padEnd(10)} ${variant.label.padEnd(22)} ${String(diff).padStart(8)} / ${oldPixels.length}`
    );
  }
}
console.log("");
if (differences === 0) {
  console.log(`All ${comparisons} renders are the same.`);
} else {
  console.log(`${differences} of ${comparisons} renders are different.`);
  process.exitCode = 1;
}
