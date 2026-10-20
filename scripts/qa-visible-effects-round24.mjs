// Compare every Canvas command in the fully visible path against an untouched
// local input. Uses the existing deterministic scene/clock recorder; not FPS.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {effectCases,recordEffects} from './audit-effects-layout-round14.mjs';

export async function compareVisibleEffects(baselineRoot,currentRoot){
 const hash=async root=>createHash('sha256').update(await fs.readFile(path.join(root,'src/effects.js'))).digest('hex');
 const report={kind:'DETERMINISTIC_VISIBLE_CANVAS_COMMAND_EQUIVALENCE_NOT_FPS',baselineRoot,currentRoot,
  sourceSha256:{baseline:await hash(baselineRoot),current:await hash(currentRoot)},
  notes:['The fixture has no IntersectionObserver: this checks the conservative fully visible path.',
   'Separate observer lifecycle tests and actual browser scroll tests cover culling and restoration.',
   'All Canvas arguments, material buffers, lifecycle results and saved-state/RNG invariants are compared.'],cases:[]};
 const definitions=[...[[390,844],[1920,1080],[3840,2160]].flatMap(([width,height])=>effectCases.map(definition=>({definition,options:{width,height}}))),
  ...[true,false].flatMap(firstChild=>[0,150].map(cancelAt=>({definition:effectCases.find(row=>row.name==='loot-7'),options:{firstChild,cancelAt}})))];
 for(const {definition,options} of definitions){
  const before=await recordEffects(baselineRoot,definition,options),after=await recordEffects(currentRoot,definition,options);
  for(const key of ['commands','geometryReads','moves','beforeFrames','finalDataset','surface','remaining','materialDimensionsAfterStop'])assert.deepEqual(after[key],before[key],`${definition.name}: ${key}`);
  report.cases.push({name:definition.name,...options,commandCount:after.commandCount,commandSha256:after.commandSha256,
   exactCanvasCommands:true,exactGeometryAndMaterials:true,exactLifecycle:true,savedStateAndRngUnchanged:true});
 }
 report.summary={cases:report.cases.length,passed:report.cases.length,failed:0};return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
 if(options['--help'])console.log('node scripts/qa-visible-effects-round24.mjs --baseline-root=/absolute/input --current-root=/absolute/current --output=/absolute/out.json');
 else{
  assert.equal(typeof options['--baseline-root'],'string');assert.equal(typeof options['--output'],'string');
  const report=await compareVisibleEffects(path.resolve(options['--baseline-root']),path.resolve(options['--current-root']||fileURLToPath(new URL('..',import.meta.url))));
  await fs.mkdir(path.dirname(path.resolve(options['--output'])),{recursive:true});await fs.writeFile(options['--output'],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
 }
}
