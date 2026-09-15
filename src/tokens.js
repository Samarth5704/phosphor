// Design tokens: the single source of truth for every visual constant.
// Nothing consumes this file yet (Phase 3a is a review checkpoint); Phase 3b's
// renderer and Phase 5's shell import from here and from nowhere else.
//
// HARD CONSTRAINT — nothing in this file may enter the hashed simulation
// state. Decay, ramp, gels and colours are render concerns. src/core/ must
// never import this module, and no value here may be written onto a state
// object: if a decay value reached the state, the replay fixture would start
// depending on visual tuning and every colour tweak would invalidate
// determinism. tests/tokens.test.js asserts the serialised state carries no
// token value, and that no module under src/core/ imports this file or
// defines a decay, half-life or colour constant of its own.
//
// This file may import from src/core/ (it reads the rack size below); the
// reverse is never allowed.
//
// CSS custom properties are generated from these values by applyTokens();
// no colour is declared a second time in a stylesheet.

import { ALIEN_COUNT } from './core/rack.js';

// ---- phosphor intensity ramp ------------------------------------------------
// The play field is a buffer of intensities in 0..1. The ramp maps an
// intensity to a greyscale value in 0..255 and nothing else: monochrome only,
// no hue. Colour comes from the gel bands below, applied by position. A gamma
// below 1 lifts faint trails so the tail of a decaying shot stays visible for
// longer than a linear ramp would show it.
export const RAMP_GAMMA = 0.8;

export function rampGrey(intensity) {
  const i = Math.min(Math.max(intensity, 0), 1);
  return Math.round(255 * i ** RAMP_GAMMA);
}

// The floor is defined in ramp-output space: it is the boundary intensity
// below which rampGrey() returns 0, i.e. where 255 * i^gamma reaches the
// rounding threshold of 0.5. The renderer snaps any intensity below it to
// exactly 0, so a cleared buffer is verifiably all zeros rather than a field
// of epsilons, and the snap changes no displayed pixel because every snapped
// intensity already rendered as grey 0. Derived, so retuning RAMP_GAMMA moves
// it. Works out to about 4.1e-4.
export const INTENSITY_FLOOR = (0.5 / 255) ** (1 / RAMP_GAMMA);

// ---- gel bands --------------------------------------------------------------
// The original 1978 cabinet had a monochrome monitor; its colour came from
// strips of coloured cellophane over the glass, applied by screen position:
// an orange/red strip across the UFO row at the top and a green strip across
// the cannon, shields and lives at the bottom, with the rack untinted between.
// That is a documented property of the machine (computerarcheology.com,
// shmups.wiki); these exact row bounds and tint colours are ours.
//
// Bands partition the 224×256 logical space by y (y grows downward). A band's
// range is [yStart, yEnd). tint is null for the untinted region. tintAt(y)
// looks a row up. The renderer multiplies the ramp's grey by the tint.
export const GEL_TINTS = Object.freeze({
  orange: '#ff9a3c',
  green: '#4cff6a',
});

export const GEL_BANDS = Object.freeze([
  Object.freeze({ yStart: 0, yEnd: 32, tint: null }),
  // Ends at 56: the wave-1 rack's top row starts at y 56, and no alien may
  // begin a wave inside the orange. The UFO (y 40..47) still sits centred.
  Object.freeze({ yStart: 32, yEnd: 56, tint: 'orange' }),
  Object.freeze({ yStart: 56, yEnd: 184, tint: null }), // the rack
  Object.freeze({ yStart: 184, yEnd: 256, tint: 'green' }), // shields 192.., cannon 216.., ground 240
]);

export function tintAt(y) {
  for (const b of GEL_BANDS) if (y >= b.yStart && y < b.yEnd) return b.tint;
  return null;
}

// ---- decay, as half-life in steps ---------------------------------------------
// The persistence of the phosphor is a function of exactly one quantity,
// aliens alive. It is expressed as a half-life in simulation steps (1/60 s),
// never as a per-step multiplier, because a half-life is a number a reviewer
// can picture.
//
// Where a trail is judged to end is a GREY LEVEL, in ramp-output space: the
// displayed value below which a pixel stops reading as part of a moving
// object and becomes background. 8 of 255 is a display-dependent judgement,
// settled by looking at the 3b renderer on real screens, not by calculation;
// the intensity it corresponds to is derived through the inverse ramp. This
// is the same "off" definition INTENSITY_FLOOR uses (the grey-0 boundary);
// the two differ only in which grey level they draw the line at.
export const TRAIL_CUTOFF_GREY = 8;
export const TRAIL_CUTOFF_INTENSITY = (TRAIL_CUTOFF_GREY / 255) ** (1 / RAMP_GAMMA); // ~0.0132

// Half-lives needed to fall from 1.0 to TRAIL_CUTOFF_INTENSITY: ~6.24.
export const TRAIL_CUTOFF_HALF_LIVES = -Math.log2(TRAIL_CUTOFF_INTENSITY);

// The slow endpoint is derived from motion, not chosen by eye. A moving
// object's visible trail is
//   speed (px/step) x halfLife (steps) x TRAIL_CUTOFF_HALF_LIVES.
// The player shot moves 3 px/step (TUNING.PLAYER_SHOT_SPEED), and its trail
// at 55 aliens must lie between 25% and 40% of the 256 px field height, so a
// shot fired at wave start does not streak the whole screen: 64..102 px,
// which bounds the half-life to 3.4..5.5 steps. With the fast endpoint at 2
// and a whole-step midpoint, 4 is the one value inside that band: 74.9 px
// (29%). The test in tests/tokens.test.js couples this to TUNING
// deliberately, so a change to shot speed fails there rather than silently
// ruining the look.
//
// The fast endpoint is 2 steps: at 1 alien the shot's trail is 37.5 px (15%)
// and the field is nearly hard-edged.
//
// Interpolation is LINEAR in aliens alive between the endpoints. The three
// counts a reviewer will check (55, 28, 1) land on whole steps: 4, 3, 2.
//
// The cannon moves 1 px/step, so its smear is a function of how long a
// movement key is HELD, not of speed alone: the full trail only develops
// after halfLife x TRAIL_CUTOFF_HALF_LIVES consecutive steps of movement
// (25.0 steps, 0.42 s, at 55 aliens). A tap leaves almost no tail. See
// fullTrailSteps().
export const HALF_LIFE_AT_55 = 4;
export const HALF_LIFE_AT_1 = 2;

// Under prefers-reduced-motion the half-life is pinned to the fastest normal
// value regardless of aliens alive: derived, not free, so reduced motion can
// never smear more than the fastest state the game reaches on its own. It
// removes the smear and nothing else; tempo, positions and score are
// untouched.
export const HALF_LIFE_REDUCED_MOTION = HALF_LIFE_AT_1;

export function halfLifeFor(aliensAlive) {
  const n = Math.min(Math.max(aliensAlive, 1), ALIEN_COUNT);
  const t = (n - 1) / (ALIEN_COUNT - 1);
  return HALF_LIFE_AT_1 + (HALF_LIFE_AT_55 - HALF_LIFE_AT_1) * t;
}

// Per-step intensity multiplier derived from the half-life, and only from it.
export function decayPerStep(aliensAlive) {
  return 2 ** (-1 / halfLifeFor(aliensAlive));
}

// Consecutive steps of held movement before a mover's trail reaches its full
// length: the trail is only as long as the distance covered while the oldest
// lit pixel is still above the cutoff. Independent of speed.
export function fullTrailSteps(aliensAlive) {
  return halfLifeFor(aliensAlive) * TRAIL_CUTOFF_HALF_LIVES;
}

// Visible trail length in px for something moving at `speed` px/step with
// `aliensAlive` aliens on the board: the distance covered during
// fullTrailSteps.
export function trailLengthPx(speed, aliensAlive) {
  return speed * fullTrailSteps(aliensAlive);
}

// ---- HUD colours -----------------------------------------------------------------
// The HUD is DOM over the canvas on an opaque backdrop, so every pair has one
// computable ratio. Named foreground/background pairs; the contrast test
// prints each ratio and fails below 4.5:1. Nothing here is a play-field
// colour: the field is monochrome plus gels.
// Every colour is a six-digit hex with no alpha channel: the two backdrops
// are fully opaque, which is what makes the ratios above single numbers
// rather than a range over whatever phosphor happens to be behind the text.
export const COLORS = Object.freeze({
  fieldBlack: '#000000', // letterbox and canvas clear colour
  hudBackdrop: '#050805', // opaque backdrop behind every HUD element
  hudText: '#7dff9e', // score, wave, lives count
  hudMuted: '#9ad9a8', // labels beside the values
  hudAlert: '#ffb454', // cannon lost, game over
  messageBackdrop: '#0c140e', // opaque; dialogs and the wave-start banner
  messageText: '#e8ffe8',
  focusRing: '#ffffff',
});

// A backdrop is the text's box plus this much opaque padding on every side,
// so the contrast pair is what the eye sees at the glyph edges too. The
// shell applies it as padding on the backdrop element in Phase 5.
export const BACKDROP_PADDING = 8; // px, = SPACING.sm

export const HUD_PAIRS = Object.freeze([
  Object.freeze({ name: 'hud value', fg: COLORS.hudText, bg: COLORS.hudBackdrop }),
  Object.freeze({ name: 'hud label', fg: COLORS.hudMuted, bg: COLORS.hudBackdrop }),
  Object.freeze({ name: 'hud alert', fg: COLORS.hudAlert, bg: COLORS.hudBackdrop }),
  Object.freeze({ name: 'message text', fg: COLORS.messageText, bg: COLORS.messageBackdrop }),
  Object.freeze({ name: 'message alert', fg: COLORS.hudAlert, bg: COLORS.messageBackdrop }),
  Object.freeze({ name: 'focus ring', fg: COLORS.focusRing, bg: COLORS.hudBackdrop }),
]);

// ---- spacing and type scales -----------------------------------------------------
// Pixels. Spacing is a 4px base; type is a small modular scale. Touch targets
// are 44px minimum (§6), which is why the scale reaches 44.
export const SPACING = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  touch: 44,
});

export const TYPE = Object.freeze({
  sm: 12,
  base: 14,
  md: 16,
  lg: 20,
  xl: 28,
});

// ---- WCAG contrast ---------------------------------------------------------------
// Relative luminance and contrast ratio per WCAG 2.x, so the test and any
// later tooling compute the same number.
function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fgHex, bgHex) {
  const a = relativeLuminance(fgHex);
  const b = relativeLuminance(bgHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ---- CSS custom properties -------------------------------------------------------
// Generated from the objects above; the stylesheet refers to var(--color-hud-text)
// and never restates a value. applyTokens(document.documentElement) is called
// once at boot by the shell in Phase 5. It is not called anywhere yet.
function kebab(name) {
  return name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).replace(/([a-z])(\d)/g, '$1-$2');
}

export function cssCustomProperties() {
  const props = {};
  for (const [k, v] of Object.entries(COLORS)) props[`--color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(SPACING)) props[`--space-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(TYPE)) props[`--type-${kebab(k)}`] = `${v}px`;
  return props;
}

export function applyTokens(documentElement) {
  for (const [k, v] of Object.entries(cssCustomProperties())) {
    documentElement.style.setProperty(k, v);
  }
}
