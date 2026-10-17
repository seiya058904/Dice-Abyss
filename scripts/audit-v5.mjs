// Deterministic offline audits only. This does not add automatic play to the UI.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import * as E from '../src/engine.js';
import {ROOM_NAMES,RARITIES,CATALOG,ENEMIES,BOSSES,TALENTS} from '../src/content.js';
import {COMBAT_ROOMS,canonicalCombatType} from '../src/encounters.js';
import {ROOM_WEIGHTS,POOL_WEIGHTS} from '../src/route-weights.js';
import {DEEP_ROOMS,ABILITY_DEFS} from '../src/deep-content.js';
import {highestRarity} from '../src/rarity.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
import {runAdventure} from './simulate.mjs';
const STAGES=[[1,29],[30,49],[50,79],[80,139],[140,400]];
const stage=floor=>STAGES.findIndex(([a,b])=>floor>=a&&floor<=b);
const increment=(map,key,n=1)=>map[key]=(map[key]||0)+n;
export const distribution=values=>{
 if(!values.length)return null;const a=values.toSorted((a,b)=>a-b),at=q=>a[Math.min(a.length-1,Math.floor(q*(a.length-1)))];
 return {n:a.length,min:a[0],p10:at(.1),median:at(.5),p90:at(.9),p95:at(.95),max:a.at(-1),mean:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(3)};
};
export function auditRoutes(seeds=1000,depth=400){
 const total={},stages=STAGES.map(([from,to])=>({from,to,rooms:0,types:{},slots:{},pools:{},hidden:0})),services=Object.fromEntries(['merchant','forge','fusion','rest'].map(k=>[k,{encounters:0,maxGap:0}])),reachable=Object.fromEntries([10,30,50,80,140,200].map(n=>[n,new Set()]));let hidden=0,maxHiddenGap=0,minHiddenGap=Infinity;
 for(let seed=1;seed<=seeds;seed++){
  const s={floor:1,rng:seed*7919>>>0,routeMemory:{services:[],last:{},hiddenFloor:0},encounterHistory:[]};const last={},block=new Set();let priorHidden=0;
  for(let floor=1;floor<=depth;floor++){
   s.floor=floor;const fate=[Math.floor(E.random(s)*6)+1,Math.floor(E.random(s)*6)+1],route=E.generateRoute(s,fate),st=stages[stage(floor)];
   assert.equal(route.length,6);assert.equal(route.filter(r=>COMBAT_ROOMS.has(r.type)).length,4);assert.equal(route[5].type,floor%5===0?'boss':'elite');assert.equal(route[0].pool,'core');
   const service=route[2].type;assert(service in services);block.add(service);services[service].encounters++;if(last[service]){const gap=floor-last[service];assert(gap<=7);services[service].maxGap=Math.max(services[service].maxGap,gap);}last[service]=floor;
   if(floor%4===0){assert.equal(block.size,4);block.clear();}
   for(const r of route){increment(total,r.type);increment(st.types,r.type);increment(st.slots,r.slot);increment(st.pools,r.slot+'/'+r.pool);st.rooms++;if(reachable[floor])reachable[floor].add(r.type);
    const weight=ROOM_WEIGHTS.find(w=>w.type===r.type&&w.slot===r.slot);assert(weight&&weight.floor<=floor);
    if(['hiddenboss','abyssking','archiveguard'].includes(r.type)){hidden++;st.hidden++;if(priorHidden){const gap=floor-priorHidden;assert(gap>=8);minHiddenGap=Math.min(minHiddenGap,gap);maxHiddenGap=Math.max(maxHiddenGap,gap);}priorHidden=floor;}
   }
  }
 }
 assert.equal(Object.keys(total).length,Object.keys(ROOM_NAMES).length);
 return {method:'Natural sequential route generator only; no combat, inventory, purchases or event acceptance. All optional event inventory conditions are eligible in this standalone model.',seeds,depth,floors:seeds*depth,rooms:seeds*depth*6,counts:total,stages,services,hidden:{encounters:hidden,perFloor:hidden/(seeds*depth),perDailyCombatSlot:hidden/(seeds*depth*3),minGap:minHiddenGap,maxObservedGap:maxHiddenGap},reachableAtFloor:Object.fromEntries(Object.entries(reachable).map(([n,set])=>[n,[...set].sort()])),configuredWeights:ROOM_WEIGHTS,poolMass:POOL_WEIGHTS};
}
export function auditRewardChains(seeds=1000,depth=400){
 const counts=STAGES.map(([from,to])=>({from,to,rarities:Array(8).fill(0),sources:{},draws:0})),firsts=Array.from({length:8},()=>[]),byCutoff=Object.fromEntries([29,49,79,139,200,400].map(n=>[n,Array(8).fill(0)]));const abilityFamilies=new Set();
 for(let seed=1;seed<=seeds;seed++){
  const s=E.newGame(seed*104729);s.player.items.push(E.makeItem(s,'relic',1));s.player.talents.power=1;s.player.level=10;const first=Array(8).fill(null);
  for(let floor=1;floor<=depth;floor++){
   s.floor=floor;s.fate=E.drawDice(s,2).values;s.route=E.generateRoute(s,s.fate);const st=counts[stage(floor)];
   for(let i=0;i<6;i++){
    s.roomIndex=i;const room=s.route[i];if(!COMBAT_ROOMS.has(room.type)&&!['chest','vault'].includes(room.type))continue;
    for(let wave=0;wave<(room.waves||1);wave++){
     if(COMBAT_ROOMS.has(room.type))s.counters.kills++;
     const c=E.createChest(s,room.type,ROOM_NAMES[room.type]),r=c.item.rarity;assert(r<=highestRarity(floor));first[r]??=floor;st.rarities[r]++;st.draws++;st.sources[room.type]||=Array(8).fill(0);st.sources[room.type][r]++;
     const family=CATALOG[c.item.slot].find(x=>x.id===c.item.catalogId)?.ability;if(family)abilityFamilies.add(family);
    }
   }
   if(byCutoff[floor])first.forEach((f,r)=>{if(f!==null)byCutoff[floor][r]++;});
  }
  first.forEach((f,r)=>{if(f!==null)firsts[r].push(f);});
 }
 assert.equal(abilityFamilies.size,Object.keys(ABILITY_DEFS).length);
 return {method:'Route + actual createChest reward-generator model, not a completed adventure. Fixed level 10 and starting gear/luck, optional rooms eligible. Includes scheduled combat waves and chest/vault rooms; excludes event choices and shop purchases, combat RNG, victory-condition extra rerolls and survival. FirstSeen is a modeled generated chest, NOT naturally owned gameplay loot.',seeds,depth,counts,firstSeen:firsts.map(distribution),seenByCutoff:byCutoff,abilityFamilies:[...abilityFamilies].sort()};
}
export function auditSources(draws=25000){
 const result=[];
 for(const floor of [10,29,30,49,50,79,80,139,140,200,400])for(const source of ['combat','elite','trial','boss','hiddenboss','vault','merchant','blackmarket','auction']){
  const s=E.newGame(3735928559^floor);s.floor=floor;s.player.level=10;s.fate=[3,4];const legacy=['merchant','blackmarket'].includes(source)?'combat':source==='auction'?'vault':source,expected=E.dropOdds(s,source,legacy),observed=Array(8).fill(0);
  for(let n=0;n<draws;n++)observed[E.rarityRoll(s,source,legacy)]++;
  for(let r=0;r<8;r++){if(expected[r]===0)assert.equal(observed[r],0);else assert(Math.abs(observed[r]/draws-expected[r])<.015);}
  result.push({floor,source,legacy,luck:E.stats(s).luck,draws,expected,observed});
 }
 return {method:'Actual rarityRoll source sampler, fixed fate [3,4] and starter effective luck. Shop lines measure the deep bonus roll; complete shop offers also keep their original lower-tier minimum. No event-specific guaranteed floors or rich-chest lifts included.',rows:result};
}
export function auditAdventures(count=16,longCount=4){
 const rows=[];
 for(let index=0;index<count+longCount;index++){
  const floorLimit=index<count?200:400,seed=(index+1)*7919,first=Array(8).fill(null),known=new Set(),triggers={},checkpoints={},gearChanges=new Set();let lastGear='',maxBytes=0,saveChecks=0;
  const result=runAdventure(seed,{floors:floorLimit,fusion:true,forecast:false,events:'adventurous',observe:s=>{
   for(const item of s.player.items)if(!known.has(item.id)){known.add(item.id);first[item.rarity]??=s.floor;}
   if(s.lastRoll&&s.phase==='chest'&&s.enemy?.turns){const key=s.floor+'/'+s.roomIndex+'/'+s.route[s.roomIndex]?.wave;if(!gearChanges.has('fight/'+key)){gearChanges.add('fight/'+key);for(const line of s.lastRoll.mechanics||[])for(const [ability,def]of Object.entries(ABILITY_DEFS))if(line.startsWith(def.name)||ability==='eliteLuck'&&line.startsWith('追星'))increment(triggers,ability);}}
   const signature=JSON.stringify(s.player.equipped);if(lastGear&&signature!==lastGear)gearChanges.add('gear/'+signature);lastGear=signature;
   if(s.phase==='cleared'&&[10,30,50,80,100,140,200,400].includes(s.floor)){
    const st=E.stats(s);checkpoints[s.floor]={floor:s.floor,level:s.player.level,attack:st.attack,maxHp:st.maxHp,defense:st.defense,luck:st.luck,rawLuck:st.rawLuck,gold:s.player.gold,inventory:s.player.items.length,abilities:Object.fromEntries(Object.keys(ABILITY_DEFS).filter(k=>st[k]>0).map(k=>[k,st[k]]))};
    assert(validateSave(s));const encoded=encodeSave(s);assert.deepEqual(decodeSave(encoded),s);maxBytes=Math.max(maxBytes,encoded.length);saveChecks++;
   }
  }});
  assert(result.completed,'Adventure not complete: '+seed+' floor '+result.s.floor+' '+result.s.phase);assert(validateSave(result.s));
  rows.push({seed,floorLimit,completed:result.completed,deaths:result.deaths,rolls:result.rolls,level:result.level,firstOwned:first,rarities:result.rarities,spent:result.spent,spending:result.spending,buys:result.buys,forges:result.forges,fusions:result.fusions,finalGold:result.s.player.gold,maxSerializedCodeUnits:maxBytes,saveChecks,checkpoints,gearChanges:[...gearChanges].filter(k=>k.startsWith('gear/')).length,observedFinishingRollTriggers:triggers,routeTypes:result.routeTypes,rounds:Object.fromEntries(Object.entries(result.rounds).map(([k,v])=>[k,distribution(v)])),bosses:result.encounters.filter(e=>e.type==='boss').map(e=>({floor:e.floor,name:e.name,mechanic:e.mechanic,turns:e.turns,phaseChanges:e.phaseChanges,damageTaken:e.damageTaken})),encountersByMilestone:Object.fromEntries([10,30,50,80,100,140,200,400].filter(n=>n<=floorLimit).map(n=>[n,Object.fromEntries(['combat','elite','boss','trial'].map(type=>[type,distribution(result.encounters.filter(e=>e.floor>Math.max(0,n-10)&&e.floor<=n&&e.type===type).map(e=>e.turns))]))]))});
  console.error('Completed engine adventure',seed,'to',floorLimit,'deaths',result.deaths,'first owned',first.slice(4));
 }
 return {method:'Full real game transitions from fresh floor 1 seeds, no debug gear, no skipped enemies, no HP edits. Offline policy buys expected upgrades, invests talents, forges weapon to +9, fuses unprotected low-tier materials and accepts the first affordable non-leave event. Forecast rendering is disabled only for speed. This is simulation, not human/browser play. Finishing-roll trigger counts undercount non-finishing activations.',rows};
}
export async function auditV5({seeds=1000,adventures=16,long=4,output='docs/v5/evidence/audit-v5.json'}={}){
 const start=performance.now(),report={version:5,environment:{node:process.version,platform:process.platform,arch:process.arch},content:{equipment:Object.values(CATALOG).flat().length,bySlot:Object.fromEntries(Object.entries(CATALOG).map(([k,v])=>[k,v.length])),rarities:RARITIES.length,rooms:Object.keys(ROOM_NAMES).length,enemies:ENEMIES.length,bosses:BOSSES.length,talents:Object.keys(TALENTS).length,abilityFamilies:Object.keys(ABILITY_DEFS).length},routes:auditRoutes(seeds),rewardChains:auditRewardChains(seeds),sourceDraws:auditSources()};
 mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));console.error('Route, reward-chain and source audits complete');
 report.adventures=auditAdventures(adventures,long);report.durationSeconds=+((performance.now()-start)/1000).toFixed(2);writeFileSync(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
 auditV5({seeds:Number(arg('--seeds',1000)),adventures:Number(arg('--adventures',16)),long:Number(arg('--long',4)),output:arg('--output','docs/v5/evidence/audit-v5.json')}).then(r=>console.log(JSON.stringify({content:r.content,durationSeconds:r.durationSeconds,adventures:r.adventures.rows.length}))).catch(error=>{console.error(error);process.exitCode=1;});
}
