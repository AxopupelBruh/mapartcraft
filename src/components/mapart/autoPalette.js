/* ==========================================================================
   autoPalette.js — анализ картинки и подбор блоков (этап 3.6, 3.7)

   Две задачи:

     1. По загруженной картинке найти доминирующие цвета (k-means в Lab) и
        подобрать к ним ближайшие блоки. Это «автопалитра»: пользователь
        не выбирает блоки вручную — приложение само говорит, какие блоки
        нужны картинке.

     2. Посчитать, какие цвета в картинке вообще есть: это нужно, чтобы
        в списке палитры подсвечивать блоки, которые действительно
        пригодятся.

   Цвета сравниваются в Lab (D65): в RGB расстояния не воспринимаются
   пропорционально глазу, и «ближайший блок» там часто оказывается не тем.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Цветовые переводы
   -------------------------------------------------------------------------- */

const srgbToLinear = (channel) => {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

/* sRGB -> CIE Lab (D65). */
export const rgbToLab = (rgb) => {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);

  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;

  const f = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

export const labDistance = (first, second) => {
  const dl = first[0] - second[0];
  const da = first[1] - second[1];
  const db = first[2] - second[2];
  return Math.sqrt(dl * dl + da * da + db * db);
};

/* Lab -> sRGB. Нужен, чтобы показать цвет кластера в интерфейсе. */
export const labToRgb = (lab) => {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;

  const inverse = (value) => (Math.pow(value, 3) > 0.008856 ? Math.pow(value, 3) : (value - 16 / 116) / 7.787);
  const x = inverse(fx) * 0.95047;
  const y = inverse(fy);
  const z = inverse(fz) * 1.08883;

  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  const toChannel = (value) => {
    const clamped = Math.max(0, Math.min(1, value));
    const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(255, srgb * 255)));
  };
  return [toChannel(r), toChannel(g), toChannel(b)];
};

/* --------------------------------------------------------------------------
   Доминирующие цвета
   -------------------------------------------------------------------------- */

const MAX_SAMPLES = 6000;
const KMEANS_ITERATIONS = 12;

/* Пиксели картинки в Lab. Полная картинка не нужна: берётся не более
   MAX_SAMPLES точек, равномерно по всей картинке. */
export const sampleImageColours = (imageData, maximumSamples = MAX_SAMPLES) => {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  if (!pixelCount) return [];
  const step = Math.max(1, Math.floor(pixelCount / maximumSamples));
  const samples = [];
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const index = pixel * 4;
    if (data[index + 3] < 16) continue; // прозрачные пиксели не учитываются
    const rgb = [data[index], data[index + 1], data[index + 2]];
    samples.push({ rgb, lab: rgbToLab(rgb) });
  }
  return samples;
};

/* k-means в Lab. Начальные центры выбираются детерминированно: сначала
   первая точка, потом каждый раз самая далёкая от уже выбранных центров.
   Так результат не зависит от случайного зерна. */
export const findDominantColours = (imageData, count) => {
  const wanted = Math.max(1, Math.min(32, Math.round(count) || 1));
  const samples = sampleImageColours(imageData);
  if (samples.length === 0) return [];

  const centres = [samples[0].lab];
  while (centres.length < wanted && centres.length < samples.length) {
    let farthest = null;
    let farthestDistance = -1;
    for (const sample of samples) {
      let nearest = Infinity;
      for (const centre of centres) {
        const distance = labDistance(sample.lab, centre);
        if (distance < nearest) nearest = distance;
      }
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthest = sample;
      }
    }
    if (!farthest) break;
    centres.push(farthest.lab);
  }

  const assignment = new Array(centres.length).fill(0);
  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
    for (let index = 0; index < samples.length; index++) {
      let best = 0;
      let bestDistance = Infinity;
      for (let centre = 0; centre < centres.length; centre++) {
        const distance = labDistance(samples[index].lab, centres[centre]);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = centre;
        }
      }
      assignment[index] = best;
    }
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let index = 0; index < samples.length; index++) {
      const centre = assignment[index];
      const lab = samples[index].lab;
      sums[centre][0] += lab[0];
      sums[centre][1] += lab[1];
      sums[centre][2] += lab[2];
      sums[centre][3] += 1;
    }
    for (let centre = 0; centre < centres.length; centre++) {
      if (sums[centre][3] === 0) continue;
      centres[centre] = [sums[centre][0] / sums[centre][3], sums[centre][1] / sums[centre][3], sums[centre][2] / sums[centre][3]];
    }
  }

  const counts = new Array(centres.length).fill(0);
  for (const centre of assignment) counts[centre] += 1;

  return centres
    .map((lab, index) => ({
      lab,
      rgb: labToRgb(lab),
      share: counts[index] / samples.length,
    }))
    .filter((cluster) => cluster.share > 0)
    .sort((first, second) => second.share - first.share);
};

/* --------------------------------------------------------------------------
   Подбор блоков
   -------------------------------------------------------------------------- */

/* Цвет набора блоков: тот тон, который виден на картинке блока. */
export const colourSetToneRGB = (colourSet) => {
  const tones = colourSet.tonesRGB || {};
  return tones.normal || tones.light || tones.dark || [128, 128, 128];
};

/* Блок набора, который подходит под текущую версию игры. Свои блоки
   ("CUSTOM") уступают обычным: пользовательские блоки — это исключение,
   а не основа палитры. */
export const pickBlockForColourSet = (colourSet, mcVersion) => {
  const blocks = Object.entries(colourSet.blocks || {});
  const valid = blocks.filter(([, block]) => Object.keys(block.validVersions || {}).includes(mcVersion));
  const usable = valid.length > 0 ? valid : blocks;
  const normal = usable.find(([, block]) => block.presetIndex !== "CUSTOM");
  return (normal || usable[0] || [null, null])[0];
};

/* Подбор блоков под найденные цвета: для каждого цвета ищется ближайший
   набор блоков, одинаковые наборы объединяются. */
export const suggestBlocksForColours = (clusters, coloursJSON, mcVersion) => {
  const candidates = Object.entries(coloursJSON || {}).map(([colourSetId, colourSet]) => ({
    colourSetId,
    colourSet,
    rgb: colourSetToneRGB(colourSet),
    lab: rgbToLab(colourSetToneRGB(colourSet)),
  }));

  const suggestions = [];
  for (const cluster of clusters || []) {
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const distance = labDistance(cluster.lab, candidate.lab);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    if (!best) continue;
    const existing = suggestions.find((suggestion) => suggestion.colourSetId === best.colourSetId);
    if (existing) {
      existing.share += cluster.share;
      continue;
    }
    suggestions.push({
      colourSetId: best.colourSetId,
      blockId: pickBlockForColourSet(best.colourSet, mcVersion),
      rgb: best.rgb,
      share: cluster.share,
      distance: bestDistance,
    });
  }
  return suggestions.sort((first, second) => second.share - first.share);
};

/* --------------------------------------------------------------------------
   Чистые цвета
   -------------------------------------------------------------------------- */

/* Точные цвета картинки: те, что встречаются часто.
   Для «плоских цветов» нужны именно они, а не усреднённые центры
   кластеров: усреднение сдвигает цвет, и картинка меняет оттенок — бирюзовые
   кончики волос превращаются в серые. */
export const dominantExactColours = (imageData, minimumShare = 0.005) => {
  const { data } = imageData;
  const counts = new Map();
  let opaque = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 16) continue;
    const key = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
    opaque++;
  }
  if (opaque === 0) return [];
  const colours = [];
  for (const [key, count] of counts) {
    const share = count / opaque;
    if (share < minimumShare) continue;
    const rgb = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
    colours.push({ rgb, lab: rgbToLab(rgb), share });
  }
  colours.sort((first, second) => second.share - first.share);
  return colours;
};

/* Цвет, который лежит между двумя другими, — это сглаженный край: в
   оригинале он получился смешиванием двух цветов границы. Для «плоских
   цветов» такие цвета не нужны: если оставить их, размытая полоса
   останется ровно там, где её и хотели убрать.

   Поэтому цвета, лежащие на отрезке между двумя другими, отбрасываются.
   Настоящий маленький цвет (глаз, пятно) таковым не является и остаётся. */
export const pureColours = (clusters, tolerance = 14) => {
  const list = (clusters || []).map((cluster) => cluster.rgb);
  const keep = new Array(list.length).fill(true);
  for (let index = 0; index < list.length; index++) {
    const colour = list[index];
    for (let first = 0; first < list.length; first++) {
      if (first === index || !keep[first]) continue;
      for (let second = 0; second < list.length; second++) {
        if (second === index || second === first || !keep[second]) continue;
        const a = list[first];
        const b = list[second];
        const ab0 = b[0] - a[0];
        const ab1 = b[1] - a[1];
        const ab2 = b[2] - a[2];
        const length = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
        if (length === 0) continue;
        const ac0 = colour[0] - a[0];
        const ac1 = colour[1] - a[1];
        const ac2 = colour[2] - a[2];
        const t = (ac0 * ab0 + ac1 * ab1 + ac2 * ab2) / length;
        /* Смесь лежит ВНУТРИ отрезка, а не за его концом. */
        if (t <= 0.08 || t >= 0.92) continue;
        const dx = ac0 - t * ab0;
        const dy = ac1 - t * ab1;
        const dz = ac2 - t * ab2;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= tolerance) {
          keep[index] = false;
          break;
        }
      }
      if (!keep[index]) break;
    }
  }
  const pure = (clusters || []).filter((cluster, index) => keep[index]);
  /* Если фильтр убрал всё — значит цветов не разобрать, и лучше оставить
     исходные, чем превратить картинку в одно пятно. */
  return pure.length > 0 ? pure : clusters || [];
};

/* --------------------------------------------------------------------------
   Диаграмма палитры (этап 3.7)
   -------------------------------------------------------------------------- */

/* Яркость и цветность набора блоков — координаты точки на диаграмме. */
export const colourSetDiagramPoint = (colourSet) => {
  const lab = rgbToLab(colourSetToneRGB(colourSet));
  return {
    luma: lab[0],
    chroma: Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]),
  };
};

/* Какие наборы блоков встречаются в картинке: для каждого цвета ищется
   ближайший набор, но берутся только те, до которых меньше порога. */
export const colourSetsPresentInImage = (clusters, coloursJSON, threshold = 18) => {
  const present = new Set();
  for (const cluster of clusters || []) {
    let best = null;
    let bestDistance = Infinity;
    for (const [colourSetId, colourSet] of Object.entries(coloursJSON || {})) {
      const distance = labDistance(cluster.lab, rgbToLab(colourSetToneRGB(colourSet)));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = colourSetId;
      }
    }
    if (best && bestDistance <= threshold) present.add(best);
  }
  return present;
};
