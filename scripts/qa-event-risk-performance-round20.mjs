// Optional paired browser measurement; no game runtime dependency.
// Measures trusted choice-click to two rAF callbacks with a real open dialog.
// This laboratory duration is not field INP, full input latency or GPU FPS.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');assert(i>0,'Use --name=value');return [arg.slice(0,i),arg.slice(i+1)];}));
const root=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const baseline=path.resolve(args['--baseline-source']||root);
const output=path.resolve(args['--output']||'/tmp/dice-abyss-event-risk-performance');
const samples=Number(args['--samples']||12);assert(Number.isInteger(samples)&&samples>=12&&samples<=30);
const mode=args['--mode']||'dialog';assert(['dialog','return'].includes(mode),'Use --mode=dialog or --mode=return');
const selector=mode==='dialog'?'[data-action="event-choice"][data-id="roll"]':'.manual-control [data-action="game"]';
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const E=await import(pathToFileURL(path.join(root,'src/engine.js'))),S=await import(pathToFileURL(path.join(root,'src/storage.js')));
const {eventFixture}=await import(pathToFileURL(path.join(root,'scripts/audit-event-context.mjs')));
const sourceFiles=async dir=>['index.html','package.json',...(await fs.readdir(path.join(dir,'src'))).filter(f=>/\.(js|css)$/.test(f)).map(f=>'src/'+f)].sort();
const files=[...new Set([...await sourceFiles(root),...await sourceFiles(baseline)])].sort();
async function identity(dir){return Object.fromEntries(await Promise.all(files.map(async f=>[f,await fs.readFile(path.join(dir,f)).then(sha).catch(e=>{if(e.code==='ENOENT')return null;throw e;})])));}
const variants=[{label:'baseline',dir:baseline,url:args['--baseline-url']||'http://127.0.0.1:4188'},{label:'current',dir:root,url:args['--url']||'http://127.0.0.1:4189'}];
const report={protocol:'round20-paid-event-dialog-two-raf',started:new Date().toISOString(),samplesPerCellPerVersion:samples,synthetic:true,viewport:[1920,1080],effects:'low',sourceBefore:{baseline:await identity(baseline),current:await identity(root)},fixtures:[],runs:[],warmups:[],pairOrders:[],errors:[],status:'RUNNING',notes:['Each version uses the same complete legal synthetic fixture, with equipped items at the tail for the 10000-item case.','One warmup per fixture and version is retained separately and excluded from statistics. Every measured pair alternates order.','The timer starts in native click capture and ends at the second rAF callback; both callbacks and any overlapping long tasks are retained. It excludes input before capture and is not field INP.','Opening and cancelling the dialog must preserve both complete durable save strings. No purchase is made during these timing samples.','No retries replace failed samples. Browser timings are software-rendered lab observations, not a general speed-up or hardware certification.']};
report.mode=mode;report.protocol=`round20-paid-event-${mode}-two-raf`;
report.measuredAction=mode==='dialog'?'Native paid-choice click opens its confirmation dialog.':'Native return-to-game click from the talent view reconstructs the complete event page. Talent navigation is outside the measured window and never invests a point.';
report.estimator='sorted floor((n-1)*p); with n=12, p95 is the 11th ordered value; maximum is reported separately. The tail sample is small.';
report.driverSha256=sha(await fs.readFile(new URL(import.meta.url)));
report.fixtureHelperSha256=sha(await fs.readFile(path.join(root,'scripts/audit-event-context.mjs')));
assert.equal(sha(await fs.readFile(path.join(baseline,'scripts/audit-event-context.mjs'))),report.fixtureHelperSha256);
await fs.mkdir(output,{recursive:true});
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:args['--browser']||process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();const entries=[];
const quantiles=values=>{const v=values.toSorted((a,b)=>a-b),at=p=>v[Math.floor((v.length-1)*p)];return {n:v.length,p50:at(.5),p95:at(.95),max:v.at(-1),min:v[0]};};
function fixture(key,count){
 const s=eventFixture({E,S},key,{floor:key==='gambit'?30:140,rich:true,spares:false});
 s.runId=`round20-dialog-${key}-${count}`;s.event.costGold=835;s.player.gold=2505;
 const equipped=s.player.items.filter(i=>Object.values(s.player.equipped).includes(i.id));
 assert.equal(equipped.length,3);const base=E.makeItem(s,'weapon',0);
 s.player.items=[...Array.from({length:count-3},()=>({...base,id:`i${s.nextId++}`})),...equipped];
 s.player.hp=E.stats(s).maxHp;assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);return s;
}
async function load(entry,state){
 const {page,variant}=entry,raw=S.encodeSave(state);await page.goto(variant.url);
 const release=JSON.parse(await fs.readFile(path.join(variant.dir,'package.json'),'utf8')).version;
 assert.equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),release);
 await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw,main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);
 if(mode==='return')await page.locator('.main-nav [data-action="talents"]').click();
 await page.locator(selector).scrollIntoViewIfNeeded();return raw;
}
async function measure(entry,state,raw){
 const {page,variant}=entry;
 await page.evaluate(({selector,mode})=>{window.__riskTiming=new Promise(resolve=>{
  const handler=event=>{if(!event.target.closest(selector))return;document.removeEventListener('click',handler,true);
   const start=performance.now(),trusted=event.isTrusted,tasks=[];
   const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(t=>({start:t.startTime,duration:t.duration})))):null;
   observer?.observe({type:'longtask',buffered:false});
   requestAnimationFrame(()=>{const first=performance.now();requestAnimationFrame(()=>{const end=performance.now();
    const target=document.querySelector(mode==='dialog'?'dialog[open]':'.event-screen'),visible=!!target&&target.getBoundingClientRect().height>0;
    setTimeout(()=>{if(observer){tasks.push(...observer.takeRecords().map(t=>({start:t.startTime,duration:t.duration})));observer.disconnect();}
     resolve({trusted,startTimeMs:start,endTimeMs:end,clickToFirstRafMs:first-start,clickToSecondRafMs:end-start,secondIntervalMs:end-first,targetVisible:visible,visibility:document.visibilityState,longTasksSupported:!!observer,longTasks:tasks.filter(t=>t.start<end&&t.start+t.duration>start),observedLongTasks:tasks});
    },0);
   });});
  };document.addEventListener('click',handler,true);
 });},{selector,mode});
 await page.locator(selector).click();
 const result=await page.evaluate(()=>Promise.race([window.__riskTiming,new Promise((_,reject)=>setTimeout(()=>reject(Error('30s measurement deadline')),30000))]));
 assert(result.trusted&&result.targetVisible&&result.visibility==='visible');
 assert(Math.abs(result.clickToFirstRafMs+result.secondIntervalMs-result.clickToSecondRafMs)<1e-6);
 const target=page.locator(mode==='dialog'?'dialog[open]':'.event-screen');assert((await target.innerText()).includes('835'));
 if(variant.label==='current')assert.equal(await target.locator('.event-risk-table tbody tr').count(),3);
 const durable=()=>page.evaluate(({main,mirror})=>[localStorage.getItem(main),localStorage.getItem(mirror)],{main:S.SAVE_KEY,mirror:S.BACKUP_KEY});
 assert.deepEqual(await durable(),[raw,raw]);
 if(mode==='dialog'){
  await target.locator('.dialog-buttons [data-action="close-dialog"]').click();assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.id),'roll');
 }else await page.locator('.main-nav [data-action="talents"]').click();
 assert.deepEqual(await durable(),[raw,raw]);
 return {...result,completeStateUnchanged:true,mirrorUnchanged:true,...(mode==='dialog'?{cancelRestoresFocus:true}:{returnedWithoutInvestment:true})};
}
try{
 for(const variant of variants){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.errors.push({label:variant.label,kind:'pageerror',message:String(e)}));page.on('console',m=>{if(m.type()==='error')report.errors.push({label:variant.label,kind:'console',message:m.text()});});
  await page.goto(variant.url);
  for(const file of files.filter(f=>f!=='package.json')){const response=await page.request.get(variant.url+'/'+file),expected=report.sourceBefore[variant.label][file];if(expected===null)assert([404,410].includes(response.status()));else{assert.equal(response.status(),200);assert.equal(sha(await response.body()),expected);}}
  entries.push({variant,context,page});
 }
 for(const key of ['gambit','wishingvault'])for(const count of [3,10000]){
  const state=fixture(key,count),raw=S.encodeSave(state),cell=`${key}/${count}`;
  await fs.writeFile(path.join(output,`fixture-${key}-${count}.json.gz`),(await import('node:zlib')).gzipSync(JSON.stringify(state),{level:9}));
  report.fixtures.push({cell,stateSha256:sha(state),rawSha256:sha(raw),encodedUtf8Bytes:Buffer.byteLength(raw),equippedTail:true,file:`fixture-${key}-${count}.json.gz`});
  for(const entry of entries){assert.equal(await load(entry,state),raw);report.activeCase={cell,label:entry.variant.label,warmup:true};report.warmups.push({cell,label:entry.variant.label,...await measure(entry,state,raw)});await save();}
  for(let sample=1;sample<=samples;sample++){
   const pair=report.pairOrders.length+1,ordered=pair%2?entries:entries.toReversed(),order=ordered.map(e=>e.variant.label);report.pairOrders.push({pair,cell,sample,order});
   for(const entry of ordered){report.activeCase={cell,label:entry.variant.label,sample,pair};report.runs.push({cell,label:entry.variant.label,sample,pair,order,...await measure(entry,state,raw)});await save();}
  }
  console.log(`${cell}: ${samples} paired samples complete`);
 }
 report.aggregate=[];for(const cell of report.fixtures.map(f=>f.cell))for(const label of ['baseline','current']){const rows=report.runs.filter(r=>r.cell===cell&&r.label===label);report.aggregate.push({cell,label,clickToSecondRafMs:quantiles(rows.map(r=>r.clickToSecondRafMs)),clickToFirstRafMs:quantiles(rows.map(r=>r.clickToFirstRafMs)),longTasks:rows.reduce((n,r)=>n+r.longTasks.length,0)});}
 report.sourceAfter={baseline:await identity(baseline),current:await identity(root)};assert.deepEqual(report.sourceAfter,report.sourceBefore);
 assert.equal(sha(await fs.readFile(new URL(import.meta.url))),report.driverSha256);
 assert.equal(sha(await fs.readFile(path.join(root,'scripts/audit-event-context.mjs'))),report.fixtureHelperSha256);
 report.sourceStable=true;report.driverAndHelperStable=true;assert.equal(report.errors.length,0);report.status='MEASURED_WITH_LIMITATIONS';delete report.activeCase;
}catch(error){report.status='FAILED';report.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{report.completed=new Date().toISOString();await save();for(const e of entries)await e.context.close();await browser.close();}
console.log(JSON.stringify({status:report.status,measured:report.runs.length,warmups:report.warmups.length,errors:report.errors,failure:report.failure}));
