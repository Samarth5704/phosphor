// Phase 3b: the whole per-step pipeline (fixture -> simulation -> decay ->
// scene) run headless, and the scene writer against known geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/ui/session.js';
import { createFixturePlayer } from '../src/ui/fixture-player.js';
import { writeScene } from '../src/ui/scene.js';
import { createIntensityBuffer, litCellCount, isClear, FIELD_W } from '../src/ui/intensity.js';
import { MAX_CATCHUP_STEPS } from '../src/ui/loop.js';
import { FIXTURE } from './fixtures/clears-wave-one.js';
import { replayState } from '../src/core/replay.js';
import { hashState } from '../src/core/hash.js';
import { createState, aliensAlive } from '../src/core/state.js';
import { alienBox } from '../src/core/rack.js';
import { TUNING } from '../src/core/constants.js';
import { HALF_LIFE_REDUCED_MOTION, halfLifeFor } from '../src/tokens.js';
import { rackSnapshot, killAllBut } from './helpers.js';
import { CANNON } from '../src/ui/sprites.js';

const PREFIX = 900; // steps of the fixture the pipeline tests run

function prefix(recording, steps) {
  return { ...recording, steps, actions: recording.actions.filter((a) => a.step < steps) };
}

test('the fixture player fed one step at a time reproduces the same state hash as replayState over the same prefix', () => {
  const n = 1500;
  const p = createFixturePlayer(FIXTURE);
  for (let i = 0; i < n; i++) p.next();
  assert.equal(p.state.step, n);
  assert.equal(hashState(p.state), hashState(replayState(prefix(FIXTURE, n))));
});

test('the fixture player refuses a recording whose simVersion is not the current one', () => {
  assert.throws(() => createFixturePlayer({ ...FIXTURE, simVersion: FIXTURE.simVersion + 1 }), /simVersion/);
});

test('when the recording is exhausted the player starts over from a fresh state at step 0 rather than stepping past the end', () => {
  const short = prefix(FIXTURE, 20);
  const p = createFixturePlayer(short);
  for (let i = 0; i < 20; i++) p.next();
  assert.equal(p.state.step, 20);
  p.next();
  assert.equal(p.state.step, 1);
  assert.equal(p.loops, 1);
  assert.equal(hashState(p.state), hashState(replayState(prefix(FIXTURE, 1))), 'the replayed step 0 fed its recorded action');
});

test('with reduced motion set, the half-life is the pinned value while the step count, score and rack positions for the fixture prefix are unchanged', () => {
  const normal = createSession({ recording: FIXTURE, motion: { reduced: false } });
  const reduced = createSession({ recording: FIXTURE, motion: { reduced: true } });
  normal.stepN(PREFIX);
  reduced.stepN(PREFIX);
  assert.equal(reduced.halfLife(), HALF_LIFE_REDUCED_MOTION);
  assert.equal(normal.halfLife(), halfLifeFor(aliensAlive(normal.state)));
  assert.ok(reduced.halfLife() < normal.halfLife(), 'the prefix has enough aliens alive for the two to differ');
  assert.equal(reduced.state.step, normal.state.step);
  assert.equal(reduced.state.step, PREFIX);
  assert.equal(reduced.state.score, normal.state.score);
  assert.ok(normal.state.score > 0, 'the prefix scored');
  assert.equal(rackSnapshot(reduced.state), rackSnapshot(normal.state));
  assert.equal(hashState(reduced.state), hashState(normal.state), 'the whole state, not just the fields named');
  // Both match the pure replay: the renderer never touched the simulation.
  assert.equal(hashState(normal.state), hashState(replayState(prefix(FIXTURE, PREFIX))));
});

test('flipping the motion preference mid-run changes the half-life on the next step and nothing in the state', () => {
  const motion = { reduced: false };
  const s = createSession({ recording: FIXTURE, motion });
  s.stepN(300);
  const before = hashState(s.state);
  assert.notEqual(s.halfLife(), HALF_LIFE_REDUCED_MOTION);
  motion.reduced = true;
  assert.equal(s.halfLife(), HALF_LIFE_REDUCED_MOTION);
  assert.equal(hashState(s.state), before);
  s.stepN(1);
  assert.equal(s.halfLife(), HALF_LIFE_REDUCED_MOTION);
});

test('advancing the session by 30 seconds of elapsed time takes MAX_CATCHUP_MS worth of steps (15) and no more', () => {
  const s = createSession({ recording: FIXTURE });
  const taken = s.advance(30000);
  assert.equal(taken, MAX_CATCHUP_STEPS);
  assert.equal(s.state.step, 15);
});

test('the buffer after the prefix has trails: more lit cells than the bare scene has, and none above 1.0', () => {
  const s = createSession({ recording: FIXTURE });
  s.stepN(PREFIX);
  const bare = createIntensityBuffer();
  writeScene(bare, s.state);
  assert.ok(litCellCount(s.buffer) > litCellCount(bare), `${litCellCount(s.buffer)} lit with persistence vs ${litCellCount(bare)} bare`);
  for (let i = 0; i < s.buffer.length; i++) assert.ok(s.buffer[i] <= 1, `cell ${i}`);
});

test('the scene lights every living alien inside its hitbox and nothing of a dead one, so what is drawn is what can be hit', () => {
  const state = createState(7);
  killAllBut(state, [0, 5, 30, 54]);
  const b = createIntensityBuffer();
  writeScene(b, state);
  state.rack.aliens.forEach((a, i) => {
    const box = alienBox(a, i);
    let lit = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) lit += b[y * FIELD_W + x] > 0 ? 1 : 0;
    }
    if (a.alive) assert.ok(lit > 0, `alien ${i} alive but dark`);
    else assert.equal(lit, 0, `alien ${i} dead but lit`);
    // Nothing spills outside the box's columns on the alien's rows.
    for (let y = box.y; y < box.y + box.h; y++) {
      assert.equal(b[y * FIELD_W + box.x - 1], 0, `alien ${i} lit left of its box`);
      assert.equal(b[y * FIELD_W + box.x + box.w], 0, `alien ${i} lit right of its box`);
    }
  });
});

test('the cannon is drawn at cannon.x on CANNON_Y while alive and not drawn while its death timer runs', () => {
  const state = createState(3);
  const b = createIntensityBuffer();
  writeScene(b, state);
  const k = TUNING.CANNON_Y * FIELD_W + state.cannon.x;
  // Row 0 of the sprite has its single lit pixel at the centre column.
  assert.equal(b[k + Math.floor(CANNON.w / 2)], 1);
  assert.equal(b[(TUNING.CANNON_Y + 7) * FIELD_W + state.cannon.x], 1);
  state.cannon.deadSteps = 10;
  state.explosions = [];
  const dead = createIntensityBuffer();
  writeScene(dead, state);
  for (let y = TUNING.CANNON_Y; y < TUNING.CANNON_Y + TUNING.CANNON_H; y++) {
    for (let x = state.cannon.x; x < state.cannon.x + TUNING.CANNON_W; x++) assert.equal(dead[y * FIELD_W + x], 0);
  }
});

test('the scene draws the shields from the state pixels, so an eroded cell goes dark on the next frame', () => {
  const state = createState(3);
  const shield = state.shields[0];
  const b = createIntensityBuffer();
  writeScene(b, state);
  assert.equal(b[(shield.y + 6) * FIELD_W + shield.x + 6], 1, 'a solid interior cell');
  assert.equal(b[shield.y * FIELD_W + shield.x], 0, 'the bevelled corner is dark');
  shield.pixels[6 * shield.w + 6] = 0;
  const after = createIntensityBuffer();
  writeScene(after, state);
  assert.equal(after[(shield.y + 6) * FIELD_W + shield.x + 6], 0);
});

test('a new session starts with the initial frame already written, not a black field', () => {
  const s = createSession({ recording: FIXTURE });
  assert.ok(!isClear(s.buffer));
  assert.ok(litCellCount(s.buffer) > 1000);
});
