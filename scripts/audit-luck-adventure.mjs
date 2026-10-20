// Real engine-transition audit under the existing simulator's luck policy.
// This script never assigns player level, gear, HP, dice or game RNG.
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const source=resolve(arg('--source',process.cwd())),output=resolve(arg('--output','luck-audit.json')),floors=Number(arg('--floors',200)),seedCount=Number(arg('--seeds',2));
const {loadCompactSimulator}=await import(pathToFileURL(resolve(source,'scripts/qa-combat-adventure.mjs')));
const E=await import(pathToFileURL(resolve(source,'src/engine.js'))),S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const simulator=await loadCompactSimulator(source,{verifyComparisons:512});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const distribution=values=>{if(!values.length)return null;const s=values.toSorted((a,b)=>a-b),at=q=>s[Math.floor((s.length-1)*q)];return {n:s.length,min:s[0],median:at(.5),p95:at(.95),max:s.at(-1),mean:s.reduce((a,b)=>a+b,0)/s.length};};
const rows=[],started=performance.now();
for(let i=0;i<seedCount;i++){
 const seed=(i+1)*7919,rarityMinFloor=Array(8).fill(null),chestIds=new Set();
 const result=simulator.runAdventure(seed,{floors,build:'luck',forecast:false,fusion:true,events:'adventurous',observe:s=>{
  if(s.phase==='chest'&&!chestIds.has(s.chest.item.id)){chestIds.add(s.chest.item.id);const r=s.chest.item.rarity;rarityMinFloor[r]=Math.min(rarityMinFloor[r]??Infinity,s.floor);}
 }});
 assert(result.completed,`seed ${seed} did not reach ${floors}`);assert(S.validateSave(result.s));assert.deepEqual(S.decodeSave(S.encodeSave(result.s)),result.s);
 const normalized=structuredClone(result.s);normalized.runId='normalized-date-derived-run-id';
 rows.push({seed,completed:result.completed,floor:result.s.floor,phase:result.s.phase,deaths:result.deaths,rolls:result.rolls,level:result.level,gold:result.s.player.gold,spending:result.spending,spent:result.spent,buys:result.buys,forges:result.forges,fusions:result.fusions,rarities:result.rarities,rarityMinFloor,inventoryItems:result.s.player.items.length,finalRng:result.s.rng,finalStateSha256:hash(normalized),encounterTraceSha256:hash(result.encounters),rounds:Object.fromEntries(['combat','elite','boss','trial'].map(type=>[type,distribution(result.encounters.filter(e=>e.type===type).map(e=>e.turns))])),lateBosses:distribution(result.encounters.filter(e=>e.type==='boss'&&e.floor>floors-50).map(e=>e.turns)),longest:result.encounters.toSorted((a,b)=>b.turns-a.turns).slice(0,8),milestones:Object.fromEntries([10,30,50,80,140,200].filter(f=>f<=floors).map(f=>[f,result.floorEnds.find(e=>e.floor===f)])),saveRoundTrip:true});
 console.log(JSON.stringify({seed,build:'luck',floors,completed:result.completed,rolls:result.rolls,deaths:result.deaths,elapsedSeconds:(performance.now()-started)/1000}));
}
const report={method:'Fresh floor-1 complete real engine state transitions through existing runAdventure with luck talent priority, expected upgrades/purchases, fusion enabled and adventurous event choices. The compact adapter only reduces equipment-comparison reads and verifies its first 512 comparisons against the original implementation. No browser or human-play claim.',environment:{node:process.version,platform:process.platform,arch:process.arch},sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,sourceHashes:Object.fromEntries(await Promise.all(['src/engine.js','src/encounters.js','src/equipment.js','scripts/simulate.mjs'].map(async p=>[p,hash(await readFile(resolve(source,p),'utf8'))]))),build:'luck',floors,seedCount,adapter:simulator.QA_COMPARISON_AUDIT,rows,durationSeconds:(performance.now()-started)/1000,limitations:['Two deterministic seeds cannot establish win rate, drop-rate changes or population-wide balance.','Changing equipment rewards can change later upgrade/purchase choices and RNG consumption; baseline and candidate may follow different later routes.','A zero-death automated policy is an observed trajectory, not a balance defect or a request to increase deaths.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,durationSeconds:report.durationSeconds}));
