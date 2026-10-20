/**
 * Compare the unchanged round-13 natural audit across the round-16 UI change.
 *
 * Usage (all paths are required; relative paths resolve from the caller cwd):
 *   node scripts/compare-natural-round16.mjs \
 *     --baseline <baseline-natural.json> --current <current-natural.json> \
 *     --baseline-source <baseline-project> --current-source <current-project> \
 *     --output <paired-report.json>
 *
 * Optional: --baseline-save <baseline-incomplete-save.txt> and
 * --current-save <current-incomplete-save.txt> select the retained failure saves.
 * Otherwise, each save resolves from its recorded basename beside its report;
 * recorded absolute directories are never used. Reports and companion saves may
 * therefore be relocated together. Both recorded and actual paths are reported.
 * The reports must use the fixed four-seed policy, with one retained failure.
 * Exit 0 means strict paired equality with explicitly listed additive context;
 * exit 1 means a validation, report or actual source mismatch. This is not a
 * performance comparison or an estimate of player win probability.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const args=process.argv.slice(2),o={};assert.equal(args.length%2,0);
for(let i=0;i<args.length;i+=2){assert(['--baseline','--current','--baseline-source','--current-source','--output','--baseline-save','--current-save'].includes(args[i]));assert(!Object.hasOwn(o,args[i]));o[args[i]]=resolve(args[i+1]);}
for(const key of ['--baseline','--current','--baseline-source','--current-source','--output'])assert(o[key],key);
const sha=raw=>createHash('sha256').update(raw).digest('hex'),read=async path=>{const raw=await readFile(path);return {path,bytes:raw.length,sha256:sha(raw),value:JSON.parse(raw)};};
const [a,b]=await Promise.all([read(o['--baseline']),read(o['--current'])]);
const checks=[],metadataDifferences=[],contextAdditions=[],unexpectedDifferences=[],allowedMetadata=new Map(),allowedContexts=new Map();
const key=path=>JSON.stringify(path),name=path=>path.reduce((result,k)=>typeof k==='number'?result+`[${k}]`:result+(result?'.':'')+k,'');
const check=(label,passed,evidence)=>checks.push({label,passed:!!passed,...(evidence===undefined?{}:{evidence})});
const allow=(path,reason)=>allowedMetadata.set(key(path),{path:name(path),reason});
const coreFiles=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/route-weights.js','src/content.js','src/storage.js','src/equipment-comparison.js','scripts/simulate.mjs','scripts/qa-combat-adventure.mjs'];
const sources={};
for(const [label,report,root]of [['baseline',a,o['--baseline-source']],['current',b,o['--current-source']]]){
 const sourceHashes=Object.fromEntries(await Promise.all(coreFiles.map(async file=>[file,sha(await readFile(resolve(root,file)))])));
 const version=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version,scriptSha256=sha(await readFile(resolve(root,'scripts/audit-natural-multiseed-round13.mjs')));
 sources[label]={root,version,sourceHashes,scriptSha256};
 check(`${label}: reported source remained stable`,report.value.sourceStable===true);
 check(`${label}: all 13 recorded runtime hashes match the supplied source`,isDeepStrictEqual(sourceHashes,report.value.sourceHashes));
 check(`${label}: audit runner hash matches the actual script`,scriptSha256===report.value.scriptSha256);
 check(`${label}: product version matches the supplied package`,version===report.value.sourceVersion);
}
check('The unchanged natural audit script ran on both packages',sources.baseline.scriptSha256===sources.current.scriptSha256);
const changedCore=coreFiles.filter(file=>sources.baseline.sourceHashes[file]!==sources.current.sourceHashes[file]);
check('Only the declared comparison explanation module changed among natural-audit core files',isDeepStrictEqual(changedCore,['src/equipment-comparison.js']),changedCore);
check('Natural seeds, checkpoints and branch policy are identical',isDeepStrictEqual(a.value.parameters,b.value.parameters));
check('Natural and decision-branch summary statistics are identical',isDeepStrictEqual(a.value.summary,b.value.summary));
allow(['sourceVersion'],'Explicit release metadata, independently matched against both actual packages.');
allow(['durationSeconds'],'Execution duration is recorded metadata; this comparison makes no performance claim.');
allow(['sourceHashes','src/equipment-comparison.js'],'Declared read-only comparison-context implementation; both complete source hashes are independently verified.');

// Accept only individually enumerated new context objects at real, matching
// decision rows. The existing detail, score, item and combat evidence remain
// part of the strict recursive comparison; none of their fields is removed.
for(let ji=0;ji<b.value.journeys.length;ji++){
 const aj=a.value.journeys[ji],bj=b.value.journeys[ji];assert.equal(aj.seed,bj.seed);
 if(aj.incompleteSavePath!==bj.incompleteSavePath&&typeof aj.incompleteSavePath==='string'&&typeof bj.incompleteSavePath==='string')allow(['journeys',ji,'incompleteSavePath'],'External location of the retained failure save; both actual complete terminal states are decoded and compared below.');
 for(let si=0;si<bj.strata.length;si++)for(let di=0;di<bj.strata[si].decisions.length;di++){
  const ad=aj.strata[si]?.decisions[di],bd=bj.strata[si].decisions[di];assert(ad);
  for(let ri=0;ri<bd.rows.length;ri++){
   const ar=ad.rows[ri],br=bd.rows[ri];assert(ar);assert.equal(ar.id,br.id);
   if(!br.detail?.context)continue;
   const path=['journeys',ji,'strata',si,'decisions',di,'rows',ri,'detail','context'],context=br.detail.context;
   assert(ar.detail&&!Object.hasOwn(ar.detail,'context'),'Only a genuinely new detail.context may be classified as this additive presentation change.');
   assert.deepEqual(Object.keys(context).sort(),['count','unreachable','showVitals','before','after','hpLost','dead'].sort());
   for(const side of ['before','after']){assert.deepEqual(Object.keys(context[side]).sort(),['hp','maxHp','ward'].sort());assert(Object.values(context[side]).every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1e15));}
   const firstFight=br.fights[0]||br.unfinishedBattle;assert(firstFight?.firstRoll);
   assert.equal(context.count,firstFight.firstRoll.values.length);assert.equal(context.count,6);assert.deepEqual(context.unreachable,[]);
   assert.equal(context.before.hp,bd.openingHp);assert.equal(context.before.maxHp,bd.maxHp);
   assert.equal(context.hpLost,br.swapHpLoss);assert.equal(context.after.hp,bd.openingHp-br.swapHpLoss);
   const hpCore=br.score.core.find(row=>row.key==='maxHp');assert.equal(context.after.maxHp,hpCore?hpCore.after:bd.maxHp);
   assert.equal(context.before.ward,context.after.ward);assert.equal(context.dead,false);assert.equal(typeof context.showVitals,'boolean');
   allowedContexts.set(key(path),{path:name(path),seed:bj.seed,floor:bd.floor,roomIndex:bd.roomIndex,branch:br.id,item:br.item,addedValue:context,
    verifiedAgainst:'Opening HP/max HP, swap HP loss, displayed max-HP core change and first real combat-roll dice count already present in the strictly compared report. Current ward is required to remain unchanged across the quote.',
    limit:'These report summaries do not retain each complete decision-start state. Exact ward values are new presentation observations, not reconstructed historical facts; the complete gameplay fingerprints remain strictly compared.'});
  }
 }
}
let comparedNodes=0,equalLeafValues=0,comparedNumericLeaves=0,comparedRngLeaves=0;
function compare(left,right,path=[],leftPresent=true,rightPresent=true){
 comparedNodes++;
 if(!leftPresent||!rightPresent){
  const added=allowedContexts.get(key(path));
  if(!leftPresent&&rightPresent&&added&&isDeepStrictEqual(right,added.addedValue)){contextAdditions.push(added);return;}
  unexpectedDifferences.push({path:name(path),kind:'missing-field',leftPresent,rightPresent,before:left,after:right});return;
 }
 if(left!==null&&right!==null&&typeof left==='object'&&typeof right==='object'&&Array.isArray(left)===Array.isArray(right)){
  if(Array.isArray(left)){
   if(left.length!==right.length)unexpectedDifferences.push({path:name(path)+'.length',kind:'array-length',before:left.length,after:right.length});
   for(let i=0;i<Math.max(left.length,right.length);i++)compare(left[i],right[i],[...path,i],i<left.length,i<right.length);
  }else for(const k of new Set([...Object.keys(left),...Object.keys(right)]))compare(left[k],right[k],[...path,k],Object.hasOwn(left,k),Object.hasOwn(right,k));
  return;
 }
 if(typeof left==='number'&&typeof right==='number'&&!allowedMetadata.has(key(path)))comparedNumericLeaves++;
 if(/rng$/i.test(String(path.at(-1))))comparedRngLeaves++;
 if(isDeepStrictEqual(left,right)){equalLeafValues++;return;}
 const metadata=allowedMetadata.get(key(path));
 if(metadata){metadataDifferences.push({...metadata,before:left,after:right});return;}
 unexpectedDifferences.push({path:name(path),kind:/sha256$/i.test(String(path.at(-1)))?'strict-fingerprint':typeof left==='number'||typeof right==='number'?'numeric-or-rng':'behavior-or-structure',before:left,after:right});
}
compare(a.value,b.value);
check('Every report field matches except the exact declared metadata and six new read-only context objects',unexpectedDifferences.length===0,{unexpectedDifferences:unexpectedDifferences.length,contextAdditions:contextAdditions.length});
check('Exactly the six observed comparison rows received additive context objects',contextAdditions.length===6&&contextAdditions.length===allowedContexts.size);
const journeyEvidence=b.value.journeys.map((j,i)=>({seed:j.seed,completed:j.completed,lastFloor:j.lastFloor,finishReason:j.finishReason,rolls:j.rolls,deaths:j.deaths,level:j.level,gold:j.gold,
 finalStateSha256:j.finalStateSha256,encounterTraceSha256:j.encounterTraceSha256,floorCheckpointTraceSha256:j.floorCheckpointTraceSha256,
 identical:["finalStateSha256","encounterTraceSha256","floorCheckpointTraceSha256"].every(k=>j[k]===a.value.journeys[i][k])}));
check('All four full-state, encounter and floor-checkpoint fingerprints are identical',journeyEvidence.every(j=>j.identical),journeyEvidence);
check('All committed free-decision branch-state fingerprints are identical',a.value.validation.completeBranchStatesSha256===b.value.validation.completeBranchStatesSha256);
check('The original floor-30 bounded-policy failure remains intact',b.value.summary.completedJourneys===3&&isDeepStrictEqual(b.value.summary.incompleteJourneys,[{seed:23757,lastFloor:30,endingPhase:'dead',finishReason:'DEATH_RETRY_LIMIT',rolls:821}])&&b.value.summary.naturalDeaths===21);

const storageA=await import(pathToFileURL(resolve(o['--baseline-source'],'src/storage.js'))),storageB=await import(pathToFileURL(resolve(o['--current-source'],'src/storage.js'))),terminal=[];
assert.equal(a.value.journeys.filter(j=>j.incompleteSavePath).length,1,'The fixed-policy baseline must retain exactly one failure save.');
assert.equal(b.value.journeys.filter(j=>j.incompleteSavePath).length,1,'The fixed-policy current report must retain exactly one failure save.');
function resolveFailureSave(report,journey,override){
 assert.equal(typeof journey.incompleteSavePath,'string');
 const recordedBasename=basename(journey.incompleteSavePath);
 assert(recordedBasename.endsWith(`.seed-${journey.seed}.incomplete-save.txt`),'The recorded companion name must identify the corresponding seed.');
 return {path:override||resolve(dirname(report.path),recordedBasename),recordedPath:journey.incompleteSavePath,
  resolution:override?'explicit CLI save path':'recorded basename beside supplied report; recorded directory is not accessed'};
}
for(let i=0;i<b.value.journeys.length;i++){
 const aj=a.value.journeys[i],bj=b.value.journeys[i];if(!bj.incompleteSavePath)continue;
 const savedA=resolveFailureSave(a,aj,o['--baseline-save']),savedB=resolveFailureSave(b,bj,o['--current-save']),ap=savedA.path,bp=savedB.path;
 const [rawA,rawB]=await Promise.all([readFile(ap,'utf8'),readFile(bp,'utf8')]),stateA=storageA.decodeSave(rawA),stateB=storageB.decodeSave(rawB);
 const {runId:runIdA,...restA}=stateA,{runId:runIdB,...restB}=stateB;
 assert(new RegExp(`^${bj.seed}-\\d+$`).test(runIdA)&&new RegExp(`^${bj.seed}-\\d+$`).test(runIdB));
 const completeEqual=isDeepStrictEqual(restA,restB),fingerprint=s=>sha(JSON.stringify({...s,runId:'date-normalized'}));
 check(`Seed ${bj.seed}: every complete failure-state field except independently listed new-game runId matches`,completeEqual);
 check(`Seed ${bj.seed}: both actual failure-state fingerprints match the natural reports`,fingerprint(stateA)===aj.finalStateSha256&&fingerprint(stateB)===bj.finalStateSha256);
 for(const runtime of [storageA,storageB])for(const state of [stateA,stateB])assert.deepEqual(runtime.decodeSave(runtime.encodeSave(state)),state);
 terminal.push({seed:bj.seed,baseline:{...savedA,bytes:Buffer.byteLength(rawA),sha256:sha(rawA)},current:{...savedB,bytes:Buffer.byteLength(rawB),sha256:sha(rawB)},completeEqualApartFromRunId:completeEqual,
  explicitMetadataDifference:{path:'runId',baseline:runIdA,current:runIdB,reason:'newGame includes Date.now(); only this identified metadata string differs. No numeric, RNG, gameplay, unknown, reward or history field is excluded.'},endingRng:stateB.rng,phase:stateB.phase,floor:stateB.floor,hp:stateB.player.hp,enemyTurns:stateB.enemy.turns,completeCodecRoundTrips:4});
}
const passed=checks.every(row=>row.passed),report={audit:'round16-strict-natural-report-comparison',status:passed?'PASS_WITH_EXPLICIT_ADDITIVE_PRESENTATION_CONTEXT':'FAIL',created:new Date().toISOString(),
 inputs:{baseline:{path:a.path,bytes:a.bytes,sha256:a.sha256},current:{path:b.path,bytes:b.bytes,sha256:b.sha256}},sources,
 method:'Recursive comparison of every old report field; only individually recorded release metadata, execution duration, output path and declared comparison source hash may differ. Six precisely located new detail.context objects are stored verbatim and checked against existing natural decision evidence. No entire detail, mechanics array, combat record, numeric field or fingerprint is dropped.',
 compared:{nodes:comparedNodes,equalLeafValues,numericLeaves:comparedNumericLeaves,rngLeaves:comparedRngLeaves},checks,metadataDifferences,contextAdditions,unexpectedDifferences,journeyEvidence,terminal,
 limitations:['The natural auditor deliberately normalizes only runId when it computes its persisted full-state fingerprints. All of those fingerprints are compared exactly here.','Complete terminal objects are retained only for the bounded-policy failure; successful journey finals and most decision starts are represented by their unchanged hashes and report evidence.','This comparison does not turn 3/4 completions into a representative human win rate and does not remove the failed floor-30 sample.']};
await mkdir(dirname(o['--output']),{recursive:true});await writeFile(o['--output'],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:o['--output'],status:report.status,checks:checks.length,compared:report.compared,metadataDifferences:metadataDifferences.length,contextAdditions:contextAdditions.length,unexpectedDifferences:unexpectedDifferences.length,terminalComparisons:terminal.length}));
if(!passed)process.exitCode=1;
