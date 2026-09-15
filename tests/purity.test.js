// The purity scan, as a test so it runs locally and in CI identically. Spec
// §5.5: src/core/ has no DOM, no clock, no Math.random, no storage, no
// globals, and no mutable module-level state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as constants from '../src/core/constants.js';
import { scanDir, scanSource, listJsFiles, formatViolations } from './purity-scan.js';

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core');

test('no file under src/core references Date, performance, Math.random, DOM globals, storage or timers, and none declares a top-level let or var', () => {
  const files = listJsFiles(coreDir);
  assert.ok(files.length >= 8, `expected the core modules, found ${files.length}`);
  const violations = scanDir(coreDir);
  assert.equal(violations.length, 0, `src/core is impure:\n${formatViolations(violations)}`);
});

test('the purity scan fails when Math.random is introduced anywhere under src/core/, including in a nested directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phosphor-purity-'));
  try {
    writeFileSync(join(dir, 'clean.js'), 'export function f(rng) { return rng(); }\n');
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'dirty.js'), 'export function g() {\n  return Math.random();\n}\n');
    const violations = scanDir(dir);
    assert.equal(violations.length, 1, formatViolations(violations));
    assert.equal(violations[0].rule, 'Math.random');
    assert.equal(violations[0].line, 2);
    assert.match(violations[0].file, /nested[\\/]dirty\.js$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the purity scan catches each forbidden identifier on its own and a top-level let or var, and passes an indented let', () => {
  for (const id of ['Date.now()', 'performance.now()', 'document.body', 'window.x', 'localStorage.x', 'setTimeout(f)', 'setInterval(f)']) {
    const v = scanSource('x.js', `export const t = ${id};\n`);
    assert.equal(v.length, 1, `${id} should be one violation, got ${formatViolations(v)}`);
  }
  assert.equal(scanSource('x.js', 'let counter = 0;\n').length, 1);
  assert.equal(scanSource('x.js', 'var counter = 0;\n').length, 1);
  assert.equal(scanSource('x.js', 'export let counter = 0;\n').length, 1);
  assert.equal(scanSource('x.js', 'export function f() {\n  let i = 0;\n  return i;\n}\n').length, 0);
  // Word boundaries: identifiers that merely contain a forbidden name are not violations.
  assert.equal(scanSource('x.js', 'export const updated = 1; // updateDate, DateTime, windowed\n').length, 0);
});

test('constants.js exports only TUNING', () => {
  assert.deepEqual(Object.keys(constants), ['TUNING']);
  assert.ok(Object.isFrozen(constants.TUNING));
});
