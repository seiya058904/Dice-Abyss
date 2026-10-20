// Explicit old-pending compatibility plus fixed natural reachability.
// node scripts/audit-deep-variants-round22.mjs --source . --baseline INPUT_ROOT --output /tmp/deep-variants/report.json
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const arg=name=>{const index=process.argv.indexOf(name);assert(index>=0&&process.argv[index+1],`Pass ${name}.`);return resolve(process.argv[index+1]);};
const source=arg('--source'),baseline=arg('--baseline'),output=arg('--output'),outDir=dirname(output);
const hash=bytes=>createHash('sha256').update(typeof bytes==='string'||Buffer.isBuffer(bytes)?bytes:JSON.stringify(bytes)).digest('hex');
const load=async root=>{
 const module=path=>import(pathToFileURL(resolve(root,path)));
 const [E,S,D,C,A]=await Promise.all(['src/engine.js','src/storage.js','src/deep-content.js','src/content.js','scripts/simulate.mjs'].map(module));return {E,S,D,C,A};
};
const [B,A]=await Promise.all([load(baseline),load(source)]),targets=['parity','sequence'];
const tracked=['src/engine.js','src/deep-content.js','src/deep-rules.js','src/storage.js','src/encounter-tactics.js','src/encounters.js','src/content.js','src/equipment.js','src/equipment-content.js','src/route-weights.js','scripts/simulate.mjs'];
const sourceHashes=()=>Object.fromEntries(tracked.map(path=>[path,hash(readFileSync(resolve(source,path)))]));
const before=sourceHashes();mkdirSync(outDir,{recursive:true});
const report={started:new Date().toISOString(),kind:'Exact old-pending comparison and bounded natural reachability; not a player-win-rate or balance study.',
 sourceVersion:JSON.parse(readFileSync(resolve(source,'package.json'))).version,baselineVersion:JSON.parse(readFileSync(resolve(baseline,'package.json'))).version,
 scriptSha256:hash(readFileSync(fileURLToPath(import.meta.url))),sourceHashes:before,legacy:{completeTransitionPairs:0,codecPairs:0},fairIndependentDice:[],natural:[],snapshots:[],notes:[]};
const legacyTrace=createHash('sha256');
function prepared(mechanic,count,turns){
 const s=B.E.newGame(7919+turns*101+count);s.runId='round22-legacy-complete-state';s.floor=40;s.player.level=B.C.DICE_LEVELS[count-1];s.player.xp=0;s.player.talentPoints=2;
 s.player.items=['weapon','armor','relic'].map((slot,i)=>({id:`i${i+1}`,slot,rarity:0,depth:1,level:12,levelXp:0,enhance:0,locked:false,legacy:true,profile:0,name:'旧规则全状态对照'}));
 s.player.hp=B.E.stats(s).maxHp;s.player.foreignBuild={keep:[1,2,3]};s.fate=[3,4];s.phase='combat';s.roomIndex=0;s.ward=0;s.nextLuck=7;
 s.route=[mechanic,'combat','rest','sequence','gold','boss'].map((type,i)=>({id:`f40r${i}`,type,done:false,quality:0}));
 s.enemy={...B.D.DEEP_ENEMIES.find(e=>e.roomType===mechanic&&e.variant===1),type:'combat',combatRules:4,hp:100003,maxHp:100003,shield:0,maxShield:20001,attack:9,turns,stage:1,wave:1,foreignEncounter:{retained:'opaque'}};
 s.foreignState={nested:['old-pending',19]};assert(B.S.validateSave(s));assert(A.S.validateSave(s));return s;
}
function codec(s){
 const raw=B.S.encodeSave(s);assert.equal(A.S.encodeSave(s),raw);assert.deepEqual(A.S.decodeSave(raw),s);assert.deepEqual(B.S.decodeSave(raw),s);report.legacy.codecPairs++;return s;
}
function pair(s,action){
 const original=structuredClone(s),a=B.E.transition(s,action),b=A.E.transition(s,action);assert.notStrictEqual(a,s,`The planned ${action.type} must be legal.`);
 assert.deepEqual(s,original);assert.deepEqual(b,a,`Full old-pending state changed for ${s.enemy.mechanic}/${s.enemy.turns}/${action.type}`);assert.equal(b.enemy.combatRules,s.enemy.combatRules);assert.deepEqual(b.enemy.deepVariantRules,s.enemy.deepVariantRules);
 report.legacy.completeTransitionPairs++;legacyTrace.update(JSON.stringify({action,state:b}));return codec(b);
}
for(const mechanic of targets)for(const count of [1,3,6])for(const turns of [0,1,2,6]){
 const start=codec(prepared(mechanic,count,turns));let s=start;
 for(const action of [{type:'roll'},{type:'talent',id:'power'},{type:'roll'},{type:'lock',id:'i1'},{type:'lock',id:'i1'},{type:'roll'}])s=pair(s,action);
 const losing=structuredClone(start);losing.enemy.attack=1e9;losing.player.hp=1;const dead=pair(losing,{type:'roll'});assert.equal(dead.phase,'dead');pair(dead,{type:'retry'});
 const winning=structuredClone(start);winning.enemy.hp=1;winning.enemy.shield=0;const chest=pair(winning,{type:'roll'});assert.equal(chest.phase,'chest');const loot=pair(chest,{type:'open'});assert.equal(loot.phase,'loot');
}
report.legacy.originalPendingTransitionPairs=report.legacy.completeTransitionPairs;
let collisionFixtures=0;
for(const mechanic of targets)for(const rules of [undefined,2,4])for(const value of [1,0,2,null,true,'foreign',{revision:1},[1,'opaque']]){
 const original=prepared(mechanic,1,0);if(rules===undefined)delete original.enemy.combatRules;else original.enemy.combatRules=rules;original.enemy.deepVariantRules=structuredClone(value);codec(original);collisionFixtures++;
 pair(original,{type:'roll'});const dying=structuredClone(original);dying.player.hp=1;dying.enemy.attack=1e9;const dead=pair(dying,{type:'roll'});assert.equal(dead.phase,'dead');pair(dead,{type:'retry'});
}
report.legacy.unknownNameCollisionFixtures=collisionFixtures;report.legacy.unknownNameCollisionTransitionPairs=report.legacy.completeTransitionPairs-report.legacy.originalPendingTransitionPairs;
report.legacy.fullStateTraceSha256=legacyTrace.digest('hex');report.legacy.comparison='No omitted or normalized fields; identical fixed runId, complete state, unknown metadata including old deepVariantRules values, raw save envelope, RNG and rewards.';

for(let count=1;count<=6;count++){
 let total=0,diverse=0,pair=0;
 const visit=values=>{if(values.length===count){total++;const distinct=new Set(values).size;diverse+=distinct>=3;pair+=distinct<count;return;}for(let face=1;face<=6;face++)visit([...values,face]);};visit([]);
 report.fairIndependentDice.push({count,total,oldDiversityOutcomes:diverse,newPairOutcomes:pair,oldProbability:diverse/total,newProbability:pair/total});
}

const plan={seeds:[7919,15838,23757,31676],floors:40,shop:true,talents:true,build:'balanced',fusion:false,purchases:'expected',events:'safe',forecast:false,
 existingPolicyLimits:'runAdventure unchanged: at most floors × 400 decisions; stop after more than 20 deaths.',selection:'Every fixed seed is retained. No seed replacement, forced rooms, forced rolls, future-RNG policy access, or injected assets. First encountered tagged battle of each mechanic is saved before the existing policy makes its next action.'};
report.naturalPlan=plan;
const firstTagged=new Set(),coverage=new Set();
function saveSnapshot(name,state,version,purpose){
 const raw=version.S.encodeSave(state),path=resolve(outDir,name+'.json.gz');writeFileSync(path,gzipSync(raw));
 const receipt={file:basename(path),rawSha256:hash(raw),gzipSha256:hash(readFileSync(path)),floor:state.floor,phase:state.phase,mechanic:state.enemy?.mechanic,variant:state.enemy?.variant,combatRules:state.enemy?.combatRules??null,purpose};report.snapshots.push(receipt);return receipt;
}
for(const [label,version] of [['baseline',B],['current',A]])for(const seed of plan.seeds){
 const entries=[],rolls=[],entryKeys=new Set(),rollKeys=new Set();
 const result=version.A.runAdventure(seed,{...plan,observe(s){
  const e=s.enemy;if(!e||!targets.includes(e.mechanic)||e.roomType!==e.mechanic)return;
  if(s.phase==='combat'&&e.turns===0){
   const key=`${s.floor}/${s.roomIndex}/${e.wave||1}/${s.counters.deaths}`;
   if(!entryKeys.has(key)){
    entryKeys.add(key);entries.push({floor:s.floor,roomIndex:s.roomIndex,name:e.name,mechanic:e.mechanic,variant:e.variant,combatRules:e.combatRules??null,dice:version.E.diceCount(s),retry:s.counters.deaths});
    if(label==='current'&&e.combatRules===5){coverage.add(e.mechanic);if(!firstTagged.has(e.mechanic)){firstTagged.add(e.mechanic);saveSnapshot(`current-first-${e.mechanic}-seed-${seed}`,s,version,'First naturally reached enum-5 battle in the fixed seed order.');}}
   }
  }
  if(label==='current'&&e.combatRules===5&&s.lastRoll&&e.turns>0&&!rollKeys.has(s.counters.rolls)){
   rollKeys.add(s.counters.rolls);const r=s.lastRoll,odd=r.values.filter(v=>v%2).length,pair=new Set(r.values).size<r.values.length;
   const qualifies=e.mechanic==='parity'?((e.turns%2? r.values.length-odd:odd)>r.values.length/2):pair;
   const triggered=r.mechanics.includes(e.mechanic==='parity'?'奇偶刻点吻合 · 伤害 +35%':'合鸣破阵 · 伤害 +40%');assert.equal(triggered,qualifies);
   if(e.mechanic==='sequence')assert.equal(r.mechanics.includes('独声未破阵 · 重筑 3% 护盾'),!qualifies&&!r.killed&&s.player.hp>0);
   rolls.push({floor:s.floor,roomIndex:s.roomIndex,name:e.name,mechanic:e.mechanic,turn:e.turns,values:r.values,qualifies,main:r.main,total:r.total,retaliation:r.retaliation,killed:r.killed,enemyShield:e.shield,playerHp:s.player.hp});
  }
 }});
 report.natural.push({label,seed,completed:result.completed,floor:result.s.floor,phase:result.s.phase,deaths:result.deaths,rolls:result.rolls,entries,taggedSettlements:rolls});
 if(!result.completed)saveSnapshot(`${label}-seed-${seed}-incomplete`,result.s,version,'Unchanged policy terminal; retained as a failure, never replaced with another seed.');
}
report.naturalCoverage=[...coverage].sort();assert.deepEqual(report.naturalCoverage,[...targets].sort(),'Both new variants must actually appear under the fixed policy.');
report.notes.push('Fair independent probabilities are mathematical references. Actual luck and same-face guidance alter the distribution.');
report.notes.push('A changed new-game trajectory is expected after a newly tagged encounter. Only the explicit unmarked pending-state comparison claims full old/new identity.');
report.notes.push('Natural settlement logs and first snapshots establish reachability. Controlled tests separately cover rare all-distinct failures, one-die impossibility, retry and subsequent-wave creation.');
report.notes.push('forecast:false skips an observational damage-range query only. It does not change runAdventure actions; these runs make no forecast or performance claim.');
assert.deepEqual(sourceHashes(),before,'Runtime sources changed during the audit.');report.sourceStable=true;report.finished=new Date().toISOString();
report.status='PASS';writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,status:report.status,legacy:report.legacy,natural:report.natural.map(({label,seed,completed,floor,deaths,rolls,entries,taggedSettlements})=>({label,seed,completed,floor,deaths,rolls,entries:entries.length,taggedSettlements:taggedSettlements.length})),coverage:report.naturalCoverage,snapshots:report.snapshots.map(s=>s.file)},null,2));
