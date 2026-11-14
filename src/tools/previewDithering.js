#!/usr/bin/env node
/*
 * Renders the same picture with several dithering methods and writes the
 * results as PNG files, so the new methods can be looked at side by side.
 *
 * Usage: node src/tools/previewDithering.js [outputDirectory]
 *
 * The picture is generated (a gradient with a blob), because the point is
 * to see the pattern of the dithering itself, not somebody's artwork.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const Site = path.join(__dirname, "..", "..");

const SIZE = 256;

/* The worker is an ES module; the export is stripped so that it can run in
   a sandbox. */
function loadWorker(file) {
  const source = fs.readFileSync(file, "utf8").replace("export default function", "function");
  const module = { exports: {} };
  let captured = null;
  const errors = [];
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
      if (!message) return;
      if (message.head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") captured = message;
      if (message.head === "ERROR") errors.push(message.body && message.body.message ? message.body.message : "error");
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: file });
  vm.runInContext("MapWorker();", sandbox, { filename: file });
  return {
    run(body) {
      captured = null;
      errors.length = 0;
      sandbox.onmessage({ data: { head: "PIXELS", body } });
      return { captured, errors };
    },
  };
}

/* A minimal PNG writer: one 8 bit RGB image, one filter byte per row. */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function writePNG(file, rgba, width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let position = 0;
  for (let y = 0; y < height; y++) {
    raw[position++] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      raw[position++] = rgba[index];
      raw[position++] = rgba[index + 1];
      raw[position++] = rgba[index + 2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/* The picture: a diagonal gradient with a bright blob and a dark one. */
function makeImage() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const index = (y * SIZE + x) * 4;
      const ramp = Math.round((x / (SIZE - 1)) * 255);
      const vertical = Math.round((y / (SIZE - 1)) * 255);
      const blob = Math.hypot(x - SIZE * 0.3, y - SIZE * 0.35) < SIZE * 0.2 ? 60 : 0;
      const dark = Math.hypot(x - SIZE * 0.72, y - SIZE * 0.7) < SIZE * 0.16 ? -70 : 0;
      data[index] = Math.max(0, Math.min(255, ramp + blob + dark));
      data[index + 1] = Math.max(0, Math.min(255, vertical + blob + dark));
      data[index + 2] = Math.max(0, Math.min(255, Math.round((ramp + vertical) / 2) + blob + dark));
      data[index + 3] = 255;
    }
  }
  return { data, width: SIZE, height: SIZE };
}

const coloursJSON = require(path.join(Site, "src/components/mapart/json/coloursJSON.json"));
const MapModes = require(path.join(Site, "src/components/mapart/json/mapModes.json"));
const WhereSupportBlocksModes = require(path.join(Site, "src/components/mapart/json/whereSupportBlocksModes.json"));
const ColourMethods = require(path.join(Site, "src/components/mapart/json/colourMethods.json"));
const DitherMethods = require(path.join(Site, "src/components/mapart/json/ditherMethods.json"));

const selectedBlocks = {};
const disabledTones = {};
for (const colourSetId of Object.keys(coloursJSON)) {
  selectedBlocks[colourSetId] = "0";
  disabledTones[colourSetId] = new Set();
}

function bodyFor(method, extra) {
  return {
    coloursJSON,
    MapModes,
    WhereSupportBlocksModes,
    ColourMethods,
    DitherMethods,
    canvasImageData: makeImage(),
    selectedBlocks,
    disabledTones,
    optionValue_modeNBTOrMapdat: MapModes.SCHEMATIC_NBT.uniqueId,
    optionValue_mapSize_x: 2,
    optionValue_mapSize_y: 2,
    optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
    optionValue_whereSupportBlocks: WhereSupportBlocksModes.ALL_DOUBLE_OPTIMIZED.uniqueId,
    optionValue_transparency: false,
    optionValue_transparencyTolerance: 128,
    optionValue_betterColour: ColourMethods.MapartCraftDefault.uniqueId,
    optionValue_dithering: method,
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
    optionValue_paletteStrategy: "all",
    optionValue_maxTones: 0,
    pixelEdits: {},
    ...extra,
  };
}

const outputDirectory = process.argv[2] || "/tmp/mapart-dithering";
fs.mkdirSync(outputDirectory, { recursive: true });

function sandbox_hue_stats() { return "n/a"; }
const worker = loadWorker(process.env.WORKER_FILE || path.join(Site, "src/components/mapart/workers/mapCanvas.js"));

const runs = [
  ["none", DitherMethods.None.uniqueId, {}],
  ["bayer44", DitherMethods.Bayer44.uniqueId, {}],
  ["bayer44-rotated-45", DitherMethods.Bayer44.uniqueId, { optionValue_dithering_rotation: 45 }],
  ["cluster-dot-44", DitherMethods.ClusterDot44.uniqueId, {}],
  ["void-and-cluster-14", DitherMethods.VoidAndCluster1414.uniqueId, {}],
  ["blue-noise-palette", DitherMethods.BlueNoisePalette.uniqueId, {}],
  ["luma-and-chroma", DitherMethods.LumaChroma.uniqueId, {}],
  ["blue-noise-palette-again", DitherMethods.BlueNoisePalette.uniqueId, {}],
];

for (const [name, method, extra] of runs) {
  const started = Date.now();
  const result = worker.run(bodyFor(method, extra));
  if (result.errors.length > 0) {
    console.error(`${name}: ${result.errors.join(" | ")}`);
    continue;
  }
  if (!result.captured) {
    console.error(`${name}: the worker returned nothing`);
    continue;
  }
  const file = path.join(outputDirectory, `${name}.png`);
  writePNG(file, result.captured.body.pixels.data, SIZE, SIZE);
  console.log(`${name}: ${file} (${Date.now() - started} ms)`);
  if (process.env.WORKER_FILE) console.log("  hue calls:", sandbox_hue_stats());
}
