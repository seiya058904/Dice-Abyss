// Round24 serial-context fork; original Round12 driver is unchanged.
// Same fixed seeds, raw intervals, all tails and exact engine/save oracles.
// Optional browser A/B QA; Playwright is supplied by the tester, never the game.
// Fresh contexts, loopback origins and synthetic saves only. No quota overrides.
// The taskbook permits independent Playwright when the preferred browser route
// cannot reach loopback. The release's environment record identifies that route.
// Frame windows and eight rarity fixtures only. Native inventory latency uses
// qa-inventory-latency-round24.mjs; no stale inventory path is exposed here.
// qa-performance-round12.mjs remains the untouched historical protocol.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const require=createRequire(import.meta.url),args={};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i],split=arg.indexOf('=');
 if(split>=0)args[arg.slice(0,split)]=arg.slice(split+1);
 else args[arg]=!process.argv[i+1]||process.argv[i+1].startsWith('--')?true:process.argv[++i];
}
const mode=args['--mode']||'frames';
assert(['frames','smoke','fixtures'].includes(mode),'Round24 serial-context driver only supports frames, smoke or fixtures; use dedicated inventory driver for inventory timing');
assert.equal(typeof args['--output'],'string','Provide an explicit fresh output directory outside both source trees');
const source=path.resolve(args['--source']||'.'),output=path.resolve(args['--output']);
// The paired performance workload must commit the same complete state. Each
// browser result is additionally checked against its own authoritative engine;
// no fields are dropped to reconcile an incompatible baseline.
const baselineSource=path.resolve(args['--baseline-source']||source);
for(const root of [source,baselineSource])assert(output!==root&&!output.startsWith(root+path.sep),'QA output must be outside both source trees');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output); // EEXIST protects all prior attempts, including partial ones.
const variants=[{label:'baseline',url:args['--baseline-url']||'http://127.0.0.1:4188'},{label:'after',url:args['--after-url']||'http://127.0.0.1:4189'}];
for(const variant of variants){const u=new URL(variant.url);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Only loopback test URLs are allowed');assert(['http:','https:'].includes(u.protocol));}
const repeats=mode==='smoke'?1:Number(args['--repeats']||3);
assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=5);
const windowMs=4200,seed=20261017,hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const requiredIdentityFiles=['index.html','package.json','src/app.js','src/engine.js','src/views.js','src/storage.js','src/dice-renderer.js','src/effects.js','src/dice-motion.js','src/visual-timeline.js'];
async function runtimeFiles(root,directory='src'){
 const entries=await fs.readdir(path.join(root,directory),{withFileTypes:true}),files=[];
 for(const entry of entries){
  const file=path.posix.join(directory,entry.name);
  if(entry.isDirectory())files.push(...await runtimeFiles(root,file));
  else if(entry.isFile()&&/\.(?:js|css)$/.test(file))files.push(file);
 }
 return files;
}
async function identityFiles(){return [...new Set([...requiredIdentityFiles,...await runtimeFiles(baselineSource),...await runtimeFiles(source)])].toSorted();}
const sourceFiles=await identityFiles();
async function sourceIdentity(root,files=sourceFiles){
 return Promise.all(files.map(async file=>{
  try{const bytes=await fs.readFile(path.join(root,file));return {file,exists:true,bytes:bytes.length,sha256:hash(bytes)};}
  catch(error){
   if(error.code!=='ENOENT'||requiredIdentityFiles.includes(file))throw error;
   // The shared union records a newer module/CSS file absent in the input.
   return {file,exists:false,bytes:0,sha256:null};
  }
 }));
}
const sourceBefore={baseline:await sourceIdentity(baselineSource),after:await sourceIdentity(source)};
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js'))),Q=await import(pathToFileURL(path.join(source,'src/equipment.js'))),C=await import(pathToFileURL(path.join(source,'src/content.js')));
const baselineEngine=baselineSource===source?E:await import(pathToFileURL(path.join(baselineSource,'src/engine.js'))),baselineStorage=baselineSource===source?S:await import(pathToFileURL(path.join(baselineSource,'src/storage.js')));
const expectedModules={baseline:{engine:baselineEngine,storage:baselineStorage},after:{engine:E,storage:S}};
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
assert.deepEqual({main:baselineStorage.SAVE_KEY,mirror:baselineStorage.BACKUP_KEY,settings:baselineStorage.SETTINGS_KEY},keys,'Both versions must use the unchanged persistence keys');
const summarize=values=>{
 assert(values.every(Number.isFinite),'A non-finite sample is an explicit failure, never silently excluded');
 const sorted=values.toSorted((a,b)=>a-b),q=p=>sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;
 return {samples:sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)??null,min:sorted[0]??null};
};
function room(type='boss'){
 let s=E.newGame(seed);s.runId=`qa-round-performance-${type}-${seed}`;s.floor=140;s.fate=[6,6];s.player.level=80;s.player.gold=500000;s.player.talentPoints=35;
 s.roomIndex=type==='boss'?5:0;s.route=Array.from({length:6},(_,i)=>({id:`f140r${i}`,type:i===s.roomIndex?type:i===5?'boss':'combat',quality:0,done:i<s.roomIndex}));
 s.phase='route';s.player.hp=E.stats(s).maxHp;return E.transition(s,{type:'enter'});
}
function effectFixtures(){
 const s=room('boss');
 for(const key of ['critical','resonance','keen','echo'])s.player.talents[key]=C.TALENTS[key].cap;
 for(const [slot,key]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){
  const item=Q.makeItem(s,slot,4,140);s.player.items.push(item);s.player.equipped[key]=item.id;
 }
 s.player.hp=E.stats(s).maxHp;
 // The real format allows six logs, each at most 180 characters. Exercise the
 // longest legal history instead of introducing an invalid unlimited log.
 const longText='深层战斗合成记录：六骰同点共鸣、暴击追击、护盾吸收与首领阶段交替；本段仅是固定负载，不描述自然探索成绩。';
 s.log=Array.from({length:6},(_,i)=>({text:`记录 ${i+1} · ${longText.repeat(5)}`.slice(0,180),tone:['','gold','rare','epic','legendary','danger'][i]}));
 assert.equal(S.validateSave({...s,log:[...s.log,{text:'第七条',tone:''}]}),false,'Seven logs must remain invalid');
 assert.equal(S.validateSave({...s,log:[{text:'长'.repeat(181),tone:''}]}),false,'A 181-character log must remain invalid');
 let found=false;
 for(let rng=1;rng<=5000;rng++){
  const next=E.transition({...s,rng},{type:'roll'}),r=next.lastRoll;
  if(r.best>=3&&r.critical&&r.follow&&!r.killed&&next.phase==='combat'){s.rng=rng;found=true;break;}
 }
 assert(found,'A real RNG seed must produce the authored boss burst');
 const finish=structuredClone(s);finish.enemy.hp=1;finish.enemy.shield=0;finish.enemy.stage=2;
 const chest=E.transition(finish,{type:'roll'});assert.equal(chest.phase,'chest');
 const chests=Array.from({length:8},(_,rarity)=>{
  const state=structuredClone(chest);state.runId=`qa-round-chest-${rarity}-${seed}`;state.chest.item=Q.makeItem(state,'relic',rarity,140,'boss');
  return {name:rarity===7?'eternal-open':`rarity-${rarity}-open`,action:'open',rarity,state};
 });
 assert.equal(E.transition(s,{type:'roll'}).log.length,6,'A real roll trims a full log to six');
 return {main:[{name:'boss-burst',action:'roll',state:s},chests[7]],coverage:chests.slice(0,7)};
}
const {main:scenes,coverage:coverageScenes}=effectFixtures();
const fixtures=[...scenes,...coverageScenes];
const manifest=fixtures.map(fixture=>{
 assert(S.validateSave(fixture.state),`Invalid synthetic fixture ${fixture.name}`);
 const raw=S.encodeSave(fixture.state);assert.deepEqual(S.decodeSave(raw),fixture.state);
 assert(baselineStorage.validateSave(fixture.state),`Invalid baseline fixture ${fixture.name}`);
 assert.equal(baselineStorage.encodeSave(fixture.state),raw,'Both versions receive identical complete save bytes');
 assert.deepEqual(baselineStorage.decodeSave(raw),fixture.state,'Baseline must retain every fixture field');
 const expected=E.transition(fixture.state,{type:fixture.action});assert(S.validateSave(expected),`Invalid post-action fixture ${fixture.name}`);
 assert.deepEqual(baselineEngine.transition(fixture.state,{type:fixture.action}),expected,`Paired scene ${fixture.name} must commit the same complete state, including RNG`);
 return {name:fixture.name,action:fixture.action,rarity:fixture.rarity??null,seed,rng:fixture.state.rng,runId:fixture.state.runId,items:fixture.state.player.items.length,equippedIds:Object.values(fixture.state.player.equipped),logCount:fixture.state.log.length,logCharacters:fixture.state.log.map(log=>log.text.length),rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:hash(raw),stateSha256:hash(fixture.state)};
});
await fs.writeFile(path.join(output,'fixture-manifest.json'),JSON.stringify({source,synthetic:true,manifest},null,2)+'\n');
if(mode==='fixtures'){console.log(JSON.stringify({mode,manifest},null,2));process.exit(0);}

const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const executablePath=args['--browser']||process.env.CHROMIUM_PATH;
assert(executablePath,'Provide --browser or CHROMIUM_PATH for the already-installed test browser');
const startedAt=Date.now();
const report={protocol:'round24-one-live-context-frame-windows',mode,source,baselineSource,sourceBefore,synthetic:true,seed,startedAt:new Date(startedAt).toISOString(),scriptSha256:hash(await fs.readFile(new URL(import.meta.url),'utf8')),variants,fixtureManifest:manifest,frames:{status:'NOT_RUN',requestedRepeatsPerCell:repeats,requestedWindowMs:windowMs,runs:[],aggregate:[],pairOrders:[]},coverage:{status:'NOT_RUN',requestedRepeatsPerCell:1,requestedWindowMs:windowMs,runs:[],aggregate:[],pairOrders:[],purpose:'One 1920/full window per variant for rarities 0–6 only checks coverage; it is not evidence of a performance improvement and is not pooled with the main matrix.'},errors:[],status:'RUNNING',notes:[
 'One fresh live Chromium context per sample; previous context closed before the next. No parallel baseline/current renderer contexts. Loopback URLs and synthetic saves only.',
 'The taskbook permits this standalone Playwright route; consult the current release environment record for the observed preferred-browser limitations.',
 'Frame and rarity-coverage pairs alternate baseline/after then after/baseline across their complete matrices, including one-repeat cells. Each run records its pair and order.',
 'No warmup or timed frame sample is excluded. No slow frame is discarded, trimmed, winsorized, or selected for a favorable result.',
 'No automatic retry replaces a failed sample. A failure stops the run, retains every completed sample, and records the active case. Smoke mode is a separate report and is never merged into formal aggregates.',
 'A measured browser promise has a fixed 30-second wall-time deadline. Exceeding it fails the run; it never triggers a replacement sample.',
 'Each frame window starts in the native action click capture listener. Callback intervals include initial input-to-frame latency; the actual window can exceed 4200ms under a long stall.',
 'Long-task aggregates include only tasks overlapping the measured window. Every RAF interval and every observed long-task entry is retained, including complete overlapping samples and the original largest-three summary. Quantiles use sorted rank floor((n-1)*p).',
 'ANGLE SwiftShader is explicitly requested. These are software-rendered browser callback timings, not physical GPU FPS or physical 4K60 validation.',
 'Fixture loading, native navigation back to the game, correctness checks, and optional screenshots occur outside timing windows.',
 'Boss fixtures contain six maximum-length legal logs. The source validator rejects a seventh log or a 181-character log; the real roll and rendered log remain capped at six.',
 'Source identity includes the union of all JavaScript and CSS under src plus the original core files. Every served runtime file must match its local bytes and SHA-256. package.json is deliberately not served: its local version must match the actual document release, and HTTP must reject access. Legitimately absent new baseline files must return HTTP 404/410 through the Playwright request API; expected missing files never filter genuine page console errors.',
 'Both source engines must produce the identical complete post-action fixture before launch. Every measured action separately matches its source oracle, including RNG and both native save copies. No state fields are ignored.',
 ]};
const save=()=>fs.writeFile(path.join(output,'performance-round.json'),JSON.stringify(report,null,2)+'\n');
const orderedEntries=(entries,pair)=>pair%2?entries:entries.toReversed();
async function measuredResult(page,key){
 let timer;
 try{return await Promise.race([page.evaluate(key=>window[key],key),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Measured ${key} exceeded the fixed 30-second wall deadline`)),30000);})]);}
 finally{clearTimeout(timer);}
}
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browserVersion=await browser.version();
const contexts=[];
async function fresh(variant){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});contexts.push(context);
 const page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(60000);
 page.on('pageerror',error=>report.errors.push({label:variant.label,type:'pageerror',message:error.message}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({label:variant.label,type:'console',message:message.text()});});
 const documentResponse=await page.goto(variant.url);await page.evaluate(()=>document.fonts.ready);
 const environment=await page.evaluate(()=>{
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const result={ua:navigator.userAgent,platform:navigator.platform,dpr:devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],longTaskObserver:PerformanceObserver.supportedEntryTypes.includes('longtask'),webLocks:!!navigator.locks};
  gl?.getExtension('WEBGL_lose_context')?.loseContext();return result;
 });
 const served=await page.evaluate(()=>({release:document.querySelector('meta[name="dice-abyss-release"]')?.content??null,build:document.querySelector('meta[name="dice-abyss-build"]')?.content??null,documentUrl:location.href,linkedStylesheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.href)}));
 // API requests do not produce page console errors for an expected 404. The
 // ordinary pageerror/console listeners above remain complete and unfiltered.
 served.assets=await Promise.all(sourceBefore[variant.label].map(async expected=>{
  const response=await context.request.get(new URL(expected.file,served.documentUrl).href,{headers:{'Cache-Control':'no-cache'}}),bytes=await response.body();
  return {file:expected.file,expectedExists:expected.exists,url:response.url(),status:response.status(),bytes:bytes.length,sha256:hash(bytes)};
 }));
 served.documentStatus=documentResponse?.status()??null;assert(served.release&&served.documentStatus===200,'Actual HTTP release metadata is required');
  const localPackage=JSON.parse(await fs.readFile(path.join(variant.label==='baseline'?baselineSource:source,'package.json'),'utf8'));
  assert.equal(served.release,localPackage.version,'The served release must match the local package version');
 served.documentSha256=hash(await documentResponse.body());
 report.sourceHttpIdentity??=[];report.sourceHttpIdentity.push({label:variant.label,...served});
 assert.equal(served.documentSha256,sourceBefore[variant.label].find(file=>file.file==='index.html').sha256,'The navigated document must match the declared index.html');
 for(const asset of served.assets){
  const expected=sourceBefore[variant.label].find(file=>file.file===asset.file);
   if(asset.file==='package.json'){asset.scope='local-metadata-intentionally-not-served';assert.equal(asset.status,404,'The existing runtime-only server must keep package metadata private');continue;}
  if(!expected.exists){assert([404,410].includes(asset.status),`Absent ${variant.label} ${asset.file} must be absent over HTTP too`);continue;}
  assert.equal(asset.status,200,`Served ${variant.label} ${asset.file} must return HTTP 200`);
  assert.equal(asset.bytes,expected.bytes,`Served ${variant.label} ${asset.file} must match its declared byte size`);
  assert.equal(asset.sha256,expected.sha256,`Served ${variant.label} ${asset.file} must match its declared source`);
 }
 return {variant,page,context,environment:{...environment,http:served}};
}
async function load(entry,state,effects){
 const {page}=entry,raw=S.encodeSave(state);await page.bringToFront();
 const capacity=await page.evaluate(({raw,keys,effects})=>{
  localStorage.clear();const writes={};
  for(const [label,key]of [['main',keys.main],['mirror',keys.mirror]]){
   try{localStorage.setItem(key,raw);writes[label]={ok:localStorage.getItem(key)===raw};}
   catch(error){writes[label]={ok:false,error:{name:error.name,message:error.message}};}
  }
  try{localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects,scale:1}));writes.settings={ok:true};}
  catch(error){writes.settings={ok:false,error:{name:error.name,message:error.message}};}
  return {writes,mainCharacters:localStorage.getItem(keys.main)?.length??null,mirrorCharacters:localStorage.getItem(keys.mirror)?.length??null,keyCount:localStorage.length};
 },{raw,keys,effects});
 if(!capacity.writes.main.ok||!capacity.writes.settings.ok)return {ok:false,...capacity};
 await page.reload();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('[data-action="continue"]').count(),1,'The real app must accept the persisted synthetic save');
 await page.locator('[data-action="continue"]').click();
 await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
 assert.equal(await page.getAttribute('html','data-effects'),effects);
 await page.evaluate(({raw,keys})=>{window.__qaExpectedRaw=raw;window.__qaOriginalMirror=localStorage.getItem(keys.mirror);},{raw,keys});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return {ok:true,...capacity};
}
async function armFrames(page){
 await page.evaluate(windowMs=>{
  window.__qaFrameDone=new Promise(resolve=>{
   const onClick=event=>{
    if(!event.target.closest('#primary-action'))return;
    document.removeEventListener('click',onClick,true);
    const start=performance.now(),trusted=event.isTrusted,intervals=[],tasks=[],kinds=new Set(),peaks={dice:0,effects:0,materials:0};let last=start;
    const taskSample=task=>({...task.toJSON(),start:task.startTime,duration:task.duration});
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(taskSample))):null;
    observer?.observe({type:'longtask',buffered:false});
    const tick=()=>{
     const now=performance.now();intervals.push(now-last);last=now;
     const dice=document.querySelector('.dice-surface'),fx=document.querySelector('.scene-fx');kinds.add(fx?.dataset.fxKind||'idle');
     peaks.dice=Math.max(peaks.dice,(dice?.width||0)*(dice?.height||0));peaks.effects=Math.max(peaks.effects,Number(fx?.dataset.fxPixels)||((fx?.width||0)*(fx?.height||0)));peaks.materials=Math.max(peaks.materials,Number(fx?.dataset.fxMaterialPixels)||0);
     if(now-start<windowMs){requestAnimationFrame(tick);return;}
     const end=now,actualWindowMs=end-start;
     // Deliver pending observer entries after the last measured callback; no new
     // frames enter the window, and the deferred transport never affects time.
     setTimeout(()=>{
      if(observer){tasks.push(...observer.takeRecords().map(taskSample));observer.disconnect();}
      const sorted=intervals.toSorted((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)]??null;
      const overlapping=tasks.filter(task=>task.start<end&&task.start+task.duration>start),durations=overlapping.map(task=>task.duration).toSorted((a,b)=>a-b);
      resolve({trusted,actualWindowMs,windowStartTimeMs:start,windowEndTimeMs:end,windowOverrunMs:actualWindowMs-windowMs,frames:intervals.length,rafIntervalsMs:intervals,firstFrameDelayMs:intervals[0],p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),over50:intervals.filter(value=>value>50).length,over100:intervals.filter(value=>value>100).length,peakPixels:peaks,effectKinds:[...kinds],longTasks:{supported:!!observer,count:overlapping.length,totalOverlapMs:overlapping.reduce((total,task)=>total+Math.max(0,Math.min(end,task.start+task.duration)-Math.max(start,task.start)),0),maxMs:durations.at(-1)??0,largest:overlapping.toSorted((a,b)=>b.duration-a.duration).slice(0,3).map(task=>({startOffsetMs:task.start-start,durationMs:task.duration})),samples:overlapping.map(task=>({...task,startOffsetMs:task.start-start,durationMs:task.duration,overlapMs:Math.max(0,Math.min(end,task.start+task.duration)-Math.max(start,task.start))})),observedSamples:tasks},visibility:document.visibilityState});
     },0);
    };requestAnimationFrame(tick);
   };document.addEventListener('click',onClick,true);
  });
 },windowMs);
}
function verifyFrameSamples(result){
 assert.equal(result.rafIntervalsMs.length,result.frames,'Every measured RAF interval must be retained');
 assert(result.rafIntervalsMs.every(value=>Number.isFinite(value)&&value>=0),'No non-finite or negative raw frame interval may be silently excluded');
 assert(Math.abs(result.rafIntervalsMs.reduce((sum,value)=>sum+value,0)-result.actualWindowMs)<1e-6,'Raw intervals must reconstruct the entire measured window, including the first callback delay');
 const summary=summarize(result.rafIntervalsMs);
 for(const key of ['p50','p95','p99','max'])assert.equal(result[key],summary[key],`Raw intervals must reconstruct ${key}`);
 assert.equal(result.longTasks.samples.length,result.longTasks.count,'Every overlapping long-task sample must be retained');
 assert(result.longTasks.observedSamples.every(task=>Number.isFinite(task.start)&&Number.isFinite(task.duration)&&task.duration>=0),'Every observed long-task sample must remain finite and complete');
 assert.equal(result.longTasks.samples.reduce((sum,task)=>sum+task.overlapMs,0),result.longTasks.totalOverlapMs,'All overlapping long-task durations must remain in the aggregate');
}
async function measureFrames(entries,coverage=false){
 const section=coverage?report.coverage:report.frames;
 const sizes=coverage||mode==='smoke'?[[1920,1080]]:(args['--sizes']||'1920x1080,3840x2160').split(',').map(size=>size.split('x').map(Number));
 const chosen=coverage?coverageScenes:mode==='smoke'?scenes.slice(0,1):scenes,effectModes=coverage?['full']:mode==='smoke'?['low']:['full','low'],repeatCount=coverage?1:repeats;
 for(const [width,height]of sizes){assert(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0);
  for(const scene of chosen)for(const effects of effectModes)for(let repeat=1;repeat<=repeatCount;repeat++){
   const pair=section.pairOrders.length+1,ordered=orderedEntries(entries,pair),pairOrder=ordered.map(entry=>entry.variant.label);
   section.pairOrders.push({pair,scene:scene.name,width,height,effects,repeat,order:pairOrder});
   for(const [position,stub]of ordered.entries()){
    report.activeCase={kind:coverage?'coverage':'frames',label:stub.variant.label,scene:scene.name,width,height,effects,repeat,pair,pairOrder,position:position+1,stage:'source-identity'};
    assert.equal(contexts.length,0,'Only one live browser context per frame sample');
    const entry=await fresh(stub.variant);await entry.page.setViewportSize({width,height});
    report.environments??=[];if(!report.environments.some(e=>e.label===entry.variant.label))report.environments.push({label:entry.variant.label,...entry.environment});
    try{
    report.activeCase.stage='load-and-measure';
    const {page}=entry,capacity=await load(entry,scene.state,effects);assert(capacity.ok,'Small action fixture must fit real storage');
    const beforeLog=await page.locator('.log-panel li').allTextContents();assert.equal(beforeLog.length,scene.state.log.length);
    assert(beforeLog.every((text,i)=>text.includes(scene.state.log[i].text)),'The complete legal long log must be rendered before timing');
    await armFrames(page);await page.locator('#primary-action').click();
    const result=await measuredResult(page,'__qaFrameDone');report.activeMeasurement=result;assert(result.trusted);assert.equal(result.visibility,'visible');assert(result.frames>0);verifyFrameSamples(result);
    await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
    const oracle=expectedModules[entry.variant.label];
    const raw=await page.evaluate(key=>localStorage.getItem(key),keys.main),actual=oracle.storage.decodeSave(raw),expected=oracle.engine.transition(scene.state,{type:scene.action});assert.deepEqual(actual,expected,'Measured click commits one exact real engine transition');
    const mirror=await page.evaluate(key=>localStorage.getItem(key),keys.mirror);assert.equal(mirror,raw,'Small action save must keep both mirrors');
    const afterLog=await page.locator('.log-panel li').allTextContents();assert.equal(actual.log.length,6);assert.equal(afterLog.length,6);
    assert(afterLog.every((text,i)=>text.includes(actual.log[i].text)),'The rendered post-action log must match the six committed entries');
    if(scene.action==='open')assert.equal(await page.locator('.loot-screen').count(),1);else assert.equal(await page.locator('.combat-screen').count(),1);
    const effectObserved=effects==='low'||result.effectKinds.includes(scene.action==='open'?`loot-${scene.rarity}`:'combat');
    section.runs.push({label:entry.variant.label,scene:scene.name,rarity:scene.rarity??null,width,height,effects,repeat,pair,pairOrder,position:position+1,fixtureSha256:hash(scene.state),persistedSha256:hash(actual),exactTransition:true,mirrorSaved:true,logBefore:beforeLog.length,logAfter:afterLog.length,logMaxCharacters:Math.max(...scene.state.log.map(log=>log.text.length)),effectObserved,...result});
    report.activeMeasurement=null;report.activeCase=null;console.log(`${coverage?'coverage':'frames'} ${entry.variant.label} ${width} ${scene.name} ${effects} #${repeat}: p95=${result.p95.toFixed(1)} max=${result.max.toFixed(1)}ms frames=${result.frames}`);await save();
    }finally{await entry.context.close();contexts.splice(contexts.indexOf(entry.context),1);}
   }
  }
 }
 const groups=new Map();for(const run of section.runs){const key=[run.label,run.scene,run.width,run.height,run.effects].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(run);}
 section.aggregate=[...groups.values()].map(runs=>({label:runs[0].label,scene:runs[0].scene,width:runs[0].width,height:runs[0].height,effects:runs[0].effects,repeats:runs.length,medianRunP50:summarize(runs.map(run=>run.p50)).p50,medianRunP95:summarize(runs.map(run=>run.p95)).p50,worstFrameMs:Math.max(...runs.map(run=>run.max)),longTasks:runs.reduce((total,run)=>total+run.longTasks.count,0),longTaskOverlapMs:runs.reduce((total,run)=>total+run.longTasks.totalOverlapMs,0),observedAllExpectedEffects:runs.every(run=>run.effectObserved)}));
 section.status='MEASURED';
}
try{
 const entries=variants.map(variant=>({variant}));report.environments=[];
 await measureFrames(entries);
 if(mode==='frames')await measureFrames(entries,true);
 const afterFiles=await identityFiles();assert.deepEqual(afterFiles,sourceFiles,'No JavaScript/CSS files may be added or removed during measurement');
 report.sourceAfter={baseline:await sourceIdentity(baselineSource,afterFiles),after:await sourceIdentity(source,afterFiles)};
 assert.deepEqual(report.sourceAfter,report.sourceBefore,'Both declared source trees must remain unchanged during measurement');report.sourceStable=true;
 report.status=report.errors.length||[...report.frames.runs,...report.coverage.runs].some(run=>!run.effectObserved)||(report.frames.runs.length&&repeats<3&&mode!=='smoke')?'MEASURED_WITH_LIMITATIONS':mode==='smoke'?'SMOKE_ONLY':'MEASURED';
 if(mode==='smoke')report.notes.push('Smoke mode has one sample per variant and one low-effect 1920 boss window; its numbers are not a performance conclusion.');
}catch(error){report.status='FAILED';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;throw error;}
finally{report.completedAt=new Date().toISOString();report.elapsedWallMs=Date.now()-startedAt;await save();for(const context of contexts)await context.close();await browser.close();}
console.log(JSON.stringify({output:path.join(output,'performance-round.json'),status:report.status,frameWindows:report.frames.runs.length,coverageWindows:report.coverage.runs.length},null,2));
