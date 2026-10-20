import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const [firstArg,reusedArg,outputArg]=process.argv.slice(2);
assert(firstArg&&reusedArg&&outputArg,'Supply FIRST_CPU_JSON REUSED_CPU_JSON OUTPUT_JSON');
const sha=value=>createHash('sha256').update(value).digest('hex');
const firstPath=resolve(firstArg),reusedPath=resolve(reusedArg),output=resolve(outputArg);
const firstRaw=await readFile(firstPath),reusedRaw=await readFile(reusedPath);
const first=JSON.parse(firstRaw),reused=JSON.parse(reusedRaw);
const report={kind:'Round20 fixed CPU comparison before and after render-local quote reuse',status:'RUNNING',createdAt:new Date().toISOString(),first:{file:firstPath,sha256:sha(firstRaw),startedAt:first.startedAt,finishedAt:first.finishedAt},reused:{file:reusedPath,sha256:sha(reusedRaw),startedAt:reused.startedAt,finishedAt:reused.finishedAt},checks:[],rows:[],limits:['Both runs use the same preregistered 12 synthetic fixture cells. They are not naturally played event saves.','Timing batches occurred at separate times on a shared host; outputs, fixture identity and read counts are exact, timings are sampled.','Node HTML/model timings exclude browser layout, input-to-paint, storage and GPU.','The first negative result is preserved. This comparison isolates render-local reuse within the added feature, not a speed-up over the original game.']};
function equal(actual,expected,message){assert.deepEqual(actual,expected,message);report.checks.push(message);}
try {
 equal(first.status,'MEASURED_WITH_LIMITATIONS','First cost batch completed');
 equal(reused.status,'MEASURED_WITH_LIMITATIONS','Reuse cost batch completed');
 equal(first.sourceAndScriptStable,true,'First source and script remained stable');
 equal(reused.sourceAndScriptStable,true,'Reuse source and script remained stable');
 equal(reused.scriptSha256,first.scriptSha256,'Benchmark script bytes identical');
 equal(reused.protocol,first.protocol,'Entire measurement protocol identical');
 equal(reused.sourceHashes.baseline,first.sourceHashes.baseline,'All original baseline src JavaScript bytes identical between batches');
 const changes=Object.keys({...first.sourceHashes.current,...reused.sourceHashes.current}).filter(file=>first.sourceHashes.current[file]!==reused.sourceHashes.current[file]);
 equal(changes,['src/views.js'],'Only current src/views.js changed between CPU batches');
 report.currentViewsSha256={first:first.sourceHashes.current['src/views.js'],reused:reused.sourceHashes.current['src/views.js']};
 equal(first.rows.length,12,'First batch has all 12 cells');
 equal(reused.rows.length,12,'Reuse batch has all 12 cells');
 const key=r=>`${r.key}:${r.floor}:${r.items}`;
 equal(reused.rows.map(key),first.rows.map(key),'Fixture cells retain the same identity and order');
 for(let i=0;i<first.rows.length;i++){
  const a=first.rows[i],b=reused.rows[i],id=key(a);
  equal(b.fixtureSha256,a.fixtureSha256,`${id}: entire input state byte hash identical`);
  equal(b.quoteCount,a.quoteCount,`${id}: same model quote count`);
  equal(b.costGold,a.costGold,`${id}: same quoted costs`);
  equal(b.outputSha256,a.outputSha256,`${id}: complete baseline HTML, current HTML and model output hashes identical`);
  equal(b.htmlBytes,a.htmlBytes,`${id}: complete HTML byte lengths identical`);
  equal(a.callerUnchanged&&b.callerUnchanged,true,`${id}: caller unchanged in both batches`);
  for(const phase of ['baseline','current','preview']){
   equal([a.rawMs[phase].length,b.rawMs[phase].length],[24,24],`${id}: ${phase} retains both sets of 24 formal samples`);
   equal([a.warmupMs[phase].length,b.warmupMs[phase].length],[6,6],`${id}: ${phase} retains both sets of 6 warmups`);
  }
  equal(b.instrumentedInventoryIdReads.baseline,a.instrumentedInventoryIdReads.baseline,`${id}: original view ID reads unchanged`);
  equal(b.instrumentedInventoryIdReads.preview,a.instrumentedInventoryIdReads.preview,`${id}: risk model ID reads unchanged`);
  equal(b.instrumentedInventoryIdReads.current-b.instrumentedInventoryIdReads.baseline,b.instrumentedInventoryIdReads.preview,`${id}: current view now adds exactly one model-stage equivalent of ID reads`);
  report.rows.push({key:a.key,floor:a.floor,items:a.items,fixtureSha256:a.fixtureSha256,completeOutputSha256:a.outputSha256,allOutputHashesEqual:true,htmlBytes:a.htmlBytes,summaryMs:{first:a.summaryMs,reused:b.summaryMs},idReads:{first:a.instrumentedInventoryIdReads,reused:b.instrumentedInventoryIdReads},currentHtmlMedianChangeMs:b.summaryMs.current.p50-a.summaryMs.current.p50,currentHtmlP95ChangeMs:b.summaryMs.current.p95-a.summaryMs.current.p95});
 }
 report.status='PASS';
} catch(error){report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
report.scriptSha256=sha(await readFile(new URL(import.meta.url)));
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:report.checks.length,cells:report.rows.length,output,error:report.error?.message},null,2));
