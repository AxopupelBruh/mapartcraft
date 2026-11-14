#!/usr/bin/env node
/*
 * Renders the same test image with the old and the new worker and compares
 * the quality of the result.
 *
 * Usage: node src/tools/compareDithering.js <oldMapCanvas.js> <newMapCanvas.js>
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// __dirname is <site>/src/tools, so two levels up is the site root
const Site = path.join(__dirname, "..", "..");

function loadWorker(file) {
  // the worker is an ES module; strip the export so it can run in a sandbox
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

function rampImage() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = Math.round((y / (H - 1)) * 255);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

function bodyFor(imageData, ditheringUniqueId) {
  const coloursJSON = JSON.parse(
    fs.readFileSync(path.join(Site, "src/components/mapart/json/coloursJSON.json"), "utf8")
  );
  const MapModes = JSON.parse(fs.readFileSync(path.join(Site, "src/components/mapart/json/mapModes.json"), "utf8"));
  const WhereSupportBlocksModes = JSON.parse(
    fs.readFileSync(path.join(Site, "src/components/mapart/json/whereSupportBlocksModes.json"), "utf8")
  );
  const ColourMethods = JSON.parse(
    fs.readFileSync(path.join(Site, "src/components/mapart/json/colourMethods.json"), "utf8")
  );
  const DitherMethods = JSON.parse(
    fs.readFileSync(path.join(Site, "src/components/mapart/json/ditherMethods.json"), "utf8")
  );
  const selectedBlocks = { 28: "0", 13: "0" };
  const disabledTones = { 28: new Set(["normal", "light", "unobtainable"]), 13: new Set(["dark", "normal", "unobtainable"]) };
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
    optionValue_betterColour: ColourMethods.Euclidian.uniqueId,
    optionValue_dithering: ditheringUniqueId,
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

/**
 * The dithering pattern is only good if the local average of the rendered
 * pixels follows the original tone. This measures how far the row average
 * drifts from the true value, and how many cells of the 4x4 tile use the
 * second colour (the pattern is invisible when that number is 0 or 16).
 */
function analyse(pixels, tile) {
  const rowError = [];
  for (let y = 0; y < H; y++) {
    const trueValue = Math.round((y / (H - 1)) * 255);
    let sum = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      sum += pixels[i];
    }
    rowError.push(Math.abs(sum / W - trueValue));
  }
  const mae = rowError.reduce((a, b) => a + b, 0) / rowError.length;

  // count how many distinct colours appear inside one tile in the middle of
  // the ramp, where the pattern has to do the work
  const coloursInTile = new Set();
  const originX = Math.floor(W / 2) - tile;
  const originY = Math.floor(H / 2) - tile;
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const i = ((originY + y) * W + originX + x) * 4;
      coloursInTile.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    }
  }
  // the error over the middle half of the ramp, where a two tone pattern has
  // to reproduce every shade
  const half = Math.floor(H / 4);
  const midError = rowError.slice(half, H - half);
  const maeMiddle = midError.reduce((a, b) => a + b, 0) / midError.length;
  return { mae, maeMiddle, distinctColoursInTile: coloursInTile.size };
}

function renderPattern(file, ditheringUniqueId) {
  const worker = loadWorker(file);
  const result = worker.send(bodyFor(rampImage(), ditheringUniqueId));
  return result.body.pixels.data;
}

const [, , oldFile, newFile] = process.argv;
if (!oldFile || !newFile) {
  console.error("usage: node compareDithering.js <oldMapCanvas.js> <newMapCanvas.js>");
  process.exit(1);
}

const ditherMethods = JSON.parse(
  fs.readFileSync(path.join(Site, "src/components/mapart/json/ditherMethods.json"), "utf8")
);

console.log("Bayer 4x4 on a black-to-white ramp (two tone palette)\n");
console.log("  version   tone error (all)   tone error (mid ramp)   tones used in one tile");
for (const [label, file] of [
  ["before", oldFile],
  ["after ", newFile],
]) {
  const pixels = renderPattern(file, ditherMethods.Bayer44.uniqueId);
  const { mae, maeMiddle, distinctColoursInTile } = analyse(pixels, 4);
  console.log(
    `  ${label}   ${mae.toFixed(2).padStart(15)}   ${maeMiddle.toFixed(2).padStart(19)}   ${String(distinctColoursInTile).padStart(21)}`
  );
}

console.log("\nThe tone error is how far the dithered image drifts from the original");
// ---------------------------------------------------------------------------
// Pattern mix accuracy: how much of the second colour ends up in a tile
// compared to what the tone asks for.
// ---------------------------------------------------------------------------
const BLACK = [17, 17, 17];
const WHITE = [255, 255, 255];

function solidImage(v) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

function mixAt(file, v) {
  const worker = loadWorker(file);
  const result = worker.send(bodyFor(solidImage(v), ditherMethods.Bayer44.uniqueId));
  const pixels = result.body.pixels.data;
  let white = 0;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * W + x) * 4;
      if (pixels[i] === WHITE[0]) white += 1;
    }
  }
  return white / 16;
}

console.log("\nHow much of the light colour a tile uses, against what the tone asks for");
console.log("  grey   ideal   before   after");
for (const v of [64, 96, 128, 160, 192]) {
  const ideal = (v - BLACK[0]) / (WHITE[0] - BLACK[0]);
  const before = mixAt(oldFile, v);
  const after = mixAt(newFile, v);
  console.log(
    `  ${String(v).padStart(4)}   ${(ideal * 100).toFixed(0).padStart(4)}%   ${(before * 100).toFixed(0).padStart(5)}%   ${(after * 100).toFixed(0).padStart(4)}%`
  );
}
