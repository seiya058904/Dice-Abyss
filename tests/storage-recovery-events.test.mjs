import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

// The exact same app regression tests can run against the immutable upload:
// DICE_RECOVERY_SOURCE=/path/to/input node --test tests/storage-recovery-events.test.mjs
const source=process.env.DICE_RECOVERY_SOURCE||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const memoryEqual=f=>assert.equal(f.S.encodeSave(f.probe.state),f.original,'The complete committed state and all unknown fields survive');

test('a localStorage.clear event immediately protects and offers the surviving full memory snapshot',async()=>{
  const f=await recoveryFixture(source);f.storage.clear();f.emit(null);
  assert.match(f.app.innerHTML,/data-save-recovery=/,'A persistent recovery view appears before another click');
  assert.match(f.app.innerHTML,/data-action="export"/);assert(f.announcer.textContent);
  memoryEqual(f);assert.deepEqual(f.writes,[]);assert.equal(await f.exportRaw(),f.original);
});

test('removing primary and mirror separately reports loss after the last copy disappears',async()=>{
  const f=await recoveryFixture(source);
  f.storage.removeItem(f.S.SAVE_KEY);f.emit(f.S.SAVE_KEY);
  assert.match(f.probe.ui.saveError,/镜像/);assert.doesNotMatch(f.app.innerHTML,/data-save-recovery=/);
  f.storage.removeItem(f.S.BACKUP_KEY);f.emit(f.S.BACKUP_KEY);
  assert.match(f.app.innerHTML,/data-save-recovery="missing"/);memoryEqual(f);assert.deepEqual(f.writes,[]);
});

test('loss cancels an outstanding confirmation and reveals the committed memory instead of stale animation',async()=>{
  const f=await recoveryFixture(source);let called=0;
  f.probe.arm(()=>called++);f.probe.present();const generation=f.probe.generation;
  f.storage.clear();f.emit(null);
  assert.equal(f.probe.pending,null);assert.equal(f.probe.dialog.open,false);
  assert.equal(f.probe.ui.busy,false);assert.equal(f.probe.ui.rolling,false);
  assert.equal(f.probe.visualState,null);assert(f.probe.generation>generation);
  await f.click('confirm');assert.equal(called,0);assert.equal(await f.exportRaw(),f.original);assert.deepEqual(f.writes,[]);
});

test('a new run arriving after loss stays a separate candidate until the user chooses it',async()=>{
  const f=await recoveryFixture(source);f.storage.clear();f.emit(null);
  const other=f.E.newGame(13014),raw=f.S.encodeSave(other);
  f.map.set(f.S.SAVE_KEY,raw);f.map.set(f.S.BACKUP_KEY,raw);f.emit(f.S.SAVE_KEY);f.emit(f.S.BACKUP_KEY);
  memoryEqual(f);assert.equal(await f.exportRaw(),f.original);
  assert.match(f.app.innerHTML,/data-save-recovery="available"/);assert.match(f.app.innerHTML,/data-action="recovery-load"/);
  assert.equal(f.map.get(f.S.SAVE_KEY),raw);assert.deepEqual(f.writes,[]);
});

test('unreadable copies protect memory and pending callbacks without changing either raw record',async()=>{
  const f=await recoveryFixture(source);f.probe.arm(()=>{});f.probe.present();
  f.map.set(f.S.SAVE_KEY,'{broken primary');f.map.set(f.S.BACKUP_KEY,'null');f.emit(f.S.SAVE_KEY);
  assert.equal(f.probe.pending,null);assert.equal(f.probe.ui.busy,false);
  assert.match(f.app.innerHTML,/data-save-recovery="unreadable"/);memoryEqual(f);
  assert.equal(f.map.get(f.S.SAVE_KEY),'{broken primary');assert.equal(f.map.get(f.S.BACKUP_KEY),'null');assert.deepEqual(f.writes,[]);
});

test('sessionStorage events with matching keys cannot synchronize or discard localStorage progress',async()=>{
  const f=await recoveryFixture(source),memory=f.probe.state;f.probe.arm(()=>{});f.probe.present();
  const generation=f.probe.generation,html=f.app.innerHTML,pending=f.probe.pending;
  f.emit(f.S.SAVE_KEY,{getItem:()=>null});
  assert.strictEqual(f.probe.state,memory);assert.strictEqual(f.probe.pending,pending);
  assert.equal(f.probe.generation,generation);assert.equal(f.probe.ui.busy,true);assert.equal(f.app.innerHTML,html);
});

test('an unchanged mirror notification preserves active presentation and existing confirmation',async()=>{
  const f=await recoveryFixture(source);f.probe.arm(()=>{});f.probe.present();const pending=f.probe.pending,generation=f.probe.generation;
  f.emit(f.S.BACKUP_KEY);assert.strictEqual(f.probe.pending,pending);assert.equal(f.probe.generation,generation);assert.equal(f.probe.ui.busy,true);
  memoryEqual(f);assert.deepEqual(f.writes,[]);
});

test('a delayed clear notification with both copies already restored does not falsely report missing data',async()=>{
  const f=await recoveryFixture(source),memory=f.probe.state;f.probe.present();const generation=f.probe.generation;
  f.emit(null);assert.doesNotMatch(f.app.innerHTML,/data-save-recovery=/);assert.strictEqual(f.probe.state,memory);
  assert.equal(f.probe.generation,generation);assert.deepEqual(f.writes,[]);
});

test('unrelated localStorage changes do not inspect or redraw the game',async()=>{
  const f=await recoveryFixture(source),state=f.probe.state,html=f.app.innerHTML;
  f.map.set('qa:unrelated','value');f.emit('qa:unrelated');
  assert.strictEqual(f.probe.state,state);assert.equal(f.app.innerHTML,html);assert.deepEqual(f.writes,[]);
});

test('queued clear followed by an already recreated different run preserves the old full memory',async()=>{
  const f=await recoveryFixture(source),other=f.E.newGame(13027);other.qaNewRun={keep:'new browser data'};
  const raw=f.S.encodeSave(other);f.storage.clear();f.map.set(f.S.SAVE_KEY,raw);f.map.set(f.S.BACKUP_KEY,raw);
  // One donor JS task clears and writes before the victim receives any event.
  f.emit(null);f.emit(f.S.SAVE_KEY,f.storage,{oldValue:null,newValue:raw});f.emit(f.S.BACKUP_KEY,f.storage,{oldValue:null,newValue:raw});
  memoryEqual(f);assert.equal(await f.exportRaw(),f.original);assert.match(f.app.innerHTML,/data-save-recovery="available"/);
  assert.equal(f.map.get(f.S.SAVE_KEY),raw);assert.equal(f.map.get(f.S.BACKUP_KEY),raw);assert.deepEqual(f.writes,[]);
});

test('queued remove events followed by a same-ID same-revision changed branch preserve memory before synchronization',async()=>{
  const f=await recoveryFixture(source),other=structuredClone(f.probe.state);other.qaRecovery.nested.unknown.push('distinct branch');
  assert.equal(other.runId,f.probe.state.runId);assert.equal(other.revision,f.probe.state.revision);
  const raw=f.S.encodeSave(other);f.storage.clear();f.map.set(f.S.SAVE_KEY,raw);f.map.set(f.S.BACKUP_KEY,raw);
  for(const key of [f.S.SAVE_KEY,f.S.BACKUP_KEY])f.emit(key,f.storage,{oldValue:f.original,newValue:null});
  for(const key of [f.S.SAVE_KEY,f.S.BACKUP_KEY])f.emit(key,f.storage,{oldValue:null,newValue:raw});
  memoryEqual(f);assert.equal(await f.exportRaw(),f.original);assert.match(f.app.innerHTML,/data-save-recovery="available"/);
  assert.equal(f.map.get(f.S.SAVE_KEY),raw);assert.deepEqual(f.writes,[]);
});

test('the complete queued delete-and-recreate event sequence leaves an identical restored game presentation intact',async()=>{
  for(const clearEvent of [true,false]){
    const f=await recoveryFixture(source),memory=f.probe.state;f.probe.arm(()=>{});f.probe.present();const generation=f.probe.generation,pending=f.probe.pending;
    if(clearEvent)f.emit(null);else for(const key of [f.S.SAVE_KEY,f.S.BACKUP_KEY])f.emit(key,f.storage,{oldValue:f.original,newValue:null});
    for(const key of [f.S.SAVE_KEY,f.S.BACKUP_KEY])f.emit(key,f.storage,{oldValue:null,newValue:f.original});
    assert.strictEqual(f.probe.state,memory);assert.strictEqual(f.probe.pending,pending);assert.equal(f.probe.ui.busy,true);assert.equal(f.probe.generation,generation);
    assert.doesNotMatch(f.app.innerHTML,/data-save-recovery=/);assert.deepEqual(f.writes,[]);
  }
});
