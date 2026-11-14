// eslint-disable-next-line import/no-anonymous-default-export
// eslint-disable-next-line no-restricted-globals

export default function MapWorker (args) {

var coloursJSON;
var MapModes;
var WhereSupportBlocksModes;
var ColourMethods;
var DitherMethods;
var canvasImageData;
var selectedBlocks;
var disabledTones;
var optionValue_modeNBTOrMapdat;
var optionValue_mapSize_x;
var optionValue_mapSize_y;
var optionValue_staircasing;
var optionValue_whereSupportBlocks;
var optionValue_transparency;
var optionValue_transparencyTolerance;
var optionValue_betterColour;
var chosenColourMethod;
var optionValue_dithering;
var optionValue_dithering_propagation_red;
var optionValue_dithering_propagation_green;
var optionValue_dithering_propagation_blue;
var optionValue_dithering_strength = 100;
var optionValue_improvedPatternDithering = false;
var optionValue_patternPairMode = "nearest";
var optionValue_cleanup_enabled = false;
var optionValue_cleanup_denoise = 0;
var optionValue_cleanup_denoiseMethod = "median";
var optionValue_cleanup_edges = 60;
var optionValue_cleanup_despeckle = 0;
var optionValue_cleanup_paletteIslands = true;
var optionValue_cleanup_colours = 0;
var optionValue_cleanup_coloursPerceptual = false;
var optionValue_cleanup_islandsSmart = false;
var optionValue_cleanup_adaptiveDither = true;
var optionValue_style;
var pixelEdits;
var hasPixelEdits = false;
var hasMaskEdits = false;
// The pixel editor edits are kept in two typed arrays instead of a plain
// object: looking up an object key for every one of the 262144 pixels of a
// 512x512 map was one of the hottest lookups of the whole render.
//   kind 0 = no edit, 1 = mask, 2 = protect, 3 = painted colour, 4 = unknown value
var pixelEditKinds = null;
var pixelEditRGB = null;
var pixelEditIndices = null;
// Every tone that can be picked, in one flat list. The colour search used to
// call Object.keys(colourSet.tonesRGB) for every colour set on every pixel,
// which allocated an array per colour set per pixel.
var flatToneList = [];
// Identifies the tone set the colour caches belong to. The caches only depend
// on the tones that can be picked, so changing a dithering slider must not
// throw them away, but changing the palette must.
var flatToneSignature = null;
var sourceImageData = null;
var cleanupProtectionMask = null;

var colourSetsToUse = []; // colourSetIds and shades to use in map
var exactColourCache = new Map(); // for mapping RGB that exactly matches in coloursJSON to colourSetId and tone
var colourCache = new Map(); // cache for reusing nearest single colours
var colourCache2 = new Map(); // cache for nearest two colours (Bayer dithering)
var colourCache2Improved = new Map(); // cache for nearest two colours with fixed second-best selection
var colourCache2Reflect = new Map(); // cache for nearest colour + its reflected pair
var labCache = new Map();
// The support block rule of every colour set of the current palette.
var supportMandatoryByColourSetId = new Map();
var lab50Cache = new Map();
var lab65Cache = new Map();
var hctCache = new Map();

var maps = [];
// The request the current render belongs to, so that a progress report of a
// render that has been superseded can be ignored by the main thread.
var currentRequestId = null;

let alphaColorIdx = 61;

/*
  'maps' is a matrix with entries accessable via maps[z][x], each of which corresponds to a 128x128 map. A typical entry is:
  { materials: {}, supportBlockCount: 128 }
  'materials' is a dictionary with keys corresponding to colourSetIds and entries being the number of blocks from this colourSet required to make the map.
*/

// rgb2lab conversion based on the one from redstonehelper's program
function rgb2lab(rgb) {
  let val = (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
  if (labCache.has(val)) return labCache.get(val);

  let r1 = rgb[0] / 255.0;
  let g1 = rgb[1] / 255.0;
  let b1 = rgb[2] / 255.0;

  r1 = 0.04045 >= r1 ? (r1 /= 12.0) : Math.pow((r1 + 0.055) / 1.055, 2.4);
  g1 = 0.04045 >= g1 ? (g1 /= 12.0) : Math.pow((g1 + 0.055) / 1.055, 2.4);
  b1 = 0.04045 >= b1 ? (b1 /= 12.0) : Math.pow((b1 + 0.055) / 1.055, 2.4);
  let f = (0.43605202 * r1 + 0.3850816 * g1 + 0.14308742 * b1) / 0.964221,
    h = 0.22249159 * r1 + 0.71688604 * g1 + 0.060621485 * b1,
    k = (0.013929122 * r1 + 0.097097 * g1 + 0.7141855 * b1) / 0.825211,
    l = 0.008856452 < h ? Math.pow(h, 1 / 3) : (903.2963 * h + 16.0) / 116.0,
    m = 500.0 * ((0.008856452 < f ? Math.pow(f, 1 / 3) : (903.2963 * f + 16.0) / 116.0) - l),
    n = 200.0 * (l - (0.008856452 < k ? Math.pow(k, 1 / 3) : (903.2963 * k + 16.0) / 116.0));

  rgb = [2.55 * (116.0 * l - 16.0) + 0.5, m + 0.5, n + 0.5];
  labCache.set(val, rgb);
  return rgb;
}

//Code based on culori.js - https://culorijs.org/

function labF(y) {
  return (0.00885645167903563081717167575546 < y ? Math.cbrt(y) : (903.2962962962962962962962962963 * y + 16) / 116);
}

function rgb2lab50(rgb) {
  let val = (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
  if (lab50Cache.has(val)) return lab50Cache.get(val);

  let r1 = rgb[0] / 255.0;
  let g1 = rgb[1] / 255.0;
  let b1 = rgb[2] / 255.0;

  let x = (0.436065742824811 * r1 + 0.3851514688337912 * g1 + 0.14307845442264197 * b1) / 0.96429567642956764295676429567643,
    y = 0.22249319175623702 * r1 + 0.7168870538238823 * g1 + 0.06061979053616537 * b1,
    z = (0.013923904500943465 * r1 + 0.09708128566574634 * g1 + 0.7140993584005155 * b1) / 0.82510460251046025104602510460251;
  let f1 = labF(y);

  let l = 116 * f1 - 16;
  let a = 0;
  let b = 0;

  if (r1 !== g1 || g1 !== b1) {
    let f0 = (0.00885645167903563081717167575546 < x ? Math.cbrt(x) : (903.2962962962962962962962962963 * x + 16) / 116);
    let f2 = (0.00885645167903563081717167575546 < z ? Math.cbrt(z) : (903.2962962962962962962962962963 * z + 16) / 116);
    a = 500 * (f0 - f1);
    b = 200 * (f1 - f2);
  }

  let lab50 = [l, a, b];
  lab50Cache.set(val, lab50);
  return lab50;
}

//Code based on culori.js - https://culorijs.org/
function rgb2lab65(rgb) {
  let val = (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
  if (lab65Cache.has(val)) return lab65Cache.get(val);

  let r1 = rgb[0] / 255.0;
  let g1 = rgb[1] / 255.0;
  let b1 = rgb[2] / 255.0;

  let x = (0.4123907992659593 * r1 + 0.357584339383878 * g1 + 0.1804807884018343 * b1) / 0.95045592705167173252279635258359,
    y = 0.2126390058715102 * r1 + 0.715168678767756 * g1 + 0.0721923153607337 * b1,
    z = (0.0193308187155918 * r1 + 0.119194779794626 * g1 + 0.9505321522496607 * b1) / 1.0890577507598784194528875379939;
  let f1 = labF(y);

  let l = 116 * f1 - 16;
  let a = 0;
  let b = 0;

  if (r1 !== g1 || g1 !== b1) {
    let f0 = (0.00885645167903563081717167575546 < x ? Math.cbrt(x) : (903.2962962962962962962962962963 * x + 16) / 116);
    let f2 = (0.00885645167903563081717167575546 < z ? Math.cbrt(z) : (903.2962962962962962962962962963 * z + 16) / 116);
    a = 500 * (f0 - f1);
    b = 200 * (f1 - f2);
  }

  let lab65 = [l, a, b];
  lab65Cache.set(val, lab65);
  return lab65;
}

//Code based on material-foundation - https://github.com/material-foundation/material-color-utilities
function linearized(channel) {
  const normalized = channel / 255.0;
  if (normalized <= 0.040449936) {
    return normalized / 12.92;
  } else {
    return Math.pow((normalized + 0.055) / 1.055, 2.4); //NOT multiplied by 100.0
  }
}

function signum(num) {
  if (num < 0) {
    return -1;
  } else if (num > 0) {
    return 1;
  } else {
    return 0;
  }
}

function rgb2xyz(rgb) {
  const r1 = linearized(rgb[0]);
  const g1 = linearized(rgb[1]);
  const b1 = linearized(rgb[2]);

  const x = 0.41233895 * r1 + 0.35762064 * g1 + 0.18051042 * b1;
  const y = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
  const z = 0.01932141 * r1 + 0.11916382 * g1 + 0.95034478 * b1;

  return [x, y, z]; // NOT multiplied by 100.0
}

function rgb2hct(rgb) {
  const val = (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
  if (hctCache.has(val)) return hctCache.get(val);

  const xyz = rgb2xyz(rgb);
  const x = xyz[0];
  const y = xyz[1];
  const z = xyz[2];

  const rD = (0.401288 * x + 0.650173 * y - 0.051461 * z) * 1.0211777027575200;
  const gD = (-0.250268 * x + 1.204414 * y + 0.045854 * z) * 0.98630772942801237;
  const bD = (-0.002079 * x + 0.048952 * y + 0.953127 * z) * 0.93396050828022992;

  const rAF = Math.pow((0.38848145378003529 * Math.abs(rD)) / 100.0, 0.42);
  const gAF = Math.pow((0.38848145378003529 * Math.abs(gD)) / 100.0, 0.42);
  const bAF = Math.pow((0.38848145378003529 * Math.abs(bD)) / 100.0, 0.42);

  const rA = (signum(rD) * 400.0 * rAF) / (rAF + 27.13);
  const gA = (signum(gD) * 400.0 * gAF) / (gAF + 27.13);
  const bA = (signum(bD) * 400.0 * bAF) / (bAF + 27.13);

  const a = (11.0 * rA + -12.0 * gA + bA) / 11.0;
  const b = (rA + gA - 2.0 * bA) / 9.0;
  const u = (20.0 * rA + 20.0 * gA + 21.0 * bA) / 20.0;
  const p2 = (40.0 * rA + 20.0 * gA + bA) / 20.0;

  const atan2 = Math.atan2(b, a);
  const atanDegrees = (atan2 * 180.0) / Math.PI;
  const hue = atanDegrees < 0 ? atanDegrees + 360.0 :
      atanDegrees >= 360 ? atanDegrees - 360.0 : atanDegrees;
  const hueRadians = (hue * Math.PI) / 180.0;

  const j = 100.0 * Math.pow(p2 * 0.03391879108791669, 1.3173270022537198);
  const huePrime = hue < 20.14 ? hue + 360 : hue;
  const p1 = 3911.227617099521 * 0.25 * (Math.cos((huePrime * Math.PI) / 180.0 + 2.0) + 3.8);
  const t = (p1 * Math.sqrt(a * a + b * b)) / (u + 0.305);
  const alpha = Math.pow(t, 0.9) * 0.8834525670408592;

  const m = alpha * Math.sqrt(j / 100.0) * 0.78948261793049368;
  const mstar = 43.859649122807014 * Math.log(1.0 + 0.0228 * m);

  const astar = mstar * Math.cos(hueRadians);
  const bstar = mstar * Math.sin(hueRadians);
  const Lstar = 116.0 * labF(y) - 16.0;

  const hct = [Lstar, astar, bstar];
  hctCache.set(val, hct);
  return hct;
}

// The colour space the chosen colour method works in. It is decided once per
// render, because the distance between two colours is calculated for every
// tone of the palette and for every pixel.
var colourMetricKind = "euclidean";

function setupColourMetricKind() {
  const uniqueId = chosenColourMethod.uniqueId;
  if (uniqueId === ColourMethods.MapartCraftDefault.uniqueId) colourMetricKind = "lab";
  else if (uniqueId === ColourMethods.Cie76_Lab50.uniqueId) colourMetricKind = "lab50";
  else if (uniqueId === ColourMethods.Cie76_Lab65.uniqueId) colourMetricKind = "lab65";
  else if (uniqueId === ColourMethods.Hct.uniqueId) colourMetricKind = "hct";
  else if (uniqueId === ColourMethods.Ciede2000_Lab50.uniqueId) colourMetricKind = "ciede2000lab50";
  else if (uniqueId === ColourMethods.Ciede2000_Lab65.uniqueId) colourMetricKind = "ciede2000lab65";
  else colourMetricKind = "euclidean";
}

// The value of a colour in the colour space of the chosen method. The euclidean
// method works on the rgb values directly and needs no conversion.
function convertColourForMetric(rgb) {
  switch (colourMetricKind) {
    case "lab":
      return rgb2lab(rgb);
    case "lab50":
      return rgb2lab50(rgb);
    case "lab65":
      return rgb2lab65(rgb);
    case "hct":
      return rgb2hct(rgb);
    case "ciede2000lab50":
      return rgb2lab50(rgb);
    case "ciede2000lab65":
      return rgb2lab65(rgb);
    default:
      return null;
  }
}

// The squared distance of two values of the same colour space.
function squaredEuclideanMetricConverted(value1, value2) {
  const L = value1[0] - value2[0];
  const a = value1[1] - value2[1];
  const b = value1[2] - value2[2];
  return L * L + a * a + b * b;
}

// The squared euclidean distance of two rgb values.
function squaredEuclideanMetricRGB(rgb1, rgb2) {
  const r = rgb1[0] - rgb2[0];
  const g = rgb1[1] - rgb2[1];
  const b = rgb1[2] - rgb2[2];
  return r * r + g * g + b * b;
}

// CIEDE2000, the colour difference of two Lab values.
//Code based on culori.js - https://culorijs.org/
function ciede2000Distance(pixel1, pixel2) {
  let lStd = pixel1[0];
  let aStd = pixel1[1];
  let bStd = pixel1[2];
  let cStd = Math.sqrt(aStd * aStd + bStd * bStd);

  let lSmp = pixel2[0];
  let aSmp = pixel2[1];
  let bSmp = pixel2[2];
  let cSmp = Math.sqrt(aSmp * aSmp + bSmp * bSmp);
  let cAvg = (cStd + cSmp) / 2;

  let cAvgPow7 = Math.pow(cAvg, 7);
  let G =
    0.5 *
    (1 -
      Math.sqrt(
        cAvgPow7 /
        (cAvgPow7 + Math.pow(25, 7))
      ));

  let apStd = aStd * (1 + G);
  let apSmp = aSmp * (1 + G);

  let cpStd = Math.sqrt(apStd * apStd + bStd * bStd);
  let cpSmp = Math.sqrt(apSmp * apSmp + bSmp * bSmp);

  let hpStd =
    Math.abs(apStd) + Math.abs(bStd) === 0
      ? 0
      : Math.atan2(bStd, apStd);
  hpStd += (hpStd < 0) * 2 * Math.PI;

  let hpSmp =
    Math.abs(apSmp) + Math.abs(bSmp) === 0
      ? 0
      : Math.atan2(bSmp, apSmp);
  hpSmp += (hpSmp < 0) * 2 * Math.PI;

  let dL = lSmp - lStd;
  let dC = cpSmp - cpStd;

  let cpStdtimescpSmpZero = (cpStd === 0 && cpSmp === 0);
  let dhp = cpStdtimescpSmpZero ? 0 : hpSmp - hpStd;
  dhp -= (dhp > Math.PI) * 2 * Math.PI;
  dhp += (dhp < -Math.PI) * 2 * Math.PI;

  let dH = 2 * Math.sqrt(cpStd * cpSmp) * Math.sin(dhp / 2);

  let Lp = (lStd + lSmp) / 2;
  let Cp = (cStd + cSmp) / 2;

  let hp;
  if (cpStdtimescpSmpZero) {
    hp = hpStd + hpSmp;
  } else {
    hp = (hpStd + hpSmp) / 2;
    hp -= (Math.abs(hpStd - hpSmp) > Math.PI) * Math.PI;
    hp += (hp < 0) * 2 * Math.PI;
  }

  let Lpminus50 = Lp - 50;
  let Lpm50 = Lpminus50 * Lpminus50;
  let T =
    1 -
    0.17 * Math.cos(hp - Math.PI / 6) +
    0.24 * Math.cos(2 * hp) +
    0.32 * Math.cos(3 * hp + Math.PI / 30) -
    0.2 * Math.cos(4 * hp - (63 * Math.PI) / 180);

  let Sl = 1 + (0.015 * Lpm50) / Math.sqrt(20 + Lpm50);
  let Sc = 1 + 0.045 * Cp;
  let Sh = 1 + 0.015 * Cp * T;

  let deltaTheta =
    ((30 * Math.PI) / 180) *
    Math.exp(-1 * Math.pow(((180 / Math.PI) * hp - 275) / 25, 2));
  let Rc =
    2 *
    Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
  let Rt = -1 * Math.sin(2 * deltaTheta) * Rc;

  let dLdivSl = dL / Sl;
  let dCdivSc = dC / Sc;
  let dHdivSh = dH / Sh;
  return dLdivSl * dLdivSl + dCdivSc * dCdivSc + dHdivSh * dHdivSh +
      (((Rt * dC) / Sc) * dH) / Sh;
}

// The distance of two colours, for the places that compare two colours that
// are not tones of the palette.
function squaredEuclideanMetricColours(pixel1, pixel2) {
  if (colourMetricKind === "euclidean") {
    return squaredEuclideanMetricRGB(pixel1, pixel2);
  }
  const converted1 = convertColourForMetric(pixel1);
  const converted2 = convertColourForMetric(pixel2);
  if (colourMetricKind === "ciede2000lab50" || colourMetricKind === "ciede2000lab65") {
    return ciede2000Distance(converted1, converted2);
  }
  return squaredEuclideanMetricConverted(converted1, converted2);
}

// The distance of a tone of the palette to a pixel. The colour space value of
// the tone is already known, only the pixel has to be converted.
function metricForTone(entry, pixelRGB, pixelValue) {
  if (colourMetricKind === "euclidean") {
    return squaredEuclideanMetricRGB(entry.rgb, pixelRGB);
  }
  if (colourMetricKind === "ciede2000lab50" || colourMetricKind === "ciede2000lab65") {
    return ciede2000Distance(entry.metricValue, pixelValue);
  }
  return squaredEuclideanMetricConverted(entry.metricValue, pixelValue);
}

function findClosestColourSetIdAndToneAndRGBTo(pixelRGB) {
  let RGBBinary = (pixelRGB[0] << 16) + (pixelRGB[1] << 8) + pixelRGB[2]; // injective mapping RGB to concatenated binaries
  if (colourCache.has(RGBBinary)) {
    return colourCache.get(RGBBinary);
  } else {
    let shortestDistance = 9999999;
    let closestPixel;
    const tones = flatToneList;
    const pixelValue = convertColourForMetric(pixelRGB);

    for (let index = 0; index < tones.length; index++) {
      const entry = tones[index];
      let squareDistance = metricForTone(entry, pixelRGB, pixelValue);
      if (squareDistance < shortestDistance) {
        shortestDistance = squareDistance;
        closestPixel = {
          colourSetId: entry.colourSetId,
          tone: entry.tone,
        };
      }
    }
    colourCache.set(RGBBinary, closestPixel);
    return closestPixel;
  }
}

function findClosest2ColourSetIdAndToneAndRGBTo(pixelRGB) {
  let RGBBinary = (pixelRGB[0] << 16) + (pixelRGB[1] << 8) + pixelRGB[2];
  if (colourCache2.has(RGBBinary)) {
    return colourCache2.get(RGBBinary);
  } else {
    let shortestDistance1 = 9999999;
    let shortestDistance2 = 9999999;
    let closestPixel1 = { colourSetId: null, tone: null }; // best colour
    let closestPixel2 = { colourSetId: null, tone: null }; // second best colour
    let closestRGB1 = null; // the rgb of closestPixel1, to skip the same colour twice
    const tones = flatToneList;
    const pixelValue = convertColourForMetric(pixelRGB);

    for (let index = 0; index < tones.length; index++) {
      const entry = tones[index];
      let squareDistance = metricForTone(entry, pixelRGB, pixelValue);
      if (squareDistance < shortestDistance1) {
        shortestDistance2 = shortestDistance1;
        closestPixel2 = closestPixel1;
        shortestDistance1 = squareDistance;
        closestPixel1 = {
          colourSetId: entry.colourSetId,
          tone: entry.tone,
        };
        closestRGB1 = entry.rgb;
      }
      else if (squareDistance < shortestDistance2 && closestRGB1 !== entry.rgb) {
        shortestDistance2 = squareDistance;
        closestPixel2 = {
          colourSetId: entry.colourSetId,
          tone: entry.tone,
        };
      }
    }
    if (
      shortestDistance2 !== 9999999 && // to make sure closestPixel2.colourSetId/tone is not null
      squaredEuclideanMetricColours(
        colourSetIdAndToneToRGB(closestPixel1.colourSetId, closestPixel1.tone),
        colourSetIdAndToneToRGB(closestPixel2.colourSetId, closestPixel2.tone)
      ) <= shortestDistance2
    ) {
      closestPixel2 = closestPixel1; // if closestPixel1 is a better fit to closestPixel2 than closestPixel2 is to the actual pixel
    }
    if (!closestPixel2 || closestPixel2.colourSetId === null || closestPixel2.tone === null) {
      closestPixel2 = closestPixel1;
    }
    let newPixels = [shortestDistance1, shortestDistance2, closestPixel1, closestPixel2];
    colourCache2.set(RGBBinary, newPixels);
    return newPixels;
  }
}

// Fixed pair selection: the second colour is a true second-nearest, unlike the
// MapartCraft original where the runner-up can be silently replaced.
function findClosest2Improved(pixelRGB) {
  let RGBBinary = (pixelRGB[0] << 16) + (pixelRGB[1] << 8) + pixelRGB[2];
  if (colourCache2Improved.has(RGBBinary)) {
    return colourCache2Improved.get(RGBBinary);
  }
  let shortestDistance1 = 9999999;
  let shortestDistance2 = 9999999;
  let closestPixel1 = { colourSetId: null, tone: null };
  let closestPixel2 = { colourSetId: null, tone: null };
  const tones = flatToneList;
  const pixelValue = convertColourForMetric(pixelRGB);

  for (let index = 0; index < tones.length; index++) {
    const entry = tones[index];
    let squareDistance = metricForTone(entry, pixelRGB, pixelValue);
    if (squareDistance < shortestDistance1) {
      shortestDistance2 = shortestDistance1;
      closestPixel2 = closestPixel1;
      shortestDistance1 = squareDistance;
      closestPixel1 = {
        colourSetId: entry.colourSetId,
        tone: entry.tone,
      };
    } else if (squareDistance < shortestDistance2) {
      shortestDistance2 = squareDistance;
      closestPixel2 = {
        colourSetId: entry.colourSetId,
        tone: entry.tone,
      };
    }
  }
  if (!closestPixel2 || closestPixel2.colourSetId === null || closestPixel2.tone === null) {
    closestPixel2 = closestPixel1;
  }
  let pair = [closestPixel1, closestPixel2];
  colourCache2Improved.set(RGBBinary, pair);
  return pair;
}

// Reflect pair selection: the second colour is the closest to the pixel
// mirrored through the first choice, giving a contrasting pair instead of two
// neighbours.
function findClosest2Reflect(pixelRGB) {
  let RGBBinary = (pixelRGB[0] << 16) + (pixelRGB[1] << 8) + pixelRGB[2];
  if (colourCache2Reflect.has(RGBBinary)) {
    return colourCache2Reflect.get(RGBBinary);
  }
  const closestPixel1 = findClosestColourSetIdAndToneAndRGBTo(pixelRGB);
  const rgb1 = colourSetIdAndToneToRGB(closestPixel1.colourSetId, closestPixel1.tone);
  const reflectedTarget = [2 * pixelRGB[0] - rgb1[0], 2 * pixelRGB[1] - rgb1[1], 2 * pixelRGB[2] - rgb1[2]];
  let shortestDistance2 = 9999999;
  let closestPixel2 = { colourSetId: null, tone: null };
  const tones = flatToneList;
  const reflectedValue = convertColourForMetric(reflectedTarget);

  for (let index = 0; index < tones.length; index++) {
    const entry = tones[index];
    let squareDistance = metricForTone(entry, reflectedTarget, reflectedValue);
    if (squareDistance < shortestDistance2) {
      shortestDistance2 = squareDistance;
      closestPixel2 = {
        colourSetId: entry.colourSetId,
        tone: entry.tone,
      };
    }
  }
  if (!closestPixel2 || closestPixel2.colourSetId === null || closestPixel2.tone === null) {
    closestPixel2 = closestPixel1;
  }
  let pair = [closestPixel1, closestPixel2];
  colourCache2Reflect.set(RGBBinary, pair);
  return pair;
}

// Improved pattern discriminator: project the pixel colour onto the segment
// between the two chosen palette colours, then compare the position with the
// pattern threshold. Brightness ordering prevents the pattern from flipping
// depending on which colour happens to be closest.
function findBestPatternImproved(pixelRGB, threshold, ditherStrength, patsize) {
  if (ditherStrength <= 0) {
    return findClosestColourSetIdAndToneAndRGBTo(pixelRGB);
  }
  let pair =
    optionValue_patternPairMode === "reflect" ? findClosest2Reflect(pixelRGB) : findClosest2Improved(pixelRGB);
  let colour1 = pair[0];
  let colour2 = pair[1];
  const rgb1 = colourSetIdAndToneToRGB(colour1.colourSetId, colour1.tone);
  const rgb2 = colourSetIdAndToneToRGB(colour2.colourSetId, colour2.tone);

  const tvecR = pixelRGB[0] - rgb1[0];
  const tvecG = pixelRGB[1] - rgb1[1];
  const tvecB = pixelRGB[2] - rgb1[2];
  const cvecR = rgb2[0] - rgb1[0];
  const cvecG = rgb2[1] - rgb1[1];
  const cvecB = rgb2[2] - rgb1[2];
  const colourDot = cvecR * cvecR + cvecG * cvecG + cvecB * cvecB;
  let projected = colourDot !== 0 ? (tvecR * cvecR + tvecG * cvecG + tvecB * cvecB) / colourDot : 0;

  if (projected <= 0) {
    return colour1; // no point between the two choices is closer than colour1
  }
  // always put the lower brightness colour on the lower end of the threshold,
  // to prevent the pattern flipping depending on which colour is closer
  if (rgb1[0] + rgb1[1] + rgb1[2] > rgb2[0] + rgb2[1] + rgb2[2]) {
    const swap = colour1;
    colour1 = colour2;
    colour2 = swap;
    projected = 1.0 - projected;
  }
  return projected * (patsize + 1) * ditherStrength > threshold ? colour2 : colour1;
}

function setupColourSetsToUse() {
  let colourSetIdsToUse = []; // get selected colour sets
  Object.keys(selectedBlocks).forEach((key) => {
    if (selectedBlocks[key] !== "-1") {
      colourSetIdsToUse.push(key);
    }
  });

  // now get appropriate shades
  const toneKeys = Object.values(Object.values(MapModes).find((mapMode) => mapMode.uniqueId === optionValue_modeNBTOrMapdat).staircaseModes).find(
    (staircaseMode) => staircaseMode.uniqueId === optionValue_staircasing
  ).toneKeys;

  for (const colourSetId of colourSetIdsToUse) {
    let tonesRGB = {};
    for (const toneKey of toneKeys) {
      if (disabledTones[colourSetId].has(toneKey))
        continue;

      tonesRGB[toneKey] = coloursJSON[colourSetId].tonesRGB[toneKey];
    }

    if (Object.keys(tonesRGB).length === 0)
      continue;

    colourSetsToUse.push({
      colourSetId: colourSetId,
      tonesRGB: tonesRGB,
    });
  }
}

function flattenColourTones() {
  const entries = [];
  colourSetsToUse.forEach((colourSet) => {
    // The alpha colour set uses sentinel RGB values (-100) for map.dat
    // transparency. It is not a real block colour and must never be used as
    // one of the two Retro 1-bit tones or as a Low-Block palette colour.
    if (colourSet.colourSetId === alphaColorIdx.toString()) return;
    Object.keys(colourSet.tonesRGB).forEach((tone) => {
      const rgb = colourSet.tonesRGB[tone];
      if (!rgb || rgb.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) return;
      entries.push({
        colourSetId: colourSet.colourSetId,
        tone,
        rgb,
        luminance: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2],
      });
    });
  });
  return entries;
}

function groupColourTones(entries) {
  const grouped = new Map();
  entries.forEach((entry) => {
    if (!grouped.has(entry.colourSetId)) {
      grouped.set(entry.colourSetId, { colourSetId: entry.colourSetId, tonesRGB: {} });
    }
    grouped.get(entry.colourSetId).tonesRGB[entry.tone] = entry.rgb;
  });
  return Array.from(grouped.values());
}

function applyStyleColourLimit() {
  if (optionValue_style !== "retro1bit" && optionValue_style !== "lowBlock") {
    return;
  }

  const entries = flattenColourTones();
  if (entries.length === 0) return;

  if (optionValue_style === "retro1bit") {
    const sorted = [...entries].sort((a, b) => a.luminance - b.luminance);
    const dark = sorted[0];
    let light = sorted[sorted.length - 1];
    if (light.colourSetId === dark.colourSetId && light.tone === dark.tone) {
      light = sorted.find((entry) => entry.rgb[0] !== dark.rgb[0] || entry.rgb[1] !== dark.rgb[1] || entry.rgb[2] !== dark.rgb[2]);
    }
    const chosen = [dark];
    if (light && (light.colourSetId !== dark.colourSetId || light.tone !== dark.tone)) {
      chosen.push(light);
    }
    colourSetsToUse = groupColourTones(chosen);
    return;
  }

  const target = Math.min(16, entries.length);
  const sorted = [...entries].sort((a, b) => a.luminance - b.luminance);
  const chosen = [sorted[0]];
  while (chosen.length < target) {
    let best = null;
    let bestDistance = -1;
    for (const entry of entries) {
      if (chosen.includes(entry)) continue;
      let nearest = Infinity;
      for (const selected of chosen) {
        const dr = entry.rgb[0] - selected.rgb[0];
        const dg = entry.rgb[1] - selected.rgb[1];
        const db = entry.rgb[2] - selected.rgb[2];
        nearest = Math.min(nearest, dr * dr + dg * dg + db * db);
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = entry;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  colourSetsToUse = groupColourTones(chosen);
}

function setupExactColourCache() {
  // we do not care what staircasing option is selected etc as this does not matter
  // this is for exactly matching colours, whose values are never repeated in coloursJSON
  for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
    for (const [toneKey, toneRGB] of Object.entries(colourSet.tonesRGB)) {
      const RGBBinary = (toneRGB[0] << 16) + (toneRGB[1] << 8) + toneRGB[2];
      exactColourCache.set(RGBBinary, {
        colourSetId: colourSetId,
        tone: toneKey,
      });
    }
  }
}

// Builds the flat list of tones that the colour search walks over. The order
// is the same as the old nested loop over the colour sets, so the result of
// the search does not change.
function buildFlatToneList() {
  const tones = [];
  for (const colourSet of colourSetsToUse) {
    const toneKeys = Object.keys(colourSet.tonesRGB);
    for (const toneKey of toneKeys) {
      tones.push({
        rgb: colourSet.tonesRGB[toneKey],
        colourSetId: colourSet.colourSetId,
        tone: toneKey,
        // The colour space value of the tone is calculated once per palette
        // instead of once per tone and pixel.
        metricValue: convertColourForMetric(colourSet.tonesRGB[toneKey]),
      });
    }
  }
  flatToneList = tones;
}

// A fingerprint of the tones that can be picked. The colour caches are only
// valid for the tone set they were built with, so they are thrown away when
// this changes and kept when only the dithering settings change.
function toneSetSignature() {
  // the colour method changes the colour space the tones are measured in
  let signature = colourMetricKind + "|";
  for (const colourSet of colourSetsToUse) {
    signature += colourSet.colourSetId + ":";
    const toneKeys = Object.keys(colourSet.tonesRGB);
    for (const toneKey of toneKeys) {
      const rgb = colourSet.tonesRGB[toneKey];
      signature += toneKey + "," + rgb[0] + "." + rgb[1] + "." + rgb[2] + ";";
    }
    signature += "|";
  }
  return signature;
}

// Converts the plain pixel edit object of the main thread into two typed
// arrays, so that the render loop does not have to look up an object key for
// every pixel.
function setupPixelEdits(edits, pixelCount) {
  const entries = Object.entries(edits || {});
  if (entries.length === 0) {
    pixelEditKinds = null;
    pixelEditRGB = null;
    pixelEditIndices = null;
    hasPixelEdits = false;
    hasMaskEdits = false;
    return;
  }
  const kinds = new Uint8Array(pixelCount);
  const rgbValues = new Uint8Array(pixelCount * 3);
  const indices = [];
  let used = false;
  let hasMask = false;
  for (const [index, value] of entries) {
    const pixel = parseInt(index, 10);
    if (!Number.isInteger(pixel) || pixel < 0 || pixel >= pixelCount) continue;
    if (value === "mask") {
      kinds[pixel] = 1;
      hasMask = true;
      used = true;
    } else if (value === "protect") {
      kinds[pixel] = 2;
      used = true;
    } else {
      const parsed = hexToRGB(value);
      if (!parsed) {
        // An edit the worker does not understand still counts as an edited
        // pixel for the island cleanup, it just does not change the colour.
        kinds[pixel] = 4;
        used = true;
        continue;
      }
      kinds[pixel] = 3;
      rgbValues[pixel * 3] = parsed[0];
      rgbValues[pixel * 3 + 1] = parsed[1];
      rgbValues[pixel * 3 + 2] = parsed[2];
      used = true;
    }
    indices.push(pixel);
  }
  hasPixelEdits = used;
  hasMaskEdits = hasMask;
  pixelEditKinds = used ? kinds : null;
  pixelEditRGB = used ? rgbValues : null;
  pixelEditIndices = used ? Int32Array.from(indices) : null;
}

// Whether the pixel has any edit at all, protect edits included.
function pixelHasEdit(pixel) {
  return pixelEditKinds !== null && pixelEditKinds[pixel] !== 0;
}

function exactRGBToColourSetIdAndTone(pixelRGB) {
  const RGBBinary = (pixelRGB[0] << 16) + (pixelRGB[1] << 8) + pixelRGB[2];
  return exactColourCache.get(RGBBinary);
}

// The same lookup without building an rgb array for every pixel.
function exactRGBChannelsToColourSetIdAndTone(red, green, blue) {
  return exactColourCache.get((red << 16) + (green << 8) + blue);
}

function hexToRGB(hex) {
  if (Array.isArray(hex)) return hex;
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function isSupportBlockMandatoryForColourSetIdAndTone(colourSetIdAndTone) {
  if (!colourSetIdAndTone) return false;
  const colourSetId = colourSetIdAndTone.colourSetId;
  // The rule only depends on the colour set, not on the tone. The answer is
  // therefore looked up once per render instead of once per pixel.
  const cached = supportMandatoryByColourSetId.get(colourSetId);
  if (cached !== undefined) return cached;
  return computeSupportBlockMandatory(colourSetId);
}

function computeSupportBlockMandatory(colourSetId) {
  const colourSet = coloursJSON[colourSetId];
  if (!colourSet) return false;
  const blockId = selectedBlocks[colourSetId];
  // The exact colour cache holds every colour set, so a colour can resolve to
  // a colour set that is not part of the current palette.
  if (blockId === undefined || blockId === "-1") return false;
  const block = colourSet.blocks[blockId];
  return !!(block && block.supportBlockMandatory);
}

// Fills the cache of the support block rule for the current palette.
function setupSupportMandatoryCache() {
  supportMandatoryByColourSetId.clear();
  for (const colourSetId of Object.keys(selectedBlocks)) {
    supportMandatoryByColourSetId.set(colourSetId, computeSupportBlockMandatory(colourSetId));
  }
}

function colourSetIdAndToneToRGB(colourSetId, tone) {
  return coloursJSON[colourSetId]["tonesRGB"][tone];
}


function cleanupClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanupDistance(data, i, j) {
  return Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
}

function cleanupMedianChannel(values, count) {
  values.length = count;
  values.sort((a, b) => a - b);
  return values[(count - 1) >> 1];
}

function cleanupDenoise(radius, strength, preserveEdges) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const original = new Uint8ClampedArray(data);
  const rValues = [];
  const gValues = [];
  const bValues = [];
  const threshold = (strength / 100.0) * (22 + (100 - preserveEdges) * 0.6);
  if (threshold <= 0) return;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (original[i + 3] < 128) continue;
      if (cleanupProtectionMask && cleanupProtectionMask[y * width + x]) continue;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          if (original[j + 3] < 128) continue;
          rValues[n] = original[j];
          gValues[n] = original[j + 1];
          bValues[n] = original[j + 2];
          n++;
        }
      }
      if (n < 3) continue;
      const mr = cleanupMedianChannel(rValues, n);
      const mg = cleanupMedianChannel(gValues, n);
      const mb = cleanupMedianChannel(bValues, n);
      const dist = Math.abs(original[i] - mr) + Math.abs(original[i + 1] - mg) + Math.abs(original[i + 2] - mb);
      if (dist <= threshold) {
        data[i] = mr;
        data[i + 1] = mg;
        data[i + 2] = mb;
      }
    }
  }
}

function cleanupDespeckle(size) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const original = new Uint8ClampedArray(data);
  const radius = size >= 2 ? 2 : 1;
  const threshold = 48;
  const rValues = [];
  const gValues = [];
  const bValues = [];

  const similar = (i, j) => cleanupDistance(original, i, j) <= threshold;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (original[i + 3] < 128) continue;
      if (cleanupProtectionMask && cleanupProtectionMask[y * width + x]) continue;

      // Do not eat one-pixel lines: if the pixel has matching neighbours on
      // both sides of an axis or diagonal, it is detail rather than an island.
      const left = x > 0 ? i - 4 : -1;
      const right = x + 1 < width ? i + 4 : -1;
      const up = y > 0 ? i - width * 4 : -1;
      const down = y + 1 < height ? i + width * 4 : -1;
      if ((left >= 0 && right >= 0 && similar(i, left) && similar(i, right)) ||
          (up >= 0 && down >= 0 && similar(i, up) && similar(i, down))) {
        continue;
      }
      if (x > 0 && y > 0 && x + 1 < width && y + 1 < height) {
        if (similar(i, i - width * 4 - 4) && similar(i, i + width * 4 + 4)) continue;
        if (similar(i, i - width * 4 + 4) && similar(i, i + width * 4 - 4)) continue;
      }

      let n = 0;
      let centerSupport = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          if (original[j + 3] < 128) continue;
          rValues[n] = original[j];
          gValues[n] = original[j + 1];
          bValues[n] = original[j + 2];
          if (similar(i, j)) centerSupport++;
          n++;
        }
      }
      if (n < 5) continue;
      const mr = cleanupMedianChannel(rValues, n);
      const mg = cleanupMedianChannel(gValues, n);
      const mb = cleanupMedianChannel(bValues, n);
      const medianPixel = (y * width + x) * 4;
      const savedR = original[i];
      const savedG = original[i + 1];
      const savedB = original[i + 2];
      original[i] = mr;
      original[i + 1] = mg;
      original[i + 2] = mb;
      let medianSupport = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          if (original[j + 3] < 128) continue;
          if (similar(i, j)) medianSupport++;
        }
      }
      original[i] = savedR;
      original[i + 1] = savedG;
      original[i + 2] = savedB;
      let protectDetail = false;
      if (optionValue_cleanup_islandsSmart) {
        const centerLuminance = 0.299 * savedR + 0.587 * savedG + 0.114 * savedB;
        const medianLuminance = 0.299 * mr + 0.587 * mg + 0.114 * mb;
        protectDetail = Math.abs(centerLuminance - medianLuminance) > 70 || (centerLuminance > 215 && medianLuminance < 190);
      }
      if (!protectDetail && centerSupport <= size && medianSupport >= Math.max(6, Math.ceil(n * 0.55))) {
        data[medianPixel] = mr;
        data[medianPixel + 1] = mg;
        data[medianPixel + 2] = mb;
      }
    }
  }
}

function cleanupSimplifyColours(targetCount) {
  const target = Math.max(2, Math.round(targetCount));
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const pixelCount = width * height;
  const histogramCount = new Uint32Array(32768);
  const histogramR = new Uint32Array(32768);
  const histogramG = new Uint32Array(32768);
  const histogramB = new Uint32Array(32768);
  const binOf = new Uint16Array(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const i = pixel * 4;
    if (data[i + 3] < 128) {
      binOf[pixel] = 65535;
      continue;
    }
    const bin = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    binOf[pixel] = bin;
    histogramCount[bin]++;
    histogramR[bin] += data[i];
    histogramG[bin] += data[i + 1];
    histogramB[bin] += data[i + 2];
  }

  const bins = [];
  for (let bin = 0; bin < 32768; bin++) {
    if (histogramCount[bin] === 0) continue;
    bins.push({
      bin,
      count: histogramCount[bin],
      rSum: histogramR[bin],
      gSum: histogramG[bin],
      bSum: histogramB[bin],
    });
  }
  if (bins.length <= target) return;

  let boxes = [bins];
  while (boxes.length < target) {
    let bestIndex = -1;
    let bestChannel = 0;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.length < 2) continue;
      let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
      let count = 0;
      for (const item of box) {
        const r = (item.bin >> 10) * 8 + 4;
        const g = ((item.bin >> 5) & 31) * 8 + 4;
        const b = (item.bin & 31) * 8 + 4;
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minG = Math.min(minG, g); maxG = Math.max(maxG, g);
        minB = Math.min(minB, b); maxB = Math.max(maxB, b);
        count += item.count;
      }
      const ranges = [maxR - minR, maxG - minG, maxB - minB];
      const channel = ranges[0] >= ranges[1] && ranges[0] >= ranges[2] ? 0 : ranges[1] >= ranges[2] ? 1 : 2;
      const score = ranges[channel] * Math.log2(count + 2);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
        bestChannel = channel;
      }
    }
    if (bestIndex < 0 || bestScore <= 0) break;

    const box = boxes[bestIndex];
    const sortKey = bestChannel === 0 ? "rSum" : bestChannel === 1 ? "gSum" : "bSum";
    box.sort((a, b) => a[sortKey] / a.count - b[sortKey] / b.count);
    let total = 0;
    for (const item of box) total += item.count;
    let accumulated = 0;
    let split = 0;
    for (let i = 0; i < box.length - 1; i++) {
      accumulated += box[i].count;
      if (accumulated >= total / 2) {
        split = i + 1;
        break;
      }
    }
    if (split <= 0) split = Math.ceil(box.length / 2);
    if (split >= box.length) split = box.length - 1;
    boxes.splice(bestIndex, 1, box.slice(0, split), box.slice(split));
  }

  const mapR = new Uint8Array(32768);
  const mapG = new Uint8Array(32768);
  const mapB = new Uint8Array(32768);
  for (const box of boxes) {
    let count = 0, sumR = 0, sumG = 0, sumB = 0;
    for (const item of box) {
      count += item.count;
      sumR += item.rSum;
      sumG += item.gSum;
      sumB += item.bSum;
    }
    if (!count) continue;
    const r = Math.round(sumR / count);
    const g = Math.round(sumG / count);
    const b = Math.round(sumB / count);
    for (const item of box) {
      mapR[item.bin] = r;
      mapG[item.bin] = g;
      mapB[item.bin] = b;
    }
  }

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const bin = binOf[pixel];
    if (bin === 65535) continue;
    if (cleanupProtectionMask && cleanupProtectionMask[pixel]) continue;
    const i = pixel * 4;
    data[i] = mapR[bin];
    data[i + 1] = mapG[bin];
    data[i + 2] = mapB[bin];
  }
}

function cleanupSimplifyColoursPerceptual(targetCount) {
  const target = Math.max(2, Math.round(targetCount));
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const pixelCount = width * height;
  const histogramCount = new Uint32Array(32768);
  const histogramR = new Uint32Array(32768);
  const histogramG = new Uint32Array(32768);
  const histogramB = new Uint32Array(32768);
  const binOf = new Uint16Array(pixelCount);
  let opaqueCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const i = pixel * 4;
    if (data[i + 3] < 128) {
      binOf[pixel] = 65535;
      continue;
    }
    const bin = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    binOf[pixel] = bin;
    histogramCount[bin]++;
    histogramR[bin] += data[i];
    histogramG[bin] += data[i + 1];
    histogramB[bin] += data[i + 2];
    opaqueCount++;
  }

  const bins = [];
  for (let bin = 0; bin < 32768; bin++) {
    if (histogramCount[bin] === 0) continue;
    const count = histogramCount[bin];
    const red = histogramR[bin] / count;
    const green = histogramG[bin] / count;
    const blue = histogramB[bin] / count;
    const lab = rgb2lab50([red, green, blue]);
    bins.push({ bin, count, rSum: histogramR[bin], gSum: histogramG[bin], bSum: histogramB[bin], lab });
  }
  if (bins.length <= target) return;

  // Keep small but saturated accents (eyes, sparks, tiny details) instead of
  // letting a large flat box absorb them.
  const accentCandidates = bins
    .filter((item) => item.count <= Math.max(2, opaqueCount * 0.0025) && Math.hypot(item.lab[1], item.lab[2]) >= 18)
    .sort(
      (a, b) =>
        Math.hypot(b.lab[1], b.lab[2]) * Math.log2(b.count + 2) -
        Math.hypot(a.lab[1], a.lab[2]) * Math.log2(a.count + 2)
    );
  const accentBudget = Math.max(1, Math.round(target * 0.15));
  const accents = [];
  for (const candidate of accentCandidates) {
    if (accents.length >= accentBudget) break;
    if (
      accents.every(
        (accent) =>
          Math.abs(accent.lab[0] - candidate.lab[0]) +
            Math.abs(accent.lab[1] - candidate.lab[1]) +
            Math.abs(accent.lab[2] - candidate.lab[2]) >
          24
      )
    ) {
      accents.push(candidate);
    }
  }
  const accentBins = new Set(accents.map((accent) => accent.bin));
  const normalBins = bins.filter((item) => !accentBins.has(item.bin));
  let boxes = normalBins.length ? [normalBins] : [];
  const normalTarget = Math.max(1, target - accents.length);

  while (boxes.length < normalTarget) {
    let bestIndex = -1;
    let bestChannel = 0;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.length < 2) continue;
      let minL = 100, maxL = 0, minA = 0, maxA = 0, minB = 0, maxB = 0;
      let count = 0;
      for (const item of box) {
        minL = Math.min(minL, item.lab[0]); maxL = Math.max(maxL, item.lab[0]);
        minA = Math.min(minA, item.lab[1]); maxA = Math.max(maxA, item.lab[1]);
        minB = Math.min(minB, item.lab[2]); maxB = Math.max(maxB, item.lab[2]);
        count += item.count;
      }
      const ranges = [maxL - minL, maxA - minA, maxB - minB];
      const channel = ranges[0] >= ranges[1] && ranges[0] >= ranges[2] ? 0 : ranges[1] >= ranges[2] ? 1 : 2;
      const score = ranges[channel] * Math.log2(count + 2);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
        bestChannel = channel;
      }
    }
    if (bestIndex < 0 || bestScore <= 0) break;

    const box = boxes[bestIndex];
    box.sort((a, b) => a.lab[bestChannel] - b.lab[bestChannel]);
    let total = 0;
    for (const item of box) total += item.count;
    let accumulated = 0;
    let split = 0;
    for (let i = 0; i < box.length - 1; i++) {
      accumulated += box[i].count;
      if (accumulated >= total / 2) {
        split = i + 1;
        break;
      }
    }
    if (split <= 0) split = Math.ceil(box.length / 2);
    if (split >= box.length) split = box.length - 1;
    boxes.splice(bestIndex, 1, box.slice(0, split), box.slice(split));
  }

  const mapR = new Uint8Array(32768);
  const mapG = new Uint8Array(32768);
  const mapB = new Uint8Array(32768);
  for (const box of boxes) {
    let count = 0, sumR = 0, sumG = 0, sumB = 0;
    for (const item of box) {
      count += item.count;
      sumR += item.rSum;
      sumG += item.gSum;
      sumB += item.bSum;
    }
    if (!count) continue;
    const r = Math.round(sumR / count);
    const g = Math.round(sumG / count);
    const b = Math.round(sumB / count);
    for (const item of box) {
      mapR[item.bin] = r;
      mapG[item.bin] = g;
      mapB[item.bin] = b;
    }
  }
  for (const accent of accents) {
    const r = Math.round(accent.rSum / accent.count);
    const g = Math.round(accent.gSum / accent.count);
    const b = Math.round(accent.bSum / accent.count);
    mapR[accent.bin] = r;
    mapG[accent.bin] = g;
    mapB[accent.bin] = b;
  }

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const bin = binOf[pixel];
    if (bin === 65535) continue;
    if (cleanupProtectionMask && cleanupProtectionMask[pixel]) continue;
    const i = pixel * 4;
    data[i] = mapR[bin];
    data[i + 1] = mapG[bin];
    data[i + 2] = mapB[bin];
  }
}

function cleanupBuildEdgeMask() {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const mask = new Uint8Array(width * height);
  const threshold = 20 + (100 - optionValue_cleanup_edges) * 0.35;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const i = pixel * 4;
      if (data[i + 3] < 128) continue;
      let diff = 0;
      const left = x > 0 ? i - 4 : -1;
      const right = x + 1 < width ? i + 4 : -1;
      const up = y > 0 ? i - width * 4 : -1;
      const down = y + 1 < height ? i + width * 4 : -1;
      for (const j of [left, right, up, down]) {
        if (j < 0 || data[j + 3] < 128) continue;
        diff = Math.max(
          diff,
          Math.abs(data[i] - data[j]),
          Math.abs(data[i + 1] - data[j + 1]),
          Math.abs(data[i + 2] - data[j + 2])
        );
      }
      let luminanceSum = 0;
      let luminanceSquares = 0;
      let luminanceCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          if (data[j + 3] < 128) continue;
          const luminance = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
          luminanceSum += luminance;
          luminanceSquares += luminance * luminance;
          luminanceCount++;
        }
      }
      let localVariance = 0;
      if (luminanceCount > 0) {
        const mean = luminanceSum / luminanceCount;
        localVariance = luminanceSquares / luminanceCount - mean * mean;
      }
      const varianceLimit = Math.max(250, 1500 - optionValue_cleanup_edges * 12);
      if (diff >= threshold || localVariance >= varianceLimit) mask[pixel] = 1;
    }
  }
  return mask;
}

function buildSerpentineEdgeMask() {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const mask = new Uint8Array(width * height);
  const threshold = 56;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const i = pixel * 4;
      if (data[i + 3] < 128) continue;
      let diff = 0;
      const left = x > 0 ? i - 4 : -1;
      const right = x + 1 < width ? i + 4 : -1;
      const up = y > 0 ? i - width * 4 : -1;
      const down = y + 1 < height ? i + width * 4 : -1;
      for (const j of [left, right, up, down]) {
        if (j < 0 || data[j + 3] < 128) continue;
        diff = Math.max(
          diff,
          Math.abs(data[i] - data[j]),
          Math.abs(data[i + 1] - data[j + 1]),
          Math.abs(data[i + 2] - data[j + 2])
        );
      }
      if (diff >= threshold) mask[pixel] = 1;
    }
  }
  return mask;
}

function diffuseSerpentineError(x, y, direction, quantError, matrix, strength, edgeMask) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  // Do not carry error away from strong edges; this keeps line art crisp.
  if (edgeMask[y * width + x]) return;
  for (let row = 0; row < matrix.length; row++) {
    const ny = y + row;
    if (ny >= height) continue;
    for (let column = 0; column < matrix[row].length; column++) {
      const weight = matrix[row][column];
      if (!weight) continue;
      const nx = x + (column - 2) * direction;
      if (nx < 0 || nx >= width) continue;
      const neighborPixel = ny * width + nx;
      if (edgeMask[neighborPixel]) continue;
      const neighborIndex = neighborPixel * 4;
      if (data[neighborIndex + 3] < 128) continue;
      data[neighborIndex] += quantError[0] * weight * strength;
      data[neighborIndex + 1] += quantError[1] * weight * strength;
      data[neighborIndex + 2] += quantError[2] * weight * strength;
    }
  }
}

function cleanupBilateral(radius, strength, preserveEdges) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const original = new Uint8ClampedArray(data);
  const spatialDenominator = 2 * radius * radius;
  const colourSigma = 12 + (100 - preserveEdges) * 0.8;
  const colourDenominator = 2 * colourSigma * colourSigma;
  const blend = strength / 100.0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (original[i + 3] < 128) continue;
      if (cleanupProtectionMask && cleanupProtectionMask[y * width + x]) continue;
      let sumR = 0, sumG = 0, sumB = 0, weightSum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          if (original[j + 3] < 128) continue;
          const spatialDistance = dx * dx + dy * dy;
          const colourDistance = Math.abs(original[i] - original[j]) + Math.abs(original[i + 1] - original[j + 1]) + Math.abs(original[i + 2] - original[j + 2]);
          const weight = Math.exp(-spatialDistance / spatialDenominator - colourDistance / colourDenominator);
          sumR += original[j] * weight;
          sumG += original[j + 1] * weight;
          sumB += original[j + 2] * weight;
          weightSum += weight;
        }
      }
      if (weightSum === 0) continue;
      data[i] = Math.round(original[i] + (sumR / weightSum - original[i]) * blend);
      data[i + 1] = Math.round(original[i + 1] + (sumG / weightSum - original[i + 1]) * blend);
      data[i + 2] = Math.round(original[i + 2] + (sumB / weightSum - original[i + 2]) * blend);
    }
  }
}

function cleanupGuided(radius, strength, preserveEdges) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const original = new Uint8ClampedArray(data);
  const eps = 40 + (100 - preserveEdges) * 15;
  const blend = strength / 100.0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (original[i + 3] < 128) continue;
      if (cleanupProtectionMask && cleanupProtectionMask[y * width + x]) continue;
      let sumR = 0, sumG = 0, sumB = 0;
      let sumR2 = 0, sumG2 = 0, sumB2 = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = (ny * width + nx) * 4;
          if (original[j + 3] < 128) continue;
          const r = original[j], g = original[j + 1], b = original[j + 2];
          sumR += r; sumG += g; sumB += b;
          sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
          n++;
        }
      }
      if (!n) continue;
      const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;
      const varR = sumR2 / n - meanR * meanR;
      const varG = sumG2 / n - meanG * meanG;
      const varB = sumB2 / n - meanB * meanB;
      const ar = varR / (varR + eps);
      const ag = varG / (varG + eps);
      const ab = varB / (varB + eps);
      const outR = ar * original[i] + (1 - ar) * meanR;
      const outG = ag * original[i + 1] + (1 - ag) * meanG;
      const outB = ab * original[i + 2] + (1 - ab) * meanB;
      data[i] = Math.round(original[i] + (outR - original[i]) * blend);
      data[i + 1] = Math.round(original[i + 1] + (outG - original[i + 1]) * blend);
      data[i + 2] = Math.round(original[i + 2] + (outB - original[i + 2]) * blend);
    }
  }
}

function cleanupApply() {
  if (!optionValue_cleanup_enabled) return null;
  const denoise = cleanupClamp(optionValue_cleanup_denoise, 0, 100);
  const preserveEdges = cleanupClamp(optionValue_cleanup_edges, 0, 100);
  if (denoise > 0) {
    const radius = denoise > 65 ? 2 : 1;
    if (optionValue_cleanup_denoiseMethod === "bilateral") cleanupBilateral(radius, denoise, preserveEdges);
    else if (optionValue_cleanup_denoiseMethod === "guided") cleanupGuided(radius, denoise, preserveEdges);
    else cleanupDenoise(radius, denoise, preserveEdges);
  }
  if (optionValue_cleanup_colours > 0) {
    if (optionValue_cleanup_coloursPerceptual) cleanupSimplifyColoursPerceptual(optionValue_cleanup_colours);
    else cleanupSimplifyColours(optionValue_cleanup_colours);
  }
  if (optionValue_cleanup_despeckle > 0) cleanupDespeckle(optionValue_cleanup_despeckle);
  if (optionValue_cleanup_adaptiveDither && optionValue_dithering !== DitherMethods.None.uniqueId) {
    return cleanupBuildEdgeMask();
  }
  return null;
}


function cleanupPaletteIslands(size) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(128 * 128);
  let changed = false;

  for (let mapY = 0; mapY < optionValue_mapSize_y; mapY++) {
    for (let mapX = 0; mapX < optionValue_mapSize_x; mapX++) {
      const baseX = mapX * 128;
      const baseY = mapY * 128;
      for (let localY = 0; localY < 128; localY++) {
        for (let localX = 0; localX < 128; localX++) {
          const gx = baseX + localX;
          const gy = baseY + localY;
          const start = gy * width + gx;
          if (visited[start]) continue;
          const startOffset = start * 4;
          if (data[startOffset + 3] < 128) continue;
          const key = (data[startOffset] << 16) | (data[startOffset + 1] << 8) | data[startOffset + 2];
          let head = 0;
          let tail = 0;
          let hasEdits = false;
          const boundary = new Map();
          queue[tail++] = start;
          visited[start] = 1;
          while (head < tail) {
            const pixel = queue[head++];
            const px = pixel % width;
            const py = (pixel - px) / width;
            if (pixelHasEdit(pixel)) hasEdits = true;
            const lx = px - baseX;
            const ly = py - baseY;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = ly + dy;
              if (ny < 0 || ny >= 128) continue;
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = lx + dx;
                if (nx < 0 || nx >= 128) continue;
                const neighbor = (baseY + ny) * width + baseX + nx;
                const neighborOffset = neighbor * 4;
                if (data[neighborOffset + 3] < 128) continue;
                const neighborKey =
                  (data[neighborOffset] << 16) | (data[neighborOffset + 1] << 8) | data[neighborOffset + 2];
                if (neighborKey === key) {
                  if (!visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue[tail++] = neighbor;
                  }
                } else if (boundary.has(neighborKey)) {
                  boundary.set(neighborKey, boundary.get(neighborKey) + 1);
                } else {
                  boundary.set(neighborKey, 1);
                }
              }
            }
          }
          if (!hasEdits && tail <= size && boundary.size > 0) {
            let replacementKey = 0;
            let replacementCount = -1;
            let boundaryTotal = 0;
            for (const [candidate, count] of boundary.entries()) {
              boundaryTotal += count;
              if (count > replacementCount) {
                replacementKey = candidate;
                replacementCount = count;
              }
            }
            const rr = (replacementKey >> 16) & 255;
            const gg = (replacementKey >> 8) & 255;
            const bb = replacementKey & 255;
            const cr = (key >> 16) & 255;
            const cg = (key >> 8) & 255;
            const cb = key & 255;
            const colourDistance = Math.abs(cr - rr) + Math.abs(cg - gg) + Math.abs(cb - bb);
            // Only remove low-contrast palette noise. High-contrast dots and
            // line details are intentional, not quantisation speckles.
            const contrastLimit = 60 + (100 - optionValue_cleanup_edges) * 0.7;
            if (replacementCount >= boundaryTotal * 0.65 && colourDistance <= contrastLimit) {
              for (let i = 0; i < tail; i++) {
                const offset = queue[i] * 4;
                data[offset] = rr;
                data[offset + 1] = gg;
                data[offset + 2] = bb;
              }
              changed = true;
            }
          }
        }
      }
    }
  }
  return changed;
}

function cleanupSmartPaletteIslands(size) {
  const data = canvasImageData.data;
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(128 * 128);
  let changed = false;

  for (let mapY = 0; mapY < optionValue_mapSize_y; mapY++) {
    for (let mapX = 0; mapX < optionValue_mapSize_x; mapX++) {
      const baseX = mapX * 128;
      const baseY = mapY * 128;
      for (let localY = 0; localY < 128; localY++) {
        for (let localX = 0; localX < 128; localX++) {
          const gx = baseX + localX;
          const gy = baseY + localY;
          const start = gy * width + gx;
          if (visited[start]) continue;
          const startOffset = start * 4;
          if (data[startOffset + 3] < 128) continue;
          const key = (data[startOffset] << 16) | (data[startOffset + 1] << 8) | data[startOffset + 2];
          let head = 0;
          let tail = 0;
          let hasEdits = false;
          let minX = localX;
          let maxX = localX;
          let minY = localY;
          let maxY = localY;
          let luminanceSum = 0;
          const boundary = new Map();
          queue[tail++] = start;
          visited[start] = 1;
          while (head < tail) {
            const pixel = queue[head++];
            const px = pixel % width;
            const py = (pixel - px) / width;
            if (pixelHasEdit(pixel)) hasEdits = true;
            luminanceSum +=
              0.299 * data[pixel * 4] + 0.587 * data[pixel * 4 + 1] + 0.114 * data[pixel * 4 + 2];
            const lx = px - baseX;
            const ly = py - baseY;
            if (lx < minX) minX = lx;
            if (lx > maxX) maxX = lx;
            if (ly < minY) minY = ly;
            if (ly > maxY) maxY = ly;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = ly + dy;
              if (ny < 0 || ny >= 128) continue;
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = lx + dx;
                if (nx < 0 || nx >= 128) continue;
                const neighbor = (baseY + ny) * width + baseX + nx;
                const neighborOffset = neighbor * 4;
                if (data[neighborOffset + 3] < 128) continue;
                const neighborKey =
                  (data[neighborOffset] << 16) | (data[neighborOffset + 1] << 8) | data[neighborOffset + 2];
                if (neighborKey === key) {
                  if (!visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue[tail++] = neighbor;
                  }
                } else if (boundary.has(neighborKey)) {
                  boundary.set(neighborKey, boundary.get(neighborKey) + 1);
                } else {
                  boundary.set(neighborKey, 1);
                }
              }
            }
          }
          if (hasEdits || tail > size || boundary.size === 0) continue;

          // Shape: only compact blobs are palette noise; thin lines and
          // diagonals have a low bounding-box fill ratio.
          const boxWidth = maxX - minX + 1;
          const boxHeight = maxY - minY + 1;
          if (tail / (boxWidth * boxHeight) < 0.34) continue;

          let replacementKey = 0;
          let replacementCount = -1;
          let boundaryTotal = 0;
          for (const [candidate, count] of boundary.entries()) {
            boundaryTotal += count;
            if (count > replacementCount) {
              replacementKey = candidate;
              replacementCount = count;
            }
          }
          // Connectivity: the replacement must surround the island on most
          // sides rather than being a single adjacent pixel.
          if (replacementCount < boundaryTotal * 0.7) continue;

          const rr = (replacementKey >> 16) & 255;
          const gg = (replacementKey >> 8) & 255;
          const bb = replacementKey & 255;
          const cr = (key >> 16) & 255;
          const cg = (key >> 8) & 255;
          const cb = key & 255;
          const colourDistance = Math.abs(cr - rr) + Math.abs(cg - gg) + Math.abs(cb - bb);
          const contrastLimit = 60 + (100 - optionValue_cleanup_edges) * 0.7;
          if (colourDistance > contrastLimit) continue;

          const islandLuminance = luminanceSum / tail;
          const replacementLuminance = 0.299 * rr + 0.587 * gg + 0.114 * bb;
          // Protect specular highlights, eyes and other deliberate accents.
          if (Math.abs(islandLuminance - replacementLuminance) > 70) continue;
          if (tail <= 2 && islandLuminance > 200) continue;

          for (let i = 0; i < tail; i++) {
            const offset = queue[i] * 4;
            data[offset] = rr;
            data[offset + 1] = gg;
            data[offset + 2] = bb;
          }
          changed = true;
        }
      }
    }
  }
  return changed;
}

function recomputeMaterialCounts() {
  // The render pass only counts materials in schematic mode, so the recount
  // has to follow the same rule or the panel would disagree with the pass.
  if (optionValue_modeNBTOrMapdat !== MapModes.SCHEMATIC_NBT.uniqueId) return;
  for (const row of maps) {
    for (const map of row) {
      for (const colourSetId of Object.keys(map.materials)) map.materials[colourSetId] = 0;
    }
  }
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (canvasImageData.data[i + 3] === 0) {
        if (selectedBlocks[alphaColorIdx] > -1) {
          const map = maps[Math.floor(y / 128)][Math.floor(x / 128)];
          map.materials[alphaColorIdx] = (map.materials[alphaColorIdx] || 0) + 1;
        }
        continue;
      }
      const colour = exactRGBToColourSetIdAndTone([
        canvasImageData.data[i],
        canvasImageData.data[i + 1],
        canvasImageData.data[i + 2],
      ]);
      if (!colour) continue;
      const map = maps[Math.floor(y / 128)][Math.floor(x / 128)];
      map.materials[colour.colourSetId] = (map.materials[colour.colourSetId] || 0) + 1;
    }
  }
}

/**
 * Counts how many support blocks are needed underneath a single pixel.
 *
 * The render pass and recomputeSupportBlockCounts() both use this, so the
 * materials panel and the exported schematic agree on the staircase.
 */
function supportBlockCountForPixel(i, indexA, closestColourSetIdAndTone, whichMap_x, whichMap_y, individualMap_y) {
  if (canvasImageData.data[indexA] === 0) return 0;
  // mapdat can skip support blocks
  if (optionValue_modeNBTOrMapdat !== MapModes.SCHEMATIC_NBT.uniqueId) return 0;
  let count = 0;
  switch (optionValue_whereSupportBlocks) {
    case WhereSupportBlocksModes.NONE.uniqueId: {
      break;
    }
    case WhereSupportBlocksModes.IMPORTANT.uniqueId: {
      if (isSupportBlockMandatoryForColourSetIdAndTone(closestColourSetIdAndTone)) {
        count += 1;
      }
      break;
    }
    case WhereSupportBlocksModes.ALL_OPTIMIZED.uniqueId: {
      // for AllOptimized and AllDoubleOptimized we need to know the block south's y-position / does it need support to be able to determine
      // whether a block needs support underneath; hence we do add support blocks '1-cycle behind' in the for-loop
      switch (individualMap_y) {
        case 0: {
          // we now know about the first block in the column which allows us to determine noobline support blocks
          if (
            // first under-support block
            closestColourSetIdAndTone.tone === "dark" ||
            (closestColourSetIdAndTone.tone === "normal" && isSupportBlockMandatoryForColourSetIdAndTone(closestColourSetIdAndTone))
          ) {
            count += 1;
          }
          if (
            // second under-support block
            closestColourSetIdAndTone.tone === "dark" &&
            isSupportBlockMandatoryForColourSetIdAndTone(closestColourSetIdAndTone)
          ) {
            count += 1;
          }
          break;
        }
        case 1: {
          // first block in column; special since noobline to the North
          const coloursBlock0_index = i - 4 * 128 * optionValue_mapSize_x; //exactRGBToColourSetIdAndTone
          const coloursBlock0 = exactRGBChannelsToColourSetIdAndTone(
            canvasImageData.data[coloursBlock0_index],
            canvasImageData.data[coloursBlock0_index + 1],
            canvasImageData.data[coloursBlock0_index + 2]
          );
          if (
            // first under-support block
            coloursBlock0.tone === "light" ||
            closestColourSetIdAndTone.tone === "dark" ||
            (closestColourSetIdAndTone.tone === "normal" && isSupportBlockMandatoryForColourSetIdAndTone(closestColourSetIdAndTone)) ||
            isSupportBlockMandatoryForColourSetIdAndTone(coloursBlock0)
          ) {
            count += 1;
          }
          if (
            // second under-support block
            closestColourSetIdAndTone.tone === "dark" &&
            isSupportBlockMandatoryForColourSetIdAndTone(closestColourSetIdAndTone)
          ) {
            count += 1;
          }
          break;
        }
        case 127: {
          // falls through
          // special case 127 also accounts for final block in column since we are 1-cycle behind in out for-loop; no lookahead.
          // falls through to default case to also account for block 126 as expected too
          const penultimateColoursBlock_index = i - 4 * 128 * optionValue_mapSize_x;
          const penultimateColoursBlock = exactRGBChannelsToColourSetIdAndTone(
            canvasImageData.data[penultimateColoursBlock_index],
            canvasImageData.data[penultimateColoursBlock_index + 1],
            canvasImageData.data[penultimateColoursBlock_index + 2]
          );
          if (
            // first under-support block
            closestColourSetIdAndTone.tone === "light" ||
            isSupportBlockMandatoryForColourSetIdAndTone(closestColourSetIdAndTone) ||
            (closestColourSetIdAndTone.tone === "normal" && isSupportBlockMandatoryForColourSetIdAndTone(penultimateColoursBlock))
          ) {
            count += 1;
          }
          if (
            // second under-support block
            closestColourSetIdAndTone.tone === "light" &&
            isSupportBlockMandatoryForColourSetIdAndTone(penultimateColoursBlock)
          ) {
            count += 1;
          }
        }
        // eslint-disable-next-line no-fallthrough
        default: {
          // average block in column
          const coloursBlock_north_index = i - 4 * 128 * optionValue_mapSize_x * 2;
          const coloursBlock_north = exactRGBChannelsToColourSetIdAndTone(
            canvasImageData.data[coloursBlock_north_index],
            canvasImageData.data[coloursBlock_north_index + 1],
            canvasImageData.data[coloursBlock_north_index + 2]
          );
          const coloursBlock_index = i - 4 * 128 * optionValue_mapSize_x;
          const coloursBlock = exactRGBChannelsToColourSetIdAndTone(
            canvasImageData.data[coloursBlock_index],
            canvasImageData.data[coloursBlock_index + 1],
            canvasImageData.data[coloursBlock_index + 2]
          );
          const coloursBlock_south = closestColourSetIdAndTone;
          if (
            // first under-support block
            coloursBlock.tone === "light" ||
            coloursBlock_south.tone === "dark" ||
            (coloursBlock_south.tone === "normal" && isSupportBlockMandatoryForColourSetIdAndTone(coloursBlock_south)) ||
            isSupportBlockMandatoryForColourSetIdAndTone(coloursBlock) ||
            (coloursBlock.tone === "normal" && isSupportBlockMandatoryForColourSetIdAndTone(coloursBlock_north))
          ) {
            count += 1;
          }
          if (
            // second under-support block
            (coloursBlock_south.tone === "dark" && isSupportBlockMandatoryForColourSetIdAndTone(coloursBlock_south)) ||
            (coloursBlock.tone === "light" && isSupportBlockMandatoryForColourSetIdAndTone(coloursBlock_north))
          ) {
            count += 1;
          }
          break;
        }
      }
      break;
    }
    case WhereSupportBlocksModes.ALL_DOUBLE_OPTIMIZED.uniqueId: {
      switch (individualMap_y) {
        case 0: {
          // noobline
          count += 1;
          if (closestColourSetIdAndTone.tone === "dark") {
            count += 1;
          }
          break;
        }
        case 127: {
          // falls through
          count += 1;
          if (closestColourSetIdAndTone.tone === "light") {
            count += 1;
          }
        }
        // eslint-disable-next-line no-fallthrough
        default: {
          count += 1;
          const coloursBlock_north_index = i - 4 * 128 * optionValue_mapSize_x;
          const coloursBlock_north = exactRGBChannelsToColourSetIdAndTone(
            canvasImageData.data[coloursBlock_north_index],
            canvasImageData.data[coloursBlock_north_index + 1],
            canvasImageData.data[coloursBlock_north_index + 2]
          );
          if (coloursBlock_north.tone === "light" || closestColourSetIdAndTone.tone === "dark") {
            count += 1;
          }
          break;
        }
      }
      break;
    }
    default: {
      break;
    }
  }
  return count;
}

/**
 * Recomputes the support-block counts from the finished pixel data.
 *
 * The island cleanup recolours pixels after the render pass has already
 * counted the staircase, so the counts have to be redone. Colours are
 * resolved the same way the export resolves them, through the exact
 * colour cache, so the materials list matches the built schematic.
 */
function recomputeSupportBlockCounts() {
  const width = optionValue_mapSize_x * 128;
  const height = optionValue_mapSize_y * 128;
  const isSchematic = optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId;
  for (const row of maps) {
    for (const map of row) {
      map.supportBlockCount = isSchematic ? 128 : 0; // 128 is the noobline count
    }
  }
  if (!isSchematic) return;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const indexA = i + 3;
      if (canvasImageData.data[indexA] === 0) continue;
      const colour = exactRGBToColourSetIdAndTone([
        canvasImageData.data[i],
        canvasImageData.data[i + 1],
        canvasImageData.data[i + 2],
      ]);
      if (!colour) continue;
      if (selectedBlocks[colour.colourSetId] === undefined || selectedBlocks[colour.colourSetId] === "-1") continue;
      const whichMap_x = Math.floor(x / 128);
      const whichMap_y = Math.floor(y / 128);
      const individualMap_y = y % 128;
      maps[whichMap_y][whichMap_x].supportBlockCount += supportBlockCountForPixel(
        i,
        indexA,
        colour,
        whichMap_x,
        whichMap_y,
        individualMap_y
      );
    }
  }
}

function getMapartImageDataAndMaterials() {
  if (hasMaskEdits) sourceImageData = new Uint8ClampedArray(canvasImageData.data);
  cleanupProtectionMask = null;
  if (hasPixelEdits) {
    const width = optionValue_mapSize_x * 128;
    const height = optionValue_mapSize_y * 128;
    const pixelCount = width * height;
    for (let index = 0; index < pixelEditIndices.length; index++) {
      const pixel = pixelEditIndices[index];
      if (pixelEditKinds[pixel] !== 2) continue; // protect
      if (!cleanupProtectionMask) cleanupProtectionMask = new Uint8Array(pixelCount);
      cleanupProtectionMask[pixel] = 1;
    }
  }
  const edgeMask = cleanupApply();

  for (let y = 0; y < optionValue_mapSize_y; y++) {
    let mapsRowToAdd = [];
    for (let x = 0; x < optionValue_mapSize_x; x++) {
      let mapEntryToAdd = { materials: {}, supportBlockCount: 0 };
      colourSetsToUse.forEach((colourSet) => {
        mapEntryToAdd.materials[colourSet.colourSetId] = 0;
      });
      mapsRowToAdd.push(mapEntryToAdd);
    }
    maps.push(mapsRowToAdd);
  }

  if (colourSetsToUse.length === 0) {
    return;
  }

  if (optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId) {
    maps.forEach((row) =>
      row.forEach((map) => {
        map.supportBlockCount = 128; // initialise with noobline count
      })
    );
  }

  let ditherMatrix;
  let divisor;
  const chosenDitherMethod =
    DitherMethods[Object.keys(DitherMethods).find((ditherMethodKey) => DitherMethods[ditherMethodKey].uniqueId === optionValue_dithering)];
  if (!chosenDitherMethod) {
    throw new Error("Unknown dithering method: " + String(optionValue_dithering));
  }
  const chosenDitherAlgorithm = chosenDitherMethod.algorithm;
  if (chosenDitherAlgorithm !== "none") {
    ditherMatrix = chosenDitherMethod.ditherMatrix;
  }
  if (chosenDitherAlgorithm === "errorDiffusion") {
    divisor = chosenDitherMethod.ditherDivisor;
    ditherMatrix = ditherMatrix.map((row) => row.map((weight) => weight / divisor));
  }
  const multimapWidth = optionValue_mapSize_x * 128;
  const pixelCount = canvasImageData.data.length / 4;
  const isSerpentine = chosenDitherMethod.uniqueId === DitherMethods.FloydSteinbergEdge.uniqueId;
  const serpentineEdgeMask = isSerpentine ? buildSerpentineEdgeMask() : null;
  const ditherStrength = Math.max(0, optionValue_dithering_strength) / 100.0;
  const ditherStrengthMultiplier = ditherStrength;
  // (pattern size + 1) * strength, the factor of the ordered dithering
  const ditherPatternLimit = (ditherMatrix ? ditherMatrix[0].length * ditherMatrix.length + 1 : 1) * ditherStrength;
  const ditheringPropagationRed = optionValue_dithering_propagation_red / 100.0;
  const ditheringPropagationGreen = optionValue_dithering_propagation_green / 100.0;
  const ditheringPropagationBlue = optionValue_dithering_propagation_blue / 100.0;
  let lastProgressPercent = -1;
  for (let order = 0; order < pixelCount; order++) {
    const row = Math.floor(order / multimapWidth);
    const columnInRow = order - row * multimapWidth;
    const multimap_x = isSerpentine && row % 2 === 1 ? multimapWidth - 1 - columnInRow : columnInRow;
    const multimap_y = row;
    const serpentineDirection = isSerpentine && row % 2 === 1 ? -1 : 1;
    const pixelIndex = multimap_y * multimapWidth + multimap_x;
    const i = pixelIndex * 4;
    const indexR = i;
    const indexG = i + 1;
    const indexB = i + 2;
    const indexA = i + 3;

    const whichMap_x = Math.floor(multimap_x / 128);
    const whichMap_y = Math.floor(multimap_y / 128);
    const individualMap_y = multimap_y % 128;
    if (columnInRow === 0) {
      const progress = multimap_y / (128 * optionValue_mapSize_y);
      const progressPercent = Math.floor(progress * 100);
      if (progressPercent !== lastProgressPercent) {
        postMessage({
          head: "PROGRESS_REPORT",
          body: progress,
          requestId: currentRequestId,
        });
        lastProgressPercent = progressPercent;
      }
    }

    let closestColourSetIdAndTone;
    const editKind = hasPixelEdits ? pixelEditKinds[pixelIndex] : 0;
    const editedIsMask = editKind === 1;
    const editedRGB = editKind === 3 ? [pixelEditRGB[pixelIndex * 3], pixelEditRGB[pixelIndex * 3 + 1], pixelEditRGB[pixelIndex * 3 + 2]] : null;
    if (editedIsMask) {
      // A mask pins the pixel to the closest single tone of its original
      // source colour, so it stays clean without overriding the source hue.
      const originalAlpha = sourceImageData ? sourceImageData[indexA] : canvasImageData.data[indexA];
      if (
        optionValue_modeNBTOrMapdat === MapModes.MAPDAT.uniqueId &&
        optionValue_transparency &&
        originalAlpha < optionValue_transparencyTolerance
      ) {
        canvasImageData.data[indexR] = 0;
        canvasImageData.data[indexG] = 0;
        canvasImageData.data[indexB] = 0;
        canvasImageData.data[indexA] = 0;
      } else {
        let alpha = originalAlpha;
        if (alpha !== 0 || selectedBlocks[alphaColorIdx] < 0) {
          alpha = 255;
        }
        canvasImageData.data[indexA] = alpha;
        const originalPixel = sourceImageData
          ? [sourceImageData[indexR], sourceImageData[indexG], sourceImageData[indexB]]
          : [canvasImageData.data[indexR], canvasImageData.data[indexG], canvasImageData.data[indexB]];
        closestColourSetIdAndTone = findClosestColourSetIdAndToneAndRGBTo(originalPixel);
        const closestColour = colourSetIdAndToneToRGB(closestColourSetIdAndTone.colourSetId, closestColourSetIdAndTone.tone);
        canvasImageData.data[indexR] = closestColour[0];
        canvasImageData.data[indexG] = closestColour[1];
        canvasImageData.data[indexB] = closestColour[2];
      }
    } else if (editedRGB) {
      // Manual editor pixels bypass dithering so the chosen tone stays exactly
      // where it was painted. The source image and surrounding dithering are
      // left untouched.
      canvasImageData.data[indexA] = 255;
      closestColourSetIdAndTone = findClosestColourSetIdAndToneAndRGBTo(editedRGB);
      const closestColour = colourSetIdAndToneToRGB(closestColourSetIdAndTone.colourSetId, closestColourSetIdAndTone.tone);
      canvasImageData.data[indexR] = closestColour[0];
      canvasImageData.data[indexG] = closestColour[1];
      canvasImageData.data[indexB] = closestColour[2];
    } else if (
      optionValue_modeNBTOrMapdat === MapModes.MAPDAT.uniqueId &&
      optionValue_transparency &&
      canvasImageData.data[indexA] < optionValue_transparencyTolerance
    ) {
      // we specially reserve 0,0,0,0 for transparent in mapdats
      canvasImageData.data[indexR] = 0;
      canvasImageData.data[indexG] = 0;
      canvasImageData.data[indexB] = 0;
      canvasImageData.data[indexA] = 0;
    } else {
      if (canvasImageData.data[indexA] !== 0 || selectedBlocks[alphaColorIdx] < 0) {
        canvasImageData.data[indexA] = 255; // full opacity
      }
      const oldPixel = [canvasImageData.data[indexR], canvasImageData.data[indexG], canvasImageData.data[indexB]];
      if (edgeMask && edgeMask[i / 4] && chosenDitherMethod.uniqueId !== DitherMethods.None.uniqueId) {
        closestColourSetIdAndTone = findClosestColourSetIdAndToneAndRGBTo(oldPixel);
        const closestColour = colourSetIdAndToneToRGB(closestColourSetIdAndTone.colourSetId, closestColourSetIdAndTone.tone);
        canvasImageData.data[indexR] = closestColour[0];
        canvasImageData.data[indexG] = closestColour[1];
        canvasImageData.data[indexB] = closestColour[2];
      } else {
      // The dithering algorithm is chosen once per render from the `algorithm`
      // field of the selected method, so adding a method to ditherMethods.json
      // is enough: there is no per-method switch to keep in sync here.
      if (chosenDitherAlgorithm === "none") {
          closestColourSetIdAndTone = findClosestColourSetIdAndToneAndRGBTo(oldPixel);
          const closestColour = colourSetIdAndToneToRGB(closestColourSetIdAndTone.colourSetId, closestColourSetIdAndTone.tone);
          canvasImageData.data[indexR] = closestColour[0];
          canvasImageData.data[indexG] = closestColour[1];
          canvasImageData.data[indexB] = closestColour[2];
      } else if (chosenDitherAlgorithm === "ordered") {
          // The threshold matrix is indexed in raster order: the first index is
          // the row (y), the second the column (x). Indexing it the other way
          // round transposes the pattern and destroys the Bayer cross.
          const ditherThreshold = ditherMatrix[multimap_y % ditherMatrix.length][multimap_x % ditherMatrix[0].length];
          if (optionValue_improvedPatternDithering) {
            closestColourSetIdAndTone = findBestPatternImproved(
              oldPixel,
              ditherThreshold,
              ditherStrength,
              ditherMatrix[0].length * ditherMatrix.length
            );
          } else {
            const newPixels = findClosest2ColourSetIdAndToneAndRGBTo(oldPixel);
            // newPixels = [shortestDistance1, shortestDistance2, newPixel1, newPixel2]
            //
            // How much of the second colour is mixed in is decided by where the
            // pixel sits between the two candidate colours, which is
            // distanceToClosest / (distanceToClosest + distanceToSecond): 0 at
            // the closest colour, 1 at the second closest and 0.5 exactly in
            // between. Comparing that ratio with the raw threshold (1..N)
            // spreads the pattern evenly over the whole tone range.
            //
            // The previous comparison divided by the distance to the second
            // colour alone. That ratio exceeds 1 for every pixel which is
            // closer to the first colour, so the pattern was invisible
            // everywhere except in the darkest tones.
            // The colour method returns squared distances, so the square root
            // is taken to get a distance that is proportional to the actual
            // distance between the colours. Without it the ratio bends towards
            // the closest colour and the pattern disappears in the dark tones.
            //
            // How much of the second colour is mixed in is decided by where the
            // pixel sits between the two candidate colours, which is
            // distanceToClosest / (distanceToClosest + distanceToSecond): 0 at
            // the closest colour, 1 at the second closest and 0.5 exactly in
            // between. Comparing that ratio with the raw threshold (1..N)
            // spreads the pattern evenly over the whole tone range.
            //
            // The previous comparison divided by the distance to the second
            // colour alone. That ratio exceeds 1 for every pixel which is
            // closer to the first colour, so the pattern was invisible
            // everywhere except in the darkest tones.
            //
            // The colour method returns squared distances, so the square root
            // is taken to get a distance that is proportional to the actual
            // distance between the colours. Without it the ratio bends towards
            // the closest colour and the pattern disappears in the dark tones.
            //
            // The square roots are avoided: the comparison
            //   d1 / (d1 + d2) * K > T
            // is the same as
            //   d1 * (K - T) > T * d2
            // and both sides are positive, so it can be squared:
            //   d1^2 * (K - T)^2 > T^2 * d2^2
            // The squared distances are exactly what the colour method
            // returned, so the whole comparison works without a square root
            // and without a division.
            const limit = ditherPatternLimit - ditherThreshold;
            if (ditherStrength > 0 && limit > 0 && newPixels[0] * limit * limit > ditherThreshold * ditherThreshold * newPixels[1]) {
              closestColourSetIdAndTone = newPixels[3];
            } else {
              closestColourSetIdAndTone = newPixels[2];
            }
          }
          const closestColour = colourSetIdAndToneToRGB(closestColourSetIdAndTone.colourSetId, closestColourSetIdAndTone.tone);
          canvasImageData.data[indexR] = closestColour[0];
          canvasImageData.data[indexG] = closestColour[1];
          canvasImageData.data[indexB] = closestColour[2];
      } else if (chosenDitherAlgorithm === "errorDiffusion") {
          closestColourSetIdAndTone = findClosestColourSetIdAndToneAndRGBTo(oldPixel);
          const closestColour = colourSetIdAndToneToRGB(closestColourSetIdAndTone.colourSetId, closestColourSetIdAndTone.tone);
          canvasImageData.data[indexR] = closestColour[0];
          canvasImageData.data[indexG] = closestColour[1];
          canvasImageData.data[indexB] = closestColour[2];

          const quant_error = [
            ((oldPixel[0] - closestColour[0]) * ditheringPropagationRed) * ditherStrengthMultiplier,
            ((oldPixel[1] - closestColour[1]) * ditheringPropagationGreen) * ditherStrengthMultiplier,
            ((oldPixel[2] - closestColour[2]) * ditheringPropagationBlue) * ditherStrengthMultiplier
          ];

          if (isSerpentine) {
            diffuseSerpentineError(
              multimap_x,
              multimap_y,
              serpentineDirection,
              quant_error,
              ditherMatrix,
              ditherStrengthMultiplier,
              serpentineEdgeMask
            );
          } else {
          try {
            // ditherMatrix [0][0...2] should always be zero, and can thus be skipped
            if (multimap_x + 1 < multimapWidth) {
              // Make sure to not carry over error from one side to the other
              const weight = ditherMatrix[0][3]; // 1 right
              canvasImageData.data[i + 4] += quant_error[0] * weight;
              canvasImageData.data[i + 5] += quant_error[1] * weight;
              canvasImageData.data[i + 6] += quant_error[2] * weight;
              if (multimap_x + 2 < multimapWidth) {
                const weight = ditherMatrix[0][4]; // 2 right
                canvasImageData.data[i + 8] += quant_error[0] * weight;
                canvasImageData.data[i + 9] += quant_error[1] * weight;
                canvasImageData.data[i + 10] += quant_error[2] * weight;
              }
            }

            // First row below
            if (multimap_x > 0) {
              // Order reversed, to allow nesting of 'if' blocks
              const weight = ditherMatrix[1][1]; // 1 down, 1 left
              canvasImageData.data[i + multimapWidth * 4 - 4] += quant_error[0] * weight;
              canvasImageData.data[i + multimapWidth * 4 - 3] += quant_error[1] * weight;
              canvasImageData.data[i + multimapWidth * 4 - 2] += quant_error[2] * weight;
              if (multimap_x > 1) {
                const weight = ditherMatrix[1][0]; // 1 down, 2 left
                canvasImageData.data[i + multimapWidth * 4 - 8] += quant_error[0] * weight;
                canvasImageData.data[i + multimapWidth * 4 - 7] += quant_error[1] * weight;
                canvasImageData.data[i + multimapWidth * 4 - 6] += quant_error[2] * weight;
              }
            }
            let weight = ditherMatrix[1][2]; // 1 down
            canvasImageData.data[i + multimapWidth * 4 + 0] += quant_error[0] * weight;
            canvasImageData.data[i + multimapWidth * 4 + 1] += quant_error[1] * weight;
            canvasImageData.data[i + multimapWidth * 4 + 2] += quant_error[2] * weight;
            if (multimap_x + 1 < multimapWidth) {
              const weight = ditherMatrix[1][3]; // 1 down, 1 right
              canvasImageData.data[i + multimapWidth * 4 + 4] += quant_error[0] * weight;
              canvasImageData.data[i + multimapWidth * 4 + 5] += quant_error[1] * weight;
              canvasImageData.data[i + multimapWidth * 4 + 6] += quant_error[2] * weight;
              if (multimap_x + 2 < multimapWidth) {
                const weight = ditherMatrix[1][4]; // 1 down, 2 right
                canvasImageData.data[i + multimapWidth * 4 + 8] += quant_error[0] * weight;
                canvasImageData.data[i + multimapWidth * 4 + 9] += quant_error[1] * weight;
                canvasImageData.data[i + multimapWidth * 4 + 10] += quant_error[2] * weight;
              }
            }

            // Second row below
            if (multimap_x > 0) {
              const weight = ditherMatrix[2][1]; // 2 down, 1 left
              canvasImageData.data[i + multimapWidth * 8 - 4] += quant_error[0] * weight;
              canvasImageData.data[i + multimapWidth * 8 - 3] += quant_error[1] * weight;
              canvasImageData.data[i + multimapWidth * 8 - 2] += quant_error[2] * weight;
              if (multimap_x > 1) {
                const weight = ditherMatrix[2][0]; // 2 down, 2 left
                canvasImageData.data[i + multimapWidth * 8 - 8] += quant_error[0] * weight;
                canvasImageData.data[i + multimapWidth * 8 - 7] += quant_error[1] * weight;
                canvasImageData.data[i + multimapWidth * 8 - 6] += quant_error[2] * weight;
              }
            }
            weight = ditherMatrix[2][2]; // 2 down
            canvasImageData.data[i + multimapWidth * 8 + 0] += quant_error[0] * weight;
            canvasImageData.data[i + multimapWidth * 8 + 1] += quant_error[1] * weight;
            canvasImageData.data[i + multimapWidth * 8 + 2] += quant_error[2] * weight;
            if (multimap_x + 1 < multimapWidth) {
              const weight = ditherMatrix[2][3]; // 2 down, 1 right
              canvasImageData.data[i + multimapWidth * 8 + 4] += quant_error[0] * weight;
              canvasImageData.data[i + multimapWidth * 8 + 5] += quant_error[1] * weight;
              canvasImageData.data[i + multimapWidth * 8 + 6] += quant_error[2] * weight;
              if (multimap_x + 2 < multimapWidth) {
                const weight = ditherMatrix[2][4]; // 2 down, 2 right
                canvasImageData.data[i + multimapWidth * 8 + 8] += quant_error[0] * weight;
                canvasImageData.data[i + multimapWidth * 8 + 9] += quant_error[1] * weight;
                canvasImageData.data[i + multimapWidth * 8 + 10] += quant_error[2] * weight;
              }
            }
          } catch (e) {
            console.log(e); // ???
          }
          }
      } else {
        // An unknown algorithm must fail loudly: silently doing nothing would
        // leave the preview showing stale pixels.
        throw new Error("Unsupported dithering algorithm: " + String(chosenDitherAlgorithm));
      }
      }

      if (canvasImageData.data[indexA] !== 0) {
        if (optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId) {
          maps[whichMap_y][whichMap_x].supportBlockCount += supportBlockCountForPixel(
            i,
            indexA,
            closestColourSetIdAndTone,
            whichMap_x,
            whichMap_y,
            individualMap_y
          );
          maps[whichMap_y][whichMap_x].materials[closestColourSetIdAndTone.colourSetId] += 1;
        }
      }
      if (canvasImageData.data[indexA] === 0 && selectedBlocks[alphaColorIdx] > -1) {
        maps[whichMap_y][whichMap_x].materials[alphaColorIdx] += 1;
      }
    }
  }

  if (optionValue_cleanup_enabled && optionValue_cleanup_despeckle > 0 && optionValue_cleanup_paletteIslands) {
    const islandsChanged = optionValue_cleanup_islandsSmart
      ? cleanupSmartPaletteIslands(optionValue_cleanup_despeckle)
      : cleanupPaletteIslands(optionValue_cleanup_despeckle);
    if (islandsChanged) {
      recomputeMaterialCounts();
      recomputeSupportBlockCounts();
    }
  }
}

onmessage = (e) => {
  const head = e.data.head;
  const body = e.data.body || {};
  // the request id travels with the message, the body is only used by older
  // callers that put it there
  const requestId = e.data.requestId !== undefined ? e.data.requestId : body.requestId;

  if (head === "INIT") {
    // The palette and the mode tables are sent once and then stay in the
    // worker. They are 359 kB in total and were cloned into every single
    // render message before.
    coloursJSON = body.coloursJSON;
    MapModes = body.MapModes;
    WhereSupportBlocksModes = body.WhereSupportBlocksModes;
    ColourMethods = body.ColourMethods;
    DitherMethods = body.DitherMethods;
    // The exact colour cache belongs to the palette, so a new palette means a
    // new cache.
    exactColourCache.clear();
    setupExactColourCache();
    postMessage({
      head: "INIT_DONE",
      body: {},
      requestId: requestId,
    });
    return;
  }

  if (head !== "PIXELS") {
    throw new Error("Unknown worker message header: " + String(head));
  }

  try {
    renderPixels(body, requestId);
  } catch (error) {
    postMessage({
      head: "ERROR",
      body: {
        message: error && error.message ? error.message : String(error),
      },
      requestId: requestId,
    });
  }
};

function renderPixels(body, requestId) {
  // Older callers send the palette with every render message. The studio sends
  // it once with an INIT message, but the fallback keeps the worker usable on
  // its own.
  if (body.coloursJSON && body.coloursJSON !== coloursJSON) {
    coloursJSON = body.coloursJSON;
    MapModes = body.MapModes || MapModes;
    WhereSupportBlocksModes = body.WhereSupportBlocksModes || WhereSupportBlocksModes;
    ColourMethods = body.ColourMethods || ColourMethods;
    DitherMethods = body.DitherMethods || DitherMethods;
    exactColourCache.clear();
    setupExactColourCache();
  }
  currentRequestId = requestId;
  canvasImageData = body.canvasImageData;
  selectedBlocks = body.selectedBlocks;
  disabledTones = body.disabledTones;
  optionValue_modeNBTOrMapdat = body.optionValue_modeNBTOrMapdat;
  optionValue_mapSize_x = body.optionValue_mapSize_x;
  optionValue_mapSize_y = body.optionValue_mapSize_y;
  optionValue_staircasing = body.optionValue_staircasing;
  optionValue_whereSupportBlocks = body.optionValue_whereSupportBlocks;
  optionValue_transparency = body.optionValue_transparency;
  optionValue_transparencyTolerance = body.optionValue_transparencyTolerance;
  optionValue_betterColour = body.optionValue_betterColour;
  chosenColourMethod =
    ColourMethods[Object.keys(ColourMethods).find((colourMethodKey) => ColourMethods[colourMethodKey].uniqueId === optionValue_betterColour)];
  setupColourMetricKind();
  optionValue_dithering = body.optionValue_dithering;
  optionValue_dithering_propagation_red = body.optionValue_dithering_propagation_red;
  optionValue_dithering_propagation_green = body.optionValue_dithering_propagation_green;
  optionValue_dithering_propagation_blue = body.optionValue_dithering_propagation_blue;
  optionValue_dithering_strength = body.optionValue_dithering_strength === undefined ? 100 : body.optionValue_dithering_strength;
  optionValue_improvedPatternDithering = body.optionValue_improvedPatternDithering === true;
  optionValue_patternPairMode = body.optionValue_patternPairMode === "reflect" ? "reflect" : "nearest";
  optionValue_cleanup_enabled = !!body.optionValue_cleanup_enabled;
  optionValue_cleanup_denoise = body.optionValue_cleanup_denoise || 0;
  optionValue_cleanup_denoiseMethod = body.optionValue_cleanup_denoiseMethod || "median";
  optionValue_cleanup_edges = body.optionValue_cleanup_edges === undefined ? 60 : body.optionValue_cleanup_edges;
  optionValue_cleanup_despeckle = body.optionValue_cleanup_despeckle || 0;
  optionValue_cleanup_paletteIslands = body.optionValue_cleanup_paletteIslands !== false;
  optionValue_cleanup_colours = body.optionValue_cleanup_colours || 0;
  optionValue_cleanup_coloursPerceptual = !!body.optionValue_cleanup_coloursPerceptual;
  optionValue_cleanup_islandsSmart = !!body.optionValue_cleanup_islandsSmart;
  optionValue_cleanup_adaptiveDither = body.optionValue_cleanup_adaptiveDither !== false;
  optionValue_style = body.optionValue_style;
  pixelEdits = body.pixelEdits || {};
  sourceImageData = null;

  // Reset everything that belongs to a single render. The maps array belongs to
  // one render and must not grow from one render to the next.
  maps = [];
  colourSetsToUse = [];

  setupColourSetsToUse();
  applyStyleColourLimit();
  setupSupportMandatoryCache();

  // The colour caches only depend on the tones that can be picked. They are
  // kept when only the dithering settings changed and thrown away when the
  // palette changed, which is what makes dragging a slider fast.
  const signature = toneSetSignature();
  if (signature !== flatToneSignature) {
    flatToneSignature = signature;
    buildFlatToneList();
    colourCache.clear();
    colourCache2.clear();
    colourCache2Improved.clear();
    colourCache2Reflect.clear();
  }

  setupPixelEdits(pixelEdits, optionValue_mapSize_x * 128 * optionValue_mapSize_y * 128);
  getMapartImageDataAndMaterials();
  postMessage(
    {
      head: "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS",
      body: {
        pixels: canvasImageData,
        maps: maps,
        currentSelectedBlocks: selectedBlocks,
      },
      requestId: requestId,
    },
    // The pixel buffer is handed over instead of being copied. The worker does
    // not use it after this message.
    [canvasImageData.data.buffer]
  );
}

};
