// The UFO. Its award is indexed by the player's fired-shot count through the
// authentic 15-value cycle; it is not random. Its appearance interval and
// direction are our tuning and draw from the seeded rng on the state.

import { RULES } from './rules.js';
import { TUNING } from './constants.js';
import { nextInt } from './rng.js';
import { addScore } from './scoring.js';
import { aliensAliveInRack } from './rack.js';

export function ufoBox(ufo) {
  return { x: ufo.x, y: TUNING.UFO_Y, w: TUNING.UFO_W, h: TUNING.UFO_H };
}

// shotsFired is the count including the shot that hit; the first shot is 1.
export function ufoAward(shotsFired) {
  const n = RULES.UFO_AWARD_CYCLE.length;
  const i = (((shotsFired - 1) % n) + n) % n;
  return RULES.UFO_AWARD_CYCLE[i];
}

export function scheduleUfo(state) {
  state.ufoTimer = TUNING.UFO_INTERVAL_STEPS + nextInt(state.rng, TUNING.UFO_INTERVAL_JITTER + 1);
}

export function spawnUfo(state) {
  const dir = nextInt(state.rng, 2) === 0 ? 1 : -1;
  state.ufo = { x: dir > 0 ? -TUNING.UFO_W : RULES.FIELD_W, dir };
  scheduleUfo(state);
}

export function killUfo(state) {
  const value = ufoAward(state.shotsFired);
  addScore(state, value);
  state.ufoScore = { x: state.ufo.x, value, ttl: TUNING.UFO_SCORE_DISPLAY_STEPS };
  state.ufo = null;
}

// slotBusy says whether the squiggly shot the UFO shares a slot with is in
// flight; it is passed in so this module never has to look at shots.js.
export function stepUfo(state, slotBusy) {
  if (state.ufo) {
    state.ufo.x += state.ufo.dir * TUNING.UFO_SPEED;
    const gone = state.ufo.dir > 0
      ? state.ufo.x >= RULES.FIELD_W
      : state.ufo.x + TUNING.UFO_W <= 0;
    if (gone) state.ufo = null;
    return;
  }
  if (state.ufoTimer > 0) {
    state.ufoTimer -= 1;
    return;
  }
  // Timer elapsed: wait (without consuming rng) until the conditions hold.
  if (aliensAliveInRack(state.rack) < TUNING.UFO_MIN_ALIENS) return;
  if (slotBusy) return;
  spawnUfo(state);
}
