import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSSES,CATALOG} from '../src/content.js';
import {EXTRA_ENEMIES,canonicalCombatType} from '../src/encounters.js';
import {newGame,createEnemy,stats,enemyIntent,resolveRoll} from '../src/engine.js';

function battle(seed=7919,room='combat',level=1){
 const s=newGame(seed);s.floor=30;s.player.level=level;s.player.xp=0;
 // Neutral loadout keeps the tests about the published intent, rather than random starter traits.
 s.player.equipped={weapon:null,armor:null,relic:null,relic2:null,relic3:null};s.fate=[3,4];
 s.route=[{id:'f30r0',type:room,done:false}];s.roomIndex=0;s.phase='combat';s.enemy=createEnemy(s,room);
 Object.assign(s.enemy,{hp:750000,maxHp:1000000,shield:0,maxShield:200000,attack:100,turns:0,stage:2,trait:'steady'});
 s.player.hp=stats(s).maxHp;s.ward=0;s.counters.kills=10;return s;
}
const bounds=intent=>({min:intent.minDamage??Math.min(intent.damage,intent.conditionalDamage??intent.damage),max:Math.max(intent.damage,intent.conditionalDamage||0,intent.maxDamage||0)});
function checkForecast(s,label=''){
 const before=structuredClone(s),intent=enemyIntent(s),range=bounds(intent);
 assert.deepEqual(s,before,'forecast must neither draw dice nor mutate state');
 assert(Number.isSafeInteger(range.min)&&Number.isSafeInteger(range.max)&&range.min>=0&&range.max>=range.min,label);
 resolveRoll(s);assert(!s.lastRoll.killed,'fixture must leave the enemy alive');
 assert(s.lastRoll.retaliation>=range.min&&s.lastRoll.retaliation<=range.max,`${label}: ${s.lastRoll.values} dealt ${s.lastRoll.retaliation}, shown ${range.min}–${range.max}`);
 return {intent,range,last:s.lastRoll};
}
function equipEffect(s,key){
 const entries=Object.values(CATALOG).flat().filter(e=>e.effects[key]>0);
 const entry=entries.find(e=>!s.player.equipped[e.slot])||entries[0];assert(entry,key);
 const item={...s.player.items.find(i=>i.slot===entry.slot),catalogId:entry.id,profile:entry.profile,rarity:entry.rarity,level:1,levelXp:0,enhance:0};
 s.player.items=s.player.items.filter(i=>i.id!==item.id).concat(item);s.player.equipped[item.slot]=item.id;
}

test('conditional low faces and a surviving berserker threshold cannot exceed the visible forecast',()=>{
 for(const variant of [0,1]){
  const template=EXTRA_ENEMIES.find(e=>e.roomType==='disruptor'&&e.variant===variant);let triggered=false;
  for(let seed=1;seed<=100;seed++){
   const s=battle(seed*7919,'disruptor');Object.assign(s.enemy,template);const {range,last}=checkForecast(s,`disruptor ${variant}`);
   if(last.values.includes(variant?2:1)&&!last.values.includes(variant?5:6)){triggered=true;assert(range.max>range.min);}
  }
  assert(triggered);
  const berserker=EXTRA_ENEMIES.find(e=>e.roomType==='berserker'&&e.variant===variant),s=battle(7919,'berserker');
  Object.assign(s.enemy,berserker,{hp:Math.floor(1000000*(variant?.5:.35))+1});
  const {range}=checkForecast(s,`berserker ${variant} crossing`);assert(range.max>range.min);assert(s.enemy.hp<=s.enemy.maxHp*(variant?.5:.35));
 }
});

test('all six added bosses include same-hit phase escalation and dice-dependent attacks in visible bounds',()=>{
 for(const boss of BOSSES.filter(e=>e.mechanic))for(const level of [1,3,11]){
  let crossed=false;
  for(let seed=1;seed<=30;seed++){
   const s=battle(seed*7919,'boss',level);Object.assign(s.enemy,boss,{hp:500001,stage:1});
   const {range,last}=checkForecast(s,`${boss.mechanic} / ${level}`);crossed ||= last.phaseChanged;assert(range.max>=range.min);
   assert.equal(s.enemy.stage,2);assert(last.phaseChanged);assert(s.enemy.shield>0);
  }
  assert(crossed,boss.mechanic);
 }
});

test('all encounter variants and periodic turns forecast actual counters across one to six dice',()=>{
 for(const template of EXTRA_ENEMIES)for(const level of [1,3,11])for(const turns of [0,1,2,3]){
  const s=battle((turns+level)*7919,template.roomType,level);Object.assign(s.enemy,template,{turns,wave:3});
  checkForecast(s,`${template.roomType} variant ${template.variant}, completed ${turns}, level ${level}`);
 }
 // Old pulse/ramp/rage traits and the non-stacking elite heavy counter remain covered too.
 for(const trait of ['pulse','ramp','rage'])for(const turns of [0,1,2,3]){
  const s=battle(7919,'elite',3);Object.assign(s.enemy,{trait,turns,hp:500001,stage:1});checkForecast(s,`${trait} ${turns}`);
 }
});

test('ward, conditional ward and dodge are included, while cursed life loss bypasses ward',()=>{
 for(const variant of [0,1]){
  let curseSeen=false,dodgeSeen=false,pairSeen=false;
  for(let seed=1;seed<=150;seed++){
   const s=battle(seed*7919,'cursed',3);Object.assign(s.enemy,EXTRA_ENEMIES.find(e=>e.roomType==='cursed'&&e.variant===variant));
   equipEffect(s,'dodge');equipEffect(s,'pairWard');s.player.talents.mercy=3;s.player.hp=stats(s).maxHp;s.ward=10000;
   const hp=s.player.hp,{range,last}=checkForecast(s,`warded curse ${variant}`);
   const cursed=last.values.includes(variant?2:1)&&!last.values.includes(variant?5:6);
   if(cursed){curseSeen=true;assert(last.retaliation>0);assert.equal(hp-s.player.hp,last.retaliation);assert(range.max>=last.retaliation);}
   if(last.dodged)dodgeSeen=true;if(last.best>=2&&last.wardGain>0)pairSeen=true;
  }
  assert(curseSeen&&dodgeSeen&&pairSeen,`missing actual branch variant ${variant}`);
 }
 for(let seed=1;seed<=150;seed++){
  const s=battle(seed*7919,'boss',3);Object.assign(s.enemy,BOSSES.find(b=>b.mechanic==='boss_collector'));
  equipEffect(s,'pairWard');equipEffect(s,'dodge');s.player.talents.mercy=3;s.player.hp=stats(s).maxHp;
  checkForecast(s,'collector extra ward and dodge');
 }
});

function killedReward(seed,room){
 const s=battle(seed,room,11);s.rng=seed;s.enemy.hp=1;s.enemy.stage=2;resolveRoll(s);assert(s.lastRoll.killed);return {...s.chest,playerLevel:s.player.level};
}
test('duel and elite use the same canonical rarity roll, gold and item level band',()=>{
 const rarities=new Set();
 for(let seed=1;seed<=200;seed++){
  const duel=killedReward(seed*7919,'duel'),elite=killedReward(seed*7919,'elite');
  assert.equal(duel.type,'duel');assert.equal(duel.gold,elite.gold);assert.equal(duel.item.rarity,elite.item.rarity);
  assert.equal(duel.item.level,elite.item.level);assert.equal(duel.item.catalogId,elite.item.catalogId);rarities.add(duel.item.rarity);
 }
 assert(rarities.has(1)&&rarities.has(2)&&rarities.has(3));assert.equal(canonicalCombatType('duel'),'elite');
 for(const room of ['guardian','hiddenboss'])for(let seed=1;seed<=50;seed++){
  const special=killedReward(seed*7919,room),boss=killedReward(seed*7919,'boss');assert(special.item.rarity>=3&&special.item.rarity<=4,'legendary floor remains; mythic is naturally eligible at this fixture depth');assert.equal(special.gold,boss.gold);
  assert(special.item.level>=special.playerLevel+1&&special.item.level<=special.playerLevel+5,'boss-level reward band is post-victory player level +1…+5');
 }
});
