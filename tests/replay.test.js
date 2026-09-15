// The replay gate. The fixture's expectedHash is a literal recorded on one
// machine; this file asserts a fresh process on any machine reproduces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecording, recordStep, replay, replayState } from '../src/core/replay.js';
import { createState, step, SIM_VERSION, ACTIONS } from '../src/core/state.js';
import { hashState } from '../src/core/hash.js';
import { FIXTURE } from './fixtures/seed42-3000.js';
import { botActions } from './helpers.js';

test('replaying a 3,000-step recorded log against seed 42 reproduces the hash committed in the fixture', () => {
  assert.equal(FIXTURE.seed, 42);
  assert.equal(FIXTURE.steps, 3000);
  assert.equal(replay(FIXTURE), FIXTURE.expectedHash);
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
  assert.equal(final.step, 3000);
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
