// Diagnostic instrumented page, NOT an unmodified-build latency benchmark.
// Route-only wrappers time exported synchronous phases; source files remain
// untouched. Supply installed tester Playwright/Chromium, never runtime deps.
// node scripts/qa-inventory-phases-round25.mjs --source=/absolute/project \
//   --url=http://127.0.0.1:4188/ --output=/tmp/fresh-diagnostic
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const index=arg.indexOf('=');return [arg.slice(2,index),arg.slice(index+1)];}));
assert(args.source&&args.url&&args.output,'Supply source, local URL and a fresh output directory');
const root=path.resolve(args.source),output=path.resolve(args.output),url=new URL(args.url);
assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
assert(output!==root&&!output.startsWith(root+path.sep));
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const sha=value=>createHash('sha256').update(value).digest('hex');
const [E,S,V]=await Promise.all(['engine','storage','views'].map(name=>import(pathToFileURL(path.join(root,'src',name+'.js')))));
const state=E.newGame(27017);state.runId='round25-inventory-phase-27017';state.floor=200;state.player.level=100;state.player.gold=1000000;
while(state.player.items.length<10000)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
state.player.hp=E.stats(state).maxHp;assert(S.validateSave(state));
const raw=S.encodeSave(state);assert.deepEqual(S.decodeSave(raw),state);
const names={
 'src/views.js':['center'],
 'src/inventory-render.js':['updateInventoryDOM'],
 'src/inventory-dom.js':['captureInventoryPosition','restoreInventoryPosition'],
 'src/fusion-dom.js':['captureWorkbenchPosition','restoreWorkbenchPosition'],
};
const instrumented=new Map(),identities={};
for(const [file,exports]of Object.entries(names)){
 const original=await fs.readFile(path.join(root,file),'utf8');let source=original;
 for(const name of exports){
  const signature=`export function ${name}(`;assert.equal(source.split(signature).length,2,`${file} exact export ${name}`);
  source=source.replace(signature,`function __r25_original_${name}(`);
  source+=`\nexport function ${name}(...args){const active=window.__r25PhaseActive,start=performance.now();try{return __r25_original_${name}(...args);}finally{if(active)window.__r25PhaseRows.push({name:${JSON.stringify(name)},start,duration:performance.now()-start});}}\n`;
 }
 instrumented.set('/'+file,source);identities[file]={originalSha256:sha(original),instrumentedSha256:sha(source),bytes:Buffer.byteLength(original)};
}
const report={status:'RUNNING',protocol:{purpose:'Locate synchronous inventory costs and layout work; instrumented page latency is not a product performance claim.',seed:27017,items:10000,viewport:{width:1920,height:1080},dpr:1,effects:'low',reducedMotion:'reduce',warmupRounds:1,diagnosticRounds:4,
 clock:'Trusted click capture to second requestAnimationFrame. Wrapped exported functions measure synchronous wall time with instrument overhead. CDP counters use a wider observation before dispatch until reading completion. Wrappers may nest; do not sum nested times.',
 trace:'First diagnostic round only: devtools.timeline and V8 stack events, raw gzip retained. Trace timing is not compared with untraced rounds.',
 limitations:['Synthetic full inventory, not natural gameplay.','Software renderer if configured; no physical GPU FPS claim.','No statistics-based speed claim or tail exclusion.','No state, save, handler, sorting or transaction implementation is replaced.']},identities,fixtureSha256:sha(raw),runs:[],errors:[]};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
const actions=[['open','.main-nav [data-action="inventory"]','',0],['weapon','[data-action="filter"][data-slot="weapon"]','weapon',0],['weapon-page','.inventory-pagination [data-action="inventory-page"][data-page="1"]','weapon',1],['armor','[data-action="filter"][data-slot="armor"]','armor',0],['armor-page','.inventory-pagination [data-action="inventory-page"][data-page="1"]','armor',1],['all','[data-action="filter"][data-slot=""]','',0]];
try{
 for(let round=0;round<5;round++){
  report.active={round,stage:'load'};await save();
  const context=await browser.newContext({viewport:report.protocol.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  try{
   await context.route('**/*',async route=>{
    const requestUrl=new URL(route.request().url());
    if(requestUrl.origin!==url.origin)return route.abort();
    const script=instrumented.get(requestUrl.pathname);
    if(script)return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:script});
    return route.continue();
   });
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push({round,error:String(error)}));
   await page.goto(url.href);await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{raw,main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
   await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
   const trace=[];
   if(round===1){cdp.on('Tracing.dataCollected',event=>trace.push(...event.value));await cdp.send('Tracing.start',{categories:'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline.stack',transferMode:'ReportEvents'});}
   for(const [action,selector,inventorySlot,inventoryPage]of actions){
    report.active={round,action};await page.locator(selector).scrollIntoViewIfNeeded();await page.locator(selector).click({trial:true});
    await page.evaluate(selector=>{
     window.__r25PhaseRows=[];window.__r25PhaseActive=false;
     window.__r25PhaseDone=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Phase diagnostic deadline exceeded')),30000);
      const listener=event=>{
       if(!event.target.closest(selector))return;document.removeEventListener('click',listener,true);
       const start=performance.now(),trusted=event.isTrusted;window.__r25PhaseActive=true;
       requestAnimationFrame(()=>{const first=performance.now();requestAnimationFrame(()=>{window.__r25PhaseActive=false;clearTimeout(timer);resolve({trusted,start,first,end:performance.now(),spans:window.__r25PhaseRows});});});
      };document.addEventListener('click',listener,true);
     });
    },selector);
    const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));
    await page.locator(selector).click();const measured=await page.evaluate(()=>window.__r25PhaseDone);
    const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));
    assert(measured.trusted);assert(measured.spans.length);
    const expected=V.center(state,{view:'inventory',inventorySlot,inventoryPage,busy:false});
    const actual=await page.evaluate(expected=>{const expectedNode=new DOMParser().parseFromString(expected,'text/html').querySelector('.inventory-screen');return {actual:document.querySelector('.inventory-screen').outerHTML,expected:expectedNode.outerHTML};},expected);
    assert.equal(actual.actual,actual.expected,'Every complete inventory element must equal source rendering');
    const stored=await page.evaluate(({main,mirror})=>[localStorage.getItem(main),localStorage.getItem(mirror)],{main:S.SAVE_KEY,mirror:S.BACKUP_KEY});assert.deepEqual(stored,[raw,raw]);
    report.runs.push({round,phase:round===0?'warmup':'diagnostic',traced:round===1,action,...measured,elapsedMs:measured.end-measured.start,completeDomSha256:sha(actual.actual),fullSaveUnchanged:true,cdpObservationMs:Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'].map(key=>[key,(after[key]-before[key])*1000]))});
    console.log(`${round} ${action} total ${(measured.end-measured.start).toFixed(1)}ms; ${measured.spans.map(row=>`${row.name}=${row.duration.toFixed(1)}`).join(' ' )}`);await save();
   }
   if(round===1){const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');await complete;const bytes=gzipSync(JSON.stringify({traceEvents:trace}));await fs.writeFile(path.join(output,'trace.json.gz'),bytes);report.trace={events:trace.length,bytes:bytes.length,sha256:sha(bytes)};}
  }finally{await context.close();}
 }
 report.status=report.errors.length?'FAIL':'PASS';assert.equal(report.errors.length,0);
}catch(error){report.status='FAIL';report.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{
 for(const [file,identity]of Object.entries(identities)){const actual=sha(await fs.readFile(path.join(root,file)));if(actual!==identity.originalSha256){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();await save();await browser.close();
}
console.log(JSON.stringify({status:report.status,runs:report.runs.length,output,failure:report.failure}));
