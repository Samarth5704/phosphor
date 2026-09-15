// Drives the simulation from a recording ({ simVersion, seed, steps,
// actions }), feeding each recorded action at its recorded step, the same
// way src/core/replay.js does but one step at a time so a frame loop can
// interleave rendering. When the recording runs out it starts over from a
// fresh state, so the demo loops.
//
// Phase 3b has no keyboard: this is the only source of input.

import { createState, step, SIM_VERSION } from '../core/state.js';

export function createFixturePlayer(recording) {
  if (recording.simVersion !== SIM_VERSION) {
    throw new Error(`fixture simVersion ${recording.simVersion} does not match SIM_VERSION ${SIM_VERSION}`);
  }
  const player = {
    recording,
    state: null,
    cursor: 0,
    loops: 0,
    restart() {
      player.state = createState(recording.seed);
      player.cursor = 0;
    },
    // Advances exactly one simulation step with that step's recorded actions.
    next() {
      const { actions, steps } = recording;
      if (player.state.step >= steps) {
        player.restart();
        player.loops++;
      }
      const s = player.state.step;
      const batch = [];
      while (player.cursor < actions.length && actions[player.cursor].step === s) {
        batch.push(actions[player.cursor++]);
      }
      step(player.state, batch);
      return player.state;
    },
  };
  player.restart();
  return player;
}
