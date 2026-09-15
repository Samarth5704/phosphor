// The phosphor intensity buffer: one Float32 per cell of the 224x256 field,
// 0..1. It is the display. Each step it is multiplied down by the decay
// factor and the frame's geometry is written on top with Math.max, never
// added: two overlapping objects are one full-brightness cell, not 2.0.
//
// Every function here is pure over the typed array it is given, so the decay
// contract (spec 5.10) is unit tested without a canvas: a cell lit to 1.0
// reaches exactly 0, because anything below INTENSITY_FLOOR is snapped to 0.
// The floor is defined in ramp-output space (tokens.js), so the snap never
// changes a displayed pixel.

import { RULES } from '../core/rules.js';
import { INTENSITY_FLOOR } from '../tokens.js';

export const FIELD_W = RULES.FIELD_W;
export const FIELD_H = RULES.FIELD_H;
export const CELL_COUNT = FIELD_W * FIELD_H;

export function createIntensityBuffer() {
  return new Float32Array(CELL_COUNT);
}

// Multiply every cell by `factor` (0 < factor < 1), snapping anything that
// falls below INTENSITY_FLOOR to exactly 0. Cells already at 0 stay 0.
export function decayBuffer(buffer, factor) {
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] * factor;
    buffer[i] = v < INTENSITY_FLOOR ? 0 : v;
  }
}

// True only if every cell is exactly +0: no epsilons, no -0.
export function isClear(buffer) {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0 || Object.is(buffer[i], -0)) return false;
  }
  return true;
}

export function litCellCount(buffer) {
  let n = 0;
  for (let i = 0; i < buffer.length; i++) if (buffer[i] !== 0) n++;
  return n;
}

// Light one cell to at least `v`, clamped to 1.0. Out-of-field cells are
// ignored rather than wrapped onto the next row.
export function lightCell(buffer, x, y, v = 1) {
  if (x < 0 || y < 0 || x >= FIELD_W || y >= FIELD_H) return;
  const k = y * FIELD_W + x;
  const clamped = v > 1 ? 1 : v;
  if (clamped > buffer[k]) buffer[k] = clamped;
}

// Light an axis-aligned rectangle, clipped to the field.
export function lightRect(buffer, x, y, w, h, v = 1) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(FIELD_W, x + w);
  const y1 = Math.min(FIELD_H, y + h);
  const clamped = v > 1 ? 1 : v;
  for (let py = y0; py < y1; py++) {
    const row = py * FIELD_W;
    for (let px = x0; px < x1; px++) {
      if (clamped > buffer[row + px]) buffer[row + px] = clamped;
    }
  }
}

// Light the set pixels of a compiled sprite ({ w, h, pixels: Uint8Array })
// with its top-left at (x, y), clipped to the field.
export function lightSprite(buffer, sprite, x, y, v = 1) {
  const { w, h, pixels } = sprite;
  const clamped = v > 1 ? 1 : v;
  for (let sy = 0; sy < h; sy++) {
    const py = y + sy;
    if (py < 0 || py >= FIELD_H) continue;
    const row = py * FIELD_W;
    const srow = sy * w;
    for (let sx = 0; sx < w; sx++) {
      const px = x + sx;
      if (px < 0 || px >= FIELD_W || !pixels[srow + sx]) continue;
      if (clamped > buffer[row + px]) buffer[row + px] = clamped;
    }
  }
}

// Light a 1-bit pixel grid stored the way the core stores shields
// ({ x, y, w, h, pixels: Uint8Array }), in place.
export function lightPixelGrid(buffer, grid, v = 1) {
  lightSprite(buffer, grid, grid.x, grid.y, v);
}
