// Browser entry for Phase 3b: the phosphor renderer running the committed
// clears-wave-one fixture. No keyboard handling; input comes from the
// recording. Everything with logic lives in the modules this imports and is
// tested in Node; this file only owns the canvas, the clock and the resize.

import { applyTokens, COLORS } from '../tokens.js';
import { FIXTURE } from '../../tests/fixtures/clears-wave-one.js';
import { createSession } from './session.js';
import { createMotionPreference } from './motion.js';
import { createTintTable, createRgba, compose } from './compose.js';
import { layoutViewport } from './viewport.js';
import { FIELD_W, FIELD_H } from './intensity.js';

applyTokens(document.documentElement);

const display = document.getElementById('field');
const displayCtx = display.getContext('2d', { alpha: false });

// The 224x256 backing canvas takes the ImageData; the display canvas gets it
// scaled by a whole number with smoothing off.
const backing = document.createElement('canvas');
backing.width = FIELD_W;
backing.height = FIELD_H;
const backingCtx = backing.getContext('2d');
const rgba = createRgba();
const image = new ImageData(rgba, FIELD_W, FIELD_H);
const tintTable = createTintTable();

const motion = createMotionPreference(window.matchMedia ? window.matchMedia.bind(window) : null);
const session = createSession({ recording: FIXTURE, motion });

// ---- viewport ---------------------------------------------------------------------

let view = layoutViewport(1, 1, 1);

function resize() {
  const rect = display.getBoundingClientRect();
  view = layoutViewport(rect.width, rect.height, window.devicePixelRatio || 1);
  if (display.width !== view.deviceW || display.height !== view.deviceH) {
    display.width = view.deviceW;
    display.height = view.deviceH;
  }
  // Setting width/height resets context state, so this follows every resize.
  displayCtx.imageSmoothingEnabled = false;
  display.dataset.scale = String(view.scale);
}

if (typeof ResizeObserver === 'function') {
  new ResizeObserver(resize).observe(display);
} else {
  window.addEventListener('resize', resize);
}
resize();

// ---- frame loop ---------------------------------------------------------------------

// Rolling per-frame timings in ms, for the Phase 3b report. Read them with
// phosphorStats() in the console.
const stats = { frames: 0, decay: 0, composite: 0, total: 0, steps: 0 };

function present(buffer = session.buffer) {
  compose(buffer, rgba, tintTable);
  backingCtx.putImageData(image, 0, 0);
  displayCtx.fillStyle = COLORS.fieldBlack;
  displayCtx.fillRect(0, 0, view.deviceW, view.deviceH);
  displayCtx.imageSmoothingEnabled = false;
  displayCtx.drawImage(backing, 0, 0, FIELD_W, FIELD_H, view.offsetX, view.offsetY, view.width, view.height);
}

let last = performance.now();

function frame(now) {
  const t0 = performance.now();
  const elapsed = now - last;
  last = now;
  const steps = session.advance(elapsed, () => performance.now());
  const t1 = performance.now();
  present();
  const t2 = performance.now();
  stats.frames++;
  stats.steps += steps;
  stats.decay += session.timing.decayMs;
  stats.composite += t2 - t1;
  stats.total += t2 - t0;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Averages since the last reset, in ms per frame.
window.phosphorStats = (reset = false) => {
  const n = stats.frames || 1;
  const out = {
    frames: stats.frames,
    stepsPerFrame: stats.steps / n,
    decayMs: stats.decay / n,
    compositeMs: stats.composite / n,
    totalMs: stats.total / n,
    aliensAlive: session.state.rack.aliens.filter((a) => a.alive).length,
    halfLife: session.halfLife(),
    reducedMotion: motion.reduced,
    scale: view.scale,
    offset: [view.offsetX, view.offsetY],
    device: [view.deviceW, view.deviceH],
  };
  if (reset) Object.assign(stats, { frames: 0, decay: 0, composite: 0, total: 0, steps: 0 });
  return out;
};
window.phosphorSession = session;

// Synchronous benchmark for the Phase 3b report: a fresh session on the
// fixture's seed with no input, so the alien count holds at exactly
// `aliensAlive` (all but that many are marked dead up front), timed over n
// frames of one step each the same way the live loop is, without waiting on
// requestAnimationFrame (which a hidden tab throttles to nothing).
window.phosphorBench = (n = 300, aliensAlive = 55) => {
  const bench = createSession({ recording: { ...FIXTURE, actions: [] }, motion });
  bench.state.rack.aliens.forEach((a, i) => { a.alive = i < aliensAlive; });
  bench.stepN(120); // let trails develop before timing
  let decay = 0;
  let composite = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    bench.stepN(1, () => performance.now());
    const t1 = performance.now();
    present(bench.buffer);
    const t2 = performance.now();
    decay += bench.timing.decayMs;
    composite += t2 - t1;
    total += t2 - t0;
  }
  return {
    frames: n,
    aliensAlive: bench.state.rack.aliens.filter((a) => a.alive).length,
    halfLife: bench.halfLife(),
    decayMs: decay / n,
    compositeMs: composite / n,
    totalMs: total / n,
  };
};
