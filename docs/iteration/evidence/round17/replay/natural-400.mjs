import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||'work/Dice-Abyss');
const {loadCompactSimulator}=await import(pathToFileURL(resolve(source,'scripts/qa-combat-adventure.mjs')));
const S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const E=await import(pathToFileURL(resolve(source,'src/engine.js')));
const simulator=await loadCompactSimulator(source,{verifyComparisons:256});
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const tracked=['src/engine.js','src/encounters.js','src/deep-rules.js','src/equipment.js','src/content.js','src/rarity.js','scripts/simulate.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(tracked.map(async path=>[path,hash(await readFile(resolve(source,path)))])));
const sourceHashes=await hashes(),seed=15838,policy={floors:400,build:'luck',forecast:false,fusion:true,events:'adventurous'};
const start=performance.now();let observations=0,lastFloor=0;const checkpoints=[];
console.log(JSON.stringify({seed,policy,started:true}));
const result=simulator.runAdventure(seed,{...policy,observe:s=>{
 observations++;
 if(s.phase==='cleared'&&s.floor%100===0&&s.floor!==lastFloor){lastFloor=s.floor;const row={floor:s.floor,rolls:s.counters.rolls,deaths:s.counters.deaths,revision:s.revision,level:s.player.level,gold:s.player.gold};checkpoints.push(row);console.log(JSON.stringify({checkpoint:row}));}
}});
assert(S.validateSave(result.s));assert.deepEqual(S.decodeSave(S.encodeSave(result.s)),result.s);assert.deepEqual(await hashes(),sourceHashes);
const failureByDeaths=!result.completed&&result.s.phase==='dead'&&result.deaths>20;
const report={source,sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,sourceHashes,sourceStable:true,seed,policy:{...policy,shop:true,talents:true,purchases:'expected'},method:'Unmodified shipped runAdventure policy and complete real transitions from newGame. The compact comparison adapter checks its first 256 calls against the full original. No assigned progress/gear/HP/enemy/dice/RNG fields, no alternative seeds, and no post-hoc policy changes.',completed:result.completed,finishReason:result.completed?'COMPLETED':failureByDeaths?'DEATH_RETRY_LIMIT':'DECISION_BUDGET_EXHAUSTED',endingFloor:result.s.floor,endingPhase:result.s.phase,decisionIterations:observations-(failureByDeaths?0:1),observedStates:observations,committedActions:result.s.revision,rolls:result.rolls,deaths:result.deaths,completedBattles:result.encounters.length,battleAttempts:result.attempts.length,level:result.level,gold:result.s.player.gold,buys:result.buys,forges:result.forges,fusions:result.fusions,spending:result.spending,checkpoints,finalStateSha256:hash({...result.s,runId:'date-normalized'}),adapter:simulator.QA_COMPARISON_AUDIT,codecRoundTrip:true,durationSeconds:(performance.now()-start)/1000,limitations:['One fixed existing policy trajectory is reachability evidence, not a population win rate, proof of balance, or comparison against the prior version.','Decision iterations and committed engine actions differ because the shipped simulator can allocate/equip/purchase several times in one iteration.','The floor-200 checkpoint is a prefix of this one journey.']};
if(!result.completed)await writeFile(new URL('./natural-400-incomplete.save.json',import.meta.url),S.encodeSave(result.s));
await writeFile(new URL('./natural-400-evidence.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!result.completed)process.exitCode=2;
