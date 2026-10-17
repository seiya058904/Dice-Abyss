// Deterministic rule audits. No browser, human-play or GPU performance claims.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadCompactSimulator} from './qa-combat-adventure.mjs';

const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const project=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..')));
const E=await import(pathToFileURL(resolve(project,'src/engine.js')));
const {ENEMIES,BOSSES,ROOM_NAMES,CATALOG,TALENTS}=await import(pathToFileURL(resolve(project,'src/content.js')));
const {COMBAT_ROOMS}=await import(pathToFileURL(resolve(project,'src/encounters.js')));
const {DEEP_TALENTS}=await import(pathToFileURL(resolve(project,'src/deep-content.js')));
const {validateSave,encodeSave,decodeSave}=await import(pathToFileURL(resolve(project,'src/storage.js')));
const {MAX_ITEM_LEVEL}=await import(pathToFileURL(resolve(project,'src/equipment.js')));
const output=resolve(arg('--output','docs/qa/evidence/combat-audit.json'));
const distribution=values=>{
 if(!values.length)return null;
 const sorted=values.toSorted((a,b)=>a-b),at=q=>sorted[Math.floor((sorted.length-1)*q)];
 return {n:sorted.length,min:sorted[0],median:at(.5),p95:at(.95),max:sorted.at(-1),mean:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(3)};
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const trace=r=>({seed:r.seed,completed:r.completed,deaths:r.deaths,rolls:r.rolls,level:r.level,spending:r.spending,encounters:r.encounters,floorEnds:r.floorEnds});

function reachability(seeds=32,depth=400){
 const rooms={},enemies={},bosses={},events={},serviceGaps={merchant:0,forge:0,fusion:0,rest:0};let roomCount=0,combatCount=0,minHiddenGap=Infinity;
 for(let seed=1;seed<=seeds;seed++){
  let s=E.newGame(seed*104729);s.player.level=40;s.player.hp=E.stats(s).maxHp;s.player.talents.power=1;
  for(const slot of ['weapon','armor','relic']){const spare=E.makeItem(s,slot,1);spare.enhance=5;s.player.items.push(spare);}
  const serviceLast={},block=new Set();let lastHidden=0;
  for(let floor=1;floor<=depth;floor++){
   s.floor=floor;s.fate=E.drawDice(s,2).values;s.route=E.generateRoute(s,s.fate);s.enemy=null;s.event=null;s.chest=null;s.loot=null;
   assert.equal(s.route.length,6);assert.equal(s.route.filter(r=>COMBAT_ROOMS.has(r.type)).length,4);assert.equal(s.route[0].pool,'core');
   const service=s.route[2].type;assert(Object.hasOwn(serviceGaps,service));block.add(service);
   if(serviceLast[service])serviceGaps[service]=Math.max(serviceGaps[service],floor-serviceLast[service]);serviceLast[service]=floor;
   if(floor%4===0){assert.equal(block.size,4);block.clear();}
   for(let index=0;index<6;index++){
    s.roomIndex=index;s.phase='route';s.route.forEach((r,i)=>r.done=i<index);
    s=E.transition(s,{type:'enter'});const room=s.route[index];roomCount++;
    rooms[room.type]??={seed:seed*104729,floor,roomIndex:index};
    if(['hiddenboss','abyssking','archiveguard'].includes(room.type)){if(lastHidden){assert(floor-lastHidden>=8);minHiddenGap=Math.min(minHiddenGap,floor-lastHidden);}lastHidden=floor;}
    if(COMBAT_ROOMS.has(room.type)){
     for(let wave=1;wave<=(room.waves||1);wave++){
      const enemy=wave===1?s.enemy:E.createEnemy(s,room.type);combatCount++;
      const witness={seed:seed*104729,floor,roomIndex:index,room:room.type,wave,mechanic:enemy.mechanic||null};
      if(ENEMIES.some(t=>t.name===enemy.name))enemies[enemy.name]??=witness;
      if(BOSSES.some(t=>t.name===enemy.name))bosses[enemy.name]??=witness;
     }
    }
    if(s.event)events[s.event.key]??={seed:seed*104729,floor,roomIndex:index};
   }
  }
 }
 assert.deepEqual(Object.keys(rooms).sort(),Object.keys(ROOM_NAMES).sort());
 assert.deepEqual(Object.keys(enemies).sort(),ENEMIES.map(e=>e.name).sort());
 assert.deepEqual(Object.keys(bosses).sort(),BOSSES.map(b=>b.name).sort());
 assert(Object.values(serviceGaps).every(gap=>gap<=7));
 return {method:'Sequential real weighted-route/encounter generators with real RNG; fixed synthetic level40, one invested talent and three protected-safe spare items keep inventory-gated events eligible. Rooms are entered but fights are not played and no survival/progression claim is made. Every witness records an actual generator selection, not an injected enemy identity.',seeds,depth,roomCount,combatCount,counts:{rooms:Object.keys(rooms).length,enemies:Object.keys(enemies).length,bosses:Object.keys(bosses).length,eventKeys:Object.keys(events).length},serviceGaps,minHiddenGap,rooms,enemies,bosses,events};
}

function forecastCoverage(){
 let checked=0,phaseCrossings=0,killed=0;const seen=new Set(),byDice={};
 for(const [index,template]of [...ENEMIES,...BOSSES].entries())for(const level of [1,2,3,5,8,11])for(const turns of [0,1,2,3])for(const lowHp of [false,true]){
  const s=E.newGame((index+1)*7919+turns);s.floor=200;s.player.level=level;s.player.talents.vitality=1000;
  for(const key of Object.keys(DEEP_TALENTS))s.player.talents[key]=3;
  s.player.hp=Math.floor(E.stats(s).maxHp*(lowHp?.25:1));s.ward=0;s.phase='combat';s.fate=[3,4];
  s.route=Array.from({length:6},(_,i)=>({id:`f200r${i}`,type:i===5?'boss':'combat',done:false,quality:0}));s.roomIndex=0;
  s.enemy=E.createEnemy(s,template.roomType||'combat');
  const boss=index>=ENEMIES.length||['guardian','hiddenboss','abyssking','archiveguard'].includes(template.roomType);
  Object.assign(s.enemy,template,{type:boss?'boss':s.enemy.type,maxHp:1e9,hp:boss?500000001:template.mechanic==='berserker'?(template.variant?.5:.35)*1e9+1:750000000,shield:0,maxShield:2e8,attack:1000,turns,stage:1,wave:3});
  if(!template.mechanic)delete s.enemy.mechanic;
  const before=structuredClone(s),intent=E.enemyIntent(s);assert.deepEqual(s,before,'forecast mutated state');
  E.resolveRoll(s);const r=s.lastRoll;checked++;byDice[r.values.length]=(byDice[r.values.length]||0)+1;seen.add(template.name);phaseCrossings+=Number(r.phaseChanged);killed+=Number(r.killed);
  assert(!r.killed,'a forecast stress fixture must keep its enemy alive');
  assert(r.retaliation>=intent.minDamage&&r.retaliation<=intent.maxDamage,`${template.name}: ${r.retaliation} outside ${intent.minDamage}..${intent.maxDamage}; ${r.values}`);
  assert(validateSave(s),template.name+' invalid after roll');
 }
 return {method:'Synthetic isolated combat states covering all118 authored identities, 1–6 dice, completed turns0–3, full/25% player HP, V5 defenses, surviving boss half-health crossings and three-wave modifiers. Actual resolveRoll results are checked against a pure pre-roll forecast. This is not natural balance data.',identities:seen.size,cases:checked,byDice,phaseCrossings,killed,allWithinBounds:true,pureForecast:true};
}

function extremeNumbers(){
 const rows=[];
 for(const floor of [1e6,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER]){
  let s=E.newGame(314159);s.floor=floor;s.player.level=1e6;s.player.talents.vitality=TALENTS.vitality.cap;s.player.talents.power=TALENTS.power.cap;s.player.items=[];
  for(const [slot,type]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic2','relic'],['relic3','relic']]){const item=E.makeItem(s,type,7);item.level=MAX_ITEM_LEVEL;item.enhance=20;s.player.items.push(item);s.player.equipped[slot]=item.id;}
  s.player.hp=E.stats(s).maxHp;s=E.transition(E.transition(s,{type:'fate'}),{type:'enter'});s=E.transition(s,{type:'roll'});
  assert(validateSave(s));assert.deepEqual(decodeSave(encodeSave(s)),s);
  for(const value of Object.values(E.stats(s)))if(typeof value==='number')assert(Number.isFinite(value)&&value>=0);
  for(const key of ['main','extra','echoDamage','total','retaliation','hpDamage'])assert(Number.isSafeInteger(s.lastRoll[key])&&s.lastRoll[key]>=0);
  rows.push({floor,phase:s.phase,playerLevel:s.player.level,maxHp:E.stats(s).maxHp,attack:E.stats(s).attack,damage:s.lastRoll.total,retaliation:s.lastRoll.retaliation,roundTrip:true});
 }
 return {method:'Constructed valid maximum-level/+20 eternal loadouts and very deep floors; real fate/route/roll and serialized save round-trip. Does not claim these levels are naturally reached.',rows};
}

async function balances(count=2,floors=400,referencePath=null){
 const simulator=await loadCompactSimulator(project,{verifyComparisons:512}),rows=[];let policyProof=null;
 const run=seed=>{
  const resets=new Map(),starts=new Map();
  const result=simulator.runAdventure(seed,{floors,forecast:false,fusion:true,events:'adventurous',observe:s=>{
   const key=s.floor+'/'+s.roomIndex+'/'+(s.route[s.roomIndex]?.wave||1);
   if(s.event?.key==='memorywell'&&s.event.choice==='reset'&&s.event.status==='resolved'&&!resets.has(key))resets.set(key,{floor:s.floor,roomIndex:s.roomIndex,refunded:s.event.outcome,unspentPoints:s.player.talentPoints});
   if(s.phase==='combat'&&s.enemy?.turns===0&&!starts.has(key))starts.set(key,{floor:s.floor,roomType:s.route[s.roomIndex].type,name:s.enemy.name,rankSum:Object.values(s.player.talents).reduce((a,b)=>a+b,0),unspentPoints:s.player.talentPoints,powerRank:s.player.talents.power,damageEstimate:Math.round(E.damageExpectation(s)),mostRecentRespec:[...resets.values()].at(-1)?.floor||null});
  }});
  result.qaContext={method:'Pure observations before the simulator makes its next single talent investment; estimates are not actual dice outcomes.',respecs:[...resets.values()],longest:result.encounters.toSorted((a,b)=>b.turns-a.turns).slice(0,12).map(e=>({...e,startContext:[...starts.values()].find(c=>c.floor===e.floor&&c.roomType===e.roomType&&c.name===e.name)||null}))};
  return result;
 };
 if(referencePath){
  const reference=JSON.parse(await readFile(referencePath,'utf8'));
  const result=run(reference.seed);
  const actual=trace(result),expected=trace(reference);assert.deepEqual(actual,expected,'QA policy differs from the recorded unchanged original simulation');
  policyProof={seed:reference.seed,floors,recordedTraceSha256:hash(expected),adaptedTraceSha256:hash(actual),exactRecordedTraceMatch:true};
  rows.push(result);
 }
 for(let index=rows.length;index<count;index++){
  const seed=(index+1)*7919,result=run(seed);
  assert(result.completed,seed+' incomplete');assert(validateSave(result.s));assert.deepEqual(decodeSave(encodeSave(result.s)),result.s);rows.push(result);
 }
 return {method:'Fresh floor1 full actual game transitions; unchanged simulate.mjs adventurous/fusion/balanced/expected-upgrade policy. Only equipment comparison uses an audited compact read view; the full inventory is retained for all gameplay. No injected level, gear, HP or dice. Offline simulation, not human/browser play.',policyProof,adapter:simulator.QA_COMPARISON_AUDIT,seeds:rows.length,floors,rows:rows.map(r=>({...trace(r),context:r.qaContext,milestones:Object.fromEntries([10,30,50,80,140,200,400].filter(n=>n<=floors).map(n=>[n,{floorRange:[Math.max(1,n-9),n],rounds:Object.fromEntries(['combat','elite','boss','trial'].map(type=>[type,distribution(r.encounters.filter(e=>e.floor>=Math.max(1,n-9)&&e.floor<=n&&e.type===type).map(e=>e.turns))])),economy:r.floorEnds.find(f=>f.floor===n)||null}]))}))};
}

const start=performance.now(),report={environment:{node:process.version,platform:process.platform,arch:process.arch},content:{rooms:Object.keys(ROOM_NAMES).length,enemies:ENEMIES.length,bosses:BOSSES.length,items:Object.values(CATALOG).flat().length,talents:Object.keys(TALENTS).length}};
const mode=arg('--mode','checks');
if(mode==='checks'||mode==='all'){report.reachability=reachability(Number(arg('--route-seeds',32)));report.forecasts=forecastCoverage();report.extremes=extremeNumbers();}
if(mode==='balance'||mode==='all')report.balance=await balances(Number(arg('--seeds',2)),Number(arg('--floors',400)),arg('--reference',null));
report.durationSeconds=+((performance.now()-start)/1000).toFixed(3);await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,content:report.content,reachability:report.reachability?.counts,forecastCases:report.forecasts?.cases,balanceSeeds:report.balance?.seeds,durationSeconds:report.durationSeconds}));
