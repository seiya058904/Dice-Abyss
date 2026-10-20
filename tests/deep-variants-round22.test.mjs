import test from 'node:test';
import assert from 'node:assert/strict';
import {DEEP_ENEMIES,DEEP_ROOMS,DEEP_VARIANT_PROFILES,deepVariantProfile,freshDeepVariantProfile} from '../src/deep-content.js';
import {DICE_LEVELS,ROOM_DETAILS} from '../src/content.js';
import {combatModifiers,postRetaliation,encounterReward,initEncounterEnemy} from '../src/encounters.js';
import {encounterTactics} from '../src/encounter-tactics.js';
import {newGame,createEnemy,transition,stats,enemyIntent,random} from '../src/engine.js';
import {encodeSave,decodeSave,migrateSave,validateSave} from '../src/storage.js';

const targets=['parity','sequence'];
const template=(mechanic,variant=1)=>DEEP_ENEMIES.find(e=>e.roomType===mechanic&&e.variant===variant);
const enemy=(mechanic,{tagged=true,variant=1,...extra}={})=>({...template(mechanic,variant),
 type:'combat',combatRules:tagged?5:4,hp:100003,maxHp:100003,shield:0,maxShield:20001,attack:9,turns:0,stage:1,wave:1,
 ...(tagged?{label:DEEP_VARIANT_PROFILES[mechanic].label}:{}),...extra});
function battle(mechanic,{seed=7919,count=3,tagged=true,...enemyExtra}={}){
 const s=newGame(seed);s.runId='constructed-deep-variant-rule-boundary';s.floor=40;s.player.level=DICE_LEVELS[count-1];s.player.xp=0;
 s.player.items=['weapon','armor','relic'].map((slot,i)=>({id:`i${i+1}`,slot,rarity:0,depth:1,level:12,levelXp:0,enhance:0,locked:false,legacy:true,profile:0,name:'规则对照装备'}));
 s.player.hp=stats(s).maxHp;s.player.talentPoints=0;s.fate=[3,4];s.roomIndex=0;s.phase='combat';
 s.route=[mechanic,'sequence','rest','combat','gold','boss'].map((type,i)=>({id:`f40r${i}`,type,done:false,quality:0}));
 s.enemy=enemy(mechanic,{tagged,...enemyExtra});s.ward=0;assert(validateSave(s));return s;
}
const roundTrip=s=>{const before=structuredClone(s),raw=encodeSave(s),restored=decodeSave(raw);assert.deepEqual(s,before);assert.deepEqual(restored,s);return restored;};
const multisets=count=>{
 const values=[],visit=(row,min)=>{if(row.length===count){values.push(row);return;}for(let face=min;face<=6;face++)visit([...row,face],face);};visit([],1);return values;
};
const bestOf=values=>Math.max(...values.map(value=>values.filter(v=>v===value).length));

test('fair independent one-to-six-dice enumeration quantifies the old diversity and new pair conditions',()=>{
 const expectedOld=[0,0,120,1080,7320,45720],expectedPair=[0,6,96,936,7056,45936];let outcomes=0;
 for(let count=1;count<=6;count++){
  let total=0,old=0,pair=0;
  const visit=values=>{if(values.length===count){total++;const different=new Set(values).size;old+=different>=3;pair+=different<values.length;return;}for(let face=1;face<=6;face++)visit([...values,face]);};visit([]);
  assert.equal(total,6**count);assert.equal(old,expectedOld[count-1]);assert.equal(pair,expectedPair[count-1]);outcomes+=total;
 }
 assert.equal(outcomes,55986);
});

test('new profiles use authored mechanic and variant identity, never display names or a missing revision',()=>{
 for(const mechanic of targets){
  const profile=freshDeepVariantProfile(template(mechanic));assert.equal(profile,DEEP_VARIANT_PROFILES[mechanic]);
  assert.equal(deepVariantProfile(enemy(mechanic)),profile);
  assert.equal(deepVariantProfile(enemy(mechanic,{name:'自定义显示名'})),profile);
  for(const altered of [{tagged:false},{variant:0},{roomType:'combat'},{combatRules:2},{combatRules:4}])assert.equal(deepVariantProfile(enemy(mechanic,altered)),null);
  assert.equal(deepVariantProfile(Object.assign(Object.create({deepVariantRules:1}),enemy(mechanic,{tagged:false}))),null);
 }
 for(const old of DEEP_ENEMIES){assert(!Object.hasOwn(old,'deepVariantRules'));if(!targets.includes(old.roomType)||old.variant!==1)assert.equal(freshDeepVariantProfile(old),null);}
});

test('only fresh selected alternates get the saved marker and label, without adding an RNG draw',()=>{
 const s=newGame(7919);s.floor=400;const observed=new Set();
 for(const mechanic of targets)for(let i=0;i<64;i++){
  const expected={rng:s.rng};random(expected);const result=createEnemy(s,mechanic);assert.equal(s.rng,expected.rng);
  observed.add(`${mechanic}/${result.variant}`);
  assert(!Object.hasOwn(result,'deepVariantRules'));
  if(result.variant===1){assert.equal(result.combatRules,5);assert.equal(result.label,DEEP_VARIANT_PROFILES[mechanic].label);}
  else{assert.equal(result.combatRules,4);assert.equal(result.label,template(mechanic,0).label);}
 }
 assert.equal(observed.size,4);
 for(const mechanic of ['laststand','undertow','hush','hourward','onslaught','bounty','abyssking','archiveguard'])for(let i=0;i<8;i++)assert(!Object.hasOwn(createEnemy(s,mechanic),'deepVariantRules'));
 for(let i=0;i<64;i++)assert(!Object.hasOwn(createEnemy(s,'combat'),'deepVariantRules'));
});

test('parity reversal is exact for every one-to-six-dice multiset, turn and strict-majority tie',()=>{
 for(let count=1;count<=6;count++)for(const turns of [0,1,2,6,7,999])for(const values of multisets(count)){
  const odd=values.filter(v=>v%2).length,best=bestOf(values);
  for(const tagged of [false,true]){
   const e=enemy('parity',{tagged,turns}),wantsOdd=((turns+1)%2===1)!==tagged,qualifies=(wantsOdd?odd:count-odd)>count/2;
   const mod=combatModifiers(e,values,best,{maxHp:10007}),tactics=encounterTactics(e,count);
   assert.equal(mod.damageMultiplier,qualifies?1.35:1);assert.equal(mod.attackMultiplier,1);
   assert.equal(tactics.lines[0].requirement.kind,wantsOdd?'oddAtLeast':'evenAtLeast');assert.equal(tactics.lines[0].requirement.value,Math.floor(count/2)+1);
   assert(tactics.next.includes(wantsOdd?'偶点':'奇点'));
   if(count%2===0&&odd===count/2)assert.equal(mod.damageMultiplier,1);
   assert.equal(Object.hasOwn(tactics,'variantLabel'),tagged);
  }
 }
});

test('sequence uses the pair only with its saved marker, and damage, rebuilding and guidance agree exhaustively',()=>{
 for(let count=1;count<=6;count++)for(const values of multisets(count))for(const tagged of [false,true]){
  const e=enemy('sequence',{tagged}),distinct=new Set(values).size,best=bestOf(values),qualifies=tagged?best>=2:distinct>=3;
  const mod=combatModifiers(e,values,best,{maxHp:10007}),post=postRetaliation({...e,turns:1},{values,best},{maxHp:10007}),tactics=encounterTactics(e,count);
  assert.equal(mod.damageMultiplier,qualifies?1.4:1);assert.equal(mod.attackMultiplier,1);
  assert.equal(post.enemyWard,qualifies?0:3001);assert.equal(post.enemyHeal,0);assert.equal(post.playerDrain,0);
  assert.equal(tactics.lines[0].requirement.kind,tagged?'sameAtLeast':'distinctAtLeast');assert.equal(tactics.lines[0].requirement.value,tagged?2:3);
  assert.equal(tactics.lines[0].possible,count>=(tagged?2:3));
  if(tagged){assert.equal(tactics.lines[0].effects.preventsWard,true);assert.equal(tactics.lines[1].requirement.kind,'allDistinct');}
  // The post-counter helper can derive a pair from committed faces even when a
  // public caller omits the optional repetition count.
  assert.deepEqual(postRetaliation({...e,turns:1},{values},{maxHp:10007}),post);
 }
});

test('the codex advertises both targets while ordinary regional enemies retain their own exact labels',()=>{
 assert(ROOM_DETAILS.parity.purpose.includes('偶刻监军'));assert(ROOM_DETAILS.parity.purpose.includes('奇刻巡官'));
 assert(ROOM_DETAILS.sequence.purpose.includes('离序执灯者'));assert(ROOM_DETAILS.sequence.purpose.includes('双同或更高共鸣'));
 assert.equal(ROOM_DETAILS.sequence.purpose,DEEP_ROOMS.sequence.purpose);
 for(const regional of DEEP_ENEMIES.filter(e=>!e.roomType&&targets.includes(e.mechanic)))assert.equal(regional.label,template(regional.mechanic,0).label);
});

test('save codec preserves new tags and old pending enemies, original labels and unknown fields exactly',()=>{
 for(const mechanic of targets)for(const tagged of [false,true]){
  const s=battle(mechanic,{tagged});s.futureMetadata={nested:['retained',17]};s.player.futureBuild={order:[3,2,1]};s.enemy.futureEncounter={deepVariantRules:91};
  s.enemy.note='自定义旧叙事不可改写';s.enemy.label='已保存的自定义标签';
  assert.deepEqual(migrateSave(s),s);const after=roundTrip(s);assert.equal(after.enemy.combatRules,tagged?5:4);assert(!Object.hasOwn(after.enemy,'deepVariantRules'));
  assert.equal(after.enemy.label,'已保存的自定义标签');assert.equal(after.enemy.note,'自定义旧叙事不可改写');
 }
});

test('an unsupported revision or an out-of-scope marked enemy is rejected before serialization',()=>{
 for(const mechanic of targets){
  const s=battle(mechanic);
  for(const revision of [null,0,1,3,6,-1,1.5,'5',true,{},[]]){const bad=structuredClone(s);bad.enemy.combatRules=revision;assert(!validateSave(bad));assert.throws(()=>encodeSave(bad));}
  for(const patch of [{variant:0},{roomType:'combat'},{mechanic:'hush'}]){const bad=structuredClone(s);Object.assign(bad.enemy,patch);assert(!validateSave(bad));}
  const missingRoom=structuredClone(s);delete missingRoom.enemy.roomType;assert(!validateSave(missingRoom));
 }
});

test('arbitrary old deepVariantRules metadata stays opaque through codec, roll, death and retry',()=>{
 for(const mechanic of targets)for(const rules of [undefined,2,4])for(const value of [1,0,2,null,true,'foreign',{revision:1},[1,'opaque']]){
  const original=battle(mechanic,{tagged:false,count:1});if(rules===undefined)delete original.enemy.combatRules;else original.enemy.combatRules=rules;
  original.enemy.deepVariantRules=structuredClone(value);const preserved=roundTrip(original);assert.equal(deepVariantProfile(preserved.enemy),null);
  const control=structuredClone(original);delete control.enemy.deepVariantRules;
  const actual=transition(preserved,{type:'roll'}),expected=transition(control,{type:'roll'});expected.enemy.deepVariantRules=structuredClone(value);
  assert.deepEqual(actual,expected);roundTrip(actual);
  const dying=structuredClone(original);dying.enemy.attack=1e9;dying.player.hp=1;const dead=roundTrip(transition(dying,{type:'roll'}));assert.equal(dead.phase,'dead');
  const revived=roundTrip(transition(dead,{type:'retry'}));assert.deepEqual(revived.enemy.deepVariantRules,value);assert.equal(revived.enemy.combatRules,rules);assert.equal(deepVariantProfile(revived.enemy),null);
 }
 // The field remains unrelated metadata even in a new enum-5 encounter.
 const modern=battle('sequence');modern.enemy.deepVariantRules={unrelated:true};assert(deepVariantProfile(roundTrip(modern).enemy));
});

test('actual engine rolls keep faces and RNG unchanged and settle both new counters inside the displayed retaliation bounds',()=>{
 let parityDifferences=0,pairSeen=0,distinctSeen=0;
 for(const mechanic of targets)for(let i=1;i<=32;i++){
  const modern=battle(mechanic,{seed:i*7919,count:3,turns:i%2}),old=structuredClone(modern);old.enemy.combatRules=4;old.enemy.label=template(mechanic).label;
  const oldIntent=enemyIntent(old),newIntent=enemyIntent(modern);
  for(const key of ['attack','damage','minDamage','maxDamage','warning','phase','turnsUntilHeavy','conditionalDamage'])assert.equal(newIntent[key],oldIntent[key]);
  assert(newIntent.detail.startsWith(modern.enemy.label));assert(oldIntent.detail.startsWith(old.enemy.label));
  const oldAfter=transition(old,{type:'roll'}),after=transition(modern,{type:'roll'}),values=after.lastRoll.values;
  assert.deepEqual(values,oldAfter.lastRoll.values);assert.equal(after.rng,oldAfter.rng);assert.equal(after.lastRoll.critical,oldAfter.lastRoll.critical);assert.equal(after.lastRoll.follow,oldAfter.lastRoll.follow);
  assert(!after.lastRoll.killed&&!oldAfter.lastRoll.killed);assert.equal(after.lastRoll.retaliation,oldAfter.lastRoll.retaliation);
  assert(after.lastRoll.retaliation>=newIntent.minDamage&&after.lastRoll.retaliation<=newIntent.maxDamage);
  if(mechanic==='sequence'){
   const pair=new Set(values).size<values.length;if(pair)pairSeen++;else distinctSeen++;
   assert.equal(after.enemy.shield,pair?0:3001);assert.equal(oldAfter.enemy.shield,pair?3001:0);
   assert.equal(after.lastRoll.main>oldAfter.lastRoll.main,pair);
  }else{
   assert.notEqual(after.lastRoll.main,oldAfter.lastRoll.main);parityDifferences++;
  }
  roundTrip(after);roundTrip(oldAfter);
 }
 assert.equal(parityDifferences,32);assert(pairSeen>0&&distinctSeen>0);
});

test('a killing hit prevents rebuilding and preserves the same earned chest and reward RNG',()=>{
 for(const mechanic of targets)for(const count of [1,3,6]){
  const modern=battle(mechanic,{count,hp:1,shield:0}),old=structuredClone(modern);old.enemy.combatRules=4;old.enemy.label=template(mechanic).label;
  const a=transition(old,{type:'roll'}),b=transition(modern,{type:'roll'});
  assert.equal(a.phase,'chest');assert.equal(b.phase,'chest');assert.deepEqual(b.chest,a.chest);assert.equal(b.rng,a.rng);assert.equal(b.enemy.shield,0);
  assert.deepEqual(encounterReward(b.enemy),encounterReward(a.enemy));roundTrip(a);roundTrip(b);
  assert.deepEqual(postRetaliation(b.enemy,{values:b.lastRoll.values,best:b.lastRoll.best},stats(b)),{enemyHeal:0,enemyWard:0,playerDrain:0,notes:[]});
 }
});

test('a lethal retaliation does not rebuild, and retry retains the committed rule, identity, label and RNG',()=>{
 for(const mechanic of targets)for(const tagged of [false,true]){
  const s=battle(mechanic,{tagged,count:1,attack:1e9});s.player.hp=1;
  const dead=roundTrip(transition(s,{type:'roll'}));assert.equal(dead.phase,'dead');assert.equal(dead.enemy.shield,0);
  const result=roundTrip(transition(dead,{type:'retry'}));assert.equal(result.phase,'combat');assert.equal(result.rng,dead.rng);
  for(const key of ['name','note','label','mechanic','variant','roomType','combatRules','deepVariantRules'])assert.equal(result.enemy[key],s.enemy[key],key);
  assert.equal(result.enemy.combatRules,tagged?5:4);assert(!Object.hasOwn(result.enemy,'deepVariantRules'));assert.equal(result.enemy.turns,0);
  const initialized=initEncounterEnemy(dead.enemy,{...dead.route[0],type:mechanic});assert.equal(initialized.combatRules,tagged?5:4);
 }
});

test('legacy pending chest and loot stay unchanged; a later enemy or wave independently gets current rules at creation',()=>{
 const observed={room:new Set(),wave:new Set()};
 for(const kind of ['room','wave'])for(let i=1;i<=24;i++){
  const original=battle('parity',{tagged:false,seed:i*7919,hp:1});
  if(kind==='wave')Object.assign(original.route[0],{wave:1,waves:2,waveType:'sequence'});
  const chest=roundTrip(transition(original,{type:'roll'}));assert.equal(chest.phase,'chest');assert.equal(chest.enemy.combatRules,4);assert(!Object.hasOwn(chest.enemy,'deepVariantRules'));
  const loot=roundTrip(transition(chest,{type:'open'}));assert.equal(loot.phase,'loot');assert.deepEqual(loot.loot,chest.chest);assert.equal(loot.enemy.combatRules,4);assert(!Object.hasOwn(loot.enemy,'deepVariantRules'));
  const next=roundTrip(transition(loot,{type:'next'}));assert.equal(next.phase,'combat');assert.equal(next.enemy.mechanic,'sequence');observed[kind].add(next.enemy.variant);
  assert.equal(next.enemy.combatRules,next.enemy.variant===1?5:4);assert(!Object.hasOwn(next.enemy,'deepVariantRules'));
  assert.equal(next.enemy.wave,kind==='wave'?2:1);assert.equal(next.roomIndex,kind==='wave'?0:1);
 }
 for(const seen of Object.values(observed))assert.deepEqual([...seen].sort(),[0,1]);
});

test('unmarked alternate enemies keep the same numeric rules as their original partners',()=>{
 for(const mechanic of targets)for(const turns of [0,1,2,6])for(let count=1;count<=6;count++)for(const values of multisets(count)){
  const a=enemy(mechanic,{tagged:false,variant:0,turns}),b=enemy(mechanic,{tagged:false,variant:1,turns}),best=bestOf(values),st={maxHp:10007};
  assert.deepEqual(combatModifiers(a,values,best,st),combatModifiers(b,values,best,st));
  assert.deepEqual(postRetaliation({...a,turns:turns+1},{values,best},st),postRetaliation({...b,turns:turns+1},{values,best},st));
  assert.deepEqual(encounterTactics(a,count),encounterTactics(b,count));
 }
});

test('rule profiles and tactics do not mutate state or read RNG',()=>{
 for(const mechanic of targets){
  const e=Object.freeze(enemy(mechanic)),proxy=new Proxy(e,{get(target,key){if(key==='rng')throw Error('No RNG read is permitted.');return target[key];}}),before=structuredClone(e);
  const oldRandom=Math.random;Math.random=()=>{throw Error('No random draw is permitted.');};
  try{assert(deepVariantProfile(proxy));assert(encounterTactics(proxy,6));}finally{Math.random=oldRandom;}
  assert.deepEqual(e,before);
 }
});
