// The player's single shot and the three invader shot types.
//
// Every shot is swept 1px at a time through its per-step travel and tested at
// each position, so nothing tunnels through a 1px shield row. Spec §5.4.

import { RULES } from './rules.js';
import { TUNING } from './constants.js';
import { overlaps } from './collision.js';
import { nextInt } from './rng.js';
import { alienBox, killAlien, lowestLivingInColumn } from './rack.js';
import { hitShields } from './shields.js';
import { ufoBox, killUfo } from './ufo.js';

export const SHOT_TYPES = Object.freeze(['rolling', 'plunger', 'squiggly']);

export function cannonBox(state) {
  return { x: state.cannon.x, y: TUNING.CANNON_Y, w: TUNING.CANNON_W, h: TUNING.CANNON_H };
}

export function playerShotBox(shot) {
  return { x: shot.x, y: shot.y, w: TUNING.PLAYER_SHOT_W, h: TUNING.PLAYER_SHOT_H };
}

export function invaderShotBox(shot) {
  return { x: shot.x, y: shot.y, w: TUNING.INVADER_SHOT_W, h: TUNING.INVADER_SHOT_H };
}

// ---- player shot -----------------------------------------------------------

// Returns true if a shot was spawned. A live shot makes this a no-op that does
// not touch shotsFired, because shotsFired indexes the UFO award cycle.
export function firePlayerShot(state) {
  if (state.playerShot) return false;
  state.playerShot = {
    x: state.cannon.x + Math.floor((TUNING.CANNON_W - TUNING.PLAYER_SHOT_W) / 2),
    y: TUNING.CANNON_Y - TUNING.PLAYER_SHOT_H,
  };
  state.shotsFired += 1;
  return true;
}

export function stepPlayerShot(state) {
  const shot = state.playerShot;
  if (!shot) return;
  for (let k = 0; k < TUNING.PLAYER_SHOT_SPEED; k++) {
    shot.y -= 1;
    const box = playerShotBox(shot);
    if (state.ufo && overlaps(box, ufoBox(state.ufo))) {
      killUfo(state);
      state.playerShot = null;
      return;
    }
    const aliens = state.rack.aliens;
    for (let i = 0; i < aliens.length; i++) {
      if (aliens[i].alive && overlaps(box, alienBox(aliens[i]))) {
        killAlien(state, i);
        state.playerShot = null;
        return;
      }
    }
    if (hitShields(state.shields, box, TUNING.PLAYER_SHOT_EROSION)) {
      state.playerShot = null;
      return;
    }
    if (shot.y + TUNING.PLAYER_SHOT_H <= 0) {
      state.playerShot = null;
      return;
    }
  }
}

// ---- invader shots ---------------------------------------------------------

function invaderShotBudget(state) {
  return RULES.INVADER_SHOT_SLOTS - (state.ufo ? 1 : 0);
}

function hasShotOfType(state, type) {
  return state.invaderShots.some((s) => s.type === type);
}

// 0-indexed column of the living column whose centre is nearest the cannon.
function aimedColumn(state) {
  const rack = state.rack;
  const target = state.cannon.x + TUNING.CANNON_W / 2;
  let best = -1;
  let bestDist = Infinity;
  for (let col = 0; col < RULES.RACK_COLS; col++) {
    if (lowestLivingInColumn(rack, col) === -1) continue;
    const centre = rack.originX + col * TUNING.RACK_COL_SPACING + TUNING.ALIEN_W / 2;
    const d = Math.abs(centre - target);
    if (d < bestDist) {
      bestDist = d;
      best = col;
    }
  }
  return best;
}

// Walks the column table from state[indexKey], skipping dead columns within
// the same call, and leaves the index after the entry used. Returns a 0-indexed
// column or -1 if no entry in the table has a living alien.
function tableColumn(state, table, indexKey) {
  const start = state[indexKey];
  for (let n = 0; n < table.length; n++) {
    const i = (start + n) % table.length;
    const col = table[i] - 1;
    if (lowestLivingInColumn(state.rack, col) !== -1) {
      state[indexKey] = (i + 1) % table.length;
      return col;
    }
  }
  return -1;
}

function columnFor(state, type) {
  if (type === 'rolling') return aimedColumn(state);
  if (type === 'plunger') return tableColumn(state, RULES.PLUNGER_COLUMNS, 'plungerIndex');
  return tableColumn(state, RULES.SQUIGGLY_COLUMNS, 'squigglyIndex');
}

// Round-robin through the three types starting at nextInvaderShotType. Returns
// true if a shot spawned. Respects the five-object budget: three slots, or two
// while a UFO is on screen.
export function tryFireInvaderShot(state) {
  if (state.invaderShots.length >= invaderShotBudget(state)) return false;
  for (let n = 0; n < SHOT_TYPES.length; n++) {
    const t = (state.nextInvaderShotType + n) % SHOT_TYPES.length;
    const type = SHOT_TYPES[t];
    if (hasShotOfType(state, type)) continue;
    const col = columnFor(state, type);
    if (col === -1) continue;
    const src = state.rack.aliens[lowestLivingInColumn(state.rack, col)];
    state.invaderShots.push({
      type,
      x: src.x + Math.floor((TUNING.ALIEN_W - TUNING.INVADER_SHOT_W) / 2),
      y: src.y + TUNING.ALIEN_H,
    });
    state.nextInvaderShotType = (t + 1) % SHOT_TYPES.length;
    return true;
  }
  return false;
}

// Reload countdown; when it reaches zero, one firing attempt and a refill from
// the seeded rng. Not called while the rack is frozen.
export function invaderFireTick(state) {
  if (state.invaderReload > 0) {
    state.invaderReload -= 1;
    return;
  }
  tryFireInvaderShot(state);
  state.invaderReload = TUNING.INVADER_RELOAD_STEPS + nextInt(state.rng, TUNING.INVADER_RELOAD_JITTER + 1);
}

function cannonHit(state) {
  state.lives -= 1;
  state.invaderShots = [];
  state.explosions.push({ kind: 'cannon', x: state.cannon.x, y: TUNING.CANNON_Y, ttl: TUNING.CANNON_DEATH_STEPS });
  if (state.lives <= 0) {
    state.gameOver = true;
  } else {
    state.cannon.deadSteps = TUNING.CANNON_DEATH_STEPS;
  }
}

export function stepInvaderShots(state) {
  const cannon = cannonBox(state);
  const survivors = [];
  for (const shot of state.invaderShots) {
    let alive = true;
    for (let k = 0; k < TUNING.INVADER_SHOT_SPEED && alive; k++) {
      shot.y += 1;
      const box = invaderShotBox(shot);
      if (box.y + box.h >= TUNING.GROUND_Y) {
        alive = false;
      } else if (overlaps(box, cannon)) {
        cannonHit(state);
        return; // cannonHit cleared every invader shot
      } else if (hitShields(state.shields, box, TUNING.INVADER_SHOT_EROSION)) {
        alive = false;
      }
    }
    if (alive) survivors.push(shot);
  }
  state.invaderShots = survivors;
}
