import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=process.env.QA_ITERATION_ROOT?pathToFileURL(process.env.QA_ITERATION_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const {CATALOG}=await import(new URL('src/equipment-content.js',root));
const {encodeSave,decodeSave,validateSave}=await import(new URL('src/storage.js',root));
const {highestRarity}=await import(new URL('src/rarity.js',root));
const moduleUrl=new URL('src/event-risk.js',root);
let riskModule;
try{riskModule=await import(moduleUrl);}catch(error){if(!process.env.QA_ITERATION_ROOT||error.code!=='ERR_MODULE_NOT_FOUND'||error.url!==moduleUrl.href)throw error;}
// A missing input capability is represented honestly when replaying this new
// module against the untouched ZIP; do not substitute an implementation.
const preview=(...args)=>riskModule?.eventRiskPreview(...args)??null;
const close=(a,b,label='')=>assert(Math.abs(a-b)<1e-12,`${label}: ${a} != ${b}`);

function fixture(key='gambit',{floor=140,level=11,cost=835,gold=10000,seed=7919}={}){
 let s=E.newGame(seed);s.floor=floor;s.player.level=level;s.player.gold=gold;
 for(const item of s.player.items){
  const entry=CATALOG[item.slot].find(entry=>entry.rarity===0&&!entry.effects.luck&&!entry.effects.echoChance);
  Object.assign(item,{catalogId:entry.id,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name});
 }
 s.player.hp=E.stats(s).maxHp;s=E.transition(s,{type:'fate'});s.player.gold=gold;
 s.route[0].type=key;s=E.transition(s,{type:'enter'});s.event.costGold=cost;
 assert(validateSave(s),'constructed state must cross the real save boundary');return s;
}
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
function closedOdds(luck){
 const t=1.5*luck/(luck+40),a=1+t,b=1+1.4*t,z=4+a+b;
 return {gambit:[2/z,2/z,(a+b)/z],wish:[10/(z*z),1-(10+2*b+(a+b)**2)/(z*z),(2*b+(a+b)**2)/(z*z)]};
}
const row=(risk,key)=>risk.outcomes.find(outcome=>outcome.key===key);

test('pending paid-dice previews exist for both rolls and the fixed gambler trade',()=>{
 assert.equal(typeof riskModule?.eventRiskPreview,'function');
 for(const [key,choice,count]of [['gambit','roll',1],['gambit','safe',0],['wishingvault','roll',2]]){
  const result=preview(fixture(key),choice);assert(result);assert.equal(result.key,key);assert.equal(result.choiceId,choice);assert.equal(result.diceCount,count);assert(result.available);assert.equal(result.settlement,'choice-only');assert.equal(result.chestGoldIncluded,false);
 }
});

test('zero-luck gambler groups are thirds and its fixed alternative has probability one',()=>{
 const s=fixture('gambit'),risk=preview(s);assert.equal(risk.luck,0);
 assert.deepEqual(risk.outcomes.map(outcome=>outcome.key),['refund','rare','epic']);
 risk.outcomes.forEach(outcome=>close(outcome.probability,1/3));
 const safe=preview(s,'safe');assert.equal(safe.outcomes.length,1);assert.equal(safe.outcomes[0].probability,1);assert.equal(safe.costGold,s.event.costGold*2);
});

test('zero-luck wishing uses all thirty-six independent pairs: ten, twenty and six',()=>{
 const risk=preview(fixture('wishingvault'));assert.equal(risk.luck,0);
 assert.deepEqual(risk.outcomes.map(outcome=>outcome.key),['refund','epic','legendary']);
 for(const [key,p]of [['refund',10/36],['epic',20/36],['legendary',6/36]])close(row(risk,key).probability,p,key);
 assert.equal(risk.usesEcho,false);
});

for(const kind of ['talent','floor','next','soft-cap'])test(`visible ${kind} luck drives both events through an independent closed-form oracle`,()=>{
 for(const key of ['gambit','wishingvault']){
  const s=fixture(key);
  if(kind==='talent')s.player.talents.luck=5;
  if(kind==='floor'){s.eventLuck=20;s.player.fateBlessings=5;}
  if(kind==='next'){s.nextLuck=24;s.player.talents.luck=5;s.eventLuck=20;}
  if(kind==='soft-cap'){
   const entry=CATALOG.relic.filter(item=>item.effects.luck).sort((a,b)=>b.effects.luck-a.effects.luck)[0];
   for(const slot of ['relic','relic2','relic3']){
    const item=E.makeItem(s,'relic',entry.rarity);Object.assign(item,{catalogId:entry.id,profile:entry.profile,theme:entry.theme,name:entry.name});
    s.player.items.push(item);s.player.equipped[slot]=item.id;
   }
   s.player.talents.luck=5;s.player.talents.omen=5;s.eventLuck=20;s.player.fateBlessings=5;s.nextLuck=24;s.fate=[6,6];
   assert(E.stats(s).rawLuck>100);assert(E.stats(s).luck<E.stats(s).rawLuck);
  }
  assert(validateSave(s));const risk=preview(s),luck=E.diceOdds(s).luck,expected=closedOdds(luck)[key==='gambit'?'gambit':'wish'];
  assert.equal(risk.luck,luck);risk.outcomes.forEach((outcome,index)=>close(outcome.probability,expected[index],`${key}/${kind}/${index}`));
  close(risk.outcomes.reduce((sum,outcome)=>sum+outcome.probability,0),1);
 }
});

test('same-roll echo investment does not alter either paid event distribution',()=>{
 for(const key of ['gambit','wishingvault']){
  const s=fixture(key),before=preview(s);s.player.talents.attune=5;
  assert(E.diceOdds(s).echoChance>0);const after=preview(s);
  assert.equal(after.usesEcho,false);assert.deepEqual(after.faces,before.faces);assert.deepEqual(after.outcomes,before.outcomes);
 }
});

test('paid-event dice counts do not follow the number of unlocked combat dice',()=>{
 for(const key of ['gambit','wishingvault']){
  const a=fixture(key,{level:1}),b=fixture(key,{level:11});
  assert.equal(E.diceCount(a),1);assert.equal(E.diceCount(b),6);
  const x=preview(a),y=preview(b);assert.equal(x.diceCount,y.diceCount);assert.deepEqual(x.faces,y.faces);
  assert.deepEqual(x.outcomes.map(r=>r.probability),y.outcomes.map(r=>r.probability));
 }
});

test('pending metadata and saved future RNG never reveal or select an outcome',()=>{
 for(const key of ['gambit','wishingvault']){
  const s=fixture(key),original=preview(s);assert(original);s.event.roll=6;s.event.rolls=[6,6];
  Object.defineProperty(s,'rng',{enumerable:true,get(){throw Error('preview tried to read future RNG');}});
  assert.deepEqual(preview(s),original);
 }
});

test('all preview inputs stay immutable, including full unknown event and item data',()=>{
 for(const key of ['gambit','wishingvault']){
  const s=fixture(key);s.ownerNote={nested:['keep',{value:3}]};s.event.importedNote={list:[1,2]};s.player.items[0].custom={text:'原档未知字段',nested:{left:true}};
  const before=encodeSave(s),copy=structuredClone(s);deepFreeze(s);
  assert(preview(s));if(key==='gambit')assert(preview(s,'safe'));
  assert.deepEqual(s,copy);assert.equal(encodeSave(s),before);
 }
});

test('detached display arrays and outcome rows cannot write back to a saved game',()=>{
 const s=fixture('wishingvault'),before=structuredClone(s),first=preview(s),expected=structuredClone(first);
 first.faces[0]=99;first.outcomes[1].rarityProbabilities[7]=99;first.outcomes[2].refund.rawGold=999;first.outcomes[1].itemLevelRange.min=0;
 assert.deepEqual(s,before);assert.deepEqual(preview(s),expected);
});

for(const cost of [0,1,48,835,1e8])test(`exact cost ${cost}: refunds round down after payment and safe prices are doubled`,()=>{
 for(const key of ['gambit','wishingvault'])for(const gold of [cost,E.GOLD_CAP]){
  const s=fixture(key,{cost,gold}),risk=preview(s),refund=row(risk,'refund');
  assert(risk.available);assert.equal(risk.costGold,cost);assert.equal(risk.goldAfterPayment,gold-cost);
  assert.deepEqual(refund.refund,{rawGold:Math.floor(cost/2),credited:Math.floor(cost/2),overflow:0});
  assert.equal(refund.goldAfterChoice,gold-cost+Math.floor(cost/2));assert.equal(refund.netCostGold,Math.ceil(cost/2));
  assert.deepEqual(risk.netCostRange,{min:Math.ceil(cost/2),max:cost});assert.deepEqual(risk.balanceRange,{min:gold-cost,max:gold-Math.ceil(cost/2)});
  for(const outcome of risk.outcomes.filter(outcome=>outcome.key!=='refund')){assert.equal(outcome.netCostGold,cost);assert.equal(outcome.goldAfterChoice,gold-cost);assert.equal(outcome.refund.rawGold,0);}
  if(key==='gambit'){
   const safe=preview(s,'safe');assert.equal(safe.costGold,cost*2);assert.equal(safe.available,gold>=cost*2);
   if(safe.available)assert.equal(safe.outcomes[0].netCostGold,cost*2);
  }
 }
});

test('unaffordable choices still show real probabilities but no negative or imaginary balances',()=>{
 for(const key of ['gambit','wishingvault']){
  const s=fixture(key,{cost:835,gold:834}),before=encodeSave(s);
  for(const choice of key==='gambit'?['roll','safe']:['roll']){
   const risk=preview(s,choice);assert(risk);assert.equal(risk.available,false);assert.match(risk.reason,/金币不足/);
   assert.equal(risk.goldAfterPayment,null);assert.equal(risk.balanceRange,null);assert.equal(risk.netCostRange,null);
   close(risk.outcomes.reduce((sum,row)=>sum+row.probability,0),1);
   for(const outcome of risk.outcomes){assert.equal(outcome.goldAfterChoice,null);assert.equal(outcome.netCostGold,null);assert.equal(outcome.refund.credited,null);assert.equal(outcome.refund.overflow,null);}
   assert.strictEqual(E.transition(s,{type:'event-choice',id:choice,confirmed:true}),s);
  }
  assert.equal(encodeSave(s),before);
 }
});

test('all rarity unlock boundaries preserve zero entries and each actual conditional prize pool',()=>{
 for(const floor of [1,29,30,49,50,79,80,139,140,400])for(const key of ['gambit','wishingvault']){
  const s=fixture(key,{floor});for(const choice of key==='gambit'?['roll','safe']:['roll']){
   const risk=preview(s,choice);assert.equal(risk.unlockedRarity,highestRarity(floor));
   for(const outcome of risk.outcomes){
    assert.equal(outcome.rarityProbabilities.length,8);
    if(outcome.key==='refund'){assert.deepEqual(outcome.rarityProbabilities,Array(8).fill(0));assert.equal(outcome.rarityFloor,null);assert.equal(outcome.rarityCeiling,null);assert.equal(outcome.itemLevelRange,null);continue;}
    close(outcome.rarityProbabilities.reduce((a,b)=>a+b,0),1);
    for(let rarity=0;rarity<8;rarity++){
     if(rarity<outcome.rarityFloor||rarity>highestRarity(floor))assert.equal(outcome.rarityProbabilities[rarity],0,`${floor}/${key}/${choice}/${outcome.key}/${rarity}`);
    }
    assert(outcome.rarityProbabilities[outcome.rarityCeiling]>0);assert(outcome.rarityCeiling<=highestRarity(floor));
    if(key==='gambit'&&floor<30){assert.equal(outcome.rarityProbabilities[outcome.rarityFloor],1);assert.equal(outcome.rarityCeiling,outcome.rarityFloor);}
   }
  }
 }
});

test('deep gambler rare and epic rolls retain distinct chest and vault high-tier source factors',()=>{
 for(const floor of [30,50,80,140]){
  const s=fixture('gambit',{floor}),risk=preview(s),tier=highestRarity(floor);
  const unlockStart={4:.008,5:.003,6:.0015,7:.0007}[tier];
  close(row(risk,'rare').rarityProbabilities[tier],unlockStart);
  close(row(risk,'epic').rarityProbabilities[tier],unlockStart*4);
  close(preview(s,'safe').outcomes[0].rarityProbabilities[tier],unlockStart);
 }
});

test('wishing legendary floors retain higher tiers and exact base vault probabilities',()=>{
 const s=fixture('wishingvault',{floor:140}),risk=preview(s),epic=row(risk,'epic'),legendary=row(risk,'legendary');
 assert(epic.rarityProbabilities[2]>0);assert.equal(legendary.rarityProbabilities[2],0);
 close(legendary.rarityProbabilities[3],epic.rarityProbabilities[2]+epic.rarityProbabilities[3]);
 for(let rarity=4;rarity<8;rarity++)close(epic.rarityProbabilities[rarity],legendary.rarityProbabilities[rarity]);
 assert(legendary.rarityProbabilities[7]>0);assert.equal(legendary.rarityCeiling,7);
});

test('already-pending below-unlock wishing events keep their existing behavior',()=>{
 const s=fixture('wishingvault',{floor:1}),risk=preview(s);assert(risk);assert(risk.available);
 close(row(risk,'epic').rarityProbabilities[2],.7);close(row(risk,'epic').rarityProbabilities[3],.3);
 assert.equal(row(risk,'legendary').rarityProbabilities[3],1);
});

test('actual seeded engine choices match every displayed gold outcome and supported prize range',()=>{
 for(const [key,choice]of [['gambit','roll'],['gambit','safe'],['wishingvault','roll']]){
  const original=fixture(key,{floor:140,cost:835,gold:E.GOLD_CAP}),risk=preview(original,choice),seen=new Set();
  for(let seed=1;seed<=240;seed++){
   const s=structuredClone(original);s.rng=seed*7919;const before=encodeSave(s);
   const after=E.transition(s,{type:'event-choice',id:choice,confirmed:true});
   const value=key==='gambit'?after.event.roll:after.event.rolls?.reduce((a,b)=>a+b,0);
   const outcomeKey=choice==='safe'?'rare':key==='gambit'?value<=2?'refund':value<=4?'rare':'epic':value<=5?'refund':value<=9?'epic':'legendary';
   const outcome=row(risk,outcomeKey);assert(outcome);seen.add(outcomeKey);
   assert.equal(after.player.gold,outcome.goldAfterChoice);assert.equal(original.player.gold-after.player.gold,outcome.netCostGold);
   if(outcomeKey==='refund'){assert.equal(after.phase,'event');assert.equal(after.event.status,'resolved');assert.equal(after.chest,null);}
   else{
    assert.equal(after.phase,'chest');assert(outcome.rarityProbabilities[after.chest.item.rarity]>0);
    assert(after.chest.item.level>=outcome.itemLevelRange.min&&after.chest.item.level<=outcome.itemLevelRange.max);
    assert(after.chest.gold>0);assert.equal(outcome.goldAfterChoice,original.player.gold-risk.costGold,'unopened chest coins are not a refund');
   }
   assert.equal(encodeSave(s),before);
   if(seed<=12){assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);}
   assert.equal(preview(after,choice),null);
  }
  assert.deepEqual(seen,new Set(risk.outcomes.map(outcome=>outcome.key)));
 }
});

test('next-combat luck survives both actual paid events and remains in a reopened quote',()=>{
 for(const key of ['gambit','wishingvault']){
  const s=fixture(key);s.nextLuck=24;const raw=encodeSave(s),risk=preview(s);assert(risk);
  assert.deepEqual(preview(decodeSave(raw)),risk);
  const after=E.transition(s,{type:'event-choice',id:'roll',confirmed:true});assert.equal(after.nextLuck,24);assert.equal(s.nextLuck,24);
  assert.deepEqual(decodeSave(encodeSave(after)),after);
 }
});

test('rejected, unsupported, malformed and resolved inputs cannot expose a pending risk quote',()=>{
 for(const value of [undefined,null,{},[],{phase:'event'},E.newGame(1)])assert.equal(preview(value),null);
 for(const choice of ['leave','accept','reset','unknown',null,{},0])assert.equal(preview(fixture('gambit'),choice),null);
 assert.equal(preview(fixture('wishingvault'),'safe'),null);
 for(const mutate of [
  s=>s.phase='chest',s=>s.event.status='resolved',s=>s.event.status='bad',s=>s.event.key='spring',
  s=>s.event.costGold=-1,s=>s.event.costGold=1.5,s=>s.event.costGold=1e8+1,
  s=>s.player.gold=NaN,s=>s.player.gold=-1,s=>s.player.gold=E.GOLD_CAP+1,
  s=>s.player.talents=[],s=>s.player.items=null,s=>s.fate=[0,7],s=>s.floor=0,s=>s.player.level=0,
 ]){const s=fixture();mutate(s);assert.equal(preview(s),null);}
});
