import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(process.argv[2] || resolve(backend, '../frontend'));
const vendor = resolve(frontend, 'vendor');
const manifest = JSON.parse(readFileSync(resolve(frontend, 'package.json')));
mkdirSync(vendor, { recursive: true });
const [packed] = JSON.parse(execFileSync('npm', [
  'pack', '--json', '--ignore-scripts', '--pack-destination', vendor,
], { cwd: resolve(backend, 'packages/logic-engine'), encoding: 'utf8' }));
const filename = `logic-engine-${packed.shasum}.tgz`;
renameSync(resolve(vendor, packed.filename), resolve(vendor, filename));
execFileSync('npm', [
  'install', `./vendor/${filename}`, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
], { cwd: frontend, stdio: 'inherit' });
const previous = manifest.dependencies?.['@logic-app/logic-engine'];
if (previous?.startsWith('file:vendor/') && previous !== `file:vendor/${filename}`) {
  rmSync(resolve(frontend, previous.slice(5)), { force: true });
}
console.log(`Exported ${filename}`);
