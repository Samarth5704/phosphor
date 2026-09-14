import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, aliensAlive, marchPeriod } from '../src/core/state.js';
import { createRack, rackStartY, alienIndex, alienHomeX, alienHomeY } from '../src/core/rack.js';
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
  const col7Right = (ox) => ox + 6 * SP + T.ALIEN_W;
  const col11Right = (ox) => ox + 10 * SP + T.ALIEN_W;
  const ox = T.RACK_MARGIN_RIGHT - 10 - 6 * SP - T.ALIEN_W; // column 7 is 10px short of the margin
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
  const ox = T.RACK_MARGIN_RIGHT - (10 * SP + T.ALIEN_W); // on the margin: next pass reverses and drops
  placeRack(s, ox, oy);
  run(s, 55);
  assert.equal(s.gameOver, false, 'origin has dropped but no alien has been redrawn there yet');
  step(s, []); // alien 0 is redrawn one row lower, into the cannon row
  assert.equal(s.gameOver, true);
  assert.equal(s.lives, 3);
});

test('the rack starting height descends per wave and stops descending at wave 6', () => {
  assert.equal(rackStartY(1), T.RACK_START_Y);
  assert.equal(rackStartY(2), T.RACK_START_Y + T.RACK_DESCENT_PER_WAVE);
  assert.equal(rackStartY(6), T.RACK_START_Y + 5 * T.RACK_DESCENT_PER_WAVE);
  assert.equal(rackStartY(7), rackStartY(6));
  assert.equal(rackStartY(40), rackStartY(6));
  assert.equal(createRack(3).originY, rackStartY(3));
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
