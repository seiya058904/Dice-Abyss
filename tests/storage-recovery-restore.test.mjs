import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as S from '../src/storage.js';
import * as E from '../src/engine.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const missing={primary:null,mirror:null};
const store=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem(key,value){writes.push(key);map.set(key,value);}};};
const lose=f=>{f.storage.clear();f.emit(null);};

test('explicit recovery restores one exact envelope including unknown nested data without a game transition',()=>{
  const state=E.newGame(13015);state.qaUnknown={text:'保留全部 🧭',array:[null,{gold:'not an engine field'}]};
  const before=S.encodeSave(state),storage=store(),result=S.restoreMissingSave(state,missing,storage);
  assert.equal(result.mirrored,true);assert.equal(storage.map.get(S.SAVE_KEY),before);assert.equal(storage.map.get(S.BACKUP_KEY),before);
  assert.deepEqual(S.loadSave(storage).state,state);assert.equal(S.encodeSave(state),before);
  assert.deepEqual(storage.writes,[S.SAVE_KEY,S.BACKUP_KEY]);
});

test('every existing primary or mirror record blocks recovery, including empty and corrupt strings',()=>{
  const memory=E.newGame(13016),raw=S.encodeSave(memory);
  for(const key of [S.SAVE_KEY,S.BACKUP_KEY])for(const value of ['', 'null','{broken',raw]){
    const storage=store();storage.map.set(key,value);const before=new Map(storage.map);
    assert.throws(()=>S.restoreMissingSave(memory,missing,storage),/已发生变化/);
    assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,before);
  }
});

test('a new run and a same-run same-revision branch both survive a stale restore attempt with zero writes',()=>{
  const memory=E.newGame(13017),branch=structuredClone(memory);branch.qaUnknown='same revision changed';
  for(const other of [E.newGame(13018),branch]){
    const storage=store(),raw=S.encodeSave(other);storage.map.set(S.SAVE_KEY,raw);storage.map.set(S.BACKUP_KEY,raw);
    assert.throws(()=>S.restoreMissingSave(memory,missing,storage),/已发生变化/);
    assert.deepEqual(storage.writes,[]);assert.equal(storage.map.get(S.SAVE_KEY),raw);assert.equal(storage.map.get(S.BACKUP_KEY),raw);
  }
});

test('recovery rejects unavailable or nonempty review snapshots and unreadable storage before writes',()=>{
  const memory=E.newGame(13019);
  for(const reviewed of [undefined,null,{}, {primary:'',mirror:null},{primary:null,mirror:'old'}]){
    const storage=store();assert.throws(()=>S.restoreMissingSave(memory,reviewed,storage),/两份/);assert.deepEqual(storage.writes,[]);
  }
  const storage=store();storage.getItem=()=>{throw Error('injected access failure');};
  assert.equal(S.inspectSaveRecovery(storage).status,'unreadable');assert.equal(S.inspectSaveRecovery(storage).raw,null);
  assert.throws(()=>S.restoreMissingSave(memory,missing,storage),/无法检查/);assert.deepEqual(storage.writes,[]);
});

test('recovery keeps ordinary full validation, file capacity and immutable archive rejection',()=>{
  const valid=E.newGame(13020),invalid=structuredClone(valid);invalid.player.gold=-1;
  const large=structuredClone(valid);large.qaPadding='界'.repeat(1700000);
  for(const state of [invalid,large]){
    const storage=store();assert.throws(()=>S.restoreMissingSave(state,missing,storage),/不完整|超过 5 MB/);assert.deepEqual(storage.writes,[]);
  }
  const storage=store();storage.map.set(S.LEGACY_BACKUP_KEY,'corrupt immutable archive');const before=new Map(storage.map);
  assert.throws(()=>S.restoreMissingSave(valid,missing,storage),/归档校验/);assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,before);
});

test('primary quota keeps recovery missing; mirror quota retains the durable primary and reports its limit',()=>{
  const state=E.newGame(13021),raw=S.encodeSave(state);
  for(const key of [S.SAVE_KEY,S.BACKUP_KEY]){
    const storage=store(),write=storage.setItem;storage.setItem=(k,value)=>{if(k===key)throw Error('injected quota');write(k,value);};
    if(key===S.SAVE_KEY){assert.throws(()=>S.restoreMissingSave(state,missing,storage),/无法保存/);assert.equal(storage.map.size,0);}
    else {const result=S.restoreMissingSave(state,missing,storage);assert.equal(result.mirrored,false);assert.match(result.warning,/镜像更新失败/);assert.equal(storage.map.get(S.SAVE_KEY),raw);assert.equal(storage.map.has(S.BACKUP_KEY),false);}
  }
});

test('inspection is read-only, preserves exact raw strings and retains primary-before-mirror selection',()=>{
  const storage=store(),first=E.newGame(13022),second=E.newGame(13023),raw=S.encodeSave(first)+'\n',backup=S.encodeSave(second);
  storage.map.set(S.SAVE_KEY,raw);storage.map.set(S.BACKUP_KEY,backup);
  let snapshot=S.inspectSaveRecovery(storage);assert.equal(snapshot.status,'available');assert.deepEqual(snapshot.state,first);assert.deepEqual(snapshot.raw,{primary:raw,mirror:backup});
  storage.map.set(S.SAVE_KEY,'');snapshot=S.inspectSaveRecovery(storage);assert.deepEqual(snapshot.state,second);assert.equal(snapshot.recovered,true);assert.equal(snapshot.raw.primary,'');
  storage.map.set(S.BACKUP_KEY,'{bad');snapshot=S.inspectSaveRecovery(storage);assert.equal(snapshot.status,'unreadable');assert.equal(snapshot.raw.primary,'');
  assert.deepEqual(storage.writes,[]);assert.equal(S.sameSaveRecords({primary:raw,mirror:backup},{primary:raw.trim(),mirror:backup}),false);
});

test('the app restores only after confirmation under its existing Web Lock and resumes with the exact memory state',async()=>{
  const f=await recoveryFixture(source);lose(f);const memory=f.probe.state;
  await f.click('recovery-restore');assert(f.probe.dialog.open);assert.deepEqual(f.writes,[]);
  await f.click('confirm');assert.equal(f.probe.ui.saveRecovery,null);assert.strictEqual(f.probe.state,memory);
  assert.deepEqual(f.lockTasks,['dice-abyss:save-write']);assert.equal(f.map.get(S.SAVE_KEY),f.original);assert.equal(f.map.get(S.BACKUP_KEY),f.original);
});

test('a missing Web Locks API keeps explicit snapshot protection and does not invent automatic writes',async()=>{
  const f=await recoveryFixture(source,{noLocks:true});lose(f);assert.deepEqual(f.writes,[]);
  await f.click('recovery-restore');await f.click('confirm');assert.equal(f.map.get(S.SAVE_KEY),f.original);assert.deepEqual(f.lockTasks,[]);
});

test('a new save appearing while restore waits for its lock is preserved and old memory stays exportable',async()=>{
  let release;const f=await recoveryFixture(source,{lock:task=>new Promise((resolve,reject)=>{release=()=>Promise.resolve().then(task).then(resolve,reject);})});lose(f);
  await f.click('recovery-restore');const waiting=f.click('confirm');
  const raw=S.encodeSave(E.newGame(13024));f.map.set(S.SAVE_KEY,raw);f.map.set(S.BACKUP_KEY,raw);f.emit(S.SAVE_KEY);
  release();
  await waiting;assert.deepEqual(f.writes,[]);assert.equal(f.map.get(S.SAVE_KEY),raw);assert.equal(await f.exportRaw(),f.original);
  assert.equal(f.probe.ui.saveRecovery.status,'available');
});

test('restore checks exact raw keys even when a conflicting event was not delivered',async()=>{
  const f=await recoveryFixture(source);lose(f);await f.click('recovery-restore');
  f.map.set(S.BACKUP_KEY,'');await f.click('confirm');
  assert.deepEqual(f.writes,[]);assert.equal(f.map.get(S.BACKUP_KEY),'');assert.equal(f.probe.ui.saveRecovery.status,'unreadable');assert.equal(await f.exportRaw(),f.original);
});

test('explicit read switches to the reviewed full save without writes and can export memory from its confirmation',async()=>{
  const f=await recoveryFixture(source);lose(f);const other=E.newGame(13025);other.qaOther={branch:[3,'保留']};const raw=S.encodeSave(other);
  f.map.set(S.SAVE_KEY,raw);f.map.set(S.BACKUP_KEY,raw);f.emit(S.SAVE_KEY);
  await f.click('recovery-load');assert.equal(await f.exportRaw(),f.original);await f.click('confirm');
  assert.deepEqual(f.probe.state,other);assert.equal(f.probe.ui.saveRecovery,null);assert.deepEqual(f.writes,[]);assert.equal(f.map.get(S.SAVE_KEY),raw);
});

test('read confirmation rejects raw changes even when the decoded game is still identical',async()=>{
  const f=await recoveryFixture(source);lose(f);const raw=S.encodeSave(E.newGame(13026));
  f.map.set(S.SAVE_KEY,raw);f.map.set(S.BACKUP_KEY,raw);f.emit(S.SAVE_KEY);await f.click('recovery-load');
  f.map.set(S.SAVE_KEY,raw+'\n');await f.click('confirm');
  assert.deepEqual(f.writes,[]);assert.equal(await f.exportRaw(),f.original);assert.equal(f.probe.ui.saveRecovery.status,'available');assert.match(f.probe.ui.saveError,/再次变化/);
});

test('protection refuses stale game clicks, direct actions, new runs, file imports and the Space shortcut',async()=>{
  const f=await recoveryFixture(source);lose(f);
  await f.probe.act({type:'fate'});await f.probe.begin();await f.click('new');await f.click('continue');await f.click('import');
  let read=0,prevented=0;
  await f.listeners.document.get('change')({target:{id:'save-file',files:[{size:5,text:async()=>{read++;return '{}';}}]}});
  f.listeners.document.get('keydown')({code:'Space',repeat:false,target:{closest:()=>null},preventDefault:()=>prevented++});
  assert.equal(read,0);assert.equal(prevented,0);assert.equal(f.probe.pending,null);assert.deepEqual(f.writes,[]);assert.equal(await f.exportRaw(),f.original);
});

test('an import whose file read began before loss cannot reopen a stale replacement confirmation',async()=>{
  const f=await recoveryFixture(source);let finish;
  const reading=f.listeners.document.get('change')({target:{id:'save-file',files:[{size:f.original.length,text:()=>new Promise(resolve=>{finish=resolve;})}]}});
  lose(f);finish(f.original);await reading;
  assert.equal(f.probe.pending,null);assert.equal(f.probe.dialog.open,false);assert.equal(f.probe.ui.saveRecovery.status,'missing');assert.deepEqual(f.writes,[]);
});

test('an ordinary action already waiting for the save lock cannot commit after loss enters protection',async()=>{
  let release;const f=await recoveryFixture(source,{lock:task=>new Promise((resolve,reject)=>{release=()=>Promise.resolve().then(task).then(resolve,reject);})});
  const waiting=f.probe.act({type:'lock',id:f.initial.player.equipped.weapon});lose(f);release();await waiting;
  assert.equal(f.probe.ui.saveRecovery.status,'missing');assert.deepEqual(f.writes,[]);assert.equal(await f.exportRaw(),f.original);
});

test('raw-record export preserves both original strings while ordinary export still preserves the game memory',async()=>{
  const f=await recoveryFixture(source);f.map.set(S.SAVE_KEY,'{坏记录\n');f.map.set(S.BACKUP_KEY,'');f.emit(S.SAVE_KEY);
  await f.click('recovery-export-raw');const bundle=JSON.parse(await f.blobs.at(-1).text());
  assert.deepEqual(bundle,{format:'dice-abyss-raw-records',records:{[S.SAVE_KEY]:'{坏记录\n',[S.BACKUP_KEY]:''}});
  assert.equal(await f.exportRaw(),f.original);assert.deepEqual(f.writes,[]);
});
