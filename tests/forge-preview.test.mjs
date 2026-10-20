import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,stats,forgePreview,forgeCost,canAct,makeItem,equippedIds} from '../src/engine.js';
import {CATALOG} from '../src/equipment-content.js';
import {itemStats,migrateEquipment,MAX_ITEM_LEVEL} from '../src/equipment.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

function forge(seed=7919){
 let s=newGame(seed);s.floor=140;s.player.level=120;s.player.gold=1000000;s.fate=[3,4];
 for(const slot of ['relic2','relic3']){const item=makeItem(s,'relic',5);s.player.items.push(item);s.player.equipped[slot]=item.id;}
 s.route=['forge','combat','rest','combat','gold','boss'].map((type,index)=>({id:`f140r${index}`,type,done:false,quality:0}));s.phase='route';s.roomIndex=0;
 s=transition(s,{type:'enter'});s.player.hp=Math.floor(stats(s).maxHp*.4);return s;
}

test('six-face previews agree with actual deterministic rolls for all five equipped slots without healing or changing level',()=>{
 for(const slot of ['weapon','armor','relic','relic2','relic3']){
  const seen=new Set();
  for(let seed=1;seed<=150&&seen.size<6;seed++){
   const s=forge(seed*7919),id=s.player.equipped[slot],snapshot=structuredClone(s),preview=forgePreview(s,id);
   assert(preview.canForge);assert.equal(preview.cost,forgeCost(s,s.player.items.find(item=>item.id===id)));assert.deepEqual(s,snapshot,'preview cannot consume RNG or alter the save');
   const after=transition(s,{type:'forge',id}),face=after.lastForge.value,expected=preview.outcomes[face-1],item=after.player.items.find(item=>item.id===id);seen.add(face);
   assert.equal(item.enhance,expected.after.enhance);assert.deepEqual(itemStats(item),expected.after.stats);assert.equal(after.lastForge.gain,expected.gain);
   assert.equal(item.level,preview.before.level);assert.equal(item.levelXp,preview.before.levelXp);assert.equal(after.player.hp,s.player.hp);assert.equal(after.player.gold,s.player.gold-preview.cost);assert.equal(after.revision,s.revision+1);
   assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);assert.deepEqual(s,snapshot);
  }
  assert.equal(seen.size,6,`${slot} must observe every actual rolled face`);
 }
});

test('forge quotes expose the cap, affordability and eligibility while stale quotes never authorize spending',()=>{
 const s=forge(),id=s.player.equipped.armor,item=s.player.items.find(item=>item.id===id);
 for(const enhance of [18,19,20]){
  item.enhance=enhance;const quote=forgePreview(s,id);
  assert(quote.outcomes.every(outcome=>outcome.after.enhance<=20));assert.deepEqual(quote.outcomes.map(outcome=>outcome.gain),enhance===18?[1,1,2,2,2,2]:Array(6).fill(20-enhance));assert.equal(quote.capped,enhance===20);assert.equal(quote.canForge,canAct(s,{type:'forge',id}));
 }
 item.enhance=0;const old=forgePreview(s,id);assert(old.canForge);s.player.gold=old.cost-1;
 assert.equal(forgePreview(s,id).affordable,false);assert.equal(forgePreview(s,id).canForge,false);assert.strictEqual(transition(s,{type:'forge',id}),s);
 s.player.gold=1e6;s.player.equipped.armor=null;assert.equal(forgePreview(s,id).equipped,false);assert.equal(forgePreview(s,id).canForge,false);assert.strictEqual(transition(s,{type:'forge',id}),s);
 s.player.equipped.armor=id;s.phase='combat';assert.equal(forgePreview(s,id).canForge,false);assert.strictEqual(transition(s,{type:'forge',id}),s);
 assert.equal(forgePreview(s,'missing'),null);item.levelXp=-1;assert.equal(forgePreview(s,id),null);
});

test('all authored catalog variants and migrated armor keep fixed traits separate from actual item-stat changes',()=>{
 const s=forge();let cases=0;
 for(const slot of ['weapon','armor','relic'])for(const entry of CATALOG[slot]){
  const item={id:'i100',slot,rarity:entry.rarity,depth:140,level:120,levelXp:73,enhance:4,locked:false,catalogId:entry.id,profile:entry.profile,theme:entry.theme,name:entry.name};
  s.player.items=[item];s.player.equipped={weapon:null,armor:null,relic:null,relic2:null,relic3:null,[slot]:item.id};
  const quote=forgePreview(s,item.id);assert(quote);
  for(const outcome of quote.outcomes){
   assert(outcome.changes.length>0);assert(outcome.changes.every(change=>['attack','hp','defense'].includes(change.key)&&change.delta>0),'fixed chance and conditional traits cannot be presented as enhanced');
   for(const [key,value]of Object.entries(quote.before.stats))if(!['attack','hp','defense'].includes(key))assert.equal(outcome.after.stats[key],value);
  }
  cases++;
 }
 assert.equal(cases,1536);
 const legacy=migrateEquipment({id:'i200',slot:'armor',rarity:3,depth:100,enhance:10,growth:100,profile:1,theme:4,catalogId:'armor-4-1-3',name:'旧日铠甲'});s.player.items=[legacy];s.player.equipped.armor=legacy.id;
 const quote=forgePreview(s,legacy.id);assert(quote.outcomes.every(outcome=>outcome.after.stats.hp>quote.before.stats.hp));assert(quote.outcomes.every(outcome=>outcome.after.stats.defense>quote.before.stats.defense));
});

test('late quotes retain exact smith and rich-room prices, safe ceiling and frozen snapshot data',()=>{
 const s=forge(),id=s.player.equipped.weapon,item=s.player.items.find(item=>item.id===id);item.enhance=18;s.player.talents.smith=5;s.route[0].quality=1;
 const snapshot=structuredClone(s),quote=forgePreview(s,id);assert.equal(quote.cost,forgeCost(s,item));
 quote.before.stats.attack=-1;quote.outcomes[0].after.stats.attack=-2;assert.deepEqual(s,snapshot,'mutating a read-only return value cannot alter input item state');
 item.level=MAX_ITEM_LEVEL;item.levelXp=0;s.player.gold=1e10;const cappedCost=forgePreview(s,id);assert.equal(cappedCost.cost,1e10+1);assert.equal(cappedCost.costExceedsGoldCap,true);assert.equal(cappedCost.affordable,false);assert.equal(cappedCost.canForge,false);assert.equal(equippedIds(s).length,5);
});

test('low-level relic rounding can increase reinforcement with no immediate item-panel gain',()=>{
 const s=forge(),entry=CATALOG.relic.find(entry=>entry.id==='relic-0-0-0'),id=s.player.equipped.relic;
 const replacement={id,slot:'relic',rarity:0,depth:1,level:1,levelXp:0,enhance:0,locked:false,catalogId:entry.id,profile:entry.profile,theme:entry.theme,name:entry.name};s.player.items=s.player.items.map(item=>item.id===id?replacement:item);
 const quote=forgePreview(s,id);assert(quote.canForge);assert(quote.outcomes.every(outcome=>outcome.gain>0));assert(quote.outcomes.every(outcome=>outcome.changes.length===0));
 const after=transition(s,{type:'forge',id});assert(after.lastForge.gain>0);assert.deepEqual(itemStats(after.player.items.find(item=>item.id===id)),quote.before.stats);assert.equal(after.player.gold,s.player.gold-quote.cost);
});
