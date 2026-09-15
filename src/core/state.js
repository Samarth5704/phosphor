// One state object owns the entire simulation. step(state, actions) advances
// it exactly one fixed tick of 1/60s, mutating in place. Nothing lives outside
// the state: no module-level variables, no closures, no clock. Cloning the
// state clones the simulation.
//
// Derived values (aliens alive, march period) are functions of the state and
// are never stored on it. Phosphor persistence is derived from aliens alive
// too, but by the renderer from src/tokens.js: it is not a simulation value.

import { RULES } from './rules.js';
import { TUNING } from './constants.js';
import { createRng } from './rng.js';
import { createRack, stepRack, aliensAliveInRack } from './rack.js';
import { createShields } from './shields.js';
import { scheduleUfo, stepUfo } from './ufo.js';
import { firePlayerShot, stepPlayerShot, stepInvaderShots, invaderFireTick, hasShotOfType } from './shots.js';

// Bump when a change alters how a recorded action log replays. Phase 2 refuses
// fixtures recorded against a different version.
// 1: Phase 1 core.  2: PLAYER_SHOT_SPEED 4 -> 3 (Phase 3a addendum 2).
export const SIM_VERSION = 2;

export const ACTIONS = Object.freeze({
  MOVE_LEFT: 'MOVE_LEFT',
  MOVE_RIGHT: 'MOVE_RIGHT',
  FIRE: 'FIRE',
});

export function createState(seed, wave = 1) {
  const state = {
    version: SIM_VERSION,
    seed: seed >>> 0,
    step: 0,
    rng: createRng(seed),
    wave,
    score: 0,
    lives: 3,
    extraCannonAwarded: false,
    gameOver: false,
    held: { MOVE_LEFT: false, MOVE_RIGHT: false },
    cannon: { x: TUNING.CANNON_START_X, deadSteps: 0 },
    playerShot: null,
    shotsFired: 0,
    rack: createRack(wave),
    freezeSteps: 0,
    invaderShots: [],
    nextInvaderShotType: 0,
    invaderReload: TUNING.INVADER_RELOAD_STEPS,
    plungerIndex: 0,
    squigglyIndex: 0,
    shields: createShields(),
    ufo: null,
    ufoTimer: 0,
    ufoScore: null,
    explosions: [],
    waveClearTimer: 0,
  };
  scheduleUfo(state);
  return state;
}

export function cloneState(state) {
  return structuredClone(state);
}

// ---- derived values --------------------------------------------------------

export function aliensAlive(state) {
  return aliensAliveInRack(state.rack);
}

// Steps per full rack cycle: one alien per step, so the period is the count.
export function marchPeriod(state) {
  return aliensAlive(state);
}

// ---- the step --------------------------------------------------------------

function applyActions(state, actions) {
  let fire = false;
  for (const a of actions) {
    if (a.action === ACTIONS.MOVE_LEFT || a.action === ACTIONS.MOVE_RIGHT) {
      state.held[a.action] = a.phase === 'down';
    } else if (a.action === ACTIONS.FIRE && a.phase === 'down') {
      fire = true;
    }
  }
  return fire;
}

function moveCannon(state) {
  const dx = (state.held.MOVE_RIGHT ? 1 : 0) - (state.held.MOVE_LEFT ? 1 : 0);
  const x = state.cannon.x + dx * TUNING.CANNON_SPEED;
  state.cannon.x = Math.min(Math.max(x, TUNING.CANNON_MIN_X), TUNING.CANNON_MAX_X);
}

// Cosmetic timers tick at the start of the step, before anything can create
// a new one, so a marker created with ttl N is visible for exactly N steps.
function tickCosmetics(state) {
  for (const e of state.explosions) e.ttl -= 1;
  state.explosions = state.explosions.filter((e) => e.ttl > 0);
  if (state.ufoScore) {
    state.ufoScore.ttl -= 1;
    if (state.ufoScore.ttl <= 0) state.ufoScore = null;
  }
}

function startWave(state, wave) {
  state.wave = wave;
  state.rack = createRack(wave);
  state.playerShot = null;
  state.invaderShots = [];
  state.freezeSteps = 0;
  state.invaderReload = TUNING.INVADER_RELOAD_STEPS;
  state.cannon.x = TUNING.CANNON_START_X;
}

export function step(state, actions = []) {
  if (state.gameOver) {
    state.step += 1;
    return state;
  }

  const fireRequested = applyActions(state, actions);
  tickCosmetics(state);

  // The cannon's death pauses everything but the cosmetic timers.
  if (state.cannon.deadSteps > 0) {
    state.cannon.deadSteps -= 1;
    if (state.cannon.deadSteps === 0) state.cannon.x = TUNING.CANNON_START_X;
    state.step += 1;
    return state;
  }

  // Between waves only the timer runs.
  if (state.waveClearTimer > 0) {
    state.waveClearTimer -= 1;
    if (state.waveClearTimer === 0) startWave(state, state.wave + 1);
    state.step += 1;
    return state;
  }

  moveCannon(state);

  // The freeze is read once here so rack movement and invader firing both
  // resume on the same step, the 17th after the kill.
  const frozen = state.freezeSteps > 0;
  if (frozen) {
    state.freezeSteps -= 1;
  } else {
    stepRack(state);
  }
  if (state.gameOver) {
    state.step += 1;
    return state;
  }

  if (fireRequested) firePlayerShot(state);
  stepPlayerShot(state);

  stepInvaderShots(state);
  if (!frozen && state.freezeSteps === 0 && state.cannon.deadSteps === 0 && !state.gameOver) {
    invaderFireTick(state);
  }

  stepUfo(state, hasShotOfType(state, RULES.UFO_SHARES_SLOT_WITH));

  if (aliensAlive(state) === 0) state.waveClearTimer = TUNING.WAVE_CLEAR_DELAY_STEPS;

  state.step += 1;
  return state;
}
