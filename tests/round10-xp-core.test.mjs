import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import {eventChoices,eventPresentation} from '../src/encounters.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
import {xpPreview,xpSummary,XP_CAP,LEVEL_CAP} from '../src/experience.js';

// These are legal synthetic boundaries. Normal room entry and settlement still
// use the production transitions; they make no claim about natural frequency.
function entered(key,level=LEVEL_CAP,xp=XP_CAP){
 let s=E.newGame(3);s.runId='round10-xp-core';s.floor=140;s.player.level=level;s.player.xp=xp;s.player.gold=E.GOLD_CAP;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 if(key==='exchange')s.player.items.push(E.makeItem(s,'weapon',1));
 const type=key==='memory_archive'?'mystery':key;
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';
 s=E.transition(s,{type:'enter'});
 if(['combat','elite','boss','trial'].includes(key)){s.enemy.hp=1;s.enemy.shield=0;}
 else assert.equal(s.event.key,key);
 assert(validateSave(s));return s;
}
const choiceId=key=>key==='exchange'?'salvage':key==='starlibrary'?'study':'accept';
const choice=s=>eventChoices(s).find(o=>o.id===choiceId(s.event.key));
const settle=s=>E.transition(s,s.phase==='combat'?{type:'roll'}:{type:'event-choice',id:choiceId(s.event.key),confirmed:true});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function conservedXp(before,after){
 const levels=after.player.level-before.player.level;
 // Sum of the old linear level costs, expressed independently as a series.
 const spent=5*levels*levels+(10*before.player.level+13)*levels;
 return after.player.xp+spent-before.player.xp;
}
function assertReceipt(before,after,rawXp){
 assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);
 const admitted=Math.min(rawXp,100000000-before.player.xp);
 assert.equal(conservedXp(before,after),admitted);
 assert(after.player.level<=1000000);assert(after.player.xp<=100000000);
 if(after.player.level<1000000)assert(after.player.xp<E.xpNeeded(after.player.level));
 return admitted;
}

test('experience limits match the existing validated character limits, not level 100 or 10000',()=>{
 assert.equal(XP_CAP,100000000);assert.equal(LEVEL_CAP,1000000);assert.equal(E.XP_CAP,XP_CAP);assert.equal(E.LEVEL_CAP,LEVEL_CAP);assert.equal(E.VERSION,5);
 for(const level of [100,10000,LEVEL_CAP])assert(validateSave(entered('memory_archive',level,0)));
 const tooHigh=entered('memory_archive');tooHigh.player.level=LEVEL_CAP+1;assert(!validateSave(tooHigh));
 tooHigh.player.level=LEVEL_CAP;tooHigh.player.xp=XP_CAP+1;assert(!validateSave(tooHigh));
});

test('read-only XP quotes cover no reward, full, exact-fit, partial, zero and safe maximum rewards',()=>{
 const cases=[
  [0,0,0,0,0,false,false],
  [100,540,540,0,640,false,false],
  [XP_CAP-540,540,540,0,XP_CAP,false,false],
  [XP_CAP-10,540,10,530,XP_CAP,false,true],
  [XP_CAP,540,0,540,XP_CAP,true,true],
  [XP_CAP,0,0,0,XP_CAP,true,false],
  [0,Number.MAX_SAFE_INTEGER,XP_CAP,Number.MAX_SAFE_INTEGER-XP_CAP,XP_CAP,false,true],
 ];
 for(const [held,rawXp,creditedXp,overflowXp,acceptedXp,atCap,limited]of cases){
  const expected={rawXp,creditedXp,overflowXp,beforeXp:held,acceptedXp,atCap,limited};
  assert.deepEqual(xpPreview(held,rawXp),expected);assert.deepEqual(E.xpPreview(held,rawXp),expected);
 }
 assert.equal(xpSummary(xpPreview(100,540)),'经验计入 540');
 assert.equal(xpSummary(xpPreview(XP_CAP-10,1000000),n=>n.toLocaleString('en-US'),'经验可计入'),'经验可计入 10（原额 1,000,000，上限未计入 999,990）');
 assert.equal(xpSummary(null),'');
});

test('XP quotes reject malformed values without coercion, clamping the input or changing any state',()=>{
 const invalid=[undefined,null,NaN,Infinity,-Infinity,-1,1.5,'10',{},[],true];
 for(const value of invalid){assert.equal(xpPreview(value,1),null);assert.equal(xpPreview(0,value),null);}
 assert.equal(xpPreview(XP_CAP+1,1),null);assert.equal(xpPreview(0,Number.MAX_SAFE_INTEGER+1),null);
});

for(const key of ['memory_archive','starlibrary','exchange','combat'])for(const [caseName,xp,admitted]of [['full',0, key==='combat'?174:1000000],['partial',XP_CAP-10,10],['zero',XP_CAP,0]]){
 test(`${key} ${caseName} XP admission preserves the charge or item cost and validates after settlement`,()=>{
  const before=entered(key,LEVEL_CAP,xp),original=structuredClone(before),raw=key==='combat'?174:1000000,option=key==='combat'?null:choice(before);
  if(option){assert(!option.disabled);assert.equal(option.experience.creditedXp,admitted);assert.equal(option.experience.rawXp,raw);}
  const after=settle(before);assert.notStrictEqual(after,before);assert.deepEqual(before,original);
  assert.equal(assertReceipt(before,after,raw),admitted);assert.equal(after.player.level,LEVEL_CAP);assert.equal(after.player.talentPoints,before.player.talentPoints);
  if(['memory_archive','starlibrary'].includes(key)){
   assert.equal(before.player.gold-after.player.gold,before.event.costGold);assert.deepEqual(after.player.items,before.player.items);assert.equal(after.rng,before.rng);
   if(admitted<raw){assert(option.reward.includes(`经验可计入 ${admitted}`));assert(option.confirm.includes(`上限未计入 ${raw-admitted}`));assert(after.event.outcome.includes(`经验计入 ${admitted}`));}
   if(admitted===0){assert(option.confirm.includes('金币仍会支付'));assert(after.event.outcome.includes(`已支付 ${before.event.costGold} 金币`));assert(after.event.outcome.includes('没有新增经验'));}
  }else if(key==='exchange'){
   assert.equal(after.player.gold,before.player.gold);assert(!after.player.items.some(item=>item.id===before.event.offerId));assert.equal(after.rng,before.rng);
   if(admitted===0){assert(option.confirm.includes('两项入账均为 0'));assert(after.event.outcome.includes('已永久消耗'));}
  }else{
   assert.equal(after.phase,'chest');assert(after.lastRoll.killed);assert(after.chest.item);assert.equal(after.counters.kills,before.counters.kills+1);
   const entry=after.log.find(o=>o.text.startsWith('战斗奖励 · '));
   if(admitted<raw){assert(entry);assert(entry.text.includes(`经验计入 ${admitted}`));assert(entry.text.includes(`上限未计入 ${raw-admitted}`));}else assert.equal(entry,undefined);
  }
 });
}

for(const key of ['memory_archive','starlibrary','exchange','combat'])for(const level of [100,10000]){
 test(`${key} at level ${level} reports admitted XP before level conversion, including large stored balances`,()=>{
  const raw=key==='combat'?174:key==='starlibrary'?(level===100?1100:100100):(level===100?540:50040);
  for(const xp of [E.xpNeeded(level)-1,XP_CAP-10,XP_CAP]){
   const before=entered(key,level,xp),after=settle(before),admitted=assertReceipt(before,after,raw);
   assert(after.player.level>level);assert.notEqual(after.player.xp-before.player.xp,admitted);
   if(key!=='combat')assert.equal(choice(before).experience.creditedXp,admitted);
   if(xp===XP_CAP){assert.equal(admitted,0);assert(after.player.xp<before.player.xp,'existing stored XP still converts under the original rule');}
  }
 });
}

test('combat, trial, elite and boss use their existing distinct XP reward formulas at the cap',()=>{
 for(const [key,raw]of [['combat',174],['trial',174],['elite',260],['boss',434]]){
  const before=entered(key,LEVEL_CAP,XP_CAP-10),after=settle(before);assertReceipt(before,after,raw);
  assert.equal(after.phase,'chest');assert(after.log.some(o=>o.text.includes(`经验计入 10（原额 ${raw}，上限未计入 ${raw-10}）`)));
 }
});

test('the final level-up reaches 1000000 once and retains accepted XP without granting further levels',()=>{
 for(const key of ['memory_archive','starlibrary','exchange','combat']){
  const before=entered(key,LEVEL_CAP-1,E.xpNeeded(LEVEL_CAP-1)-1),raw=key==='combat'?174:1000000,after=settle(before);
  assertReceipt(before,after,raw);assert.equal(after.player.level,LEVEL_CAP);assert.equal(after.player.xp,raw-1);assert.equal(after.player.talentPoints,before.player.talentPoints+2);
  assert.equal(after.log.filter(o=>o.text.startsWith('升至 Lv.')).length,1);
 }
});

for(const key of ['memory_archive','starlibrary','exchange','combat']){
 test(`${key} upgrade logs credit exactly 0, 1 or 2 talent points when point capacity is limited`,()=>{
  for(const room of [0,1,2]){
   const before=entered(key,100,E.xpNeeded(100)-1);before.player.talentPoints=2000000-room;
   const after=settle(before),upgrades=after.log.filter(o=>o.text.startsWith('升至 Lv.'));
   const awarded=upgrades.map(o=>Number(o.text.match(/获得 (\d+) 天赋点/)[1]));
   assert(upgrades.length>=1);assert(awarded.every(n=>n>=0&&n<=2));assert.equal(awarded.reduce((sum,n)=>sum+n,0),room);assert.equal(after.player.talentPoints-before.player.talentPoints,room);
   for(let i=0;i<upgrades.length;i++)if(awarded[i]<2)assert(upgrades[i].text.includes(`上限未计入 ${2-awarded[i]}`));
   assert(validateSave(after));
  }
 });
}

for(const key of ['memory_archive','starlibrary']){
 test(`${key} keeps confirmation, funds, leave, saved prices and one-time settlement rules`,()=>{
  const before=entered(key),original=structuredClone(before),id=choiceId(key);
  assert.strictEqual(E.transition(before,{type:'event-choice',id}),before);assert.deepEqual(before,original);
  const poor=structuredClone(before);poor.player.gold=poor.event.costGold-1;
  assert(choice(poor).disabled);assert.strictEqual(settle(poor),poor);
  const exact=structuredClone(before);exact.player.gold=exact.event.costGold;
  const paid=settle(exact);assert.equal(paid.player.gold,0);assert.strictEqual(settle(paid),paid);
  const left=E.transition(before,{type:'event-choice',id:'leave'});assert.deepEqual(left.player,before.player);assert.equal(left.rng,before.rng);assert.strictEqual(settle(left),left);
  const reserved=entered(key,100,0),cost=reserved.event.costGold;reserved.player.level=10000;reserved.player.hp=E.stats(reserved).maxHp;
  assert(validateSave(reserved));const after=settle(reserved);assert.equal(reserved.player.gold-after.player.gold,cost);
 });
}

test('exchange capacity metadata cannot bypass protected equipment or a missing confirmation',()=>{
 const before=entered('exchange');assert.strictEqual(E.transition(before,{type:'event-choice',id:'salvage'}),before);
 for(const mode of ['locked','equipped','missing']){
  const s=structuredClone(before),offered=s.player.items.find(i=>i.id===s.event.offerId);
  if(mode==='locked')offered.locked=true;else if(mode==='equipped')s.player.equipped.weapon=offered.id;else s.player.items=s.player.items.filter(i=>i.id!==offered.id);
  assert(validateSave(s));assert(choice(s).disabled);assert.strictEqual(settle(s),s);
 }
});

test('XP metadata is recreated read-only and preserves unrelated known-shape and unknown saved fields',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const before=entered(key,100,XP_CAP-10);
  before.experience={rawXp:'custom top-level',retained:[0,false,null]};before.player.experience={creditedXp:'custom player metadata'};before.event.experience={rawXp:-17,creditedXp:123456,unrelated:{source:'external save'}};
  const original=structuredClone(before),text=encodeSave(before);assert.deepEqual(decodeSave(text),before);
  freeze(before);const expected=choice(before),htmlData=eventPresentation(before);
  for(let i=0;i<5;i++){assert.deepEqual(choice(before),expected);assert.deepEqual(eventPresentation(before),htmlData);assert.equal(encodeSave(before),text);}
  expected.experience.creditedXp=12345;assert.equal(choice(before).experience.creditedXp,10);assert.deepEqual(before,original);
  const after=settle(before);assert.deepEqual(after.experience,original.experience);assert.deepEqual(after.player.experience,original.player.experience);assert.deepEqual(after.event.experience,original.event.experience);assert.deepEqual(decodeSave(encodeSave(after)),after);
 }
});

test('the separate starlibrary insight choice keeps its original reward, shared cap and XP balance',()=>{
 const before=entered('starlibrary',LEVEL_CAP,XP_CAP);before.player.deepOfferings=19;
 const options=eventChoices(before),insight=options.find(o=>o.id==='insight');assert.equal(insight.experience,undefined);assert(!insight.disabled);
 const after=E.transition(before,{type:'event-choice',id:'insight',confirmed:true});assert.equal(after.player.xp,before.player.xp);assert.equal(after.player.level,before.player.level);assert.equal(after.player.talentPoints,before.player.talentPoints+1);assert.equal(after.player.deepOfferings,20);assert.equal(before.player.gold-after.player.gold,Math.min(1e8,before.event.costGold*3));
 const capped=structuredClone(before);capped.player.deepOfferings=20;assert(eventChoices(capped).find(o=>o.id==='insight').disabled);assert.strictEqual(E.transition(capped,{type:'event-choice',id:'insight',confirmed:true}),capped);
});

test('starlibrary discloses a full talent-point balance before study without disabling valid XP purchase',()=>{
 const normal=entered('starlibrary',100,0);assert.equal(choice(normal).detail,'经验立即结算，升级可获得天赋点。');
 const before=structuredClone(normal);before.player.talentPoints=2000000;
 const option=choice(before);assert(!option.disabled);assert(option.detail.includes('未分配天赋点已满'));assert(option.detail.includes('升级新增点数无法计入'));assert.equal(option.experience.creditedXp,1100);
 const after=settle(before);assert(after.player.level>before.player.level);assert.equal(after.player.talentPoints,2000000);assertReceipt(before,after,1100);
});
