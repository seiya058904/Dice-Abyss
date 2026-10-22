import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as S from '../src/storage.js';
import * as E from '../src/engine.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

// Independent-review regressions for DA-CR-01 (present but empty/corrupt raw
// records were treated as a missing save) and DA-CR-02 (access denial was
// reported as another window's update). Every case uses synthetic bytes only.
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function memory(records={}){
 const map=new Map(Object.entries(records).filter(([,value])=>value!==null&&value!==undefined)),writes=[];
 return {map,writes,denied:false,getItem(key){if(this.denied)throw new DOMException('Storage access denied','SecurityError');return map.get(key)??null;},setItem(key,value){writes.push([key,value]);map.set(key,value);}};
}
const rawOf=state=>S.encodeSave(state);

test('a present but empty or corrupt record is not reported as a normal new user',()=>{
 for(const records of [
  {[S.SAVE_KEY]:''},{[S.BACKUP_KEY]:''},{[S.SAVE_KEY]:'',[S.BACKUP_KEY]:''},
  {[S.SAVE_KEY]:'{broken'},{[S.SAVE_KEY]:'{broken',[S.BACKUP_KEY]:'null'},
  {[S.SAVE_KEY]:'null',[S.BACKUP_KEY]:''},
 ]){
  const storage=memory(records),before=new Map(storage.map),loaded=S.loadSave(storage);
  assert.equal(loaded.state,null,'raw bytes without a decodable state never become progress');
  assert.ok(loaded.error,`present raw bytes must not be announced as an ordinary empty browser: ${JSON.stringify(records)}`);
  assert.match(loaded.error,/无法读取存档/);
  assert.deepEqual(storage.map,before,'a read never rewrites the original records');
  assert.deepEqual(storage.writes,[]);
 }
});

test('both keys genuinely absent still starts as an ordinary new user',()=>{
 const loaded=S.loadSave(memory());
 assert.deepEqual(loaded,{state:null,error:null});
});

test('an empty primary still recovers a readable mirror and preserves the empty original',()=>{
 const state=E.newGame(41031),raw=rawOf(state),storage=memory({[S.SAVE_KEY]:'',[S.BACKUP_KEY]:raw});
 const loaded=S.loadSave(storage);
 assert.deepEqual(loaded.state,state);assert.equal(loaded.recovered,true);
 assert.match(loaded.warning,/镜像恢复/);
 assert.equal(storage.map.get(S.SAVE_KEY),'');assert.deepEqual(storage.writes,[]);
});

test('saveGame refuses to replace present unreadable bytes without an explicit discard snapshot',()=>{
 const state=E.newGame(41032),next=E.transition(state,{type:'fate'});
 for(const records of [
  {[S.SAVE_KEY]:''},{[S.BACKUP_KEY]:''},{[S.SAVE_KEY]:'',[S.BACKUP_KEY]:''},
  {[S.SAVE_KEY]:'{broken'},{[S.SAVE_KEY]:'null',[S.BACKUP_KEY]:'{bad'},
 ]){
  const storage=memory(records),before=new Map(storage.map);
  assert.throws(()=>S.saveGame(next,null,storage),/无法读取|原始记录|舍弃/,`present bytes must not be overwritten: ${JSON.stringify(records)}`);
  assert.deepEqual(storage.map,before);assert.deepEqual(storage.writes,[]);
 }
});

test('saveImportedGame refuses to archive or replace over present unreadable bytes',()=>{
 const state=E.newGame(41033),raw=rawOf(state);
 for(const records of [{[S.SAVE_KEY]:''},{[S.SAVE_KEY]:'{broken',[S.BACKUP_KEY]:'null'}]){
  const storage=memory(records),before=new Map(storage.map);
  assert.throws(()=>S.saveImportedGame(state,raw,null,storage),/无法读取|原始记录|舍弃/);
  assert.deepEqual(storage.map,before);assert.deepEqual(storage.writes,[]);
 }
});

test('an explicit reviewed discard writes both copies and only for the exact reviewed bytes',()=>{
 const state=E.newGame(41034),raw=rawOf(state);
 for(const records of [
  {[S.SAVE_KEY]:'',[S.BACKUP_KEY]:null},
  {[S.SAVE_KEY]:'{bad',[S.BACKUP_KEY]:null},
  {[S.SAVE_KEY]:'{bad',[S.BACKUP_KEY]:''},
 ]){
  const storage=memory(records),reviewed={primary:storage.map.get(S.SAVE_KEY)??null,mirror:storage.map.get(S.BACKUP_KEY)??null};
  const result=S.replaceUnreadableSave(state,reviewed,storage);
  assert.deepEqual(result,{mirrored:true,warning:''});
  assert.deepEqual(storage.writes.map(([key])=>key),[S.SAVE_KEY,S.BACKUP_KEY]);
  assert.equal(storage.map.get(S.SAVE_KEY),raw);assert.equal(storage.map.get(S.BACKUP_KEY),raw);
  assert.deepEqual(S.loadSave(storage).state,state);
 }
});

test('the discard path rejects stale, readable or unavailable snapshots before any write',()=>{
 const state=E.newGame(41035),valid=rawOf(state),validRun=S.encodeSave(E.newGame(41036));
 const changed=memory({[S.SAVE_KEY]:'{changed'});const before=new Map(changed.map);
 assert.throws(()=>S.replaceUnreadableSave(state,{primary:'{reviewed',mirror:null},changed),/已发生变化/);
 assert.deepEqual(changed.map,before);assert.deepEqual(changed.writes,[]);
 const readable=memory({[S.SAVE_KEY]:validRun,[S.BACKUP_KEY]:validRun});
 assert.throws(()=>S.replaceUnreadableSave(state,{primary:validRun,mirror:validRun},readable),/可读取|两份|缺失/);
 assert.deepEqual(readable.writes,[]);
 const missing=memory();
 assert.throws(()=>S.replaceUnreadableSave(state,{primary:null,mirror:null},missing),/不存在|两份|确认/);
 assert.deepEqual(missing.writes,[]);
 const denied=memory({[S.SAVE_KEY]:''});denied.denied=true;
 assert.throws(()=>S.replaceUnreadableSave(state,{primary:'',mirror:null},denied),/无法检查|权限/);
 assert.deepEqual(denied.writes,[]);
});

test('denied storage is reported as an access failure rather than another window update',()=>{
 const state=E.newGame(41037),raw=rawOf(state),next=E.transition(state,{type:'fate'}),storage=memory({[S.SAVE_KEY]:raw,[S.BACKUP_KEY]:raw});
 const expected=S.loadSave(storage).state,locked=new Map(storage.map);
 storage.denied=true;
 const loaded=S.loadSave(storage);
 assert.equal(loaded.state,null);
 assert.match(loaded.error,/拒绝访问|权限/,'permission denial needs its own explanation');
 assert.throws(()=>S.saveGame(next,expected,storage),(error)=>!/另一窗口/.test(error.message)&&/无法读取浏览器中的存档/.test(error.message),'a denied getter must not masquerade as a concurrent tab');
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,locked);
 storage.denied=false;
 assert.deepEqual(S.loadSave(storage).state,expected,'restored permission reads the untouched original again');
});

test('a readable but undecodable record under an expected state is not called another window',()=>{
 const state=E.newGame(41038),raw=rawOf(state),next=E.transition(state,{type:'fate'}),storage=memory({[S.SAVE_KEY]:raw,[S.BACKUP_KEY]:raw});
 const expected=S.loadSave(storage).state;
 storage.map.set(S.SAVE_KEY,'{broken');storage.map.set(S.BACKUP_KEY,'');
 assert.throws(()=>S.saveGame(next,expected,storage),(error)=>!/另一窗口/.test(error.message)&&/无法读取/.test(error.message));
 assert.equal(storage.map.get(S.SAVE_KEY),'{broken');assert.equal(storage.map.get(S.BACKUP_KEY),'');assert.deepEqual(storage.writes,[]);
});

test('a genuine cross-tab change still reports the exact snapshot conflict with zero writes',()=>{
 const state=E.newGame(41039),expectedState=S.loadSave(memory({[S.SAVE_KEY]:rawOf(state),[S.BACKUP_KEY]:rawOf(state)})).state;
 const other=E.newGame(41040),otherRaw=rawOf(other),storage=memory({[S.SAVE_KEY]:rawOf(state),[S.BACKUP_KEY]:rawOf(state)});
 storage.map.set(S.SAVE_KEY,otherRaw);storage.map.set(S.BACKUP_KEY,otherRaw);
 const before=new Map(storage.map);
 assert.throws(()=>S.saveGame(E.transition(state,{type:'fate'}),expectedState,storage),/另一窗口已更新进度/);
 assert.deepEqual(storage.map,before);assert.deepEqual(storage.writes,[]);
});

test('inspection keeps exact original bytes, including empty records, without writing',()=>{
 const storage=memory({[S.SAVE_KEY]:'',[S.BACKUP_KEY]:null});
 const snapshot=S.inspectSaveRecovery(storage);
 assert.equal(snapshot.status,'unreadable');assert.deepEqual(snapshot.raw,{primary:'',mirror:null});
 assert.equal(snapshot.state,null);assert.ok(snapshot.error);
 assert.deepEqual(storage.writes,[]);
});

test('the app exposes a present empty record instead of a blank new-user title',async()=>{
 const f=await recoveryFixture(source,{records:{primary:'',mirror:null}});
 assert.equal(f.probe.state,null);
 assert.match(f.probe.ui.saveError,/无法读取存档/,'the load error reaches the title surface');
 assert.match(f.app.innerHTML,/error-note/);assert.match(f.app.innerHTML,/无法读取存档/);
 assert.doesNotMatch(f.app.innerHTML,/data-save-recovery=/);
 assert.deepEqual(f.writes,[]);
});

test('a present unreadable record needs confirmation, exact raw export and a reviewed discard',async()=>{
 for(const records of [{primary:'',mirror:null},{primary:'{broken',mirror:'null'}]){
  const f=await recoveryFixture(source,{records});
  await f.click('new');
  assert.equal(f.probe.dialog.open,true,'replacing an existing original is never one silent click');
  assert.deepEqual(f.writes,[]);
  await f.click('recovery-export-raw');
  const bundle=JSON.parse(await f.blobs.at(-1).text());
  assert.deepEqual(bundle,{format:'dice-abyss-raw-records',records:{[S.SAVE_KEY]:records.primary,[S.BACKUP_KEY]:records.mirror}},'the exact original bytes are exportable before discard');
  assert.deepEqual(f.writes,[]);
  await f.click('confirm');
  const state=f.probe.state;assert.ok(state);assert(S.validateSave(state));
  const raw=rawOf(state);
  assert.equal(f.map.get(S.SAVE_KEY),raw);assert.equal(f.map.get(S.BACKUP_KEY),raw);
  assert.deepEqual(f.writes.map(([key])=>key),[S.SAVE_KEY,S.BACKUP_KEY]);
 }
});

test('changing the unreadable original while confirmation is open rejects the stale discard',async()=>{
 for(const noLocks of [false,true]){
  const f=await recoveryFixture(source,{records:{primary:'',mirror:null},noLocks});
  await f.click('new');assert.equal(f.probe.dialog.open,true);
  f.map.set(S.SAVE_KEY,'{changed while reviewing');
  await f.click('confirm');
  assert.equal(f.probe.state,null,'no new run is presented after a stale review');
  assert.equal(f.map.get(S.SAVE_KEY),'{changed while reviewing');
  assert.deepEqual(f.writes,[]);
  assert.match(f.probe.ui.saveError,/已发生变化/);
  assert.deepEqual(f.lockTasks,noLocks?[]:['dice-abyss:save-write'],'both Web Locks paths run the same re-check');
 }
});

test('a valid save published by another tab while confirmation is open is never overwritten',async()=>{
 for(const noLocks of [false,true]){
  const f=await recoveryFixture(source,{records:{primary:'',mirror:null},noLocks});
  await f.click('new');assert.equal(f.probe.dialog.open,true);
  const other=E.newGame(41041),raw=rawOf(other);
  f.map.set(S.SAVE_KEY,raw);f.map.set(S.BACKUP_KEY,raw);
  await f.click('confirm');
  assert.equal(f.map.get(S.SAVE_KEY),raw);assert.equal(f.map.get(S.BACKUP_KEY),raw);
  assert.deepEqual(f.writes,[]);assert.equal(f.probe.state,null);
  assert.match(f.announcer.textContent,/另一窗口/);
  assert.deepEqual(f.lockTasks,noLocks?[]:['dice-abyss:save-write'],'the confirmed write stays under the same lock path');
 }
});

test('a genuinely empty browser still starts a new journey without a confirmation dialog',async()=>{
 const f=await recoveryFixture(source,{records:{primary:null,mirror:null}});
 assert.equal(f.probe.state,null);assert.equal(f.probe.ui.saveError,'');
 await f.click('new');
 assert.equal(f.probe.dialog.open,false);
 const state=f.probe.state;assert.ok(state);assert(S.validateSave(state));
 assert.deepEqual(f.writes.map(([key])=>key),[S.SAVE_KEY,S.BACKUP_KEY]);
});

test('denied storage keeps the title, refuses the new run and never writes synthetic bytes',async()=>{
 const f=await recoveryFixture(source,{records:{primary:null,mirror:null}});
 const getItem=f.storage.getItem;
 f.storage.getItem=()=>{throw new DOMException('Storage access denied','SecurityError');};
 await f.click('new');
 if(f.probe.dialog.open)await f.click('confirm');
 assert.equal(f.probe.state,null);
 assert.deepEqual(f.writes,[]);assert.equal(f.map.size,0);
 assert.match(f.probe.ui.saveError??f.announcer.textContent,/无法读取/);
 f.storage.getItem=getItem;
 assert.deepEqual(f.S.loadSave(f.storage),{state:null,error:null},'restored permission reads a genuinely empty browser');
});

test('a denied storage notification protects memory, and restored permission reloads explicitly',async()=>{
 const f=await recoveryFixture(source),memoryRunId=f.initial.runId,getItem=f.storage.getItem;
 assert.ok(!f.probe.ui.saveRecovery);
 f.storage.getItem=()=>{throw new DOMException('Storage access denied','SecurityError');};
 f.emit(S.SAVE_KEY);
 assert.equal(f.probe.ui.saveRecovery.status,'unreadable');
 assert.match(f.app.innerHTML,/data-save-recovery="unreadable"/);
 assert.equal(f.probe.state.runId,memoryRunId,'the complete committed memory snapshot stays available');
 assert.deepEqual(f.writes,[]);
 f.storage.getItem=getItem;
 await f.click('recovery-check');
 assert.equal(f.probe.ui.saveRecovery.status,'available');
 assert.match(f.app.innerHTML,/data-action="recovery-load"/);
 await f.click('recovery-load');await f.click('confirm');
 assert.deepEqual(f.probe.state,f.initial);
 assert.deepEqual(f.writes,[],'permission recovery reads the original without rewriting it');
});
