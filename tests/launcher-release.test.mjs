import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyServerHtml, CURRENT_RELEASE } from '../scripts/launch.mjs';

const title = '<title>骰狱：无尽深渊 · Dice Abyss</title>';
const major = '<meta name="dice-abyss-build" content="5">';
const marker = version => `<meta name="dice-abyss-release" content="${version}">`;

test('an existing V5 server without release identity is rejected instead of opening the old folder', () => {
  const originalV5 = `${major}${title}`;
  assert.equal(classifyServerHtml(originalV5), 'other');
  assert.equal(classifyServerHtml(`${originalV5}${marker('5.0.0')}`), 'other');
});

test('only the expected release with the game title and save/build major is accepted', () => {
  assert.equal(classifyServerHtml(`${title}${major}${marker(CURRENT_RELEASE)}`), 'game');
  for (const version of ['unknown', '4.0.0', '5.0.0', '5.1.1', '6.0.0']) {
    assert.equal(classifyServerHtml(`${title}${major}${marker(version)}`, '5.1.0'), 'other');
  }
  assert.equal(classifyServerHtml(`${major}${marker(CURRENT_RELEASE)}<title>Other app</title>`), 'other');
  assert.equal(classifyServerHtml(`${title}<meta name="dice-abyss-build" content="4">${marker(CURRENT_RELEASE)}`), 'other');
});

test('release metadata handles quoted HTML attribute order and ignores commented markers', () => {
  const current = `<META content = '${CURRENT_RELEASE}' NAME = 'dice-abyss-release'>`;
  assert.equal(classifyServerHtml(`${title}${major}${current}`), 'game');
  assert.equal(classifyServerHtml(`${title}${major}<!-- ${marker(CURRENT_RELEASE)} -->`), 'other');
  assert.equal(classifyServerHtml(`${title}${major}<meta data-name="dice-abyss-release" data-content="${CURRENT_RELEASE}">`), 'other');
});

test('conflicting or duplicate release markers cannot certify a current local service', () => {
  assert.equal(classifyServerHtml(`${title}${major}${marker('5.0.0')}${marker(CURRENT_RELEASE)}`), 'other');
  assert.equal(classifyServerHtml(`${title}${major}${marker(CURRENT_RELEASE)}${marker(CURRENT_RELEASE)}`), 'other');
});

test('the shipped index identifies the same release as package metadata', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(classifyServerHtml(html), 'game');
});
