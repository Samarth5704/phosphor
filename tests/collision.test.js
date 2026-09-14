import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps } from '../src/core/collision.js';
import { step } from '../src/core/state.js';
import { alienIndex } from '../src/core/rack.js';
import { newGame, quiet, killAllBut, TUNING as T } from './helpers.js';

const alien = { x: 100, y: 100, w: 12, h: 8 }; // occupies x 100..111, y 100..107

test('a shot overlapping an alien by 1px at its left edge registers a hit', () => {
  assert.equal(overlaps({ x: 100, y: 104, w: 1, h: 4 }, alien), true);
  // and through the simulation, not just the predicate
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(3, 2)]);
  const a = s.rack.aliens[alienIndex(3, 2)];
  s.playerShot = { x: a.x, y: a.y + T.ALIEN_H + 1 }; // shot's single column is the alien's left edge column
  step(s, []);
  assert.equal(a.alive, false);
  assert.equal(s.playerShot, null);
});

test('a shot 1px to the left of an alien left edge misses', () => {
  assert.equal(overlaps({ x: 99, y: 104, w: 1, h: 4 }, alien), false);
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(3, 2)]);
  const a = s.rack.aliens[alienIndex(3, 2)];
  s.playerShot = { x: a.x - 1, y: a.y + T.ALIEN_H + 1 };
  step(s, []);
  assert.equal(a.alive, true);
  assert.ok(s.playerShot);
});

test('a shot overlapping an alien by 1px at its right edge registers a hit', () => {
  assert.equal(overlaps({ x: 111, y: 104, w: 1, h: 4 }, alien), true);
  assert.equal(overlaps({ x: 112, y: 104, w: 1, h: 4 }, alien), false);
});

test('boxes that share an edge but no area do not overlap', () => {
  assert.equal(overlaps({ x: 100, y: 108, w: 4, h: 4 }, alien), false, 'touching below');
  assert.equal(overlaps({ x: 100, y: 96, w: 4, h: 4 }, alien), false, 'touching above');
  assert.equal(overlaps({ x: 112, y: 100, w: 4, h: 4 }, alien), false, 'touching right');
  assert.equal(overlaps({ x: 96, y: 100, w: 4, h: 4 }, alien), false, 'touching left');
});

test('a box fully inside another overlaps, and a box straddling a corner overlaps by 1px in each axis', () => {
  assert.equal(overlaps({ x: 103, y: 102, w: 2, h: 2 }, alien), true);
  assert.equal(overlaps({ x: 111, y: 107, w: 4, h: 4 }, alien), true, 'bottom-right corner pixel');
  assert.equal(overlaps({ x: 97, y: 97, w: 4, h: 4 }, alien), true, 'top-left corner pixel');
});

test('overlap is symmetric', () => {
  const a = { x: 5, y: 5, w: 10, h: 10 };
  const b = { x: 14, y: 14, w: 3, h: 3 };
  assert.equal(overlaps(a, b), overlaps(b, a));
  assert.equal(overlaps(a, b), true);
});

test('a hit registers at the first overlapping pixel of the sweep so the shot never passes the target bottom edge', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(3, 2)]);
  const a = s.rack.aliens[alienIndex(3, 2)];
  // 3px of the 4px sweep lie beyond the alien's bottom edge; the hit must still be taken
  s.playerShot = { x: a.x + 5, y: a.y + T.ALIEN_H };
  step(s, []);
  assert.equal(a.alive, false);
  assert.equal(s.explosions.length, 1);
  assert.equal(s.explosions[0].y, a.y);
});
