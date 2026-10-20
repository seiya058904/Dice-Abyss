// Read-only comparison of the new Round15 natural run with the explicitly
// reused, source-verified natural report carried by the Round14 input package.
// This script does not run the simulator or infer missing full-state evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const args=process.argv.slice(2),options={};
assert.equal(args.length%2,0,'Arguments use --name value pairs.');
for(let i=0;i<args.length;i+=2){assert(args[i].startsWith('--'));assert(!Object.hasOwn(options,args[i].slice(2)),'Do not repeat arguments.');options[args[i].slice(2)]=args[i+1];}
for(const key of ['baseline','current','baseline-source','current-source','output'])assert(options[key],`Missing --${key}`);
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(options.output),outRelative=relative(project,output);
assert(outRelative.startsWith('..'+sep)||isAbsolute(outRelative),'Write the comparison outside the project.');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const coreFiles=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/route-weights.js','src/content.js','src/storage.js','src/equipment-comparison.js','scripts/simulate.mjs','scripts/qa-combat-adventure.mjs'];
const auditFile='scripts/audit-natural-multiseed-round13.mjs';
const changedCoreFiles=new Set(['src/engine.js','src/deep-rules.js']);
async function readReport(key){
 const path=resolve(options[key]),raw=await readFile(path),value=JSON.parse(raw);
 assert(value&&typeof value==='object'&&!Array.isArray(value),`${key}: expected a report object`);
 return {path,bytes:raw.length,sha256:hash(raw),value};
}
const [baseline,current]=await Promise.all([readReport('baseline'),readReport('current')]);
async function inspectSource(key,record){
 const root=resolve(options[key]),actual=Object.fromEntries(await Promise.all(coreFiles.map(async file=>[file,hash(await readFile(resolve(root,file)))])));
 return {root,sourceHashes:actual,auditScriptSha256:hash(await readFile(resolve(root,auditFile))),version:JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version,
  reportedSourceStable:record.value.sourceStable,reportedSourceHashes:record.value.sourceHashes,reportedAuditScriptSha256:record.value.scriptSha256,reportedVersion:record.value.sourceVersion};
}
const [baselineSource,currentSource]=await Promise.all([inspectSource('baseline-source',baseline),inspectSource('current-source',current)]);
const checks=[];
function check(label,passed,evidence){checks.push({label,passed:!!passed,...(evidence===undefined?{}:{evidence})});}
for(const [label,source]of [['historical baseline',baselineSource],['new current run',currentSource]]){
 check(`${label}: source was stable during the recorded run`,source.reportedSourceStable===true);
 check(`${label}: exact expected 13 core paths`,isDeepStrictEqual(Object.keys(source.reportedSourceHashes||{}).sort(),[...coreFiles].sort()));
 check(`${label}: all 13 recorded hashes match the supplied source`,isDeepStrictEqual(source.reportedSourceHashes,source.sourceHashes));
 check(`${label}: recorded audit script matches the supplied source`,source.reportedAuditScriptSha256===source.auditScriptSha256);
 check(`${label}: reported product version matches the supplied source`,source.reportedVersion===source.version);
}
check('Both runs used the same unchanged natural audit script',baselineSource.auditScriptSha256===currentSource.auditScriptSha256);
check('The 11 other core files remain identical',coreFiles.filter(file=>!changedCoreFiles.has(file)).every(file=>baselineSource.sourceHashes[file]===currentSource.sourceHashes[file]));
check('Parameters, seeds and 200/400 checkpoints are identical',isDeepStrictEqual(baseline.value.parameters,current.value.parameters));
check('Every summary field is identical',isDeepStrictEqual(baseline.value.summary,current.value.summary));

const pathKey=path=>JSON.stringify(path);
const pathName=path=>path.reduce((name,key)=>typeof key==='number'?`${name}[${key}]`:/^[A-Za-z_$][\w$]*$/.test(key)?`${name}${name?'.':''}${key}`:`${name}[${JSON.stringify(key)}]`,'');
const allowedMetadata=new Map();
function allow(path,reason){allowedMetadata.set(pathKey(path),{path:pathName(path),reason});}
allow(['sourceVersion'],'Explicit product release identity; both recorded versions are independently checked against their supplied source packages.');
allow(['durationSeconds'],'Recorded execution duration is metadata; this comparison makes no speed claim.');
// The shipped natural auditor currently has no root source field. Support it
// only if both reports explicitly carry string source-directory identities.
if(typeof baseline.value.source==='string'&&typeof current.value.source==='string')allow(['source'],'Explicit source-directory identity, not a gameplay field.');
for(const file of changedCoreFiles)allow(['sourceHashes',file],'Declared Round15 runtime change; each recorded hash must independently match its supplied source. All other source hashes are strictly compared.');
const bJourneys=baseline.value.journeys,cJourneys=current.value.journeys;
if(Array.isArray(bJourneys)&&Array.isArray(cJourneys))for(let i=0;i<Math.min(bJourneys.length,cJourneys.length);i++){
 if(bJourneys[i]?.seed===cJourneys[i]?.seed&&typeof bJourneys[i]?.incompleteSavePath==='string'&&typeof cJourneys[i]?.incompleteSavePath==='string'){
  allow(['journeys',i,'incompleteSavePath'],'External output path of the same seed’s retained incomplete save. The seed, result, full-state fingerprint and every behavioral field are still compared.');
 }
}

const excludedMetadata=[],mechanicCorrections=[],differences=[];
let comparedNodes=0,identicalLeafValues=0,rngValues=0,numericValues=0;
const recoveryChanges=new Map([
 ['六点回生 · 已触发','六点回生 · 未生效（本掷未存活）'],
 ['合鸣归息 · 已触发','合鸣归息 · 未生效（本掷未存活）'],
]);
function fatalContext(ancestors){
 for(let i=ancestors.length-1;i>=0;i--){
  const {value,path}=ancestors[i];
  if(value&&typeof value==='object'&&!Array.isArray(value)&&value.phase==='dead'&&(value.playerHp===0||value.player?.hp===0)){
   return {path:pathName(path),phase:value.phase,hp:value.playerHp===0?value.playerHp:value.player.hp};
  }
 }
 return null;
}
const recordValue=(present,value)=>present?{present:true,value}:{present:false};
function compare(left,right,path=[],leftAncestors=[],rightAncestors=[],leftPresent=true,rightPresent=true){
 comparedNodes++;
 if(!leftPresent||!rightPresent){differences.push({path:pathName(path),kind:'missing-field',before:recordValue(leftPresent,left),after:recordValue(rightPresent,right)});return;}
 const objects=left!==null&&right!==null&&typeof left==='object'&&typeof right==='object';
 if(objects&&Array.isArray(left)===Array.isArray(right)){
  if(Array.isArray(left)){
   if(left.length!==right.length)differences.push({path:pathName(path)+'.length',kind:'array-length',before:left.length,after:right.length});
   for(let i=0;i<Math.max(left.length,right.length);i++)compare(left[i],right[i],[...path,i],[...leftAncestors,{value:left,path}],[...rightAncestors,{value:right,path}],i<left.length,i<right.length);
  }else{
   const keys=new Set([...Object.keys(left),...Object.keys(right)]);
   for(const key of keys)compare(left[key],right[key],[...path,key],[...leftAncestors,{value:left,path}],[...rightAncestors,{value:right,path}],Object.hasOwn(left,key),Object.hasOwn(right,key));
  }
  return;
 }
 const lastKey=String(path.at(-1)||'');
 if(typeof left==='number'&&typeof right==='number'&&!allowedMetadata.has(pathKey(path)))numericValues++;
 if(/rng$/i.test(lastKey))rngValues++;
 if(isDeepStrictEqual(left,right)){identicalLeafValues++;return;}
 const metadata=allowedMetadata.get(pathKey(path));
 if(metadata){excludedMetadata.push({...metadata,before:left,after:right});return;}
 if(path.at(-2)==='mechanics'&&typeof path.at(-1)==='number'&&recoveryChanges.get(left)===right){
  const before=fatalContext(leftAncestors),after=fatalContext(rightAncestors);
  if(before&&after&&isDeepStrictEqual(before,after)){
   mechanicCorrections.push({path:pathName(path),before:left,after:right,deathEvidence:before,reason:'This exact recovery description was generated before retaliation in Round14. The retained record explicitly shows death and zero HP in both reports, so the Round15 description correctly states that survival-gated recovery did not apply.'});return;
  }
  differences.push({path:pathName(path),kind:'unverified-recovery-description',before:left,after:right,reason:'The strings match the intended correction, but this report contains no matching explicit dead/zero-HP ancestor. It is not waived without full-state evidence.'});return;
 }
 const fingerprint=/^(?:finalStateSha256|openingStateSha256|stateSha256|completeBranchStatesSha256|encounterTraceSha256|floorCheckpointTraceSha256)$/.test(lastKey);
 differences.push({path:pathName(path),kind:fingerprint?'unexplained-fingerprint':typeof left==='number'||typeof right==='number'?'numeric-or-rng':'behavior-or-structure',before:left,after:right,
  ...(fingerprint?{reason:'A fingerprint is not a full state. It remains a strict difference; a known description fix does not prove that no other hidden state field changed.'}:{})});
}
compare(baseline.value,current.value);
const numericDifferences=differences.filter(row=>row.kind==='numeric-or-rng');
const rngDifferences=differences.filter(row=>/(?:Rng|rng)(?:\]|$)/.test(row.path));
const unexplainedFingerprints=differences.filter(row=>row.kind==='unexplained-fingerprint');
check('Every behavioral numeric value is identical (explicit metadata exclusions are listed separately)',numericDifferences.length===0,{numericValues,reportedRngValues:rngValues,differences:numericDifferences});
check('Every reported RNG field is identical',rngDifferences.length===0,{reportedRngValues:rngValues,differences:rngDifferences});
check('Every retained state and trace fingerprint is identical',unexplainedFingerprints.length===0,{differences:unexplainedFingerprints});
check('All remaining report fields match, except individually evidenced fatal-recovery descriptions',differences.length===0);
// No simulation is performed. A second filesystem read only detects a source
// change during this short comparison; it is not a substitute for run stability.
for(const [label,source]of [['baseline',baselineSource],['current',currentSource]]){
 const after=Object.fromEntries(await Promise.all(coreFiles.map(async file=>[file,hash(await readFile(resolve(source.root,file)))])));
 check(`${label}: source remained stable during comparison`,isDeepStrictEqual(after,source.sourceHashes));
}
const passed=checks.every(row=>row.passed),status=passed?(mechanicCorrections.length?'PASS_WITH_INDIVIDUALLY_EVIDENCED_RECOVERY_COPY_CHANGES':'PASS_COMPLETE_BEHAVIOR_EQUALITY'):unexplainedFingerprints.length?'NEEDS_FULL_STATE_EVIDENCE':'FAIL_NATURAL_COMPARISON';
const identity=record=>({path:record.path,bytes:record.bytes,sha256:record.sha256,sourceVersion:record.value.sourceVersion,scriptSha256:record.value.scriptSha256});
const report={audit:'round15-natural-results-against-verified-historical-input',status,created:new Date().toISOString(),scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),
 method:{baseline:'The baseline is a historical run carried in the Round14 input package. All 13 core hashes and the audit script are rechecked against the supplied untouched input source. This script does not describe that run as newly executed.',current:'The current report must come from the actual Round15 four-seed execution; this comparator never launches or fabricates it.',comparison:'Recursively compare every report field. Exclude only the individually listed changed metadata paths. Recovery text is accepted only for the two exact declared replacements under matching explicit dead/zero-HP records. Never drop mechanics arrays, lastRoll, numeric fields or fingerprints.',checkpoints:'Four seed starts; checkpoint 200 is a prefix of each same journey to 400, not four more independent journeys.',timing:'Historical and current durations are provenance only and are not used to claim performance gains.'},
 inputs:{baseline:identity(baseline),current:identity(current)},sourceVerification:{baseline:baselineSource,current:currentSource},
 allowedMetadataPaths:[...allowedMetadata.values()],excludedMetadata,mechanicCorrections,
 compared:{nodes:comparedNodes,identicalLeafValues,numericValues,reportedRngValues:rngValues},
 summary:{baseline:baseline.value.summary,current:current.value.summary},checks,differences,
 limitations:['These reports contain fingerprints and summaries for many complete states, not those complete states themselves. Equal fingerprints are compared exactly, but a differing fingerprint cannot be explained away by a known code change.',
  'If the retained reports omit the complete corresponding state or explicit death context, obtain/replay that evidence separately before accepting a difference. This script records the limitation and fails instead of inventing a full-state comparison.',
  'The natural four-seed policy is deliberately constrained. Its completion count is not a representative human win rate or evidence of an optimal build.',
  'Reusing a source-verified historical baseline saves repeat work; it does not create another newly measured baseline run.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,status,checks:checks.length,failed:checks.filter(row=>!row.passed).map(row=>row.label),excludedMetadata:excludedMetadata.length,mechanicCorrections:mechanicCorrections.length,unexplainedDifferences:differences.length,unexplainedFingerprints:unexplainedFingerprints.length}));
if(!passed)process.exitCode=1;
