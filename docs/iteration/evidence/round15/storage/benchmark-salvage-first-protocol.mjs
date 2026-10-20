import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';

// All states are synthetic, stores are Maps, and inputs are read-only modules.
// --verify-only records complete differential results and ID-read counts but
// no timing. Native timing is separate from every instrumented count/assertion.
const [baselineArg,currentArg,outputArg,...flags]=process.argv.slice(2);
if(!baselineArg||!currentArg||!outputArg||flags.some(f=>f!=='--verify-only'&&!/^--pairs=\d+$/.test(f)))throw Error('Usage: node benchmark-salvage-round15.mjs BASELINE CURRENT OUTPUT [--verify-only] [--pairs=8]');
const baselineRoot=resolve(baselineArg),currentRoot=resolve(currentArg),output=resolve(outputArg),verifyOnly=flags.includes('--verify-only');
const pairs=Number(flags.find(f=>f.startsWith('--pairs='))?.split('=')[1]??8),warmups=2;
if(pairs<2||pairs>50)throw Error('Use 2–50 paired samples.');
const at=(root,file)=>pathToFileURL(resolve(root,file)),sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const variants={baseline:{E:await import(at(baselineRoot,'src/engine.js')),S:await import(at(baselineRoot,'src/storage.js'))},current:{E:await import(at(currentRoot,'src/engine.js')),S:await import(at(currentRoot,'src/storage.js'))}};
const files=['src/engine.js','src/equipment.js','src/storage.js','src/deep-rules.js','src/content.js'];
const sourceHashes=()=>Object.fromEntries([['baseline',baselineRoot],['current',currentRoot]].map(([name,root])=>[name,Object.fromEntries(files.map(file=>[file,sha(readFileSync(at(root,file)))]))]));
const initialHashes=sourceHashes(),scriptHash=sha(readFileSync(new URL(import.meta.url))),{E:BE,S:BS}=variants.baseline;
const summary=values=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,min:s[0],median:(s[(s.length-1)>>1]+s[s.length>>1])/2,p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1),mean:s.reduce((n,x)=>n+x,0)/s.length};};
const memory=(S,raw)=>{const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};};
function fixture(count,mixed){
 const s=BE.newGame(27017);s.runId='round15-salvage-benchmark';s.floor=200;s.player.level=100;s.player.gold=1000000;
 while(s.player.items.length<count)s.player.items.push(BE.makeItem(s,undefined,mixed?s.nextId%8:s.nextId%2));
 [s.player.equipped.relic,s.player.equipped.relic2,s.player.equipped.relic3]=s.player.items.filter(i=>i.slot==='relic').slice(0,3).map(i=>i.id);
 const equipped=new Set(BE.equippedIds(s));
 for(const item of s.player.items){if(equipped.has(item.id))item.level=1000000;if(Number(item.id.slice(1))%41===0)item.locked=true;item.auditMetadata={nested:['kept',Number(item.id.slice(1))]};}
 s.auditMetadata={unknown:['界','😀',{preserved:true}],counter:0};s.player.hp=BE.stats(s).maxHp;
 assert(BS.validateSave(s));return s;
}
function countReads(E,state,ids){
 let reads=0;const descriptors=state.player.items.map(item=>Object.getOwnPropertyDescriptor(item,'id'));
 try{
  for(let index=0;index<state.player.items.length;index++){const id=state.player.items[index].id;Object.defineProperty(state.player.items[index],'id',{enumerable:true,configurable:true,get(){reads++;return id;}});}
  const quote=E.salvagePreview(state,ids,false,true),observed=reads;return {observed,quote};
 }finally{for(let index=0;index<state.player.items.length;index++)Object.defineProperty(state.player.items[index],'id',descriptors[index]);}
}
const report={kind:'Round15 explicit salvage batch differential and paired Node timing',createdAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,baselineRoot,currentRoot,sourceHashes:initialHashes,scriptSha256:scriptHash,verifyOnly,status:'RUNNING',method:{state:'Complete synthetic valid schema5 snapshots including unknown root/item metadata. No real player saves, browser, filesystem persistence or network.',counts:'Instrument only item ID property reads in one explicit salvagePreview; restore descriptors afterward. Timing never uses instrumented states.',timing:'Each scenario and stage alternates baseline/current then current/baseline. Fixture creation, store setup and all equality checks are outside the interval. All warmups and formal samples are retained separately. Memory-only transitionAndSave includes both durable-key simulation writes; it does not measure real localStorage, input latency, layout, physical disk or GPU.',limits:'Shared host; timings describe this controlled script and environment only.'},pairsPerCell:pairs,warmupPairsPerCell:warmups,differential:[],timing:{status:verifyOnly?'NOT_RUN':'RUNNING',cells:[]}};
try{
 for(const [name,count,mixed,single] of [['small-low',100,false,false],['medium-low',1000,false,false],['large-mixed',10000,true,false],['large-low',10000,false,false],['large-single',10000,true,true]]){
  const state=fixture(count,mixed),raw=BS.encodeSave(state),preview=BE.salvagePreview(state,undefined,false,true),allIds=preview.items.map(i=>i.id).reverse(),ids=single?[allIds[0]]:allIds,action={type:'salvage',ids,allowOverflow:false};
  const expectedQuote=BE.salvagePreview(state,ids,false,true),expectedAfter=BE.transition(state,action),afterRaw=BS.encodeSave(expectedAfter),originalHash=sha(raw);
  assert(Buffer.byteLength(raw)<5000000);const outcomes={};
  for(const [variant,{E,S}] of Object.entries(variants)){
   assert(S.validateSave(state));assert.equal(S.encodeSave(state),raw);const counted=countReads(E,state,ids);
   assert.deepEqual(counted.quote,expectedQuote);for(let index=0;index<ids.length;index++)assert.strictEqual(counted.quote.items[index],state.player.items.find(i=>i.id===ids[index]));
   const after=E.transition(state,action);assert.deepEqual(after,expectedAfter);assert(S.validateSave(after));assert.equal(S.encodeSave(after),afterRaw);
   const store=memory(S,raw),receipt=S.saveGame(after,state,store);assert.deepEqual(receipt,{mirrored:true,warning:''});assert.deepEqual(S.loadSave(store).state,after);
   assert.equal(store.map.get(S.SAVE_KEY),afterRaw);assert.equal(store.map.get(S.BACKUP_KEY),afterRaw);assert.deepEqual(store.writes,[S.SAVE_KEY,S.BACKUP_KEY]);
   assert.strictEqual(E.transition(after,action),after);assert.equal(S.encodeSave(state),raw);
   outcomes[variant]={itemIdReads:counted.observed,quoteHash:sha(counted.quote),afterHash:sha(afterRaw),remaining:after.player.items.length,creditedGold:after.player.gold-state.player.gold,exactQuoteStateAndSave:true,previewReferencesPreserved:true,callerUnchanged:true,replayRejected:true,writeKeys:store.writes};
  }
  report.differential.push({name,items:count,selected:ids.length,mixed,single,rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:originalHash,outputSha256:sha(afterRaw),outcomes});
  if(verifyOnly)continue;
  for(const stage of ['preview','transition','transitionAndSave']){
   const samples={baseline:[],current:[]},warmupSamples={baseline:[],current:[]},orders=[];
   for(let pair=-warmups;pair<pairs;pair++){
    const order=pair%2===0?['baseline','current']:['current','baseline'];if(pair>=0)orders.push(order);
    for(const variant of order){
     const {E,S}=variants[variant],store=stage==='transitionAndSave'?memory(S,raw):null;let result,receipt;
     const start=performance.now();
     if(stage==='preview')result=E.salvagePreview(state,ids,false,true);
     else{result=E.transition(state,action);if(store)receipt=S.saveGame(result,state,store);}
     const elapsed=performance.now()-start;(pair>=0?samples:warmupSamples)[variant].push(elapsed);
     assert.deepEqual(result,stage==='preview'?expectedQuote:expectedAfter);
     if(store){assert.deepEqual(receipt,{mirrored:true,warning:''});assert.equal(store.map.get(S.SAVE_KEY),afterRaw);assert.equal(store.map.get(S.BACKUP_KEY),afterRaw);}
    }
   }
   const differences=samples.current.map((x,i)=>x-samples.baseline[i]);
   report.timing.cells.push({name,stage,items:count,selected:ids.length,orders,samplesMs:samples,warmupSamplesMs:warmupSamples,baselineMs:summary(samples.baseline),currentMs:summary(samples.current),pairedCurrentMinusBaselineMs:differences,pairedDifferenceSummaryMs:summary(differences)});
  }
  assert.equal(sha(BS.encodeSave(state)),originalHash,'timing cannot alter the complete input');
 }
 assert.deepEqual(sourceHashes(),initialHashes,'runtime source changed during the run');assert.equal(sha(readFileSync(new URL(import.meta.url))),scriptHash,'benchmark source changed during the run');
 report.sourceAndScriptStable=true;report.status='PASS';if(!verifyOnly)report.timing.status='MEASURED_WITH_LIMITATIONS';
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
report.completedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,output,differential:report.differential.map(({name,items,selected,outcomes})=>({name,items,selected,baselineIdReads:outcomes.baseline.itemIdReads,currentIdReads:outcomes.current.itemIdReads})),timingStatus:report.timing.status,timing:report.timing.cells.map(({name,stage,baselineMs,currentMs})=>({name,stage,baselineMs,currentMs})),error:report.error},null,2));
