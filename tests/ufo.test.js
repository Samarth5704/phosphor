import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, createState } from '../src/core/state.js';
import { ufoAward } from '../src/core/ufo.js';
import { newGame, quiet, run, act, killAllBut, mkInvaderShot, TUNING as T, RULES as R } from './helpers.js';

// Fire the player's n-th shot straight into a UFO and return the points scored.
function scoreForShotNumber(n) {
  const s = quiet(newGame());
  s.shotsFired = n - 1;
  s.ufo = { x: 100, dir: 1 };
  s.cannon.x = 100;
  step(s, [act(s, 'FIRE')]);
  assert.equal(s.shotsFired, n);
  s.playerShot.y = T.UFO_Y + T.UFO_H + 1; // teleport the shot to just under the UFO
  s.ufo.x = 100; // keep the UFO over the shot regardless of drift
  const before = s.score;
  step(s, []);
  assert.equal(s.ufo, null, 'UFO destroyed');
  return s.score - before;
}

test("the UFO award on the player's 23rd fired shot is 300, and on the 38th is 300", () => {
  assert.equal(ufoAward(23), 300);
  assert.equal(ufoAward(38), 300);
  assert.equal(scoreForShotNumber(23), 300);
  assert.equal(scoreForShotNumber(38), 300);
});

test('the UFO award on the 1st fired shot is 50 and on the 4th is 150', () => {
  assert.equal(ufoAward(1), R.UFO_AWARD_CYCLE[0]);
  assert.equal(ufoAward(4), 150);
  assert.equal(scoreForShotNumber(1), 50);
  assert.equal(scoreForShotNumber(4), 150);
});

test('the award cycle repeats every 15 shots so shot 16 pays what shot 1 pays', () => {
  for (let n = 1; n <= 15; n++) assert.equal(ufoAward(n + 15), ufoAward(n));
});

test('a destroyed UFO leaves a score marker at its position for the tuned number of steps', () => {
  const s = quiet(newGame());
  s.shotsFired = 1; // the shot in flight is the player's first
  s.ufo = { x: 100, dir: 1 };
  s.playerShot = { x: 105, y: T.UFO_Y + T.UFO_H + 1 };
  step(s, []);
  assert.ok(s.ufoScore);
  assert.equal(s.ufoScore.value, 50);
  assert.equal(s.ufoScore.ttl, T.UFO_SCORE_DISPLAY_STEPS);
  run(s, T.UFO_SCORE_DISPLAY_STEPS);
  assert.equal(s.ufoScore, null);
});

test('the UFO does not appear while fewer than 8 aliens are alive', () => {
  const s = quiet(newGame());
  killAllBut(s, [0, 1, 2, 3, 4, 5, 6]); // 7 alive
  s.ufoTimer = 0;
  run(s, 5);
  assert.equal(s.ufo, null);
});

test('the UFO appears once its timer elapses with 8 aliens alive and leaves the field at the far side', () => {
  const s = quiet(newGame());
  killAllBut(s, [0, 1, 2, 3, 4, 5, 6, 7]);
  s.ufoTimer = 0;
  step(s, []);
  assert.ok(s.ufo, 'UFO spawned');
  assert.ok(s.ufoTimer > 0, 'next appearance scheduled');
  const startX = s.ufo.x;
  assert.ok(startX === -T.UFO_W || startX === R.FIELD_W, `starts fully off-screen, got ${startX}`);
  step(s, []);
  assert.equal(s.ufo.x, startX + s.ufo.dir * T.UFO_SPEED);
  const crossing = Math.ceil((R.FIELD_W + T.UFO_W) / T.UFO_SPEED) + 1;
  run(s, crossing);
  assert.equal(s.ufo, null, 'UFO left the field');
});

test('the UFO does not spawn while three invader shots exist, and spawns once a slot frees', () => {
  const s = quiet(newGame());
  s.ufoTimer = 0;
  s.invaderShots = [mkInvaderShot('rolling', 100, 100), mkInvaderShot('plunger', 120, 100), mkInvaderShot('squiggly', 140, 100)];
  step(s, []);
  assert.equal(s.ufo, null);
  s.invaderShots = [mkInvaderShot('rolling', 100, 100), mkInvaderShot('plunger', 120, 100)];
  step(s, []);
  assert.ok(s.ufo);
});

test('the UFO direction and interval come from the seeded rng, so two states with the same seed produce identical appearance steps', () => {
  const appearances = (seed) => {
    const s = quiet(createState(seed));
    s.ufoTimer = T.UFO_INTERVAL_STEPS; // restore the natural timer; invader fire stays off
    const out = [];
    let had = false;
    for (let i = 0; i < 4000; i++) {
      step(s, []);
      if (s.ufo && !had) out.push([s.step, s.ufo.dir]);
      had = Boolean(s.ufo);
    }
    return out;
  };
  const a = appearances(7);
  const b = appearances(7);
  assert.ok(a.length >= 2, `expected at least two appearances in 4000 steps, got ${a.length}`);
  assert.deepEqual(a, b);
});
