import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Point the unchanged cases at an isolated input to reproduce the extra reads.
const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const golden=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));
const memory=(main=null,mirror=main)=>{
 const map=new Map(),writes=[];
 if(main!==null)map.set(S.SAVE_KEY,main);
 if(mirror!==null)map.set(S.BACKUP_KEY,mirror);
 return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push({key,value});map.set(key,value);}};
};
function envelope(state){
 const payload=JSON.stringify(state);let h=2166136261;
 for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(h>>>0).toString(16),payload});
}
function legacy(version){
 const state=JSON.parse(JSON.parse(golden.saves[0].raw).payload);
 if(version<4){state.version=version;state.player.hp=1;for(const item of state.player.items){delete item.level;delete item.levelXp;item.growth=0;}}
 state.auditMetadata={keep:'原始旧档 😀',nested:[{v:7}]};
 const raw=envelope(state);assert(S.decodeSave(raw));return raw;
}
function fixture(count=32){
 const state=E.newGame(27017);state.runId='storage-read-reuse-27017';
 state.floor=200;state.player.level=100;state.player.gold=1000000;state.player.hp=E.stats(state).maxHp;
 while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
 state.auditMetadata={keep:'未知字段 😀 界',nested:[{v:7}],decoy:'{"version":2,"format":"dice-abyss"}'};
 assert(S.validateSave(state));return state;
}
function parseCounts(task){
 const original=JSON.parse,calls=[];
 try{JSON.parse=function(...args){calls.push(args[0]);return Reflect.apply(original,this,args);};task();}
 finally{JSON.parse=original;}
 return calls;
}
function exactCommit(state,store){
 const before=JSON.stringify(state),next=E.transition(state,{type:'lock',id:state.player.equipped.weapon});
 const result=S.saveGame(next,state,store),raw=S.encodeSave(next);
 assert.deepEqual(result,{mirrored:true,warning:''});assert.equal(JSON.stringify(state),before);
 assert.equal(store.map.get(S.SAVE_KEY),raw);assert.equal(store.map.get(S.BACKUP_KEY),raw);
 assert.deepEqual(S.loadSave(store).state,next);assert.deepEqual(next.auditMetadata,state.auditMetadata);
 return next;
}

test('a 10,000-item current-schema save parses its active envelope only once',()=>{
 const state=fixture(10000),raw=S.encodeSave(state),store=memory(raw),next=E.transition(state,{type:'lock',id:'i7'});
 assert(Buffer.byteLength(raw)<5_000_000);const before=JSON.stringify(state);
 const calls=parseCounts(()=>assert.deepEqual(S.saveGame(next,state,store),{mirrored:true,warning:''}));
 assert.equal(calls.filter(value=>value===raw).length,1,'validated current envelope must not be parsed again solely to detect a legacy archive');
 assert.equal(calls.length,2,'one envelope and one payload parse; no snapshot field checks are removed');
 assert.equal(JSON.stringify(state),before);assert.deepEqual(S.loadSave(store).state,next);
 assert.equal(store.map.get(S.SAVE_KEY),S.encodeSave(next));assert.equal(store.map.get(S.BACKUP_KEY),S.encodeSave(next));
 assert.deepEqual(store.writes.map(row=>row.key),[S.SAVE_KEY,S.BACKUP_KEY]);
});

test('current-schema source detection accepts whitespace and reordered envelope keys',()=>{
 const state=fixture(),canonical=JSON.parse(S.encodeSave(state));
 const raw=JSON.stringify({payload:canonical.payload,ignored:'version 1',checksum:canonical.checksum,version:canonical.version,format:canonical.format},null,2);
 const store=memory(raw),next=E.transition(state,{type:'lock',id:'i7'});
 const calls=parseCounts(()=>S.saveGame(next,state,store));
 assert.equal(calls.filter(value=>value===raw).length,1,'use the parsed envelope version, not a prefix or regular expression');
 assert.deepEqual(S.decodeSave(store.map.get(S.SAVE_KEY)),next);assert.deepEqual(next.auditMetadata,state.auditMetadata);
 assert.deepEqual(store.writes.map(row=>row.key),[S.SAVE_KEY,S.BACKUP_KEY]);
});

test('a verified V5 mirror avoids redundant parsing while an invalid primary remains unarchived',()=>{
 const state=fixture(),raw=S.encodeSave(state),invalid=JSON.parse(JSON.parse(legacy(4)).payload);invalid.nextId=3;
 const badMain=envelope(invalid),store=memory(badMain,raw),next=E.transition(state,{type:'lock',id:'i7'});
 assert(S.loadSave(store).recovered);
 const calls=parseCounts(()=>S.saveGame(next,state,store));
 assert.equal(calls.filter(value=>value===raw).length,1);
 assert.equal(store.map.get(S.V4_BACKUP_KEY),undefined);assert.equal(store.map.get(S.LEGACY_BACKUP_KEY),undefined);
 assert.deepEqual(S.loadSave(store).state,next);assert.equal(store.map.get(S.SAVE_KEY),store.map.get(S.BACKUP_KEY));
});

test('public decode and load APIs keep their shapes and return fresh detached states',()=>{
 const state=fixture(),raw=S.encodeSave(state),store=memory(raw),first=S.loadSave(store),second=S.loadSave(store);
 assert.deepEqual(first,{state,recovered:false,warning:''});assert.deepEqual(S.decodeSave(raw),state);
 assert.notEqual(first.state,second.state);assert.notEqual(first.state.player.items,second.state.player.items);
 first.state.auditMetadata.nested[0].v=91;assert.equal(second.state.auditMetadata.nested[0].v,7);
 assert.equal(S.loadSave(store).state.auditMetadata.nested[0].v,7);
 assert.deepEqual(S.loadSave(memory()),{state:null,error:null});
 const bad=memory('bad','bad mirror'),loaded=S.loadSave(bad);
 assert.deepEqual(Object.keys(loaded),['state','error']);assert.equal(loaded.state,null);assert.match(loaded.error,/无法读取存档/);
});

test('the source schema stays distinct from the migrated V5 state for all V1–V4 originals',()=>{
 for(const version of [1,2,3,4])for(const recovered of [false,true]){
  const original=legacy(version),store=memory(recovered?'broken primary':original,original),loaded=S.loadSave(store);
  assert.equal(loaded.state.version,5);assert.equal(loaded.recovered,recovered);
  exactCommit(loaded.state,store);
  assert.equal(store.map.get(S.V4_BACKUP_KEY),original);
  assert.equal(store.map.get(S.LEGACY_BACKUP_KEY),version<4?original:undefined);
  assert.deepEqual(store.writes.map(row=>row.key),version<4?[S.LEGACY_BACKUP_KEY,S.V4_BACKUP_KEY,S.SAVE_KEY,S.BACKUP_KEY]:[S.V4_BACKUP_KEY,S.SAVE_KEY,S.BACKUP_KEY]);
  assert.equal(S.readLegacyBackup(store),original);
 }
});

test('full expected comparison still rejects same-revision unknown-field branches and mutated callers',()=>{
 const state=fixture(),raw=S.encodeSave(state),store=memory(raw),candidate=E.transition(state,{type:'lock',id:'i7'});
 for(const expected of [structuredClone(state),S.loadSave(store).state]){
  expected.auditMetadata.nested[0].v++;
  assert.equal(expected.runId,state.runId);assert.equal(expected.revision,state.revision);
  assert.throws(()=>S.saveGame(candidate,expected,store),/另一窗口/);
  assert.deepEqual(store.writes,[]);assert.equal(store.map.get(S.SAVE_KEY),raw);assert.equal(store.map.get(S.BACKUP_KEY),raw);
 }
 exactCommit(state,store);
 assert.throws(()=>S.saveGame(candidate,state,store),/另一窗口/,'each operation must read the latest snapshot again');
});

test('corrupt legacy archives still block a verified V5 commit before either active write',()=>{
 const state=fixture(),raw=S.encodeSave(state),store=memory(raw);store.map.set(S.LEGACY_BACKUP_KEY,'corrupt immutable archive');
 const before=new Map(store.map),next=E.transition(state,{type:'lock',id:'i7'});
 assert.throws(()=>S.saveGame(next,state,store),/升级前归档校验未通过/);
 assert.deepEqual(store.map,before);assert.deepEqual(store.writes,[]);
});

test('later source reads that changed to an older raw string still take the complete archive path',()=>{
 for(const changeAtRead of [2,3]){
  const state=fixture(),raw=S.encodeSave(state),older=legacy(changeAtRead===2?4:2),store=memory(raw),read=store.getItem;
  let reads=0;store.getItem=key=>{if(key===S.SAVE_KEY&&++reads===changeAtRead)store.map.set(S.SAVE_KEY,older);return read(key);};
  const next=E.transition(state,{type:'lock',id:'i7'});S.saveGame(next,state,store);
  const archiveKey=changeAtRead===2?S.V4_BACKUP_KEY:S.LEGACY_BACKUP_KEY;
  assert.equal(store.map.get(archiveKey),older,'a version tag from a different raw string cannot bypass the fallback');
  assert.deepEqual(store.writes.map(row=>row.key),[archiveKey,S.SAVE_KEY,S.BACKUP_KEY]);
  assert.deepEqual(S.loadSave(store).state,next);
 }
});

test('unreadable legacy envelopes remain available for explicit new-run rescue archives',()=>{
 const old=JSON.parse(JSON.parse(legacy(4)).payload);old.nextId=3;
 const raw=envelope(old),store=memory(raw,'corrupt mirror');assert.equal(S.loadSave(store).state,null);
 const state=fixture(),reviewed={primary:raw,mirror:'corrupt mirror'};
 S.replaceUnreadableSave(state,reviewed,store);
 assert.equal(store.map.get(S.V4_BACKUP_KEY),raw);assert.equal(S.readLegacyBackup(store),raw);
 assert.deepEqual(S.loadSave(store).state,state);
 assert.deepEqual(store.writes.map(row=>row.key),[S.V4_BACKUP_KEY,S.SAVE_KEY,S.BACKUP_KEY]);
});

test('archive failures keep active copies intact and current-schema primary or mirror failures keep their original outcomes',()=>{
 for(const failKey of [S.LEGACY_BACKUP_KEY,S.V4_BACKUP_KEY,S.SAVE_KEY,S.BACKUP_KEY]){
  const original=failKey===S.LEGACY_BACKUP_KEY||failKey===S.V4_BACKUP_KEY?legacy(2):S.encodeSave(fixture());
  const store=memory(original),before=S.loadSave(store).state,next=E.transition(before,{type:'lock',id:before.player.equipped.weapon});
  const write=store.setItem;store.setItem=(key,value)=>{if(key===failKey)throw Error('synthetic write failure');return write(key,value);};
  if(failKey===S.BACKUP_KEY){const result=S.saveGame(next,before,store);assert.equal(result.mirrored,false);assert.match(result.warning,/主存档.*镜像更新失败/);assert.equal(store.map.get(S.SAVE_KEY),S.encodeSave(next));}
  else{assert.throws(()=>S.saveGame(next,before,store),/无法保留|无法保存/);assert.equal(store.map.get(S.SAVE_KEY),original);}
  assert.equal(store.map.get(S.BACKUP_KEY),original);
 }
});
