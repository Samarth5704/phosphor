// Phase 3b: prefers-reduced-motion through matchMedia, including the change
// listener, and the half-life it pins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMotionPreference, effectiveHalfLife, effectiveDecay, REDUCED_MOTION_QUERY,
} from '../src/ui/motion.js';
import { halfLifeFor, decayPerStep, HALF_LIFE_REDUCED_MOTION, HALF_LIFE_AT_55 } from '../src/tokens.js';

// A fake matchMedia whose list can be flipped from the test, the way the OS
// setting flips the real one.
function fakeMatchMedia(initial) {
  const listeners = new Set();
  const lists = [];
  const matchMedia = (query) => {
    const mql = {
      query,
      matches: initial,
      addEventListener: (type, fn) => { if (type === 'change') listeners.add(fn); },
      removeEventListener: (type, fn) => { listeners.delete(fn); },
    };
    lists.push(mql);
    return mql;
  };
  return {
    matchMedia,
    lists,
    listeners,
    flip(matches) {
      for (const l of lists) l.matches = matches;
      for (const fn of listeners) fn({ matches });
    },
  };
}

test('the preference is read from matchMedia("(prefers-reduced-motion: reduce)") at creation', () => {
  const on = fakeMatchMedia(true);
  assert.equal(createMotionPreference(on.matchMedia).reduced, true);
  assert.equal(on.lists[0].query, REDUCED_MOTION_QUERY);
  const off = fakeMatchMedia(false);
  assert.equal(createMotionPreference(off.matchMedia).reduced, false);
});

test('toggling the OS setting fires the change listener and the preference follows it without a reload, in both directions', () => {
  const mm = fakeMatchMedia(false);
  const pref = createMotionPreference(mm.matchMedia);
  assert.equal(mm.listeners.size, 1, 'one change listener registered');
  mm.flip(true);
  assert.equal(pref.reduced, true);
  mm.flip(false);
  assert.equal(pref.reduced, false);
  pref.dispose();
  assert.equal(mm.listeners.size, 0);
  mm.flip(true);
  assert.equal(pref.reduced, false, 'disposed: no longer listening');
});

test('without matchMedia (no window, or an old browser) the preference is not-reduced and inert rather than throwing', () => {
  assert.equal(createMotionPreference(undefined).reduced, false);
  assert.equal(createMotionPreference(null).reduced, false);
  assert.equal(createMotionPreference(() => null).reduced, false);
});

test('the legacy addListener API is used when addEventListener is absent', () => {
  let cb = null;
  const mql = { matches: false, addListener: (fn) => { cb = fn; }, removeListener: () => { cb = null; } };
  const pref = createMotionPreference(() => mql);
  assert.ok(cb);
  cb({ matches: true });
  assert.equal(pref.reduced, true);
});

test('with reduced motion the half-life is the pinned HALF_LIFE_REDUCED_MOTION at every alien count, including 55 where the normal value is longest', () => {
  for (let n = 1; n <= 55; n++) {
    assert.equal(effectiveHalfLife(n, true), HALF_LIFE_REDUCED_MOTION, `n=${n}`);
  }
  assert.equal(effectiveHalfLife(55, false), HALF_LIFE_AT_55);
  assert.ok(effectiveHalfLife(55, true) < effectiveHalfLife(55, false));
});

test('without reduced motion the decay is tokens.decayPerStep verbatim, and with it the decay equals decayPerStep at whichever count halfLifeFor pins to, so the restated formula cannot drift', () => {
  for (let n = 1; n <= 55; n++) assert.equal(effectiveDecay(n, false), decayPerStep(n));
  const pinned = effectiveDecay(55, true);
  const countWithPinnedHalfLife = [...Array(56).keys()].slice(1).find((n) => halfLifeFor(n) === HALF_LIFE_REDUCED_MOTION);
  assert.ok(countWithPinnedHalfLife, 'some alien count has the pinned half-life');
  assert.equal(pinned, decayPerStep(countWithPinnedHalfLife));
  assert.equal(pinned, 2 ** (-1 / HALF_LIFE_REDUCED_MOTION));
});
