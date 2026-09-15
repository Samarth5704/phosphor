import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, aliensAlive } from '../src/core/state.js';
import { botActions, TUNING as T, RULES as R } from './helpers.js';

function checkInvariants(s) {
  const int = (v, what) => assert.ok(Number.isInteger(v), `${what} is not an integer: ${v}`);
  int(s.cannon.x, 'cannon.x');
  assert.ok(s.cannon.x >= T.CANNON_MIN_X && s.cannon.x <= T.CANNON_MAX_X, 'cannon inside its bounds');
  int(s.rack.originX, 'originX');
  int(s.rack.originY, 'originY');
  for (const a of s.rack.aliens) {
    int(a.x, 'alien.x');
    int(a.y, 'alien.y');
    if (a.alive) assert.ok(a.x >= 0 && a.x + T.ALIEN_W_BOTTOM <= R.FIELD_W, 'alien inside the field');
  }
  if (s.playerShot) { int(s.playerShot.x, 'shot.x'); int(s.playerShot.y, 'shot.y'); }
  for (const sh of s.invaderShots) { int(sh.x, 'invader shot x'); int(sh.y, 'invader shot y'); }
  assert.ok(s.invaderShots.length <= R.INVADER_SHOT_SLOTS, 'at most three invader shots');
  assert.ok(!(s.ufo && s.invaderShots.some((sh) => sh.type === R.UFO_SHARES_SLOT_WITH)), 'UFO and squiggly never share the screen');
  const types = s.invaderShots.map((sh) => sh.type);
  assert.equal(new Set(types).size, types.length, 'one missile per type');
  if (s.ufo) int(s.ufo.x, 'ufo.x');
  int(s.rng.counter, 'rng.counter');
}

test('a bot that tracks the lowest alien and sidesteps shots clears wave 1 for exactly 990 points with every position an integer on every step', () => {
  const s = createState(42);
  const mem = { held: null, fireDown: false };
  let waveOneClearedAt = -1;
  for (let i = 0; i < 20000 && s.wave < 2 && !s.gameOver; i++) {
    step(s, botActions(s, mem));
    checkInvariants(s);
    if (s.wave === 2) waveOneClearedAt = s.step;
  }
  assert.equal(s.gameOver, false);
  assert.equal(s.wave, 2, 'wave 1 cleared');
  assert.ok(waveOneClearedAt > 0);
  assert.equal(aliensAlive(s), 55, 'wave 2 starts with a full rack');
  // 22 aliens x 10 + 22 x 20 + 11 x 30 = 990; any UFO kill would push it above this.
  assert.equal(s.score, 990);
  assert.ok(s.shotsFired >= 55, `at least one shot per alien, fired ${s.shotsFired}`);
});

test('the same bot against the same seed reaches wave 2 on the identical step twice', () => {
  const play = () => {
    const s = createState(42);
    const mem = { held: null, fireDown: false };
    for (let i = 0; i < 20000 && s.wave < 2 && !s.gameOver; i++) step(s, botActions(s, mem));
    return s.step;
  };
  const a = play();
  const b = play();
  assert.equal(a, b);
});
