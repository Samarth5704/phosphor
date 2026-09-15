// FNV-1a over the canonical encoding. Plain 32-bit integer arithmetic, so it
// runs identically in Node and in a browser with no imports.
//
// Two independent FNV-1a lanes with different offset bases give 64 bits of
// output, which makes an accidental collision between a changed and an
// unchanged state negligible for a replay gate. This is not a cryptographic
// hash and does not need to be: the fixture is trusted input.

import { canonical } from './serialise.js';

const FNV_PRIME = 0x01000193;
const FNV_BASIS = 0x811c9dc5;
const SECOND_BASIS = 0x9747b28c;

// Standard FNV-1a-32 over the string's UTF-16 code units, low byte then high
// byte. For ASCII input (which the canonical encoding of an all-ASCII state
// is) this equals FNV-1a over the bytes and matches the published vectors.
export function fnv1a32(str, basis = FNV_BASIS) {
  let h = basis >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), FNV_PRIME) >>> 0;
    if (c > 0xff) h = Math.imul(h ^ (c >>> 8), FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

function hex8(n) {
  return ('00000000' + n.toString(16)).slice(-8);
}

export function hashString(str) {
  return hex8(fnv1a32(str, FNV_BASIS)) + hex8(fnv1a32(str, SECOND_BASIS));
}

export function hashValue(value) {
  return hashString(canonical(value));
}

export function hashState(state) {
  return hashValue(state);
}
