// The replay gate. The fixture's expectedHash is a literal recorded on one
// machine; this file asserts a fresh process on any machine reproduces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecording, recordStep, replay, replayState } from '../src/core/replay.js';
import { createState, step, SIM_VERSION, ACTIONS } from '../src/core/state.js';
import { hashState } from '../src/core/hash.js';
import { FIXTURE } from './fixtures/clears-wave-one.js';
import { FIXTURE as CANNON_LOST } from './fixtures/cannon-lost-and-respawn.js';
import { FIXTURE as EXTRA_CANNON } from './fixtures/extra-cannon-at-1500.js';
import { rackSnapshot, TUNING as T } from './helpers.js';
import { rackStartY } from '../src/core/rack.js';
import { aliensAlive } from '../src/core/state.js';
import { botActions } from './helpers.js';

test('replaying a 6,100-step recorded log against seed 42 reproduces the hash committed in the fixture', () => {
  assert.equal(FIXTURE.seed, 42);
  assert.equal(FIXTURE.steps, 6100);
  assert.equal(replay(FIXTURE), FIXTURE.expectedHash);
});

test('the first 3,000 steps of the extended fixture still reproduce the hash recorded before it was extended, so extending coverage changed no behaviour', () => {
  const prefix = { ...FIXTURE, steps: 3000, actions: FIXTURE.actions.filter((a) => a.step < 3000) };
  assert.equal(replay(prefix), '572e10166303ae15');
  assert.equal(FIXTURE.prefixHash3000, '572e10166303ae15');
});

test('the fixture crosses the wave-1 boundary: wave 2 begins on the recorded step with the score at exactly 990, a full rack and the wave-2 start height', () => {
  const upTo = (n) => replayState({ ...FIXTURE, steps: n, actions: FIXTURE.actions.filter((a) => a.step < n) });
  const before = upTo(FIXTURE.waveTwoAtStep - 1);
  assert.equal(before.wave, 1);
  assert.equal(before.score, 990, 'every alien of wave 1 is dead and no UFO was hit');
  assert.equal(aliensAlive(before), 0);
  const at = upTo(FIXTURE.waveTwoAtStep);
  assert.equal(at.wave, 2);
  assert.equal(at.score, FIXTURE.scoreAtWaveTwo);
  assert.equal(FIXTURE.scoreAtWaveTwo, 990);
  assert.equal(aliensAlive(at), 55, 'the rack reset');
  assert.equal(at.rack.originY, rackStartY(2), 'the wave-2 start height');
  assert.equal(at.rack.originY, rackStartY(1) + 8);
  const final = replayState(FIXTURE);
  assert.equal(final.wave, 2);
  assert.ok(final.step - FIXTURE.waveTwoAtStep >= 600, `${final.step - FIXTURE.waveTwoAtStep} steps into wave 2`);
  assert.ok(final.score > 990, 'wave 2 aliens were killed');
});

test('the committed fixture is real play: it carries FIRE actions, its simVersion is current, and it lists only steps on which an action occurred', () => {
  assert.equal(FIXTURE.simVersion, SIM_VERSION);
  assert.ok(FIXTURE.actions.length > 0);
  assert.ok(FIXTURE.actions.length < FIXTURE.steps, 'not one entry per step');
  assert.ok(FIXTURE.actions.some((a) => a.action === ACTIONS.FIRE && a.phase === 'down'));
  for (let i = 1; i < FIXTURE.actions.length; i++) {
    assert.ok(FIXTURE.actions[i].step >= FIXTURE.actions[i - 1].step, 'actions are in step order');
  }
  const final = replayState(FIXTURE);
  assert.ok(final.shotsFired > 0, 'shots were fired');
  assert.ok(final.score > 0, 'aliens were killed');
  assert.equal(final.step, 6100);
});

test('two runs with the same seed and an empty action log produce identical UFO appearance steps', () => {
  // { step, dir } for each appearance. `lives` is raised for the long run so
  // the unmanned cannon's deaths do not end the game before several UFOs have
  // appeared; the action log is empty in both runs.
  const appearances = (steps, lives) => {
    const s = createState(42);
    s.lives = lives;
    const out = [];
    let had = false;
    for (let i = 0; i < steps; i++) {
      step(s, []);
      if (s.ufo && !had) out.push({ step: s.step, dir: s.ufo.dir });
      had = !!s.ufo;
    }
    return out;
  };
  const a = appearances(8000, 3);
  const b = appearances(8000, 3);
  assert.ok(a.length >= 1, `expected a UFO within 8000 idle steps, saw ${a.length}`);
  assert.deepEqual(a, b);

  const c = appearances(20000, 1000);
  const d = appearances(20000, 1000);
  assert.ok(c.length >= 3, `expected several UFOs with the cannon kept alive, saw ${c.length}`);
  assert.deepEqual(c, d);

  const empty = { simVersion: SIM_VERSION, seed: 42, steps: 8000, actions: [] };
  assert.equal(replay(empty), replay(empty));
});

test('a fixture recorded against an older simVersion fails loudly rather than replaying and silently passing', () => {
  const stale = { ...FIXTURE, simVersion: FIXTURE.simVersion - 1 };
  assert.throws(() => replay(stale), (e) => {
    assert.match(e.message, new RegExp(`simVersion ${stale.simVersion}`));
    assert.match(e.message, new RegExp(`SIM_VERSION ${SIM_VERSION}`));
    return true;
  });
  const future = { ...FIXTURE, simVersion: FIXTURE.simVersion + 1 };
  assert.throws(() => replay(future), /simVersion/);
});

test('recording a bot playthrough and replaying it reproduces the live state hash exactly', () => {
  const live = createState(42);
  const rec = createRecording(42);
  const mem = { held: null, fireDown: false };
  for (let i = 0; i < 1500; i++) recordStep(rec, live, botActions(live, mem));
  assert.equal(rec.steps, 1500);
  assert.ok(rec.actions.length > 0 && rec.actions.length < rec.steps);
  assert.equal(replay(rec), hashState(live));
});

test('recordStep refuses a state whose step does not match the recording length, so a skipped step cannot be recorded as if it happened', () => {
  const s = createState(1);
  const rec = createRecording(1);
  step(s, []); // advance the state without recording it
  assert.throws(() => recordStep(rec, s, []), /step 1.*recording.*0/);
});

test('replay rejects an action at a step beyond the recording length, an unknown action name, an unknown phase and an unsorted log', () => {
  const base = { simVersion: SIM_VERSION, seed: 1, steps: 10 };
  assert.throws(() => replay({ ...base, actions: [{ step: 10, action: 'FIRE', phase: 'down' }] }), /step 10/);
  assert.throws(() => replay({ ...base, actions: [{ step: 1, action: 'JUMP', phase: 'down' }] }), /JUMP/);
  assert.throws(() => replay({ ...base, actions: [{ step: 1, action: 'FIRE', phase: 'held' }] }), /held/);
  assert.throws(() => replay({ ...base, actions: [
    { step: 2, action: 'FIRE', phase: 'down' },
    { step: 1, action: 'FIRE', phase: 'down' },
  ] }), /order/);
});

test('replaying with the seed changed by one produces a different hash from the fixture', () => {
  assert.notEqual(replay({ ...FIXTURE, seed: 43 }), FIXTURE.expectedHash);
});

// ---- the two short fixtures ----------------------------------------------------

const upTo = (fixture, n) => replayState({ ...fixture, steps: n, actions: fixture.actions.filter((a) => a.step < n) });

test('the cannon-lost fixture replays to its committed hash, and covers a death, the respawn, the next shot fired and the next rack movement', () => {
  assert.equal(replay(CANNON_LOST), CANNON_LOST.expectedHash);
  assert.equal(CANNON_LOST.simVersion, SIM_VERSION);
  const { cannonLostAtStep, respawnAtStep, fireAtStep, shotResolvedAtStep } = CANNON_LOST;

  const before = upTo(CANNON_LOST, cannonLostAtStep - 1);
  assert.equal(before.lives, 3);
  const lost = upTo(CANNON_LOST, cannonLostAtStep);
  assert.equal(lost.lives, 2, 'one cannon lost on the recorded step');
  assert.equal(lost.cannon.deadSteps, T.CANNON_DEATH_STEPS);
  assert.equal(lost.invaderShots.length, 0, 'invader shots cleared on the hit');
  assert.equal(respawnAtStep, cannonLostAtStep + T.CANNON_DEATH_STEPS);

  const respawned = upTo(CANNON_LOST, respawnAtStep);
  assert.equal(respawned.cannon.deadSteps, 0);
  assert.equal(respawned.cannon.x, T.CANNON_START_X, 'respawns at the start position');
  assert.equal(respawned.shotsFired, 0, 'nothing fired before the respawn');
  assert.equal(rackSnapshot(respawned), rackSnapshot(lost), 'the rack did not move while the cannon was dead');

  const fired = upTo(CANNON_LOST, fireAtStep + 1);
  assert.equal(fired.shotsFired, 1, 'the next shot is fired on the recorded step');
  assert.ok(fired.playerShot, 'and is in flight');
  assert.notEqual(rackSnapshot(fired), rackSnapshot(respawned), 'the rack moved after the respawn');

  const resolved = upTo(CANNON_LOST, shotResolvedAtStep);
  assert.equal(resolved.playerShot, null);
  const final = replayState(CANNON_LOST);
  assert.equal(final.lives, 2);
  assert.equal(final.gameOver, false);
  assert.ok(final.step >= shotResolvedAtStep + 10);
});

test('the extra-cannon fixture replays to its committed hash, and the score crossing 1500 awards one cannon on the recorded step and never again', () => {
  assert.equal(replay(EXTRA_CANNON), EXTRA_CANNON.expectedHash);
  assert.equal(EXTRA_CANNON.simVersion, SIM_VERSION);
  const { extraCannonAtStep, scoreBeforeAward } = EXTRA_CANNON;

  const before = upTo(EXTRA_CANNON, extraCannonAtStep - 1);
  assert.equal(before.score, scoreBeforeAward);
  assert.ok(before.score < 1500);
  assert.equal(before.lives, 3);
  assert.equal(before.extraCannonAwarded, false);

  const at = upTo(EXTRA_CANNON, extraCannonAtStep);
  assert.ok(at.score >= 1500, `score ${at.score}`);
  assert.equal(at.lives, 4, 'lives 3 -> 4 on the award step');
  assert.equal(at.extraCannonAwarded, true);

  const final = replayState(EXTRA_CANNON);
  assert.equal(final.lives, 4, 'not awarded twice, and no cannon lost afterwards');
  assert.ok(final.score > at.score, 'play continued after the award');
  assert.equal(final.gameOver, false);
});

