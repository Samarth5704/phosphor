// Phase 3a: the token file, before anything consumes it. Contrast ratios are
// printed as numbers on every run; the number is the output, not the pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tokens from '../src/tokens.js';
import {
  HUD_PAIRS, GEL_BANDS, RAMP_GAMMA, INTENSITY_FLOOR,
  HALF_LIFE_AT_55, HALF_LIFE_AT_1, HALF_LIFE_REDUCED_MOTION,
  halfLifeFor, decayPerStep, rampGrey, tintAt, contrastRatio, relativeLuminance,
  applyTokens, cssCustomProperties, trailLengthPx, fullTrailSteps, TRAIL_CUTOFF_GREY, TRAIL_CUTOFF_INTENSITY, TRAIL_CUTOFF_HALF_LIVES, COLORS, BACKDROP_PADDING, SPACING,
} from '../src/tokens.js';
import { canonical } from '../src/core/serialise.js';
import { RULES } from '../src/core/rules.js';
import { newGame, run, TUNING } from './helpers.js';
import { rackStartY, ALIEN_COUNT } from '../src/core/rack.js';
import { listJsFiles } from './purity-scan.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALIENS = RULES.RACK_COLS * RULES.RACK_ROWS; // 55

// ---- contrast ----------------------------------------------------------------

test('every HUD foreground/background pair prints its computed WCAG ratio and clears 4.5:1', () => {
  // Reference values from the WCAG 2.x definition: white on black is 21:1.
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);

  const rows = HUD_PAIRS.map((p) => ({ pair: p.name, fg: p.fg, bg: p.bg, ratio: contrastRatio(p.fg, p.bg) }));
  const width = Math.max(...rows.map((r) => r.pair.length));
  console.log('\nHUD contrast (WCAG 2.x relative luminance):');
  for (const r of rows) {
    console.log(`  ${r.pair.padEnd(width)}  ${r.fg} on ${r.bg}  ${r.ratio.toFixed(2)}:1`);
  }
  assert.ok(rows.length >= 4, 'the HUD has at least four named pairs');
  for (const r of rows) {
    assert.ok(r.ratio >= 4.5, `${r.pair}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, below 4.5:1`);
  }
});

// ---- decay as half-life --------------------------------------------------------

test('halfLifeFor(55) and halfLifeFor(1) return the documented endpoint values', () => {
  assert.equal(halfLifeFor(55), HALF_LIFE_AT_55);
  assert.equal(halfLifeFor(1), HALF_LIFE_AT_1);
  assert.equal(HALF_LIFE_AT_55, 4);
  assert.equal(HALF_LIFE_AT_1, 2);
  assert.equal(halfLifeFor(28), 3, 'the midpoint of a linear interpolation between 2 and 4');
});

test('a shot fired at wave start does not leave a trail spanning the full field height: at 55 aliens the player shot trail is 25% to 40% of the field', () => {
  // Deliberately coupled to TUNING: a change to PLAYER_SHOT_SPEED fails here
  // rather than silently changing the look.
  assert.equal(TRAIL_CUTOFF_GREY, 8);
  assert.equal(rampGrey(TRAIL_CUTOFF_INTENSITY), 8, 'the intensity cutoff renders as exactly the grey cutoff');
  assert.ok(rampGrey(TRAIL_CUTOFF_INTENSITY * 0.9) < 8 && rampGrey(TRAIL_CUTOFF_INTENSITY * 1.1) > 8);
  assert.ok(Math.abs(TRAIL_CUTOFF_HALF_LIVES - 6.24) < 0.01, `${TRAIL_CUTOFF_HALF_LIVES} half-lives take 1.0 to grey 8`);
  assert.ok(Math.abs(2 ** -TRAIL_CUTOFF_HALF_LIVES - TRAIL_CUTOFF_INTENSITY) < 1e-12, 'derived from the intensity cutoff, not restated');
  assert.ok(TRAIL_CUTOFF_INTENSITY > INTENSITY_FLOOR, 'the trail cutoff sits above the snap-to-zero floor, both in ramp-output space');
  const trail = trailLengthPx(TUNING.PLAYER_SHOT_SPEED, 55);
  const fraction = trail / RULES.FIELD_H;
  console.log(`  player shot trail at 55 aliens: ${trail.toFixed(1)}px = ${(100 * fraction).toFixed(1)}% of ${RULES.FIELD_H}px`);
  assert.ok(fraction >= 0.25 && fraction <= 0.40, `${(100 * fraction).toFixed(1)}% is outside 25%..40%`);
  const ratio = trailLengthPx(TUNING.PLAYER_SHOT_SPEED, 1) / trail;
  assert.ok(Math.abs(ratio - HALF_LIFE_AT_1 / HALF_LIFE_AT_55) < 1e-12, 'at one speed, trail scales exactly with half-life');
  assert.ok(ratio <= 0.5, `the 1-alien trail is at most half the wave-start trail (${ratio})`);
});

test('the cannon needs halfLife x log2(10) consecutive held steps to develop its full trail, so a tap at 55 aliens leaves a fraction of it', () => {
  const full = fullTrailSteps(55);
  assert.ok(Math.abs(full - HALF_LIFE_AT_55 * TRAIL_CUTOFF_HALF_LIVES) < 1e-12);
  assert.equal(fullTrailSteps(55), trailLengthPx(TUNING.CANNON_SPEED, 55) / TUNING.CANNON_SPEED, 'at 1 px/step, steps equal pixels');
  console.log(`  cannon full trail at 55 aliens: ${full.toFixed(1)} held steps = ${(full / 60).toFixed(2)} s; at 1 alien: ${fullTrailSteps(1).toFixed(1)} steps`);
  assert.ok(full > 20, 'a 20-step tap does not reach the full trail');
  assert.ok(fullTrailSteps(1) < full);
});

test('halfLifeFor is monotonic from 55 aliens down to 1 and no two adjacent alien counts share a half-life', () => {
  for (let n = ALIENS; n > 1; n--) {
    const here = halfLifeFor(n);
    const fewer = halfLifeFor(n - 1);
    assert.ok(fewer < here, `halfLifeFor(${n - 1}) = ${fewer} should be shorter than halfLifeFor(${n}) = ${here}`);
  }
});

test('halfLifeFor clamps outside 1..55 rather than extrapolating, so a cleared rack (0 alive) is not negative persistence', () => {
  assert.equal(halfLifeFor(0), HALF_LIFE_AT_1);
  assert.equal(halfLifeFor(56), HALF_LIFE_AT_55);
});

test('decayPerStep applied halfLifeFor(n) times to an intensity of 1.0 leaves exactly 0.5 within floating point tolerance, for n at 55, 28 and 1', () => {
  for (const n of [55, 28, 1]) {
    const h = halfLifeFor(n);
    assert.ok(Number.isInteger(h), `halfLifeFor(${n}) = ${h} is a whole number of steps, so "applied h times" is literal`);
    const d = decayPerStep(n);
    assert.ok(d > 0 && d < 1, `decayPerStep(${n}) = ${d}`);
    let v = 1.0;
    for (let i = 0; i < h; i++) v *= d;
    assert.ok(Math.abs(v - 0.5) < 1e-12, `after ${h} steps at ${n} aliens: ${v}`);
  }
});

test('decayPerStep is exactly 2 ** (-1 / halfLife) for every alien count', () => {
  for (let n = 1; n <= ALIENS; n++) {
    assert.equal(decayPerStep(n), 2 ** (-1 / halfLifeFor(n)));
  }
});

test('an intensity of 1.0 decayed at the 1-alien rate falls below 1/255 in fewer steps than at the 55-alien rate, and both reach exactly 0 rather than an epsilon', () => {
  // The renderer keeps intensities in a Float32Array and snaps anything below
  // INTENSITY_FLOOR to 0, so the buffer is verifiably clear. This test applies
  // that contract in a one-cell Float32Array.
  const stepsToClear = (n) => {
    const cell = new Float32Array(1);
    cell[0] = 1.0;
    const d = decayPerStep(n);
    let below255 = -1;
    let steps = 0;
    while (cell[0] !== 0) {
      cell[0] *= d;
      if (cell[0] < INTENSITY_FLOOR) cell[0] = 0;
      steps++;
      if (below255 < 0 && cell[0] < 1 / 255) below255 = steps;
      assert.ok(steps < 10000, `did not clear within 10000 steps at ${n} aliens`);
    }
    return { below255, steps, final: cell[0] };
  };
  const fast = stepsToClear(1);
  const slow = stepsToClear(55);
  assert.ok(fast.below255 < slow.below255, `1 alien: ${fast.below255} steps, 55 aliens: ${slow.below255} steps`);
  assert.equal(fast.final, 0);
  assert.equal(slow.final, 0);
  assert.ok(Object.is(fast.final, 0) && !Object.is(fast.final, -0));
  console.log(`  below 1/255: ${fast.below255} steps at 1 alien, ${slow.below255} steps at 55; cleared to 0 at ${fast.steps} and ${slow.steps}`);
});

test('the reduced-motion half-life is derived from the fast endpoint and is never greater than the smallest value halfLifeFor can return', () => {
  assert.equal(HALF_LIFE_REDUCED_MOTION, HALF_LIFE_AT_1);
  let smallest = Infinity;
  for (let n = -5; n <= ALIEN_COUNT + 5; n++) smallest = Math.min(smallest, halfLifeFor(n));
  assert.ok(HALF_LIFE_REDUCED_MOTION <= smallest, `reduced motion ${HALF_LIFE_REDUCED_MOTION} would smear more than the fastest normal state ${smallest}`);
});

// ---- ramp -----------------------------------------------------------------------

test('the highest intensity below INTENSITY_FLOOR renders as grey 0 and the lowest intensity above it renders as grey 1 or more, so the snap to zero changes no displayed pixel', () => {
  assert.ok(INTENSITY_FLOOR > 0 && INTENSITY_FLOOR < 1 / 255, `floor ${INTENSITY_FLOOR}`);
  const justBelow = INTENSITY_FLOOR * (1 - 1e-9);
  const justAbove = INTENSITY_FLOOR * (1 + 1e-9);
  assert.equal(rampGrey(justBelow), 0);
  assert.ok(rampGrey(justAbove) >= 1);
  // Nothing below the floor ever renders as more than 0.
  for (let k = 1; k <= 1000; k++) assert.equal(rampGrey(justBelow * (k / 1000)), 0);
  console.log(`  INTENSITY_FLOOR = ${INTENSITY_FLOOR.toExponential(3)} (rampGrey boundary at gamma ${RAMP_GAMMA})`);
});

test('the intensity ramp is monochrome: 0 maps to 0, 1 maps to 255, it is monotonic and never returns a hue', () => {
  assert.equal(rampGrey(0), 0);
  assert.equal(rampGrey(1), 255);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const g = rampGrey(i / 100);
    assert.ok(Number.isInteger(g) && g >= 0 && g <= 255, `rampGrey(${i / 100}) = ${g}`);
    assert.ok(g >= prev, 'monotonic');
    prev = g;
  }
  assert.ok(RAMP_GAMMA > 0 && RAMP_GAMMA <= 1, 'gamma at or below 1 lifts faint trails rather than crushing them');
  assert.equal(rampGrey(1.5), 255, 'clamped above 1');
  assert.equal(rampGrey(-0.5), 0, 'clamped below 0');
});

// ---- gel bands -------------------------------------------------------------------

test('the gel bands do not overlap and together with the untinted regions cover every y from 0 to 255 with no gap', () => {
  const covered = new Uint8Array(RULES.FIELD_H);
  for (const b of GEL_BANDS) {
    assert.ok(Number.isInteger(b.yStart) && Number.isInteger(b.yEnd), 'integer bounds');
    assert.ok(b.yStart < b.yEnd, `${b.tint}: yStart < yEnd`);
    assert.ok(b.yStart >= 0 && b.yEnd <= RULES.FIELD_H, `${b.tint}: inside the field`);
    for (let y = b.yStart; y < b.yEnd; y++) {
      assert.equal(covered[y], 0, `y=${y} is covered twice`);
      covered[y] = 1;
    }
  }
  for (let y = 0; y < RULES.FIELD_H; y++) assert.equal(covered[y], 1, `y=${y} is not covered`);
  const tints = GEL_BANDS.map((b) => b.tint);
  assert.ok(tints.includes('orange') && tints.includes('green') && tints.includes(null), 'orange, green and untinted');
});

test('no alien row of any wave 1..9 starts inside the orange band: the rack top edge, not RACK_START_Y, is what must clear it', () => {
  const orange = GEL_BANDS.find((b) => b.tint === 'orange');
  const failures = [];
  for (let wave = 1; wave <= RULES.WAVE_HEIGHT_CYCLE; wave++) {
    const originY = rackStartY(wave);
    for (let row = 0; row < RULES.RACK_ROWS; row++) {
      const top = originY - row * TUNING.RACK_ROW_SPACING;
      const bottom = top + TUNING.ALIEN_H;
      if (top < orange.yEnd && bottom > orange.yStart) failures.push(`wave ${wave} row ${row} at y ${top}..${bottom - 1}`);
    }
  }
  assert.deepEqual(failures, [], `alien rows overlapping the orange band [${orange.yStart}, ${orange.yEnd}):\n${failures.join('\n')}`);
});

test('the orange band covers the UFO row and the green band covers the shields and the cannon row', () => {
  for (let y = TUNING.UFO_Y; y < TUNING.UFO_Y + TUNING.UFO_H; y++) assert.equal(tintAt(y), 'orange', `UFO y=${y}`);
  for (let y = TUNING.SHIELD_Y; y < TUNING.CANNON_Y + TUNING.CANNON_H; y++) assert.equal(tintAt(y), 'green', `y=${y}`);
  assert.equal(tintAt(TUNING.RACK_START_Y), null, 'the wave-1 rack starts untinted');
  assert.equal(tintAt(0), null);
  assert.equal(tintAt(255), 'green');
});

// ---- state isolation -------------------------------------------------------------

test('the serialised simulation state contains no tokens value', () => {
  // Two independent checks, because a bare integer such as 8 legitimately
  // appears in both files (spacing 8px; cannon.x starts at 8) and a
  // value-only check would be either vacuous or a false alarm.
  //
  // 1. Keys: nothing in the state is named like a visual concern.
  // 2. Values: every non-integer and every string that tokens.js exports is
  //    absent from the canonical encoding. Non-integers cannot be there at all
  //    (the serialiser rejects them), which is the structural guarantee; the
  //    strings are checked by search.
  const state = run(newGame(42), 600);
  const encoded = canonical(state);

  const visualKey = /decay|half|life|tint|gel|ramp|gamma|colou?r|hud|font|space|spacing|band|css/i;
  const walkKeys = (v, path) => {
    if (v === null || typeof v !== 'object' || v instanceof Uint8Array) return;
    if (Array.isArray(v)) { v.forEach((x, i) => walkKeys(x, `${path}[${i}]`)); return; }
    for (const k of Object.keys(v)) {
      assert.doesNotMatch(k, visualKey, `state key ${path}.${k} looks like a visual token`);
      walkKeys(v[k], `${path}.${k}`);
    }
  };
  walkKeys(state, 'state');

  const leaves = [];
  const collect = (v) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'function') return;
    if (typeof v === 'object') { for (const k of Object.keys(v)) collect(v[k]); return; }
    leaves.push(v);
  };
  for (const v of Object.values(tokens)) collect(v);
  for (let n = 1; n <= ALIENS; n++) leaves.push(decayPerStep(n), halfLifeFor(n));
  assert.ok(leaves.length > 20, 'tokens exports enough leaves to make the check meaningful');

  for (const leaf of leaves) {
    if (typeof leaf === 'number' && !Number.isInteger(leaf)) {
      assert.ok(!encoded.includes('i' + String(leaf)), `non-integer token ${leaf} in state`);
    } else if (typeof leaf === 'string') {
      assert.ok(!encoded.includes('s' + leaf.length + ':' + leaf), `string token "${leaf}" in state`);
    }
  }
  // None of the per-step decay multipliers is an integer, so none can ever pass the serialiser.
  for (let n = 1; n <= ALIENS; n++) assert.ok(!Number.isInteger(decayPerStep(n)));
});

test('no module under src/core imports tokens.js or defines any decay, half-life or colour constant of its own, so a stale private copy fails here too', () => {
  const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core');
  // Definitions only: a binding, an object key, or a function whose name
  // carries a visual concern, or a hex colour literal. Prose in comments that
  // says persistence lives elsewhere is allowed.
  // A name is visual if one of these words is a whole segment of it: a
  // SNAKE_CASE segment (DECAY_AT_55), a camelCase hump (halfLifeFor), or the
  // whole lowercase start (decayFor). Substrings inside another word are not
  // (nextInt contains "tint" and is arithmetic).
  const snake = /(^|_)(DECAY|HALF_?LIFE|COLOU?R|TINT|GEL|GAMMA|RAMP|HUD|FONT)(_|$|\d)/;
  const camel = /[a-z0-9](Decay|HalfLife|Colou?r|Tint|Gel|Gamma|Ramp|Hud|Font)([A-Z0-9]|$)/;
  const lower = /^(decay|halfLife|colou?r|tint|gel|gamma|ramp|hud|font)([A-Z0-9]|$)/;
  const isVisualName = (name) => snake.test(name) || camel.test(name) || lower.test(name);
  assert.ok(isVisualName('DECAY_AT_55') && isVisualName('halfLifeFor') && isVisualName('decayConstant') && isVisualName('HALF_LIFE_AT_1'));
  assert.ok(!isVisualName('nextInt') && !isVisualName('PLUNGER_COLUMNS') && !isVisualName('freezeSteps'));

  const definedNames = (src) => {
    const names = [];
    for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.push(m[1]);
    for (const m of src.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) names.push(m[1]);
    for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.push(m[1]);
    return names;
  };
  const files = listJsFiles(coreDir);
  assert.ok(files.length >= 10);
  for (const p of files) {
    const src = readFileSync(p, 'utf8');
    assert.doesNotMatch(src, /tokens(\.js)?['"]/, `${p} imports tokens`);
    assert.doesNotMatch(src, /['"]#[0-9a-f]{3,8}['"]/i, `${p} declares a hex colour`);
    const bad = definedNames(src).filter(isVisualName);
    assert.deepEqual(bad, [], `${p} defines visual constants: ${bad.join(', ')}`);
  }
});

test('the message and HUD backdrops are fully opaque six-digit hex colours with no alpha channel, and the backdrop padding is one spacing step', () => {
  for (const [name, hex] of Object.entries(COLORS)) {
    assert.match(hex, /^#[0-9a-f]{6}$/, `${name} = ${hex} must be six-digit hex with no alpha`);
  }
  assert.equal(BACKDROP_PADDING, SPACING.sm);
});

// ---- CSS custom properties --------------------------------------------------------

test('applyTokens sets one custom property per HUD colour, spacing step and type step on the element it is given, and nothing else', () => {
  const set = new Map();
  const fakeRoot = { style: { setProperty: (k, v) => set.set(k, v) } };
  applyTokens(fakeRoot);
  const expected = cssCustomProperties();
  assert.ok(Object.keys(expected).length >= 10);
  assert.deepEqual(Object.fromEntries(set), expected);
  for (const k of set.keys()) assert.match(k, /^--[a-z0-9-]+$/, `property name ${k}`);
  for (const [k, v] of set) {
    if (k.startsWith('--color-')) assert.match(v, /^#[0-9a-f]{6}$/, `${k} = ${v}`);
    else assert.match(v, /^\d+px$/, `${k} = ${v}`);
  }
});

test('every HUD pair colour appears among the generated custom properties, so no colour needs a second declaration in CSS', () => {
  const values = new Set(Object.values(cssCustomProperties()));
  for (const p of HUD_PAIRS) {
    assert.ok(values.has(p.fg), `${p.name} fg ${p.fg}`);
    assert.ok(values.has(p.bg), `${p.name} bg ${p.bg}`);
  }
});
