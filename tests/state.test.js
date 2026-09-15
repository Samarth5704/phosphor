import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIM_VERSION, ACTIONS, createState, cloneState, step, aliensAlive,
} from '../src/core/state.js';
import { addScore } from '../src/core/scoring.js';
import { killAlien, alienIndex, rackStartY } from '../src/core/rack.js';
import { newGame, quiet, run, act, killAllBut, TUNING as T, RULES as R } from './helpers.js';

test('SIM_VERSION is a positive integer and is stamped on every new state', () => {
  assert.ok(Number.isInteger(SIM_VERSION) && SIM_VERSION > 0);
  assert.equal(newGame().version, SIM_VERSION);
});

test('step advances the step counter by exactly one and never reads a clock', () => {
  const s = newGame();
  assert.equal(s.step, 0);
  step(s, []);
  assert.equal(s.step, 1);
  run(s, 9);
  assert.equal(s.step, 10);
});

test('the extra cannon is awarded when score crosses 1500 and is not awarded again at 3000', () => {
  const s = newGame();
  s.score = 1490;
  addScore(s, 10);
  assert.equal(s.score, 1500);
  assert.equal(s.lives, 4);
  assert.equal(s.extraCannonAwarded, true);
  addScore(s, 1500);
  assert.equal(s.score, 3000);
  assert.equal(s.lives, 4);
  addScore(s, 300);
  assert.equal(s.lives, 4);
});

test('crossing 1500 with a single 20-point kill from 1490 still awards the extra cannon', () => {
  const s = newGame();
  s.score = 1490;
  killAlien(s, alienIndex(0, 2)); // middle row: 20 points
  assert.equal(s.score, 1510);
  assert.equal(s.lives, 4);
});

test('scores are 10 for the bottom two rows, 20 for the middle two and 30 for the top', () => {
  assert.deepEqual(R.ROW_SCORES, [10, 10, 20, 20, 30]);
  for (let row = 0; row < 5; row++) {
    const s = newGame();
    killAlien(s, alienIndex(3, row));
    assert.equal(s.score, R.ROW_SCORES[row], `row ${row}`);
    assert.equal(s.rack.aliens[alienIndex(3, row)].alive, false);
  }
});

test('the cannon moves 1px per step while MOVE_LEFT is held and stops at the left bound', () => {
  const s = quiet(newGame());
  s.cannon.x = T.CANNON_MIN_X + 3;
  step(s, [act(s, ACTIONS.MOVE_LEFT)]);
  assert.equal(s.cannon.x, T.CANNON_MIN_X + 2);
  run(s, 10);
  assert.equal(s.cannon.x, T.CANNON_MIN_X);
});

test('releasing MOVE_RIGHT stops the cannon on the next step and the right bound holds', () => {
  const s = quiet(newGame());
  const x0 = s.cannon.x;
  step(s, [act(s, ACTIONS.MOVE_RIGHT, 'down')]);
  run(s, 4);
  assert.equal(s.cannon.x, x0 + 5);
  step(s, [act(s, ACTIONS.MOVE_RIGHT, 'up')]);
  run(s, 5);
  assert.equal(s.cannon.x, x0 + 5);
  s.cannon.x = T.CANNON_MAX_X - 1;
  step(s, [act(s, ACTIONS.MOVE_RIGHT, 'down')]);
  run(s, 3);
  assert.equal(s.cannon.x, T.CANNON_MAX_X);
});

test('holding both directions leaves the cannon where it is', () => {
  const s = quiet(newGame());
  const x0 = s.cannon.x + 10;
  s.cannon.x = x0;
  step(s, [act(s, ACTIONS.MOVE_LEFT), act(s, ACTIONS.MOVE_RIGHT)]);
  run(s, 3);
  assert.equal(s.cannon.x, x0);
});

test('an unknown action name is ignored rather than throwing', () => {
  const s = quiet(newGame());
  assert.doesNotThrow(() => step(s, [{ step: 0, action: 'DANCE', phase: 'down' }]));
});

test('clearing the last alien starts the next wave with a full rack after the clear delay', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(2, 0)]);
  const a = s.rack.aliens[alienIndex(2, 0)];
  s.playerShot = { x: a.x + 4, y: a.y + T.ALIEN_H + 1 };
  step(s, []);
  assert.equal(aliensAlive(s), 0);
  assert.equal(s.waveClearTimer, T.WAVE_CLEAR_DELAY_STEPS);
  run(s, T.WAVE_CLEAR_DELAY_STEPS - 1);
  assert.equal(s.wave, 1);
  step(s, []);
  assert.equal(s.wave, 2);
  assert.equal(aliensAlive(s), 55);
  assert.equal(s.rack.originY, rackStartY(2));
  assert.equal(s.rack.dir, 1);
  assert.equal(s.invaderShots.length, 0);
  assert.equal(s.playerShot, null);
  assert.equal(s.freezeSteps, 0);
});

test('the state carries no decay field: persistence is derived by the renderer from aliens alive, never stored', () => {
  const s = newGame();
  assert.equal(Object.hasOwn(s, 'decay'), false);
  killAllBut(s, [0]);
  assert.equal(Object.hasOwn(s, 'decay'), false);
});

test('a game-over state ignores actions and changes nothing but the step counter', () => {
  const s = quiet(newGame());
  run(s, 30);
  s.gameOver = true;
  const before = cloneState(s);
  step(s, [act(s, ACTIONS.FIRE), act(s, ACTIONS.MOVE_LEFT)]);
  before.step += 1;
  assert.deepEqual(s, before);
});

test('a cloned state stepped 600 steps matches the original stepped 600 steps, so nothing lives outside the state object', () => {
  const script = (state, i) => {
    const out = [];
    if (i % 30 === 0) out.push(act(state, ACTIONS.FIRE, 'down'));
    if (i % 30 === 1) out.push(act(state, ACTIONS.FIRE, 'up'));
    if (i === 10) out.push(act(state, ACTIONS.MOVE_RIGHT, 'down'));
    if (i === 200) out.push(act(state, ACTIONS.MOVE_RIGHT, 'up'));
    if (i === 201) out.push(act(state, ACTIONS.MOVE_LEFT, 'down'));
    return out;
  };
  const a = createState(42);
  for (let i = 0; i < 100; i++) step(a, script(a, i));
  const b = cloneState(a);
  assert.notEqual(a, b);
  for (let i = 100; i < 700; i++) {
    step(a, script(a, i));
    step(b, script(b, i));
  }
  assert.ok(a.score > 0 || a.lives < 3, 'the script produced game events');
  assert.deepEqual(a, b);
});

test('a fresh state created after another has run 1000 steps evolves identically to one created first', () => {
  const first = createState(9);
  const other = createState(9);
  run(other, 1000);
  const late = createState(9);
  run(first, 500);
  run(late, 500);
  assert.deepEqual(first, late);
});

test('the state contains only plain data and typed arrays, so it survives structuredClone', () => {
  const s = newGame();
  run(s, 300);
  const walk = (v, path) => {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return;
    if (v instanceof Uint8Array) return;
    assert.ok(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype, `unexpected value at ${path}`);
    for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(s, 'state');
  assert.deepEqual(cloneState(s), s);
});

// Regression: cosmetic timers were decremented in the same step that created
// them, so a 16-step explosion marker was visible for only 15 steps.
test('an alien explosion marker created with ttl 16 is still present after 15 further steps and gone after the 16th', () => {
  const s = quiet(newGame());
  const a = s.rack.aliens[0];
  s.playerShot = { x: a.x + 3, y: a.y + T.ALIEN_H + 1 };
  step(s, []);
  assert.equal(s.explosions.length, 1);
  assert.equal(s.explosions[0].ttl, R.EXPLOSION_FREEZE_STEPS);
  run(s, R.EXPLOSION_FREEZE_STEPS - 1);
  assert.equal(s.explosions.length, 1);
  step(s, []);
  assert.equal(s.explosions.length, 0);
});

test('the seeded rng counter lives on the state and advances only when the simulation draws', () => {
  const s = quiet(newGame());
  assert.deepEqual(Object.keys(s.rng).sort(), ['counter', 'seed']);
  const c = s.rng.counter;
  run(s, 20); // quiet: nothing draws
  assert.equal(s.rng.counter, c);
});
