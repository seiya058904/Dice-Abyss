// Round24: native inventory A/B; demand-driven quote and offscreen card rendering.
// Derived from Round23. Each complete DOM matches its own source; the explicitly changed reclaim strip is recorded separately.
// Original driver remains byte-for-byte intact for its historical experiment.
// Tester supplies Playwright/Chromium. All output is outside both projects.
// --baseline-source=/... --current-source=/... --baseline-url=http://127.0.0.1:4221/
// --current-url=http://127.0.0.1:4222/ --output=/tmp/fresh-attempt [--prepare-only]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg.slice(2),true]:[arg.slice(2,i),arg.slice(i+1)];}));
assert.equal(typeof args.output,'string','Provide an explicit fresh output directory outside both source trees');
const output=path.resolve(args.output),sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const variants=[];
for(const label of ['baseline','current']){
 const root=path.resolve(args[label+'-source']),url=args[label+'-url'],parsed=new URL(url);
 assert(['127.0.0.1','localhost','[::1]'].includes(parsed.hostname));assert(['http:','https:'].includes(parsed.protocol));
 assert(!output.startsWith(root+path.sep)&&output!==root);
 variants.push({label,root,url});
}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output); // EEXIST prevents overwriting even an incomplete earlier attempt.
const requiredFiles=['index.html','package.json','src/app.js','src/engine.js','src/storage.js','src/views.js'];
async function runtimeFiles(root,directory='src'){
 const entries=await fs.readdir(path.join(root,directory),{withFileTypes:true}),files=[];
 for(const entry of entries){const file=path.posix.join(directory,entry.name);if(entry.isDirectory())files.push(...await runtimeFiles(root,file));else if(entry.isFile()&&/\.(?:js|css)$/.test(file))files.push(file);}
 return files;
}
const identityFiles=async()=>[...new Set([...requiredFiles,...(await Promise.all(variants.map(v=>runtimeFiles(v.root)))).flat()])].toSorted();
const files=await identityFiles();
const identity=async(sourceFiles=files)=>Object.fromEntries(await Promise.all(variants.map(async v=>[v.label,Object.fromEntries(await Promise.all(sourceFiles.map(async file=>{
 try{const bytes=await fs.readFile(path.join(v.root,file));return [file,{bytes:bytes.length,sha256:sha(bytes)}];}
 catch(e){if(e.code==='ENOENT'&&!requiredFiles.includes(file))return [file,null];throw e;}
})))])));
const sourceBefore=await identity();
for(const v of variants){const [E,S,V]=await Promise.all(['engine','storage','views'].map(n=>import(pathToFileURL(path.join(v.root,'src',n+'.js')))));Object.assign(v,{E,S,V});}
function fixture(v){
 const s=v.E.newGame(27017);s.runId='qa-round06-native-storage-10000-27017';s.floor=200;s.player.level=100;s.player.gold=1000000;s.player.hp=v.E.stats(s).maxHp;
 while(s.player.items.length<10000)s.player.items.push(v.E.makeItem(s,undefined,s.nextId%8));
 assert(v.S.validateSave(s));assert.deepEqual(v.S.decodeSave(v.S.encodeSave(s)),s);return s;
}
const state=fixture(variants[0]);assert.deepEqual(fixture(variants[1]),state,'Original and current APIs produce identical complete 10000-item fixture');
const raw=variants[0].S.encodeSave(state);assert.equal(raw,variants[1].S.encodeSave(state));assert(Buffer.byteLength(raw)<5000000);
const schedule=[{phase:'warmup',pair:0,label:'baseline'},{phase:'warmup',pair:0,label:'current'},...Array.from({length:12},(_,i)=>(i%2?['current','baseline']:['baseline','current']).map(label=>({phase:'measured',pair:i+1,label}))).flat()];
const protocol={createdAt:new Date().toISOString(),pairs:12,samplesPerActionPerVersion:12,warmupsPerActionPerVersion:1,schedule,
 fixture:{seed:27017,runId:state.runId,items:10000,rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:sha(raw),stateSha256:sha(state)},viewport:{width:1920,height:1080},deviceScaleFactor:1,effects:'low',reducedMotion:'reduce',
 actions:['Native first inventory open from the game screen','Native weapon filter click from all-items page 0','Native next-page click from weapon page 0 to page 1'],
 clock:'Trusted click capture listener to the second requestAnimationFrame callback. UI handlers, rendering and observed frame delay included; protocol transport and correctness checks excluded.',
 cdpClock:'CDP Performance cumulative counters are read after the explicit locator trial check but before the actual Playwright click, and again after the measured promise is read back. This wider observation includes browser/automation work before click dispatch and after the second RAF; it is not the exact latency window or engine-only CPU time.',
 deadline:'A fixed 30-second host deadline bounds reading each measured browser promise even if the renderer cannot run its own timer. Failure retains its active case and never substitutes another sample.',
 quantile:'Sorted rank floor((n-1)*p). Paired differences use current minus baseline. Only the fixed warmups are excluded. No tail removal, adaptive sample count or retry replacement.',
 lifecycle:'One Chromium process; a fresh context and real native main/mirror save for each scheduled entry. Open then filter then page always in this declared order. Contexts never overlap.',
 correctness:'Across versions only the explicit reclaim-on-demand strip is excluded and separately retained; every other node must remain equal. Each complete inventory section is compared with its own source center(state,ui), parsed by native DOMParser. Card IDs, actions, text and all attributes are retained. Complete persisted bytes and decoded state including RNG are unchanged; primary and mirror must be identical.',
 sourceIdentity:'All JavaScript and CSS under src plus index/package metadata are hashed before module imports and after all samples. Every scheduled context checks the navigated document and served runtime bytes against those identities before timing. Package metadata remains HTTP 404 and its local version must match the served release.',
 limits:['Synthetic fixed 10000-item inventory; not natural-player distribution.','Software ANGLE SwiftShader and browser callback latency; not physical GPU FPS, disk durability or a save-transaction speed claim.','No engine, storage, quota, Web Locks, handler or animation API is replaced.']};
const report={status:'PREPARED',protocol,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore,sourceHttpIdentity:[],runs:[],errors:[],aggregate:{}};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
if(args['prepare-only']){console.log(JSON.stringify({status:'PREPARED',pairs:12,fixture:protocol.fixture}));process.exit(0);}
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();report.status='RUNNING';
const summary=xs=>{assert(xs.length&&xs.every(Number.isFinite));const a=xs.toSorted((x,y)=>x-y),q=p=>a[Math.floor((a.length-1)*p)];return {n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1),min:a[0]};};
async function measuredResult(page){
 let timer;
 try{return await Promise.race([page.evaluate(()=>window.__round24Done),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Measured inventory promise exceeded the fixed 30-second host deadline')),30000);})]);}
 finally{clearTimeout(timer);}
}
async function verifyServedSource(context,page,response,v,entry){
 assert.equal(response?.status(),200,'The navigated test document must load successfully');
 const release=await page.locator('meta[name="dice-abyss-release"]').getAttribute('content');
 assert.equal(release,JSON.parse(await fs.readFile(path.join(v.root,'package.json'),'utf8')).version);
 const documentSha256=sha(await response.body());assert.equal(documentSha256,report.sourceBefore[v.label]['index.html'].sha256,'Navigated document must match declared index.html');
 const assets=await Promise.all(files.map(async file=>{
  const res=await context.request.get(new URL(file,page.url()).href,{headers:{'Cache-Control':'no-cache'}}),bytes=await res.body(),expected=report.sourceBefore[v.label][file];
  const asset={file,url:res.url(),status:res.status(),bytes:bytes.length,sha256:sha(bytes)};
  if(file==='package.json'){assert.equal(asset.status,404,'The runtime-only server must not serve package metadata');asset.scope='local-metadata-intentionally-not-served';}
  else if(!expected)assert([404,410].includes(asset.status),`Absent source ${file} must be absent over HTTP`);
  else {assert.equal(asset.status,200,`${v.label} ${file} must be served`);assert.equal(asset.bytes,expected.bytes,`${v.label} ${file} byte length must match`);assert.equal(asset.sha256,expected.sha256,`${v.label} ${file} SHA-256 must match`);}
  return asset;
 }));
 report.sourceHttpIdentity.push({...entry,release,documentUrl:page.url(),documentSha256,assets});
}
async function measure(page,selector,cdp){
 await page.locator(selector).scrollIntoViewIfNeeded();await page.locator(selector).click({trial:true});
 await page.evaluate(selector=>{
  const selectors=['.topbar','.left-rail','.right-rail','.bottomline'],refs=selectors.map(s=>document.querySelector(s));
  window.__round24Refs={selectors,refs};
  window.__round24Done=new Promise((resolve,reject)=>{
   const limit=setTimeout(()=>reject(Error('Fixed 30-second measured deadline exceeded')),30000);
   const listener=event=>{
    if(!event.target.closest(selector))return;document.removeEventListener('click',listener,true);
    const start=performance.now(),trusted=event.isTrusted,tasks=[];
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))):null;
    observer?.observe({type:'longtask',buffered:false});
    requestAnimationFrame(()=>{const first=performance.now();requestAnimationFrame(()=>{
     const end=performance.now();
     setTimeout(()=>{tasks.push(...(observer?.takeRecords()||[]).map(e=>({start:e.startTime,duration:e.duration})));observer?.disconnect();clearTimeout(limit);
      resolve({trusted,visibility:document.visibilityState,start,first,end,elapsedMs:end-start,firstFrameDelayMs:first-start,longTasks:tasks.filter(e=>e.start<end&&e.start+e.duration>start).map(e=>({...e,overlapMs:Math.max(0,Math.min(end,e.start+e.duration)-Math.max(start,e.start))}))});
     },0);
    });});
   };document.addEventListener('click',listener,true);
  });
 },selector);
 const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
 await page.locator(selector).click();const result=await measuredResult(page);
 const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
 result.cdpObservationMs=Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'].map(k=>[k,(after[k]-before[k])*1000]));
 result.cdpObservation= {startTimestamp:before.Timestamp,endTimestamp:after.Timestamp,wallSpanMs:(after.Timestamp-before.Timestamp)*1000};
 assert(Object.values(result.cdpObservationMs).every(value=>Number.isFinite(value)&&value>=0),'CDP counters must be finite and monotonic');
 assert(Number.isFinite(result.cdpObservation.wallSpanMs)&&result.cdpObservation.wallSpanMs>=0,'CDP observation must have a finite non-negative wall span');
 assert(result.trusted&&result.visibility==='visible');assert(Number.isFinite(result.elapsedMs)&&result.elapsedMs>=0);return result;
}
try{
 for(const entry of schedule){
  report.active={...entry,stage:'load'};const v=variants.find(v=>v.label===entry.label),S=v.S;
  const context=await browser.newContext({viewport:protocol.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  try{
   await context.route('**/*',r=>r.request().url().startsWith(new URL(v.url).origin+'/')?r.continue():r.abort());
   const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push({entry,message:String(e)}));page.on('console',m=>{if(m.type()==='error')report.errors.push({entry,type:'console',message:m.text()});});
   const response=await page.goto(v.url);await verifyServedSource(context,page,response,v,entry);
   if(entry.phase==='warmup'){
    report.environments??={};report.environments[entry.label]=await page.evaluate(()=>{
     const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
     const r={userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,webLocks:!!navigator.locks,longTasks:PerformanceObserver.supportedEntryTypes.includes('longtask'),dpr:devicePixelRatio};gl?.getExtension('WEBGL_lose_context')?.loseContext();return r;
    });
   }
   await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw,main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
   await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
   const ui={view:'inventory',inventorySlot:'',inventoryPage:0,busy:false};
   for(const [action,selector,slot,nextPage] of [['open','.main-nav [data-action="inventory"]','',0],['filter','[data-action="filter"][data-slot="weapon"]','weapon',0],['page','.inventory-pagination [data-action="inventory-page"][data-page="1"]','weapon',1]]){
    report.active={...entry,stage:action};const measured=await measure(page,selector,cdp);report.active.measurement=measured;await save();ui.inventorySlot=slot;ui.inventoryPage=nextPage;
    const expected=v.V.center(state,ui);
    const dom=await page.evaluate(expected=>{
     const next=new DOMParser().parseFromString(expected,'text/html').querySelector('.inventory-screen'),actual=document.querySelector('.inventory-screen');
     return {actual:actual.outerHTML,expected:next.outerHTML,ids:[...actual.querySelectorAll('.inventory-list [data-action="lock"]')].map(n=>n.dataset.id),shellRetained:window.__round24Refs.selectors.map((s,i)=>window.__round24Refs.refs[i]===document.querySelector(s)),values:[...actual.querySelectorAll('input,select')].map(n=>({id:n.id,value:n.value}))};
    },expected);
    if(dom.actual!==dom.expected){await fs.writeFile(path.join(output,'FAIL-actual.html'),dom.actual);await fs.writeFile(path.join(output,'FAIL-expected.html'),dom.expected);}assert.equal(dom.actual,dom.expected,'Complete native DOM matches own source; no fields removed');assert.equal(dom.ids.length,60);
    const stored=await page.evaluate(({main,mirror})=>({main:localStorage.getItem(main),mirror:localStorage.getItem(mirror)}),{main:S.SAVE_KEY,mirror:S.BACKUP_KEY});
    assert.equal(stored.main,raw);assert.equal(stored.mirror,raw);assert.deepEqual(S.decodeSave(stored.main),state);
    assert(dom.shellRetained.every(x=>x===(action!=='open')),'Both versions rebuild on first open and preserve the outer shell on pure view choices');
    const crossVersion=await page.evaluate(()=>{const copy=document.querySelector('.inventory-screen').cloneNode(true),strip=copy.querySelector('.inventory-reclaim'),reclaim=strip.outerHTML;strip.replaceWith(document.createComment('Round24 intentional reclaim-on-demand strip'));return {normalized:copy.outerHTML,reclaim};});
    report.domReferences??={};report.domReferences[action]??=sha(crossVersion.normalized);assert.equal(sha(crossVersion.normalized),report.domReferences[action],'All inventory DOM outside the intentional reclaim strip must match across versions');
    report.reclaimReferences??={};report.reclaimReferences[entry.label]??=crossVersion.reclaim;assert.equal(crossVersion.reclaim,report.reclaimReferences[entry.label],'The full reclaim strip must remain stable within its version');
    report.runs.push({...entry,action,...measured,completeDomEqual:true,actualDomSha256:sha(dom.actual),expectedDomSha256:sha(dom.expected),cardIds:dom.ids,shellRetained:dom.shellRetained,controlValues:dom.values,reclaimHtml:crossVersion.reclaim,crossVersionDomSha256:sha(crossVersion.normalized),fullSaveUnchanged:true,mirrorIdentical:true});
    console.log(`${entry.phase} ${entry.pair} ${entry.label} ${action}: ${measured.elapsedMs.toFixed(1)}ms`);await save();
   }
   if(entry.phase==='measured'&&entry.pair===12){await page.reload();await page.locator('[data-action="continue"]').click();assert.equal(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY),raw);report.runs.at(-1).reloadExact=true;}
  }finally{await context.close();}
 }
 for(const action of ['open','filter','page']){
  const rows=report.runs.filter(r=>r.phase==='measured'&&r.action===action);report.aggregate[action]={};
  for(const label of ['baseline','current']){const own=rows.filter(r=>r.label===label);assert.equal(own.length,12,'Every declared measured sample must be retained');report.aggregate[action][label]={elapsedMs:summary(own.map(r=>r.elapsedMs)),cdpObservationMs:Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'].map(k=>[k,summary(own.map(r=>r.cdpObservationMs[k]))])),firstFrameDelayMs:summary(own.map(r=>r.firstFrameDelayMs)),longTaskCount:own.reduce((n,r)=>n+r.longTasks.length,0),maxLongTaskMs:Math.max(0,...own.flatMap(r=>r.longTasks.map(t=>t.duration)))};}
  const differences=Array.from({length:12},(_,i)=>{const pair=rows.filter(r=>r.pair===i+1);return pair.find(r=>r.label==='current').elapsedMs-pair.find(r=>r.label==='baseline').elapsedMs;});report.aggregate[action].pairedCurrentMinusBaselineMs={values:differences,summary:summary(differences)};
 }
 report.status=report.errors.length?'MEASURED_WITH_ERRORS':'MEASURED';
}catch(e){report.status='FAIL';report.failure={message:String(e),stack:e.stack};process.exitCode=1;}
finally{const afterFiles=await identityFiles();report.sourceAfter=await identity(afterFiles);report.sourceUnchanged=JSON.stringify(files)===JSON.stringify(afterFiles)&&JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(!report.sourceUnchanged){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}report.finishedAt=new Date().toISOString();if(report.status==='MEASURED'||report.status==='MEASURED_WITH_ERRORS')delete report.active;await save();await browser.close();}
console.log(JSON.stringify({status:report.status,runs:report.runs.length,errors:report.errors,sourceUnchanged:report.sourceUnchanged,aggregate:report.aggregate}));
