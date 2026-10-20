import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

const source = process.env.DICE_NAVIGATION_SOURCE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('preparing armor clears an inherited rarity filter without committing game state', async () => {
  const f = await recoveryFixture(source);
  Object.assign(f.probe.ui, {view:'game', inventorySlot:'weapon', inventoryRarity:'7', inventoryPage:5});
  await f.click('inventory', {slot:'armor', resetRarity:'true'});
  assert.equal(f.probe.ui.view, 'inventory');
  assert.equal(f.probe.ui.inventorySlot, 'armor');
  assert.equal(f.probe.ui.inventoryRarity, '');
  assert.equal(f.probe.ui.inventoryPage, 0);
  assert.equal(f.S.encodeSave(f.probe.state), f.original);
  assert.deepEqual(f.writes, []);
});
test('viewing all preparation options clears a prior slot as well as its rarity', async () => {
  const f = await recoveryFixture(source);
  Object.assign(f.probe.ui, {view:'game', inventorySlot:'armor', inventoryRarity:'3', inventoryPage:2});
  await f.click('inventory', {slot:'', resetRarity:'true'});
  assert.equal(f.probe.ui.inventorySlot, '');
  assert.equal(f.probe.ui.inventoryRarity, '');
  assert.equal(f.probe.ui.inventoryPage, 0);
  assert.equal(f.S.encodeSave(f.probe.state), f.original);
  assert.deepEqual(f.writes, []);
});
test('ordinary inventory navigation retains the existing player-selected filters', async () => {
  const f = await recoveryFixture(source);
  Object.assign(f.probe.ui, {view:'game', inventorySlot:'relic', inventoryRarity:'4', inventoryPage:2});
  await f.click('inventory');
  assert.equal(f.probe.ui.inventorySlot, 'relic');
  assert.equal(f.probe.ui.inventoryRarity, '4');
  assert.equal(f.probe.ui.inventoryPage, 0);
  assert.deepEqual(f.writes, []);
});
test('protected memory blocks preparation navigation along with other game actions', async () => {
  const f = await recoveryFixture(source);
  f.storage.clear(); f.emit(null);
  const view = f.probe.ui.view;
  await f.click('inventory', {slot:'armor', resetRarity:'true'});
  assert.equal(f.probe.ui.view, view);
  assert.match(f.app.innerHTML, /data-save-recovery=/);
  assert.equal(f.S.encodeSave(f.probe.state), f.original);
  assert.deepEqual(f.writes, []);
});
