import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as constants from '../src/core/constants.js';

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core');

const forbidden = [
  /\bDate\b/, /\bperformance\b/, /Math\.random/, /\bdocument\b/, /\bwindow\b/,
  /\blocalStorage\b/, /\bsessionStorage\b/, /\bglobalThis\b/, /\brequestAnimationFrame\b/,
  /\bsetTimeout\b/, /\bsetInterval\b/,
];

test('no file under src/core references Date, performance, Math.random, DOM globals, storage or timers', () => {
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 8, `expected the core modules, found ${files.length}`);
  for (const f of files) {
    const src = readFileSync(join(coreDir, f), 'utf8');
    for (const re of forbidden) {
      assert.equal(re.test(src), false, `${f} matches ${re}`);
    }
  }
});

test('no file under src/core declares a mutable module-level binding', () => {
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = readFileSync(join(coreDir, f), 'utf8');
    assert.equal(/^(export\s+)?(let|var)\s/m.test(src), false, `${f} has a top-level let/var`);
  }
});

test('constants.js exports only TUNING', () => {
  assert.deepEqual(Object.keys(constants), ['TUNING']);
  assert.ok(Object.isFrozen(constants.TUNING));
});
