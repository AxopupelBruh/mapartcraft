#!/usr/bin/env node
/*
 * Measures what the performance stage of MapArtCraft Local Studio changed.
 *
 * It renders the same image with the worker from the git baseline and with the
 * worker of the working copy and compares:
 *
 *   - the time of a full render of a 512x512 map,
 *   - the time of a second render that only changes a dithering setting
 *     (the colour cache is warm instead of empty),
 *   - the colour search with the old nested loops and with the flat tone list,
 *   - the copy of the palette that the studio does for custom blocks.
 *
 * The version before the performance stage is the one of the phase 0
 * (phase0-final.tar.gz), not the one of the git baseline: the git baseline
 * does not contain the fixes of the phase 0 yet.
 *
 * Usage: node src/tools/benchmarkPhase1.js [oldMapCanvas.js] [newMapCanvas.js]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

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

const W = 512;
const H = 512;

function photoImage() {
  // something with smooth areas, edges and noise, like a photograph
  const data = new Uint8ClampedArray(W * H * 4);
  let seed = 12345;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const noise = ((seed >> 16) & 0x3f) - 32;
      const wave = Math.sin(x / 23) * 60 + Math.cos(y / 17) * 60;
      data[i] = Math.max(0, Math.min(255, 128 + wave + noise));
      data[i + 1] = Math.max(0, Math.min(255, 90 + x / 4 + noise));
      data[i + 2] = Math.max(0, Math.min(255, 160 - y / 5 + noise));
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(Site, relative), "utf8"));
}

const coloursJSON = readJson("src/components/mapart/json/coloursJSON.json");
const MapModes = readJson("src/components/mapart/json/mapModes.json");
const WhereSupportBlocksModes = readJson("src/components/mapart/json/whereSupportBlocksModes.json");
const ColourMethods = readJson("src/components/mapart/json/colourMethods.json");
const DitherMethods = readJson("src/components/mapart/json/ditherMethods.json");

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
    optionValue_mapSize_x: 4,
    optionValue_mapSize_y: 4,
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

// ---------------------------------------------------------------------------
// 1. the full render
// ---------------------------------------------------------------------------
// Every version is measured in its own process: a render leaves a million
// entries in the colour caches behind, and the garbage of one version would
// slow down the measurement of the next one.
function renderInOwnProcess(file) {
  // The result is kept, so that a variant can be measured in its own shell
  // when the whole run does not fit into one.
  const cached = path.join("/tmp", "phase1", `bench-${path.basename(file)}.json`);
  if (fs.existsSync(cached)) {
    return JSON.parse(fs.readFileSync(cached, "utf8"));
  }
  const output = execFileSync(process.execPath, [__filename, "--render", file], { encoding: "utf8" });
  return JSON.parse(output);
}

function renderMeasurements(file, runs = 2) {
  const image = photoImage();

  // A new worker for every render. This is what the studio did before: the
  // worker was thrown away after every preview, so the jit had to warm up
  // again and the colour caches were empty again.
  const cold = [];
  for (let run = 0; run < runs; run++) {
    const worker = loadWorker(file);
    const start = process.hrtime.bigint();
    worker.send(bodyFor(image));
    cold.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  // One worker for all renders. The first render pays for the jit warmup, the
  // following ones are fast and the colour cache stays warm.
  const worker = loadWorker(file);
  const warm = [];
  for (let run = 0; run < runs; run++) {
    const start = process.hrtime.bigint();
    worker.send(bodyFor(image, { optionValue_dithering_strength: 100 - run * 5 }));
    warm.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  const sum = (list) => list.reduce((a, b) => a + b, 0);
  return {
    coldAverage: sum(cold) / cold.length,
    warmFirst: warm[0],
    warmAverage: sum(warm.slice(1)) / (warm.length - 1),
  };
}

if (process.argv[2] === "--render") {
  const file = process.argv[3];
  const result = JSON.stringify(renderMeasurements(file, Number(process.argv[4]) || 2));
  const cached = path.join("/tmp", "phase1", `bench-${path.basename(file)}.json`);
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, result);
  process.stdout.write(result);
  process.exit(0);
}

const oldFile = process.argv[2];
const newFile = process.argv[3];
if (!oldFile || !newFile) {
  console.error("usage: node benchmarkPhase1.js <oldMapCanvas.js> <newMapCanvas.js>");
  process.exit(1);
}

console.log(`Render of a 512x512 map with the whole palette\n`);
console.log("  version   new worker per render   one long living worker");
console.log("            (the old behaviour)     first render   then per render");
for (const [label, file] of [
  ["before", oldFile],
  ["after ", newFile],
]) {
  const { coldAverage, warmFirst, warmAverage } = renderInOwnProcess(file);
  console.log(
    `  ${label}   ${coldAverage.toFixed(0).padStart(15)} ms   ${warmFirst.toFixed(0).padStart(11)} ms   ${warmAverage.toFixed(0).padStart(13)} ms`
  );
}

// ---------------------------------------------------------------------------
// 2. the colour search on its own
// ---------------------------------------------------------------------------
console.log("\nColour search for 20000 different colours\n");

function toneSets() {
  const sets = [];
  for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
    const tonesRGB = {};
    for (const [tone, rgb] of Object.entries(colourSet.tonesRGB)) {
      if (!rgb || rgb.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) continue;
      tonesRGB[tone] = rgb;
    }
    if (Object.keys(tonesRGB).length === 0) continue;
    sets.push({ colourSetId, tonesRGB });
  }
  return sets;
}

const sets = toneSets();
const flat = [];
for (const set of sets) {
  for (const tone of Object.keys(set.tonesRGB)) {
    flat.push({ rgb: set.tonesRGB[tone], colourSetId: set.colourSetId, tone });
  }
}

function metric(pixel1, pixel2) {
  const r = pixel1[0] - pixel2[0];
  const g = pixel1[1] - pixel2[1];
  const b = pixel1[2] - pixel2[2];
  return r * r + g * g + b * b;
}

function searchNested(pixel) {
  let shortest = Infinity;
  let closest = null;
  sets.forEach((colourSet) => {
    Object.keys(colourSet.tonesRGB).forEach((toneKey) => {
      const distance = metric(colourSet.tonesRGB[toneKey], pixel);
      if (distance < shortest) {
        shortest = distance;
        closest = { colourSetId: colourSet.colourSetId, tone: toneKey };
      }
    });
  });
  return closest;
}

function searchFlat(pixel) {
  let shortest = Infinity;
  let closest = null;
  for (let index = 0; index < flat.length; index++) {
    const entry = flat[index];
    const distance = metric(entry.rgb, pixel);
    if (distance < shortest) {
      shortest = distance;
      closest = { colourSetId: entry.colourSetId, tone: entry.tone };
    }
  }
  return closest;
}

const probes = [];
for (let i = 0; i < 20000; i++) {
  probes.push([(i * 37) % 256, (i * 91) % 256, (i * 173) % 256]);
}

function measure(search) {
  const start = process.hrtime.bigint();
  for (const probe of probes) search(probe);
  return Number(process.hrtime.bigint() - start) / 1e6;
}

// warm up the jit
measure(searchNested);
measure(searchFlat);
const nested = Math.min(measure(searchNested), measure(searchNested));
const flatTime = Math.min(measure(searchFlat), measure(searchFlat));
console.log(`  nested loops over the colour sets   ${nested.toFixed(0).padStart(6)} ms`);
console.log(`  flat list of the tones               ${flatTime.toFixed(0).padStart(6)} ms`);
console.log(`  factor                               ${(nested / flatTime).toFixed(1).padStart(6)}x`);
console.log(`  (${sets.length} colour sets, ${flat.length} tones)`);

// ---------------------------------------------------------------------------
// 3. the copy of the palette
// ---------------------------------------------------------------------------
console.log("\nCopy of the palette for the custom blocks\n");

function copyDeep() {
  return JSON.parse(JSON.stringify(coloursJSON));
}

function copyShallow() {
  const merged = { ...coloursJSON };
  for (const [colourSetId, customBlock] of [["28", { name: "test" }]]) {
    const colourSet = merged[colourSetId];
    if (!colourSet) continue;
    const blocks = { ...colourSet.blocks };
    blocks[Object.keys(blocks).length.toString()] = customBlock;
    merged[colourSetId] = { ...colourSet, blocks };
  }
  return merged;
}

function measureCopy(copy) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) copy();
  return Number(process.hrtime.bigint() - start) / 1e6 / 20;
}

const deep = measureCopy(copyDeep);
const shallow = measureCopy(copyShallow);
console.log(`  JSON.parse(JSON.stringify(...))       ${deep.toFixed(2).padStart(6)} ms`);
console.log(`  copy of the changed colour sets only  ${shallow.toFixed(2).padStart(6)} ms`);
