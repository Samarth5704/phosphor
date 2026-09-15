// Phase 3b: the sprite bitmaps. The important test is the coupling between
// each alien type's picture and its hitbox in TUNING: if the two drift, a
// shot visibly misses yet kills (or visibly touches yet passes), and that
// phantom hit gets debugged in collision.js, which is the wrong file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/core/constants.js';
import { RULES } from '../src/core/rules.js';
import { alienWidth } from '../src/core/rack.js';
import {
  ALIEN_TOP, ALIEN_MIDDLE, ALIEN_BOTTOM, ALIEN_EXPLOSION, CANNON, CANNON_EXPLOSION,
  PLAYER_SHOT, INVADER_SHOTS, UFO, DIGITS, DIGIT_ADVANCE, ALL_SPRITES, alienSpriteForRow,
} from '../src/ui/sprites.js';
import { SHOT_TYPES } from '../src/core/shots.js';

function everySprite() {
  const out = [];
  const walk = (v, name) => {
    if (v && v.pixels instanceof Uint8Array) out.push({ name, sprite: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${name}[${i}]`));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${name}.${k}`);
  };
  walk(ALL_SPRITES, 'sprites');
  return out;
}

test("each alien sprite's width equals that type's hitbox width in TUNING, and its height equals ALIEN_H", () => {
  const pairs = [
    ['ALIEN_BOTTOM', ALIEN_BOTTOM, TUNING.ALIEN_W_BOTTOM],
    ['ALIEN_MIDDLE', ALIEN_MIDDLE, TUNING.ALIEN_W_MIDDLE],
    ['ALIEN_TOP', ALIEN_TOP, TUNING.ALIEN_W_TOP],
  ];
  for (const [name, frames, w] of pairs) {
    assert.equal(frames.length, 2, `${name} has two animation frames`);
    frames.forEach((f, i) => {
      assert.equal(f.w, w, `${name}[${i}] is ${f.w} wide, hitbox is ${w}`);
      assert.equal(f.h, TUNING.ALIEN_H, `${name}[${i}] is ${f.h} tall, hitbox is ${TUNING.ALIEN_H}`);
    });
  }
});

test('alienSpriteForRow picks the sprite whose width is alienWidth(row) for every rack row, so the row-to-type mapping cannot drift from rack.js', () => {
  for (let row = 0; row < RULES.RACK_ROWS; row++) {
    for (const f of alienSpriteForRow(row)) assert.equal(f.w, alienWidth(row), `row ${row}`);
  }
});

test('an alien sprite lights its leftmost and rightmost columns, so its visible edge is its hitbox edge', () => {
  for (const [name, frames] of [['bottom', ALIEN_BOTTOM], ['middle', ALIEN_MIDDLE], ['top', ALIEN_TOP]]) {
    const anyLit = (f, x) => { for (let y = 0; y < f.h; y++) if (f.pixels[y * f.w + x]) return true; return false; };
    for (const f of frames) {
      assert.ok(anyLit(f, 0), `${name}: column 0 dark`);
      assert.ok(anyLit(f, f.w - 1), `${name}: column ${f.w - 1} dark`);
    }
  }
});

test('the cannon, player shot, invader shots and UFO sprites match their TUNING box sizes', () => {
  assert.deepEqual([CANNON.w, CANNON.h], [TUNING.CANNON_W, TUNING.CANNON_H]);
  for (const f of CANNON_EXPLOSION) assert.deepEqual([f.w, f.h], [TUNING.CANNON_W, TUNING.CANNON_H]);
  assert.deepEqual([PLAYER_SHOT.w, PLAYER_SHOT.h], [TUNING.PLAYER_SHOT_W, TUNING.PLAYER_SHOT_H]);
  assert.deepEqual([UFO.w, UFO.h], [TUNING.UFO_W, TUNING.UFO_H]);
  assert.deepEqual(Object.keys(INVADER_SHOTS).sort(), [...SHOT_TYPES].sort(), 'one sprite set per shot type');
  for (const type of SHOT_TYPES) {
    for (const f of INVADER_SHOTS[type]) {
      assert.deepEqual([f.w, f.h], [TUNING.INVADER_SHOT_W, TUNING.INVADER_SHOT_H], type);
    }
  }
  for (const f of ALIEN_EXPLOSION) assert.deepEqual([f.w, f.h], [TUNING.ALIEN_W_BOTTOM, TUNING.ALIEN_H]);
});

test('every sprite is rectangular, made only of space and #, compiled to a Uint8Array of w*h with a 1 exactly where the # is, and lit somewhere', () => {
  const all = everySprite();
  assert.ok(all.length >= 20, `${all.length} sprites`);
  for (const { name, sprite } of all) {
    const { w, h, rows, pixels } = sprite;
    assert.equal(rows.length, h, name);
    assert.equal(pixels.length, w * h, name);
    let lit = 0;
    rows.forEach((r, y) => {
      assert.equal(r.length, w, `${name} row ${y} is ${r.length} wide, not ${w}`);
      assert.match(r, /^[ #]*$/, `${name} row ${y} has a character other than space or #`);
      for (let x = 0; x < w; x++) {
        assert.equal(pixels[y * w + x], r[x] === '#' ? 1 : 0, `${name} (${x}, ${y})`);
        lit += pixels[y * w + x];
      }
    });
    assert.ok(lit > 0, `${name} is entirely dark`);
  }
});

test('the ten digits are 3x5, distinct from each other, and the advance leaves a 1px gap', () => {
  assert.equal(DIGITS.length, 10);
  const seen = new Set();
  for (const d of DIGITS) {
    assert.deepEqual([d.w, d.h], [3, 5]);
    seen.add(d.rows.join('/'));
  }
  assert.equal(seen.size, 10);
  assert.equal(DIGIT_ADVANCE, 4);
});

test('the two frames of each animated sprite differ, so the animation is visible', () => {
  const animated = [ALIEN_TOP, ALIEN_MIDDLE, ALIEN_BOTTOM, ALIEN_EXPLOSION, CANNON_EXPLOSION, ...Object.values(INVADER_SHOTS)];
  for (const frames of animated) {
    assert.notDeepEqual(frames[0].rows, frames[1].rows);
  }
});
