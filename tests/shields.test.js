import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, cloneState } from '../src/core/state.js';
import { createShields, shieldPixel, shieldPixelCount, erodeShield } from '../src/core/shields.js';
import { newGame, quiet, run, mkInvaderShot, TUNING as T, RULES as R } from './helpers.js';

function fillRow(shield, row) {
  for (let x = 0; x < shield.w; x++) shield.pixels[row * shield.w + x] = 1;
}

test('a shot whose leading edge would skip a 1px shield row in one step still erodes that row, because the path is swept 1px at a time', () => {
  // At PLAYER_SHOT_SPEED >= 2 the leading edge lands on every SPEED-th row,
  // so a leading-edge check at the end position passes over a 1px row. (The
  // shot's PLAYER_SHOT_H-tall box happens to bridge the gap while SPEED < H,
  // which is why this asserts the sub-step of first contact, not merely that
  // a hit happened.)
  assert.ok(T.PLAYER_SHOT_SPEED >= 2, 'a row can be skipped by a leading edge');
  const s = quiet(newGame());
  const sh = s.shields[0];
  sh.pixels.fill(0);
  fillRow(sh, 10);
  const rowY = sh.y + 10;
  // Box top 2px below the row: it first overlaps the row on the 2nd sub-step
  // of the sweep, before the end position, whatever the speed.
  s.playerShot = { x: sh.x + 5, y: rowY + 2 };
  step(s, []);
  assert.equal(s.playerShot, null, 'shot consumed on this step');
  assert.equal(shieldPixel(sh, 5, 10), 0, 'impact pixel eroded');
  assert.equal(shieldPixel(sh, 20, 10), 1, 'pixels far from the impact survive');
  // The same geometry, one step of travel earlier, must not touch the row:
  // proves the hit above came from the sweep and not from a spawn overlap.
  const s2 = quiet(newGame());
  const sh2 = s2.shields[0];
  sh2.pixels.fill(0);
  fillRow(sh2, 10);
  s2.playerShot = { x: sh2.x + 5, y: rowY + 2 + T.PLAYER_SHOT_SPEED };
  step(s2, []);
  assert.ok(s2.playerShot, 'still flying');
  assert.equal(shieldPixel(sh2, 5, 10), 1, 'row untouched a step earlier');
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
  // Step until the shot resolves: how many steps that takes depends on
  // PLAYER_SHOT_SPEED and on how deep the previous bite went.
  const fire = () => {
    s.playerShot = { x: sh.x + 2, y: sh.y + sh.h + 1 };
    for (let i = 0; i < 10 && s.playerShot; i++) step(s, []);
    assert.equal(s.playerShot, null, 'shot consumed within the shield');
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
