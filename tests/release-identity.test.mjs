import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Run unchanged against the actual input to reproduce its two stale UI labels.
const source = process.env.DICE_RELEASE_SOURCE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')).version;
const index = await fs.readFile(path.join(source, 'index.html'), 'utf8');
const V = await import(pathToFileURL(path.join(source, 'src/views.js')));
const E = await import(pathToFileURL(path.join(source, 'src/engine.js')));

test('the HTML release marker matches the actual package version', () => {
  assert.equal(index.match(/name="dice-abyss-release" content="([^"]+)"/)?.[1], version);
});
test('the rendered title identifies the current product version', () => {
  assert(V.titleView(null, '').includes(`DICE ABYSS / V${version}</span>`));
});
test('the rendered in-game footer identifies the current product version', () => {
  const stamp = version.split('.').map((part, index) => index === 0 ? part.padStart(2, '0') : part).join('.');
  assert(V.gameView(E.newGame(1414), {view:'game', busy:false}).includes(`VER ${stamp}　 INFINITE ABYSS`));
});
