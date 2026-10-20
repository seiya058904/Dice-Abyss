// External Playwright, isolated synthetic storage. Keep all attempts outside Git.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
assert(args.output&&args.baseline&&args.current);
const output=path.resolve(args.output);await fs.mkdir(output); // Never replace failed evidence.
const sha=x=>createHash('sha256').update(x).digest('hex');
const modes=args.instrumentation==='off'?[false]:[false,true];
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={browser:browser.version(),os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0].model,backend:'ANGLE SwiftShader',dpr:1,viewport:{width:1920,height:1080},cache:'fresh contexts; fonts warmed before interaction',clock:'trusted click to second RAF, not single-frame duration; committedMs adds second RAF after mirror write, observed with the same temporary setItem wrapper in both arms',quantile:'floor((n-1)*p); warmup retained but excluded',runs:[],fixtures:[],errors:[],summary:{},sources:{}};
report.scriptSha256=sha(await fs.readFile(new URL(import.meta.url)));
for(const label of ['baseline','current']){
 report.sources[label]={};
 for(const file of ['index.html',...(await fs.readdir(new URL('../src/',import.meta.url))).filter(x=>/\.(js|css)$/.test(x)).map(x=>'src/'+x)]){
  const response=await fetch(new URL(file,args[label]));assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());report.sources[label][file]={bytes:bytes.length,sha256:sha(bytes)};
 }
}
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const stats=xs=>{const a=xs.toSorted((a,b)=>a-b),q=p=>a[Math.floor((a.length-1)*p)];return{n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1)};};
async function click(page,selector,cdp,transaction=false){
 const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();await target.click({trial:true});
 await page.evaluate(({selector,transaction})=>{
  window.__samples=[];window.__tasks=[];
  window.__done=new Promise(resolve=>{
   const listener=e=>{if(!e.target.closest(selector))return;document.removeEventListener('click',listener,true);
    const start=performance.now();
    // Storage write completion is observed without polling/parsing the 2 MB save.
    // A temporary wrapper is identical in both arms; initial click metric remains separate.
    let committed=Promise.resolve(null);
    if(transaction){
     committed=new Promise(done=>{
      const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){const value=set.call(this,k,v);if(k==='dice-abyss:mirror:v1'){Storage.prototype.setItem=set;requestAnimationFrame(()=>requestAnimationFrame(()=>done(performance.now()-start)));}return value;};
     });
    }
    requestAnimationFrame(()=>requestAnimationFrame(async()=>{const end=performance.now(),committedMs=await committed;setTimeout(()=>resolve({trusted:e.isTrusted,start,end,ms:end-start,committedMs,operations:window.__samples,stages:performance.getEntriesByType('measure').map(x=>({name:x.name,start:x.startTime,ms:x.duration})),longTasks:window.__tasks.filter(x=>x.start<start+(committedMs||end-start)&&x.start+x.ms>start)}),0);}));};
   performance.clearMeasures();document.addEventListener('click',listener,true);
  });
 },{selector,transaction});
 const before=(await cdp.send('Performance.getMetrics')).metrics;
 await target.click();let deadline;
 const result=await Promise.race([page.evaluate(()=>window.__done),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('30s action deadline')),30000);})]).finally(()=>clearTimeout(deadline));
 const after=(await cdp.send('Performance.getMetrics')).metrics;
 result.cdp=Object.fromEntries(after.filter(x=>/Duration$/.test(x.name)).map(x=>[x.name,x.value-(before.find(y=>y.name===x.name)?.value||0)]));
 assert(result.trusted);return result;
}
try{
 for(const size of (args.sizes||'1000,10000').split(',').map(Number)){
  const state=E.newGame(27017);state.runId=`qa-round27-${size}`;state.floor=200;state.player.level=100;state.player.gold=1000000;state.player.hp=E.stats(state).maxHp;
  while(state.player.items.length<size)state.player.items.push(E.makeItem(state,'weapon',state.nextId%8));
  assert(S.validateSave(state));const raw=S.encodeSave(state);
  report.fixtures.push({size,sha256:sha(raw),bytes:Buffer.byteLength(raw)});await fs.writeFile(path.join(output,`fixture-${size}.json`),raw);
  const pairs=Number(args.pairs||12);
  for(let pair=0;pair<=pairs;pair++)for(const label of pair%2?['current','baseline']:['baseline','current'])for(const instrumented of modes){
   const run={size,pair,warmup:pair===0,label,instrumented,url:args[label],actions:{},errors:[]};report.runs.push(run);
   const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
   await context.addInitScript(({raw,instrumented})=>{
    localStorage.setItem('dice-abyss:save:v1',raw);localStorage.setItem('dice-abyss:mirror:v1',raw);
    localStorage.setItem('dice-abyss:settings:v1',JSON.stringify({effects:'full',sound:false,scale:1}));
    window.__samples=[];window.__tasks=[];
    new PerformanceObserver(list=>window.__tasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask'});
    if(instrumented){
     const wrap=(obj,key)=>{const old=obj[key];obj[key]=function(...a){const t=performance.now();let result;try{return result=old.apply(this,a);}finally{window.__samples.push({name:key,key:typeof a[0]==='string'?a[0]:null,length:typeof a[1]==='string'?a[1].length:typeof result==='string'?result.length:null,ms:performance.now()-t});}};};
     wrap(window,'structuredClone');wrap(Storage.prototype,'getItem');wrap(Storage.prototype,'setItem');
    }
   },{raw,instrumented});
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>run.errors.push(String(e)));
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Network.enable');run.network=[];const requests=new Map();
   cdp.on('Network.responseReceived',e=>{const row={url:e.response.url,status:e.response.status,type:e.type,contentEncoding:e.response.headers['Content-Encoding']||'identity',encodedBytes:0};requests.set(e.requestId,row);run.network.push(row);});
   cdp.on('Network.loadingFinished',e=>{if(requests.has(e.requestId))requests.get(e.requestId).encodedBytes=e.encodedDataLength;});
   try{
    await page.goto(args[label]);await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);await page.locator('#primary-action:not(:disabled)').waitFor();
    if(args.profile==='true')await cdp.send('Profiler.enable').then(()=>cdp.send('Profiler.start'));
    run.actions.open=await click(page,'.main-nav [data-action="inventory"]',cdp);
    run.actions.filter=await click(page,'[data-action="filter"][data-slot="weapon"]',cdp);
    run.actions.page=await click(page,'[data-action="inventory-page"][data-page="1"]',cdp);
    let expected=state;
    const lock=page.locator('.inventory-list [data-action="lock"]').first(),id=await lock.getAttribute('data-id');
    run.actions.lock=await click(page,`[data-action="lock"][data-id="${id}"]`,cdp,true);expected=E.transition(expected,{type:'lock',id});
    await page.waitForFunction(rev=>JSON.parse(JSON.parse(localStorage.getItem('dice-abyss:save:v1')).payload).revision===rev,expected.revision);
    const equip=page.locator('.inventory-list [data-action="equip"]:not(:disabled)').first(),equipId=await equip.getAttribute('data-id');
    run.actions.equip=await click(page,`[data-action="equip"][data-id="${equipId}"]`,cdp,true);expected=E.transition(expected,{type:'equip',id:equipId});
    await page.waitForFunction(rev=>JSON.parse(JSON.parse(localStorage.getItem('dice-abyss:save:v1')).payload).revision===rev,expected.revision);
    const salvage=page.locator('.inventory-list [data-action="salvage-item"]:not(:disabled)').first(),salvageId=await salvage.getAttribute('data-id');
    await salvage.click();run.actions.salvage=await click(page,'[data-action="confirm"]',cdp,true);expected=E.transition(expected,{type:'salvage',ids:[salvageId],allowProtected:true,allowOverflow:false});
    await page.waitForFunction(rev=>JSON.parse(JSON.parse(localStorage.getItem('dice-abyss:save:v1')).payload).revision===rev,expected.revision);
    const saved=await page.evaluate(()=>[localStorage.getItem('dice-abyss:save:v1'),localStorage.getItem('dice-abyss:mirror:v1')]);
    assert.equal(saved[0],saved[1]);assert.deepEqual(S.decodeSave(saved[0]),expected);run.afterSha256=sha(saved[0]);assert.equal(run.errors.length,0);
    if(args.profile==='true'){const profile=await cdp.send('Profiler.stop');await fs.writeFile(path.join(output,`${size}-${pair}-${label}-${instrumented}.cpuprofile`),JSON.stringify(profile.profile));}
    run.warning=await page.locator('.bottomline').innerText();run.status='PASS';
   }catch(e){run.status='FAIL';run.failure=String(e);await page.screenshot({path:path.join(output,`FAIL-${size}-${pair}-${label}-${instrumented}.png`)});throw e;}
   finally{await context.close();await persist();}
  }
 }
 for(const size of report.fixtures.map(x=>x.size))for(const instrumented of modes)for(const action of ['open','filter','page','lock','equip','salvage']){
  const runs=report.runs.filter(x=>x.size===size&&x.instrumented===instrumented&&!x.warmup);
  const values=label=>runs.filter(x=>x.label===label).map(x=>x.actions[action]);
  report.summary[`${size}/${instrumented}/${action}`]=Object.fromEntries(['baseline','current'].map(label=>[label,{...stats(values(label).map(x=>x.ms)),committed:['lock','equip','salvage'].includes(action)?stats(values(label).map(x=>x.committedMs)):null}]));
  report.summary[`${size}/${instrumented}/${action}`].paired=stats(values('current').map((x,i)=>x.ms-values('baseline')[i].ms));
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(String(e));process.exitCode=1;}
finally{await persist();await browser.close();}
console.log(JSON.stringify({status:report.status,summary:report.summary,errors:report.errors}));
