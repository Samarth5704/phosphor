// Canonical serialisation of a simulation state, as the input to the hash.
//
// JSON.stringify is the wrong tool for this, for four reasons this encoding
// handles explicitly:
//   1. Object key order follows insertion order, so two states built in a
//      different order stringify differently. Keys are sorted here.
//   2. A Uint8Array stringifies as an object with numeric string keys,
//      indistinguishable from such an object. Length and bytes are encoded
//      directly here.
//   3. An `undefined` field is dropped, so a field that became undefined
//      stringifies identically to one that was deleted. It gets its own
//      marker here.
//   4. -0 and 0 stringify identically but are different values. -0 gets its
//      own marker here.
//
// Every simulation field is an integer, so any other number is rejected: a
// float in the state would make the hash depend on the platform's floating
// point formatting, which is the one thing a cross-machine hash cannot
// tolerate.
//
// The encoding is a plain string. Each value starts with a one-letter tag;
// strings, arrays, objects and byte arrays are length-prefixed so no value
// can be confused with the structure around it.

function fail(path, msg) {
  throw new TypeError(`canonical: ${msg} at ${path || '<root>'}`);
}

function isPlainObject(v) {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function encode(v, path, seen, out) {
  if (v === null) { out.push('N'); return; }
  if (v === undefined) { out.push('U'); return; }
  switch (typeof v) {
    case 'boolean':
      out.push(v ? 'T' : 'F');
      return;
    case 'number':
      if (!Number.isInteger(v)) fail(path, `non-integer number ${String(v)}`);
      if (Object.is(v, -0)) { out.push('i-0'); return; }
      out.push('i' + String(v));
      return;
    case 'string':
      out.push('s' + v.length + ':' + v);
      return;
    case 'object':
      break;
    default:
      fail(path, `unsupported type ${typeof v}`);
  }
  if (seen.has(v)) fail(path, 'circular reference');
  seen.add(v);
  if (v instanceof Uint8Array) {
    let hex = '';
    for (let i = 0; i < v.length; i++) hex += (v[i] < 16 ? '0' : '') + v[i].toString(16);
    out.push('b' + v.length + ':' + hex);
  } else if (Array.isArray(v)) {
    out.push('[' + v.length + ':');
    for (let i = 0; i < v.length; i++) encode(v[i], path + '[' + i + ']', seen, out);
    out.push(']');
  } else if (isPlainObject(v)) {
    const keys = Object.keys(v).sort();
    out.push('{' + keys.length + ':');
    for (const k of keys) {
      out.push('k' + k.length + ':' + k);
      encode(v[k], path ? path + '.' + k : k, seen, out);
    }
    out.push('}');
  } else {
    const name = (v.constructor && v.constructor.name) || 'object';
    fail(path, `unsupported object ${name}`);
  }
  seen.delete(v);
}

export function canonical(value) {
  const out = [];
  encode(value, '', new Set(), out);
  return out.join('');
}
