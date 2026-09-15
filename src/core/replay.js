// Recording and replay. A recording is { simVersion, seed, steps, actions },
// where actions holds one { step, action, phase } per action that occurred,
// in step order, and nothing for steps with no input. Replaying feeds each
// action at its recorded step from a fresh state built from the seed, and
// hashes the result. Because the core is pure, the hash is the whole proof.

import { createState, step, SIM_VERSION, ACTIONS } from './state.js';
import { hashState } from './hash.js';

const PHASES = Object.freeze(['down', 'up']);

export function createRecording(seed) {
  return { simVersion: SIM_VERSION, seed: seed >>> 0, steps: 0, actions: [] };
}

// Records `actions` against the recording's current step and advances the
// state by one step with them. Doing both here means the recording and the
// live state cannot drift apart: a state that has been stepped without being
// recorded is refused.
export function recordStep(recording, state, actions = []) {
  if (state.step !== recording.steps) {
    throw new Error(`recordStep: state is at step ${state.step} but the recording has ${recording.steps} steps`);
  }
  for (const a of actions) {
    recording.actions.push({ step: recording.steps, action: a.action, phase: a.phase });
  }
  recording.steps += 1;
  return step(state, actions);
}

function validate(recording) {
  const { simVersion, seed, steps, actions } = recording;
  if (simVersion !== SIM_VERSION) {
    throw new Error(
      `replay: recording simVersion ${simVersion} does not match SIM_VERSION ${SIM_VERSION}; `
      + 'the simulation changed since this recording was made. Re-record the fixture in the '
      + 'same commit as the change, or revert the change.',
    );
  }
  if (!Number.isInteger(seed)) throw new Error(`replay: seed ${seed} is not an integer`);
  if (!Number.isInteger(steps) || steps < 0) throw new Error(`replay: steps ${steps} is not a non-negative integer`);
  if (!Array.isArray(actions)) throw new Error('replay: actions is not an array');
  let last = -1;
  actions.forEach((a, i) => {
    if (!Number.isInteger(a.step) || a.step < 0 || a.step >= steps) {
      throw new Error(`replay: action ${i} at step ${a.step} is outside the recording's ${steps} steps`);
    }
    if (a.step < last) throw new Error(`replay: action ${i} at step ${a.step} is out of order after step ${last}`);
    last = a.step;
    if (!Object.hasOwn(ACTIONS, a.action)) throw new Error(`replay: action ${i} has unknown action ${a.action}`);
    if (!PHASES.includes(a.phase)) throw new Error(`replay: action ${i} has unknown phase ${a.phase}`);
  });
}

// Runs the recording from its seed and returns the final state.
export function replayState(recording) {
  validate(recording);
  const state = createState(recording.seed);
  const { actions, steps } = recording;
  let i = 0;
  for (let s = 0; s < steps; s++) {
    const batch = [];
    while (i < actions.length && actions[i].step === s) batch.push(actions[i++]);
    step(state, batch);
  }
  return state;
}

// Runs the recording and returns the final state's hash.
export function replay(recording) {
  return hashState(replayState(recording));
}
