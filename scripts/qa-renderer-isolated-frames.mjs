// A fixed six-window diagnostic, deliberately separate from the formal matrix.
// One new Chromium process per window; B/C, C/B, B/C; synthetic loopback saves.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import * as Q from '../src/equipment.js';
import * as C from '../src/content.js';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
const output=path.resolve(args['--output']||'/tmp/dice-renderer-isolated-frames');
const scene=args['--scene']||'boss-burst';
assert(['boss-burst','eternal-open'].includes(scene),'--scene is boss-burst or eternal-open');
if(scene==='eternal-open')assert(args['--formal-report'],'Eternal diagnostics require the completed formal report for exact fixture matching');
const urls={baseline:args['--baseline-url']||'http://127.0.0.1:4192/',current:args['--url']||'http://127.0.0.1:4193/'};
for(const url of Object.values(urls))assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Only loopback test origins are allowed');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
const seed=20261017,windowMs=4200;
// Byte-equivalent Boss fixture from qa-performance-round.mjs. Verify its hash
// against the already-completed formal matrix before opening any browser.
let before=E.newGame(seed);before.runId=`qa-round-performance-boss-${seed}`;before.floor=140;before.fate=[6,6];before.player.level=80;before.player.gold=500000;before.player.talentPoints=35;
before.roomIndex=5;before.route=Array.from({length:6},(_,i)=>({id:`f140r${i}`,type:i===5?'boss':'combat',quality:0,done:i<5}));
before.phase='route';before.player.hp=E.stats(before).maxHp;before=E.transition(before,{type:'enter'});
for(const key of ['critical','resonance','keen','echo'])before.player.talents[key]=C.TALENTS[key].cap;
for(const [slot,key]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){const item=Q.makeItem(before,slot,4,140);before.player.items.push(item);before.player.equipped[key]=item.id;}
before.player.hp=E.stats(before).maxHp;
const longText='深层战斗合成记录：六骰同点共鸣、暴击追击、护盾吸收与首领阶段交替；本段仅是固定负载，不描述自然探索成绩。';
before.log=Array.from({length:6},(_,i)=>({text:`记录 ${i+1} · ${longText.repeat(5)}`.slice(0,180),tone:['','gold','rare','epic','legendary','danger'][i]}));
let found=false;
for(let rng=1;rng<=5000;rng++){const next=E.transition({...before,rng},{type:'roll'}),r=next.lastRoll;if(r.best>=3&&r.critical&&r.follow&&!r.killed&&next.phase==='combat'){before.rng=rng;found=true;break;}}
assert(found);assert(S.validateSave(before));assert.equal(hash(before),'6ea3205945548483efc8b58227312e59ef6caa20b910ef1d6c5b839fff841b1a','Diagnostic must use the exact formal Boss fixture');
if(scene==='eternal-open'){
 const finish=structuredClone(before);finish.enemy.hp=1;finish.enemy.shield=0;finish.enemy.stage=2;
 before=E.transition(finish,{type:'roll'});assert.equal(before.phase,'chest');before.runId=`qa-round-chest-7-${seed}`;before.chest.item=Q.makeItem(before,'relic',7,140,'boss');
}
const action=scene==='eternal-open'?'open':'roll',effectKind=scene==='eternal-open'?'loot-7':'combat';
const after=E.transition(before,{type:action}),raw=S.encodeSave(before);
assert(S.validateSave(before));assert(S.validateSave(after));
if(scene==='boss-burst')assert.equal(hash(raw),'0ff316363447653b8d44453b8c879129a4119e2aa2a881f6b07d7c86475819bd');
if(args['--formal-report']){
 const formal=JSON.parse(await fs.readFile(path.resolve(args['--formal-report']),'utf8'));
 assert(formal.status!=='RUNNING'&&!formal.errors.length,'Use a completed formal run');
 const fixture=formal.fixtureManifest.find(row=>row.name===scene);assert(fixture,'The formal run must contain this scene');
 assert.equal(hash(before),fixture.stateSha256);assert.equal(hash(raw),fixture.rawSha256);
}
await fs.mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),kind:'FIXED_FRESH_PROCESS_DIAGNOSTIC_NOT_FORMAL_MATRIX',scriptSha256:hash(await fs.readFile(new URL(import.meta.url),'utf8')),scene,action,effectKind,width:3840,height:2160,effects:'full',requestedWindowMs:windowMs,fixtureSha256:hash(before),rawSha256:hash(raw),expectedStateSha256:hash(after),order:['baseline','current','current','baseline','baseline','current'],runs:[],errors:[],notes:[
 'Exactly six new Chromium processes: pair 1 baseline/current, pair 2 current/baseline, pair 3 baseline/current. No warmup exclusions, discarded slow samples, replacements or retries.',
 'The identical formal scene fixture, native primary click, SwiftShader flags, 4200ms requested window and percentile definition are retained. Fresh processes also remove prior viewport/scene history, so this diagnoses process/order/history confounding together.',
 'Both variants receive identical extra probes: per-RAF snapshots and wrapped WebGL drawArrays/drawElements and positive-alpha scene canvas calls. Probe overhead is not subtracted. These results cannot be pooled with the formal matrix.',
 'This is a complete-version comparison. App, views and loaded styles may differ; the actual served source and stylesheet hashes are retained. No differing files are silently normalized.',
 'Draw submission call counts and CPU time inside WebGL API calls are not GPU completion times or physical display frames. No gl.finish, readPixels, synthetic timing hold or quality change is used.',
 'A native RAF window ends on its first delivered callback at or after 4200ms. Action busy duration is measured separately; a late window may end during dice-only before combat FX.',
 'Raw RAF snapshots retain cumulative submissions, canvas budget and effect phase; they do not preserve every dice pose or compositor internals. Browser/driver causality cannot be proved by stage alone.',
 'A fixed 30-second client deadline is retained for each measured window. A failed window is kept and is never replaced.'
]};
const save=()=>fs.writeFile(path.join(output,'renderer-isolated-frames.json'),JSON.stringify(report,null,2)+'\n');

async function arm(page){
 await page.evaluate(({windowMs,effectKind})=>{
  const audit=window.__rendererFrameAudit={started:null,active:false,calls:{gl:0,glCpuMs:0,fx:0},byMotion:{},fxKinds:{},rawFrames:[],tasks:[],busyEndMs:null};
  for(const ctor of [window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean))for(const method of ['drawArrays','drawElements']){
   const original=ctor.prototype[method];
   ctor.prototype[method]=function(...values){
    if(!audit.active||!this.canvas.classList.contains('dice-surface'))return original.apply(this,values);
    const start=performance.now(),result=original.apply(this,values);audit.calls.gl++;audit.calls.glCpuMs+=performance.now()-start;
    const motion=this.canvas.dataset.motionQuality||'unknown';audit.byMotion[motion]=(audit.byMotion[motion]||0)+1;return result;
   };
  }
  for(const method of ['drawImage','stroke','fillRect']){
   const original=CanvasRenderingContext2D.prototype[method];
   CanvasRenderingContext2D.prototype[method]=function(...values){
    if(audit.active&&this.canvas.classList.contains('scene-fx')&&this.globalAlpha>0){audit.calls.fx++;const kind=this.canvas.dataset.fxKind||'unknown';audit.fxKinds[kind]=(audit.fxKinds[kind]||0)+1;}
    return original.apply(this,values);
   };
  }
  window.__rendererFrameDone=new Promise(resolve=>{
   const capture=event=>{
    if(!event.target.closest('#primary-action'))return;
    document.removeEventListener('click',capture,true);
    const start=performance.now(),trusted=event.isTrusted,kinds=new Set(),peaks={dice:0,effects:0,materials:0};let last=start,wasBusy=false;
    audit.started=start;audit.active=true;
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>audit.tasks.push(...list.getEntries().map(task=>({start:task.startTime,duration:task.duration})))):null;
    observer?.observe({type:'longtask',buffered:false});
    const tick=timestamp=>{
     const now=performance.now(),dice=document.querySelector('.dice-surface'),fx=document.querySelector('.scene-fx'),room=document.querySelector('#current-room'),busy=!!room?.classList.contains('busy');
     const kind=fx?.dataset.fxKind||'idle',pixels={dice:(dice?.width||0)*(dice?.height||0),effects:Number(fx?.dataset.fxPixels)||((fx?.width||0)*(fx?.height||0)),materials:Number(fx?.dataset.fxMaterialPixels)||0};
     for(const key of Object.keys(peaks))peaks[key]=Math.max(peaks[key],pixels[key]);kinds.add(kind);
     if(wasBusy&&!busy&&audit.busyEndMs===null)audit.busyEndMs=now-start;wasBusy||=busy;
     audit.rawFrames.push({ms:now-start,rafTimestamp:timestamp,intervalMs:now-last,busy,kind,motion:dice?.dataset.motionQuality||null,pixels,fxElapsed:Number(fx?.dataset.fxElapsed)||0,fxFrames:Number(fx?.dataset.fxFrames)||0,glSubmissions:audit.calls.gl,glCpuMs:audit.calls.glCpuMs,fxSubmissions:audit.calls.fx,shadow:document.querySelector('.die-shadow')?.style.transform||''});last=now;
     if(now-start<windowMs){requestAnimationFrame(tick);return;}
     const end=now,actualWindowMs=end-start; audit.active=false;
     setTimeout(()=>{
      if(observer){audit.tasks.push(...observer.takeRecords().map(task=>({start:task.startTime,duration:task.duration})));observer.disconnect();}
      const intervals=audit.rawFrames.map(frame=>frame.intervalMs),sorted=intervals.toSorted((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)]??null;
      const tasks=audit.tasks.filter(task=>task.start<end&&task.start+task.duration>start);
      resolve({trusted,actualWindowMs,windowOverrunMs:actualWindowMs-windowMs,frames:intervals.length,firstFrameDelayMs:intervals[0],p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),over50:intervals.filter(value=>value>50).length,over100:intervals.filter(value=>value>100).length,peakPixels:peaks,effectKinds:[...kinds],effectObserved:kinds.has(effectKind),positiveCombatSubmissions:audit.fxKinds.combat||0,positiveTargetSubmissions:audit.fxKinds[effectKind]||0,visibility:document.visibilityState,rawFrames:audit.rawFrames,submissions:{...audit.calls,byMotion:audit.byMotion,byFxKind:audit.fxKinds},longTasks:{supported:!!observer,count:tasks.length,totalOverlapMs:tasks.reduce((total,task)=>total+Math.max(0,Math.min(end,task.start+task.duration)-Math.max(start,task.start)),0),entries:tasks.map(task=>({ms:task.start-start,durationMs:task.duration}))},busyEndWithinWindowMs:audit.busyEndMs});
     },0);
    };requestAnimationFrame(tick);
   };document.addEventListener('click',capture,true);
  });
 },{windowMs,effectKind});
}

for(let index=0;index<report.order.length;index++){
 const label=report.order[index],row={index:index+1,pair:Math.floor(index/2)+1,label,url:urls[label],status:'RUNNING'};report.runs.push(row);await save();
 let browser,page;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  row.browserVersion=await browser.version();
  const context=await browser.newContext({viewport:{width:3840,height:2160},deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(60000);
  page.on('pageerror',error=>report.errors.push({index:index+1,label,type:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error')report.errors.push({index:index+1,label,type:'console',message:message.text()});});
  await page.goto(urls[label]);await page.evaluate(()=>document.fonts.ready);
  row.environment=await page.evaluate(async current=>{
   const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
   const info={ua:navigator.userAgent,platform:navigator.platform,dpr:devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],url:location.href,release:document.querySelector('meta[name="dice-abyss-release"]')?.content};
   gl?.getExtension('WEBGL_lose_context')?.loseContext();
   info.servedSources=await Promise.all(['src/app.js','src/effects.js','src/dice-motion.js','src/dice-renderer.js','src/views.js','src/storage.js',...(current?['src/visual-timeline.js']:[])].map(async file=>{const response=await fetch(new URL(file,location.href),{cache:'no-store'}),bytes=await response.arrayBuffer();return {file,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')};}));
   info.servedStyles=await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(async link=>{const response=await fetch(link.href,{cache:'no-store'}),bytes=await response.arrayBuffer();return {file:new URL(link.href).pathname,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')};}));return info;
  },label==='current');
  for(const file of [...row.environment.servedSources,...row.environment.servedStyles])assert.equal(file.status,200);
  await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects:'full',scale:1}));},{raw,keys});
  await page.reload();await page.evaluate(()=>document.fonts.ready);await page.locator('[data-action="continue"]').click();await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
  assert.equal(await page.getAttribute('html','data-effects'),'full');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const beforeLog=await page.locator('.log-panel li').allTextContents();assert.equal(beforeLog.length,6);assert(beforeLog.every((text,i)=>text.includes(before.log[i].text)));
  await arm(page);await page.locator('#primary-action').click();
  let timer;
  try{row.measurement=await Promise.race([page.evaluate(()=>window.__rendererFrameDone),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Fixed 30-second measurement deadline exceeded')),30000);})]);}finally{clearTimeout(timer);}
  await save();assert(row.measurement.trusted);assert.equal(row.measurement.visibility,'visible');
  await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
  row.settledMs=await page.evaluate(()=>performance.now()-window.__rendererFrameAudit.started);
  const stored=await page.evaluate(keys=>({main:localStorage.getItem(keys.main),mirror:localStorage.getItem(keys.mirror)}),keys);
  assert.deepEqual(S.decodeSave(stored.main),after);assert.equal(stored.main,stored.mirror);assert.equal(await page.locator('.game-shell').getAttribute('data-scene'),after.phase);assert.equal(await page.locator('.log-panel li').count(),6);
  row.finalStage={phase:after.phase,busy:false,observedAtMs:row.settledMs,stateSha256:hash(S.decodeSave(stored.main)),outsideMeasurementWindow:true};
  row.exactTransition=true;row.mirrorSaved=true;row.status='MEASURED';
 }catch(error){row.status='FAILED';row.failure={message:String(error),stack:error.stack};}
 finally{await save();await browser?.close();}
 console.log(`${index+1}/6 pair ${row.pair} ${label}: ${row.status}${row.measurement?` max=${row.measurement.max.toFixed(1)}ms RAF=${row.measurement.frames} GL=${row.measurement.submissions.gl} FX=${row.measurement.submissions.fx} effects=${row.measurement.effectObserved}`:''}`);
}
report.finished=new Date().toISOString();report.summary={runs:report.runs.length,measured:report.runs.filter(row=>row.status==='MEASURED').length,failed:report.runs.filter(row=>row.status==='FAILED').length,runtimeErrors:report.errors.length};await save();
console.log(JSON.stringify(report.summary));if(report.summary.failed||report.errors.length)process.exitCode=1;
