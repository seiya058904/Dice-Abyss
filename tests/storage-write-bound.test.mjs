import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition} from '../src/engine.js';
import {encodeSave,decodeSave,saveGame,SAVE_KEY,BACKUP_KEY} from '../src/storage.js';
const storage=raw=>{const map=new Map([[SAVE_KEY,raw],[BACKUP_KEY,raw]]);return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};
function envelope(payload){let h=2166136261;for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:5,checksum:(h>>>0).toString(16),payload});}
test('Round27 capacity optimization preserves unknown fields and byte-identical writes',()=>{
 const before=newGame(27);before.extension={unknown:['丁',null,{negative:-0}],future:true};
 const raw=encodeSave(before),disk=storage(raw),expected=decodeSave(raw),after=transition(expected,{type:'lock',id:expected.player.items[0].id});
 saveGame(after,expected,disk);assert.equal(disk.getItem(SAVE_KEY),encodeSave(after));assert.equal(disk.getItem(BACKUP_KEY),encodeSave(after));
 assert.deepEqual(decodeSave(disk.getItem(SAVE_KEY)).extension,expected.extension);
});
for(const kind of ['whitespace','escaped','duplicate-key','reordered-envelope']){
 test(`Round27 noncanonical ${kind} retains parsed snapshot compatibility`,()=>{
  const before=newGame(27);before.extension='丁';
  let payload=JSON.stringify(before);
  if(kind==='whitespace')payload=JSON.stringify(before,null,2);
  if(kind==='escaped')payload=payload.replace('丁','\\u4e01');
  if(kind==='duplicate-key')payload=payload.replace('"version":5','"version":4,"version":5');
  let raw=envelope(payload);
  if(kind==='reordered-envelope'){const e=JSON.parse(raw);raw=JSON.stringify({payload:e.payload,checksum:e.checksum,version:e.version,format:e.format});}
  const disk=storage(raw),after=transition(before,{type:'lock',id:before.player.items[0].id});
  saveGame(after,before,disk);assert.equal(disk.getItem(SAVE_KEY),encodeSave(after));
 });
}
test('Round27 complete unknown metadata and payload key-order conflicts still reject without writes',()=>{
 const before=newGame(27);before.extension={a:1,b:2};
 for(const extension of [{a:1,b:3},{b:2,a:1}]){
  const changed=structuredClone(before);changed.extension=extension;const raw=encodeSave(changed),disk=storage(raw);
  assert.throws(()=>saveGame(transition(before,{type:'lock',id:before.player.items[0].id}),before,disk),/另一窗口/);
  assert.equal(disk.getItem(SAVE_KEY),raw);assert.equal(disk.getItem(BACKUP_KEY),raw);
 }
});
test('Round27 corrupt primary recovers mirror and never trusts unchecked payload',()=>{
 const before=newGame(27),raw=encodeSave(before),disk=storage(raw);
 disk.map.set(SAVE_KEY,raw.replace('"checksum":"','"checksum":"bad'));
 const after=transition(before,{type:'lock',id:before.player.items[0].id});saveGame(after,before,disk);
 assert.equal(disk.getItem(SAVE_KEY),encodeSave(after));assert.equal(disk.getItem(BACKUP_KEY),encodeSave(after));
});
for(const [name,value] of [
 ['large ASCII','a'.repeat(3000000)],
 ['CJK below limit','界'.repeat(1600000)],
 ['CJK above limit','界'.repeat(1700000)],
 ['astral below limit','🦄'.repeat(1200000)],
 ['astral above limit','🦄'.repeat(1300000)],
 ['lone surrogates','\ud800'.repeat(840000)],
]){
 test(`Round27 exact original UTF-8/character boundary for ${name}`,()=>{
  const state=newGame(27);state.extension=value;
  const raw=encodeSave(state),bytes=new TextEncoder().encode(raw).byteLength,disk=storage(null);
  if(raw.length>5e6||bytes>5e6){assert.throws(()=>saveGame(state,undefined,disk),/5 MB/);assert.equal(disk.getItem(SAVE_KEY),null);assert.equal(disk.getItem(BACKUP_KEY),null);}
  else {saveGame(state,undefined,disk);assert.equal(disk.getItem(SAVE_KEY),raw);assert.equal(disk.getItem(BACKUP_KEY),raw);}
 });
}
