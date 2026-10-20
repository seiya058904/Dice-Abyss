import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

// Run these actual app-handler regressions against an immutable input too:
// DICE_RECOVERY_SOURCE=/path/to/input node --test tests/inventory-run-reset.test.mjs
// The harness stubs rendering/focus/effects, not game rules, storage or handlers.
const source=process.env.DICE_RECOVERY_SOURCE||fileURLToPath(new URL('../',import.meta.url));
const {selectInventoryItems}=await import(pathToFileURL(path.resolve(source,'src/inventory-query.js')));
const fields=['inventorySlot','inventoryRarity','inventoryDefense','inventoryQuery','inventoryQueryDraft','inventoryPage','inventorySort'];
const choices=f=>Object.fromEntries(fields.map(key=>[key,f.probe.ui[key]]));
function previousChoices(f){
  Object.assign(f.probe.ui,{view:'inventory',inventorySlot:'armor',inventoryRarity:'7',inventoryDefense:'regen',inventoryQuery:'旧旅途',inventoryQueryDraft:'尚未提交的草稿',inventoryPage:3,inventorySort:'level'});
  return choices(f);
}
function assertFreshInventory(f){
  const s=f.probe.state;
  assert.equal(s.player.items.length,3,'The fixture has three owned starter items');
  assert.equal(selectInventoryItems(s.player.items,f.probe.ui).length,3,'A replacement journey exposes all three starters instead of an inherited empty result');
  for(const key of ['inventorySlot','inventoryRarity','inventoryDefense','inventoryQuery','inventoryQueryDraft'])assert.equal(f.probe.ui[key],'',`${key} belongs to the replaced journey`);
  assert.equal(f.probe.ui.inventoryPage,0);
  assert.equal(f.probe.ui.inventorySort,'level','Sorting is a harmless preference, not an exclusion filter');
  assert(f.S.validateSave(s));
  const raw=f.S.encodeSave(s);
  assert.equal(f.map.get(f.S.SAVE_KEY),raw);
  assert.equal(f.map.get(f.S.BACKUP_KEY),raw);
}
async function chooseImport(f,state){
  const raw=f.S.encodeSave(state);
  await f.click('settings');
  // Only native file selection/DOM containment are modeled. The original
  // change handler reads, decodes, reviews and later commits the full file.
  const input={id:'save-file',files:[{name:'replacement-journey.json',size:Buffer.byteLength(raw),text:async()=>raw}],value:'replacement-journey.json'};
  f.probe.dialog.contains=node=>node===input;
  await f.listeners.document.get('change')({target:input});
  assert.equal(input.value,'');
  assert.equal(typeof f.probe.pending,'function','Import reaches the real confirmation callback');
  return raw;
}

test('confirmed new journey clears prior exclusion filters while keeping the sort preference',async()=>{
  const f=await recoveryFixture(source),oldRun=f.probe.state.runId,oldChoices=previousChoices(f);
  await f.click('new');
  assert.deepEqual(choices(f),oldChoices,'Opening confirmation is read-only');
  assert.equal(f.S.encodeSave(f.probe.state),f.original);
  assert.deepEqual(f.writes,[]);
  await f.click('confirm');
  assert.notEqual(f.probe.state.runId,oldRun);
  assertFreshInventory(f);
  assert.deepEqual(f.writes.map(([key])=>key),[f.S.SAVE_KEY,f.S.BACKUP_KEY]);
});

test('confirmed imported replacement clears inherited filters and preserves its complete unknown metadata',async()=>{
  const f=await recoveryFixture(source),oldChoices=previousChoices(f),imported=f.E.newGame(19021);
  imported.qaImported={unicode:'新的旅途',nested:{keep:[null,17,{complete:true}]}};
  const raw=await chooseImport(f,imported);
  assert.deepEqual(choices(f),oldChoices,'Reading and reviewing a file does not change current filters');
  assert.equal(f.S.encodeSave(f.probe.state),f.original);
  assert.deepEqual(f.writes,[]);
  await f.click('confirm');
  assertFreshInventory(f);
  assert.equal(f.S.encodeSave(f.probe.state),raw,'The reset never modifies imported game data');
  assert.deepEqual(f.writes.map(([key])=>key),[f.S.SAVE_KEY,f.S.BACKUP_KEY]);
});

test('explicit same-run branch import also resets filters because the reviewed journey is replaced',async()=>{
  const f=await recoveryFixture(source);previousChoices(f);
  const imported=structuredClone(f.probe.state);imported.qaRecovery.nested.unknown.push('explicit imported branch');imported.player.gold++;
  const oldRun=f.probe.state.runId,oldRevision=f.probe.state.revision,raw=await chooseImport(f,imported);
  await f.click('confirm');
  assert.equal(f.probe.state.runId,oldRun);assert.equal(f.probe.state.revision,oldRevision);
  assertFreshInventory(f);assert.equal(f.S.encodeSave(f.probe.state),raw);
});

test('ordinary external new-run synchronization clears filters without rewriting the donor save',async()=>{
  const f=await recoveryFixture(source);previousChoices(f);
  const other=f.E.newGame(19022);other.qaDonor={preserve:['external',23]};const raw=f.S.encodeSave(other);
  f.map.set(f.S.SAVE_KEY,raw);f.map.set(f.S.BACKUP_KEY,raw);
  f.emit(f.S.SAVE_KEY,f.storage,{oldValue:f.original,newValue:raw});
  assertFreshInventory(f);assert.equal(f.S.encodeSave(f.probe.state),raw);assert.deepEqual(f.writes,[]);
});

test('ordinary same-run storage updates preserve every filter, draft, page and sort',async()=>{
  const f=await recoveryFixture(source),oldChoices=previousChoices(f);
  const changed=f.E.transition(f.probe.state,{type:'lock',id:f.probe.state.player.equipped.weapon}),raw=f.S.encodeSave(changed);
  assert.equal(changed.runId,f.probe.state.runId);assert(changed.revision>f.probe.state.revision);
  f.map.set(f.S.SAVE_KEY,raw);f.map.set(f.S.BACKUP_KEY,raw);
  f.emit(f.S.SAVE_KEY,f.storage,{oldValue:f.original,newValue:raw});
  assert.equal(f.S.encodeSave(f.probe.state),raw);assert.deepEqual(choices(f),oldChoices);assert.deepEqual(f.writes,[]);
});

test('identical mirror notifications keep current selections and game bytes unchanged',async()=>{
  const f=await recoveryFixture(source),oldChoices=previousChoices(f);
  f.emit(f.S.BACKUP_KEY,f.storage,{oldValue:f.original,newValue:f.original});
  assert.deepEqual(choices(f),oldChoices);assert.equal(f.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.writes,[]);
});

test('failed new-game primary write retains the original journey and all prior selections',async()=>{
  const f=await recoveryFixture(source),oldChoices=previousChoices(f),disk=new Map(f.map);
  const setItem=f.storage.setItem;
  f.storage.setItem=(key,value)=>{if(key===f.S.SAVE_KEY)throw Error('constructed primary-write refusal');return setItem(key,value);};
  await f.click('new');await f.click('confirm');
  assert.equal(f.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.map,disk);assert.deepEqual(choices(f),oldChoices);assert.deepEqual(f.writes,[]);
  assert.match(f.announcer.textContent,/无法保存/);
});

test('failed import primary write retains the original journey and all prior selections',async()=>{
  const f=await recoveryFixture(source),oldChoices=previousChoices(f),disk=new Map(f.map);
  await chooseImport(f,f.E.newGame(19023));
  const setItem=f.storage.setItem;
  f.storage.setItem=(key,value)=>{if(key===f.S.SAVE_KEY)throw Error('constructed primary-write refusal');return setItem(key,value);};
  await f.click('confirm');
  assert.equal(f.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.map,disk);assert.deepEqual(choices(f),oldChoices);assert.deepEqual(f.writes,[]);
  assert.match(f.announcer.textContent,/无法保存/);
});

test('canceling a new-run or import confirmation leaves selections and storage untouched',async()=>{
  const f=await recoveryFixture(source),oldChoices=previousChoices(f);
  await f.click('new');await f.click('close-dialog');
  assert.deepEqual(choices(f),oldChoices);assert.equal(f.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.writes,[]);
  await chooseImport(f,f.E.newGame(19024));await f.click('close-dialog');
  assert.deepEqual(choices(f),oldChoices);assert.equal(f.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.writes,[]);
});
