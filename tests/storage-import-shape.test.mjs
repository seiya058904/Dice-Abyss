import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Run these exact assertions against an untouched input with QA_STORAGE_ROOT.
const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const V=await import(new URL('src/views.js',root));
const legacy=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8')).saves[0].raw;
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};};
function envelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;
 for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,payload,checksum:(hash>>>0).toString(16)});
}
function shop(type){
 let state=E.newGame(78349);state.player.gold=100000;state.floor=200;state.player.level=50;state.player.hp=E.stats(state).maxHp-10;
 state.fate=[3,4];state.phase='route';state.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));
 return E.transition(state,{type:'enter'});
}

test('healing offers cannot import malformed or complete equipment through the heal ID exemption',()=>{
 for(const type of ['merchant','blackmarket'])for(const complete of [false,true]){
  const bad=shop(type),stock=bad.shop[0].item;
  bad.shop.find(offer=>offer.id==='heal').item=complete?structuredClone(stock):{id:stock.id};
  const storage=memory();storage.setItem(S.SAVE_KEY,legacy);storage.setItem(S.BACKUP_KEY,legacy);
  const expected=S.loadSave(storage).state,original=new Map(storage.map);storage.writes.length=0;
  assert.throws(()=>S.saveImportedGame(bad,envelope(bad),expected,storage),/内容不完整|不兼容/,`${type} ${complete?'complete':'partial'} item must be rejected before replacement`);
  assert.equal(S.validateSave(bad),false);assert.throws(()=>S.decodeSave(envelope(bad)),/内容不完整|不兼容/);
  assert.deepEqual(storage.map,original);assert.deepEqual(storage.writes,[],'no archive, primary or mirror writes');
 }
});

test('legitimate absent or null healing payloads still import, heal once and preserve item purchases',()=>{
 for(const type of ['merchant','blackmarket'])for(const empty of [undefined,null]){
  const original=shop(type);if(empty===null)original.shop.find(offer=>offer.id==='heal').item=null;
  assert(S.validateSave(original));const raw=S.encodeSave(original),before=E.newGame(12983),storage=memory();S.saveGame(before,null,storage);
  S.saveImportedGame(original,raw,before,storage);const loaded=S.loadSave(storage).state;
  assert.deepEqual(loaded,original);assert.doesNotThrow(()=>V.center(loaded,{view:'game',busy:false}));
  const healed=E.transition(loaded,{type:'buy',id:'heal'}),offer=loaded.shop.find(offer=>offer.id==='heal');
  assert.equal(healed.player.hp,E.stats(healed).maxHp);assert.equal(healed.player.items.length,loaded.player.items.length);
  assert.equal(healed.player.gold,loaded.player.gold-offer.price);assert.equal(healed.rng,loaded.rng);assert.equal(healed.revision,loaded.revision+1);
  assert.strictEqual(E.transition(healed,{type:'buy',id:'heal'}),healed);S.saveGame(healed,loaded,storage);
  const bought=E.transition(healed,{type:'buy',id:healed.shop[0].id});S.saveGame(bought,healed,storage);
  assert.equal(bought.player.items.length,healed.player.items.length+1);assert.equal(bought.player.gold,healed.player.gold-healed.shop[0].price);
  assert.deepEqual(S.loadSave(storage).state,bought);assert.equal(storage.getItem(S.SAVE_KEY),storage.getItem(S.BACKUP_KEY));
  assert.doesNotThrow(()=>V.center(bought,{view:'game',busy:false}));
 }
});
