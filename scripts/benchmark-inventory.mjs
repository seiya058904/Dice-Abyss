// Reproducible HTML-construction benchmark. This does not measure browser
// layout, input-to-paint latency, frame rate or GPU work.
// node scripts/benchmark-inventory.mjs --baseline /path/to/input --samples 30 --output /tmp/inventory.json
// Without --baseline, records this build only; the project has no outside dependency.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args={};
for(let i=2;i<process.argv.length;i++){
 const split=process.argv[i].indexOf('=');
 if(split>=0)args[process.argv[i].slice(0,split)]=process.argv[i].slice(split+1);
 else args[process.argv[i]]=process.argv[++i];
}
const currentRoot=resolve(args['--source']||dirname(fileURLToPath(new URL('../package.json',import.meta.url))));
const baselineRoot=args['--baseline']?resolve(args['--baseline']):null;
const samples=Number(args['--samples']||30);
assert(Number.isInteger(samples)&&samples>=5&&samples<=500,'Use 5–500 samples');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function load(root){
 const E=await import(pathToFileURL(resolve(root,'src/engine.js'))),V=await import(pathToFileURL(resolve(root,'src/views.js'))),S=await import(pathToFileURL(resolve(root,'src/storage.js')));
 const version=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version;
 const sourceHashes=Object.fromEntries(await Promise.all(['src/views.js','src/engine.js','src/equipment.js'].map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 return {E,V,S,version,sourceHashes};
}
const current=await load(currentRoot),baseline=baselineRoot?await load(baselineRoot):null;
const ui={view:'inventory',inventorySort:'power',inventoryPage:0,busy:false,rolling:false,forging:false};
function fixture(count){
 const s=current.E.newGame(20261017);s.runId=`qa-inventory-20261017-${count}`;s.floor=140;s.player.level=80;
 while(s.player.items.length<count){const i=s.player.items.length;s.player.items.push(current.E.makeItem(s,['weapon','armor','relic'][i%3],i%8));}
 const latest=s.player.items.toReversed();
 for(const slot of ['weapon','armor'])s.player.equipped[slot]=latest.find(item=>item.slot===slot).id;
 const relics=latest.filter(item=>item.slot==='relic');
 for(const [index,slot]of ['relic','relic2','relic3'].entries())s.player.equipped[slot]=relics[index].id;
 s.player.hp=current.E.stats(s).maxHp;return s;
}
const cards=html=>(html.match(/<article\b[\s\S]*?<\/article>/g)||[]).join('');
function distribution(values){
 const sorted=values.toSorted((a,b)=>a-b),quantile=q=>sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];
 return {samples:values.length,p50Ms:quantile(.5),p95Ms:quantile(.95),maxMs:sorted.at(-1),minMs:sorted[0]};
}
const report={method:'Node gameView HTML-construction microbenchmark. Synthetic deterministic floor-140 inventories with all eight qualities and five newest items equipped; no gameplay progress claim. Three paired warmups, then A/B order alternates per sample. Durations exclude fixture construction, source reads, equality checks and output serialization.',node:process.version,renderingBackend:'No browser or GPU; JavaScript only',baseline:baseline?{version:baseline.version,sourceHashes:baseline.sourceHashes}:null,current:{version:current.version,sourceHashes:current.sourceHashes},cases:[],limitations:['No DOM insertion, style/layout, font rendering, storage or input latency is timed.','Shared host timings fluctuate; p95 and maximum retain observed tail costs.','The current fixture uses valid synthetic gear and must not be interpreted as a naturally played character.']};
for(const count of [100,1000,10000]){
 const s=fixture(count);assert(current.S.validateSave(s));if(baseline)assert(baseline.S.validateSave(s));
 const before=JSON.stringify(s);let comparedStates=0;
 if(baseline)for(const inventorySort of ['power','rarity','level'])for(const inventorySlot of ['','relic'])for(const inventoryRarity of ['',7])for(const inventoryPage of [0,1]){
  const selection={...ui,inventorySort,inventorySlot,inventoryRarity,inventoryPage};
  assert.equal(cards(current.V.center(s,selection)),cards(baseline.V.center(s,selection)),`Item-card equality: ${count}/${inventorySort}/${inventorySlot}/${inventoryRarity}/${inventoryPage}`);comparedStates++;
 }
 const durations={baseline:[],current:[]};let currentBytes=0,baselineBytes=0;
 const run=(target,record)=>{const build=target==='baseline'?baseline:current,t=performance.now(),html=build.V.gameView(s,ui),elapsed=performance.now()-t;if(record)durations[target].push(elapsed);if(target==='current')currentBytes=Buffer.byteLength(html);else baselineBytes=Buffer.byteLength(html);};
 for(let i=0;i<3;i++){if(baseline)run('baseline',false);run('current',false);}
 for(let i=0;i<samples;i++)for(const target of baseline?(i%2?['current','baseline']:['baseline','current']):['current'])run(target,true);
 assert.equal(JSON.stringify(s),before,'Benchmark views cannot mutate the fixture');
 const result={items:count,fixtureSha256:hash(before),itemCardComparisons:comparedStates,itemCardsIdentical:baseline?true:null,unchangedState:true,current:{...distribution(durations.current),htmlBytes:currentBytes}};
 if(baseline){result.baseline={...distribution(durations.baseline),htmlBytes:baselineBytes};result.p50ReductionPercent=(1-result.current.p50Ms/result.baseline.p50Ms)*100;}
 report.cases.push(result);
}
const json=JSON.stringify(report,null,2)+'\n';
if(args['--output']){const output=resolve(args['--output']);await mkdir(dirname(output),{recursive:true});await writeFile(output,json);}
console.log(json);
