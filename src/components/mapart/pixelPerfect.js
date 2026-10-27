const pixelScaleCache = new WeakMap();

function isUniformGrid(data, width, height, scale, stepX = 1, stepY = 1) {
  for (let blockY = 0; blockY < height / scale; blockY += stepY) {
    for (let blockX = 0; blockX < width / scale; blockX += stepX) {
      const baseX = blockX * scale;
      const baseY = blockY * scale;
      const base = (baseY * width + baseX) * 4;
      const r = data[base];
      const g = data[base + 1];
      const b = data[base + 2];
      const a = data[base + 3];

      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const pixel = ((baseY + y) * width + (baseX + x)) * 4;
          if (
            data[pixel] !== r ||
            data[pixel + 1] !== g ||
            data[pixel + 2] !== b ||
            data[pixel + 3] !== a
          ) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * Finds the largest integer block size (2..maxScale) used by a pixel-art
 * source. A clean 256x256 image made of 2x2 art pixels returns 2, so the
 * preview can sample the native 128x128 art instead of blurring the 2x2 grid.
 */
export function detectPixelScale(image, maxScale = 8) {
  if (!image || !image.width || !image.height) return 1;
  if (pixelScaleCache.has(image)) return pixelScaleCache.get(image);

  const width = image.width;
  const height = image.height;
  const limit = Math.min(maxScale, width, height);
  if (limit < 2) {
    pixelScaleCache.set(image, 1);
    return 1;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  let data;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch {
    pixelScaleCache.set(image, 1);
    return 1;
  }

  // Check larger scales first. The first uniform grid is the native art grid.
  for (let scale = limit; scale >= 2; scale--) {
    if (width % scale !== 0 || height % scale !== 0) continue;
    const stepX = Math.max(1, Math.floor(width / scale / 160));
    const stepY = Math.max(1, Math.floor(height / scale / 160));

    if (!isUniformGrid(data, width, height, scale, stepX, stepY)) continue;
    if (!isUniformGrid(data, width, height, scale)) continue;

    pixelScaleCache.set(image, scale);
    return scale;
  }

  pixelScaleCache.set(image, 1);
  return 1;
}

export function clampPreviewScale(value) {
  return Math.max(1, Math.min(8, Math.round(value)));
}
