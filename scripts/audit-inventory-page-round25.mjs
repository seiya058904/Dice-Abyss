// Deterministic workload/semantic audit. No clocks, FPS or native-latency claim.
// node scripts/audit-inventory-page-round25.mjs --baseline-source=/old \
//   --current-source=/new --output=/tmp/fresh-page-workload
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const index=arg.indexOf('=');return [arg.slice(2,index),arg.slice(index+1)];}));
assert(args['baseline-source']&&args['current-source']&&args.output,'Supply two source roots and a fresh external output directory');
const output=path.resolve(args.output),sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const variants=[];
for(const label of ['baseline','current']){
  const root=path.resolve(args[label+'-source']);assert(output!==root&&!output.startsWith(root+path.sep));
  const [E,S,V,Q]=await Promise.all(['engine','storage','views','inventory-query'].map(name=>import(pathToFileURL(path.join(root,'src',name+'.js')))));
  variants.push({label,root,E,S,V,Q});
}
const [baseline,current]=variants;
current.P=await import(pathToFileURL(path.join(current.root,'src/inventory-page.js')));
const files=['src/app.js','src/views.js','src/inventory-query.js','src/inventory-page.js','src/engine.js','src/equipment.js','src/storage.js'];
async function identities(){return Object.fromEntries(await Promise.all(variants.map(async variant=>[variant.label,Object.fromEntries(await Promise.all(files.map(async file=>{
  try{const bytes=await fs.readFile(path.join(variant.root,file));return [file,{bytes:bytes.length,sha256:sha(bytes)}];}
  catch(error){if(error.code==='ENOENT'&&file==='src/inventory-page.js')return [file,null];throw error;}
})))])));}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const report={status:'RUNNING',startedAt:new Date().toISOString(),scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore:await identities(),
  protocol:{scope:'Full-bag read selection and complete inventory HTML. Counters run only in explicitly instrumented semantic workload; no duration, native input, DOM, layout, paint or transaction performance claim.',
  fixture:'Synthetic seed27017, floor200/level100, schema5 10000-item bag; no private save.',
  counter:'A persistent Proxy wraps only the input array filter method. It counts actual callbacks across all inventory entries. Temporary enhance getters count value evaluations, since unchanged equipment.itemValue reads enhance once. All descriptors/array identity are restored before uninstrumented complete HTML/save checks.',
  lifecycle:'Each criteria block begins with an explicit uncached read; five following pageOnly calls may reuse that one result. Every actual filter/search remains fresh. Complete center(s,ui) remains stateless. Root native A/B decides the release.',
  pages:[0,1,2,1,0],criteria:['all-power','weapon-power','armor-level','relic-rarity','defense-regen','empty-query'],
  limitation:'Caller must preserve committed state snapshots during page-only browsing, as the current app does. In-place mutation without clear is outside this private app-owned cache contract; transactions never read it.'},counts:[],html:[],stateChecks:[]};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
function fixture(variant){
  const state=variant.E.newGame(27017);state.runId='round25-inventory-page-workload';state.floor=200;state.player.level=100;state.player.gold=1000000;
  while(state.player.items.length<10000)state.player.items.push(variant.E.makeItem(state,undefined,state.nextId%8));
  state.player.hp=variant.E.stats(state).maxHp;state.futureMetadata={nested:['雪 😀',null,{preserve:17}]};
  assert(variant.S.validateSave(state));return state;
}
const states=variants.map(fixture);assert.deepEqual(states[0],states[1]);
const raw=baseline.S.encodeSave(states[0]);assert.equal(current.S.encodeSave(states[1]),raw);
report.fixture={items:10000,sha256:sha(states[0]),saveSha256:sha(raw),saveBytes:Buffer.byteLength(raw)};
function instrument(state){
  const original=state.player.items,descriptors=original.map(item=>Object.getOwnPropertyDescriptor(item,'enhance'));
  let counts={filterCalls:0,filterCallbacks:0,valueReads:0};
  for(const item of original){const value=item.enhance;Object.defineProperty(item,'enhance',{enumerable:true,configurable:true,get(){counts.valueReads++;return value;}});}
  state.player.items=new Proxy(original,{get(target,key,receiver){
    if(key==='filter')return function(callback,thisArg){counts.filterCalls++;return Array.prototype.filter.call(this,(item,index,array)=>{counts.filterCallbacks++;return callback.call(thisArg,item,index,array);});};
    return Reflect.get(target,key,receiver);
  }});
  return {
    run(callback){counts={filterCalls:0,filterCallbacks:0,valueReads:0};const value=callback();return {value,counts:{...counts}};},
    restore(){state.player.items=original;for(let index=0;index<original.length;index++)Object.defineProperty(original[index],'enhance',descriptors[index]);},
  };
}
const choices=[['all-power',{inventorySort:'power'}],['weapon-power',{inventorySlot:'weapon',inventorySort:'power'}],['armor-level',{inventorySlot:'armor',inventorySort:'level'}],['relic-rarity',{inventorySlot:'relic',inventorySort:'rarity'}],['defense-regen',{inventoryDefense:'regen'}],['empty-query',{inventoryQuery:'不存在'}]];
try{
  const probes=states.map(instrument),cache=current.P.createInventoryPageSelection();
  try{
    for(const [name,criteria]of choices){
      const ui={view:'inventory',...criteria};
      const first=probes.map((probe,index)=>probe.run(()=>index?cache.read(states[index],ui):baseline.Q.selectInventoryItems(states[index].player.items,ui)));
      assert.deepEqual(first[1].value,first[0].value);assert.deepEqual(first[1].counts,first[0].counts,'First explicit read does the original selection work');
      report.counts.push({criteria:name,action:'explicit-filter',selected:first[0].value.length,baseline:first[0].counts,current:first[1].counts,fullOrderedIdsSha256:sha(first[0].value.map(item=>item.id))});
      for(const page of report.protocol.pages){
        const nextUi={...ui,inventoryPage:page};
        const rows=probes.map((probe,index)=>probe.run(()=>index?cache.read(states[index],nextUi,{pageOnly:true}):baseline.Q.selectInventoryItems(states[index].player.items,nextUi)));
        assert.deepEqual(rows[1].value,rows[0].value);assert.equal(rows[1].value,first[1].value);assert.deepEqual(rows[1].counts,{filterCalls:0,filterCallbacks:0,valueReads:0});
        report.counts.push({criteria:name,action:'consecutive-page',page,selected:rows[0].value.length,baseline:rows[0].counts,current:rows[1].counts,fullOrderedIdsSha256:sha(rows[0].value.map(item=>item.id))});
      }
    }
  }finally{probes.forEach(probe=>probe.restore());}
  for(let index=0;index<variants.length;index++){const encoded=variants[index].S.encodeSave(states[index]);assert.equal(encoded,raw);assert.deepEqual(variants[index].S.decodeSave(encoded),states[index]);report.stateChecks.push({variant:variants[index].label,saveSha256:sha(encoded),exactBeforeAfter:true});}
  const plainCache=current.P.createInventoryPageSelection();
  for(const [name,criteria]of choices){
    plainCache.read(states[1],criteria);
    for(const page of report.protocol.pages){
      const ui={view:'inventory',...criteria,inventoryPage:page},selected=plainCache.read(states[1],ui,{pageOnly:true});
      const expected=baseline.V.center(states[0],ui),actual=current.V.center(states[1],ui,undefined,selected),uncached=current.V.center(states[1],ui);
      assert.equal(actual,expected);assert.equal(uncached,expected);report.html.push({criteria:name,page,bytes:Buffer.byteLength(actual),sha256:sha(actual),equalBaselineAndStatelessCurrent:true});
    }
  }
  assert.equal(current.S.encodeSave(states[1]),raw);assert.equal(baseline.S.encodeSave(states[0]),raw);
  report.sourceAfter=await identities();assert.deepEqual(report.sourceAfter,report.sourceBefore);report.status='PASS';
}catch(error){report.status='FAIL';report.failure={message:String(error),stack:error.stack};process.exitCode=1;}
report.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({status:report.status,workloadRows:report.counts.length,completeHtmlPairs:report.html.length,output,failure:report.failure}));
