import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, aliensAlive, marchPeriod } from '../src/core/state.js';
import { createRack, rackStartY, alienIndex, alienHomeX, alienHomeY, alienBox } from '../src/core/rack.js';
import { createShields, shieldPixel, shieldPixelCount, eraseShieldArea } from '../src/core/shields.js';
import {
  newGame, quiet, run, killColumns, killAllBut, placeRack, rackSnapshot, TUNING as T, RULES as R,
} from './helpers.js';

const SP = T.RACK_COL_SPACING;

test('a rack of 55 aliens advances the reference alien 2px after 55 steps, not after 1', () => {
  const s = quiet(newGame());
  const x0 = s.rack.originX;
  step(s, []);
  assert.equal(s.rack.originX, x0, 'origin must not move after 1 step');
  run(s, 53);
  assert.equal(s.rack.originX, x0, 'origin must not move after 54 steps');
  step(s, []);
  assert.equal(s.rack.originX, x0 + R.RACK_STEP_X, 'origin moves 2px at the end of the 55th step');
  assert.equal(s.rack.aliens[0].x, x0, 'alien 0 itself has not been redrawn yet');
  step(s, []);
  assert.equal(s.rack.aliens[0].x, x0 + R.RACK_STEP_X, 'alien 0 catches up on the first step of the next pass');
});

test('the reference alien still defines the rack origin after it has been killed', () => {
  const s = quiet(newGame());
  s.rack.aliens[0].alive = false;
  const x0 = s.rack.originX;
  run(s, 54); // 54 living aliens = one full pass
  assert.equal(s.rack.originX, x0 + R.RACK_STEP_X);
  step(s, []); // first living alien of the next pass is index 1 (col 1, row 0)
  assert.equal(s.rack.aliens[1].x, x0 + R.RACK_STEP_X + SP);
  assert.equal(alienHomeX(s.rack, 1), s.rack.originX + SP);
  assert.equal(alienHomeY(s.rack, alienIndex(0, 4)), s.rack.originY - 4 * T.RACK_ROW_SPACING);
});

test('a rack whose rightmost living column is 7 reverses when column 7 reaches the margin, not when the dead column 11 would have', () => {
  const s = quiet(newGame());
  killColumns(s, [7, 8, 9, 10]); // 1-indexed columns 8..11 dead; rightmost living is column 7 (index 6)
  const col7Right = (ox) => ox + 6 * SP + T.ALIEN_W_BOTTOM;
  const col11Right = (ox) => ox + 10 * SP + T.ALIEN_W_BOTTOM;
  const ox = T.RACK_MARGIN_RIGHT - 10 - 6 * SP - T.ALIEN_W_BOTTOM; // column 7 is 10px short of the margin
  assert.ok(col11Right(ox) + R.RACK_STEP_X > T.RACK_MARGIN_RIGHT, 'precondition: a full rack would reverse on the first pass');
  const y0 = s.rack.originY;
  placeRack(s, ox, y0);
  const alive = aliensAlive(s);
  assert.equal(alive, 35);
  for (let pass = 1; pass <= 5; pass++) {
    run(s, alive);
    assert.equal(s.rack.dir, 1, `still moving right after pass ${pass}`);
    assert.equal(s.rack.originX, ox + 2 * pass);
    assert.equal(s.rack.originY, y0);
  }
  assert.equal(col7Right(s.rack.originX), T.RACK_MARGIN_RIGHT, 'column 7 now sits exactly on the margin');
  run(s, alive);
  assert.equal(s.rack.dir, -1, 'reversed when column 7 touched the margin');
  assert.equal(s.rack.originY, y0 + T.ROW_DROP, 'dropped one row');
  assert.equal(s.rack.originX, ox + 10, 'x does not advance on the reversing pass');
});

test('a rack moving left reverses at the left margin using the leftmost living column', () => {
  const s = quiet(newGame());
  killColumns(s, [0, 1]); // leftmost living is column index 2
  s.rack.dir = -1;
  const ox = T.RACK_MARGIN_LEFT - 2 * SP; // column 2 left edge sits exactly on the margin
  const y0 = s.rack.originY;
  placeRack(s, ox, y0);
  const alive = aliensAlive(s);
  run(s, alive);
  assert.equal(s.rack.dir, 1);
  assert.equal(s.rack.originY, y0 + T.ROW_DROP);
  assert.equal(s.rack.originX, ox);
});

test('an exploding alien freezes the rack for exactly 16 steps and it moves on the 17th', () => {
  const s = quiet(newGame());
  const a = s.rack.aliens[0];
  s.playerShot = { x: a.x + 3, y: a.y + T.ALIEN_H + 1 };
  step(s, []); // the kill step
  assert.equal(a.alive, false);
  assert.equal(s.freezeSteps, R.EXPLOSION_FREEZE_STEPS);
  const before = rackSnapshot(s);
  for (let i = 1; i <= 16; i++) {
    step(s, []);
    assert.equal(rackSnapshot(s), before, `rack must not change on frozen step ${i}`);
  }
  assert.equal(s.freezeSteps, 0);
  step(s, []);
  assert.notEqual(rackSnapshot(s), before, 'rack moves on the 17th step');
});

test('the cursor skips dead aliens so a rack of 8 completes a pass in 8 steps', () => {
  const s = quiet(newGame());
  killAllBut(s, [0, 1, 2, 3, 4, 5, 6, 7]);
  const x0 = s.rack.originX;
  run(s, 8);
  assert.equal(s.rack.originX, x0 + 2);
  run(s, 7);
  assert.equal(s.rack.originX, x0 + 2);
  step(s, []);
  assert.equal(s.rack.originX, x0 + 4);
});

test('aliens dying beyond the cursor mid-pass end the pass with a single origin advance', () => {
  const s = quiet(newGame());
  run(s, 50); // cursor is now at 50
  const x0 = s.rack.originX;
  killAllBut(s, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // everything at or after the cursor is dead
  step(s, []); // pass ends, origin advances once, alien 0 is processed
  assert.equal(s.rack.originX, x0 + 2);
  assert.equal(s.rack.cursor, 1);
});

test('each alien is repositioned to origin plus its column and row offset when its turn comes', () => {
  const s = quiet(newGame());
  run(s, 55); // origin moved by 2, nobody redrawn yet
  const i = alienIndex(4, 3);
  run(s, 1 + i); // steps for aliens 0..i
  const a = s.rack.aliens[i];
  assert.equal(a.x, s.rack.originX + 4 * SP);
  assert.equal(a.y, s.rack.originY - 3 * T.RACK_ROW_SPACING);
});

test('an alien reaching the cannon row ends the game while three cannons remain', () => {
  const s = quiet(newGame());
  const oy = T.CANNON_Y - T.ALIEN_H; // bottom edge touches but does not overlap the cannon row
  const ox = T.RACK_MARGIN_RIGHT - (10 * SP + T.ALIEN_W_BOTTOM); // on the margin: next pass reverses and drops
  placeRack(s, ox, oy);
  run(s, 55);
  assert.equal(s.gameOver, false, 'origin has dropped but no alien has been redrawn there yet');
  step(s, []); // alien 0 is redrawn one row lower, into the cannon row
  assert.equal(s.gameOver, true);
  assert.equal(s.lives, 3);
});

test('waves 2 through 9 start progressively lower, wave 10 reverts to wave 1 height and wave 19 to wave 1 again', () => {
  assert.equal(R.WAVE_HEIGHT_CYCLE, 9);
  assert.equal(rackStartY(1), T.RACK_START_Y);
  for (let w = 2; w <= 9; w++) {
    assert.equal(rackStartY(w), rackStartY(w - 1) + T.RACK_DESCENT_PER_WAVE, `wave ${w} is one step lower than wave ${w - 1}`);
  }
  assert.equal(rackStartY(9), T.RACK_START_Y + 8 * T.RACK_DESCENT_PER_WAVE);
  assert.equal(rackStartY(10), rackStartY(1));
  assert.equal(rackStartY(11), rackStartY(2));
  assert.equal(rackStartY(19), rackStartY(1));
  assert.equal(createRack(3).originY, rackStartY(3));
});

test('the wave-9 start height leaves the bottom row above the shields and the cannon row', () => {
  const bottomEdge = rackStartY(9) + T.ALIEN_H;
  assert.ok(bottomEdge <= T.SHIELD_Y, `bottom edge ${bottomEdge} must not start inside the shields at ${T.SHIELD_Y}`);
  assert.ok(bottomEdge <= T.CANNON_Y);
});

test('a new rack has 55 living aliens in 11 columns and 5 rows all at their home positions', () => {
  const rack = createRack(1);
  assert.equal(rack.aliens.length, 55);
  assert.ok(rack.aliens.every((a) => a.alive));
  rack.aliens.forEach((a, i) => {
    assert.equal(a.x, alienHomeX(rack, i));
    assert.equal(a.y, alienHomeY(rack, i));
  });
  assert.equal(alienHomeX(rack, alienIndex(10, 0)), rack.originX + 10 * SP);
  assert.equal(alienHomeY(rack, alienIndex(0, 4)), rack.originY - 4 * T.RACK_ROW_SPACING);
});

test('aliensAlive and marchPeriod are computed from the rack, not stored', () => {
  const s = newGame();
  assert.equal(aliensAlive(s), 55);
  assert.equal(marchPeriod(s), 55);
  killColumns(s, [0]);
  assert.equal(aliensAlive(s), 50);
  assert.equal(marchPeriod(s), 50);
  assert.equal(Object.hasOwn(s, 'aliensAlive'), false);
  assert.equal(Object.hasOwn(s.rack, 'alive'), false);
});

// ---- E: per-type hitbox widths ---------------------------------------------

test('a shot passing through the horizontal gap beside the narrowest alien type does not register a hit, while the same shot at the same x against the widest type does', () => {
  assert.ok(T.ALIEN_W_TOP < T.ALIEN_W_MIDDLE && T.ALIEN_W_MIDDLE < T.ALIEN_W_BOTTOM);
  const gapX = 1; // inside the bottom type's 12px box, outside the top type's centred 8px box
  const inset = Math.floor((T.ALIEN_W_BOTTOM - T.ALIEN_W_TOP) / 2);
  assert.ok(gapX < inset, 'precondition: x=1 lies in the gap beside the top type');

  const top = quiet(newGame());
  killAllBut(top, [alienIndex(5, 4)]);
  const a = top.rack.aliens[alienIndex(5, 4)];
  top.playerShot = { x: a.x + gapX, y: a.y + T.ALIEN_H + 1 };
  step(top, []);
  assert.equal(a.alive, true, 'top type not hit through the gap');
  assert.ok(top.playerShot, 'shot flew on');

  const bottom = quiet(newGame());
  killAllBut(bottom, [alienIndex(5, 0)]);
  const b = bottom.rack.aliens[alienIndex(5, 0)];
  bottom.playerShot = { x: b.x + gapX, y: b.y + T.ALIEN_H + 1 };
  step(bottom, []);
  assert.equal(b.alive, false, 'bottom type hit at the same x');
});

test('alien hitboxes are 12, 11 and 8 wide by row type and narrower boxes are centred in the cell', () => {
  const rack = createRack(1);
  const box = (col, row) => alienBox(rack.aliens[alienIndex(col, row)], alienIndex(col, row));
  assert.equal(box(0, 0).w, T.ALIEN_W_BOTTOM);
  assert.equal(box(0, 1).w, T.ALIEN_W_BOTTOM);
  assert.equal(box(0, 2).w, T.ALIEN_W_MIDDLE);
  assert.equal(box(0, 3).w, T.ALIEN_W_MIDDLE);
  assert.equal(box(0, 4).w, T.ALIEN_W_TOP);
  assert.equal(box(0, 4).x, rack.aliens[alienIndex(0, 4)].x + 2);
  assert.equal(box(0, 0).x, rack.aliens[alienIndex(0, 0)].x);
});

test('a rack whose only living aliens are top type reverses by the narrow box, 2px later than the bottom box would', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(10, 4)]);
  const inset = Math.floor((T.ALIEN_W_BOTTOM - T.ALIEN_W_TOP) / 2);
  // place the top alien's right edge exactly 2px inside the margin: one more pass moves it, the next reverses
  const ox = T.RACK_MARGIN_RIGHT - 2 - (10 * SP + inset + T.ALIEN_W_TOP);
  placeRack(s, ox, s.rack.originY);
  step(s, []);
  assert.equal(s.rack.dir, 1, 'narrow box still fits');
  assert.equal(s.rack.originX, ox + 2);
  step(s, []);
  assert.equal(s.rack.dir, -1);
});

// ---- C: the descending rack erodes shields -------------------------------

test('an alien whose box overlaps a shield erases exactly the overlapping cells and leaves the rest of the shield intact', () => {
  const s = quiet(newGame());
  const sh = s.shields[0];
  killAllBut(s, [0]);
  const i = 0;
  // park the bottom-left alien so its box covers shield columns 2..13 and rows 0..3
  placeRack(s, sh.x + 2, sh.y - 4);
  const before = shieldPixelCount(sh);
  const box = alienBox(s.rack.aliens[i], i);
  let expectedCleared = 0;
  for (let py = 0; py < sh.h; py++) {
    for (let px = 0; px < sh.w; px++) {
      const inside = px >= box.x - sh.x && px < box.x + box.w - sh.x && py >= box.y - sh.y && py < box.y + box.h - sh.y;
      if (inside && shieldPixel(sh, px, py)) expectedCleared++;
    }
  }
  assert.ok(expectedCleared > 0, 'precondition: the overlap contains set pixels');
  step(s, []); // alien 0 is repositioned onto the shield
  assert.equal(shieldPixelCount(sh), before - expectedCleared);
  for (let py = 0; py < sh.h; py++) {
    for (let px = 0; px < sh.w; px++) {
      const inside = px >= box.x - sh.x && px < box.x + box.w - sh.x && py >= box.y - sh.y && py < box.y + box.h - sh.y;
      if (inside) assert.equal(shieldPixel(sh, px, py), 0, `cell ${px},${py} inside the overlap is clear`);
      else assert.equal(shieldPixel(sh, px, py), T.SHIELD_BITMAP[py][px] === '#' ? 1 : 0, `cell ${px},${py} outside is untouched`);
    }
  }
  assert.equal(shieldPixelCount(s.shields[1]), shieldPixelCount(createShields()[1]), 'other shields untouched');
});

test('a shield already fully eroded at the overlap is unchanged and no error is raised', () => {
  const s = quiet(newGame());
  const sh = s.shields[0];
  sh.pixels.fill(0);
  killAllBut(s, [0]);
  placeRack(s, sh.x + 2, sh.y - 4);
  assert.doesNotThrow(() => step(s, []));
  assert.equal(shieldPixelCount(sh), 0);
  assert.equal(eraseShieldArea(s.shields, alienBox(s.rack.aliens[0], 0)), 0);
});

test('erosion by the rack does not award score', () => {
  const s = quiet(newGame());
  const sh = s.shields[0];
  killAllBut(s, [0]);
  placeRack(s, sh.x + 2, sh.y - 4);
  const before = shieldPixelCount(sh);
  step(s, []);
  assert.ok(shieldPixelCount(sh) < before, 'precondition: something was eroded');
  assert.equal(s.score, 0);
  assert.equal(s.lives, 3);
});
