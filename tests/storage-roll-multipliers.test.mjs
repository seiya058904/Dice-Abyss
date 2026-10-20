import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const golden=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));
const fields=['criticalMultiplier','followMultiplier'];
function envelope(state) {
  const payload=JSON.stringify(state);let hash=2166136261;
  for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
  return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(hash>>>0).toString(16),payload});
}
function memory(main,mirror=main) {
  const map=new Map([[S.SAVE_KEY,main],[S.BACKUP_KEY,mirror]]),writes=[];
  return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};
}
function oldRoll() {
  let state=E.newGame(28018);state.runId='optional-roll-multipliers';
  state=E.transition(state,{type:'fate'});state=E.transition(state,{type:'enter'});
  assert.equal(state.phase,'combat');state=E.transition(state,{type:'roll'});
  assert(state.lastRoll);
  for(const key of fields)delete state.lastRoll[key];
  state.lastRoll.auditMetadata={retained:['old roll',2]};
  return state;
}

test('old committed rolls may omit both multipliers and round-trip without being backfilled',()=>{
  const state=oldRoll(),raw=S.encodeSave(state),loaded=S.decodeSave(raw);
  assert.deepEqual(loaded,state);
  for(const key of fields)assert.equal(Object.hasOwn(loaded.lastRoll,key),false);
});

test('either optional multiplier accepts finite nonnegative numbers without a hardcoded current balance cap',()=>{
  for(const key of fields)for(const value of [0,1,1.8,1.7500000000000002,12345.75,Number.MAX_VALUE]) {
    const state=oldRoll();state.lastRoll[key]=value;
    assert(S.validateSave(state),`${key}=${value}`);
    const loaded=S.decodeSave(S.encodeSave(state));assert.deepEqual(loaded,state);
    assert.equal(loaded.lastRoll[key],value);
    assert.equal(Object.hasOwn(loaded.lastRoll,fields.find(field=>field!==key)),false);
  }
});

test('present malformed multiplier values reject direct saves and imports before any key is written',()=>{
  for(const key of fields)for(const value of [null,true,'1.8',[],{},-0.01,Infinity,-Infinity,NaN]) {
    const malformed=oldRoll();malformed.lastRoll[key]=value;
    const activeRaw=golden.saves[0].raw,store=memory(activeRaw),before=new Map(store.map),expected=S.loadSave(store).state;
    assert.equal(S.validateSave(malformed),false,`${key}=${String(value)}`);
    assert.throws(()=>S.decodeSave(envelope(malformed)),/内容不完整|不兼容/);
    assert.throws(()=>S.saveImportedGame(malformed,envelope(malformed),expected,store),/内容不完整|不兼容/);
    assert.throws(()=>S.saveGame(malformed,expected,store),/状态不完整/);
    assert.deepEqual(store.writes,[]);assert.deepEqual(store.map,before);
  }
});

test('a valid mirror remains recoverable when the primary contains a malformed optional multiplier',()=>{
  for(const key of fields) {
    const state=oldRoll(),raw=S.encodeSave(state);state.lastRoll[key]='untrusted';
    const loaded=S.loadSave(memory(envelope(state),raw));
    assert.equal(loaded.recovered,true);assert.deepEqual(loaded.state,S.decodeSave(raw));
  }
});

test('all existing V4 snapshots migrate without requiring new roll fields or changing historical metadata',()=>{
  for(const {raw} of golden.saves) {
    const original=JSON.parse(JSON.parse(raw).payload),migrated=S.decodeSave(raw);
    if(original.lastRoll) {
      assert.deepEqual(migrated.lastRoll,original.lastRoll);
      for(const key of fields)assert.equal(Object.hasOwn(migrated.lastRoll,key),false);
    }
    assert.deepEqual(S.decodeSave(S.encodeSave(migrated)),migrated);
  }
});
