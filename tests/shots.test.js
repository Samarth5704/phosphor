import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/core/state.js';
import { tryFireInvaderShot, missileSurvives, SHOT_TYPES } from '../src/core/shots.js';
import { shieldPixelCount } from '../src/core/shields.js';
import { alienIndex } from '../src/core/rack.js';
import {
  newGame, quiet, run, act, killColumns, killAllBut, mkInvaderShot, TUNING as T, RULES as R,
} from './helpers.js';

const ROLLING = SHOT_TYPES.indexOf('rolling');
const PLUNGER = SHOT_TYPES.indexOf('plunger');
const SQUIGGLY = SHOT_TYPES.indexOf('squiggly');

// ---- player shot -----------------------------------------------------------

test('a FIRE down action spawns one shot above the cannon and increments the fired-shot counter', () => {
  const s = quiet(newGame());
  step(s, [act(s, 'FIRE')]);
  assert.ok(s.playerShot, 'shot exists');
  assert.equal(s.shotsFired, 1);
  const expectedX = s.cannon.x + Math.floor((T.CANNON_W - T.PLAYER_SHOT_W) / 2);
  assert.equal(s.playerShot.x, expectedX);
  assert.equal(s.playerShot.y, T.CANNON_Y - T.PLAYER_SHOT_H - T.PLAYER_SHOT_SPEED, 'spawned at the cannon and moved once');
});

test('firing while a player shot is already live is a no-op and does not increment the shot counter, so it cannot advance the UFO cycle', () => {
  const s = quiet(newGame());
  step(s, [act(s, 'FIRE')]);
  const y1 = s.playerShot.y;
  step(s, [act(s, 'FIRE', 'up')]);
  step(s, [act(s, 'FIRE', 'down')]);
  assert.equal(s.shotsFired, 1, 'counter unchanged');
  assert.equal(s.playerShot.y, y1 - 2 * T.PLAYER_SHOT_SPEED, 'the same shot kept flying');
});

test('a shot that leaves the top of the field frees the player shot slot on the same step', () => {
  const s = quiet(newGame());
  s.playerShot = { x: 50, y: 0 }; // bottom edge will reach y <= 0 after one step
  step(s, []);
  assert.equal(s.playerShot, null);
  step(s, [act(s, 'FIRE')]);
  assert.ok(s.playerShot, 'a new shot can be fired on the very next step');
  assert.equal(s.shotsFired, 1);
});

test('a shot whose bottom edge is still inside the field at the top stays live', () => {
  const s = quiet(newGame());
  s.playerShot = { x: 50, y: T.PLAYER_SHOT_SPEED - T.PLAYER_SHOT_H + 1 }; // ends with 1px still on screen
  step(s, []);
  assert.ok(s.playerShot);
  assert.equal(s.playerShot.y + T.PLAYER_SHOT_H, 1);
});

test('holding FIRE does not fire again on later steps without a new down edge', () => {
  const s = quiet(newGame());
  step(s, [act(s, 'FIRE')]);
  run(s, 80); // long enough for the shot to leave the field
  assert.equal(s.playerShot, null);
  assert.equal(s.shotsFired, 1);
});

test('a player shot hitting the top row scores 30 and the bottom row scores 10', () => {
  for (const [row, points] of [[4, 30], [0, 10]]) {
    const s = quiet(newGame());
    killAllBut(s, [alienIndex(5, row)]);
    const a = s.rack.aliens[alienIndex(5, row)];
    s.playerShot = { x: a.x + 5, y: a.y + T.ALIEN_H + 1 };
    step(s, []);
    assert.equal(a.alive, false);
    assert.equal(s.score, points);
    assert.equal(s.playerShot, null);
  }
});

// ---- invader shots ---------------------------------------------------------

function armed(state, type) {
  state.nextInvaderShotType = type;
  state.invaderReload = 0;
  return state;
}

test('a plunger shot whose scheduled column is entirely dead skips to the next table entry within the same step', () => {
  const s = quiet(newGame());
  s.plungerIndex = 0; // table[0] = column 1
  assert.equal(R.PLUNGER_COLUMNS[0], 1);
  assert.equal(R.PLUNGER_COLUMNS[1], 7);
  killColumns(s, [0]);
  armed(s, PLUNGER);
  step(s, []);
  assert.equal(s.invaderShots.length, 1);
  assert.equal(s.invaderShots[0].type, 'plunger');
  assert.equal(s.plungerIndex, 2, 'both entries consumed in one step');
  const src = s.rack.aliens[alienIndex(6, 0)]; // column 7, bottom row
  assert.equal(s.invaderShots[0].x, src.x + Math.floor((T.ALIEN_W_BOTTOM - T.INVADER_SHOT_W) / 2));
  assert.equal(s.invaderShots[0].y, src.y + T.ALIEN_H);
});

test('the plunger table wraps from index 15 back to index 0', () => {
  const s = quiet(newGame());
  assert.equal(R.PLUNGER_COLUMNS.length, 16);
  s.plungerIndex = 15; // column 8
  armed(s, PLUNGER);
  step(s, []);
  assert.equal(s.invaderShots.length, 1);
  assert.equal(s.plungerIndex, 0);
  const src = s.rack.aliens[alienIndex(R.PLUNGER_COLUMNS[15] - 1, 0)];
  assert.equal(s.invaderShots[0].x, src.x + Math.floor((T.ALIEN_W_BOTTOM - T.INVADER_SHOT_W) / 2));
});

test('the squiggly table wraps from index 14 back to index 0', () => {
  const s = quiet(newGame());
  assert.equal(R.SQUIGGLY_COLUMNS.length, 15);
  s.squigglyIndex = 14; // column 10
  armed(s, SQUIGGLY);
  step(s, []);
  assert.equal(s.invaderShots.length, 1);
  assert.equal(s.invaderShots[0].type, 'squiggly');
  assert.equal(s.squigglyIndex, 0);
  const src = s.rack.aliens[alienIndex(R.SQUIGGLY_COLUMNS[14] - 1, 0)];
  assert.equal(s.invaderShots[0].x, src.x + Math.floor((T.ALIEN_W_BOTTOM - T.INVADER_SHOT_W) / 2));
});

test('a plunger whose entire table has no living column fires nothing this tick and leaves its index where it started; there is no fall-through to another type', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(4, 0), alienIndex(4, 1)]); // two aliens so the plunger is enabled; column 5 is in neither table
  assert.ok(!R.PLUNGER_COLUMNS.includes(5));
  s.plungerIndex = 3;
  s.squigglyIndex = 4;
  armed(s, PLUNGER);
  step(s, []);
  assert.equal(s.invaderShots.length, 0, 'no shot of any type');
  assert.equal(s.plungerIndex, 3);
  assert.equal(s.squigglyIndex, 4);
  assert.equal(s.nextInvaderShotType, SQUIGGLY, 'the round robin still moved on');
});

test('a rolling shot spawns from the lowest living alien in the column nearest the cannon', () => {
  const s = quiet(newGame());
  s.cannon.x = 100; // centre 106.5: column 5 centre is 110, column 4 centre is 94
  s.rack.aliens[alienIndex(5, 0)].alive = false; // lowest living in column 5 is row 1
  armed(s, ROLLING);
  step(s, []);
  assert.equal(s.invaderShots.length, 1);
  assert.equal(s.invaderShots[0].type, 'rolling');
  const src = s.rack.aliens[alienIndex(5, 1)];
  assert.equal(s.invaderShots[0].x, src.x + Math.floor((T.ALIEN_W_BOTTOM - T.INVADER_SHOT_W) / 2));
  assert.equal(s.invaderShots[0].y, src.y + T.ALIEN_H);
});

test('an invader shot from a top-type alien spawns centred under its narrow box, not under the cell', () => {
  const s = quiet(newGame());
  killColumns(s, [0, 1, 2, 3, 4, 5, 7, 8, 9, 10]);
  for (let row = 0; row < 4; row++) s.rack.aliens[alienIndex(6, row)].alive = false; // only column 7's top alien
  s.rack.aliens[alienIndex(0, 0)].alive = true; // a second alien so the plunger is not disabled
  s.plungerIndex = 1; // column 7
  armed(s, PLUNGER);
  step(s, []);
  assert.equal(s.invaderShots.length, 1);
  const src = s.rack.aliens[alienIndex(6, 4)];
  const inset = Math.floor((T.ALIEN_W_BOTTOM - T.ALIEN_W_TOP) / 2);
  assert.equal(s.invaderShots[0].x, src.x + inset + Math.floor((T.ALIEN_W_TOP - T.INVADER_SHOT_W) / 2));
});

test('with a UFO on screen, a fourth invader shot cannot spawn while three exist, and only two may exist alongside it', () => {
  // The UFO holds the squiggly's slot, so with a UFO the most the invaders can field is rolling + plunger.
  const s = quiet(newGame());
  s.ufo = { x: 100, dir: 1 };
  s.invaderShots = [mkInvaderShot('rolling'), mkInvaderShot('plunger'), mkInvaderShot('squiggly')];
  for (const t of [ROLLING, PLUNGER, SQUIGGLY]) {
    s.nextInvaderShotType = t;
    assert.equal(tryFireInvaderShot(s), false, `type ${t} cannot make a fourth`);
  }
  assert.equal(s.invaderShots.length, 3);
  s.invaderShots = [mkInvaderShot('rolling'), mkInvaderShot('plunger')];
  s.nextInvaderShotType = SQUIGGLY;
  assert.equal(tryFireInvaderShot(s), false, 'the UFO holds the squiggly slot');
  assert.equal(s.invaderShots.length, 2);
  s.invaderShots = [mkInvaderShot('rolling')];
  s.nextInvaderShotType = PLUNGER;
  assert.equal(tryFireInvaderShot(s), true, 'the plunger slot is unaffected by the UFO');
  assert.equal(s.invaderShots.length, 2);
});

test('without a UFO, a third invader shot may spawn but a fourth may not', () => {
  const s = quiet(newGame());
  s.invaderShots = [mkInvaderShot('rolling'), mkInvaderShot('plunger')];
  s.nextInvaderShotType = SQUIGGLY;
  assert.equal(tryFireInvaderShot(s), true);
  assert.equal(s.invaderShots.length, 3);
  for (const t of [ROLLING, PLUNGER, SQUIGGLY]) {
    s.nextInvaderShotType = t;
    assert.equal(tryFireInvaderShot(s), false);
  }
  assert.equal(s.invaderShots.length, 3);
});

test('a type whose own shot is still live does not fire, and the round robin moves on to the next type for the following attempt', () => {
  const s = quiet(newGame());
  s.invaderShots = [mkInvaderShot('rolling')];
  s.nextInvaderShotType = ROLLING;
  assert.equal(tryFireInvaderShot(s), false, 'rolling is busy; nothing else fires in its place');
  assert.equal(s.invaderShots.length, 1);
  assert.equal(s.nextInvaderShotType, PLUNGER);
  assert.equal(tryFireInvaderShot(s), true);
  assert.equal(s.invaderShots[1].type, 'plunger');
  assert.equal(s.nextInvaderShotType, SQUIGGLY);
});

// ---- B: plunger disabled at one alien; UFO shares the squiggly slot -------

test('with one alien remaining, no plunger shot is ever scheduled and the plunger table index does not advance', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(0, 0)]); // column 1 is in the plunger table, so only the disable rule can stop it
  assert.equal(R.PLUNGER_COLUMNS[0], 1);
  s.plungerIndex = 0;
  s.nextInvaderShotType = PLUNGER;
  for (let attempt = 0; attempt < 6; attempt++) {
    s.nextInvaderShotType = PLUNGER;
    s.invaderShots = [];
    assert.equal(tryFireInvaderShot(s), false, `attempt ${attempt}`);
  }
  assert.equal(s.plungerIndex, 0);
  // through the real reload path over many ticks as well
  s.invaderReload = 0;
  s.nextInvaderShotType = PLUNGER;
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    step(s, []);
    for (const sh of s.invaderShots) seen.add(sh.type);
  }
  assert.equal(seen.has('plunger'), false);
  assert.equal(s.plungerIndex, 0);
});

test('with one alien remaining, rolling and squiggly shots are still scheduled', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(0, 0)]); // column 1 appears in the squiggly table too
  s.nextInvaderShotType = ROLLING;
  assert.equal(tryFireInvaderShot(s), true);
  assert.equal(s.invaderShots[0].type, 'rolling');
  s.nextInvaderShotType = SQUIGGLY;
  assert.equal(tryFireInvaderShot(s), true);
  assert.equal(s.invaderShots[1].type, 'squiggly');
});

test('with two aliens remaining, plunger scheduling still occurs', () => {
  const s = quiet(newGame());
  killAllBut(s, [alienIndex(0, 0), alienIndex(6, 0)]);
  s.plungerIndex = 0; // column 1
  s.nextInvaderShotType = PLUNGER;
  assert.equal(tryFireInvaderShot(s), true);
  assert.equal(s.invaderShots[0].type, 'plunger');
  assert.equal(s.plungerIndex, 1);
});

test('a squiggly shot cannot spawn while a UFO is on screen, and the UFO cannot appear while a squiggly is in flight', () => {
  const s = quiet(newGame());
  s.ufo = { x: 100, dir: 1 };
  s.nextInvaderShotType = SQUIGGLY;
  s.squigglyIndex = 0;
  assert.equal(tryFireInvaderShot(s), false);
  assert.equal(s.invaderShots.length, 0);
  assert.equal(s.squigglyIndex, 0, 'the squiggly table did not advance');

  const t = quiet(newGame());
  t.ufoTimer = 0;
  t.invaderShots = [mkInvaderShot('squiggly', 100, 100)];
  run(t, 3);
  assert.equal(t.ufo, null, 'no UFO while the squiggly flies');
  t.invaderShots = [mkInvaderShot('rolling', 100, 100), mkInvaderShot('plunger', 120, 100)];
  step(t, []);
  assert.ok(t.ufo, 'rolling and plunger in flight do not block the UFO');
});

// ---- D: player shot versus invader missile -------------------------------

// Find an rng counter from which the next draw lands on the wanted branch.
function counterFor(state, type, survive) {
  for (let c = 0; c < 10000; c++) {
    const probe = { rng: { seed: state.rng.seed, counter: c } };
    if (missileSurvives(probe, type) === survive) return c;
  }
  throw new Error('no counter found');
}

test('a player shot colliding with a rolling missile is destroyed on that step', () => {
  const s = quiet(newGame());
  s.invaderShots = [mkInvaderShot('rolling', 100, 150)];
  s.playerShot = { x: 101, y: 150 + T.INVADER_SHOT_H + 1 };
  step(s, []);
  assert.equal(s.playerShot, null);
});

test('the player shot slot is freed on the same step as the collision, so FIRE on the next step spawns a new shot', () => {
  const s = quiet(newGame());
  s.invaderShots = [mkInvaderShot('rolling', 100, 150)];
  s.playerShot = { x: 101, y: 150 + T.INVADER_SHOT_H + 1 };
  s.shotsFired = 1;
  step(s, []);
  assert.equal(s.playerShot, null);
  step(s, [act(s, 'FIRE')]);
  assert.ok(s.playerShot);
  assert.equal(s.shotsFired, 2);
});

test('with the rng forced to its surviving branch, the invader missile continues on its original path with its column schedule unchanged', () => {
  const s = quiet(newGame());
  s.rng.counter = counterFor(s, 'rolling', true);
  s.plungerIndex = 5;
  s.squigglyIndex = 7;
  s.nextInvaderShotType = PLUNGER;
  s.invaderShots = [mkInvaderShot('rolling', 100, 150)];
  s.playerShot = { x: 101, y: 150 + T.INVADER_SHOT_H + 1 };
  const counter = s.rng.counter;
  step(s, []);
  assert.equal(s.playerShot, null, 'the player shot always dies');
  assert.equal(s.invaderShots.length, 1, 'the missile survived');
  assert.equal(s.invaderShots[0].type, 'rolling');
  assert.equal(s.invaderShots[0].x, 100, 'same column');
  assert.equal(s.invaderShots[0].y, 150 + T.INVADER_SHOT_SPEED, 'kept descending at its speed');
  assert.equal(s.rng.counter, counter + 1, 'exactly one draw was made');
  assert.equal(s.plungerIndex, 5);
  assert.equal(s.squigglyIndex, 7);
  assert.equal(s.nextInvaderShotType, PLUNGER);
  step(s, []);
  assert.equal(s.invaderShots[0].y, 150 + 2 * T.INVADER_SHOT_SPEED);
});

test('with the rng forced to its destroyed branch, a squiggly missile is removed on the collision step', () => {
  const s = quiet(newGame());
  s.rng.counter = counterFor(s, 'squiggly', false);
  s.invaderShots = [mkInvaderShot('squiggly', 100, 150)];
  s.playerShot = { x: 101, y: 150 + T.INVADER_SHOT_H + 1 };
  step(s, []);
  assert.equal(s.playerShot, null);
  assert.equal(s.invaderShots.length, 0);
});

test('the tuned survival chances make the squiggly the survivor and the other two usually die', () => {
  const p = T.MISSILE_SURVIVAL_PERCENT;
  assert.ok(p.squiggly >= 90);
  assert.ok(p.rolling <= 50 && p.plunger <= 50);
  const s = quiet(newGame());
  let survived = 0;
  for (let i = 0; i < 1000; i++) if (missileSurvives(s, 'squiggly')) survived++;
  assert.ok(survived > 850, `squiggly survived ${survived}/1000`);
  survived = 0;
  for (let i = 0; i < 1000; i++) if (missileSurvives(s, 'rolling')) survived++;
  assert.ok(survived < 400, `rolling survived ${survived}/1000`);
});

test('a player shot that meets an invader missile does not erode the shield behind it', () => {
  const s = quiet(newGame());
  const sh = s.shields[0];
  const before = shieldPixelCount(sh);
  s.invaderShots = [mkInvaderShot('plunger', sh.x + 8, sh.y + sh.h + 1)];
  s.playerShot = { x: sh.x + 9, y: sh.y + sh.h + 1 + T.INVADER_SHOT_H + 1 };
  step(s, []);
  assert.equal(s.playerShot, null);
  assert.equal(shieldPixelCount(sh), before);
});

test('no invader shot spawns during the 16-step explosion freeze and one spawns on the 17th step', () => {
  const s = quiet(newGame());
  s.freezeSteps = R.EXPLOSION_FREEZE_STEPS;
  armed(s, PLUNGER);
  run(s, 16);
  assert.equal(s.invaderShots.length, 0);
  step(s, []);
  assert.equal(s.invaderShots.length, 1);
});

test('the invader reload counter is refilled from the seeded rng after a shot', () => {
  const s = quiet(newGame());
  armed(s, PLUNGER);
  const counter = s.rng.counter;
  step(s, []);
  assert.ok(s.invaderReload >= T.INVADER_RELOAD_STEPS);
  assert.ok(s.invaderReload <= T.INVADER_RELOAD_STEPS + T.INVADER_RELOAD_JITTER);
  assert.equal(s.rng.counter, counter + 1);
});

test('an invader shot moves INVADER_SHOT_SPEED px per step and is removed when it reaches the ground', () => {
  const s = quiet(newGame());
  s.invaderShots = [mkInvaderShot('plunger', 100, 150)];
  step(s, []);
  assert.equal(s.invaderShots[0].y, 150 + T.INVADER_SHOT_SPEED);
  s.invaderShots = [mkInvaderShot('plunger', 100, T.GROUND_Y - T.INVADER_SHOT_H - 1)];
  step(s, []);
  assert.equal(s.invaderShots.length, 0);
});

test('an invader shot overlapping the cannon costs a life, clears invader shots and starts the death pause', () => {
  const s = quiet(newGame());
  s.cannon.x = 20;
  s.invaderShots = [
    mkInvaderShot('rolling', s.cannon.x + 5, T.CANNON_Y - T.INVADER_SHOT_H - 1),
    mkInvaderShot('plunger', 150, 100),
  ];
  step(s, []);
  assert.equal(s.lives, 2);
  assert.equal(s.invaderShots.length, 0);
  assert.equal(s.cannon.deadSteps, T.CANNON_DEATH_STEPS);
  assert.equal(s.gameOver, false);
  run(s, T.CANNON_DEATH_STEPS);
  assert.equal(s.cannon.deadSteps, 0);
  assert.equal(s.cannon.x, T.CANNON_START_X, 'cannon respawns at its start position');
});

test('the rack does not move during the cannon death pause', () => {
  const s = quiet(newGame());
  s.cannon.deadSteps = 10;
  const x0 = s.rack.originX;
  const c0 = s.rack.cursor;
  run(s, 10);
  assert.equal(s.rack.originX, x0);
  assert.equal(s.rack.cursor, c0);
});

test('losing the last cannon ends the game immediately', () => {
  const s = quiet(newGame());
  s.lives = 1;
  s.cannon.x = 20;
  s.invaderShots = [mkInvaderShot('rolling', 25, T.CANNON_Y - T.INVADER_SHOT_H - 1)];
  step(s, []);
  assert.equal(s.lives, 0);
  assert.equal(s.gameOver, true);
});
