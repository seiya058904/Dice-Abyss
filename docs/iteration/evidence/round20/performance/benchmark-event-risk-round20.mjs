// Read-only, synthetic Node diagnostic. Browser input/layout/storage are excluded.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,loadavg} from 'node:os';

const [baseArg,currentArg,outputArg]=process.argv.slice(2);
assert(baseArg&&currentArg&&outputArg,'Supply BASELINE CURRENT OUTPUT paths.');
const baseline=resolve(baseArg),current=resolve(currentArg),output=resolve(outputArg);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const baseFiles=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/gold.js','src/event-references.js','src/event-preview.js','src/views.js'];
async function hashes(){return Object.fromEntries(await Promise.all([['baseline',baseline],['current',current]].map(async([label,root])=>{
 const files=(await readdir(resolve(root,'src'),{recursive:true})).filter(file=>file.endsWith('.js')).map(file=>'src/'+file).sort();
 return [label,Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(resolve(root,file)))])))];
})));}
const sourceHashes=await hashes(),scriptSha256=sha(await readFile(new URL(import.meta.url)));
const E=await import(pathToFileURL(resolve(baseline,'src/engine.js')));
const S=await import(pathToFileURL(resolve(baseline,'src/storage.js')));
const BV=await import(pathToFileURL(resolve(baseline,'src/views.js')));
const CV=await import(pathToFileURL(resolve(current,'src/views.js')));
const R=await import(pathToFileURL(resolve(current,'src/event-risk.js')));
for(const file of baseFiles.filter(file=>!['src/views.js'].includes(file)))assert.equal(sourceHashes.baseline[file],sourceHashes.current[file],`The cost-only comparison needs unchanged rules: ${file}`);
const quantiles=values=>{const s=values.toSorted((a,b)=>a-b);return {n:s.length,p50:s[Math.floor((s.length-1)*.5)],p95:s[Math.floor((s.length-1)*.95)],max:s.at(-1),min:s[0],mean:values.reduce((a,b)=>a+b,0)/values.length};};
const orders=[['baseline','current','preview'],['preview','current','baseline'],['current','baseline','preview'],['preview','baseline','current'],['baseline','preview','current'],['current','preview','baseline']];
const scenarios=[{key:'gambit',floor:10},{key:'gambit',floor:30},{key:'wishingvault',floor:140}];
const ui={view:'game',busy:false,rolling:false,forging:false};
function fixture(items,{key,floor}){
 let state=E.newGame(20261020+floor);state.runId=`round20-risk-cost-${key}-${floor}-${items}`;state.floor=floor;state.player.level=80;state.player.gold=100000;
 while(state.player.items.length<items){const i=state.player.items.length;state.player.items.push(E.makeItem(state,['weapon','armor','relic'][i%3],i%8));}
 const tail=state.player.items.toReversed();
 for(const slot of ['weapon','armor'])state.player.equipped[slot]=tail.find(item=>item.slot===slot).id;
 const relics=tail.filter(item=>item.slot==='relic');
 for(const [i,slot]of ['relic','relic2','relic3'].entries())state.player.equipped[slot]=relics[i]?.id??null;
 state.player.hp=E.stats(state).maxHp;
 state=E.transition(state,{type:'fate'});
 // This deliberate fixture mutation chooses a valid room; it is not natural reachability.
 state.route[0].type=key;state.route[0].quality=0;
 state=E.transition(state,{type:'enter'});
 assert.equal(state.phase,'event');assert.equal(state.event.key,key);assert(S.validateSave(state));return state;
}
const report={kind:'Round20 paid-event preview cost diagnostic',status:'RUNNING',startedAt:new Date().toISOString(),sourceHashes,scriptSha256,baseline,current,node:process.version,cpu:cpus()[0]?.model,loadBefore:loadavg(),
 protocol:{scope:'Node synchronous wall time for full gameView HTML construction and for eventRiskPreview only. No DOM, CSS, layout, input-to-paint, storage, GPU or naturally played save claim.',fixtures:'Seed 20261020 + scenario floor. Synthetic valid 3/100/1000/10000-item inventories; five newest items equipped when present. The first route slot is deliberately set to the tested event before the real enter transition.',orders,warmupsPerCell:6,formalSamplesPerCell:24,quantiles:'sorted floor((n-1)*p); every formal value retained',comparison:'Baseline gameView lacks the new preview; current gameView includes it after UI integration. Outputs intentionally differ, while every input field and runtime rules must be preserved. This measures added capability cost, not a same-output optimisation.',preview:'Calls roll for both event types and safe additionally for gambit, matching both available paid choice quotes. No preview baseline exists.',instrumentation:'Detached item-id getters are installed only after every native timing cell finishes. They count ID reads, not total allocations or CPU instructions, and never touch timed object shapes.',limits:['Shared host GC/scheduling can affect tails.','HTML construction is only one part of browser responsiveness.','A new decision panel may add HTML even if its model is cheap; page timing must be measured separately.']},rows:[]};
const fixtures=[];
try {
for(const items of [3,100,1000,10000])for(const scenario of scenarios){
 const state=fixture(items,scenario),original=JSON.stringify(state);fixtures.push(state);
 const previews=()=>scenario.key==='gambit'?[R.eventRiskPreview(state,'roll'),R.eventRiskPreview(state,'safe')]:[R.eventRiskPreview(state,'roll')];
 const expected={baseline:BV.gameView(state,{...ui}),current:CV.gameView(state,{...ui}),preview:previews()};
 assert(expected.preview.every(Boolean),'Supported pending choice must produce a quote.');
 const expectedHashes=Object.fromEntries(Object.entries(expected).map(([phase,result])=>[phase,sha(result)]));
 const row={key:scenario.key,floor:scenario.floor,items,fixtureSha256:sha(original),quoteCount:expected.preview.length,costGold:expected.preview.map(p=>p.costGold),htmlBytes:{baseline:Buffer.byteLength(expected.baseline),current:Buffer.byteLength(expected.current)},outputSha256:expectedHashes,rawMs:{baseline:[],current:[],preview:[]},warmupMs:{baseline:[],current:[],preview:[]}};
 report.rows.push(row);
 for(let round=-6;round<24;round++)for(const phase of orders[(round+6)%orders.length]){
  const started=performance.now(),value=phase==='baseline'?BV.gameView(state,{...ui}):phase==='current'?CV.gameView(state,{...ui}):previews(),elapsed=performance.now()-started;
  (round<0?row.warmupMs:row.rawMs)[phase].push(elapsed);assert.equal(sha(value),expectedHashes[phase]);
 }
 assert.equal(JSON.stringify(state),original);
 row.callerUnchanged=true;row.summaryMs=Object.fromEntries(Object.entries(row.rawMs).map(([phase,raw])=>[phase,quantiles(raw)]));
 row.pairedCurrentMinusBaselineMs=row.rawMs.current.map((ms,index)=>ms-row.rawMs.baseline[index]);
}
report.nativeTimingsFinishedAt=new Date().toISOString();
for(const [index,row]of report.rows.entries()){
 const state=structuredClone(fixtures[index]);let reads=0;
 for(const item of state.player.items){const id=item.id;Object.defineProperty(item,'id',{get(){reads++;return id;},enumerable:true,configurable:true});}
 const measured={};
 for(const phase of ['baseline','current','preview']){
  reads=0;const result=phase==='baseline'?BV.gameView(state,{...ui}):phase==='current'?CV.gameView(state,{...ui}):row.key==='gambit'?[R.eventRiskPreview(state,'roll'),R.eventRiskPreview(state,'safe')]:[R.eventRiskPreview(state,'roll')];
  assert.equal(sha(result),row.outputSha256[phase]);measured[phase]=reads;
 }
 row.instrumentedInventoryIdReads=measured;
}
report.sourceHashesAfter=await hashes();
assert.deepEqual(report.sourceHashesAfter,sourceHashes,'Source changed during cost collection.');assert.equal(sha(await readFile(new URL(import.meta.url))),scriptSha256);
report.sourceAndScriptStable=true;report.status='MEASURED_WITH_LIMITATIONS';
} catch (error) {
 report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};
 process.exitCode=1;
}
report.finishedAt=new Date().toISOString();report.loadAfter=loadavg();
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,output,rows:report.rows.map(({key,floor,items,quoteCount,htmlBytes,summaryMs,instrumentedInventoryIdReads})=>({key,floor,items,quoteCount,htmlBytes,summaryMs,instrumentedInventoryIdReads}))},null,2));
