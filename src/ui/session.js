// One render session: the simulation (driven by a recording), the intensity
// buffer, the accumulator and the motion preference, wired together without
// any DOM so the whole per-step pipeline runs under node --test. main.js
// adds the canvas and requestAnimationFrame around it.
//
// Per simulation step: advance the state, multiply the buffer down by the
// decay for the aliens now alive, then write the new geometry over it.

import { aliensAlive } from '../core/state.js';
import { createFixturePlayer } from './fixture-player.js';
import { createIntensityBuffer, decayBuffer } from './intensity.js';
import { writeScene } from './scene.js';
import { createAccumulator, advanceAccumulator } from './loop.js';
import { effectiveDecay, effectiveHalfLife } from './motion.js';

export function createSession({ recording, motion = { reduced: false } }) {
  const player = createFixturePlayer(recording);
  const buffer = createIntensityBuffer();
  const acc = createAccumulator();
  const timing = { decayMs: 0, stepMs: 0 };

  function stepOnce(clock) {
    player.next();
    const t0 = clock ? clock() : 0;
    decayBuffer(buffer, effectiveDecay(aliensAlive(player.state), motion.reduced));
    const t1 = clock ? clock() : 0;
    writeScene(buffer, player.state);
    timing.decayMs += t1 - t0;
  }

  // Write the initial frame so the first paint is not black.
  writeScene(buffer, player.state);

  return {
    buffer,
    player,
    motion,
    timing,
    get state() { return player.state; },
    halfLife() { return effectiveHalfLife(aliensAlive(player.state), motion.reduced); },
    decay() { return effectiveDecay(aliensAlive(player.state), motion.reduced); },
    // Runs the steps owed for `elapsedMs` of wall time. `clock` is optional
    // and only feeds the timing counters.
    advance(elapsedMs, clock) {
      timing.decayMs = 0;
      return advanceAccumulator(acc, elapsedMs, () => stepOnce(clock));
    },
    // Exactly n steps, ignoring the accumulator. Tests use this.
    stepN(n, clock) {
      timing.decayMs = 0;
      for (let i = 0; i < n; i++) stepOnce(clock);
    },
  };
}
