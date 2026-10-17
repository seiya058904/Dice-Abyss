import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newGame,transition,makeItem} from '../src/engine.js';
import {encodeSave,decodeSave,validateSave,loadSave,saveGame,saveImportedGame,readLegacyBackup,SAVE_KEY,BACKUP_KEY,V4_BACKUP_KEY} from '../src/storage.js';

const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),map};};
function room(type,seed=741){
 let s=newGame(seed);s.fate=[3,4];s.phase='route';s.player.gold=100000;
 s.route=[type,'combat','forge','combat','gold','elite'].map((type,i)=>({id:`f1r${i}`,type,done:false,quality:0}));
 return transition(s,{type:'enter'});
}
function rawEnvelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;
 for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,payload,checksum:(hash>>>0).toString(16)});
}

test('pending rewards must have an already issued ID before an import can replace progress',()=>{
 const s=room('chest'),storage=memory();saveGame(s,null,storage);
 const bad=structuredClone(s);bad.chest.item.id=`i${bad.nextId}`;
 assert.equal(validateSave(bad),false);assert.throws(()=>decodeSave(rawEnvelope(bad)),/内容不完整/);
 assert.deepEqual(loadSave(storage).state,s);assert.equal(storage.getItem(SAVE_KEY),encodeSave(s));
 const restored=decodeSave(encodeSave(s)),opened=transition(restored,{type:'open'});
 assert(validateSave(opened));assert.equal(opened.loot.item.id,s.chest.item.id);
 assert.equal(opened.rng,s.rng);assert.strictEqual(transition(opened,{type:'open'}),opened);
});

test('unsold shop offers cannot collide with owned IDs or future IDs; sold history survives recycling',()=>{
 const s=room('merchant');assert(validateSave(s));
 for(const issued of [s.player.items[0],{...s.shop[0].item,id:`i${s.nextId}`}]){
  const bad=structuredClone(s);bad.shop[0].id=issued.id;bad.shop[0].item=structuredClone(issued);
  assert(!validateSave(bad));assert.throws(()=>decodeSave(rawEnvelope(bad)),/内容不完整/);
 }
 const bought=transition(s,{type:'buy',id:s.shop[0].id});assert(validateSave(bought));
 assert.strictEqual(transition(bought,{type:'buy',id:s.shop[0].id}),bought);
 const recycled=transition(bought,{type:'salvage',ids:[s.shop[0].id],allowProtected:true});
 assert(validateSave(recycled));assert(!recycled.player.items.some(item=>item.id===s.shop[0].id));
 assert(recycled.shop[0].sold);assert.deepEqual(decodeSave(encodeSave(recycled)),recycled);
});

test('consumed fusion records survive refresh and contradictory resurrected material is rejected',()=>{
 const s=room('fusion'),material=makeItem(s,'weapon',0);s.player.items.push(material);
 const fused=transition(s,{type:'fuse',target:s.player.equipped.weapon,material:material.id});
 assert(validateSave(fused));assert.deepEqual(decodeSave(encodeSave(fused)).lastForge,fused.lastForge);
 assert.strictEqual(transition(fused,{type:'fuse',target:s.player.equipped.weapon,material:material.id}),fused);
 const bad=structuredClone(fused);bad.player.items.push(material);assert(!validateSave(bad));
 assert.throws(()=>decodeSave(rawEnvelope(bad)),/内容不完整/);
 const collision=structuredClone(fused);collision.lastForge.consumed=[collision.lastForge.targets[0]];
 assert(!validateSave(collision));
 const future=structuredClone(fused);future.lastForge.consumed=[`i${future.nextId}`];assert(!validateSave(future));
});

test('an imported branch with the same run ID and revision cannot be overwritten by a stale window',()=>{
 const original=newGame(114),a=transition(original,{type:'lock',id:original.player.equipped.weapon}),b=transition(original,{type:'lock',id:original.player.equipped.armor});
 assert.equal(a.runId,b.runId);assert.equal(a.revision,b.revision);assert.notDeepEqual(a,b);
 const storage=memory();saveGame(a,null,storage);const before=new Map(storage.map),bRaw=encodeSave(b);
 assert.throws(()=>saveGame(transition(b,{type:'fate'}),b,storage),/另一窗口/);
 assert.deepEqual(storage.map,before);assert.equal(encodeSave(b),bRaw);
 const next=transition(a,{type:'fate'});assert.equal(saveGame(next,a,storage).mirrored,true);
 assert.deepEqual(loadSave(storage).state,next);
});

test('serialized start and import clients with stale null snapshots cannot overwrite a newly created run',async()=>{
 for(const kind of ['start','import']){
  const storage=memory(),first=newGame(901),candidate=kind==='start'?newGame(902):decodeSave(encodeSave(transition(newGame(903),{type:'fate'})));
  const snapshots=[JSON.stringify(first),JSON.stringify(candidate)];
  // Both clients observed empty storage before queuing. Serializing the write
  // alone is insufficient: the second must recheck its explicit null snapshot.
  let tail=Promise.resolve();
  const locked=task=>{const result=tail.then(task);tail=result.catch(()=>{});return result;};
  const results=await Promise.allSettled([locked(()=>saveGame(first,null,storage)),locked(()=>saveGame(candidate,null,storage))]);
  assert.equal(results[0].status,'fulfilled',kind);assert.equal(results[1].status,'rejected',kind);assert.match(results[1].reason.message,/另一窗口/);
  assert.deepEqual(loadSave(storage).state,first);assert.equal(storage.getItem(SAVE_KEY),storage.getItem(BACKUP_KEY));
  assert.equal(JSON.stringify(first),snapshots[0]);assert.equal(JSON.stringify(candidate),snapshots[1]);
 }
});

test('null permits identical migration snapshots, rejects a same-revision branch, and undefined keeps explicit replacement available',()=>{
 const storage=memory(),first=newGame(911);saveGame(first,null,storage);
 assert.doesNotThrow(()=>saveGame(decodeSave(encodeSave(first)),null,storage));
 const changed=structuredClone(first);changed.player.gold++;const initial=new Map(storage.map);
 assert.throws(()=>saveGame(changed,null,storage),/另一窗口/);assert.deepEqual(storage.map,initial);
 storage.setItem(SAVE_KEY,'synthetic corrupt primary');assert.throws(()=>saveGame(newGame(912),null,storage),/另一窗口/);
 assert.deepEqual(loadSave(storage).state,first,'a valid mirror is also an existing run');
 const replacement=newGame(913);saveGame(replacement,undefined,storage);assert.deepEqual(loadSave(storage).state,replacement);
});

const legacyImports=()=>JSON.parse(readFileSync(new URL('./fixtures/v4-baseline.json',import.meta.url),'utf8')).saves.slice(0,2);
test('importing V4 B preserves active V4 A first, including recovery from its valid mirror',()=>{
 const [prior,candidate]=legacyImports();
 for(const corruptMain of [false,true]){
  const storage=memory();storage.setItem(SAVE_KEY,corruptMain?'synthetic bad primary':prior.raw);storage.setItem(BACKUP_KEY,prior.raw);
  const expected=loadSave(storage).state,imported=decodeSave(candidate.raw),rng=imported.rng;
  const result=saveImportedGame(imported,candidate.raw,expected,storage);assert.equal(result.mirrored,true);
  assert.equal(storage.getItem(V4_BACKUP_KEY),prior.raw);assert.equal(readLegacyBackup(storage),prior.raw);
  assert.deepEqual(loadSave(storage).state,imported);assert.equal(loadSave(storage).state.rng,rng);
  assert.equal(storage.getItem(SAVE_KEY),storage.getItem(BACKUP_KEY));
 }
});

test('a stale or mismatched import performs zero archive or active-save writes',()=>{
 const [prior,candidate]=legacyImports(),storage=memory(),expected=decodeSave(prior.raw),imported=decodeSave(candidate.raw);
 saveGame(transition(expected,{type:'fate'}),null,storage);const snapshot=new Map(storage.map),writes=[];
 const write=storage.setItem;storage.setItem=(key,value)=>{writes.push(key);write(key,value);};
 assert.throws(()=>saveImportedGame(imported,candidate.raw,expected,storage),/另一窗口/);assert.deepEqual(writes,[]);assert.deepEqual(storage.map,snapshot);
 assert.throws(()=>saveImportedGame(imported,candidate.raw,null,storage),/另一窗口/);assert.deepEqual(writes,[]);assert.deepEqual(storage.map,snapshot);
 assert.throws(()=>saveImportedGame(imported,prior.raw,loadSave(storage).state,storage),/不一致/);assert.deepEqual(writes,[]);assert.deepEqual(storage.map,snapshot);
});

test('import archive quota failure preserves both active V4 copies and main failure retains the correct original archive',()=>{
 const [prior,candidate]=legacyImports();
 for(const failureKey of [V4_BACKUP_KEY,SAVE_KEY]){
  const storage=memory();storage.setItem(SAVE_KEY,prior.raw);storage.setItem(BACKUP_KEY,prior.raw);
  const write=storage.setItem;storage.setItem=(key,value)=>{if(key===failureKey)throw Error('synthetic import quota');write(key,value);};
  assert.throws(()=>saveImportedGame(decodeSave(candidate.raw),candidate.raw,decodeSave(prior.raw),storage),/无法保留|无法保存/);
  assert.equal(storage.getItem(SAVE_KEY),prior.raw);assert.equal(storage.getItem(BACKUP_KEY),prior.raw);
  if(failureKey===SAVE_KEY)assert.equal(storage.getItem(V4_BACKUP_KEY),prior.raw);
 }
});

test('main quota failure leaves both snapshots intact; mirror quota warns after a durable main commit',()=>{
 const original=newGame(81),next=transition(original,{type:'fate'}),storage=memory();saveGame(original,null,storage);
 const initialMain=storage.getItem(SAVE_KEY),initialMirror=storage.getItem(BACKUP_KEY),write=storage.setItem;
 storage.setItem=(key,value)=>{if(key===SAVE_KEY)throw Error('synthetic main quota');write(key,value);};
 assert.throws(()=>saveGame(next,original,storage),/无法保存/);
 assert.equal(storage.getItem(SAVE_KEY),initialMain);assert.equal(storage.getItem(BACKUP_KEY),initialMirror);
 storage.setItem=(key,value)=>{if(key===BACKUP_KEY)throw Error('synthetic mirror quota');write(key,value);};
 const result=saveGame(next,original,storage);assert.equal(result.mirrored,false);assert.match(result.warning,/主存档.*镜像更新失败/);
 assert.deepEqual(decodeSave(storage.getItem(SAVE_KEY)),next);assert.equal(storage.getItem(BACKUP_KEY),initialMirror);
 const loaded=loadSave(storage);assert.deepEqual(loaded.state,next);assert.match(loaded.warning,/镜像尚未同步/);
 storage.setItem=write;const following=transition(next,{type:'enter'});saveGame(following,next,storage);
 assert.equal(storage.getItem(SAVE_KEY),storage.getItem(BACKUP_KEY));assert.equal(loadSave(storage).warning,'');
 write(SAVE_KEY,'{invalid JSON');const recovered=loadSave(storage);
 assert.equal(recovered.recovered,true);assert.deepEqual(recovered.state,following);assert.match(recovered.warning,/已从镜像恢复/);
});

test('mirror recovery reports its limitation when the only latest copy was subsequently corrupted',()=>{
 const s=newGame(812),next=transition(s,{type:'fate'}),storage=memory();saveGame(s,null,storage);
 const write=storage.setItem;storage.setItem=(key,value)=>{if(key===BACKUP_KEY)throw Error('synthetic quota');write(key,value);};
 assert.equal(saveGame(next,s,storage).mirrored,false);write(SAVE_KEY,'corrupt primary after failed mirror');
 const loaded=loadSave(storage);assert.deepEqual(loaded.state,s);assert.equal(loaded.recovered,true);
 assert.match(loaded.warning,/最后一次进度可能不在此备份/);
 assert.equal(storage.getItem(SAVE_KEY),'corrupt primary after failed mirror','recovery is read-only');
});

test('corrupt JSON and wrong schema fall back read-only and do not silently reset a run',()=>{
 const s=room('chest'),storage=memory();saveGame(s,null,storage);const mirror=storage.getItem(BACKUP_KEY);
 for(const raw of ['null','{',rawEnvelope({...s,version:999}),rawEnvelope({...s,nextId:3})]){
  storage.setItem(SAVE_KEY,raw);const loaded=loadSave(storage);
  assert.equal(loaded.recovered,true);assert.deepEqual(loaded.state,s);assert.equal(storage.getItem(SAVE_KEY),raw);
  assert.equal(storage.getItem(BACKUP_KEY),mirror);
 }
 storage.setItem(SAVE_KEY,'broken');storage.setItem(BACKUP_KEY,'broken mirror');
 const blocked=loadSave(storage);assert.equal(blocked.state,null);assert.match(blocked.error,/保留原始备份/);
 assert.equal(storage.getItem(SAVE_KEY),'broken');assert.equal(storage.getItem(BACKUP_KEY),'broken mirror');
});
