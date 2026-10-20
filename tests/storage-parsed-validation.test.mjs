import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const root=process.env.QA_STORAGE_ROOT?pathToFileURL(process.env.QA_STORAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root)),S=await import(new URL('src/storage.js',root));
function fixture(){
 const s=E.newGame(27017);s.runId='parsed-validation-27017';
 while(s.player.items.length<32)s.player.items.push(E.makeItem(s,undefined,s.nextId%8));
 s.auditMetadata={unknown:'原始扩展 😀 界',nested:[{value:7}],decoy:'{"version":2,"payload":"not the source"}'};return s;
}
function memory(raw,mirror=raw){
 const map=new Map(),writes=[];if(raw!==undefined)map.set(S.SAVE_KEY,raw);if(mirror!==undefined)map.set(S.BACKUP_KEY,mirror);
 return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);map.set(key,value);}};
}
function inventorySetCount(run,count=32){
 const OriginalSet=globalThis.Set;let inventorySets=0,result;
 try{
  globalThis.Set=class extends OriginalSet{
   constructor(values){super(values);if(Array.isArray(values)&&values.length===count&&values.every(value=>typeof value==='string'&&/^i\d+$/.test(value)))inventorySets++;}
  };
  result=run();
 }finally{globalThis.Set=OriginalSet;}
 return {result,inventorySets};
}
function envelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:5,payload,checksum:(hash>>>0).toString(16)});
}
function auction(){
 let s=fixture();s.floor=200;s.player.level=50;s.player.gold=100000;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';
 s.route=['abyssauction','combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));return E.transition(s,{type:'enter'});
}

test('public validation retains its original inventory passes and exposes no trusted-input flag',()=>{
 const s=fixture();
 assert.deepEqual(inventorySetCount(()=>S.validateSave(s)),{result:true,inventorySets:2});
 assert.deepEqual(inventorySetCount(()=>S.validateSave(s,true)),{result:true,inventorySets:2});
 const raw=S.encodeSave(s);
 assert.deepEqual(inventorySetCount(()=>S.encodeSave(s)),{result:raw,inventorySets:2});
});

test('a freshly decoded current-schema graph builds one inventory ID Set and preserves every field',()=>{
 const s=fixture(),raw=S.encodeSave(s),profile=inventorySetCount(()=>S.decodeSave(raw));
 assert.equal(profile.inventorySets,1);assert.deepEqual(profile.result,s);
 assert.equal(S.encodeSave(profile.result),raw);assert.notEqual(profile.result,s);
 profile.result.auditMetadata.nested[0].value=90;
 assert.equal(S.decodeSave(raw).auditMetadata.nested[0].value,7);
});

test('an ordinary commit reduces only the parsed-current Set and keeps complete writes and callers',()=>{
 const s=fixture(),raw=S.encodeSave(s),next=E.transition(s,{type:'lock',id:'i7'}),store=memory(raw),before=structuredClone({s,next});
 assert.deepEqual(inventorySetCount(()=>S.saveGame(next,s,store)),{result:{mirrored:true,warning:''},inventorySets:3});
 assert.deepEqual(store.writes,[[S.SAVE_KEY,S.encodeSave(next)],[S.BACKUP_KEY,S.encodeSave(next)]]);
 assert.deepEqual(S.loadSave(store),{state:next,recovered:false,warning:''});assert.deepEqual({s,next},before);
});

test('decoded duplicates, wrong equipment slots and reserved auction collisions remain rejected',()=>{
 const mutations=[s=>{s.player.items[31].id=s.player.items[0].id;},s=>{s.player.equipped.weapon=s.player.equipped.armor;},s=>{s.player.items[31].id=`i${s.nextId}`;}];
 for(const mutate of mutations){const s=fixture();mutate(s);assert.equal(S.validateSave(s),false);assert.throws(()=>S.decodeSave(envelope(s)),/内容不完整|不兼容/);}
 const s=auction();s.player.items[31].id=s.event.reward.item.id;
 assert.equal(S.validateSave(s),false);assert.throws(()=>S.decodeSave(envelope(s)),/内容不完整|不兼容/);
});

test('caller-owned changing ID getters keep the original second-pass result and visitation order',()=>{
 for(const towardReward of [true,false]){
  const s=auction(),item=s.player.items[31],ownedId=item.id,rewardId=s.event.reward.item.id,events=[];let reads=0;
  Object.defineProperty(item,'id',{enumerable:true,get(){reads++;const id=(reads<4)!==towardReward?rewardId:ownedId;events.push(id);return id;}});
  assert.equal(S.validateSave(s),!towardReward);
  assert.deepEqual(events,[...Array(3).fill(towardReward?ownedId:rewardId),towardReward?rewardId:ownedId]);
 }
});

test('custom map iterables and map/species result Proxies retain the original collision rejection',()=>{
 for(const mode of ['iterable','mapProxy','speciesProxy']){
  const s=auction(),rewardId=s.event.reward.item.id;let maps=0;
  const wrap=(ids,pass)=>{
   if(mode==='iterable')return{*[Symbol.iterator](){for(let index=0;index<ids.length;index++)yield pass===2&&index===31?rewardId:ids[index];}};
   let reads=0;return new Proxy(ids,{get(target,key,receiver){if(key==='31'&&(pass===2||++reads>1))return rewardId;return Reflect.get(target,key,receiver);}});
  };
  if(mode==='speciesProxy'){
   class CustomItems extends Array{static get [Symbol.species](){return function(length){return wrap(new Array(length),++maps);};}}
   Object.setPrototypeOf(s.player.items,CustomItems.prototype);
  }else s.player.items.map=function(callback,...args){return wrap(Array.prototype.map.call(this,callback,...args),++maps);};
  assert.equal(S.validateSave(s),false,mode);assert.equal(maps,2,mode);
 }
});

test('full expected comparison still rejects raw-number normalization and Proxy property-order branches',()=>{
 const values=[()=>new Proxy({'1':'one','2':'two'},{ownKeys:()=>['2','1']})];
 // JSON.rawJSON is not present in every supported browser/Node release. The
 // Proxy case exercises the same full-snapshot requirement on all versions.
 if(typeof JSON.rawJSON==='function')values.push(()=>JSON.rawJSON('1.0'),()=>JSON.rawJSON('9007199254740993'));
 for(const makeUnknown of values){
  const expected=fixture();expected.auditMetadata=makeUnknown();const raw=S.encodeSave(expected),decoded=S.decodeSave(raw),next=E.transition(decoded,{type:'lock',id:'i7'}),store=memory(raw);
  assert.notEqual(JSON.stringify(decoded),JSON.stringify(expected));
  assert.throws(()=>S.saveGame(next,expected,store),/另一窗口已更新进度/);
  assert.deepEqual(store.writes,[]);assert.equal(store.getItem(S.SAVE_KEY),raw);assert.equal(store.getItem(S.BACKUP_KEY),raw);
 }
});

test('legacy source migration still validates and archives its full original before active writes',()=>{
 const raw=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8')).saves[0].raw,store=memory(raw),state=S.loadSave(store).state,next=E.transition(state,{type:'lock',id:state.player.equipped.weapon});
 assert.equal(state.version,5);assert.equal(JSON.parse(raw).version,4);
 assert.deepEqual(S.saveGame(next,state,store),{mirrored:true,warning:''});
 assert.deepEqual(store.writes.map(([key])=>key),[S.V4_BACKUP_KEY,S.SAVE_KEY,S.BACKUP_KEY]);
 assert.equal(store.getItem(S.V4_BACKUP_KEY),raw);assert.deepEqual(S.loadSave(store).state,next);
});
