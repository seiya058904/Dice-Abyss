import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newGame,transition,stats,itemStats,itemValue} from '../src/engine.js';
import {CATALOG} from '../src/content.js';
import {decodeSave,encodeSave,validateSave,saveGame,archiveImportedSave,readLegacyBackup,SAVE_KEY,BACKUP_KEY,V4_BACKUP_KEY} from '../src/storage.js';
const golden=JSON.parse(readFileSync(new URL('./fixtures/v4-baseline.json',import.meta.url),'utf8'));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),map};};
function prepared(seed,floor,type){let s=newGame(seed);s.floor=floor;s.player.level=10;s.player.gold=100000;s.player.hp=stats(s).maxHp;s.player.xp=0;s.counters.kills=2;s.fate=[3,4];s.phase='route';s.roomIndex=0;s.route=[type,'combat','forge','combat','gold',floor%5===0?'boss':'elite'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));return s;}
test('V5 retains all 648 V4 catalog identities, names, multipliers and attributes at four levels',()=>{
 const byId=new Map(Object.values(CATALOG).flat().map(e=>[e.id,e]));assert.equal(golden.catalog.length,648);
 for(const {entry,samples} of golden.catalog){assert.deepEqual(byId.get(entry.id),entry,entry.id);for(const expected of samples){const item={...entry,id:'i1',catalogId:entry.id,level:expected.level,levelXp:0,depth:1,enhance:7};assert.equal(itemValue(item),expected.value,entry.id);assert.deepEqual(itemStats(item),expected.stats,entry.id+' / '+expected.level);}}
});
test('V5 reproduces 2320 V4 floor 1–29 reward/shop fixtures and ending RNG exactly',()=>{
 assert.equal(golden.rewardCases.length,2320);
 for(const sample of golden.rewardCases){let s=transition(prepared(sample.seed,sample.floor,sample.type),{type:'enter'});if(s.phase==='combat'){s.enemy.hp=1;s.enemy.shield=0;s.enemy.stage=2;s=transition(s,{type:'roll'});}
  const label=sample.seed+'/'+sample.floor+'/'+sample.type;assert.equal(s.rng,sample.rng,label);if(sample.chest)assert.deepEqual(s.chest,sample.chest,label);else assert.deepEqual(s.shop,sample.shop,label);
 }
});
for(const sample of golden.saves)test('V4→V5 preserves committed assets and RNG: '+sample.label,()=>{
 const old=JSON.parse(JSON.parse(sample.raw).payload),upgraded=decodeSave(sample.raw);assert.equal(upgraded.version,5);assert(validateSave(upgraded));assert.equal(upgraded.rng,old.rng);
 for(const key of ['route','fate','nextId','chest','loot','shop','enemy','event','lastRoll','lastForge','lastFusion'])assert.deepEqual(upgraded[key],old[key],key);
 for(const key of ['items','equipped','gold','hp','level','xp','talentPoints'])assert.deepEqual(upgraded.player[key],old.player[key],key);
 for(const [key,rank] of Object.entries(old.player.talents))assert.equal(upgraded.player.talents[key],rank);
 assert.deepEqual(decodeSave(encodeSave(upgraded)),upgraded);
 const store=memory();store.setItem(SAVE_KEY,sample.raw);store.setItem(BACKUP_KEY,sample.raw);
 assert.doesNotThrow(()=>saveGame(upgraded,null,store));assert.equal(store.getItem(V4_BACKUP_KEY),sample.raw);assert.equal(readLegacyBackup(store),sample.raw);
 const committed=store.getItem(SAVE_KEY);saveGame(decodeSave(committed),null,store);assert.equal(store.getItem(V4_BACKUP_KEY),sample.raw);
 if(upgraded.phase==='chest'){const opened=transition(upgraded,{type:'open'});assert(opened.player.items.some(i=>i.id===old.chest.item.id));assert.strictEqual(transition(opened,{type:'open'}),opened);}
 if(upgraded.phase==='loot')assert.strictEqual(transition(upgraded,{type:'open'}),upgraded);
});
test('V4 archive failure prevents overwriting either active save; a corrupt archive is not silently replaced',()=>{
 const raw=golden.saves[0].raw,s=decodeSave(raw),store=memory();store.setItem(SAVE_KEY,raw);store.setItem(BACKUP_KEY,raw);
 const write=store.setItem;store.setItem=(key,value)=>{if(key===V4_BACKUP_KEY)throw Error('quota');write(key,value);};
 assert.throws(()=>saveGame(s,null,store),/原始存档/);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.getItem(BACKUP_KEY),raw);
 store.setItem=write;store.setItem(V4_BACKUP_KEY,'corrupted');assert.throws(()=>archiveImportedSave(raw,store));assert.equal(store.getItem(V4_BACKUP_KEY),'corrupted');assert.equal(store.getItem(SAVE_KEY),raw);
});
