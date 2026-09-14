import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, nextUint32, nextInt } from '../src/core/rng.js';

test('the same seed produces the same first 100 draws', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  for (let i = 0; i < 100; i++) assert.equal(nextUint32(a), nextUint32(b));
});

test('seeds 1 and 2 produce different first draws', () => {
  assert.notEqual(nextUint32(createRng(1)), nextUint32(createRng(2)));
});

test('each draw advances the counter by exactly one', () => {
  const r = createRng(9);
  assert.equal(r.counter, 0);
  nextUint32(r);
  assert.equal(r.counter, 1);
  nextInt(r, 10);
  assert.equal(r.counter, 2);
});

test('a cloned rng continues with the identical sequence, so seed and counter are the only state', () => {
  const a = createRng(77);
  for (let i = 0; i < 50; i++) nextUint32(a);
  const b = structuredClone(a);
  for (let i = 0; i < 50; i++) assert.equal(nextUint32(a), nextUint32(b));
});

test('nextInt(rng, 7) stays within 0..6 over 10,000 draws and hits every value', () => {
  const r = createRng(5);
  const seen = new Set();
  for (let i = 0; i < 10000; i++) {
    const v = nextInt(r, 7);
    assert.ok(v >= 0 && v < 7 && Number.isInteger(v), `out of range: ${v}`);
    seen.add(v);
  }
  assert.equal(seen.size, 7);
});

test('the rng holds nothing but seed and counter', () => {
  assert.deepEqual(Object.keys(createRng(3)).sort(), ['counter', 'seed']);
});

test('a seed above 2^32 is reduced to an unsigned 32-bit value rather than producing NaN', () => {
  const r = createRng(2 ** 40 + 5);
  assert.equal(r.seed, 5);
  assert.ok(Number.isInteger(nextUint32(r)));
});
