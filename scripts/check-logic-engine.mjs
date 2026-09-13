import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(process.argv[2] || resolve(backend, '../frontend'));
const source = resolve(backend, 'packages/logic-engine');
const manifest = JSON.parse(readFileSync(resolve(frontend, 'package.json')));
const dependency = manifest.dependencies?.['@logic-app/logic-engine'];
assert.ok(typeof dependency === 'string' && dependency.startsWith('file:vendor/'),
  'Frontend must use the generated archive for @logic-app/logic-engine');
const temporary = mkdtempSync(join(tmpdir(), 'logic-engine-parity-'));

function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(prefix, entry.name);
    return entry.isDirectory() ? files(join(directory, entry.name), relative) : [relative];
  }).sort();
}

try {
  execFileSync('tar', ['-xzf', resolve(frontend, dependency.slice(5)), '-C', temporary]);
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: source,
    encoding: 'utf8',
  }));
  const expected = packed.files.map((file) => file.path).sort();
  for (const target of [join(temporary, 'package'), resolve(frontend, 'node_modules/@logic-app/logic-engine')]) {
    assert.deepEqual(files(target), expected, 'Package file list differs from source');
    for (const file of expected) {
      assert.ok(readFileSync(join(source, file)).equals(readFileSync(join(target, file))),
        `Stale logic-engine package at ${file} run npm run export:logic-engine in backend`);
    }
  }
  console.log('Logic engine source archive and installed frontend package match');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
