// Compare complete recorded journeys and actual codec snapshots.
// Explicit mode prevents inherited evidence being labelled a fresh second run.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [mode,baseArg,currentArg,baseReportArg,currentReportArg,outputArg] = process.argv.slice(2);
assert(['fresh','historical'].includes(mode) && baseArg && currentArg && baseReportArg && currentReportArg && outputArg,
  'Pass fresh|historical, base source, current source, base report, current report, output.');
const base=resolve(baseArg),current=resolve(currentArg),baseReportPath=resolve(baseReportArg),currentReportPath=resolve(currentReportArg),output=resolve(outputArg);
assert.notEqual(baseReportPath,currentReportPath,'Compare two separate actual records.');
if(mode==='fresh')assert.notEqual(base,current,'Fresh A/B uses isolated source trees.');
const sha=data=>createHash('sha256').update(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data)).digest('hex');
const B=await import(pathToFileURL(resolve(base,'src/storage.js'))),C=await import(pathToFileURL(resolve(current,'src/storage.js')));
const before=JSON.parse(await readFile(baseReportPath,'utf8')),after=JSON.parse(await readFile(currentReportPath,'utf8'));
const fields=['parameters','summary','journeys','validation','method','plan'];
for(const field of fields)assert.deepEqual(after[field],before[field],`Complete recorded ${field}`);
assert(before.sourceStable&&after.sourceStable);
assert.deepEqual(before.sourceHashes,after.sourceHashes,'Recorded rule source fingerprints');
assert.equal(before.scriptSha256,after.scriptSha256,'Exact deep policy harness');
const frozen=JSON.parse(await readFile(new URL('./rule-dependency-freeze.json',import.meta.url),'utf8'));
const dependencies=[];
for(const row of frozen.files){
  const a=await readFile(resolve(base,row.path)),b=await readFile(resolve(current,row.path));
  assert.equal(sha(a),row.sha256,`Frozen baseline dependency ${row.path}`);
  assert(a.equals(b),`Current dependency ${row.path}`);
  dependencies.push({path:row.path,bytes:a.length,sha256:sha(a)});
}
const pairs=[];
for(const journey of before.journeys)for(const snapshot of journey.snapshots){
  const aRaw=await readFile(resolve(dirname(baseReportPath),snapshot.file),'utf8');
  const bRaw=await readFile(resolve(dirname(currentReportPath),snapshot.file),'utf8');
  const a=B.decodeSave(aRaw),b=C.decodeSave(bRaw);
  assert(B.validateSave(a));assert(C.validateSave(b));
  const originalRunIds={baseline:a.runId,current:b.runId};
  a.runId=b.runId='only-top-level-runId-normalized';
  assert.deepEqual(a,b,`Complete snapshot ${snapshot.file}`);
  pairs.push({file:snapshot.file,seed:journey.seed,originalRunIds,normalization:'only top-level runId',allFieldsEqual:true,normalizedDecodedSha256:sha(a),encodedSha256:{baseline:sha(aRaw),current:sha(bRaw)}});
}
const report={mode,comparison:mode==='fresh'?'Fresh Round21 input and current executions':'Fresh Round21 baseline compared with inherited Round20 record',bothActuallyExecutedThisRound:mode==='fresh',historicalInput:mode==='historical',
  baseline:{sourceVersion:before.sourceVersion,startedAt:before.startedAt,finishedAt:before.finishedAt,reportSha256:sha(await readFile(baseReportPath))},
  current:{sourceVersion:after.sourceVersion,startedAt:after.startedAt,finishedAt:after.finishedAt,reportSha256:sha(await readFile(currentReportPath))},
  comparedCompleteReportFields:fields,summary:after.summary,validation:after.validation,snapshotPairs:pairs,unchangedRuleImportPolicyFiles:dependencies,allEqual:true,
  limits:['Four fixed offline policies are not human win rates.','Only top-level runId is normalized in actual decoded saves; every other field is compared.','Wall duration is not compared as game performance.','Historical failed policies remain inherited evidence, not fresh executions in this job.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode,allEqual:true,snapshotPairs:pairs.length,dependencies:dependencies.length,summary:after.summary,output}));
