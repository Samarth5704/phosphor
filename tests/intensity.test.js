// Phase 3b: the intensity buffer's decay contract (spec 5.10), tested on the
// real Float32Array with no canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createIntensityBuffer, decayBuffer, isClear, litCellCount, lightCell, lightRect, lightSprite,
  FIELD_W, FIELD_H, CELL_COUNT,
} from '../src/ui/intensity.js';
import { decayPerStep, INTENSITY_FLOOR, halfLifeFor } from '../src/tokens.js';
import { CANNON, ALIEN_BOTTOM } from '../src/ui/sprites.js';

test('the buffer is a Float32Array of exactly 224 x 256 cells, all zero', () => {
  const b = createIntensityBuffer();
  assert.ok(b instanceof Float32Array);
  assert.equal(b.length, 224 * 256);
  assert.equal(CELL_COUNT, FIELD_W * FIELD_H);
  assert.ok(isClear(b));
});

test('a cell lit to 1.0 and decayed at the 55-alien rate reaches exactly 0, not an epsilon, and the whole buffer is verifiably clear afterwards', () => {
  const b = createIntensityBuffer();
  lightCell(b, 100, 100, 1.0);
  assert.equal(b[100 * FIELD_W + 100], 1);
  const d = decayPerStep(55);
  let steps = 0;
  while (b[100 * FIELD_W + 100] !== 0) {
    decayBuffer(b, d);
    steps++;
    assert.ok(steps < 1000, 'did not clear');
  }
  const cell = b[100 * FIELD_W + 100];
  assert.ok(Object.is(cell, 0), `cell is ${cell}, not +0`);
  assert.ok(isClear(b), 'every cell is exactly 0');
  assert.equal(litCellCount(b), 0);
  // It cleared because of the snap, not because Float32 underflowed: the
  // last non-zero value was above the floor and the next product below it.
  const predicted = Math.log(INTENSITY_FLOOR) / Math.log(d);
  assert.ok(Math.abs(steps - predicted) <= 1, `cleared in ${steps} steps; floor ${INTENSITY_FLOOR} at half-life ${halfLifeFor(55)} predicts ${predicted.toFixed(2)}`);
  // Float32 underflow alone would take several hundred steps at this rate.
  assert.ok(steps < 100, `${steps} steps looks like underflow, not the snap`);
});

test('a full-brightness cell decayed at the 1-alien rate clears in fewer steps than at the 55-alien rate', () => {
  const stepsToClear = (n) => {
    const b = createIntensityBuffer();
    lightCell(b, 0, 0, 1);
    let steps = 0;
    while (!isClear(b)) { decayBuffer(b, decayPerStep(n)); steps++; }
    return steps;
  };
  assert.ok(stepsToClear(1) < stepsToClear(55));
});

test('decay snaps every cell below INTENSITY_FLOOR to 0 and leaves cells above it as the exact product', () => {
  const b = createIntensityBuffer();
  b[0] = INTENSITY_FLOOR * 1.5;
  b[1] = 0.5;
  b[2] = 0;
  decayBuffer(b, 0.5);
  assert.equal(b[0], 0, 'fell below the floor');
  assert.equal(b[1], 0.25);
  assert.ok(Object.is(b[2], 0), '0 * factor stays +0');
});

test('two objects overlapping in one frame produce an intensity of exactly 1.0, not 2.0', () => {
  const b = createIntensityBuffer();
  lightRect(b, 10, 10, 8, 8, 1.0);
  lightRect(b, 14, 14, 8, 8, 1.0);
  assert.equal(b[14 * FIELD_W + 14], 1.0);
  let max = 0;
  for (let i = 0; i < b.length; i++) if (b[i] > max) max = b[i];
  assert.equal(max, 1.0);
  // And a sprite over a sprite, which is the real case.
  lightSprite(b, CANNON, 12, 12);
  lightSprite(b, ALIEN_BOTTOM[0], 12, 12);
  for (let i = 0; i < b.length; i++) assert.ok(b[i] <= 1.0, `cell ${i} = ${b[i]}`);
});

test('writing an object over a decayed trail takes the max, so a faded cell under a fresh object is 1.0 and a fresh cell over nothing stays what it was written as', () => {
  const b = createIntensityBuffer();
  lightRect(b, 0, 0, 4, 1, 1.0);
  decayBuffer(b, 0.5);
  lightRect(b, 0, 0, 2, 1, 1.0);
  assert.equal(b[0], 1.0);
  assert.equal(b[1], 1.0);
  assert.equal(b[2], 0.5);
  assert.equal(b[3], 0.5);
  // Writing a dimmer value over a brighter cell does not dim it.
  lightRect(b, 0, 0, 1, 1, 0.3);
  assert.equal(b[0], 1.0);
});

test('an intensity above 1.0 is clamped to 1.0 on write', () => {
  const b = createIntensityBuffer();
  lightCell(b, 5, 5, 7);
  assert.equal(b[5 * FIELD_W + 5], 1);
  lightRect(b, 0, 0, 2, 2, 2);
  assert.equal(b[0], 1);
});

test('a sprite written partly outside the field is clipped and never wraps onto the neighbouring row', () => {
  const b = createIntensityBuffer();
  // Cannon at x = 220: columns 220..223 land, 224..232 must not appear at
  // the start of the next row.
  lightSprite(b, CANNON, 220, 100);
  for (let y = 100; y < 108; y++) {
    for (let x = 0; x < 12; x++) assert.equal(b[(y + 1) * FIELD_W + x], 0, `wrapped to (${x}, ${y + 1})`);
  }
  assert.ok(litCellCount(b) > 0, 'the in-field part was drawn');
  const before = litCellCount(b);
  lightSprite(b, CANNON, -20, 100);
  lightSprite(b, CANNON, 100, -20);
  lightSprite(b, CANNON, 100, 300);
  assert.equal(litCellCount(b), before, 'fully off-field sprites draw nothing');
});
