// Strict comparison of the two fresh formal deep runs. The original 400-floor
// harness remains untouched. Any changed bandit state hash needs a complete
// natural-prefix state witness; no opaque hash or other field is discarded.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const [baseArg,currentArg,beforeArg,afterArg,outputArg,freezeArg]=process.argv.slice(2);
assert([baseArg,currentArg,beforeArg,afterArg,outputArg,freezeArg].every(Boolean),'Pass baseline, current, baseline report, current report, output, current source freeze.');
const [base,current,beforePath,afterPath,output,freezePath]=[baseArg,currentArg,beforeArg,afterArg,outputArg,freezeArg].map(value=>path.resolve(value));
assert.notEqual(base,current);assert.notEqual(beforePath,afterPath);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const before=await readJSON(beforePath),after=await readJSON(afterPath),freeze=await readJSON(freezePath);
const B=await import(pathToFileURL(path.join(base,'src/storage.js'))),C=await import(pathToFileURL(path.join(current,'src/storage.js')));
const OLD_NOTE='趁旅者停顿清点财物，前三击是夺回它的机会。';
const NEW_NOTE='趁旅者停顿清点财物，前两击是夺回它的机会。';
const ENEMY_NAME='截路金匪';
const oldTemplate=(await import(pathToFileURL(path.join(base,'src/encounters.js')))).EXTRA_ENEMIES.find(e=>e.mechanic==='bandit'&&e.variant===1);
const newTemplate=(await import(pathToFileURL(path.join(current,'src/encounters.js')))).EXTRA_ENEMIES.find(e=>e.mechanic==='bandit'&&e.variant===1);
assert.equal(oldTemplate.note,OLD_NOTE);assert.equal(newTemplate.note,NEW_NOTE);
const frozenByPath=new Map(freeze.files.map(row=>[row.path,row]));
assert.deepEqual(Object.keys(before).sort(),Object.keys(after).sort(),'No report field may appear or disappear silently.');
const runMetadataFields=['source','sourceVersion','sourceHashes','startedAt','finishedAt','durationSeconds'];
// Compare every other field, including policy/status/environment/limitations.
// Isolated-source identity and independent timing metadata are checked below.
const fields=Object.keys(before).filter(field=>!runMetadataFields.includes(field));
const differences=[];
function diff(a,b,at=[]){
  if(Object.is(a,b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
    const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
    for(const key of keys){
      if(!Object.hasOwn(a,key)||!Object.hasOwn(b,key)){differences.push({path:[...at,key].join('.'),before:a[key],after:b[key],missingSide:!Object.hasOwn(a,key)?'before':'after'});continue;}
      diff(a[key],b[key],[...at,key]);
    }
    return;
  }
  differences.push({path:at.join('.'),before:a,after:b});
}
for(const field of fields)diff(before[field],after[field],[field]);
await fs.writeFile(output+'.raw-differences.json',JSON.stringify({comparedFields:fields,differences},null,2)+'\n');
for(const row of differences)assert(/^journeys\.\d+\.attemptOpenings\.\d+\.stateSha256$/.test(row.path),`Unexpected full-report difference: ${row.path}`);
assert(before.sourceStable&&after.sourceStable);
const dependencies=[];
for(const [label,root,record] of [['baseline',base,before],['current',current,after]]){
  const pkg=await readJSON(path.join(root,'package.json'));
  assert.equal(record.source,root,`${label} recorded isolated source root`);
  assert.equal(pkg.version,record.sourceVersion,`${label} recorded product version`);
  assert(Number.isFinite(record.durationSeconds)&&record.durationSeconds>0,`${label} executed duration`);
  assert(Number.isFinite(Date.parse(record.startedAt))&&Number.isFinite(Date.parse(record.finishedAt))&&Date.parse(record.finishedAt)>=Date.parse(record.startedAt),`${label} actual execution interval`);
  for(const [relative,expected] of Object.entries(record.sourceHashes))assert.equal(sha(await fs.readFile(path.join(root,relative))),expected,`${label} formal dependency ${relative}`);
  assert.equal(sha(await fs.readFile(path.join(root,'scripts/strategy-round18.mjs'))),record.scriptSha256,`${label} exact formal strategy source`);
}
assert.deepEqual(Object.keys(before.sourceHashes).sort(),Object.keys(after.sourceHashes).sort(),'The exact original formal dependency inventory is preserved.');
for(const row of freeze.files)assert.equal(sha(await fs.readFile(path.join(current,row.path))),row.sha256,`Current frozen source ${row.path}`);
const oldFreeze=await readJSON(path.resolve(path.dirname(beforePath),'../rule-dependency-freeze.json'));
for(const row of oldFreeze.files){
  const a=await fs.readFile(path.join(base,row.path)),b=await fs.readFile(path.join(current,row.path));
  assert.equal(sha(a),row.sha256,`Baseline frozen rule source ${row.path}`);
  assert.equal(sha(b),frozenByPath.get(row.path)?.sha256,`Current frozen rule source ${row.path}`);
  dependencies.push({path:row.path,baselineSha256:sha(a),currentSha256:sha(b),byteIdentical:a.equals(b)});
}
const originalPolicy=await fs.readFile(path.join(base,'scripts/strategy-round18.mjs'),'utf8');
assert.equal(originalPolicy,await fs.readFile(path.join(current,'scripts/strategy-round18.mjs'),'utf8'),'Both formal jobs used the same original strategy source.');
assert.equal(await fs.readFile(path.join(base,'scripts/simulate.mjs'),'utf8'),await fs.readFile(path.join(current,'scripts/simulate.mjs'),'utf8'),'Both jobs use the same original decision simulator.');

const banditOpenings=[];
for(let j=0;j<before.journeys.length;j++)for(let i=0;i<before.journeys[j].attemptOpenings.length;i++){
  const opening=before.journeys[j].attemptOpenings[i];
  if(opening.enemyName!==ENEMY_NAME)continue;
  banditOpenings.push({journeyIndex:j,openingIndex:i,seed:before.journeys[j].seed,floor:opening.floor,roomIndex:opening.roomIndex});
}
assert.equal(banditOpenings.length,4,'Original four fixed journeys expose four qualified alternate-bandit openings.');
assert.equal(differences.length,banditOpenings.length,'Each authored note change has exactly one changed recorded opening hash.');

function replaceExactlyOnce(source,needle,replacement){
  assert.equal(source.split(needle).length-1,1,`Read-only prefix recipe anchor: ${needle}`);
  return source.replace(needle,replacement);
}
async function prefixWitness(label,root){
  const dir=path.join(path.dirname(output),'bandit-hash-witnesses',label);
  await fs.mkdir(dir,{recursive:true});
  const script=path.join(dir,'prefix-policy.mjs'),reportPath=path.join(dir,'report.json');
  let code=originalPolicy;
  code=replaceExactlyOnce(code,"const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');",`const root = ${JSON.stringify(root)};`);
  code=replaceExactlyOnce(code,'const floors = 400;','const floors = 32;');
  code=replaceExactlyOnce(code,'const journeys = [];','const journeys = [];\nconst qaBanditWitnesses = [];');
  const anchor='if (state.floor >= 30 && attemptOpenings.length < 12) {';
  code=replaceExactlyOnce(code,anchor,anchor+`\n            if(state.enemy.mechanic==='bandit'&&state.enemy.variant===1&&state.enemy.name===${JSON.stringify(ENEMY_NAME)})qaBanditWitnesses.push({seed,floor:state.floor,roomIndex:state.roomIndex,enemyName:state.enemy.name,stateSha256:fingerprint(state),raw:S.encodeSave(state)});`);
  code+=`\nawait writeFile(output+'.bandit-witnesses.json',JSON.stringify({method:'Unchanged original legal-action policy from newGame through floor32, with read-only state capture; this is a prefix witness, not another 400-floor run.',originalPolicySha256:${JSON.stringify(sha(originalPolicy))},changes:['Explicit source root for external QA copy','Fixed horizon400→32','Read-only capture at already-recorded alternate-bandit openings'],witnesses:qaBanditWitnesses},null,2)+'\\n');\n`;
  await fs.writeFile(script,code);
  const argv=[script,'--source',root,'--output',reportPath],started=new Date().toISOString(),clock=performance.now();
  const result=spawnSync(process.execPath,argv,{cwd:root,maxBuffer:8_000_000});
  await fs.writeFile(path.join(dir,'stdout.log'),result.stdout||'');await fs.writeFile(path.join(dir,'stderr.log'),result.stderr||'');
  const receipt={label,command:[process.execPath,...argv],started,finished:new Date().toISOString(),durationSeconds:(performance.now()-clock)/1000,exitCode:result.status,signal:result.signal,error:result.error?.message||null,originalPolicySha256:sha(originalPolicy),executedAdaptedScriptSha256:sha(code),formalHorizon:400,prefixHorizon:32,method:'Original natural action policy; short prefix and read-only capture only. Raw formal400 report remains unchanged.'};
  await fs.writeFile(path.join(dir,'run.json'),JSON.stringify(receipt,null,2)+'\n');
  assert.equal(result.status,0,`${label} original-policy prefix witness`);
  const data=await readJSON(reportPath+'.bandit-witnesses.json');
  assert.equal(data.witnesses.length,banditOpenings.length,`${label} all preregistered bandit witnesses captured`);
  return {dir,receipt,rows:data.witnesses};
}

const aPrefix=await prefixWitness('baseline',base),bPrefix=await prefixWitness('current',current);
const normalizedAfter=Object.fromEntries(fields.map(field=>[field,structuredClone(after[field])]));
const mappings=[];
for(const target of banditOpenings){
  const matching=row=>row.seed===target.seed&&row.floor===target.floor&&row.roomIndex===target.roomIndex&&row.enemyName===ENEMY_NAME;
  const aRows=aPrefix.rows.filter(matching),bRows=bPrefix.rows.filter(matching);
  assert.equal(aRows.length,1);assert.equal(bRows.length,1);
  const aRow=aRows[0],bRow=bRows[0],formalBefore=before.journeys[target.journeyIndex].attemptOpenings[target.openingIndex],formalAfter=after.journeys[target.journeyIndex].attemptOpenings[target.openingIndex];
  const a=B.decodeSave(aRow.raw),b=C.decodeSave(bRow.raw);assert(B.validateSave(a));assert(C.validateSave(b));
  const fingerprint=s=>sha({...s,runId:'date-normalized'});
  assert.equal(fingerprint(a),formalBefore.stateSha256,'Complete baseline prefix state reproduces formal400 recorded SHA.');
  assert.equal(fingerprint(b),formalAfter.stateSha256,'Complete current prefix state reproduces formal400 recorded SHA.');
  assert.equal(fingerprint(a),aRow.stateSha256);assert.equal(fingerprint(b),bRow.stateSha256);
  for(const s of [a,b]){assert.equal(s.enemy.mechanic,'bandit');assert.equal(s.enemy.variant,1);assert.equal(s.enemy.name,ENEMY_NAME);assert.equal(s.enemy.turns,0);}
  assert.equal(a.enemy.note,OLD_NOTE);assert.equal(b.enemy.note,NEW_NOTE);
  a.runId=b.runId='only-top-level-runId-normalized';
  const originalBeforeNote=a.enemy.note,originalAfterNote=b.enemy.note;
  b.enemy.note=OLD_NOTE;
  assert.deepEqual(b,a,'Every complete natural witness field except the single qualified authored note and top-level runId is equal.');
  const pointer=`journeys.${target.journeyIndex}.attemptOpenings.${target.openingIndex}.stateSha256`;
  assert(differences.some(row=>row.path===pointer&&row.before===formalBefore.stateSha256&&row.after===formalAfter.stateSha256),'Only an independently proven recorded hash mapping may be applied.');
  normalizedAfter.journeys[target.journeyIndex].attemptOpenings[target.openingIndex].stateSha256=formalBefore.stateSha256;
  mappings.push({...target,path:pointer,baselineStateSha256:formalBefore.stateSha256,currentStateSha256:formalAfter.stateSha256,baselineNote:originalBeforeNote,currentNote:originalAfterNote,onlyAuthoredNoteDiffers:true,fullFieldEqualityAfterExplicitAllowedDifference:true,baselineEncodedSha256:sha(aRow.raw),currentEncodedSha256:sha(bRow.raw),evidence:{baseline:path.relative(path.dirname(output),path.join(aPrefix.dir,'report.json.bandit-witnesses.json')),current:path.relative(path.dirname(output),path.join(bPrefix.dir,'report.json.bandit-witnesses.json'))}});
}
for(const field of fields)assert.deepEqual(normalizedAfter[field],before[field],`Complete formal report ${field}, with only independently proven qualified note hash mappings`);

const snapshotPairs=[];
for(const journey of before.journeys)for(const snapshot of journey.snapshots){
  const aRaw=await fs.readFile(path.join(path.dirname(beforePath),snapshot.file),'utf8'),bRaw=await fs.readFile(path.join(path.dirname(afterPath),snapshot.file),'utf8');
  const a=B.decodeSave(aRaw),b=C.decodeSave(bRaw);assert(B.validateSave(a));assert(C.validateSave(b));
  const originalRunIds={baseline:a.runId,current:b.runId};a.runId=b.runId='only-top-level-runId-normalized';
  assert.deepEqual(b,a,`Every actual retained snapshot field: ${snapshot.file}`);
  snapshotPairs.push({file:snapshot.file,seed:journey.seed,originalRunIds,normalization:'only top-level runId; no note or other field normalized in these retained snapshots',allFieldsEqual:true,normalizedDecodedSha256:sha(a),encodedSha256:{baseline:sha(aRaw),current:sha(bRaw)}});
}
const report={comparison:'Round21 fresh formal input and frozen-current 400-floor jobs',bothActuallyExecutedThisRound:true,
 baseline:{sourceVersion:before.sourceVersion,startedAt:before.startedAt,finishedAt:before.finishedAt,reportSha256:sha(await fs.readFile(beforePath))},
 current:{sourceVersion:after.sourceVersion,startedAt:after.startedAt,finishedAt:after.finishedAt,reportSha256:sha(await fs.readFile(afterPath)),frozenScopeSha256:freeze.scopeSha256},
 comparedFullReportFields:fields,rawReportDifferences:differences,allowedQualifiedNoteHashMappings:mappings,allOtherReportFieldsExactlyEqual:true,snapshotPairs,ruleSourceFiles:dependencies,summary:after.summary,validation:after.validation,
 separatelyValidatedRunMetadata:{fields:runMetadataFields,reason:'Paths, product versions and source hashes identify the two isolated inputs and are verified against actual files. Independent run timestamps and task durations are retained without treating them as gameplay differences.',baseline:Object.fromEntries(runMetadataFields.map(field=>[field,before[field]])),current:Object.fromEntries(runMetadataFields.map(field=>[field,after[field]]))},
 witnessMethod:'Two fresh32-floor prefixes of the exact original strategy with read-only capture. Each full state reproduces the corresponding unmodified400-floor report hash. Only enemy.note on mechanic=bandit,variant=1,name=截路金匪 changes the exact authored string; every other complete field is compared.',
 limitations:['Four fixed offline seeds are not human win rates.','Task durations are not performance comparisons.','Original historical failed policies remain inherited records and are not rerun here.','Prefix witness runs are separate from formal400-floor counts.'],passed:true};
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,qualifiedNoteMappings:mappings.length,snapshotPairs:snapshotPairs.length,allOtherReportFieldsExactlyEqual:true,summary:after.summary,output}));
