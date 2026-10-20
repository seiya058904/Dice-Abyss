// Differential correctness/work audit; optional Node microbenchmark.
// Run from the project root. Results must be written outside the project:
// node scripts/audit-inventory-sort-round26.mjs --baseline /path/to/input/Dice-Abyss --output /tmp/dice-sort-r26.json
// Add --measure for a SERIAL benchmark, never alongside other QA workloads.
// Without --baseline, the reference is the embedded v5.25.0 selector below,
// using the current unchanged equipment/normalization helpers. This is NOT a
// reconstructed full release and cannot establish end-to-end browser latency.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,lstat,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,basename,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import * as E from '../src/engine.js';
import {itemStats,itemValue} from '../src/equipment.js';
import {encodeSave} from '../src/storage.js';
import {center} from '../src/views.js';
import {inventoryQuery,inventoryDefense,selectInventoryItems} from '../src/inventory-query.js';

function uploadedSelection(items,ui={}) {
  const query=inventoryQuery(ui.inventoryQuery).toLowerCase(),defense=inventoryDefense(ui.inventoryDefense);
  return items.filter(item=>(!ui.inventorySlot||item.slot===ui.inventorySlot)
    &&(ui.inventoryRarity==null||ui.inventoryRarity===''||item.rarity===Number(ui.inventoryRarity))
    &&(!query||item.name.toLowerCase().includes(query))
    &&(!defense||itemStats(item)[defense]>0))
    .toSorted((a,b)=>ui.inventorySort==='rarity'?b.rarity-a.rarity||itemValue(b)-itemValue(a)
      :ui.inventorySort==='level'?b.level-a.level||itemValue(b)-itemValue(a)
      :itemValue(b)-itemValue(a));
}
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const allowed=new Set(['--baseline','--output','--measure','--samples','--iterations']);
for(let index=0;index<args.length;index++){
  const flag=args[index];assert(allowed.has(flag),`Unknown option ${flag}`);
  if(flag!=='--measure'){assert(args[index+1]&&!args[index+1].startsWith('--'),`Missing value for ${flag}`);index++;}
}
assert(option('--output'),'An explicit external --output path is required');
const baselineRoot=option('--baseline')?resolve(option('--baseline')):undefined;
const protectedRoots=await Promise.all([root,baselineRoot].filter(Boolean).map(path=>realpath(path)));
const within=(parent,path)=>{const rel=relative(parent,path);return rel===''||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel));};
async function checkedOutput(requested){
  const file=resolve(requested);
  // lstat also catches dangling final symlinks. Reject before constructing any
  // fixtures or collecting timings, rather than after an expensive audit.
  try{await lstat(file);assert.fail('Refusing existing output; choose a new evidence path');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  let parent=dirname(file);const missing=[basename(file)];
  for(;;){
    let found;
    try{found=await lstat(parent);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(found){
      // Resolve only an existing ancestor. A dangling symlink or a non-directory
      // parent is an error, not an invitation to create an alternative path.
      const actualParent=await realpath(parent);
      assert((await stat(actualParent)).isDirectory(),'Output parent must be a directory');
      const actual=resolve(actualParent,...missing);
      for(const protectedRoot of protectedRoots)assert(!within(protectedRoot,actual),'Output must be outside both current and baseline source trees, including symlink aliases');
      return actual;
    }
    missing.unshift(basename(parent));const next=dirname(parent);
    assert(next!==parent,'Output requires an existing directory ancestor');parent=next;
  }
}
const output=await checkedOutput(option('--output'));
const measure=args.includes('--measure'),samples=Number(option('--samples')||12),iterations=Number(option('--iterations')||10);
assert(Number.isSafeInteger(samples)&&samples>=2&&samples<=100,'Samples must be an integer from 2 to 100');
assert(Number.isSafeInteger(iterations)&&iterations>=1&&iterations<=100,'Iterations must be an integer from 1 to 100');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function identity(file){const bytes=await readFile(file);return {path:file,bytes:bytes.length,sha256:hash(bytes)};}
let reference=uploadedSelection,baselineIdentity={kind:'EMBEDDED_V5_25_SELECTOR_ONLY',description:'Exact prior selector algorithm; current equipment and normalizers. Not the full baseline release.'};
if(baselineRoot){
  const baseline=baselineRoot,file=resolve(baseline,'src/inventory-query.js');
  assert(file!==resolve(root,'src/inventory-query.js'),'Baseline cannot be the current selector');
  reference=(await import(pathToFileURL(file))).selectInventoryItems;
  baselineIdentity={kind:'EXPLICIT_BASELINE_MODULE',root:baseline,selector:await identity(file),equipment:await identity(resolve(baseline,'src/equipment.js'))};
}
const report={protocol:'inventory-sort-round26',dateUTC:new Date().toISOString(),status:'RUNNING',
  environment:{node:process.version,platform:process.platform,arch:process.arch,renderingBackend:'NONE: Node CPU only'},
  scope:'Selector order/work and complete inventory HTML. Node timings exclude DOM/layout, browser scheduling, storage, rendering and GPU.',
  reference:baselineIdentity,current:{selector:await identity(resolve(root,'src/inventory-query.js')),equipment:await identity(resolve(root,'src/equipment.js'))},
  benchmark:{enabled:measure,predeclaredCells:18,samplesPerCell:measure?samples:0,iterationsPerSample:measure?iterations:0,warmups:measure?5:0,order:'Alternating baseline/current then current/baseline per pair',quantiles:'Nearest-rank, using ceil(n*q)-1; at 12 samples p95/p99 equal max',scenarios:'3/8/100/1000/10000-item standard bags, each in all three sorts; unique-level 8/10000; unique-rarity 8'},
  fixtures:[],work:[],timing:[],htmlPairs:0,selectionPairs:0,notes:['Constructed fixed-seed inventories; not natural gameplay.','Power work is counted through enhance getters on a separate fixture; timing uses ordinary plain objects.','Each timing observation is mean milliseconds per selection over the declared iterations. No FPS claim.']};
function fixture(count){
  const state=E.newGame(26026);state.runId='round26-inventory-sort';state.floor=400;state.player.level=100;
  while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
  state.player.hp=E.stats(state).maxHp;state.futureMetadata={nested:['雪 😀',null,{keep:17}]};
  return state;
}
function equivalent(items,ui){
  const before=reference(items,ui),after=selectInventoryItems(items,ui);
  assert.deepEqual(after,before);
  for(let index=0;index<after.length;index++)assert.equal(after[index],before[index]);
  report.selectionPairs++;return before;
}
function distribution(values){
  const ordered=values.toSorted((a,b)=>a-b),q=p=>ordered[Math.max(0,Math.ceil(ordered.length*p)-1)];
  return {n:values.length,p50:q(.5),p95:q(.95),p99:q(.99),min:ordered[0],max:ordered.at(-1)};
}
function recordTiming(items,ui,scenario){
  if(!measure)return;
  for(let warmup=0;warmup<5;warmup++){reference(items,ui);selectInventoryItems(items,ui);}
  const pairs=[];
  for(let pair=0;pair<samples;pair++){
    const row={pair,order:pair%2?'current-baseline':'baseline-current'};
    const run=(fn,key)=>{const start=performance.now();for(let k=0;k<iterations;k++)fn(items,ui);row[key]=(performance.now()-start)/iterations;};
    if(pair%2){run(selectInventoryItems,'currentMs');run(reference,'baselineMs');}
    else{run(reference,'baselineMs');run(selectInventoryItems,'currentMs');}
    pairs.push(row);
  }
  report.timing.push({items:items.length,scenario,sort:ui.inventorySort,baseline:distribution(pairs.map(row=>row.baselineMs)),current:distribution(pairs.map(row=>row.currentMs)),directions:{faster:pairs.filter(row=>row.currentMs<row.baselineMs).length,slower:pairs.filter(row=>row.currentMs>row.baselineMs).length,equal:pairs.filter(row=>row.currentMs===row.baselineMs).length},pairs});
}
try{
  for(const count of [3,8,100,1000,10000]){
    const state=fixture(count),saved=encodeSave(state);
    report.fixtures.push({items:count,seed:26026,saveBytes:Buffer.byteLength(saved),saveSha256:hash(saved)});
    for(const sort of ['power','rarity','level']){
      const ui={view:'inventory',inventorySort:sort};equivalent(state.player.items,ui);
      for(const extra of [{inventorySlot:'armor'},{inventoryRarity:'7'},{inventoryDefense:'regen'},{inventoryQuery:'之'},{inventoryQuery:'不存在'}])equivalent(state.player.items,{...ui,...extra});
      let reads=0;
      const counted=state.player.items.map(item=>({...item,get enhance(){reads++;return item.enhance;}}));
      reference(counted,ui);const baselineReads=reads;reads=0;selectInventoryItems(counted,ui);const currentReads=reads;
      assert(currentReads<=count);assert(currentReads<=baselineReads);
      report.work.push({items:count,scenario:'standard',sort,baselinePowerReads:baselineReads,currentPowerReads:currentReads,savedPowerReads:baselineReads-currentReads});
      for(const inventoryPage of [0,1,99]){
        const page={...ui,inventoryPage},expected=reference(state.player.items,page);
        assert.equal(center(state,page),center(state,page,undefined,expected));report.htmlPairs++;
      }
      recordTiming(state.player.items,ui,'standard');
    }
    assert.equal(encodeSave(state),saved);
  }
  for(const [sort,count]of [['level',8],['level',10000],['rarity',8]]){
    const state=fixture(count),ui={inventorySort:sort};
    const items=state.player.items.map((item,index)=>({...item,[sort]:sort==='level'?index+1:index}));
    equivalent(items,ui);let reads=0;
    const counted=items.map(item=>({...item,get enhance(){reads++;return item.enhance;}}));
    reference(counted,ui);const baselineReads=reads;reads=0;selectInventoryItems(counted,ui);const currentReads=reads;
    assert.equal(baselineReads,0);assert.equal(currentReads,0);
    report.work.push({items:count,scenario:'unique-primary',sort,baselinePowerReads:0,currentPowerReads:0,savedPowerReads:0});
    recordTiming(items,ui,'unique-primary');
  }
  assert.equal(report.work.length,report.benchmark.predeclaredCells);
  if(measure)assert.equal(report.timing.length,report.benchmark.predeclaredCells);
  report.status='PASS';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
await mkdir(dirname(output),{recursive:true});await checkedOutput(output);
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,output,reference:report.reference.kind,selectionPairs:report.selectionPairs,htmlPairs:report.htmlPairs,workCells:report.work.length,timingCells:report.timing.length}));
