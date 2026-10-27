// Separable Lanczos resampling for photos. Pixel-art paths keep using the
// browser's nearest-neighbour scaling; this helper is only used by the explicit
// "High quality (Lanczos)" resize mode.
const LANCZOS_RADIUS = 3;

function sinc(value) {
  if (value === 0) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function lanczosWeight(distance) {
  if (distance <= -LANCZOS_RADIUS || distance >= LANCZOS_RADIUS) return 0;
  return sinc(distance) * sinc(distance / LANCZOS_RADIUS);
}

function buildContributions(sourceSize, targetSize) {
  const scale = sourceSize / targetSize;
  const kernelScale = Math.max(1, scale);
  const support = LANCZOS_RADIUS * kernelScale;
  const contributions = new Array(targetSize);
  for (let target = 0; target < targetSize; target++) {
    const center = (target + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.ceil(center - support));
    const end = Math.min(sourceSize - 1, Math.floor(center + support));
    const indices = new Int32Array(end - start + 1);
    const weights = new Float32Array(indices.length);
    let weightSum = 0;
    for (let source = start; source <= end; source++) {
      const weight = lanczosWeight((source - center) / kernelScale);
      const index = source - start;
      indices[index] = source;
      weights[index] = weight;
      weightSum += weight;
    }
    if (weightSum !== 0) {
      for (let index = 0; index < weights.length; index++) weights[index] /= weightSum;
    }
    contributions[target] = { indices, weights };
  }
  return contributions;
}

/**
 * Resamples straight-alpha RGBA image data with a separable Lanczos kernel.
 * Colours are alpha-premultiplied during accumulation so transparent edges do
 * not darken or bleed into opaque artwork.
 */
export function resizeLanczos(imageData, targetWidth, targetHeight) {
  const source = imageData.data;
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;
  if (targetWidth < 1 || targetHeight < 1) return new ImageData(1, 1);

  const horizontal = buildContributions(sourceWidth, targetWidth);
  const vertical = buildContributions(sourceHeight, targetHeight);
  const horizontalData = new Float32Array(targetWidth * sourceHeight * 4);

  for (let y = 0; y < sourceHeight; y++) {
    const sourceRow = y * sourceWidth * 4;
    for (let x = 0; x < targetWidth; x++) {
      const contribution = horizontal[x];
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let index = 0; index < contribution.weights.length; index++) {
        const weight = contribution.weights[index];
        const pixel = sourceRow + contribution.indices[index] * 4;
        const pixelAlpha = source[pixel + 3];
        red += source[pixel] * pixelAlpha * weight;
        green += source[pixel + 1] * pixelAlpha * weight;
        blue += source[pixel + 2] * pixelAlpha * weight;
        alpha += pixelAlpha * weight;
      }
      const output = (y * targetWidth + x) * 4;
      if (alpha > 0) {
        horizontalData[output] = red / alpha;
        horizontalData[output + 1] = green / alpha;
        horizontalData[output + 2] = blue / alpha;
      }
      horizontalData[output + 3] = alpha;
    }
  }

  const result = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const contribution = vertical[y];
    for (let x = 0; x < targetWidth; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let index = 0; index < contribution.weights.length; index++) {
        const weight = contribution.weights[index];
        const pixel = (contribution.indices[index] * targetWidth + x) * 4;
        const pixelAlpha = horizontalData[pixel + 3];
        red += horizontalData[pixel] * pixelAlpha * weight;
        green += horizontalData[pixel + 1] * pixelAlpha * weight;
        blue += horizontalData[pixel + 2] * pixelAlpha * weight;
        alpha += pixelAlpha * weight;
      }
      const output = (y * targetWidth + x) * 4;
      if (alpha > 0) {
        result[output] = red / alpha;
        result[output + 1] = green / alpha;
        result[output + 2] = blue / alpha;
      }
      result[output + 3] = alpha;
    }
  }

  return new ImageData(result, targetWidth, targetHeight);
}
