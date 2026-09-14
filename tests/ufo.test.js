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

test('the UFO does not spawn while a squiggly is in flight even if it is the only missile, and spawns once the squiggly is gone', () => {
  assert.equal(R.UFO_SHARES_SLOT_WITH, 'squiggly');
  const s = quiet(newGame());
  s.ufoTimer = 0;
  s.invaderShots = [mkInvaderShot('squiggly', 140, 100)];
  step(s, []);
  assert.equal(s.ufo, null);
  s.invaderShots = [mkInvaderShot('rolling', 100, 100), mkInvaderShot('plunger', 120, 100)];
  step(s, []);
  assert.ok(s.ufo, 'two non-squiggly missiles do not hold the slot');
});

// A: consequence of the cycle, not a bug. Index 7 of the 15-entry cycle is
// 300 and (8 - 1) mod 15 = 7. The sources say "23rd" only because no UFO is on
// screen early enough in a wave for the 8th shot to reach one.
test('the 8th fired shot awards 300, as a consequence of the cycle rather than a bug', () => {
  assert.equal(ufoAward(8), 300);
  assert.equal(scoreForShotNumber(8), 300);
  assert.equal(R.UFO_AWARD_CYCLE[(8 - 1) % 15], 300);
  assert.equal(ufoAward(7), 50);
  assert.equal(ufoAward(9), 100);
});

test('the 8th shot cannot reach a UFO in a fresh wave because the interval exceeds the time to fire eight shots', () => {
  // Eight shots at one shot per full field crossing take far fewer steps than the UFO interval.
  const stepsPerShot = Math.ceil(T.CANNON_Y / T.PLAYER_SHOT_SPEED) + 1;
  assert.ok(8 * stepsPerShot < T.UFO_INTERVAL_STEPS, `8 shots need ${8 * stepsPerShot} steps; UFO waits ${T.UFO_INTERVAL_STEPS}`);
  const s = quiet(newGame());
  s.ufoTimer = T.UFO_INTERVAL_STEPS; // natural timer, invader fire off
  let fired = 0;
  for (let i = 0; i < T.UFO_INTERVAL_STEPS && fired < 8; i++) {
    const actions = s.playerShot ? [] : [act(s, 'FIRE')];
    if (actions.length) fired++;
    step(s, actions);
    assert.equal(s.ufo, null, `no UFO by step ${s.step}`);
  }
  assert.equal(fired, 8);
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
