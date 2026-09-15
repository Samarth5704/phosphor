// The purity scan for src/core/, shared by tests/purity.test.js (which runs it
// against the real tree) and by the test that proves it fails on a tree with
// Math.random in it. Not a test file: node --test only picks up *.test.js.
//
// Pure source scan, no execution: a forbidden identifier is forbidden even in
// dead code, because the next edit brings it to life.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const FORBIDDEN = Object.freeze([
  ['Date', /\bDate\b/],
  ['performance', /\bperformance\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['globalThis', /\bglobalThis\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
]);

// A top-level `let` or `var` is module state, which is exactly what the
// purity rule forbids. Matched at column 0 so block-scoped ones inside
// functions (indented) are allowed.
export const TOP_LEVEL_MUTABLE = /^(export\s+)?(let|var)\s/m;

export function listJsFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

// Returns a list of { file, rule, line } violations; empty means pure.
export function scanSource(file, src) {
  const violations = [];
  const lines = src.split('\n');
  for (const [rule, re] of FORBIDDEN) {
    lines.forEach((text, i) => {
      if (re.test(text)) violations.push({ file, rule, line: i + 1 });
    });
  }
  lines.forEach((text, i) => {
    if (TOP_LEVEL_MUTABLE.test(text)) violations.push({ file, rule: 'top-level let/var', line: i + 1 });
  });
  return violations;
}

export function scanDir(dir) {
  const violations = [];
  for (const p of listJsFiles(dir)) {
    violations.push(...scanSource(relative(dir, p), readFileSync(p, 'utf8')));
  }
  return violations;
}

export function formatViolations(violations) {
  return violations.map((v) => `${v.file}:${v.line} uses ${v.rule}`).join('\n');
}
