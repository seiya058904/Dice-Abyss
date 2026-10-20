// Compare complete Round14 gameplay records, including every failed branch.
// Inputs are reports emitted by the natural and defeat-options audit scripts.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const args=process.argv.slice(2),options={};
assert.equal(args.length%2,0,'Arguments use --name value pairs.');
for(let i=0;i<args.length;i+=2){assert(args[i].startsWith('--'));options[args[i].slice(2)]=args[i+1];}
for(const key of ['natural-baseline','natural-current','options-baseline','options-current','output'])assert(options[key],`Missing --${key}`);
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(options.output),rel=relative(project,output);
assert(rel.startsWith('..'+sep)||isAbsolute(rel),'Write the comparison outside the project. Existing files are never overwritten.');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
async function read(key){const path=resolve(options[key]),raw=await readFile(path);return{path,bytes:raw.length,sha256:sha(raw),value:JSON.parse(raw)};}
const nb=await read('natural-baseline'),nc=await read('natural-current'),ob=await read('options-baseline'),oc=await read('options-current');
const checks=[];
function check(label,left,right){checks.push({label,passed:isDeepStrictEqual(left,right)});}
function normalizeNatural(value){const out=structuredClone(value);delete out.sourceVersion;delete out.durationSeconds;for(const journey of out.journeys)delete journey.incompleteSavePath;return out;}
function normalizeOptions(value){const out=structuredClone(value);delete out.source;delete out.sourceVersion;return out;}
check('Complete natural reports after only declared metadata exclusions',normalizeNatural(nb.value),normalizeNatural(nc.value));
check('Complete 215-branch reports after only source identity exclusions',normalizeOptions(ob.value),normalizeOptions(oc.value));
for(const [name,record] of [['natural baseline',nb],['natural current',nc],['options baseline',ob],['options current',oc]])check(`${name} observed source stability`,record.value.sourceStable,true);
check('All 13 natural source hashes',nb.value.sourceHashes,nc.value.sourceHashes);
check('All 11 defeat-options source hashes',ob.value.sourceHashes,oc.value.sourceHashes);
check('Both naturally failed seed identities',nb.value.summary.incompleteJourneys,nc.value.summary.incompleteJourneys);
const terminalFingerprint=sha(JSON.stringify({...ob.value.terminal,runId:'date-normalized'}));
for(const record of [nb,nc])check(`Original terminal matches ${record.value.sourceVersion} natural failure fingerprint`,terminalFingerprint,record.value.journeys.find(x=>x.seed===23757)?.finalStateSha256);
check('Every one of the 215 same-terminal branches retained',ob.value.rows.length,215);
check('All same-terminal outcomes accounted for',ob.value.summary.wins+ob.value.summary.deaths+ob.value.summary.budgetExhaustions,ob.value.rows.length);
const identity=record=>({file:basename(record.path),bytes:record.bytes,sha256:record.sha256,sourceVersion:record.value.sourceVersion,scriptSha256:record.value.scriptSha256,sourceHashes:record.value.sourceHashes});
const report={
 audit:'Dice Abyss Round14 complete gameplay A/B comparison',
 created:new Date().toISOString(),
 scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),
 method:{
  natural:'Deep equality of the complete reports after excluding only root sourceVersion, durationSeconds and each journey incompleteSavePath. The source hashes, method, rules, parameters, validation including full adapter details, conditional detail/hint, summaries, every journey and every retained branch remain compared.',
  naturalStateHashes:'The original natural audit replaces only runId with date-normalized when calculating state fingerprints. Full codec round trips compare the original unnormalized complete states.',
  options:'Deep equality of the entire reports after excluding only root source and sourceVersion. All 215 rows, full original terminal, every action, full lastRoll trace, original scores/details/hints and available full ending states remain compared.',
  independence:'Four fixed-seed natural journeys are independent seed starts. Checkpoints are prefixes. The 215 exhaustive single-item/slot choices share one original dead terminal and are post-hoc diagnostic branches, not another 215 natural journeys or a general win rate.',
  performance:'Durations are execution records only. The natural audits were not run as an isolated timing experiment and no speed claim is made.'
 },
 inputs:{naturalBaseline:identity(nb),naturalCurrent:identity(nc),optionsBaseline:identity(ob),optionsCurrent:identity(oc)},
 natural:{status:nb.value.status,exitCodes:{baseline:2,current:2},summary:nb.value.summary,validation:nb.value.validation,terminalFingerprint,journeys:nb.value.journeys.map(j=>({seed:j.seed,completed:j.completed,completedFloors:j.completedFloors,lastFloor:j.lastFloor,endingPhase:j.endingPhase,finishReason:j.finishReason,rolls:j.rolls,deaths:j.deaths,finalStateSha256:j.finalStateSha256,encounterTraceSha256:j.encounterTraceSha256,floorCheckpointTraceSha256:j.floorCheckpointTraceSha256})),durationsSeconds:{baseline:nb.value.durationSeconds,current:nc.value.durationSeconds}},
 options:{summary:ob.value.summary,inputSha256:ob.value.inputSha256,terminalFingerprint,winners:ob.value.rows.filter(r=>r.finishReason==='ENEMY_DEFEATED').map(r=>({id:r.id,item:r.item,slot:r.slot,rolls:r.rolls,spent:r.spent,ending:r.ending}))},
 checks,
 status:checks.every(x=>x.passed)?'PASS_COMPLETE_GAMEPLAY_EQUALITY_WITH_ORIGINAL_FAILURE':'FAIL_GAMEPLAY_COMPARISON'
};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,checks:checks.length,failed:checks.filter(x=>!x.passed),natural:report.natural.summary,options:report.options.summary,output}));
if(checks.some(x=>!x.passed))process.exitCode=1;
