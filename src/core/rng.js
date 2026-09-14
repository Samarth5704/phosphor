// Seeded generator whose only state is { seed, counter }. Each draw hashes
// (seed, counter) and increments the counter, so the generator has no hidden
// registers: cloning the two numbers clones the sequence exactly.

function mix(x) {
  // lowbias32 finaliser (Ellis, 2018): a good 32-bit integer hash.
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function createRng(seed) {
  return { seed: seed >>> 0, counter: 0 };
}

export function nextUint32(rng) {
  rng.counter = (rng.counter + 1) >>> 0;
  return mix((rng.seed ^ Math.imul(rng.counter, 0x9e3779b1)) >>> 0);
}

// Uniform-ish integer in [0, n). n is small everywhere it is used here, so the
// modulo bias is negligible and, more importantly, deterministic.
export function nextInt(rng, n) {
  return nextUint32(rng) % n;
}
