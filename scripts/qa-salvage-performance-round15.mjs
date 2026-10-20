// Actual browser confirmation -> native storage return -> rendering opportunities.
// Supply existing tester-owned Playwright and official Chromium; no downloads.
// Example:
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome-headless-shell
// node scripts/qa-salvage-performance-round15.mjs
//   --baseline-source=/path/to/baseline/Dice-Abyss --current-source=/path/to/current/Dice-Abyss
//   --baseline-url=http://127.0.0.1:4188/ --current-url=http://127.0.0.1:4189/
//   --output=/external/qa/salvage-browser
// --prepare-only writes the frozen protocol/fixtures without launching a browser.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
const allowed=new Set(['--baseline-source','--current-source','--baseline-url','--current-url','--output','--prepare-only']);
for(const key of Object.keys(args))assert(allowed.has(key),'Unknown option '+key);
assert(typeof args['--baseline-source']==='string','--baseline-source is required');
const output=path.resolve(args['--output']||'/tmp/dice-r15-salvage-browser');
const variants=[
 {label:'baseline',root:path.resolve(args['--baseline-source']),url:args['--baseline-url']||'http://127.0.0.1:4188/'},
 {label:'current',root:path.resolve(args['--current-source']||fileURLToPath(new URL('../',import.meta.url))),url:args['--current-url']||'http://127.0.0.1:4189/'},
];
for(const variant of variants){
 const url=new URL(variant.url);assert(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only isolated loopback HTTP test origins are permitted');
 variant.url=url.href;assert(output!==variant.root&&!output.startsWith(variant.root+path.sep),'Evidence output must be outside both input projects');
 variant.E=await import(pathToFileURL(path.join(variant.root,'src/engine.js')));
 variant.S=await import(pathToFileURL(path.join(variant.root,'src/storage.js')));
 variant.version=JSON.parse(await fs.readFile(path.join(variant.root,'package.json'),'utf8')).version;
}
assert.notEqual(new URL(variants[0].url).origin,new URL(variants[1].url).origin,'Keep baseline and current on separate test origins');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const scriptPath=fileURLToPath(import.meta.url),scriptSha256=sha(await fs.readFile(scriptPath));
const measuredPairs=8,warmupPairs=2,preMeasureSettleMs=80,measurementDeadlineMs=30000,driverDeadlineMs=45000;
const viewport={width:1920,height:1080},launchArgs=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const settings={effects:'low',sound:false,scale:1},settingsRaw=JSON.stringify(settings);
const keys={main:variants[0].S.SAVE_KEY,mirror:variants[0].S.BACKUP_KEY,settings:variants[0].S.SETTINGS_KEY};
for(const v of variants)assert.deepEqual({main:v.S.SAVE_KEY,mirror:v.S.BACKUP_KEY,settings:v.S.SETTINGS_KEY},keys);

async function sourceSnapshot(root){
 const files=['index.html','package.json'];
 async function visit(relative){for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){const file=path.posix.join(relative,entry.name);if(entry.isDirectory())await visit(file);else if(/\.(?:js|css)$/.test(entry.name))files.push(file);}}
 await visit('src');files.sort();
 return Object.fromEntries(await Promise.all(files.map(async file=>{const bytes=await fs.readFile(path.join(root,file));return [file,{bytes:bytes.length,sha256:sha(bytes)}];})));
}
const sourcesBefore=Object.fromEntries(await Promise.all(variants.map(async v=>[v.label,await sourceSnapshot(v.root)])));

function fixture(mixed){
 // Same source APIs, seed, rarity distribution, protected owners and complete
 // unknown fields as benchmark-salvage-round15. No ID getters are ever installed.
 const {E,S}=variants[0],s=E.newGame(27017);s.runId='round15-salvage-benchmark';s.floor=200;s.player.level=100;s.player.gold=1000000;
 while(s.player.items.length<10000)s.player.items.push(E.makeItem(s,undefined,mixed?s.nextId%8:s.nextId%2));
 [s.player.equipped.relic,s.player.equipped.relic2,s.player.equipped.relic3]=s.player.items.filter(i=>i.slot==='relic').slice(0,3).map(i=>i.id);
 const equipped=new Set(E.equippedIds(s));
 for(const item of s.player.items){if(equipped.has(item.id))item.level=1000000;if(Number(item.id.slice(1))%41===0)item.locked=true;item.auditMetadata={nested:['kept',Number(item.id.slice(1))]};}
 s.auditMetadata={unknown:['界','😀',{preserved:true}],counter:0};s.player.hp=E.stats(s).maxHp;
 assert(S.validateSave(s));const raw=S.encodeSave(s),quote=E.salvagePreview(s,undefined,false,true),ids=quote.items.map(item=>item.id),action={type:'salvage',ids,allowOverflow:!!quote.overflow};
 assert(ids.length>(mixed?2000:9000));assert(Buffer.byteLength(raw)<5000000);
 // Real UI review order is inventory order. The Node preview stress also used
 // a reversed request order; this browser action never injects or reorders IDs.
 const expectedByVersion={};
 for(const v of variants){
  const fresh=v.S.decodeSave(raw);assert.deepEqual(fresh,s);assert.equal(v.S.encodeSave(fresh),raw);
  assert.deepEqual(v.E.salvagePreview(fresh,undefined,false,true),quote);
  const after=v.E.transition(fresh,action);assert(v.S.validateSave(after));assert.equal(v.S.encodeSave(fresh),raw);
  expectedByVersion[v.label]={after,raw:v.S.encodeSave(after)};
 }
 assert.deepEqual(expectedByVersion.current,expectedByVersion.baseline,'Both real engines must agree on the complete action result');
 return {name:mixed?'large-mixed':'large-low',mixed,raw,state:s,action,quote,after:expectedByVersion.baseline.after,afterRaw:expectedByVersion.baseline.raw};
}
const fixtures=[fixture(true),fixture(false)],schedule=[];
for(const f of fixtures)for(const [phase,count] of [['warmup',warmupPairs],['measured',measuredPairs]])for(let index=0;index<count;index++){
 const order=index%2===0?['baseline','current']:['current','baseline'];
 for(const label of order)schedule.push({sequence:schedule.length+1,scenario:f.name,phase,pair:index+1,label});
}
const limitations=[
 'Each sample has a fresh isolated browser context, document, app realm and JSON-parsed complete input. No inventory getter, engine patch, quota override or mock storage is installed.',
 'Start is performance.now() in the capture listener for the real trusted confirmation click, before the application bubbling handler. Driver round trips, the 80 ms untimed settle and setup are excluded.',
 'primaryReturnAt/mirrorReturnAt record successful native localStorage.setItem return. Exact raw records and full decoded states are checked afterward and after reload. This cannot establish physical-disk flush or power-loss durability.',
 'firstRafAfterWriteAt and doubleRafAfterWriteAt are the first/second requestAnimationFrame callbacks scheduled after the last observed storage-write return. They are browser rendering opportunities, not proof of a painted/presented frame, stable FPS or physical display latency.',
 'The transparent setItem wrapper forwards the original native receiver, arguments, return and exceptions. Timing includes transition, full expected comparison, codec, native storage, app rendering and browser scheduling. getItem, JSON, Web Locks and engine code are unchanged.',
 'Continuous rAF and native Long Task/Long Animation Frame observers are identical in both arms. Raw intervals and overlap with the click-to-double-rAF window are retained. Observer instrumentation itself has overhead.',
 'Each scenario has eight formal pairs and two fixed warmup pairs. Nearest-rank p95 with n=8 equals max. No slow/negative samples are removed or replaced, and failed samples prevent passing-subset latency statistics.',
 'The two synthetic 10,000-item constructed states are not natural player journeys. Logical 1920x1080, deviceScaleFactor=1, reduced motion and low effects are not physical 4K hardware or GPU/FPS certification.',
 'Native localStorage quota and errors are honored. Quota failure is BLOCKED with its original records retained, never made successful by trimming fields or removing the mirror.',
 'Warmups use the same fresh-context lifecycle; they do not warm the JavaScript realm of later documents. Host scheduling, cache, JIT and GC can still affect these finite samples.',
];
const protocol={status:'PREPARED',createdAtUtc:new Date().toISOString(),node:process.version,scriptSha256,variants:variants.map(({label,root,url,version})=>({label,root,url,version})),sourcesBefore,viewport,deviceScaleFactor:1,reducedMotion:'reduce',settings,launchArgs,measuredPairs,warmupPairs,preMeasureSettleMs,measurementDeadlineMs,driverDeadlineMs,schedule,limitations,
 fixtures:fixtures.map(f=>({name:f.name,synthetic:true,seed:27017,items:10000,mixed:f.mixed,selected:f.action.ids.length,requestOrder:'Real safe-batch inventory order, without injected IDs',protected:{equipped:f.state.player.equipped,locked:f.state.player.items.filter(i=>i.locked).length,loot:f.state.loot?.item?.id??null},rawCharacters:f.raw.length,rawUtf8Bytes:Buffer.byteLength(f.raw),beforeStateSha256:sha(f.state),rawSha256:sha(f.raw),afterStateSha256:sha(f.after),afterRawSha256:sha(f.afterRaw),afterRawUtf8Bytes:Buffer.byteLength(f.afterRaw),remaining:f.after.player.items.length,creditedGold:f.after.player.gold-f.state.player.gold}))};
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'protocol.json'),JSON.stringify(protocol,null,2)+'\n');
await fs.copyFile(scriptPath,path.join(output,'executed-protocol.mjs'));
for(const f of fixtures){await fs.writeFile(path.join(output,f.name+'.before.save.json'),f.raw);await fs.writeFile(path.join(output,f.name+'.expected.save.json'),f.afterRaw);}
if(args['--prepare-only'])console.log(JSON.stringify({status:'PREPARED',output,samples:schedule.length,formal:32,warmup:8,browserLaunched:false}));
else await runBrowser();

// This transparent observer changes no game logic, save data or storage quota.
// It is installed in the same way before the app loads in every fresh context.
function installRecorder({keys,deadlineMs}){
 const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem'),original=descriptor.value;
 let active=null;const supported=PerformanceObserver.supportedEntryTypes||[];
 function append(kind,entries){
  const trial=active;if(!trial||trial.startedAt==null)return;
  for(const entry of entries){
   if(entry.startTime+entry.duration<=trial.startedAt)continue;
   if(kind==='longTasks')trial.longTasks.push({name:entry.name,startTime:entry.startTime,duration:entry.duration,attribution:(entry.attribution||[]).map(a=>({name:a.name,containerType:a.containerType,containerName:a.containerName}))});
   else trial.longAnimationFrames.push({name:entry.name,startTime:entry.startTime,duration:entry.duration,blockingDuration:entry.blockingDuration,renderStart:entry.renderStart,styleAndLayoutStart:entry.styleAndLayoutStart});
  }
 }
 const taskObserver=supported.includes('longtask')?new PerformanceObserver(list=>append('longTasks',list.getEntries())):null;
 const loafObserver=supported.includes('long-animation-frame')?new PerformanceObserver(list=>append('longAnimationFrames',list.getEntries())):null;
 taskObserver?.observe({type:'longtask',buffered:false});loafObserver?.observe({type:'long-animation-frame',buffered:false});
 function drain(){append('longTasks',taskObserver?.takeRecords()||[]);append('longAnimationFrames',loafObserver?.takeRecords()||[]);}
 function finish(trial){if(trial.done)return;drain();trial.done=true;clearTimeout(trial.timeout);cancelAnimationFrame(trial.rafHandle);trial.resolve();}
 function framesAfterWrite(trial){
  const generation=++trial.writeGeneration;
  requestAnimationFrame(stamp=>{
   if(trial.done||active!==trial||generation!==trial.writeGeneration)return;
   trial.firstRafAfterWriteAt=performance.now();trial.firstRafAfterWriteStamp=stamp;
   requestAnimationFrame(stamp2=>{
    if(trial.done||active!==trial||generation!==trial.writeGeneration)return;
    trial.doubleRafAfterWriteAt=performance.now();trial.doubleRafAfterWriteStamp=stamp2;
    // Timer only drains already-generated observer entries AFTER the endpoint.
    setTimeout(()=>{if(generation===trial.writeGeneration)finish(trial);},0);
   });
  });
 }
 Object.defineProperty(Storage.prototype,'setItem',{...descriptor,value:function setItem(key,value){
  const trial=active;if(!trial||trial.startedAt==null||trial.done||this!==window.localStorage)return Reflect.apply(original,this,arguments);
  const startedAt=performance.now();let ok=false,error=null;
  try{const result=Reflect.apply(original,this,arguments);ok=true;return result;}
  catch(reason){error={name:reason?.name||'Error',message:String(reason?.message||reason)};throw reason;}
  finally{
   const endedAt=performance.now();trial.writes.push({key:typeof key==='string'?key:null,valueCharacters:typeof value==='string'?value.length:null,startedAt,endedAt,durationMs:endedAt-startedAt,ok,error});
   trial.lastWriteAt=endedAt;if(ok&&key===keys.main)trial.primaryReturnAt=endedAt;if(ok&&key===keys.mirror)trial.mirrorReturnAt=endedAt;framesAfterWrite(trial);
  }
 }});
 document.addEventListener('click',event=>{
  const control=event.target.closest?.('dialog[open] [data-action="confirm"]'),trial=active;
  if(!trial||trial.done||trial.startedAt!=null||!control||control.disabled)return;
  trial.startedAt=performance.now();trial.eventTimeStamp=event.timeStamp;trial.isTrusted=event.isTrusted;trial.visibilityAtClick=document.visibilityState;
  requestAnimationFrame(stamp=>{trial.firstRafFromClickAt=performance.now();trial.firstRafFromClickStamp=stamp;});
 },true);
 function raw(trial){
  const end=trial.doubleRafAfterWriteAt??performance.now(),start=trial.startedAt;
  const overlap=(a,b)=>start==null?0:Math.max(0,Math.min(b,end)-Math.max(a,start));
  const intervals=trial.rafSamples.slice(1).map((sample,i)=>{const previous=trial.rafSamples[i];return {startTime:previous.callbackAt,endTime:sample.callbackAt,duration:sample.callbackAt-previous.callbackAt,overlapMs:overlap(previous.callbackAt,sample.callbackAt)};});
  const tasks=trial.longTasks.map(task=>({...task,overlapMs:overlap(task.startTime,task.startTime+task.duration)}));
  const loafs=trial.longAnimationFrames.map(frame=>({...frame,overlapMs:overlap(frame.startTime,frame.startTime+frame.duration)}));
  const delta=time=>start==null||time==null?null:time-start;
  return {startedAt:start,eventTimeStamp:trial.eventTimeStamp,isTrusted:trial.isTrusted,visibilityAtClick:trial.visibilityAtClick,primaryReturnAt:trial.primaryReturnAt,mirrorReturnAt:trial.mirrorReturnAt,lastWriteAt:trial.lastWriteAt,firstRafFromClickAt:trial.firstRafFromClickAt,firstRafAfterWriteAt:trial.firstRafAfterWriteAt,doubleRafAfterWriteAt:trial.doubleRafAfterWriteAt,
   metrics:{clickToPrimaryReturnMs:delta(trial.primaryReturnAt),clickToMirrorReturnMs:delta(trial.mirrorReturnAt),clickToFirstRafFromClickMs:delta(trial.firstRafFromClickAt),clickToFirstRafAfterWriteMs:delta(trial.firstRafAfterWriteAt),clickToDoubleRafAfterWriteMs:delta(trial.doubleRafAfterWriteAt),lastWriteToDoubleRafMs:trial.lastWriteAt==null||trial.doubleRafAfterWriteAt==null?null:trial.doubleRafAfterWriteAt-trial.lastWriteAt,nativeSetItemMs:trial.writes.reduce((n,w)=>n+w.durationMs,0),longTaskCount:tasks.filter(t=>t.overlapMs>0).length,longTaskTotalOverlapMs:tasks.reduce((n,t)=>n+t.overlapMs,0),longTaskMaxRawMs:Math.max(0,...tasks.filter(t=>t.overlapMs>0).map(t=>t.duration)),rafIntervalCount:intervals.filter(i=>i.overlapMs>0).length,rafOver50Count:intervals.filter(i=>i.overlapMs>0&&i.duration>50).length,maxRafIntervalMs:Math.max(0,...intervals.filter(i=>i.overlapMs>0).map(i=>i.duration)),maxRafOverlapMs:Math.max(0,...intervals.map(i=>i.overlapMs))},
   writes:trial.writes,rafSamples:trial.rafSamples,rafIntervals:intervals,longTasks:tasks,longAnimationFrames:loafs,firstClickRafBeforePrimary:trial.firstRafFromClickAt!=null&&trial.primaryReturnAt!=null?trial.firstRafFromClickAt<trial.primaryReturnAt:null,error:trial.error||null};
 }
 window.__qaSalvagePerformance={originalSetItemIsNative:Function.prototype.toString.call(original).includes('[native code]'),longTasksSupported:!!taskObserver,longAnimationFramesSupported:!!loafObserver,
  arm(){
   if(active&&!active.done)throw Error('A previous native measurement is still pending');taskObserver?.takeRecords();loafObserver?.takeRecords();
   let resolve;const promise=new Promise(done=>resolve=done);
   const trial=active={startedAt:null,primaryReturnAt:null,mirrorReturnAt:null,lastWriteAt:null,firstRafFromClickAt:null,firstRafAfterWriteAt:null,doubleRafAfterWriteAt:null,writes:[],longTasks:[],longAnimationFrames:[],rafSamples:[],writeGeneration:0,done:false,promise,resolve};
   const tick=stamp=>{if(trial.done||active!==trial)return;trial.rafSamples.push({stamp,callbackAt:performance.now()});trial.rafHandle=requestAnimationFrame(tick);};
   trial.rafHandle=requestAnimationFrame(tick);trial.timeout=setTimeout(()=>{trial.error='No completed native write and two following rAF callbacks within '+deadlineMs+' ms';finish(trial);},deadlineMs);
  },
  async wait(){const trial=active;if(!trial)throw Error('No armed measurement');await trial.promise;drain();return raw(trial);},
  snapshot(){drain();return active?raw(active):null;},
 };
}

async function servedSnapshot(variant,expected){
 const actual={};
 for(const file of Object.keys(expected).filter(file=>file!=='package.json')){
  const response=await fetch(new URL(file,variant.url),{cache:'no-store'});assert(response.ok,'Could not verify served source '+variant.label+'/'+file);
  const bytes=Buffer.from(await response.arrayBuffer());actual[file]={bytes:bytes.length,sha256:sha(bytes)};
 }
 assert.deepEqual(actual,Object.fromEntries(Object.entries(expected).filter(([file])=>file!=='package.json')),'Served source differs from frozen disk source for '+variant.label);
 return actual;
}
function distribution(values){
 const s=[...values].sort((a,b)=>a-b),n=s.length;return {n,min:s[0],p50:(s[(n-1)>>1]+s[n>>1])/2,p95:s[Math.ceil(n*.95)-1],max:s.at(-1),mean:s.reduce((sum,n)=>sum+n,0)/n};
}
async function wallDeadline(promise,ms,label){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' exceeded fixed '+ms+' ms wall deadline')),ms);})]);}finally{clearTimeout(timer);}
}
function summarize(rows){
 const measured=rows.filter(row=>row.phase==='measured');
 if(measured.length!==32||measured.some(row=>row.status!=='PASS'))return {status:'INCOMPLETE_NO_PASSING_SUBSET_STATISTICS',reason:'All 32 predeclared formal rows must pass complete state, native writes and timing checks.'};
 const metricKeys=Object.keys(measured[0].timing.metrics),scenarios=[];
 for(const f of fixtures){
  const cells=measured.filter(row=>row.scenario===f.name),arms={};
  for(const v of variants){const arm=cells.filter(row=>row.label===v.label);assert.equal(arm.length,8);arms[v.label]=Object.fromEntries(metricKeys.map(key=>[key,distribution(arm.map(row=>row.timing.metrics[key]))]));}
  const paired={};for(const key of metricKeys){const values=Array.from({length:8},(_,index)=>cells.find(row=>row.pair===index+1&&row.label==='current').timing.metrics[key]-cells.find(row=>row.pair===index+1&&row.label==='baseline').timing.metrics[key]);paired[key]={valuesCurrentMinusBaseline:values,summary:distribution(values),currentLargerPairs:values.filter(v=>v>0).length};}
  scenarios.push({name:f.name,selected:f.action.ids.length,byVersion:arms,pairedCurrentMinusBaseline:paired});
 }
 return {status:'COMPLETE',percentileMethod:'p50 averages middle observations. p95 is nearest rank ceil(n*0.95); n=8 so p95=max. All formal rows retained.',scenarios};
}

async function trial(browser,variant,row,f,report){
 // Fresh codec objects per sample; none was exposed to the Node ID counter.
 const state=variant.S.decodeSave(f.raw),raw=variant.S.encodeSave(state),expected=variant.E.transition(state,f.action),expectedRaw=variant.S.encodeSave(expected);
 assert.equal(raw,f.raw);assert.deepEqual(expected,f.after);assert.equal(expectedRaw,f.afterRaw);
 row.freshCodec={beforeSha256:sha(raw),expectedSha256:sha(expectedRaw),matchesPreparedFixture:true};
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});let page;
 try{
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)?route.continue():route.abort();});
  await context.addInitScript(installRecorder,{keys,deadlineMs:measurementDeadlineMs});
  page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',error=>row.errors.push({type:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')row.errors.push({type:'console',message:message.text()});});
  await page.goto(variant.url);
  row.seeding=await page.evaluate(({raw,keys,settingsRaw})=>{
   const result={writes:[],error:null};
   try{localStorage.clear();for(const [key,value] of [[keys.settings,settingsRaw],[keys.main,raw],[keys.mirror,raw]]){localStorage.setItem(key,value);result.writes.push({key,characters:value.length});}}
   catch(error){result.error={name:error.name,message:error.message};}
   return result;
  },{raw,keys,settingsRaw});
  if(row.seeding.error){row.status=row.seeding.error.name==='QuotaExceededError'?'BLOCKED':'FAIL';row.error='Fresh native context could not hold both full copies: '+JSON.stringify(row.seeding.error);return;}
  await page.reload();await page.evaluate(()=>document.fonts.ready);
  row.environment=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
   const renderer=gl?{renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR)}:null;gl?.getExtension('WEBGL_lose_context')?.loseContext();
   return {ua:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,webLocks:!!navigator.locks?.request,originalSetItemIsNative:window.__qaSalvagePerformance.originalSetItemIsNative,longTasksSupported:window.__qaSalvagePerformance.longTasksSupported,longAnimationFramesSupported:window.__qaSalvagePerformance.longAnimationFramesSupported,visibility:document.visibilityState,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,logicalViewport:{width:innerWidth,height:innerHeight,devicePixelRatio},storageEstimate:await navigator.storage.estimate(),renderer};
  });
  assert(row.environment.originalSetItemIsNative&&row.environment.webLocks,'Native storage and the real Web Locks path are required');
  assert.equal(row.environment.visibility,'visible');assert.equal(row.environment.release,variant.version);assert(row.environment.longTasksSupported,'Native Long Task observer is required');
  await page.locator('[data-action="continue"]').click();await page.locator('.main-nav [data-action="inventory"]').click();
  assert.equal(await page.locator('.inventory-list .item-card').count(),60);
  await page.locator('[data-action="salvage-preview"]').click();
  const dialog=page.locator('dialog[open]'),confirm=dialog.locator('[data-action="confirm"]');
  row.confirmationText=await dialog.innerText();assert(row.confirmationText.includes(f.action.ids.length.toLocaleString('en-US')),'Real confirmation must identify the complete prepared safe batch');
  await confirm.evaluate(button=>button.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  row.confirmationGeometry=await confirm.evaluate(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:button.textContent,enabled:!button.disabled,rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},centerHits:hit===button||button.contains(hit),visible:r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};});
  assert(row.confirmationGeometry.enabled&&row.confirmationGeometry.visible&&row.confirmationGeometry.centerHits,'Native confirmation must be visible, enabled and hit-testable');
  const read=()=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
  const before=await read();assert.deepEqual(before,{[keys.mirror]:raw,[keys.main]:raw,[keys.settings]:settingsRaw});assert.deepEqual(variant.S.decodeSave(before[keys.main]),state);
  row.beforeRecordsSha256=sha(before);
  // The fixed settling timer is entirely outside the captured click interval.
  await page.evaluate(ms=>new Promise(resolve=>setTimeout(resolve,ms)),preMeasureSettleMs);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.__qaSalvagePerformance.arm());
  const completed=page.evaluate(()=>window.__qaSalvagePerformance.wait()).catch(error=>({error:String(error)}));
  row.timing=await wallDeadline((async()=>{await confirm.click();return await completed;})(),driverDeadlineMs,'Trusted click and recorder completion');
  assert.equal(row.timing.isTrusted,true,'Start must be the real trusted confirmation click');assert.equal(row.timing.visibilityAtClick,'visible');assert.equal(row.timing.error,null);
  const after=await read();row.afterRecordsSha256=sha(after);row.afterMainSha256=after[keys.main]?sha(after[keys.main]):null;row.afterMirrorSha256=after[keys.mirror]?sha(after[keys.mirror]):null;
  if(row.timing.writes.some(w=>w.error?.name==='QuotaExceededError')){row.status='BLOCKED';row.error='Native quota rejected a real timed write; primary/mirror outcomes are retained without quota override or replacement sample';return;}
  assert.deepEqual(row.timing.writes.map(({key,ok})=>({key,ok})),[{key:keys.main,ok:true},{key:keys.mirror,ok:true}],'Exactly two successful writes in primary/mirror order');
  assert.deepEqual(after,{...before,[keys.main]:expectedRaw,[keys.mirror]:expectedRaw});
  assert.deepEqual(variant.S.decodeSave(after[keys.main]),expected,'Complete committed main equals the corresponding real engine result');
  assert.deepEqual(variant.S.decodeSave(after[keys.mirror]),expected,'Complete mirror equals the corresponding real engine result');
  for(const value of Object.values(row.timing.metrics))assert(Number.isFinite(value)&&value>=0,'Every measurement must have a finite nonnegative real endpoint/count');
  assert.equal(await page.locator('dialog[open]').count(),0,'The confirmed dialog closed');
  assert.equal(await page.locator('.inventory-list .item-card').count(),Math.min(60,expected.player.items.length));
  row.completeVerification={mainExact:true,mirrorExact:true,allOtherRecordsExact:true,correspondingEngineExact:true,rngPreserved:expected.rng===state.rng,revisionIncrement:expected.revision-state.revision,removed:state.player.items.length-expected.player.items.length,remaining:expected.player.items.length,creditedGold:expected.player.gold-state.player.gold,unknownFieldsIncluded:true,protectedOwnersIncluded:true};
  // Reload is outside the measured endpoints and must not replace the seeded
  // input. The init script only reinstalls the transparent recorder, not saves.
  await page.reload();await page.locator('[data-action="continue"]').click();
  const reloaded=await read();assert.deepEqual(reloaded,after);assert.deepEqual(variant.S.decodeSave(reloaded[keys.main]),expected);
  row.completeVerification.reloadExact=true;row.reloadRecordsSha256=sha(reloaded);assert.equal(row.errors.length,0,'Unexpected browser errors are retained as failures');row.status='PASS';
 }catch(error){
  row.status='FAIL';row.error={name:error.name,message:error.message,stack:error.stack};
  if(page)try{row.recorderAtFailure=await wallDeadline(page.evaluate(()=>window.__qaSalvagePerformance?.snapshot()),2000,'Failure recorder snapshot');row.visibleFailure=await wallDeadline(page.locator('body').innerText(),2000,'Failure UI snapshot');}catch{}
 }finally{await context.close();row.contextClosed=true;}
}

async function runBrowser(){
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 assert(process.env.CHROMIUM_PATH,'CHROMIUM_PATH must identify the tester-owned official Chromium executable');
 const report={status:'RUNNING',startedAtUtc:new Date().toISOString(),protocol,browserExecutable:process.env.CHROMIUM_PATH,playwrightModule:process.env.PLAYWRIGHT_MODULE||'playwright',rows:[],errors:[],servedBefore:{},servedAfter:{}};
 const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await persist();let browser;
 try{
  for(const variant of variants)report.servedBefore[variant.label]=await servedSnapshot(variant,sourcesBefore[variant.label]);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:launchArgs});report.browserVersion=browser.version();
  for(const spec of schedule){
   const row={...spec,status:'RUNNING',startedAtUtc:new Date().toISOString(),errors:[]};report.rows.push(row);await persist();
   const variant=variants.find(v=>v.label===row.label),f=fixtures.find(f=>f.name===row.scenario);
   try{await trial(browser,variant,row,f,report);}catch(error){row.status='FAIL';row.error={name:error.name,message:error.message,stack:error.stack};}
   row.finishedAtUtc=new Date().toISOString();await persist();console.log(JSON.stringify({sequence:row.sequence,total:schedule.length,scenario:row.scenario,phase:row.phase,pair:row.pair,label:row.label,status:row.status}));
  }
  report.statistics=summarize(report.rows);report.status=report.rows.every(row=>row.status==='PASS')?'PASS':report.rows.some(row=>row.status==='FAIL')?'FAIL':'BLOCKED';
 }catch(error){report.status='FAIL';report.failure={name:error.name,message:error.message,stack:error.stack};}
 finally{
  await browser?.close();report.browserClosed=true;
  report.sourcesAfter=Object.fromEntries(await Promise.all(variants.map(async v=>[v.label,await sourceSnapshot(v.root)])));
  report.sourceStable=JSON.stringify(report.sourcesAfter)===JSON.stringify(sourcesBefore);report.scriptStable=sha(await fs.readFile(scriptPath))===scriptSha256;
  try{for(const variant of variants)report.servedAfter[variant.label]=await servedSnapshot(variant,sourcesBefore[variant.label]);report.servedStable=JSON.stringify(report.servedAfter)===JSON.stringify(report.servedBefore);}catch(error){report.servedStable=false;report.errors.push({type:'served-source',message:String(error)});}
  if(!report.sourceStable||!report.scriptStable||!report.servedStable){report.status='FAIL';if(report.statistics?.status==='COMPLETE')report.statistics.status='UNQUALIFIED_SOURCE_IDENTITY_FAILURE';report.errors.push({type:'source-change',message:'Disk source, served source or benchmark script changed or could not be verified'});}
  report.finishedAtUtc=new Date().toISOString();await persist();await fs.writeFile(path.join(output,'SUMMARY.md'),summaryMarkdown(report));
 }
 console.log(JSON.stringify({status:report.status,browser:report.browserVersion,samples:report.rows.length,formal:report.rows.filter(row=>row.phase==='measured').length,warmup:report.rows.filter(row=>row.phase==='warmup').length,sourceStable:report.sourceStable,servedStable:report.servedStable,scriptStable:report.scriptStable,statistics:report.statistics,output},null,2));
 if(report.status!=='PASS')process.exitCode=1;
}
function summaryMarkdown(report){
 const lines=['# Round15 原生浏览器批量回收性能','',`状态：${report.status}。浏览器：${report.browserVersion||'未启动'}。固定32个正式样本和8个预热，实际保留${report.rows.length}行；所有失败和负向样本保留。`,'','计时对象为真实确认点击、原生localStorage写入返回、写后的浏览器绘制机会。不是物理磁盘落盘、已呈现帧或FPS证明。',''];
 if(report.statistics?.status==='COMPLETE'){
  lines.push('| 场景 | 指标 | 基线p50 ms | 当前p50 ms | 基线p95=max ms | 当前p95=max ms | 当前更慢配对 |','|---|---|---:|---:|---:|---:|---:|');
  for(const scenario of report.statistics.scenarios)for(const metric of ['clickToPrimaryReturnMs','clickToFirstRafAfterWriteMs','clickToDoubleRafAfterWriteMs']){const b=scenario.byVersion.baseline[metric],c=scenario.byVersion.current[metric];lines.push(`| ${scenario.name}（${scenario.selected}件） | ${metric} | ${b.p50.toFixed(3)} | ${c.p50.toFixed(3)} | ${b.p95.toFixed(3)} | ${c.p95.toFixed(3)} | ${scenario.pairedCurrentMinusBaseline[metric].currentLargerPairs}/8 |`);}
 }else lines.push('样本/验证未完整通过，不对选择出的成功子集提供延迟统计。逐行实际结果在report.json中。');
 lines.push('','## 限制','',...limitations.map(text=>'- '+text),'','完整协议：protocol.json；完整原始样本、rAF、Long Task、写入结果与环境：report.json；本次实际脚本：executed-protocol.mjs。每个合成起点和对应引擎完整结果另有before/expected.save.json，可逐字节复现。','');return lines.join('\n');
}
