import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../src/core/serialise.js';
import { hashString, hashValue, hashState, fnv1a32 } from '../src/core/hash.js';
import { createState, step } from '../src/core/state.js';
import { newGame, run } from './helpers.js';

// ---- the four reasons JSON.stringify is the wrong hash input ----------------

test('two states differing only in the order their keys were assigned hash identically', () => {
  const a = { x: 1, y: 2, nested: { p: 3, q: 4 } };
  const b = { nested: { q: 4, p: 3 }, y: 2, x: 1 };
  assert.notEqual(JSON.stringify(a), JSON.stringify(b), 'precondition: JSON.stringify sees them as different');
  assert.equal(canonical(a), canonical(b));
  assert.equal(hashValue(a), hashValue(b));
});

test('a Uint8Array encodes its length and bytes, so a shield with one pixel cleared hashes differently from the intact one', () => {
  const s = newGame();
  const before = hashState(s);
  const k = 4 * s.shields[0].w; // row 4, column 0: solid in the bitmap
  assert.equal(s.shields[0].pixels[k], 1, 'precondition: the pixel is set');
  s.shields[0].pixels[k] = 0;
  assert.notEqual(hashState(s), before);
});

test('a Uint8Array does not encode as an object with numeric string keys', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const asObject = { 0: 1, 1: 2, 2: 3 };
  assert.equal(JSON.stringify(bytes), JSON.stringify(asObject), 'precondition: JSON.stringify conflates them');
  assert.notEqual(canonical(bytes), canonical(asObject));
});

test('a state field set to undefined hashes differently from the same state with that field deleted', () => {
  const withUndefined = { a: 1, b: undefined };
  const deleted = { a: 1 };
  assert.equal(JSON.stringify(withUndefined), JSON.stringify(deleted), 'precondition: JSON.stringify drops the field');
  assert.notEqual(canonical(withUndefined), canonical(deleted));
  assert.notEqual(hashValue(withUndefined), hashValue(deleted));
});

test('-0 hashes differently from 0', () => {
  assert.equal(JSON.stringify(-0), JSON.stringify(0), 'precondition: JSON.stringify conflates them');
  assert.notEqual(canonical(-0), canonical(0));
  assert.notEqual(hashValue({ x: -0 }), hashValue({ x: 0 }));
});

// ---- strictness --------------------------------------------------------------

test('a state containing a non-integer number fails the serialiser, because every simulation field is an integer', () => {
  assert.throws(() => canonical({ cannon: { x: 1.5 } }), /non-integer.*cannon\.x/);
  assert.throws(() => canonical([1, 2, 0.1]), /non-integer.*\[2\]/);
  assert.throws(() => canonical(NaN), /non-integer/);
  assert.throws(() => canonical(Infinity), /non-integer/);
});

test('the serialiser rejects bigints, symbols, functions, Dates, Maps, Sets and non-Uint8 typed arrays rather than guessing an encoding', () => {
  assert.throws(() => canonical(1n), /unsupported/);
  assert.throws(() => canonical(Symbol('s')), /unsupported/);
  assert.throws(() => canonical(() => 1), /unsupported/);
  assert.throws(() => canonical(new Map()), /unsupported/);
  assert.throws(() => canonical(new Set()), /unsupported/);
  assert.throws(() => canonical(new Int8Array(1)), /unsupported/);
  assert.throws(() => canonical(new Float32Array(1)), /unsupported/);
  assert.throws(() => canonical({ when: new (class Clock {})() }), /unsupported.*when/);
});

test('the serialiser rejects a circular structure instead of recursing forever', () => {
  const a = { name: 'a' };
  a.self = a;
  assert.throws(() => canonical(a), /circular/);
});

test('strings are length-prefixed, so a string containing a separator cannot be confused with structure', () => {
  assert.notEqual(canonical({ k: 'a:b' }), canonical({ k: 'a', ':': 'b' }));
  assert.notEqual(canonical(['a', 'b']), canonical(['a,b']));
  assert.notEqual(canonical({ '': 1 }), canonical({}));
});

test('an object with a null prototype encodes the same as a plain object with the same keys', () => {
  const bare = Object.create(null);
  bare.x = 1;
  assert.equal(canonical(bare), canonical({ x: 1 }));
});

// ---- the hash ----------------------------------------------------------------

test('fnv1a32 matches the published FNV-1a test vectors', () => {
  // From the FNV reference implementation's test suite (32-bit, FNV-1a).
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
});

test('hashString returns 16 lowercase hex characters and is stable for the same input', () => {
  const h = hashString('phosphor');
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(h, hashString('phosphor'));
  assert.notEqual(h, hashString('phosphor '));
});

test('a state differing only in the rng draw counter hashes differently, since draw count is what makes replays reproduce', () => {
  const a = createState(7);
  const b = createState(7);
  assert.equal(hashState(a), hashState(b));
  b.rng.counter += 1;
  assert.notEqual(hashState(a), hashState(b));
});

test('a fresh state hashes cleanly and the hash changes after one step', () => {
  const s = newGame(3);
  const h0 = hashState(s);
  assert.match(h0, /^[0-9a-f]{16}$/);
  step(s, []);
  assert.notEqual(hashState(s), h0);
});

test('a state after 500 steps of real play serialises without a non-integer anywhere in it', () => {
  const s = run(newGame(42), 500);
  assert.doesNotThrow(() => canonical(s));
});
