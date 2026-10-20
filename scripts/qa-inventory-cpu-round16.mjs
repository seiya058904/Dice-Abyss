// Browser synchronous-JavaScript attribution, using canonical application modules.
// External PLAYWRIGHT_MODULE + CHROMIUM_PATH; no game/runtime dependency is added.
// Never equate these elapsed intervals with pure CPU time, paint, frames, or FPS.
// node scripts/qa-inventory-cpu-round16.mjs --baseline-source /input/Dice-Abyss --source . --output /tmp/inventory-cpu.json [--smoke]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,loadavg,freemem,totalmem} from 'node:os';

const args={};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==='--smoke')args[key]=true;
  else{assert(['--baseline-source','--source','--baseline-url','--after-url','--output'].includes(key),`Unknown option ${key}`);assert(process.argv[i+1],`Missing value for ${key}`);args[key]=process.argv[++i];}
}
assert(args['--baseline-source']&&args['--output'],'Supply --baseline-source and --output.');
const seed=20261017,smoke=!!args['--smoke'],output=resolve(args['--output']);
const variants=[{label:'baseline',root:resolve(args['--baseline-source']),url:args['--baseline-url']||'http://127.0.0.1:4190/'},{label:'after',root:resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),url:args['--after-url']||'http://127.0.0.1:4191/'}];
for(const v of variants){const u=new URL(v.url);assert(['http:','https:'].includes(u.protocol));assert(['localhost','127.0.0.1','[::1]'].includes(u.hostname),'Use isolated loopback test URLs only.');v.url=u.href;}
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const moduleAt=(root,file)=>pathToFileURL(resolve(root,file));
const sortUi=inventorySort=>({view:'inventory',inventorySort,inventoryPage:0,inventorySlot:'',inventoryRarity:'',inventoryQuery:'',busy:false,rolling:false,forging:false});
async function runtimeIdentity(root,directory='src'){
  const files=[];
  for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})){
    const file=posix.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await runtimeIdentity(root,file));
    else if(/\.(js|css)$/.test(entry.name)){const bytes=await readFile(resolve(root,file));files.push({file,bytes:bytes.length,sha256:sha(bytes)});}
  }
  return files.toSorted((a,b)=>a.file.localeCompare(b.file));
}
async function identities(){return Object.fromEntries(await Promise.all(variants.map(async v=>{
  const files=await runtimeIdentity(v.root);
  for(const file of ['index.html','package.json']){const bytes=await readFile(resolve(v.root,file));files.push({file,bytes:bytes.length,sha256:sha(bytes)});}
  return [v.label,files];
})));}
const sourceBefore=await identities(),scriptSha256=sha(await readFile(new URL(import.meta.url))),modules={};
for(const v of variants)modules[v.label]={E:await import(moduleAt(v.root,'src/engine.js')),S:await import(moduleAt(v.root,'src/storage.js')),Q:await import(moduleAt(v.root,'src/inventory-query.js')),V:await import(moduleAt(v.root,'src/views.js'))};
const {E,S}=modules.baseline,keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
assert.deepEqual({main:modules.after.S.SAVE_KEY,mirror:modules.after.S.BACKUP_KEY,settings:modules.after.S.SETTINGS_KEY},keys);

// This recipe and the pinned raw hashes match qa-inventory-sort-round16.mjs.
function fixture(count){
  let state=E.newGame(seed);state.runId=`round16-mixed-inventory-${count}-${seed}`;state.floor=140;state.player.level=80;state.player.gold=500000;state.fate=[6,6];
  state.route=Array.from({length:6},(_,index)=>({id:`f140r${index}`,type:index===0?'rest':index===5?'boss':'combat',quality:0,done:false}));state.roomIndex=0;state.phase='route';state.player.hp=E.stats(state).maxHp;
  state=E.transition(state,{type:'enter'});assert.equal(state.phase,'rest');
  while(state.player.items.length<count){const index=state.player.items.length;state.player.items.push(E.makeItem(state,['weapon','armor','relic'][index%3],index%8));}
  for(const [index,item]of state.player.items.entries()){item.level=1+(index*37)%220;item.enhance=index%21;item.locked=index%97===0;}
  const latest=state.player.items.toReversed();
  for(const slot of ['weapon','armor'])state.player.equipped[slot]=latest.find(item=>item.slot===slot).id;
  const relics=latest.filter(item=>item.slot==='relic');for(const [index,slot]of ['relic','relic2','relic3'].entries())state.player.equipped[slot]=relics[index].id;
  state.player.hp=E.stats(state).maxHp;state.round16UnknownMetadata={kept:['synthetic',seed,{items:count}]};
  for(const {S:storage}of Object.values(modules))assert(storage.validateSave(state),'Fixture must be valid in both versions.');
  const raw=S.encodeSave(state);assert.equal(modules.after.S.encodeSave(state),raw);
  const pinned={243:'fd896888bc56fb931c365157e29b30764f4e443d77951dc8104df59f3db953be',10000:'4b2aaab906625cc4f2c9e321eb4bc39048dabf039feac6d67b9849a51496c621'};
  assert.equal(sha(raw),pinned[count],'Fixture bytes must match the original registered UI benchmark.');
  const indices=new Map(state.player.items.map((item,index)=>[item,index])),oracles={};
  for(const v of variants){
    oracles[v.label]={};
    for(const sort of ['power','rarity','level']){
      const selected=modules[v.label].Q.selectInventoryItems(state.player.items,sortUi(sort));
      const order=selected.map(item=>{assert(indices.has(item));return indices.get(item);}),html=modules[v.label].V.center(state,sortUi(sort));
      oracles[v.label][sort]={order,html,orderSha256:sha(order),htmlSha256:sha(html)};
    }
  }
  for(const sort of ['power','rarity','level'])assert.deepEqual(oracles.after[sort].order,oracles.baseline[sort].order,'Full selection order must agree across versions.');
  assert.equal(S.encodeSave(state),raw,'Oracle construction must not change the fixture.');
  return {count,state,raw,oracles,manifest:{count,seed,runId:state.runId,rng:state.rng,phase:state.phase,rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:sha(raw),stateSha256:sha(state),equippedIds:E.equippedIds(state)}};
}
const fixtures=[fixture(243),fixture(10000)];
const report={protocol:'round16-browser-sync-js-attribution',status:'RUNNING',mode:smoke?'SMOKE':'FORMAL',synthetic:true,seed,startedAt:new Date().toISOString(),scriptSha256,sourceBefore,variants,fixtureManifest:fixtures.map(f=>f.manifest),
  method:{scenarios:[243,10000],warmupPairs:smoke?0:1,formalPairs:smoke?1:12,callsPerPhasePerPair:1,formalPhaseCalls:smoke?24:288,warmupPhaseCalls:smoke?0:24,
    pairOrder:'AB on odd formal pairs, BA on even pairs; declared warmup AB.',
    operationOrder:'Rotate power/rarity/level, rarity/level/power, level/power/rarity across formal rounds; selector then center on odd rounds, center then selector on even rounds. Both versions get the same order in each pair; warmup uses power/rarity/level, selector then center.',
    moduleIdentity:'Exact canonical src/inventory-query.js, src/views.js and src/storage.js URLs, already requested by the loaded application; dynamic import reuses the browser module map. No copied, transformed or query-suffixed function body.',
    state:'Separate production-decodeSave snapshot of the exact synthetic save also loaded by the real app. Not a handle to the private app state. All original item references and the complete decoded state are checked outside timing.',
    setup:'One real Continue then one real Inventory click per version/fixture verifies the visible first 60 IDs and full card DOM. This setup warms the application power path before the explicitly recorded warmup pair. Two rAF callbacks settle each version sequence outside all timed intervals.',
    boundary:'performance.now immediately around exactly one selectInventoryItems(items,ui) or center(state,ui) synchronous call in the page. No DOM insertion, getter instrumentation, serialization, hashing, assertions or await inside the interval.',
    interpretation:'Synchronous JavaScript elapsed time, including any GC or host preemption during the call; not OS thread CPU time, event-to-frame latency, paint, FPS or physical-device/GPU performance.',
    nesting:'center includes its own selector call, safe-salvage analysis and first-60-card HTML construction. The separately measured phases are not additive, and their subtraction is not a measured render-only interval.',
    allocation:'Normal production allocation is retained. Exact-result/state checks outside the interval also allocate and may influence later GC; no forced GC, object getters or manual JIT controls are used.',
    sampling:'Fixed 12 pairs plus one warmup, all samples retained, no retry, adaptive rounds, outlier removal or stopping on a favorable result. --smoke is one separate pair and is never pooled. Small single-call samples may be timer-quantized.',
    quantiles:'p50 is middle-two mean; p95 is nearest rank ceil(n*.95), hence max for n=12.',
    evidence:'Complete selection order/original references, exact own-source center HTML, in-memory full state and UI settings, and both original stored strings checked every measured call. Report contains hashes and samples, never the full save or HTML.',
    viewport:{width:1920,height:1080,deviceScaleFactor:1},settings:{sound:false,effects:'low',scale:1}},
  host:{node:process.version,cpu:cpus()[0]?.model,cpuCount:cpus().length,totalMemory:totalmem(),loadBefore:loadavg(),freeMemoryBefore:freemem()},httpIdentity:[],contexts:[],orders:[],runs:[],aggregates:[],paired:[],errors:[]};
const save=async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');};
const summary=values=>{assert(values.length&&values.every(Number.isFinite));const s=values.toSorted((a,b)=>a-b);return {n:s.length,p50:(s[(s.length-1)>>1]+s[s.length>>1])/2,p95:s[Math.ceil(s.length*.95)-1],min:s[0],max:s.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length};};
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');assert(process.env.CHROMIUM_PATH,'Set CHROMIUM_PATH to the environment-owned Chromium executable.');
const launchArgs=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
report.browserConfiguration={headless:true,launchArgs,rendering:'ANGLE SwiftShader software rendering, matching the original UI protocol.'};
let browser;const contexts=[],httpVerified=new Set();
async function fresh(variant,f){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});contexts.push(context);
  await context.addInitScript(()=>performance.setResourceTimingBufferSize(2048));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push({kind:'pageerror',text:String(e)}));page.on('console',m=>{if(m.type()==='error')errors.push({kind:'console',text:m.text()});});
  await page.goto(variant.url,{waitUntil:'domcontentloaded'});
  if(!httpVerified.has(variant.label)){
    const checks=[];
    for(const expected of sourceBefore[variant.label].filter(file=>file.file!=='package.json')){
      const response=await page.request.get(new URL(expected.file,variant.url).href),bytes=await response.body();assert.equal(response.status(),200);assert.equal(sha(bytes),expected.sha256,`HTTP identity: ${variant.label} ${expected.file}`);checks.push({file:expected.file,status:200,bytes:bytes.length,sha256:sha(bytes)});
    }
    report.httpIdentity.push({label:variant.label,checks});httpVerified.add(variant.label);
  }
  await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw:f.raw,keys});
  await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.game-shell[data-scene="rest"]').waitFor();await page.evaluate(()=>document.fonts.ready);
  const metadata=await page.evaluate(async({raw,keys,oracles})=>{
    const urls=Object.fromEntries(['inventory-query','views','storage'].map(name=>[name,new URL(`src/${name}.js`,location.href).href]));
    const resources=performance.getEntriesByType('resource').map(entry=>entry.name),alreadyLoaded=Object.fromEntries(Object.entries(urls).map(([name,url])=>[name,resources.includes(url)]));
    const [Q,V,S]=await Promise.all([import(urls['inventory-query']),import(urls.views),import(urls.storage)]);
    const state=S.decodeSave(raw),stateJson=JSON.stringify(state),payload=JSON.parse(raw).payload,uis={};
    for(const sort of ['power','rarity','level']){uis[sort]={view:'inventory',inventorySort:sort,inventoryPage:0,inventorySlot:'',inventoryRarity:'',inventoryQuery:'',busy:false,rolling:false,forging:false};oracles[sort].references=oracles[sort].order.map(index=>state.player.items[index]);}
    window.__round16Cpu={Q,V,state,stateJson,raw,keys,uis,uiJson:JSON.stringify(uis),oracles};
    return {urls,alreadyLoaded,stateExact:stateJson===payload,mainExact:localStorage.getItem(keys.main)===raw,mirrorExact:localStorage.getItem(keys.mirror)===raw,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,effects:document.documentElement.dataset.effects,visibility:document.visibilityState,crossOriginIsolated};
  },{raw:f.raw,keys,oracles:f.oracles[variant.label]});
  assert(Object.values(metadata.alreadyLoaded).every(Boolean),'Canonical modules must already have been loaded by the real application.');
  assert(metadata.stateExact&&metadata.mainExact&&metadata.mirrorExact);assert.equal(metadata.visibility,'visible');assert.equal(metadata.effects,'low');assert.equal(metadata.release,JSON.parse(await readFile(resolve(variant.root,'package.json'),'utf8')).version);
  await page.locator('.main-nav [data-action="inventory"]').click();await page.locator('.inventory-screen').waitFor();
  const setup=await page.evaluate(()=>{
    const b=window.__round16Cpu,expected=new DOMParser().parseFromString(b.oracles.power.html,'text/html'),cards=root=>[...root.querySelectorAll('.inventory-list .item-card')];
    const actual=cards(document),oracle=cards(expected);
    return {visibleCards:actual.length,idsExact:actual.length===60&&actual.every((card,index)=>card.querySelector('[data-action="lock"]')?.dataset.id===b.oracles.power.references[index].id),cardsExact:actual.length===oracle.length&&actual.every((card,index)=>card.outerHTML===oracle[index].outerHTML),mainExact:localStorage.getItem(b.keys.main)===b.raw,mirrorExact:localStorage.getItem(b.keys.mirror)===b.raw};
  });
  assert(setup.idsExact&&setup.cardsExact&&setup.mainExact&&setup.mirrorExact);assert.deepEqual(errors,[]);
  report.contexts.push({label:variant.label,count:f.count,...metadata,setup,rawSha256:f.manifest.rawSha256,oracles:Object.fromEntries(Object.entries(f.oracles[variant.label]).map(([sort,o])=>[sort,{orderSha256:o.orderSha256,htmlSha256:o.htmlSha256}]))});
  return {variant,f,context,page,errors};
}
async function measure(entry,sort,phase,roundInfo){
  const measured=await entry.page.evaluate(({sort,phase})=>{
    const b=window.__round16Cpu,ui=b.uis[sort],items=b.state.player.items,state=b.state,select=b.Q.selectInventoryItems,center=b.V.center;
    let start,end,result;
    if(phase==='selector'){start=performance.now();result=select(items,ui);end=performance.now();}
    else{start=performance.now();result=center(state,ui);end=performance.now();}
    const expected=b.oracles[sort];
    const resultExact=phase==='selector'?result!==items&&result.length===expected.references.length&&result.every((item,index)=>item===expected.references[index]):result===expected.html;
    return {start,end,elapsedMs:end-start,resultExact,resultLength:result.length,stateExact:JSON.stringify(state)===b.stateJson,uiExact:JSON.stringify(b.uis)===b.uiJson,mainExact:localStorage.getItem(b.keys.main)===b.raw,mirrorExact:localStorage.getItem(b.keys.mirror)===b.raw,visibility:document.visibilityState};
  },{sort,phase});
  const oracle=entry.f.oracles[entry.variant.label][sort],row={label:entry.variant.label,count:entry.f.count,...roundInfo,sort,phase,...measured,expectedResultSha256:phase==='selector'?oracle.orderSha256:oracle.htmlSha256,saveSha256:entry.f.manifest.rawSha256,status:'CHECKING'};
  report.runs.push(row);
  assert(row.resultExact&&row.stateExact&&row.uiExact&&row.mainExact&&row.mirrorExact,`${phase}/${sort}: complete output and original state/save must stay exact.`);assert.equal(row.visibility,'visible');assert(Number.isFinite(row.elapsedMs)&&row.elapsedMs>=0);assert.deepEqual(entry.errors,[]);row.status='PASS';
}
try{
  await save();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:launchArgs});report.browserVersion=browser.version();
  for(const f of fixtures){
    const entries=[];for(const v of variants)entries.push(await fresh(v,f));
    for(let round=smoke?1:0;round<=(smoke?1:12);round++){
      const warmup=round===0,order=warmup||round%2?entries:entries.toReversed(),pairOrder=order.map(e=>e.variant.label),offset=warmup?0:(round-1)%3,base=['power','rarity','level'],sortOrder=[...base.slice(offset),...base.slice(0,offset)],phaseOrder=warmup||round%2?['selector','center']:['center','selector'];
      report.orders.push({count:f.count,round,warmup,pairOrder,sortOrder,phaseOrder});
      for(const [position,entry]of order.entries()){
        report.activeCase={count:f.count,label:entry.variant.label,round,warmup};await entry.page.bringToFront();await entry.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        for(const sort of sortOrder)for(const phase of phaseOrder)await measure(entry,sort,phase,{round,warmup,pairOrder,position:position+1,sortOrder,phaseOrder});
      }
      await save();console.log(`${f.count} ${warmup?'warmup':`pair ${round}`} complete`);
    }
    for(const entry of entries){assert.deepEqual(entry.errors,[]);await entry.context.close();}
  }
  for(const f of fixtures)for(const sort of ['power','rarity','level'])for(const phase of ['selector','center']){
    const rows=report.runs.filter(r=>r.count===f.count&&r.sort===sort&&r.phase===phase&&!r.warmup);
    for(const v of variants)report.aggregates.push({count:f.count,label:v.label,sort,phase,...summary(rows.filter(r=>r.label===v.label).map(r=>r.elapsedMs))});
    const deltas=rows.filter(r=>r.label==='baseline').map(a=>{const b=rows.find(r=>r.label==='after'&&r.round===a.round);return {round:a.round,pairOrder:a.pairOrder,baselineMs:a.elapsedMs,afterMs:b.elapsedMs,afterMinusBaselineMs:b.elapsedMs-a.elapsedMs};});
    report.paired.push({count:f.count,sort,phase,afterFaster:deltas.filter(d=>d.afterMinusBaselineMs<0).length,afterSlower:deltas.filter(d=>d.afterMinusBaselineMs>0).length,ties:deltas.filter(d=>d.afterMinusBaselineMs===0).length,deltaSummary:summary(deltas.map(d=>d.afterMinusBaselineMs)),deltas});
  }
  assert.equal(report.runs.length,smoke?24:312);assert.deepEqual(await identities(),sourceBefore,'Source files must remain unchanged throughout the run.');assert.equal(sha(await readFile(new URL(import.meta.url))),scriptSha256,'Driver source must remain unchanged.');report.sourceAndScriptStable=true;report.status='PASS';report.activeCase=null;
}catch(error){report.status='FAIL';report.errors.push({name:error.name,message:error.message,stack:error.stack});process.exitCode=1;}
finally{for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close();report.host.loadAfter=loadavg();report.host.freeMemoryAfter=freemem();report.completedAt=new Date().toISOString();await save();}
console.log(JSON.stringify({status:report.status,mode:report.mode,output,samples:report.runs.length,aggregates:report.aggregates,errors:report.errors},null,2));
