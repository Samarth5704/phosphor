import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const guard = join(dirname(fileURLToPath(import.meta.url)), 'zero-test-guard.mjs');

function runGuard(dir) {
  const r = spawnSync(process.execPath, [guard, dir], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('the zero-test guard exits non-zero on a directory with no test files, which node --test itself reports as pass 0 and exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phosphor-guard-'));
  try {
    const bare = spawnSync(process.execPath, ['--test', join(dir, '*.test.js')], { encoding: 'utf8' });
    assert.equal(bare.status, 0, 'precondition: node --test on an empty glob is green');
    const { status, out } = runGuard(dir);
    assert.equal(status, 1);
    assert.match(out, /no \*\.test\.js files/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the zero-test guard exits non-zero when the only test file passes but the pass count is below the floor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phosphor-guard-'));
  try {
    // CommonJS: the temp dir has no package.json, so an `import` would not parse there.
    writeFileSync(join(dir, 'one.test.js'), "const { test } = require('node:test'); test('one', () => {});\n");
    const { status, out } = runGuard(dir);
    assert.equal(status, 1);
    assert.match(out, /pass 1, fail 0/);
    assert.match(out, /below the floor/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
