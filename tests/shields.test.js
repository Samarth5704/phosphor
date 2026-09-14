import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, cloneState } from '../src/core/state.js';
import { createShields, shieldPixel, shieldPixelCount, erodeShield } from '../src/core/shields.js';
import { newGame, quiet, run, mkInvaderShot, TUNING as T, RULES as R } from './helpers.js';

function fillRow(shield, row) {
  for (let x = 0; x < shield.w; x++) shield.pixels[row * shield.w + x] = 1;
}

test('a shot travelling 4px per step across a 1px shield row erodes that row instead of passing through it', () => {
  assert.equal(T.PLAYER_SHOT_SPEED, 4);
  const s = quiet(newGame());
  const sh = s.shields[0];
  sh.pixels.fill(0);
  fillRow(sh, 10);
  const rowY = sh.y + 10;
  // 1px below the row at the start; the swept path crosses it on the 2nd of 4 sub-steps
  s.playerShot = { x: sh.x + 5, y: rowY + 2 };
  step(s, []);
  assert.equal(s.playerShot, null, 'shot consumed');
  assert.equal(shieldPixel(sh, 5, 10), 0, 'impact pixel eroded');
  assert.equal(shieldPixel(sh, 20, 10), 1, 'pixels far from the impact survive');
});

test('a player shot erodes the shield at the first set pixel it meets, not at its end position', () => {
  const s = quiet(newGame());
  const sh = s.shields[1];
  const bottom = sh.h - 1;
  assert.equal(shieldPixel(sh, 2, bottom), 1, 'precondition: bitmap column 2 is solid at the bottom');
  s.playerShot = { x: sh.x + 2, y: sh.y + sh.h + 1 };
  step(s, []);
  assert.equal(s.playerShot, null);
  assert.equal(shieldPixel(sh, 2, bottom), 0, 'bottom pixel eroded');
  const maskReach = T.PLAYER_SHOT_EROSION.anchorY;
  assert.equal(shieldPixel(sh, 2, bottom - maskReach - 1), 1, 'a pixel just above the mask reach is untouched');
});

test('an invader shot erodes a shield from above and is consumed', () => {
  const s = quiet(newGame());
  const sh = s.shields[2];
  assert.equal(shieldPixel(sh, 8, 0), 1, 'precondition: top row solid at column 8');
  s.invaderShots = [mkInvaderShot('plunger', sh.x + 8, sh.y - T.INVADER_SHOT_H - 1)];
  step(s, []);
  assert.equal(s.invaderShots.length, 0);
  assert.equal(shieldPixel(sh, 8, 0), 0);
});

test('a shot passing through an already-eroded hole continues through', () => {
  const s = quiet(newGame());
  const sh = s.shields[0];
  for (let y = 0; y < sh.h; y++) sh.pixels[y * sh.w + 5] = 0; // carve a 1px vertical hole
  s.playerShot = { x: sh.x + 5, y: sh.y + sh.h + 1 };
  const steps = Math.ceil((sh.h + 2) / T.PLAYER_SHOT_SPEED) + 1;
  run(s, steps);
  assert.ok(s.playerShot, 'shot still live');
  assert.ok(s.playerShot.y + T.PLAYER_SHOT_H <= sh.y, 'shot is above the shield');
});

test('a shot alongside a shield but not overlapping any set pixel is not consumed', () => {
  const s = quiet(newGame());
  const sh = s.shields[0];
  // the bitmap's bottom row has a hollow centre; a 1px shot in that gap rises into the hollow
  const gapX = Math.floor(sh.w / 2);
  assert.equal(shieldPixel(sh, gapX, sh.h - 1), 0, 'precondition: hollow at the bottom centre');
  s.playerShot = { x: sh.x + gapX, y: sh.y + sh.h + 1 };
  step(s, []);
  assert.ok(s.playerShot);
});

test('shield pixels live in a Uint8Array so a cloned state has independent shield memory', () => {
  const a = newGame();
  assert.ok(a.shields[0].pixels instanceof Uint8Array);
  const b = cloneState(a);
  assert.ok(b.shields[0].pixels instanceof Uint8Array);
  assert.notEqual(a.shields[0].pixels.buffer, b.shields[0].pixels.buffer);
  erodeShield(a.shields[0], 10, 8, T.PLAYER_SHOT_EROSION);
  assert.notEqual(shieldPixelCount(a.shields[0]), shieldPixelCount(b.shields[0]));
});

test('four shields are created at the tuned x positions with the bitmap pixel count', () => {
  const shields = createShields();
  assert.equal(shields.length, R.SHIELD_COUNT);
  const expected = T.SHIELD_BITMAP.join('').split('').filter((c) => c === '#').length;
  shields.forEach((sh, i) => {
    assert.equal(sh.x, T.SHIELD_XS[i]);
    assert.equal(sh.y, T.SHIELD_Y);
    assert.equal(sh.w, T.SHIELD_BITMAP[0].length);
    assert.equal(sh.h, T.SHIELD_BITMAP.length);
    assert.equal(shieldPixelCount(sh), expected);
  });
});

// Regression: both masks originally had a blank cell at the anchor, so the
// impact pixel survived and a second shot at the same column hit it again.
test('each erosion mask clears the impact pixel itself, so a second shot at the same column goes deeper', () => {
  for (const mask of [T.PLAYER_SHOT_EROSION, T.INVADER_SHOT_EROSION]) {
    assert.equal(mask.rows[mask.anchorY][mask.anchorX], '#');
  }
  const s = quiet(newGame());
  const sh = s.shields[0];
  const bottom = sh.h - 1;
  const fire = () => {
    s.playerShot = { x: sh.x + 2, y: sh.y + sh.h + 1 };
    step(s, []);
    assert.equal(s.playerShot, null, 'shot consumed');
  };
  fire();
  assert.equal(shieldPixel(sh, 2, bottom), 0);
  const afterFirst = shieldPixelCount(sh);
  fire();
  assert.ok(shieldPixelCount(sh) < afterFirst, 'second shot eroded new pixels');
});

test('erosion at a shield corner clips the mask instead of wrapping to the other side', () => {
  const [sh] = createShields();
  sh.pixels.fill(1);
  erodeShield(sh, 0, 0, T.INVADER_SHOT_EROSION);
  assert.equal(shieldPixel(sh, 0, 0), 0);
  assert.equal(shieldPixel(sh, sh.w - 1, 0), 1, 'right edge untouched');
  assert.equal(shieldPixel(sh, sh.w - 1, 1), 1);
});
