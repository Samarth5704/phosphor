// Four destructible shields as 1-bit pixel grids held in Uint8Arrays, so they
// clone and hash with the rest of the state. Erosion is per pixel through a
// small mask anchored on the impact pixel.

import { RULES } from './rules.js';
import { TUNING } from './constants.js';
import { overlaps } from './collision.js';

function bitmapToPixels(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pixels[y * w + x] = rows[y][x] === '#' ? 1 : 0;
  }
  return { w, h, pixels };
}

export function createShields() {
  const shields = [];
  for (let i = 0; i < RULES.SHIELD_COUNT; i++) {
    const { w, h, pixels } = bitmapToPixels(TUNING.SHIELD_BITMAP);
    shields.push({ x: TUNING.SHIELD_XS[i], y: TUNING.SHIELD_Y, w, h, pixels });
  }
  return shields;
}

export function shieldPixel(shield, px, py) {
  return shield.pixels[py * shield.w + px];
}

export function shieldPixelCount(shield) {
  let n = 0;
  for (const p of shield.pixels) n += p;
  return n;
}

// First set pixel (in shield-local coordinates) overlapped by the box, scanning
// top-to-bottom then left-to-right, or null. The box is swept 1px at a time by
// callers, so the overlap region is the shot's leading edge.
export function shieldHitAt(shield, box) {
  if (!overlaps(box, shield)) return null;
  const x0 = Math.max(0, box.x - shield.x);
  const x1 = Math.min(shield.w, box.x + box.w - shield.x);
  const y0 = Math.max(0, box.y - shield.y);
  const y1 = Math.min(shield.h, box.y + box.h - shield.y);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (shield.pixels[py * shield.w + px]) return { px, py };
    }
  }
  return null;
}

// Clears every '#' cell of the mask, placed so the mask's anchor sits on the
// impact pixel. Cells outside the shield are clipped, never wrapped.
export function erodeShield(shield, px, py, mask) {
  for (let my = 0; my < mask.rows.length; my++) {
    const row = mask.rows[my];
    for (let mx = 0; mx < row.length; mx++) {
      if (row[mx] !== '#') continue;
      const x = px - mask.anchorX + mx;
      const y = py - mask.anchorY + my;
      if (x < 0 || y < 0 || x >= shield.w || y >= shield.h) continue;
      shield.pixels[y * shield.w + x] = 0;
    }
  }
}

// Tests a box against every shield; on the first pixel hit, erodes with the
// mask and returns true.
export function hitShields(shields, box, mask) {
  for (const shield of shields) {
    const hit = shieldHitAt(shield, box);
    if (hit) {
      erodeShield(shield, hit.px, hit.py, mask);
      return true;
    }
  }
  return false;
}
