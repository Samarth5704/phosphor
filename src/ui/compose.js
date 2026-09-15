// Maps the intensity buffer to RGBA bytes: rampGrey(intensity) for the
// monochrome level, multiplied by the gel tint for that row. The bytes are
// the backing store of an ImageData in the browser; in Node they are a plain
// Uint8ClampedArray, which is what the tests compose into.
//
// The tint is a per-row triple in 0..1 precomputed once from tokens.js, so
// the per-cell work is one pow, three multiplies and three rounds.

import { rampGrey, tintAt, GEL_TINTS } from '../tokens.js';
import { FIELD_W, FIELD_H, CELL_COUNT } from './intensity.js';

function hexToUnit(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// Float32Array(FIELD_H * 3): r, g, b multipliers per row. Untinted rows are
// 1, 1, 1 so grey passes through unchanged.
export function createTintTable() {
  const table = new Float32Array(FIELD_H * 3);
  for (let y = 0; y < FIELD_H; y++) {
    const name = tintAt(y);
    const [r, g, b] = name ? hexToUnit(GEL_TINTS[name]) : [1, 1, 1];
    table[y * 3] = r;
    table[y * 3 + 1] = g;
    table[y * 3 + 2] = b;
  }
  return table;
}

export function createRgba() {
  const rgba = new Uint8ClampedArray(CELL_COUNT * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return rgba;
}

// Writes every cell. Alpha is always 255: the field is opaque.
export function compose(buffer, rgba, tintTable) {
  let k = 0;
  for (let y = 0; y < FIELD_H; y++) {
    const tr = tintTable[y * 3];
    const tg = tintTable[y * 3 + 1];
    const tb = tintTable[y * 3 + 2];
    const row = y * FIELD_W;
    for (let x = 0; x < FIELD_W; x++, k += 4) {
      const i = buffer[row + x];
      if (i === 0) {
        rgba[k] = 0;
        rgba[k + 1] = 0;
        rgba[k + 2] = 0;
        rgba[k + 3] = 255;
        continue;
      }
      const grey = rampGrey(i);
      rgba[k] = Math.round(grey * tr);
      rgba[k + 1] = Math.round(grey * tg);
      rgba[k + 2] = Math.round(grey * tb);
      rgba[k + 3] = 255;
    }
  }
}
