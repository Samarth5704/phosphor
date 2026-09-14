// The rack: 11×5 aliens, one updated per step via a cursor. The wave's speed is
// emergent from that and from nothing else.
//
// The origin is the bottom-left alien's home position. Every alien's home is
// origin + (col, row) offset, and the origin keeps advancing after the
// bottom-left alien dies. Each alien also stores where it was last drawn, so
// mid-pass the rack is staggered exactly as the original's one-per-frame redraw
// made it.

import { RULES } from './rules.js';
import { TUNING } from './constants.js';
import { addScore, rowScore } from './scoring.js';

const COLS = RULES.RACK_COLS;
const ROWS = RULES.RACK_ROWS;
export const ALIEN_COUNT = COLS * ROWS;

export function alienCol(i) {
  return i % COLS;
}

export function alienRow(i) {
  return Math.floor(i / COLS);
}

// row 0 is the bottom row.
export function alienIndex(col, row) {
  return row * COLS + col;
}

export function alienHomeX(rack, i) {
  return rack.originX + alienCol(i) * TUNING.RACK_COL_SPACING;
}

export function alienHomeY(rack, i) {
  return rack.originY - alienRow(i) * TUNING.RACK_ROW_SPACING;
}

export function alienBox(alien) {
  return { x: alien.x, y: alien.y, w: TUNING.ALIEN_W, h: TUNING.ALIEN_H };
}

export function rackStartY(wave) {
  const descents = Math.min(wave, TUNING.RACK_DESCENT_STOP_WAVE) - 1;
  return TUNING.RACK_START_Y + descents * TUNING.RACK_DESCENT_PER_WAVE;
}

export function createRack(wave) {
  const rack = {
    originX: TUNING.RACK_START_X,
    originY: rackStartY(wave),
    dir: 1,
    cursor: 0,
    aliens: [],
  };
  for (let i = 0; i < ALIEN_COUNT; i++) {
    rack.aliens.push({ alive: true, x: alienHomeX(rack, i), y: alienHomeY(rack, i) });
  }
  return rack;
}

export function aliensAliveInRack(rack) {
  let n = 0;
  for (const a of rack.aliens) if (a.alive) n++;
  return n;
}

// Index of the lowest living alien in a 0-indexed column, or -1.
export function lowestLivingInColumn(rack, col) {
  for (let row = 0; row < ROWS; row++) {
    const i = alienIndex(col, row);
    if (rack.aliens[i].alive) return i;
  }
  return -1;
}

function nextLiving(rack, from) {
  for (let i = from; i < ALIEN_COUNT; i++) if (rack.aliens[i].alive) return i;
  return -1;
}

function livingColumnBounds(rack) {
  let min = COLS;
  let max = -1;
  for (let i = 0; i < ALIEN_COUNT; i++) {
    if (!rack.aliens[i].alive) continue;
    const c = alienCol(i);
    if (c < min) min = c;
    if (c > max) max = c;
  }
  return { min, max };
}

// End of a pass: move the origin 2px, or drop a row and reverse if the living
// extremity would cross a margin. Dead columns do not count.
function advanceOrigin(rack) {
  const { min, max } = livingColumnBounds(rack);
  if (max < 0) return;
  const left = rack.originX + min * TUNING.RACK_COL_SPACING;
  const right = rack.originX + max * TUNING.RACK_COL_SPACING + TUNING.ALIEN_W;
  const step = RULES.RACK_STEP_X;
  const blocked = rack.dir > 0
    ? right + step > TUNING.RACK_MARGIN_RIGHT
    : left - step < TUNING.RACK_MARGIN_LEFT;
  if (blocked) {
    rack.dir = -rack.dir;
    rack.originY += TUNING.ROW_DROP;
  } else {
    rack.originX += rack.dir * step;
  }
}

// One alien per step. Called only when the rack is not frozen.
export function stepRack(state) {
  const rack = state.rack;
  let i = nextLiving(rack, rack.cursor);
  if (i === -1) {
    // Everything at or after the cursor died mid-pass: the pass is over.
    advanceOrigin(rack);
    i = nextLiving(rack, 0);
    if (i === -1) return;
  }
  const a = rack.aliens[i];
  a.x = alienHomeX(rack, i);
  a.y = alienHomeY(rack, i);
  if (a.y + TUNING.ALIEN_H > TUNING.CANNON_Y) state.gameOver = true;
  if (nextLiving(rack, i + 1) === -1) {
    advanceOrigin(rack);
    rack.cursor = 0;
  } else {
    rack.cursor = i + 1;
  }
}

export function killAlien(state, i) {
  const a = state.rack.aliens[i];
  a.alive = false;
  state.freezeSteps = RULES.EXPLOSION_FREEZE_STEPS;
  state.explosions.push({ kind: 'alien', x: a.x, y: a.y, ttl: RULES.EXPLOSION_FREEZE_STEPS });
  addScore(state, rowScore(alienRow(i)));
}
