#!/usr/bin/env node
/*
 * Generates the ordered dithering matrices used by MapArtCraft.
 *
 * Run with:
 *   node src/tools/generateDitherMatrices.js          # print JSON
 *   node src/tools/generateDitherMatrices.js --check  # verify ditherMethods.json
 *
 * Two matrices are generated from first principles instead of being hand
 * written, because hand copying them is what produced the corrupted tables
 * this tool replaces:
 *
 *  - Bayer matrices follow Bryce Bayer's recursive definition
 *        M(2n) = [[4Mn,   4Mn+2],
 *                  [4Mn+3, 4Mn+1]]
 *    which yields a permutation of 1..n^2 for any power of two n.
 *
 *  - The void-and-cluster matrix follows Robert Ulichney's algorithm
 *    ("The void-and-cluster method for dither array generation", 1993).
 *    The algorithm is defined for any M x N size, not just powers of two.
 *
 * The 3x3 Bayer matrix has no power-of-two derivation, so it uses the
 * published 3x3 threshold matrix
 *        [[1, 8, 4], [7, 6, 3], [5, 2, 9]]
 * and the clustered-dot 4x4 matrix uses Ulichney's published template
 *        [[13, 6, 7, 14], [5, 1, 2, 8], [12, 4, 3, 9], [16, 11, 10, 15]]
 * (from "Digital Halftoning", Robert Ulichney).
 */

const MATRICES = {
  Bayer22: null, // generated
  Bayer33: [
    [1, 8, 4],
    [7, 6, 3],
    [5, 2, 9],
  ],
  Bayer44: null, // generated
  Bayer88: null, // generated
  ClusterDot44: [
    [13, 6, 7, 14],
    [5, 1, 2, 8],
    [12, 4, 3, 9],
    [16, 11, 10, 15],
  ],
};

/** Canonical Bayer matrix of side n (a power of two), 1-indexed. */
function bayerMatrix(n) {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length;
    const out = Array.from({ length: s * 2 }, () => new Array(s * 2).fill(0));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = m[y][x];
        out[y][x] = 4 * v;
        out[y][x + s] = 4 * v + 2;
        out[y + s][x] = 4 * v + 3;
        out[y + s][x + s] = 4 * v + 1;
      }
    }
    m = out;
  }
  return m.map((row) => row.map((v) => v + 1));
}

/**
 * Ulichney's void-and-cluster threshold matrix, 1-indexed.
 * Produces a permutation of 1..(M*N).
 */
function voidAndClusterMatrix(M, N, { radius = 2, sigma = 1.5 } = {}) {
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
  // Periodic neighbourhood, so the matrix tiles seamlessly in both directions.
  const filteredValue = (binary, cx, cy) => {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = (((cx + dx) % M) + M) % M;
        const y = (((cy + dy) % N) + N) % N;
        sum += binary[y][x] * kernel[dy + radius][dx + radius];
      }
    }
    return sum;
  };

  const binary = Array.from({ length: N }, () => new Array(M).fill(0));
  const rank = Array.from({ length: N }, () => new Array(M).fill(-1));

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
        const value = filteredValue(binary, x, y);
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
        const value = filteredValue(binary, x, y);
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
  let count = 1;
  while (count < half) {
    const [x, y] = largestVoid();
    binary[y][x] = 1;
    count += 1;
  }

  // Phase I: assign ranks half-1 .. 0 by removing the tightest cluster each step.
  for (let r = half; r >= 1; r--) {
    const [x, y] = tightestCluster();
    rank[y][x] = r - 1;
    binary[y][x] = 0;
  }

  // Phase II: rebuild the prototype to `half` dots. These are the same cells
  // Phase I removed (they were tightest clusters, so they are now the largest
  // voids); their ranks were already recorded above.
  count = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < M; x++) count += binary[y][x];
  }
  while (count < half) {
    const [x, y] = largestVoid();
    binary[y][x] = 1;
    count += 1;
  }

  // Phase III: ranks half .. MN-1, adding a dot at the largest void each step.
  for (let r = half; r < MN; r++) {
    const [x, y] = largestVoid();
    binary[y][x] = 1;
    rank[y][x] = r;
  }

  return rank.map((row) => row.map((v) => v + 1));
}

function build() {
  const result = {};
  result.Bayer22 = bayerMatrix(2);
  result.Bayer33 = MATRICES.Bayer33;
  result.Bayer44 = bayerMatrix(4);
  result.Bayer88 = bayerMatrix(8);
  result.ClusterDot44 = MATRICES.ClusterDot44;
  result.VoidAndCluster1414 = voidAndClusterMatrix(14, 14);
  return result;
}

/** An ordered dither matrix must use every threshold in 1..N exactly once. */
function isPermutation(matrix) {
  const flat = matrix.flat();
  const expected = matrix.length * matrix[0].length;
  if (flat.length !== expected) return false;
  const seen = new Set(flat);
  if (seen.size !== expected) return false;
  for (let i = 1; i <= expected; i++) if (!seen.has(i)) return false;
  return true;
}

module.exports = { build, bayerMatrix, voidAndClusterMatrix, isPermutation };

if (require.main === module) {
  const generated = build();
  const checkOnly = process.argv.includes("--check");

  for (const [name, matrix] of Object.entries(generated)) {
    if (!isPermutation(matrix)) {
      console.error(`${name}: NOT a permutation of 1..${matrix.length * matrix[0].length}`);
      process.exitCode = 1;
    }
  }

  if (checkOnly) {
    const ditherMethods = require("../components/mapart/json/ditherMethods.json");
    let failures = 0;
    for (const [name, matrix] of Object.entries(generated)) {
      const stored = ditherMethods[name] && ditherMethods[name].ditherMatrix;
      if (!stored) {
        console.error(`${name}: missing from ditherMethods.json`);
        failures += 1;
        continue;
      }
      if (JSON.stringify(stored) !== JSON.stringify(matrix)) {
        console.error(`${name}: ditherMethods.json differs from the generated matrix`);
        console.error("  stored:   " + JSON.stringify(stored));
        console.error("  expected: " + JSON.stringify(matrix));
        failures += 1;
      }
    }
    if (failures) {
      console.error(`\n${failures} matrix/matrices are out of date.`);
      process.exitCode = 1;
    } else {
      console.log("All generated dither matrices match ditherMethods.json.");
    }
  } else {
    console.log(JSON.stringify(generated, null, 2));
  }
}
