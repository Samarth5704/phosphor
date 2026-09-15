// Zero-test guard. `node --test "<dir>/*.test.js"` exits 0 with "pass 0" when
// the glob matches nothing, so a typo in the test script, a renamed directory
// or a mis-quoted glob turns the whole suite green by running nothing. This
// script runs the same glob the `test` script uses against the directory it is
// given and fails unless the TAP summary reports at least one test file, at
// least MIN_PASS passing tests and zero failures.
//
// Usage: node tests/zero-test-guard.mjs <dir>
// Exit 0 only when the suite genuinely ran.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Below this many passing tests something has been lost, not merely renamed.
// Raise it as the suite grows; never lower it without saying why in the commit.
const MIN_PASS = 100;

const dir = process.argv[2];
if (!dir) {
  console.error('zero-test-guard: usage: node tests/zero-test-guard.mjs <dir>');
  process.exit(2);
}

let files;
try {
  if (!statSync(dir).isDirectory()) throw new Error('not a directory');
  files = readdirSync(dir).filter((f) => f.endsWith('.test.js'));
} catch (e) {
  console.error(`zero-test-guard: cannot read ${dir}: ${e.message}`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`zero-test-guard: FAIL — no *.test.js files under ${dir}`);
  process.exit(1);
}

// When this script is itself spawned from inside `node --test` (its own tests
// do that), the child inherits NODE_TEST_CONTEXT and a nested `node --test`
// then behaves as a runner child, writing TAP nowhere we can read it. Strip it.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const result = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=tap', ...files.map((f) => join(dir, f))],
  { encoding: 'utf8', env },
);
const out = result.stdout || '';
const summary = (key) => {
  // Summary lines are "# pass 105"; tolerate CRLF on Windows.
  const m = out.match(new RegExp('^# ' + key + ' ([0-9]+)\\r?$', 'm'));
  return m ? Number(m[1]) : NaN;
};
const pass = summary('pass');
const fail = summary('fail');
const total = summary('tests');

console.log(`zero-test-guard: ${files.length} file(s), tests ${total}, pass ${pass}, fail ${fail}`);
if (!Number.isFinite(pass) || !Number.isFinite(fail)) {
  console.error('zero-test-guard: FAIL — could not read the TAP summary');
  console.error(out.slice(-2000));
  process.exit(1);
}
if (pass < MIN_PASS) {
  console.error(`zero-test-guard: FAIL — ${pass} passing tests is below the floor of ${MIN_PASS}`);
  process.exit(1);
}
if (fail > 0 || result.status !== 0) {
  console.error(`zero-test-guard: FAIL — ${fail} failing tests (node exit ${result.status})`);
  process.exit(1);
}
