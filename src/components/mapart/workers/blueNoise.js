/*
 * Blue noise: Ulichney's void-and-cluster threshold generation.
 *
 * The algorithm is described in
 *   Robert Ulichney, "The void-and-cluster method for dither array
 *   generation", IEEE Transactions on Image Processing, 1993.
 *
 * It produces a threshold array whose values are a permutation of
 * 0..N-1 and whose spatial distribution is as "blue" as possible: the
 * energy of the pattern is concentrated in the high frequencies, so the
 * eye sees noise rather than a regular grid.
 *
 * The file is CommonJS on purpose: the worker (webpack) and the node
 * tool (src/tools/generateDitherMatrices.js) must use exactly the same
 * code, otherwise the matrix checked into ditherMethods.json and the
 * matrix generated at runtime would drift apart.
 */

/**
 * Ulichney's void-and-cluster ranking, 0-indexed.
 *
 * @param {number} M width of the array
 * @param {number} N height of the array
 * @param {{radius?: number, sigma?: number}} options
 * @returns {number[][]} ranks[y][x] - a permutation of 0..M*N-1
 */
function voidAndClusterRanks(M, N, options) {
  const settings = options || {};
  const radius = settings.radius === undefined ? 2 : settings.radius;
  const sigma = settings.sigma === undefined ? 1.5 : settings.sigma;
  const MN = M * N;
  const half = Math.floor(MN / 2);

  const kernel = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const row = [];
    for (let dx = -radius; dx <= radius; dx++) {
      row.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
    }
    kernel.push(row);
  }

  const wrap = (value, size) => ((value % size) + size) % size;

  /* Отфильтрованное значение клетки — взвешенная сумма соседей.
     Оно пересчитывается не для всех клеток, а только для затронутых: после
     изменения одной клетки меняются значения её соседей, и больше
     ничего. Без этого генерация 32x32 занимала бы сотни миллисекунд. */
  const filtered = new Float64Array(MN);
  const filteredValue = (binary, cx, cy) => {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = wrap(cx + dx, M);
        const y = wrap(cy + dy, N);
        sum += binary[y][x] * kernel[dy + radius][dx + radius];
      }
    }
    return sum;
  };

  const recomputeAll = () => {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < M; x++) {
        filtered[y * M + x] = filteredValue(binary, x, y);
      }
    }
  };

  /* Клетка изменилась на delta: поправляем значения её соседей. */
  const updateNeighbourhood = (cx, cy, delta) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = wrap(cx - dx, M);
        const y = wrap(cy - dy, N);
        filtered[y * M + x] += delta * kernel[dy + radius][dx + radius];
      }
    }
  };

  const binary = [];
  for (let y = 0; y < N; y++) binary.push(new Array(M).fill(0));
  const rank = [];
  for (let y = 0; y < N; y++) rank.push(new Array(M).fill(-1));

  // A "cluster" is a tight group of minority '1's, so the tightest cluster is
  // the '1' with the MOST '1's in its neighbourhood (highest filtered value).
  // A "void" is a large empty space, so the largest void is the '0' with the
  // FEWEST '1's around it (lowest filtered value).
  const largestVoid = () => {
    let best = null;
    let bestValue = Infinity;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < M; x++) {
        if (binary[y][x]) continue;
        const value = filtered[y * M + x];
        if (value < bestValue - 1e-12) {
          bestValue = value;
          best = [x, y];
        }
      }
    }
    return best;
  };

  const tightestCluster = () => {
    let best = null;
    let bestValue = -Infinity;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < M; x++) {
        if (!binary[y][x]) continue;
        const value = filtered[y * M + x];
        if (value > bestValue + 1e-12) {
          bestValue = value;
          best = [x, y];
        }
      }
    }
    return best;
  };

  // Initial Binary Pattern: grow to `half` dots by always filling the largest void.
  binary[0][0] = 1;
  recomputeAll();
  let count = 1;
  while (count < half) {
    const voidCell = largestVoid();
    if (!voidCell) break;
    binary[voidCell[1]][voidCell[0]] = 1;
    updateNeighbourhood(voidCell[0], voidCell[1], 1);
    count += 1;
  }

  // Phase I: assign ranks half-1 .. 0 by removing the tightest cluster each step.
  for (let r = half; r >= 1; r--) {
    const cluster = tightestCluster();
    if (!cluster) break;
    rank[cluster[1]][cluster[0]] = r - 1;
    binary[cluster[1]][cluster[0]] = 0;
    updateNeighbourhood(cluster[0], cluster[1], -1);
  }

  // Phase II: rebuild the prototype to `half` dots. These are the same cells
  // Phase I removed (they were tightest clusters, so they are now the largest
  // voids); their ranks were already recorded above.
  count = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < M; x++) count += binary[y][x];
  while (count < half) {
    const voidCell = largestVoid();
    if (!voidCell) break;
    binary[voidCell[1]][voidCell[0]] = 1;
    updateNeighbourhood(voidCell[0], voidCell[1], 1);
    count += 1;
  }

  // Phase III: ranks half .. MN-1, adding a dot at the largest void each step.
  for (let r = half; r < MN; r++) {
    const voidCell = largestVoid();
    if (!voidCell) break;
    binary[voidCell[1]][voidCell[0]] = 1;
    updateNeighbourhood(voidCell[0], voidCell[1], 1);
    rank[voidCell[1]][voidCell[0]] = r;
  }

  return rank;
}

/**
 * A blue noise threshold field: values spread evenly over (0, 1], but placed
 * in the order the void-and-cluster algorithm produces.
 *
 * The values are uniform on purpose. The share of the second colour in a
 * dithered area is the share of pixels whose threshold is below the tone
 * level, so a field with an uneven histogram would shift the brightness of
 * the map.
 *
 * @param {number} size side of the square field
 * @returns {Float32Array} size*size values in (0, 1]
 */
function blueNoiseField(size) {
  const ranks = voidAndClusterRanks(size, size);
  const field = new Float32Array(size * size);
  const total = size * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rank = ranks[y][x];
      field[y * size + x] = (rank + 0.5) / total;
    }
  }
  return field;
}

module.exports = { voidAndClusterRanks, blueNoiseField };
