import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';

const root=process.env.QA_GOLD_ROOT?pathToFileURL(process.env.QA_GOLD_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
function chestState(){
 let s=E.newGame(7919);s.runId='gold-storage';s.fate=[3,4];s.phase='route';s.route=['chest','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f1r${i}`,type,done:false,quality:0}));
 return E.transition(s,{type:'enter'});
}
function envelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(hash>>>0).toString(16),payload});
}
function memory(main,mirror=main){
 const map=new Map([[S.SAVE_KEY,main],[S.BACKUP_KEY,mirror]]),writes=[];
 return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};
}

test('legacy states may omit the receipt and preserve all reward metadata including name collisions',()=>{
 for(const opened of [false,true]){
  let state=chestState();if(opened)state=E.transition(state,{type:'open'});const reward=opened?state.loot:state.chest;
  delete state.lootCreditedGold;reward.unknownGoldAnnotation={list:[0,'legacy']};reward.creditedGold={external:'opaque reward metadata'};
  const loaded=S.decodeSave(S.encodeSave(state));assert.deepEqual(loaded,state);assert.equal(Object.hasOwn(loaded,'lootCreditedGold'),false);
 }
});

test('optional state lootCreditedGold accepts exact integers from zero through its loot nominal amount',()=>{
 for(const ratio of [0,.5,1]){
  const state=E.transition(chestState(),{type:'open'});state.lootCreditedGold=Math.floor(state.loot.gold*ratio);
  assert(S.validateSave(state));assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);
 }
});

test('malformed or over-nominal gold receipts reject saves and imports before any storage write',()=>{
 for(const opened of [false,true])for(const value of [null,true,'10',[],{},-1,.5,Infinity,-Infinity,NaN,1e10]){
  let state=chestState();if(opened)state=E.transition(state,{type:'open'});state.lootCreditedGold=value;
  const valid=chestState(),raw=S.encodeSave(valid),store=memory(raw),before=new Map(store.map),expected=S.loadSave(store).state;
  assert.equal(S.validateSave(state),false,`${opened?'loot':'chest'} ${String(value)}`);assert.throws(()=>S.decodeSave(envelope(state)),/内容不完整|不兼容/);
  assert.throws(()=>S.saveImportedGame(state,envelope(state),expected,store),/内容不完整|不兼容/);assert.throws(()=>S.saveGame(state,expected,store),/状态不完整/);
  assert.deepEqual(store.writes,[]);assert.deepEqual(store.map,before);
 }
 for(const value of [0,1]){const orphan=chestState();orphan.lootCreditedGold=value;assert.equal(S.validateSave(orphan),false);assert.throws(()=>S.decodeSave(envelope(orphan)),/内容不完整|不兼容/);}
});

test('a valid mirror remains recoverable when only the primary receipt is malformed',()=>{
 let state=E.transition(chestState(),{type:'open'});delete state.lootCreditedGold;const raw=S.encodeSave(state);
 state.lootCreditedGold='forged-history';const restored=S.loadSave(memory(envelope(state),raw));assert.equal(restored.recovered,true);assert.deepEqual(restored.state,S.decodeSave(raw));
});

test('existing V4 migration fixtures require no new gold metadata and retain their original reward records',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));
 for(const {raw}of fixtures.saves){
  const old=JSON.parse(JSON.parse(raw).payload),loaded=S.decodeSave(raw);
  for(const key of ['chest','loot'])if(old[key])assert.equal(Object.hasOwn(loaded[key],'creditedGold'),false);
  assert.equal(Object.hasOwn(loaded,'lootCreditedGold'),false);
  assert.deepEqual(S.decodeSave(S.encodeSave(loaded)),loaded);
 }
});
