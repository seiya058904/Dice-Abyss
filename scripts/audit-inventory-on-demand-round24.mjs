// Source-to-source verification and optional light CPU sampling. This is not
// browser latency or FPS. Keep output outside both source trees and measure
// without competing test/browser jobs.
// node scripts/audit-inventory-on-demand-round24.mjs --baseline-source=/old \
//   --current-source=/new --output=/tmp/round24-reclaim [--timing] [--pairs=12]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {recoveryFixture} from './storage-recovery-harness.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg.slice(2),true]:[arg.slice(2,i),arg.slice(i+1)];}));
if(args.help){
 console.log('Provide --baseline-source=/old --current-source=/new --output=/fresh/external/directory; optional --timing --pairs=12. Native HTML and actual app-event checks always run. Timing runs 12 alternating pairs per cell, three complete renders per sample, and retains every sample.');
 process.exit(0);
}
assert(args['baseline-source']&&args['current-source']&&args.output,'Provide both source roots and a fresh external output directory');
const output=path.resolve(args.output),pairs=Number(args.pairs||12);
assert(Number.isSafeInteger(pairs)&&pairs>=4&&pairs<=100,'pairs must be an integer from 4 to 100');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const variants=[];
for(const label of ['baseline','current']){
 const root=path.resolve(args[label+'-source']);assert(output!==root&&!output.startsWith(root+path.sep));
 const [E,S,V,R]=await Promise.all(['engine','storage','views','release'].map(name=>import(pathToFileURL(path.join(root,'src',name+'.js')))));
 variants.push({label,root,E,S,V,R});
}
const [baseline,current]=variants;
await fs.mkdir(output,{recursive:true});await assert.rejects(fs.access(path.join(output,'report.json')),'Use a fresh output directory');
const sourceFiles=['src/app.js','src/views.js','src/engine.js','src/equipment.js','src/inventory-query.js','src/storage.js','src/release.js'];
const identity=async()=>Object.fromEntries(await Promise.all(variants.map(async v=>[v.label,Object.fromEntries(await Promise.all(sourceFiles.map(async name=>{const bytes=await fs.readFile(path.join(v.root,name));return [name,{bytes:bytes.length,sha256:hash(bytes)}];})))])));
const report={status:'RUNNING',startedAt:new Date().toISOString(),node:process.version,platform:process.platform,backend:'Node CPU only; no browser, layout, paint or GPU measurement',scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore:await identity(),semantics:{html:[],quotes:[],appReviews:[],eligibilityReads:[]},timing:null};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();

function fixture(api,count=70,{capped=false,large=false}={}){
 const s=api.E.newGame(24041);s.runId=`round24-reclaim-${count}-${capped}-${large}`;s.floor=200;s.player.level=100;s.player.gold=capped?api.E.GOLD_CAP:1_000_000;
 while(s.player.items.length<count)s.player.items.push(api.E.makeItem(s,undefined,s.nextId%8));
 const equipped=new Set(api.E.equippedIds(s));
 if(count>3){const relics=s.player.items.filter(item=>item.slot==='relic');[s.player.equipped.relic2,s.player.equipped.relic3]=relics.slice(1,3).map(item=>item.id);for(const id of api.E.equippedIds(s))equipped.add(id);}
 for(const item of s.player.items){
  item.level=equipped.has(item.id)?(large?1e13:1000):(large?1e12:4);
  item.locked=Number(item.id.slice(1))%41===0;
  item.auditMetadata={nested:['装备扩展字段',item.id]};
 }
 if(count>3){const unseen=s.player.items.at(-1);unseen.level=1;unseen.name='仅有的末件';}
 s.auditMetadata={nested:['原样保留',{unicode:'雪 😀',keep:19}]};s.player.hp=api.E.stats(s).maxHp;
 assert(api.S.validateSave(s));return s;
}
const buttonPattern=/<button\b[^>]*\bdata-action="salvage-preview"[^>]*>[\s\S]*?<\/button>/g;
function normaliseReclaimButton(html){
 const buttons=html.match(buttonPattern)||[];assert.equal(buttons.length,1,'Only the declared recycling-check button may differ');
 return html.replace(buttonPattern,'<button data-action="salvage-preview">DECLARED_ON_DEMAND_CHECK</button>');
}
function summary(samples){
 const sorted=samples.toSorted((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];
 return {n:samples.length,min:sorted[0],p50:q(.5),p95:q(.95),max:sorted.at(-1),quantile:'sorted[floor((n-1)*p)]'};
}
try{
 const states=[fixture(baseline,3),fixture(baseline,70),fixture(baseline,10000),fixture(baseline,70,{capped:true,large:true})];
 const choices=[{view:'inventory'},{view:'inventory',inventoryPage:1},{view:'inventory',inventorySort:'rarity'},{view:'inventory',inventorySort:'level'},
  {view:'inventory',inventorySlot:'armor'},{view:'inventory',inventoryRarity:'7'},{view:'inventory',inventoryDefense:'regen'},
  {view:'inventory',inventoryQuery:'不存在的名称',inventoryQueryDraft:'尚未提交 <草稿>'},{view:'inventory',inventoryQuery:'仅有的末件',inventoryPage:999}];
 for(const state of states){
  const raw=baseline.S.encodeSave(state);assert.equal(current.S.encodeSave(state),raw);
  const expectedQuote=baseline.E.salvagePreview(state,undefined,false,true),quote=current.E.salvagePreview(state,undefined,false,true);
  assert.deepEqual(quote,expectedQuote);report.semantics.quotes.push({fixture:state.runId,items:quote?.items.length||0,gold:quote?.gold||0,overflow:quote?.overflow||0,sha256:hash(quote)});
  for(const ui of choices){
   const expected=baseline.V.center(state,ui),actual=current.V.center(state,ui);
   assert.equal(normaliseReclaimButton(actual),normaliseReclaimButton(expected),'Every card, rule, filter, count, ordering and pagination byte outside the one declared button remains equal');
   assert.match(actual.match(buttonPattern)[0],/>检查可回收旧装<\/button>$/);
   const expectedGame=baseline.V.gameView(state,ui).replace(`VER ${baseline.R.RELEASE_STAMP}　 INFINITE ABYSS`,`VER ${current.R.RELEASE_STAMP}　 INFINITE ABYSS`),actualGame=current.V.gameView(state,ui);
   assert.equal(normaliseReclaimButton(actualGame),normaliseReclaimButton(expectedGame),'Outside the one declared button and exact release stamp, complete game HTML remains equal');
   report.semantics.html.push({fixture:state.runId,ui,baselineBytes:Buffer.byteLength(expected),currentBytes:Buffer.byteLength(actual),normalisedCenterSha256:hash(normaliseReclaimButton(actual)),normalisedGameSha256:hash(normaliseReclaimButton(actualGame)),allOtherBytesEqual:true});
  }
  assert.equal(current.S.encodeSave(state),raw);
 }
 // A data-access probe confirms the avoided work: a filtered-out item is not
 // inspected for recycling until requested. Native timing below has no probe.
 for(const v of variants){
  const state=fixture(v,70),unseen=state.player.items.at(-1);let reads=0;
  Object.defineProperty(unseen,'locked',{enumerable:true,configurable:true,get(){reads++;return false;}});
  v.V.center(state,{view:'inventory',inventoryQuery:'不存在的名称'});const duringBrowse=reads;reads=0;
  v.E.salvagePreview(state,undefined,false,true);const explicitQuote=reads;
  if(v.label==='baseline')assert(duringBrowse>0);else assert.equal(duringBrowse,0);assert(explicitQuote>0);
  report.semantics.eligibilityReads.push({variant:v.label,duringBrowse,explicitQuote});
 }
 // Actual original app handlers execute through the existing documented
 // headless harness. Only DOM/focus/effects are modeled, not rules or storage.
 for(const options of [{count:70},{count:70,capped:true},{count:3}]){
  const sourceState=fixture(baseline,options.count,options),observations=[];
  for(const v of variants){
   const f=await recoveryFixture(v.root,{state:structuredClone(sourceState)});
   Object.assign(f.probe.ui,{view:'inventory',inventoryQuery:'不存在的名称',inventoryRarity:'7'});
   await f.click('inventory');await f.click('salvage-preview');
   const quote=v.E.salvagePreview(f.probe.state,undefined,false,true);
   assert.equal(v.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.writes,[]);
   const before={dialogOpen:f.probe.dialog.open,html:f.probe.dialog.innerHTML,notice:f.announcer.textContent,saveSha256:hash(f.original)};
   if(quote){
    assert(before.dialogOpen);await f.click('close-dialog');assert.equal(v.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.writes,[]);
    await f.click('salvage-preview');const expected=v.E.transition(f.probe.state,{type:'salvage',ids:quote.items.map(item=>item.id),allowOverflow:!!quote.overflow});
    await f.click('confirm');assert.equal(v.S.encodeSave(f.probe.state),v.S.encodeSave(expected));assert.equal(f.map.get(v.S.SAVE_KEY),v.S.encodeSave(expected));assert.equal(f.map.get(v.S.BACKUP_KEY),v.S.encodeSave(expected));
    observations.push({...before,variant:v.label,committedSha256:hash(v.S.encodeSave(f.probe.state)),writeKeys:f.writes.map(([key])=>key)});
   }else{
    assert(!before.dialogOpen);assert.equal(f.probe.pending,null);
    if(v.label==='current')assert.match(before.notice,/当前没有可提交的安全回收批次/);
    observations.push({...before,variant:v.label,committedSha256:null,writeKeys:[]});
   }
  }
  if(options.count>3){const [a,b]=observations;assert.equal(a.html,b.html,'The complete review dialog remains identical');assert.equal(a.committedSha256,b.committedSha256);assert.deepEqual(a.writeKeys,b.writeKeys);}
  report.semantics.appReviews.push({options,observations});
 }
 if(args.timing){
  const small=fixture(baseline,70),large=fixture(baseline,10000);
  const cells=[{key:'70-full',state:small,ui:{view:'inventory'}},{key:'10000-full',state:large,ui:{view:'inventory'}},
   {key:'10000-second-page',state:large,ui:{view:'inventory',inventoryPage:1}},{key:'10000-one-match',state:large,ui:{view:'inventory',inventoryQuery:'仅有的末件'}}];
  const iterations=3,schedule=Array.from({length:pairs},(_,pair)=>({pair:pair+1,order:pair%2?['current','baseline']:['baseline','current']}));
  report.timing={protocol:{pairsPerCell:pairs,iterationsPerSample:iterations,warmupRendersPerVariantPerCell:3,order:'paired AB/BA alternation',schedule,limits:'Full CPU HTML generation only; no layout/paint/native input, storage latency or FPS claim. Every slow/negative pair retained.'},cells:cells.map(cell=>({key:cell.key,fixtureSha256:hash(cell.state),ui:cell.ui})),raw:[],summary:[],checksum:0};await save();
  for(const cell of cells){
   for(const v of variants)for(let i=0;i<3;i++)report.timing.checksum+=v.V.center(cell.state,cell.ui).length;
   for(const {pair,order} of schedule)for(const label of order){
    const v=variants.find(entry=>entry.label===label);let length=0;
    const start=performance.now();for(let i=0;i<iterations;i++)length+=v.V.center(cell.state,cell.ui).length;const ms=(performance.now()-start)/iterations;
    report.timing.checksum+=length;report.timing.raw.push({cell:cell.key,pair,variant:label,msPerCompleteRender:ms});
   }
   const rows=report.timing.raw.filter(row=>row.cell===cell.key),a=rows.filter(row=>row.variant==='baseline'),b=rows.filter(row=>row.variant==='current');
   const deltas=a.map(row=>b.find(other=>other.pair===row.pair).msPerCompleteRender-row.msPerCompleteRender);
   report.timing.summary.push({cell:cell.key,baseline:summary(a.map(row=>row.msPerCompleteRender)),current:summary(b.map(row=>row.msPerCompleteRender)),pairedDeltaMs:summary(deltas),currentFasterPairs:deltas.filter(value=>value<0).length,currentSlowerPairs:deltas.filter(value=>value>0).length});
   await save();
  }
 }
 report.sourceAfter=await identity();assert.deepEqual(report.sourceAfter,report.sourceBefore,'Do not modify either source while measuring');
 report.finishedAt=new Date().toISOString();report.status='PASS';await save();
 console.log(JSON.stringify({status:report.status,htmlComparisons:report.semantics.html.length,appScenarios:report.semantics.appReviews.length,eligibilityReads:report.semantics.eligibilityReads,timing:report.timing?.summary||null,report:path.join(output,'report.json')},null,2));
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};report.finishedAt=new Date().toISOString();await save();throw error;}
