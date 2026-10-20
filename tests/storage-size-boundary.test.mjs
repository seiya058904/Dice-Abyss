import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Run the same regression against an untouched input with QA_STORAGE_ROOT.
const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const LIMIT=5_000_000;
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};};
function envelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;
 for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(hash>>>0).toString(16),payload});
}
function padded(state,bytes,encode=S.encodeSave){
 state.auditPadding='';let raw=encode(state),length=bytes-Buffer.byteLength(raw);
 assert(length>=0);
 // A checksum can have seven or eight hex digits. Try a different final ASCII
 // character if adjusting the padding happens to alternate between the two.
 for(let salt=0;salt<26;salt++)for(let attempt=0;attempt<3;attempt++){
  state.auditPadding='a'.repeat(Math.max(0,length-1))+(length?String.fromCharCode(65+salt):'');
  raw=encode(state);const delta=bytes-Buffer.byteLength(raw);
  if(!delta)return raw;
  length+=delta;
 }
 throw Error('Could not construct exact-size fixture');
}
function fresh(seed=77613){const s=E.newGame(seed);s.runId=`size-boundary-${seed}`;return s;}
function active(){const state=fresh(87),storage=memory();S.saveGame(state,null,storage);storage.writes.length=0;return {state,storage};}
function legacyAtLimit(){
 const golden=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8')).saves[0];
 const legacy=JSON.parse(JSON.parse(golden.raw).payload),raw=padded(legacy,LIMIT,envelope);
 const imported=S.decodeSave(raw);
 assert(Buffer.byteLength(S.encodeSave(imported))>LIMIT,'migration grows this otherwise importable original');
 return {raw,imported};
}

test('a newly committed save at exactly 5,000,000 ASCII characters and bytes remains readable',()=>{
 const s=fresh();s.log=[];for(const item of s.player.items)item.name=`audit-${item.id}`;
 const raw=padded(s,LIMIT),storage=memory();
 assert.equal(raw.length,LIMIT);assert.equal(Buffer.byteLength(raw),LIMIT);
 assert.deepEqual(S.saveGame(s,null,storage),{mirrored:true,warning:''});
 assert.equal(storage.getItem(S.SAVE_KEY),raw);assert.equal(storage.getItem(S.BACKUP_KEY),raw);
 assert.equal(S.encodeSave(S.loadSave(storage).state),raw);
});

test('a newly committed multibyte save at exactly 5,000,000 UTF-8 bytes remains readable and importable',()=>{
 const s=fresh();s.auditUnicode='界'.repeat(1_650_000);const raw=padded(s,LIMIT),{state,storage}=active();
 assert(raw.length<LIMIT);assert.equal(Buffer.byteLength(raw),LIMIT);
 assert.deepEqual(S.saveImportedGame(S.decodeSave(raw),raw,state,storage),{mirrored:true,warning:''});
 assert.equal(S.encodeSave(S.loadSave(storage).state),raw);
});

test('a save one byte above the new-write limit is rejected without changing either active copy',()=>{
 const s=fresh(),raw=padded(s,LIMIT+1),{state,storage}=active(),snapshot=new Map(storage.map);
 assert(S.validateSave(s));assert.equal(Buffer.byteLength(raw),LIMIT+1);
 assert.throws(()=>S.saveGame(s,state,storage),/5 MB.*未保存.*未改动/);
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);
 assert.deepEqual(S.loadSave(storage).state,state);
});

test('an accepted near-limit import cannot commit a fate result that its own loader rejects',()=>{
 const s=fresh(),raw=padded(s,LIMIT-100),{state,storage}=active();
 assert(raw.length<=LIMIT);assert(Buffer.byteLength(raw)<=LIMIT);
 S.saveImportedGame(S.decodeSave(raw),raw,state,storage);
 const before=S.loadSave(storage).state,next=E.transition(before,{type:'fate'}),nextRaw=S.encodeSave(next),snapshot=new Map(storage.map);
 assert(nextRaw.length>LIMIT);assert(S.validateSave(next));storage.writes.length=0;
 assert.throws(()=>S.saveGame(next,before,storage),/5 MB/);
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);
 const restored=S.loadSave(storage).state;
 assert.equal(S.encodeSave(restored),raw);assert.equal(restored.rng,before.rng);assert.equal(restored.revision,before.revision);
 assert.equal(restored.phase,'fate');assert.equal(restored.auditPadding,s.auditPadding);
});

test('previously readable CJK and non-BMP saves remain available for rescue while oversized writes are rejected',()=>{
 for(const text of ['界'.repeat(1_670_000),'😀'.repeat(1_252_000)]){
  const s=fresh();s.auditUnicode=text;const raw=S.encodeSave(s),{state,storage}=active(),snapshot=new Map(storage.map);
  assert(raw.length<LIMIT);assert(Buffer.byteLength(raw)>LIMIT);
  assert.equal(S.encodeSave(S.decodeSave(raw)),raw,'do not tighten historical decode or strip unknown metadata');
  assert.throws(()=>S.saveGame(s,state,storage),/5 MB/);
  assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);
 }
});

test('an oversized current-schema import performs no primary, mirror or archive writes',()=>{
 const s=fresh();s.auditUnicode='界'.repeat(1_670_000);const raw=S.encodeSave(s),imported=S.decodeSave(raw);
 const {state,storage}=active(),snapshot=new Map(storage.map);
 assert.throws(()=>S.saveImportedGame(imported,raw,state,storage),/5 MB/);
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);
});

test('V4 migration growth is checked before an imported original claims immutable archive slots',()=>{
 const {raw,imported}=legacyAtLimit(),{state,storage}=active(),snapshot=new Map(storage.map);
 assert.equal(Buffer.byteLength(raw),LIMIT);
 assert.throws(()=>S.saveImportedGame(imported,raw,state,storage),/5 MB/);
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);
 assert.equal(storage.getItem(S.V4_BACKUP_KEY),null);assert.equal(storage.getItem(S.LEGACY_BACKUP_KEY),null);
 assert.deepEqual(S.loadSave(storage).state,state);
});

test('an oversized first migrated commit preserves both original copies and leaves archives unclaimed',()=>{
 const {raw}=legacyAtLimit(),storage=memory();storage.setItem(S.SAVE_KEY,raw);storage.setItem(S.BACKUP_KEY,raw);
 const before=S.loadSave(storage).state,next=E.transition(before,{type:'lock',id:before.player.equipped.weapon}),snapshot=new Map(storage.map);
 storage.writes.length=0;assert.throws(()=>S.saveGame(next,before,storage),/5 MB/);
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);assert.equal(S.readLegacyBackup(storage),raw);
});

test('stale expected snapshots retain priority and cannot be bypassed by an oversized candidate',()=>{
 const {state,storage}=active(),branch=structuredClone(state);branch.player.gold++;
 const candidate=fresh();candidate.auditUnicode='界'.repeat(1_670_000);const raw=S.encodeSave(candidate),snapshot=new Map(storage.map);
 assert.throws(()=>S.saveGame(candidate,branch,storage),/另一窗口/);
 assert.throws(()=>S.saveImportedGame(S.decodeSave(raw),raw,branch,storage),/另一窗口/);
 assert.deepEqual(storage.writes,[]);assert.deepEqual(storage.map,snapshot);
});

test('ordinary 10,000-item saves still commit, mirror and preserve exact equipment and RNG',()=>{
 let s=fresh(27017);s.floor=200;s.player.level=100;s.player.gold=1_000_000;s.player.hp=E.stats(s).maxHp;
 while(s.player.items.length<10000)s.player.items.push(E.makeItem(s,undefined,s.nextId%8));
 const raw=S.encodeSave(s),storage=memory();assert(Buffer.byteLength(raw)<LIMIT);
 S.saveGame(s,null,storage);const before=S.loadSave(storage).state;
 assert.equal(S.encodeSave(before),raw);
 const next=E.transition(before,{type:'lock',id:before.player.equipped.weapon});
 assert.deepEqual(S.saveGame(next,before,storage),{mirrored:true,warning:''});
 assert.equal(S.encodeSave(S.loadSave(storage).state),S.encodeSave(next));
 assert.equal(storage.getItem(S.SAVE_KEY),storage.getItem(S.BACKUP_KEY));
 assert.equal(next.player.items.length,10000);assert.equal(next.rng,before.rng);
});
