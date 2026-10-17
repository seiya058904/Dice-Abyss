import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSSES,CATALOG,ENEMIES,ROOM_DETAILS,ROOM_NAMES,SLOT_AFFINITIES} from '../src/content.js';
import {COMBAT_ROOMS,EVENT_ROOMS,EXTRA_ENEMIES,canonicalCombatType,eventChoices} from '../src/encounters.js';
import {createEnemy,generateRoute,itemStats,newGame,resolveRoll,stats,transition,drawDice,diceOdds,diceCount,makeItem} from '../src/engine.js';
import {encodeSave,decodeSave,validateSave} from '../src/storage.js';

const neutralItem=(slot,id,profile=0)=>({id,slot,rarity:3,depth:20,level:40,levelXp:0,enhance:0,profile,name:'词条对照装备'});
function neutralGame(seed=719){
 const s=newGame(seed);s.floor=20;s.player.level=20;s.player.xp=0;
 s.player.items=['weapon','armor','relic'].map((slot,i)=>neutralItem(slot,`i${i+1}`));
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.player.hp=Math.floor(stats(s).maxHp*.4);return s;
}
function enterAt(s,type,index=0){
 s.fate=[3,4];s.route=generateRoute(s,s.fate);s.route[index].type=type;s.route.forEach((r,i)=>r.done=i<index);s.phase='route';s.roomIndex=index;
 return transition(s,{type:'enter'});
}

test('1536 equipment entries expose real slot-specific effects and distinct signatures at a shared level',()=>{
 const ids=new Set();
 for(const [slot,entries]of Object.entries(CATALOG)){
  assert.equal(entries.length,512);const signatures=new Set();
  for(const entry of entries){
   assert(!ids.has(entry.id));ids.add(entry.id);assert(entry.description);assert.equal(entry.slot,slot);
   const item={...neutralItem(slot,'i4',entry.profile),...entry,catalogId:entry.id};
   const actual=itemStats(item),baseline=itemStats({...neutralItem(slot,'i4',entry.profile),rarity:entry.rarity});
   // Luck is an integer attribute; catalog tuning is rounded at the equipment boundary.
   for(const [key,value]of Object.entries(entry.effects)){
    const expected=['luck','firstCritLuck','eliteLuck'].includes(key)?Math.round((baseline[key]||0)+value)-(baseline[key]||0):value;
    assert(Math.abs(((actual[key]||0)-(baseline[key]||0))-expected)<1e-10,`${entry.id}: ${key}`);
   }
   signatures.add(JSON.stringify(actual));
  }
  assert.equal(signatures.size,512,`${slot} has duplicated effective signatures`);
 }
 assert.equal(ids.size,1536);
 const weapon=itemStats({...neutralItem('weapon','i1'),catalogId:CATALOG.weapon[0].id}),armor=itemStats({...neutralItem('armor','i2'),catalogId:CATALOG.armor[0].id}),relic=itemStats({...neutralItem('relic','i3'),catalogId:CATALOG.relic[0].id});
 assert(weapon.attack>relic.attack*4);assert(armor.hp>0&&armor.defense>0);assert(!weapon.hp&&!relic.hp);
 assert(SLOT_AFFINITIES.weapon.some(a=>a.key==='pierce'));assert(SLOT_AFFINITIES.armor.some(a=>a.key==='reduction'));assert(SLOT_AFFINITIES.relic.some(a=>a.key==='luck'));
});

test('every preserved V4 equipment effect changes a real engine roll, entry shield or chest reward',()=>{
 const entries=Object.values(CATALOG).flat().filter(i=>i.rarity<4),keys=new Set(entries.flatMap(e=>Object.keys(e.effects)));
 assert.equal(keys.size,23);
 for(const key of keys){
  const entry=entries.find(e=>Object.keys(e.effects).length===1&&e.effects[key]&&e.rarity===3)||entries.find(e=>e.effects[key]&&e.rarity===3);
  assert(entry,key);let found=false;
  for(let seed=1;seed<=1200&&!found;seed++){
   let a=neutralGame(seed);const base=a.player.items.find(i=>i.slot===entry.slot);Object.assign(base,{profile:entry.profile});
   let b=structuredClone(a);Object.assign(b.player.items.find(i=>i.slot===entry.slot),{catalogId:entry.id,theme:entry.theme});
   if(key==='barrier'){a=enterAt(a,'combat');b=enterAt(b,'combat');found=(a.ward||0)!==(b.ward||0);continue;}
   if(key==='goldBonus'){a=enterAt(a,'chest');b=enterAt(b,'chest');found=a.chest.gold!==b.chest.gold;continue;}
   a=enterAt(a,key==='bossBonus'?'elite':'combat');b=enterAt(b,key==='bossBonus'?'elite':'combat');
   for(const s of [a,b]){Object.assign(s.enemy,{trait:'steady',hp:key==='healBonus'?1:1000000,maxHp:1000000,shield:key==='pierce'?100000:0,maxShield:100000,attack:600,turns:0});s.player.hp=Math.floor(stats(s).maxHp*.4);s.player.xp=0;}
   resolveRoll(a);resolveRoll(b);
   // The only multi-effect-only key is paired with a total-point bonus; hold that condition off.
   if(key==='bossBonus'&&a.lastRoll.values.reduce((n,v)=>n+v,0)>=18)continue;
   const signature=s=>JSON.stringify({values:s.lastRoll.values,total:s.lastRoll.total,absorbed:s.lastRoll.absorbed,hpDamage:s.lastRoll.hpDamage,retaliation:s.lastRoll.retaliation,critical:s.lastRoll.critical,follow:s.lastRoll.follow,dodged:s.lastRoll.dodged,wardGain:s.lastRoll.wardGain,hp:s.player.hp,ward:s.ward||0});
   found=signature(a)!==signature(b);
  }
  assert(found,`${key} never changed actual engine behavior`);
 }
});

test('all 100 enemy identities and 18 bosses are obtainable from depth-eligible natural pools',()=>{
 assert.equal(ENEMIES.length,100);assert.equal(new Set(ENEMIES.map(e=>e.name)).size,100);assert(ENEMIES.every(e=>e.note&&e.label));
 const s=newGame(719);s.floor=400;const seen=new Set(),normal=ENEMIES.filter(e=>!e.roomType);
 for(let i=0;i<15000&&seen.size<normal.length;i++)seen.add(createEnemy(s,'combat').name);
 for(const roomType of new Set(ENEMIES.filter(e=>e.roomType).map(e=>e.roomType))){
  const candidates=ENEMIES.filter(e=>e.roomType===roomType),local=new Set();
  for(let i=0;i<1000&&local.size<candidates.length;i++){const enemy=createEnemy(s,roomType);assert.equal(enemy.type,canonicalCombatType(roomType));assert.equal(enemy.encounterKey,roomType);assert.equal(enemy.mechanic,roomType);assert([0,1].includes(enemy.variant));local.add(enemy.name);seen.add(enemy.name);}
  assert.equal(local.size,candidates.length,roomType);
 }
 assert.equal(seen.size,100);assert.equal(BOSSES.length,18);const seenBosses=new Set();
 for(let seed=1;seed<=100&&seenBosses.size<18;seed++)for(let floor=5;floor<=400;floor+=5){
  s.rng=seed*7919+floor;s.floor=floor;const boss=createEnemy(s,'boss');seenBosses.add(boss.name);assert(floor>=(boss.minFloor||1));
  if(floor<30)assert.equal(boss.name,BOSSES[floor/5-1].name);
  for(const key of ['identity','warning','counterplay','phaseLabel','phaseNote'])assert(boss[key],`${boss.name} missing ${key}`);
 }
 assert.deepEqual(seenBosses,new Set(BOSSES.map(e=>e.name)));
 assert.equal(new Set(BOSSES.map(e=>`${e.trait}:${e.mechanic||'base'}`)).size,18);
});

test('all fifty generated room types enter, persist and resolve; every wave requires a real kill and opening',()=>{
 assert.deepEqual(new Set(Object.keys(ROOM_DETAILS)),new Set(Object.keys(ROOM_NAMES)));assert.equal(Object.keys(ROOM_NAMES).length,50);
 const encountered=new Map();
 for(let seed=1;seed<=100&&encountered.size<50;seed++)for(let floor=1;floor<=400;floor++){
  const s=newGame(seed);s.floor=floor;s.player.items.push(makeItem(s,'relic',1),makeItem(s,'weapon',1));s.player.talents.power=1;
  for(const fate of [[1,1],[6,6]]){s.fate=fate;s.route=generateRoute(s,fate);s.route.forEach((room,index)=>{if(encountered.has(room.type))return;const run=structuredClone(s);run.phase='route';run.roomIndex=index;run.route.forEach((r,i)=>r.done=i<index);encountered.set(room.type,transition(run,{type:'enter'}));});}
 }
 assert.equal(encountered.size,50);
 for(const [type,entered]of encountered){
  assert(ROOM_DETAILS[type].purpose&&ROOM_DETAILS[type].reward);let s=entered;assert(validateSave(s),`${type}: entered`);s=decodeSave(encodeSave(s));
  const index=s.roomIndex,startingChests=s.counters.chests,startingKills=s.counters.kills;
  if(COMBAT_ROOMS.has(type)){
   const waves=s.route[index].waves||1;
   for(let wave=1;wave<=waves;wave++){
    assert.equal(s.phase,'combat');s.enemy.hp=1;s.enemy.shield=0;s.enemy.stage=2;s=transition(s,{type:'roll'});assert.equal(s.phase,'chest');assert.equal(s.counters.kills,startingKills+wave);
    const min=s.enemy.type==='boss'?3:type==='trial'?2:s.enemy.type==='elite'?1:0;assert(s.chest.item.rarity>=min,type);
    assert.strictEqual(transition(s,{type:'next'}),s,'cannot skip a kill chest');const reward=s.chest.item.id;s=transition(s,{type:'open'});assert.equal(s.phase,'loot');assert(s.player.items.some(i=>i.id===reward));assert.equal(s.counters.chests,startingChests+wave);assert.strictEqual(transition(s,{type:'open'}),s);
    assert(validateSave(s),`${type}: wave ${wave}`);s=decodeSave(encodeSave(s));s=transition(s,{type:'next'});
    if(wave<waves){assert.equal(s.roomIndex,index);assert.equal(s.route[index].wave,wave+1);assert.equal(s.route[index].done,false);}
   }
   assert(index===5?s.phase==='cleared':s.roomIndex===index+1,type);
  }else if(EVENT_ROOMS.has(type)){
   assert.equal(s.phase,'event');s=transition(s,{type:'event-choice',id:'leave'});assert.equal(s.event.status,'resolved');assert(validateSave(s));s=transition(s,{type:'next'});assert(index===5?s.phase==='cleared':s.roomIndex===index+1,type);
  }else{
   if(s.phase==='chest'){if(type==='vault')assert(s.chest.item.rarity>=2);s=transition(s,{type:'open'});assert.equal(s.counters.chests,startingChests+1);}
   if(type==='blackmarket')assert(s.shop.filter(o=>o.item).every(o=>o.item.rarity>=2));
   if(type==='rest'){s=transition(s,{type:'rest'});assert.equal(s.player.hp,stats(s).maxHp);assert.equal(s.ward,Math.round(stats(s).maxHp*.25));}
   assert(validateSave(s));s=transition(s,{type:s.phase==='gold'?'gold':'next'});assert(index===5?s.phase==='cleared':s.roomIndex===index+1,type);
  }
 }
});

test('luck changes actual dice distributions and resonance while preserving low faces and deterministic saved values',()=>{
 const low=newGame(919),high=structuredClone(low);low.player.level=high.player.level=20;high.player.talents.luck=5;high.eventLuck=20;high.player.fateBlessings=5;
 const lowOdds=diceOdds(low),highOdds=diceOdds(high);assert(highOdds.highChance>lowOdds.highChance+.09);assert(highOdds.echoChance>lowOdds.echoChance);assert(highOdds.faces.every(p=>p>.05));
 const sample=s=>{const faces=Array(6).fill(0);let pair=0,triple=0,echoes=0;for(let i=0;i<20000;i++){const result=drawDice(s,3),counts=result.values.map(v=>result.values.filter(n=>n===v).length);result.values.forEach(v=>faces[v-1]++);if(Math.max(...counts)>=2)pair++;if(Math.max(...counts)===3)triple++;echoes+=result.echoes;}return{faces,pair,triple,echoes,high:(faces[4]+faces[5])/60000};};
 const a=sample(low),b=sample(high);assert(Math.abs(a.high-lowOdds.highChance)<.015);assert(Math.abs(b.high-highOdds.highChance)<.015);assert(b.high>a.high+.08);assert(b.pair>a.pair*1.1);assert(b.triple>a.triple*1.15);assert(b.echoes>a.echoes);assert(b.faces.every(n=>n>2000));
 let combat=enterAt(high,'combat');combat.enemy.hp=combat.enemy.maxHp=100000000;combat.enemy.attack=1;const expected=drawDice(structuredClone(combat),diceCount(combat));const rolled=transition(combat,{type:'roll'});assert.deepEqual(rolled.lastRoll.values,expected.values);assert.equal(rolled.lastRoll.luck,stats(combat).luck);assert(rolled.lastRoll.luckActive);
});

test('both variants of each new encounter produce different real engine outcomes under shared dice seeds',()=>{
 for(const roomType of new Set(EXTRA_ENEMIES.map(e=>e.roomType))){
  const templates=EXTRA_ENEMIES.filter(e=>e.roomType===roomType);let observed=false;
  for(let seed=1;seed<=1200&&!observed;seed++){
   let a=enterAt(neutralGame(seed*7919),roomType);Object.assign(a.enemy,templates[0],{hp:300000,maxHp:1000000,shield:roomType==='armored'?1000000:0,maxShield:1000000,attack:200,turns:roomType==='storm'?1:0,wave:roomType==='gauntlet'?3:roomType==='duel'?2:1,stage:2});
   const b=structuredClone(a);Object.assign(b.enemy,templates[1]);resolveRoll(a);resolveRoll(b);assert.deepEqual(a.lastRoll.values,b.lastRoll.values);
   const signature=s=>JSON.stringify({main:s.lastRoll.main,absorbed:s.lastRoll.absorbed,hpDamage:s.lastRoll.hpDamage,retaliation:s.lastRoll.retaliation,hp:s.player.hp,enemyHp:s.enemy.hp,shield:s.enemy.shield,ward:s.ward||0});
   observed=signature(a)!==signature(b);
  }
  assert(observed,`${roomType} second variant never changes actual resolution`);
 }
});

test('all six V4 added boss mechanics still affect actual combat after their normal floor-cycle appearance',()=>{
 for(const [index,boss]of BOSSES.entries()){
  if(!boss.mechanic||boss.minFloor)continue;let observed=false;
  for(let seed=1;seed<=400&&!observed;seed++){
   const initial=neutralGame(seed*7919);initial.floor=(index+1)*5;const active=enterAt(initial,'boss');if(active.enemy.name!==boss.name)continue;
   Object.assign(active.enemy,{hp:300000,maxHp:1000000,shield:0,maxShield:200000,attack:200,turns:['boss_tide','boss_cinder'].includes(boss.mechanic)?1:0,stage:2});
   const baseline=structuredClone(active);delete baseline.enemy.mechanic;
   resolveRoll(active);resolveRoll(baseline);assert.deepEqual(active.lastRoll.values,baseline.lastRoll.values);
   const signature=s=>JSON.stringify({main:s.lastRoll.main,retaliation:s.lastRoll.retaliation,enemyHp:s.enemy.hp,shield:s.enemy.shield,hp:s.player.hp,ward:s.ward||0});
   observed=signature(active)!==signature(baseline);
  }
  assert(observed,`${boss.mechanic} is present but never affects actual combat`);
 }
});

test('all eight mystery templates occur through generated routes and commit through real engine save transactions',()=>{
 const fixtures=new Map();
 for(let seed=1;seed<=5000&&fixtures.size<8;seed++){
  let s=newGame(seed*7919);s.floor=30;s.player.level=40;s.player.gold=100000;
  const relic=makeItem(s,'relic',1),forged=makeItem(s,'weapon',1);forged.enhance=7;s.player.items.push(relic,forged);s.player.hp=stats(s).maxHp;
  s=transition(s,{type:'fate'});const index=s.route.findIndex(r=>r.type==='mystery');if(index<0)continue;
  s.roomIndex=index;s.route.forEach((r,i)=>r.done=i<index);s=transition(s,{type:'enter'});assert.equal(s.phase,'event');
  if(!fixtures.has(s.event.key))fixtures.set(s.event.key,s);
 }
 assert.equal(fixtures.size,8);
 for(const [key,original]of fixtures){
  assert(validateSave(original),`${key} pending`);const raw=encodeSave(original),choice=eventChoices(original)[0];assert(!choice.disabled,`${key}: ${choice.reason}`);
  assert.strictEqual(transition(original,{type:'event-choice',id:choice.id}),original);
  let next=transition(decodeSave(raw),{type:'event-choice',id:choice.id,confirmed:true});assert.equal(next.revision,original.revision+1);assert.equal(next.event.status,'resolved');assert(validateSave(next),`${key} committed`);assert.equal(encodeSave(original),raw);
  next=decodeSave(encodeSave(next));assert.strictEqual(transition(next,{type:'event-choice',id:choice.id,confirmed:true}),next);
  const decline=transition(decodeSave(raw),{type:'event-choice',id:'leave'});assert.deepEqual(decline.player,original.player);assert(validateSave(decline));
  if(key==='pursuer_contract'){
   const count=next.counters.chests,index=next.roomIndex;
   for(let wave=1;wave<=2;wave++){
    assert.equal(next.phase,'combat');assert.equal(next.enemy.type,'elite');next.enemy.hp=1;next.enemy.shield=0;next.enemy.stage=2;next=transition(next,{type:'roll'});assert.equal(next.phase,'chest');next=transition(next,{type:'open'});assert.equal(next.counters.chests,count+wave);assert(validateSave(next));next=transition(decodeSave(encodeSave(next)),{type:'next'});if(wave===1){assert.equal(next.roomIndex,index);assert.equal(next.route[index].wave,2);}
   }
   assert.equal(next.roomIndex,index+1);
  }
 }
});
