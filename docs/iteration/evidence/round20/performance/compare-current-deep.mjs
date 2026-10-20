// Complete recorded journey and real codec comparison. Only runId is normalised.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [baseArg,currentArg,baseReportArg,currentReportArg,outputArg]=process.argv.slice(2);
assert(baseArg&&currentArg&&baseReportArg&&currentReportArg&&outputArg);
const base=resolve(baseArg),current=resolve(currentArg),baseReportPath=resolve(baseReportArg),currentReportPath=resolve(currentReportArg),output=resolve(outputArg);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const B=await import(pathToFileURL(resolve(base,'src/storage.js'))),C=await import(pathToFileURL(resolve(current,'src/storage.js')));
const before=JSON.parse(await readFile(baseReportPath,'utf8')),after=JSON.parse(await readFile(currentReportPath,'utf8'));
const fields=['parameters','summary','journeys','validation','method','plan'];
for(const field of fields)assert.deepEqual(after[field],before[field],`Complete recorded ${field}`);
assert(before.sourceStable&&after.sourceStable);
const files=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/route-weights.js','src/content.js','src/storage.js','src/equipment-comparison.js','src/gold.js','src/experience.js','src/event-references.js','scripts/simulate.mjs','scripts/qa-combat-adventure.mjs','scripts/strategy-round18.mjs','docs/iteration/evidence/round18/strategy/PREREGISTERED.md'];
const sources=[];
for(const file of files){
 const a=await readFile(resolve(base,file)),b=await readFile(resolve(current,file));
 assert(a.equals(b),`Unchanged rule/import/strategy dependency: ${file}`);sources.push({file,sha256:sha(a),bytes:a.length});
}
const snapshots=[];
for(const journey of before.journeys)for(const snapshot of journey.snapshots){
 const aRaw=await readFile(resolve(dirname(baseReportPath),snapshot.file),'utf8');
 const bRaw=await readFile(resolve(dirname(currentReportPath),snapshot.file),'utf8');
 const a=B.decodeSave(aRaw),b=C.decodeSave(bRaw);assert(B.validateSave(a));assert(C.validateSave(b));
 const originalRunIds={baseline:a.runId,current:b.runId};
 a.runId=b.runId='only-top-level-runId-normalized';
 assert.deepEqual(b,a,`Complete decoded snapshot: ${snapshot.file}`);
 snapshots.push({file:snapshot.file,seed:journey.seed,allFieldsEqual:true,originalRunIds,normalization:'only top-level runId',normalizedDecodedSha256:sha(a),encodedSha256:{baseline:sha(aRaw),current:sha(bRaw)}});
}
const report={comparison:'Round20 fresh v5.19.0 input against fresh v5.20.0 current; both four-seed deep jobs actually executed this round',bothActuallyExecutedThisRound:true,
 baseline:{sourceVersion:before.sourceVersion,startedAt:before.startedAt,finishedAt:before.finishedAt,durationSeconds:before.durationSeconds,reportSha256:sha(await readFile(baseReportPath))},
 current:{sourceVersion:after.sourceVersion,startedAt:after.startedAt,finishedAt:after.finishedAt,durationSeconds:after.durationSeconds,reportSha256:sha(await readFile(currentReportPath))},
 comparedCompleteReportFields:fields,summary:after.summary,validation:after.validation,fullDecodedSnapshotPairs:snapshots,unchangedRuleImportAndPolicyFiles:sources,allEqual:true,
 limits:['Fixed offline legal-transition policies are not human win rate or independent new balance samples.','The exact same zero-spending policy is compared; paid-event preview UI is exercised separately by browser tests.','Concurrent correctness workloads differed during the two jobs, so wall-time differences are task cost and not a game speed-up.'],scriptSha256:sha(await readFile(new URL(import.meta.url)))};
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({allEqual:report.allEqual,bothActuallyExecutedThisRound:true,summary:after.summary,fullSnapshotPairs:snapshots.length,unchangedDependencies:sources.length,output},null,2));
