import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,makeItem,stats,itemStats,itemValue,equippedIds,fusionPreview,generateRoute,createEnemy,resolveRoll,depthPower} from '../src/engine.js';
import {CATALOG,TALENTS,ROOM_NAMES,BOSSES} from '../src/content.js';
import {encodeSave,decodeSave,validateSave,migrateSave} from '../src/storage.js';
import {runAdventure} from '../scripts/simulate.mjs';
import {COMBAT_ROOMS,EVENT_ROOMS,eventChoices} from '../src/encounters.js';
import {DEEP_ROOMS,DEEP_TALENTS} from '../src/deep-content.js';
import {legacyItemValue} from '../src/equipment.js';
const room=(type,seed=123,floor=20)=>{let s=newGame(seed);s.floor=Math.max(floor,DEEP_ROOMS[type]?.floor||1);s=transition(s,{type:'fate'});s.route[0].type=type;return transition(s,{type:'enter'});};
test('1536 catalog entries are unique, obtainable and have distinct role-specific signatures',()=>{
 const s=newGame(821);for(const slot of ['weapon','armor','relic']){
  assert.equal(CATALOG[slot].length,512);const found=new Set(),signatures=new Set();
  for(const c of CATALOG[slot])signatures.add(JSON.stringify(itemStats({...c,level:20,levelXp:0,depth:20,enhance:0,catalogId:c.id})));
  assert.equal(signatures.size,512);
  for(let n=0;n<20000&&found.size<512;n++)found.add(makeItem(s,slot,n%8).catalogId);
  assert.equal(found.size,512);
 }
});
test('three relics stack once, replacement keeps ownership, duplicate equip cannot duplicate effects',()=>{
 let s=newGame(23);const before=stats(s),items=[makeItem(s,'relic',2),makeItem(s,'relic',3)];
 for(const item of items){s.player.items.push(item);s=transition(s,{type:'equip',id:item.id});}
 assert.equal(equippedIds(s).length,5);assert.equal(stats(s).attack,before.attack+items.reduce((n,i)=>n+itemStats(i).attack,0));
 const snapshot=encodeSave(s);assert.strictEqual(transition(s,{type:'equip',id:items[0].id}),s);assert.equal(encodeSave(s),snapshot);
 const replacement=makeItem(s,'relic',3);s.player.items.push(replacement);s=transition(s,{type:'equip',id:replacement.id,slot:'relic2'});
 assert(s.player.items.some(i=>i.id===items[0].id));assert.equal(s.player.equipped.relic2,replacement.id);assert(validateSave(s));
});
test('legacy migration preserves identity, original investment, RNG and pending reward across depths',()=>{
 for(const floor of [1,10,50,100]){
  const s=room('chest',99,floor);s.version=1;s.player.level=200;s.player.talents={high:3,resonance:4,critical:2};delete s.player.equipped.relic2;delete s.player.equipped.relic3;
  for(const i of [...s.player.items,s.chest.item]){i.rarity=Math.min(3,i.rarity);delete i.level;delete i.levelXp;delete i.catalogId;delete i.theme;delete i.profile;i.enhance=17;i.growth=250;}
  s.player.hp=25;const before=structuredClone(s),next=migrateSave(s);
  for(let n=0;n<s.player.items.length;n++){const old=before.player.items[n],item=next.player.items[n];assert.equal(item.id,old.id);assert.equal(item.enhance,17);assert.equal(itemValue(item),legacyItemValue(old));assert(!Object.hasOwn(item,'growth'));}
  assert.equal(next.chest.item.id,before.chest.item.id);assert.equal(next.chest.gold,before.chest.gold);assert.equal(itemValue(next.chest.item),legacyItemValue(before.chest.item));assert.equal(next.rng,before.rng);assert.equal(next.player.equipped.relic,before.player.equipped.relic);assert.equal(next.player.equipped.relic2,null);assert.equal(next.player.talents.high,3);assert(validateSave(next));assert.deepEqual(decodeSave(encodeSave(next)),next);
 }
});
test('batch fusion atomically divides positive XP among three targets and protects materials for every face',()=>{
 const faces=new Set();for(let seed=1;seed<500;seed++){
  let s=room('fusion',seed);s.player.gold=100000;
  const targets=[makeItem(s,'relic',2),makeItem(s,'relic',2),makeItem(s,'relic',2)],mats=[makeItem(s,'relic',0),makeItem(s,'relic',1)];s.player.items.push(...targets,...mats);
  const ts=targets.map(i=>i.id),ms=mats.map(i=>i.id),preview=fusionPreview(s,ts,ms);assert(preview);const before=encodeSave(s);
  assert.equal(fusionPreview(s,ts,[ms[0],ms[0]]),null);assert.equal(fusionPreview(s,ts,[s.player.equipped.relic]),null);
  mats[0].locked=true;assert.equal(fusionPreview(s,ts,ms),null);assert(fusionPreview(s,ts,ms,true));mats[0].locked=false;
  const next=transition(s,{type:'fuse',targets:ts,materials:ms});faces.add(next.lastForge.value);assert.equal(encodeSave(s),before);assert.equal(next.player.gold,s.player.gold-preview.cost);assert.equal(next.player.items.length,s.player.items.length-2);
  const gained=next.player.items.filter(i=>ts.includes(i.id));assert(gained.every((i,n)=>(i.level>targets[n].level||i.levelXp>targets[n].levelXp)&&i.enhance===0&&!Object.hasOwn(i,'growth')));assert.equal(next.lastForge.gains.reduce((n,x)=>n+x,0),next.lastForge.gain);assert(next.lastForge.gain>=preview.base);assert.strictEqual(transition(next,{type:'fuse',targets:ts,materials:ms}),next);assert.deepEqual(decodeSave(encodeSave(next)),next);
 }
 assert.equal(faces.size,6);
});
test('all 50 rooms enter, interact, save and exit without optional purchases blocking progress',()=>{
 for(const type of Object.keys(ROOM_NAMES)){
  let s=room(type);s.player.gold=100000;
  if(s.phase==='combat'){delete s.route[0].waves;delete s.route[0].wave;s.enemy.hp=1;s.enemy.shield=0;s=transition(s,{type:'roll'});assert.equal(s.phase,'chest');}
  if(s.phase==='chest'){s=transition(s,{type:'open'});assert.equal(s.phase,'loot');}
  if(s.phase==='altar'){s=transition(s,{type:'bless'});assert(s.blessing>0);assert.strictEqual(transition(s,{type:'bless'}),s);}
  if(s.phase==='rest'){s=transition(s,{type:'rest'});assert(s.ward>0);assert.strictEqual(transition(s,{type:'rest'}),s);}
  if(s.phase==='event'){s=transition(s,{type:'event-choice',id:'leave'});assert.equal(s.event.status,'resolved');}
  if(s.phase==='forge'){s=transition(s,{type:'forge',id:s.player.equipped.weapon});assert(s.lastForge);}
  assert(validateSave(s),type);s=decodeSave(encodeSave(s));const old=s.roomIndex;s=transition(s,{type:s.phase==='gold'?'gold':'next'});assert.equal(s.roomIndex,old+1,type);
 }
});
test('all 30 preserved V4 talents have observable combat, luck, stat or economic effects',()=>{
 assert.equal(Object.keys(TALENTS).length,45);
 for(const key of Object.keys(TALENTS).filter(k=>!DEEP_TALENTS[k])){
  let found=false;
  for(let seed=1;seed<=500&&!found;seed++){
   let s=room('combat',seed);s.player.level=20;s.player.hp=50;s.enemy.hp=s.enemy.maxHp=100000;s.enemy.attack=1;s.player.talentPoints=1;
   const t=transition(s,{type:'talent',id:key});assert.equal(t.player.talents[key],1);
   if(key==='fortune'){s=room('chest',seed);const u=structuredClone(s);u.player.talents[key]=1;u.phase='route';const v=transition(u,{type:'enter'});found=v.chest.gold>s.chest.gold;continue;}
   if(key==='smith'){s=room('forge',seed);s.player.gold=10000;const u=structuredClone(s);u.player.talents[key]=1;found=transition(u,{type:'forge',id:u.player.equipped.weapon}).player.gold>transition(s,{type:'forge',id:s.player.equipped.weapon}).player.gold;continue;}
   if(key==='omen')s.fate=t.fate=[3,3];
   if(key==='jackpot'){s.enemy.hp=t.enemy.hp=1;s.enemy.shield=t.enemy.shield=0;}
   if(key==='slayer')s.enemy.type=t.enemy.type='elite';
   if(key==='recovery')s.enemy.hp=t.enemy.hp=1;
   const a=transition(s,{type:'roll'}),b=transition(t,{type:'roll'});
   found=JSON.stringify(stats(s))!==JSON.stringify(stats(t))||JSON.stringify(a.lastRoll)!==JSON.stringify(b.lastRoll)||a.player.hp!==b.player.hp||a.chest?.gold!==b.chest?.gold;
  }assert(found,`${key} has no observed effect`);
 }
});
test('high-depth routes, enemies and saves remain finite; 1000 seeds reach all room types with high fate favoring ordinary reward chests rather than enlarging rare pool mass',()=>{
 const seen=new Set();let rich=0,poor=0;
 for(let seed=1;seed<=1000;seed++)for(const floor of [11,20,50,100,10000,1000000]){
  const s=newGame(seed);s.floor=floor;s.player.items.push(makeItem(s,'relic',1),makeItem(s,'weapon',1));s.player.talents.power=1;
  for(const fate of [[1,1],[6,6]]){const route=generateRoute(s,fate);route.forEach(r=>seen.add(r.type));const quality=route.filter(r=>r.type==='chest').length;if(fate[0]===6)rich+=quality;else poor+=quality;assert.equal(route.at(-1).type,floor%5===0?'boss':'elite');}
  const e=createEnemy(s,'boss');assert(Number.isFinite(e.hp)&&Number.isFinite(e.attack));assert(validateSave(s));
 }
 assert.equal(seen.size,50);assert(rich>poor*1.05);
});
test('continuous adventures reach 20, 50 and 100 with valid saves and no artificial ending',()=>{
 for(const floors of [20,50,100])for(const seed of [7919,15838,23757]){
  const r=runAdventure(seed,{floors,validate:true});assert(r.completed,`${seed}: ${r.s.floor} ${r.s.phase}`);assert.equal(r.s.floor,floors);assert(validateSave(r.s));assert.equal(transition(r.s,{type:'descend'}).floor,floors+1);
 }
});
