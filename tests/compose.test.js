// Phase 3b: intensity -> RGBA. rampGrey for the level, the gel tint for the
// row, alpha always 255. Composed into a plain Uint8ClampedArray, which is
// exactly what ImageData wraps in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, createRgba, createTintTable } from '../src/ui/compose.js';
import { createIntensityBuffer, lightRect, lightCell, FIELD_W, FIELD_H } from '../src/ui/intensity.js';
import { rampGrey, tintAt, GEL_TINTS, GEL_BANDS } from '../src/tokens.js';
import { TUNING } from '../src/core/constants.js';

const px = (rgba, x, y) => Array.from(rgba.subarray((y * FIELD_W + x) * 4, (y * FIELD_W + x) * 4 + 4));

test('a cell at intensity 1.0 in the untinted band composes to pure white, and every alpha is 255', () => {
  const b = createIntensityBuffer();
  const rgba = createRgba();
  lightCell(b, 100, TUNING.RACK_START_Y, 1);
  compose(b, rgba, createTintTable());
  assert.equal(tintAt(TUNING.RACK_START_Y), null);
  assert.deepEqual(px(rgba, 100, TUNING.RACK_START_Y), [255, 255, 255, 255]);
  for (let i = 3; i < rgba.length; i += 4) assert.equal(rgba[i], 255);
});

test('a full-intensity cell in the green band composes to exactly the green gel colour, and in the orange band to exactly the orange', () => {
  const b = createIntensityBuffer();
  const rgba = createRgba();
  lightCell(b, 10, TUNING.CANNON_Y, 1);
  lightCell(b, 10, TUNING.UFO_Y, 1);
  compose(b, rgba, createTintTable());
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  assert.deepEqual(px(rgba, 10, TUNING.CANNON_Y).slice(0, 3), hex(GEL_TINTS.green));
  assert.deepEqual(px(rgba, 10, TUNING.UFO_Y).slice(0, 3), hex(GEL_TINTS.orange));
});

test('two overlapping objects compose to grey 255 and never brighter: there is no value above full white to reach', () => {
  const b = createIntensityBuffer();
  const rgba = createRgba();
  lightRect(b, 50, 100, 10, 10, 1);
  lightRect(b, 55, 105, 10, 10, 1);
  compose(b, rgba, createTintTable());
  assert.deepEqual(px(rgba, 57, 107), [255, 255, 255, 255]);
});

test('a half-intensity cell composes to rampGrey(0.5) times the row tint, rounded per channel', () => {
  const b = createIntensityBuffer();
  const rgba = createRgba();
  lightCell(b, 20, 100, 0.5);
  lightCell(b, 20, 250, 0.5);
  compose(b, rgba, createTintTable());
  const g = rampGrey(0.5);
  assert.deepEqual(px(rgba, 20, 100), [g, g, g, 255]);
  const green = [0x4c, 0xff, 0x6a].map((c) => Math.round((g * c) / 255));
  assert.deepEqual(px(rgba, 20, 250).slice(0, 3), green);
});

test('the tint table follows GEL_BANDS row for row: untinted rows are 1,1,1 and tinted rows are the gel colour in 0..1', () => {
  const t = createTintTable();
  assert.equal(t.length, FIELD_H * 3);
  for (let y = 0; y < FIELD_H; y++) {
    const name = tintAt(y);
    const row = [t[y * 3], t[y * 3 + 1], t[y * 3 + 2]];
    if (name === null) assert.deepEqual(row, [1, 1, 1], `y=${y}`);
    else {
      const expect = [1, 3, 5].map((i) => Math.fround(parseInt(GEL_TINTS[name].slice(i, i + 2), 16) / 255));
      assert.deepEqual(row, expect, `y=${y} ${name}`);
    }
  }
  const bandEdges = GEL_BANDS.flatMap((b) => [b.yStart, b.yEnd - 1]).filter((y) => y >= 0 && y < FIELD_H);
  assert.ok(bandEdges.length >= 6);
});

test('a zero cell composes to opaque black, so a cleared buffer is a black field with alpha 255 everywhere', () => {
  const b = createIntensityBuffer();
  const rgba = createRgba();
  // Dirty the bytes first so the test proves compose writes every cell.
  rgba.fill(77);
  compose(b, rgba, createTintTable());
  for (let i = 0; i < rgba.length; i += 4) {
    assert.equal(rgba[i], 0);
    assert.equal(rgba[i + 1], 0);
    assert.equal(rgba[i + 2], 0);
    assert.equal(rgba[i + 3], 255);
  }
});
