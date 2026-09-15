// prefers-reduced-motion, read through matchMedia and kept current through
// its change listener so toggling the OS setting takes effect without a
// reload. It pins the half-life to HALF_LIFE_REDUCED_MOTION and changes
// nothing else: the simulation never sees it (spec 6).
//
// matchMedia is passed in rather than read from a global so this module is
// testable in Node with a fake, and inert where matchMedia is missing.

import { halfLifeFor, decayPerStep, HALF_LIFE_REDUCED_MOTION } from '../tokens.js';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function createMotionPreference(matchMedia) {
  const pref = { reduced: false, dispose() {} };
  if (typeof matchMedia !== 'function') return pref;
  const mql = matchMedia(REDUCED_MOTION_QUERY);
  if (!mql) return pref;
  pref.reduced = Boolean(mql.matches);
  const onChange = (e) => { pref.reduced = Boolean(e.matches); };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    pref.dispose = () => mql.removeEventListener('change', onChange);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(onChange);
    pref.dispose = () => mql.removeListener(onChange);
  }
  return pref;
}

// The half-life the renderer decays at: pinned under reduced motion, else
// the aliens-alive curve from tokens.js.
export function effectiveHalfLife(aliensAlive, reduced) {
  return reduced ? HALF_LIFE_REDUCED_MOTION : halfLifeFor(aliensAlive);
}

// The per-step multiplier. When not reduced this is tokens' decayPerStep
// verbatim; the pinned branch restates the same 2 ** (-1 / h), and
// tests/motion.test.js checks the two agree at every alien count so the
// restatement cannot drift.
export function effectiveDecay(aliensAlive, reduced) {
  if (!reduced) return decayPerStep(aliensAlive);
  return 2 ** (-1 / HALF_LIFE_REDUCED_MOTION);
}
