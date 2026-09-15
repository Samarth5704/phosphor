// Shared helpers for the Phase 1 suite. Not a test file: node --test only
// picks up *.test.js under tests/.
import { createState, step, ACTIONS } from '../src/core/state.js';
import { alienIndex, alienHomeX, alienHomeY, lowestLivingInColumn } from '../src/core/rack.js';
import { RULES } from '../src/core/rules.js';
import { TUNING } from '../src/core/constants.js';

export function newGame(seed = 1) {
  return createState(seed);
}

// Disable invader fire and the UFO timer so tests about one mechanism are not
// disturbed by another. Both are plain counters, so a huge value is inert.
export function quiet(state) {
  state.invaderReload = 1e9;
  state.ufoTimer = 1e9;
  return state;
}

export function run(state, n, actions = []) {
  for (let i = 0; i < n; i++) step(state, actions);
  return state;
}

export function act(state, action, phase = 'down') {
  return { step: state.step, action, phase };
}

// cols are 0-indexed here; the spec's tables are 1-indexed.
export function killColumns(state, cols) {
  for (const col of cols) {
    for (let row = 0; row < RULES.RACK_ROWS; row++) {
      state.rack.aliens[alienIndex(col, row)].alive = false;
    }
  }
}

export function killAllBut(state, keep) {
  const keepSet = new Set(keep);
  state.rack.aliens.forEach((a, i) => { a.alive = keepSet.has(i); });
}

// Move the rack origin and snap every alien to its home so the rack is in a
// consistent "just finished a pass" configuration.
export function placeRack(state, originX, originY) {
  const rack = state.rack;
  rack.originX = originX;
  rack.originY = originY;
  rack.aliens.forEach((a, i) => {
    a.x = alienHomeX(rack, i);
    a.y = alienHomeY(rack, i);
  });
  rack.cursor = 0;
}

export function mkInvaderShot(type, x = 100, y = 100) {
  return { type, x, y };
}

export function rackSnapshot(state) {
  const r = state.rack;
  return JSON.stringify({
    originX: r.originX, originY: r.originY, dir: r.dir, cursor: r.cursor,
    aliens: r.aliens.map((a) => [a.alive ? 1 : 0, a.x, a.y]),
  });
}

// A small deterministic bot, shared by the playthrough test and the replay
// fixture: park under the nearest column's lowest alien,
// fire whenever the slot is free, sidestep invader shots that get close.
export function botActions(s, mem) {
  const actions = [];
  const cannonMid = s.cannon.x + TUNING.CANNON_W / 2;
  let bestCol = -1;
  let best = Infinity;
  for (let c = 0; c < RULES.RACK_COLS; c++) {
    const idx = lowestLivingInColumn(s.rack, c);
    if (idx === -1) continue;
    const d = Math.abs(s.rack.aliens[idx].x + TUNING.ALIEN_W_BOTTOM / 2 - cannonMid);
    if (d < best) { best = d; bestCol = c; }
  }
  const danger = s.invaderShots.find((sh) => sh.y > 150 && Math.abs(sh.x - cannonMid) < 12);
  let want = null;
  if (danger) {
    want = danger.x < cannonMid ? ACTIONS.MOVE_RIGHT : ACTIONS.MOVE_LEFT;
  } else if (bestCol >= 0) {
    const a = s.rack.aliens[lowestLivingInColumn(s.rack, bestCol)];
    const dx = a.x + TUNING.ALIEN_W_BOTTOM / 2 - cannonMid;
    want = dx > 1 ? ACTIONS.MOVE_RIGHT : dx < -1 ? ACTIONS.MOVE_LEFT : null;
  }
  if (want !== mem.held) {
    if (mem.held) actions.push({ step: s.step, action: mem.held, phase: 'up' });
    if (want) actions.push({ step: s.step, action: want, phase: 'down' });
    mem.held = want;
  }
  if (!s.playerShot && !danger && best < 4 && !mem.fireDown) {
    actions.push({ step: s.step, action: ACTIONS.FIRE, phase: 'down' });
    mem.fireDown = true;
  } else if (mem.fireDown) {
    actions.push({ step: s.step, action: ACTIONS.FIRE, phase: 'up' });
    mem.fireDown = false;
  }
  return actions;
}

export { TUNING, RULES };
