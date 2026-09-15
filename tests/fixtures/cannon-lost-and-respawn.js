// Replay fixture: the cannon is destroyed and play continues after the
// respawn. The cannon stands still under invader fire until it is hit
// (cannonLostAtStep), waits out CANNON_DEATH_STEPS (respawnAtStep), then FIRE
// is pressed on the first live step after the respawn (fireAtStep); the
// recording runs until that shot has resolved (shotResolvedAtStep) plus ten
// more steps, so the next shot fired and the rack movement after a respawn are
// both inside the hash. tests/replay.test.js pins each of those steps.
//
// There is deliberately no script, flag or environment variable that rewrites
// expectedHash. If this test fails, the simulation's behaviour changed. A
// human decides whether that change was intended; if it was, bump SIM_VERSION
// in src/core/state.js, re-record this file with a short script calling
// createRecording/recordStep, and commit both in the same change. If it was
// not intended, the failure is the bug report.
//
// actions holds only the steps on which an action occurred; a step absent
// from the list had no input.
//
// History: recorded at simVersion 2, 1529 steps, hash b0abcb00909000ad.

export const FIXTURE = Object.freeze({
  simVersion: 2,
  seed: 42,
  steps: 1529,
  expectedHash: 'b0abcb00909000ad',
  cannonLostAtStep: 1432,
  respawnAtStep: 1492,
  fireAtStep: 1493,
  shotResolvedAtStep: 1519,
  actions: Object.freeze([
    { step: 1493, action: 'FIRE', phase: 'down' },
    { step: 1494, action: 'FIRE', phase: 'up' },
  ]),
});
