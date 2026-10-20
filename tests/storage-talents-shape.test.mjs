import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Run the same guard against an isolated earlier package to reproduce the
// accepted import and paid-rank loss; do not alter the original test files.
const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const golden=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));

function envelope(state) {
  const payload=JSON.stringify(state);let hash=2166136261;
  for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
  return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(hash>>>0).toString(16),payload});
}
function memory(main=null,mirror=main) {
  const map=new Map(),writes=[];
  if(main!==null)map.set(S.SAVE_KEY,main);
  if(mirror!==null)map.set(S.BACKUP_KEY,mirror);
  return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};
}
function fixture(version=5) {
  const state=version===5?E.newGame(28008):JSON.parse(JSON.parse(golden.saves[0].raw).payload);
  state.version=version;state.runId=`talent-container-v${version}`;state.player.talentPoints=3;
  if(version<4) {
    state.player.hp=1;
    for(const item of state.player.items){delete item.level;delete item.levelXp;item.growth=0;}
  }
  state.auditMetadata={keep:'未知字段 😀',nested:[{value:73}]};
  return state;
}

test('malformed talent containers are rejected before replacing either active copy or claiming original archives',()=>{
  for(const talents of [[],[0],true,false,1,-1,0,null,'','ranks']) {
    const malformed=fixture();malformed.player.talents=talents;
    const active=fixture(4),activeRaw=envelope(active),store=memory(activeRaw),before=new Map(store.map),expected=S.loadSave(store).state;
    assert(expected,'a valid legacy run must be active before the attempted replacement');
    assert.equal(S.validateSave(malformed),false,JSON.stringify(talents));
    assert.throws(()=>S.decodeSave(envelope(malformed)),/内容不完整|不兼容/,JSON.stringify(talents));
    assert.throws(()=>S.saveImportedGame(malformed,envelope(malformed),expected,store),/内容不完整|不兼容/);
    assert.throws(()=>S.saveGame(malformed,expected,store),/状态不完整/);
    assert.deepEqual(store.writes,[],'rejected imports must not claim V4/pre-levels archives or write active keys');
    assert.deepEqual(store.map,before,'both active copies remain byte identical');
  }
});

test('a malformed V5 primary recovers the valid mirror, while two malformed copies do not become playable',()=>{
  const malformed=fixture();malformed.player.talents=[];
  const valid=fixture(),validRaw=S.encodeSave(valid),badRaw=envelope(malformed);
  const recovered=S.loadSave(memory(badRaw,validRaw));
  assert.equal(recovered.recovered,true);assert.deepEqual(recovered.state,valid);
  assert.match(recovered.warning,/镜像恢复/);
  const rejected=S.loadSave(memory(badRaw,badRaw));
  assert.equal(rejected.state,null);assert.match(rejected.error,/无法读取存档/);
});

test('array talent tables are also rejected through V1–V4 migration before any original archive is claimed',()=>{
  for(const version of [1,2,3,4]) {
    const malformed=fixture(version);malformed.player.talents=[];
    const raw=envelope(malformed),store=memory(raw);
    assert.throws(()=>S.decodeSave(raw),/内容不完整|不兼容/,`V${version}`);
    assert.equal(S.loadSave(store).state,null);
    assert.deepEqual(store.writes,[]);
    assert.equal(store.map.get(S.SAVE_KEY),raw);assert.equal(store.map.get(S.BACKUP_KEY),raw);
  }
});

test('explicitly replacing an unreadable old array-table save still preserves the exact original rescue archives',()=>{
  for(const version of [1,2,3,4]) {
    const malformed=fixture(version);malformed.player.talents=[];
    const raw=envelope(malformed),store=memory(raw),replacement=E.newGame(28010);
    assert.equal(S.loadSave(store).state,null);
    S.saveGame(replacement,undefined,store);
    assert.deepEqual(S.loadSave(store).state,replacement);
    assert.equal(store.map.get(S.V4_BACKUP_KEY),raw);
    assert.equal(store.map.get(S.LEGACY_BACKUP_KEY),version<4?raw:undefined);
    assert.equal(S.readLegacyBackup(store),raw,'a rejected shape must not prevent raw legacy rescue');
  }
});

test('valid sparse V1–V5 talent maps retain purchased points through save, reload and a second purchase',()=>{
  for(const version of [1,2,3,4,5])for(const ranks of [{},{high:1}]) {
    const source=fixture(version);source.player.talents=ranks;
    const sourceRaw=envelope(source),imported=S.decodeSave(sourceRaw),active=E.newGame(28009),store=memory(S.encodeSave(active));
    S.saveImportedGame(imported,sourceRaw,active,store);
    let current=S.loadSave(store).state;
    assert.deepEqual(current.auditMetadata,source.auditMetadata);
    const initialRank=E.talent(current,'high'),initialPoints=current.player.talentPoints;
    for(let purchase=1;purchase<=2;purchase++) {
      const next=E.transition(current,{type:'talent',id:'high',count:1});
      assert.notStrictEqual(next,current);assert(S.validateSave(next));
      S.saveGame(next,current,store);
      current=S.loadSave(store).state;
      assert.equal(E.talent(current,'high'),initialRank+purchase);
      assert.equal(current.player.talentPoints,initialPoints-purchase);
      assert.deepEqual(current,next,'every purchased rank must round-trip exactly');
      assert.equal(store.map.get(S.SAVE_KEY),store.map.get(S.BACKUP_KEY));
      assert.deepEqual(current.auditMetadata,source.auditMetadata);
    }
    assert.equal(store.map.get(S.V4_BACKUP_KEY),version<5?sourceRaw:undefined);
    assert.equal(store.map.get(S.LEGACY_BACKUP_KEY),version<4?sourceRaw:undefined);
  }
});

test('every shipped V4 fixture and its migrated V5 snapshot remain legal with their original rank values',()=>{
  for(const {raw} of golden.saves) {
    const migrated=S.decodeSave(raw);
    assert(S.validateSave(migrated));
    assert.deepEqual(S.decodeSave(S.encodeSave(migrated)),migrated);
    const original=JSON.parse(JSON.parse(raw).payload);
    for(const [key,rank] of Object.entries(original.player.talents))assert.equal(migrated.player.talents[key],rank);
  }
});
