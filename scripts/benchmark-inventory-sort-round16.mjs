// Read-only source comparison. Timings cover selection/sorting only, never
// browser input, HTML, layout, storage, physical GPU or gameplay completion.
// node scripts/benchmark-inventory-sort-round16.mjs --baseline /input/Dice-Abyss --source . --output /tmp/inventory-sort.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,loadavg} from 'node:os';

const args={};
for(let index=2;index<process.argv.length;index++){
  const key=process.argv[index];
  if(key==='--verify-only')args[key]=true;
  else{assert(['--baseline','--source','--output','--samples'].includes(key),`Unknown option ${key}`);assert(process.argv[index+1],`Missing value for ${key}`);args[key]=process.argv[++index];}
}
assert(args['--baseline']&&args['--output'],'Supply --baseline and --output; source defaults to this project.');
const baselineRoot=resolve(args['--baseline']),currentRoot=resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),output=resolve(args['--output']);
const samples=Number(args['--samples']??24),verifyOnly=!!args['--verify-only'];
assert(Number.isInteger(samples)&&samples>=6&&samples<=120,'Use 6–120 formal samples per variant.');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['src/inventory-query.js','src/equipment.js','src/engine.js'];
async function identities(){
  return Object.fromEntries(await Promise.all([['baseline',baselineRoot],['current',currentRoot]].map(async([name,root])=>[name,Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha(await readFile(resolve(root,file)))])))])));
}
const initialIdentity=await identities(),scriptSha256=sha(await readFile(new URL(import.meta.url)));
const queryUrl=pathToFileURL(resolve(baselineRoot,'src/inventory-query.js')),controlUrl=new URL(queryUrl);controlUrl.searchParams.set('round16','same-source-control');
const variants={baseline:await import(queryUrl),control:await import(controlUrl),current:await import(pathToFileURL(resolve(currentRoot,'src/inventory-query.js')))};
const E=await import(pathToFileURL(resolve(baselineRoot,'src/engine.js'))),S=await import(pathToFileURL(resolve(baselineRoot,'src/storage.js')));
const orders=[['baseline','control','current'],['current','control','baseline'],['control','baseline','current'],['current','baseline','control'],['baseline','current','control'],['control','current','baseline']];
const summary=values=>{const sorted=values.toSorted((a,b)=>a-b);return {n:values.length,p50:(sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2,p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1),min:sorted[0],mean:values.reduce((a,b)=>a+b,0)/values.length};};
function fixture(count){
  const state=E.newGame(20261017);state.runId=`round16-sort-${count}`;state.floor=140;state.player.level=80;
  while(state.player.items.length<count){const index=state.player.items.length;state.player.items.push(E.makeItem(state,['weapon','armor','relic'][index%3],index%8));}
  assert(S.validateSave(state));return state.player.items;
}
function evaluationCounts(items,run){
  const unique=[...new Set(items)],reads=new Map(unique.map(item=>[item,0])),descriptors=unique.map(item=>Object.getOwnPropertyDescriptor(item,'enhance'));
  try{
    for(const item of unique){const amount=item.enhance;Object.defineProperty(item,'enhance',{enumerable:true,configurable:true,get(){reads.set(item,reads.get(item)+1);return amount;}});}
    const result=run(),counts=[...reads.values()];return {result,total:counts.reduce((a,b)=>a+b,0),maxPerObject:Math.max(0,...counts),objectsRead:counts.filter(Boolean).length};
  }finally{for(const [index,item]of unique.entries())if(descriptors[index])Object.defineProperty(item,'enhance',descriptors[index]);else delete item.enhance;}
}
const small=fixture(100),medium=fixture(1000),large=fixture(10000),uniqueLevels=structuredClone(large),equal=structuredClone(large),search=structuredClone(large);
for(const [index,item]of uniqueLevels.entries())item.level=index+1;
for(const item of equal){item.level=80;item.levelXp=0;item.enhance=0;item.rarity=0;}
for(const item of search)item.name='普通装备';search[9999].name='尾部唯一 ECHO [Blade]';for(let index=9900;index<9960;index++)search[index].name='六十件候选';
const sorted=variants.baseline.selectInventoryItems(large,{inventorySort:'power'}),reversed=sorted.toReversed();
const cases=[
  {name:'empty-power',items:[],ui:{inventorySort:'power'}},
  {name:'single-power',items:small.slice(0,1),ui:{inventorySort:'power'}},
  ...[['small',small],['medium',medium],['large',large]].flatMap(([name,items])=>['power','rarity','level'].map(inventorySort=>({name:`${name}-${inventorySort}`,items,ui:{inventorySort}}))),
  {name:'large-levels-unique',items:uniqueLevels,ui:{inventorySort:'level'}},
  {name:'large-values-equal-power',items:equal,ui:{inventorySort:'power'}},
  {name:'large-values-equal-rarity',items:equal,ui:{inventorySort:'rarity'}},
  {name:'large-presorted-power',items:sorted,ui:{inventorySort:'power'}},
  {name:'large-reversed-power',items:reversed,ui:{inventorySort:'power'}},
  {name:'large-invalid-sort-fallback',items:large,ui:{inventorySort:'not-a-sort'}},
  {name:'large-slot-and-rarity',items:large,ui:{inventorySort:'power',inventorySlot:'relic',inventoryRarity:'7'}},
  {name:'large-search-none',items:search,ui:{inventorySort:'power',inventoryQuery:'不存在'}},
  {name:'large-search-one',items:search,ui:{inventorySort:'power',inventoryQuery:'  echo [blade]  '}},
  {name:'large-search-sixty',items:search,ui:{inventorySort:'power',inventoryQuery:'六十件候选'}},
];
const report={kind:'Round16 inventory selection cost and semantic comparison',status:'RUNNING',startedAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,cpuCount:cpus().length,baselineRoot,currentRoot,sourceHashes:initialIdentity,scriptSha256,verifyOnly,
  protocol:{scope:'Read-only filter-and-sort selector only. Plain fixture states are timed. No browser, HTML construction, storage, input-to-paint, GPU or natural gameplay claim.',fixture:'Synthetic seed 20261017; valid starting schema5 fixtures. Named ordering/filter edge cases then alter only selector inputs, outside timing. No real save is used.',control:'A second ES module instance from the exact same baseline inventory-query.js file, loaded with a query suffix; it shares baseline equipment.js. It controls selector code identity within this process, not host isolation.',counts:'Only after every native timing case has completed, getter counters observe enhance reads and restore each original descriptor. Every itemValue call reads enhance exactly once in the hashed equipment.js. Delaying all instrumentation prevents getters or descriptor changes from contaminating timed object shapes and inline caches. No runtime source is patched.',orders,warmupRounds:6,formalRounds:samples,p50:'mean of the two middle order statistics for even n',p95:'nearest rank ceil(n*.95); maxima and every raw sample are retained',limitations:['Shared-host scheduling and garbage collection can cause tails; same-source control is retained.','A faster selector alone cannot explain or close browser long frames.','Absolute costs and regressions for empty, unique-primary, already-sorted and narrowly-filtered cases remain visible.']},cases:[],loadBefore:loadavg()};
try{
  for(const {name,items,ui}of cases){
    const before=JSON.stringify(items),expected=variants.baseline.selectInventoryItems(items,ui),expectedIds=expected.map(item=>item.id);
    for(const [variant,Q]of Object.entries(variants)){
      const actual=Q.selectInventoryItems(items,ui);
      assert.deepEqual(actual,expected,`${name}/${variant} selected objects`);
      for(const [index,item]of actual.entries())assert.strictEqual(item,expected[index],`${name}/${variant} original reference at ${index}`);
    }
    assert.equal(JSON.stringify(items),before,`${name} caller preservation`);
    const entry={name,inventoryItems:items.length,selected:expected.length,ui,fixtureSha256:sha(before),selectedIdsSha256:sha(expectedIds),firstIds:expectedIds.slice(0,5),lastIds:expectedIds.slice(-5),counts:null,semantics:{fullOrderEqual:true,originalObjectsEqual:true,callerUnchanged:true},timing:{status:verifyOnly?'NOT_RUN':'RUNNING'}};
    if(!verifyOnly){
      const raw={baseline:[],control:[],current:[]},warmup={baseline:[],control:[],current:[]},usedOrders=[];
      for(let round=-6;round<samples;round++){
        const order=orders[(round+6)%orders.length];usedOrders.push({round,order});
        for(const variant of order){
          const started=performance.now(),result=variants[variant].selectInventoryItems(items,ui),elapsed=performance.now()-started;
          (round<0?warmup:raw)[variant].push(elapsed);
          assert.equal(result.length,expected.length);
          for(const [index,item]of result.entries())assert.strictEqual(item,expected[index]);
        }
      }
      entry.timing={status:'MEASURED_WITH_LIMITATIONS',usedOrders,warmupMs:warmup,rawMs:raw,summaryMs:Object.fromEntries(Object.entries(raw).map(([variant,values])=>[variant,summary(values)])),currentMinusBaselineMs:raw.current.map((value,index)=>value-raw.baseline[index]),controlMinusBaselineMs:raw.control.map((value,index)=>value-raw.baseline[index])};
    }
    assert.equal(JSON.stringify(items),before,`${name} timing caller preservation`);report.cases.push(entry);
  }
  report.nativeTimingCompletedAt=new Date().toISOString();
  for(const [caseIndex,{name,items,ui}]of cases.entries()){
    const before=JSON.stringify(items),expected=variants.baseline.selectInventoryItems(items,ui),counts={};
    for(const [variant,Q]of Object.entries(variants)){
      const measured=evaluationCounts(items,()=>Q.selectInventoryItems(items,ui));
      assert.deepEqual(measured.result,expected,`${name}/${variant} counted selection`);
      for(const [index,item]of measured.result.entries())assert.strictEqual(item,expected[index]);
      counts[variant]={itemValueCalls:measured.total,maxCallsPerObject:measured.maxPerObject,objectsEvaluated:measured.objectsRead};
    }
    assert.equal(JSON.stringify(items),before,`${name} counter restoration and caller preservation`);
    report.cases[caseIndex].counts=counts;
  }
  report.instrumentationCompletedAt=new Date().toISOString();
  assert.deepEqual(await identities(),initialIdentity,'Source must not change while comparing');assert.equal(sha(await readFile(new URL(import.meta.url))),scriptSha256,'Benchmark must not change while executing');
  report.sourceAndScriptStable=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
report.loadAfter=loadavg();report.memory=process.memoryUsage();report.resourceUsage=process.resourceUsage();report.completedAt=new Date().toISOString();
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,output,verificationCases:report.cases.length,cases:report.cases.map(({name,inventoryItems,selected,counts,timing})=>({name,inventoryItems,selected,counts,summaryMs:timing.summaryMs})),error:report.error},null,2));
