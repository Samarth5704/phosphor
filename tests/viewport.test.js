// Phase 3b: integer upscale and whole-pixel letterbox offsets, in device
// pixels, at the three viewports the spec names and at devicePixelRatio 1,
// 2 and 3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutViewport } from '../src/ui/viewport.js';
import { FIELD_W, FIELD_H } from '../src/ui/intensity.js';

const VIEWPORTS = [[320, 568], [375, 812], [1920, 1080]];
const DPRS = [1, 2, 3];

test('the scale factor is a whole number and the letterbox offsets are whole pixels at 320x568, 375x812 and 1920x1080, at devicePixelRatio 1, 2 and 3', () => {
  console.log('\nviewport layouts (device px):');
  for (const [w, h] of VIEWPORTS) {
    for (const dpr of DPRS) {
      const v = layoutViewport(w, h, dpr);
      console.log(`  ${w}x${h} @${dpr}x -> canvas ${v.deviceW}x${v.deviceH}, scale ${v.scale}, field ${v.width}x${v.height} at (${v.offsetX}, ${v.offsetY})`);
      assert.ok(Number.isInteger(v.scale) && v.scale >= 1, `scale ${v.scale}`);
      assert.ok(Number.isInteger(v.offsetX) && Number.isInteger(v.offsetY), `offsets ${v.offsetX}, ${v.offsetY}`);
      assert.ok(Number.isInteger(v.deviceW) && Number.isInteger(v.deviceH));
      assert.equal(v.width, FIELD_W * v.scale);
      assert.equal(v.height, FIELD_H * v.scale);
      // Never scaled up past what fits: the field lies inside the canvas.
      assert.ok(v.width <= v.deviceW && v.height <= v.deviceH, 'field fits');
      assert.ok(v.offsetX >= 0 && v.offsetY >= 0);
      // And it is the largest integer scale that fits.
      assert.ok(FIELD_W * (v.scale + 1) > v.deviceW || FIELD_H * (v.scale + 1) > v.deviceH, 'largest that fits');
    }
  }
});

test('the canvas is sized in device pixels: 375 css px at 3x is 1125 device px, and the field takes scale 5 there rather than the 1 it would get in css px', () => {
  const v = layoutViewport(375, 812, 3);
  assert.equal(v.deviceW, 1125);
  assert.equal(v.deviceH, 2436);
  assert.equal(v.scale, 5); // min(1125/224, 2436/256) = min(5.02, 9.5)
  assert.equal(layoutViewport(375, 812, 1).scale, 1);
});

test('the letterbox is centred to the nearest whole pixel, with any odd pixel going to the right or bottom edge', () => {
  const v = layoutViewport(320, 568, 1);
  assert.equal(v.scale, 1);
  assert.equal(v.offsetX, Math.floor((320 - 224) / 2));
  assert.equal(v.offsetY, Math.floor((568 - 256) / 2));
  const odd = layoutViewport(225, 257, 1);
  assert.deepEqual([odd.offsetX, odd.offsetY], [0, 0]);
  assert.equal(odd.deviceW - odd.width, 1);
});

test('a fractional devicePixelRatio such as 1.5 still yields an integer canvas size, an integer scale and integer offsets', () => {
  const v = layoutViewport(1366, 768, 1.5);
  assert.equal(v.deviceW, 2049);
  assert.equal(v.deviceH, 1152);
  assert.ok(Number.isInteger(v.scale));
  assert.equal(v.scale, 4);
  assert.ok(Number.isInteger(v.offsetX) && Number.isInteger(v.offsetY));
});

test('a viewport smaller than the field in either axis still uses scale 1, never 0', () => {
  const v = layoutViewport(200, 200, 1);
  assert.equal(v.scale, 1);
  assert.equal(layoutViewport(0, 0, 1).scale, 1);
  assert.equal(layoutViewport(800, 600, 0).scale, layoutViewport(800, 600, 1).scale, 'a dpr of 0 is treated as 1');
});
