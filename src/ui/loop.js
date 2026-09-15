// The fixed-timestep accumulator. Elapsed wall time is clamped to
// MAX_CATCHUP_MS before it is added, so a tab that was backgrounded for a
// minute catches up by at most 15 steps on its first frame back instead of
// hanging the page in a catch-up loop (spec 5.2).
//
// The accumulator is kept in STEP units rather than milliseconds so that
// 250 ms is exactly 15 steps: 250 / (1000/60) in floating point is
// 14.999999999999998, which would silently make the clamp one step short.

export const STEPS_PER_SECOND = 60;
export const STEP_MS = 1000 / STEPS_PER_SECOND;
export const MAX_CATCHUP_MS = 250;
export const MAX_CATCHUP_STEPS = (MAX_CATCHUP_MS * STEPS_PER_SECOND) / 1000; // 15

export function createAccumulator() {
  return { pending: 0 };
}

// Adds the clamped elapsed time and runs `stepFn` once per whole step owed.
// Returns the number of steps taken.
export function advanceAccumulator(acc, elapsedMs, stepFn) {
  const ms = Number.isFinite(elapsedMs) ? Math.min(Math.max(elapsedMs, 0), MAX_CATCHUP_MS) : 0;
  acc.pending += (ms * STEPS_PER_SECOND) / 1000;
  let taken = 0;
  while (acc.pending >= 1) {
    stepFn();
    acc.pending -= 1;
    taken++;
  }
  return taken;
}
