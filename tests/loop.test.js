// Phase 3b: the fixed-timestep accumulator and its MAX_CATCHUP_MS clamp
// (spec 5.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccumulator, advanceAccumulator, MAX_CATCHUP_MS, MAX_CATCHUP_STEPS, STEP_MS, STEPS_PER_SECOND,
} from '../src/ui/loop.js';

test('MAX_CATCHUP_MS is 250 and is worth exactly 15 steps at 60 per second', () => {
  assert.equal(MAX_CATCHUP_MS, 250);
  assert.equal(STEPS_PER_SECOND, 60);
  assert.equal(MAX_CATCHUP_STEPS, 15);
  assert.ok(Math.abs(STEP_MS - 1000 / 60) < 1e-12);
});

test('an elapsed time of 30 seconds advances the simulation by MAX_CATCHUP_MS worth of steps (15) and no more', () => {
  const acc = createAccumulator();
  let steps = 0;
  const taken = advanceAccumulator(acc, 30000, () => steps++);
  assert.equal(taken, MAX_CATCHUP_STEPS);
  assert.equal(steps, 15);
  assert.equal(acc.pending, 0, 'nothing carried over from the clamped remainder');
  // The next ordinary frame owes one step, not the rest of the 30 seconds.
  assert.equal(advanceAccumulator(acc, STEP_MS, () => steps++), 1);
  assert.equal(steps, 16);
});

test('exactly 250 ms owes 15 steps, not 14: the accumulator counts in step units so the clamp is not one step short from floating point', () => {
  const acc = createAccumulator();
  assert.equal(advanceAccumulator(acc, 250, () => {}), 15);
  // The naive ms division would have produced 14.
  assert.ok(Math.floor(250 / STEP_MS) === 14, 'the floating-point trap this guards against exists');
});

test('sixty frames of 1000/60 ms each take exactly 60 steps with no drift', () => {
  const acc = createAccumulator();
  let steps = 0;
  for (let i = 0; i < 60; i++) advanceAccumulator(acc, 1000 / 60, () => steps++);
  assert.equal(steps, 60);
  assert.ok(acc.pending < 1e-9, `residual ${acc.pending}`);
});

test('a frame shorter than one step takes no step and carries the remainder into the next frame', () => {
  const acc = createAccumulator();
  let steps = 0;
  assert.equal(advanceAccumulator(acc, 10, () => steps++), 0);
  assert.equal(advanceAccumulator(acc, 10, () => steps++), 1);
  assert.equal(steps, 1);
});

test('a negative, NaN or infinite elapsed time takes no step and does not poison the accumulator', () => {
  const acc = createAccumulator();
  let steps = 0;
  for (const bad of [-100, NaN, Infinity, -Infinity, undefined]) {
    assert.equal(advanceAccumulator(acc, bad, () => steps++), 0, String(bad));
  }
  assert.equal(acc.pending, 0);
  assert.equal(advanceAccumulator(acc, 1000 / 60, () => steps++), 1);
});
