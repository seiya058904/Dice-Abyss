// Node HTML-construction measurements, not browser clicks, DOM patching, layout,
// font rendering, input-to-paint latency, frame rate or GPU performance.
// node scripts/benchmark-fusion.mjs --baseline /path/to/input --samples 40 --output /absolute/path/qa/fusion-render-benchmark.json
// Omitting --baseline records the current local workbench alone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {cpus,platform,arch} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const args={};
for(let index=2;index<process.argv.length;index++){
 const entry=process.argv[index],separator=entry.indexOf('=');
 if(separator>=0)args[entry.slice(0,separator)]=entry.slice(separator+1);
 else args[entry]=process.argv[++index];
}
const currentRoot=resolve(args['--source']||dirname(fileURLToPath(new URL('../package.json',import.meta.url))));
const baselineRoot=args['--baseline']?resolve(args['--baseline']):null;
const samples=Number(args['--samples']||40),warmups=4;
assert(Number.isInteger(samples)&&samples>=5&&samples<=500,'Use 5–500 samples');
const hash=input=>createHash('sha256').update(input).digest('hex');
const files=['src/views.js','src/engine.js','src/equipment.js','src/storage.js','src/equipment-content.js'];
async function sourceHashes(root){
 const optional=['src/fusion-view.js','src/fusion-workbench.js','src/fusion-controller.js','src/fusion-dom.js'];
 return Object.fromEntries((await Promise.all([...files,'src/app.js',...optional].map(async path=>{
  try{return [path,hash(await readFile(resolve(root,path)))];}catch(error){if(error.code==='ENOENT'&&optional.includes(path))return null;throw error;}
 }))).filter(Boolean));
}
async function load(root,isCurrent=false){
 const E=await import(pathToFileURL(resolve(root,'src/engine.js'))),V=await import(pathToFileURL(resolve(root,'src/views.js'))),S=await import(pathToFileURL(resolve(root,'src/storage.js'))),Q=await import(pathToFileURL(resolve(root,'src/equipment.js')));
 const version=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version;
 let W;try{W=await import(pathToFileURL(resolve(root,'src/fusion-workbench.js')));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
 return {E,V,S,Q,W,version,sourceHashes:await sourceHashes(root),renderEntry:typeof V.fusionView==='function'?'views.fusionView':'views.gameView'};
}
const current=await load(currentRoot,true),baseline=baselineRoot?await load(baselineRoot):null;
const {fusionWorkbenchModel,planFusionMaterials}=await import(pathToFileURL(resolve(currentRoot,'src/fusion-workbench.js')));
const round=value=>Number(value.toFixed(6));
function distribution(values){
 const sorted=values.toSorted((a,b)=>a-b),percentile=q=>round(sorted[Math.max(0,Math.ceil(q*sorted.length)-1)]);
 return {samples:values.length,p50Ms:percentile(.5),p90Ms:percentile(.9),p95Ms:percentile(.95),p99Ms:percentile(.99),minMs:round(sorted[0]),maxMs:round(sorted.at(-1)),meanMs:round(values.reduce((sum,value)=>sum+value,0)/values.length),rawSamplesMs:values.map(round)};
}
function fixture(sameSlotStress=false){
 let s=current.E.newGame(20261017);s.runId='qa-fusion-benchmark-20261017';s.floor=140;s.player.level=70;s.player.gold=1e10;
 s.player.hp=current.E.stats(s).maxHp;s=current.E.transition(s,{type:'fate'});s.route[0].type='fusion';s=current.E.transition(s,{type:'enter'});
 const target=s.player.items.find(item=>item.id===s.player.equipped.weapon);target.level=70;target.levelXp=0;target.enhance=7;
 if(sameSlotStress){s.player.items=s.player.items.filter(item=>item.slot==='weapon');s.player.equipped.armor=null;s.player.equipped.relic=null;}
 while(s.player.items.length<10000){
  const index=s.player.items.length,item=current.E.makeItem(s,'weapon',index%8);
  item.level=64+index%17;item.levelXp=index%current.Q.levelXpNeeded(item.level);item.enhance=index%21;
  s.player.items.push(item);
 }
 s.player.hp=current.E.stats(s).maxHp;
 return {s,target,materials:s.player.items.filter(item=>item.slot==='weapon'&&item.id!==target.id)};
}
const currentCardIds=html=>[...html.matchAll(/data-fusion-item="([^"]+)"/g)].map(match=>match[1]);
function htmlInfo(html){
 const result={bytes:Buffer.byteLength(html),characters:html.length,sha256:hash(html)};
 if(html.includes('data-fusion-item=')){
  const ids=currentCardIds(html);assert.equal(ids.length,24);assert.equal(new Set(ids).size,24);
  result.inventoryCardMarkupCount=ids.length;result.uniqueInventoryCardIds=ids;result.sixFaceMarkupCount=(html.match(/data-fusion-face=/g)||[]).length;assert.equal(result.sixFaceMarkupCount,6);
 }else{
  result.targetChoiceMarkupCount=(html.match(/data-action="fusion-target"/g)||[]).length;
  result.materialChoiceMarkupCount=(html.match(/data-action="fusion-material"/g)||[]).length;
  assert.equal(result.targetChoiceMarkupCount,24);assert.equal(result.materialChoiceMarkupCount,24);
 }
 return result;
}
const report={
 schema:2,createdAt:new Date().toISOString(),method:'Node JavaScript and HTML string construction. Each version calls its exported local fusionView when available; a legacy baseline without that export calls gameView. Same full 10,000-item fixture per pair, four paired warmups, alternating A/B order per sample. Model normalization, whole-pool filtering/sorting and the complete selected-material fusion preview are included. Fixture construction, imports, assertions, hashing and serialization are outside the timed interval.',
 host:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model||'unavailable',logicalCpus:cpus().length},warmups,samples,
 current:{version:current.version,sourceHashes:current.sourceHashes,renderEntry:current.renderEntry},
 baseline:baseline?{version:baseline.version,sourceHashes:baseline.sourceHashes,renderEntry:baseline.renderEntry}:null,
 cases:[],limitations:[
  'No browser, DOM creation/insertion/reconciliation, CSS/layout, fonts, input handling, save transaction, frame timing or GPU is measured. Markup counts refer to emitted item elements, not a live DOM.',
  'Render entries and source hashes are recorded per version. A legacy full-game entry and a local-workbench entry have different scope. These results do not measure complete controller/event costs.',
  'A valid 10,000-item save must retain its required weapon, armor and relic. With one weapon target, its maximum selectable weapon materials is 9,997. The separate 9,999-material same-slot cohort is explicitly a view-only synthetic stress case, not an importable saved game.',
  'Shared-host time and JavaScript garbage collection fluctuate; all raw samples and observed maxima are retained. Synthetic level-70/floor-140 gear is not a naturally played progression claim.',
 ],
};
for(const sameSlotStress of [false,true]){
 const {s,target,materials}=fixture(sameSlotStress),validCurrent=current.S.validateSave(s),validBaseline=baseline?baseline.S.validateSave(s):null;
 assert.equal(validCurrent,!sameSlotStress);if(baseline)assert.equal(validBaseline,!sameSlotStress);
 assert(s.player.items.every(current.Q.validEquipment),'Every individual stress item follows the unchanged equipment schema');
 assert.equal(materials.length,sameSlotStress?9999:9997);
 const before=JSON.stringify(s),cohort=sameSlotStress?'same-slot-view-only-stress':'valid-full-save';
 for(const selectedCount of [1,24,materials.length]){
  const selected=materials.slice(0,selectedCount).map(item=>item.id),ui={screen:'game',view:'game',busy:false,rolling:false,forging:false,fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:selected,fusionPage:5,fusionTargetPage:5,fusionMaterialPage:5,fusionSearch:'',fusionRarity:'',fusionMinLevel:'',fusionMaxLevel:'',fusionSort:'power'};
  const beforeUi=JSON.stringify(ui),model=fusionWorkbenchModel(s,ui);assert.equal(model.materialIds.length,selectedCount);assert(model.preview);assert.equal(model.pageItems.length,24);
  if(baseline)assert.deepEqual(baseline.E.fusionPreview(s,[target.id],selected,true),model.preview,'Both views receive identical gameplay quotes/outcomes');
  const durations={baseline:[],current:[]},markup={};
  function run(kind,record){
   const version=kind==='baseline'?baseline:current,entry=version.V.fusionView||version.V.gameView;
   const started=performance.now(),html=entry(s,ui),elapsed=performance.now()-started;
   if(record)durations[kind].push(elapsed);
   if(!markup[kind])markup[kind]=htmlInfo(html);
   else assert.equal(Buffer.byteLength(html),markup[kind].bytes,'Stable fixture emits stable-sized HTML');
  }
  for(let index=0;index<warmups;index++){if(baseline)run('baseline',false);run('current',false);}
  for(let index=0;index<samples;index++)for(const kind of baseline?(index%2?['current','baseline']:['baseline','current']):['current'])run(kind,true);
  assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(ui),beforeUi);
  const result={cohort,inventoryItems:s.player.items.length,sameSlotItems:model.candidates.length,selectedMaterials:selectedCount,targetCount:1,page:5,pageSize:24,sort:'power',fixtureSha256:hash(before),schema:{currentSaveValid:validCurrent,baselineSaveValid:validBaseline,everyEquipmentValid:true},gameStateUnchanged:true,uiStateUnchanged:true,quote:{cost:model.preview.cost,baseXp:model.preview.base,protectedMaterials:model.preview.protectedItems.length},current:{...distribution(durations.current),html:markup.current}};
  if(baseline){result.baseline={...distribution(durations.baseline),html:markup.baseline};result.p50ConstructionChangePercent=round((result.current.p50Ms/result.baseline.p50Ms-1)*100);}
  report.cases.push(result);
 }
 const times=[],baselineTimes=[];let plan,originalPlan;
 for(let index=0;index<samples+warmups;index++){
  const currentPlan=()=>{const started=performance.now();plan=planFusionMaterials(s,[target.id]);if(index>=warmups)times.push(performance.now()-started);};
  const baselinePlan=()=>{const started=performance.now();originalPlan=baseline.W.planFusionMaterials(s,[target.id]);if(index>=warmups)baselineTimes.push(performance.now()-started);};
  for(const run of baseline?.W?.planFusionMaterials?(index%2?[currentPlan,baselinePlan]:[baselinePlan,currentPlan]):[currentPlan])run();
  assert.equal(plan.selectedCount,materials.length);assert(plan.preview);assert.equal(plan.cost,plan.preview.cost);
  if(originalPlan)assert.deepEqual(plan,originalPlan,'Bulk selection and complete quote remain identical to the input planner');
 }
 assert.equal(JSON.stringify(s),before);
 (report.bulkPlanning??=[]).push({cohort,inventoryItems:10000,eligibleCount:plan.eligibleCount,selectedCount:plan.selectedCount,excluded:plan.excluded,budgetLimited:plan.budgetLimited,safetyLimited:plan.safetyLimited,method:'Complete planFusionMaterials call, including full inventory lookup, XP sorting, cumulative highest-face safety and final preview; no HTML or DOM. When the baseline has the planner, paired order alternates and complete outputs are compared outside timing.',...distribution(times),...(baselineTimes.length?{baseline:distribution(baselineTimes),baselineOutputIdentical:true}:{})});
}
report.current.sourceStableDuringRun=JSON.stringify(await sourceHashes(currentRoot))===JSON.stringify(current.sourceHashes);
if(baseline)report.baseline.sourceStableDuringRun=JSON.stringify(await sourceHashes(baselineRoot))===JSON.stringify(baseline.sourceHashes);
assert(report.current.sourceStableDuringRun,'Current source changed during the run; rerun against a stable snapshot');
if(baseline)assert(report.baseline.sourceStableDuringRun,'Baseline source changed during the run');
const json=JSON.stringify(report,null,2)+'\n';
if(args['--output']){const output=resolve(args['--output']);await mkdir(dirname(output),{recursive:true});await writeFile(output,json);}
console.log(json);
