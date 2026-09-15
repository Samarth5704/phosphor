// Writes one frame of simulation geometry into the intensity buffer. Reads
// the state, never writes it. Every object is written at full intensity with
// the buffer's max rule, so overlap never exceeds 1.0.
//
// Animation frames are derived from state the simulation already carries
// (an alien's x, the step counter, an explosion's ttl); nothing is stored for
// the renderer's benefit.

import { RULES } from '../core/rules.js';
import { TUNING } from '../core/constants.js';
import { alienRow, alienBox } from '../core/rack.js';
import { lightSprite, lightRect, lightPixelGrid } from './intensity.js';
import {
  alienSpriteForRow, ALIEN_EXPLOSION, CANNON, CANNON_EXPLOSION, PLAYER_SHOT,
  INVADER_SHOTS, UFO, DIGITS, DIGIT_ADVANCE,
} from './sprites.js';

// The alien's x advances by RACK_STEP_X per move, so this toggles per move.
function alienFrame(alien) {
  return Math.floor(alien.x / RULES.RACK_STEP_X) & 1;
}

function writeRack(buffer, rack) {
  const aliens = rack.aliens;
  for (let i = 0; i < aliens.length; i++) {
    const a = aliens[i];
    if (!a.alive) continue;
    const box = alienBox(a, i);
    const sprite = alienSpriteForRow(alienRow(i))[alienFrame(a)];
    lightSprite(buffer, sprite, box.x, box.y);
  }
}

function writeExplosions(buffer, state) {
  for (const e of state.explosions) {
    const frame = (e.ttl >> 2) & 1;
    if (e.kind === 'alien') lightSprite(buffer, ALIEN_EXPLOSION[frame], e.x, e.y);
    else if (e.kind === 'cannon') lightSprite(buffer, CANNON_EXPLOSION[frame], e.x, e.y);
  }
}

function writeCannon(buffer, state) {
  // While dying, the explosion marker stands in for the cannon.
  if (state.cannon.deadSteps > 0) return;
  if (state.gameOver && state.lives <= 0) return;
  lightSprite(buffer, CANNON, state.cannon.x, TUNING.CANNON_Y);
}

function writeShots(buffer, state) {
  if (state.playerShot) lightSprite(buffer, PLAYER_SHOT, state.playerShot.x, state.playerShot.y);
  const frame = (state.step >> 2) & 1;
  for (const s of state.invaderShots) {
    lightSprite(buffer, INVADER_SHOTS[s.type][frame], s.x, s.y);
  }
}

function writeUfo(buffer, state) {
  if (state.ufo) lightSprite(buffer, UFO, state.ufo.x, TUNING.UFO_Y);
  if (state.ufoScore) {
    const digits = String(state.ufoScore.value);
    let x = state.ufoScore.x + Math.floor((TUNING.UFO_W - digits.length * DIGIT_ADVANCE + 1) / 2);
    for (const ch of digits) {
      lightSprite(buffer, DIGITS[ch.charCodeAt(0) - 48], x, TUNING.UFO_Y + 1);
      x += DIGIT_ADVANCE;
    }
  }
}

function writeShields(buffer, shields) {
  for (const s of shields) lightPixelGrid(buffer, s);
}

// The ground line sits where invader shots vanish.
function writeGround(buffer) {
  lightRect(buffer, 0, TUNING.GROUND_Y, RULES.FIELD_W, 1);
}

export function writeScene(buffer, state) {
  writeRack(buffer, state.rack);
  writeExplosions(buffer, state);
  writeShields(buffer, state.shields);
  writeCannon(buffer, state);
  writeShots(buffer, state);
  writeUfo(buffer, state);
  writeGround(buffer);
}
