// Isolated browser fault injection for presentation lifecycle, never an FPS test.
// Supply the already-installed Playwright module and Chromium via environment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';

const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
const output=path.resolve(options['--output']||'/tmp/dice-renderer-lifecycle');
const variants=[{label:'baseline',url:options['--baseline-url']||'http://127.0.0.1:4192/'},{label:'current',url:options['--url']||'http://127.0.0.1:4193/'}];
for(const variant of variants)assert(['127.0.0.1','localhost'].includes(new URL(variant.url).hostname),'Only isolated loopback app URLs are permitted');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={started:new Date().toISOString(),browser:browser.version(),scriptSha256:hash(await fs.readFile(new URL(import.meta.url),'utf8')),kind:'SYNTHETIC_LIFECYCLE_FAULTS_NOT_FPS',cases:[],errors:[],notes:[
 'Both Browser extension and cloud browser could not reach container loopback (ERR_CONNECTION_REFUSED); the user taskbook authorizes this standalone local Playwright fallback.',
 'Trusted native clicks use real app transitions and real local main/mirror writes. Only synthetic saves are used.',
 'Injected RAF delivery holds deliberately change timing. These samples establish lifecycle behavior, never ordinary FPS or performance gains.',
 'visibilitychange is explicitly simulated; it is not a physical operating-system background test.',
 'Actual positive-alpha canvas draw submissions are counted separately from fxKind metadata. A submission is not a hardware display scanout claim.'
]};
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
function combat(){let s=E.newGame(913);s=E.transition(s,{type:'fate'});s.route[0].type='combat';s=E.transition(s,{type:'enter'});s.enemy.hp=1;s.enemy.shield=0;assert(S.validateSave(s));return s;}
const beforeCombat=combat(),beforeChest=E.transition(beforeCombat,{type:'roll'});
const definitions=[
 {name:'late-first-frame-combat',before:beforeCombat,action:'roll',hold:3000,expectedKinds:['combat'],compare:true},
 {name:'late-first-frame-loot',before:beforeChest,action:'open',hold:3000,expectedKinds:[`loot-${E.transition(beforeChest,{type:'open'}).loot.item.rarity}`],compare:true},
 {name:'normal-full-combat',before:beforeCombat,action:'roll',hold:0,expectedKinds:['combat'],compare:true},
 {name:'missing-raf-deadline',before:beforeCombat,action:'roll',hold:-1,deadline:true},
 {name:'skip-before-first-frame',before:beforeCombat,action:'roll',hold:-1,skip:true},
 {name:'hidden-before-first-frame',before:beforeCombat,action:'roll',hold:-1,hidden:true},
 {name:'low-effects',before:beforeCombat,action:'roll',hold:0,effects:'low',noEffects:true},
 {name:'reduced-motion',before:beforeCombat,action:'roll',hold:0,reduced:true,noEffects:true},
];

async function installWitness(page,hold){
 await page.evaluate(({hold,keys})=>{
  const originalRAF=window.requestAnimationFrame.bind(window),originalCancel=window.cancelAnimationFrame.bind(window),held=new Map();let next=-1;
  const audit=window.__rendererAudit={holdMs:hold,started:null,clickTrusted:false,draws:{},writes:{main:0,mirror:0},frames:[],ended:null,errors:[],held:0};
  const originalWrite=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(audit.started!==null){if(key===keys.main)audit.writes.main++;if(key===keys.mirror)audit.writes.mirror++;}return originalWrite.call(this,key,value);};
  for(const method of ['drawImage','stroke','fillRect']){
   const original=CanvasRenderingContext2D.prototype[method];
   CanvasRenderingContext2D.prototype[method]=function(...args){
    if(audit.started!==null&&this.canvas.classList.contains('scene-fx')&&this.globalAlpha>0){const kind=this.canvas.dataset.fxKind||'unknown',entry=audit.draws[kind]||={calls:0,firstMs:performance.now()-audit.started,lastMs:0};entry.calls++;entry.lastMs=performance.now()-audit.started;}
    return original.apply(this,args);
   };
  }
  window.requestAnimationFrame=fn=>{
   const remaining=audit.started===null?0:hold<0?Infinity:hold-(performance.now()-audit.started);
   if(remaining<=0)return originalRAF(fn);
   const id=next--,entry={timer:0,real:0};held.set(id,entry);audit.held=held.size;
   if(Number.isFinite(remaining))entry.timer=setTimeout(()=>{entry.real=originalRAF(now=>{held.delete(id);audit.held=held.size;fn(now);});},remaining);
   return id;
  };
  window.cancelAnimationFrame=id=>{const entry=held.get(id);if(!entry){originalCancel(id);return;}clearTimeout(entry.timer);if(entry.real)originalCancel(entry.real);held.delete(id);audit.held=held.size;};
  const capture=event=>{
   if(!event.target.closest('#primary-action'))return;
   document.removeEventListener('click',capture,true);audit.started=performance.now();audit.clickTrusted=event.isTrusted;
   const sample=()=>{
    const now=performance.now(),room=document.querySelector('#current-room'),fx=document.querySelector('.scene-fx');
    audit.frames.push({ms:now-audit.started,busy:!!room?.classList.contains('busy'),kind:fx?.dataset.fxKind||'idle',submittedFrames:Number(fx?.dataset.fxFrames)||0,elapsed:Number(fx?.dataset.fxElapsed)||0});
    if(room?.classList.contains('busy')||audit.frames.length<3)originalRAF(sample);else audit.ended=now-audit.started;
   };originalRAF(sample);
  };document.addEventListener('click',capture,true);
 },{hold,keys});
}

async function run(variant,definition){
 const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:definition.reduced?'reduce':'no-preference'}),page=await context.newPage();
 const row={variant:variant.label,name:definition.name,holdMs:definition.hold,expectedEffectKinds:definition.expectedKinds||[],fixtureSha256:hash(definition.before),status:'RUNNING'};report.cases.push(row);
 page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push({variant:variant.label,case:definition.name,type:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error')report.errors.push({variant:variant.label,case:definition.name,type:'console',message:message.text()});});
 try{
  await page.goto(variant.url);await page.evaluate(({raw,keys,effects})=>{localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects,scale:1}));},{raw:S.encodeSave(definition.before),keys,effects:definition.effects||'full'});
  await page.reload();await page.evaluate(()=>document.fonts.ready);await page.locator('[data-action="continue"]').click();await page.locator('#primary-action:not(:disabled)').waitFor();
  row.identity={url:page.url(),title:await page.title(),release:await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),bodyTextCharacters:(await page.locator('body').innerText()).length,frameworkOverlays:await page.locator('vite-error-overlay,nextjs-portal,webpack-dev-server-client-overlay').count()};
  row.servedSources=await page.evaluate(async current=>{
   const sources=['src/app.js','src/effects.js','src/dice-motion.js','src/dice-renderer.js',...(current?['src/visual-timeline.js']:[])];
   return Promise.all(sources.map(async file=>{const response=await fetch(new URL(file,location.href),{cache:'no-store'}),bytes=await response.arrayBuffer();return {file,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')};}));
  },variant.label==='current');
  for(const source of row.servedSources)assert.equal(source.status,200,'The measured app source must be served by the intended origin');
  assert.equal(new URL(row.identity.url).origin,new URL(variant.url).origin);assert(row.identity.title.includes('骰'));assert(row.identity.bodyTextCharacters>100);assert.equal(row.identity.frameworkOverlays,0);
  const after=E.transition(definition.before,{type:definition.action});row.expectedStateSha256=hash(after);const start=performance.now();
  await installWitness(page,definition.hold);await page.locator('#primary-action').click();
  await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:keys.main,revision:after.revision},{polling:50});
  row.committedBeforeAnimationComplete=await page.locator('#current-room').evaluate(node=>node.classList.contains('busy'));
  if(definition.skip){await page.locator('[data-action="skip"]').click();row.skipTrusted=await page.evaluate(()=>window.__rendererAudit.clickTrusted);}
  if(definition.hidden){await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));});}
  await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'),null,{polling:50});
  row.wallMs=performance.now()-start;
  // Transport and the screenshot are after the action has settled, not samples
  // in a performance window. An additional turn catches delayed stale updates.
  await page.waitForTimeout(150);
  const raw=await page.evaluate(keys=>({main:localStorage.getItem(keys.main),mirror:localStorage.getItem(keys.mirror),audit:window.__rendererAudit}),keys);
  assert.deepEqual(S.decodeSave(raw.main),after);assert.equal(raw.main,raw.mirror);assert.equal(raw.audit.clickTrusted,true);assert.deepEqual(raw.audit.writes,{main:1,mirror:1});assert.equal(raw.audit.held,0,'All cancelled RAF deliveries must be released');
  row.savedExact=true;row.mirrorExact=true;row.singleTransaction=true;row.audit=raw.audit;
  row.effectsObserved=(definition.expectedKinds||[]).every(kind=>(raw.audit.draws[kind]?.calls||0)>0);
  if(variant.label==='current'&&definition.expectedKinds)assert(row.effectsObserved,'The actual positive-alpha target effect must be drawn after delayed RAF delivery');
  if(definition.noEffects)assert.equal(Object.keys(raw.audit.draws).length,0,'Low/reduced preferences must retain the static path');
  if(definition.deadline){assert(raw.audit.frames.at(-1)?.ms>=7900,'The fallback must use the specified deadline');assert(row.wallMs<13000,'Missing RAF must not leave the action busy indefinitely');}
  if(definition.skip||definition.hidden)assert(row.wallMs<5000,'Skip/background cancellation must not await the deadline');
  if(definition.hidden){await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});assert.deepEqual(S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),keys.main)),after);}
  row.status=variant.label==='baseline'&&definition.expectedKinds&&!row.effectsObserved?'REPRODUCED_BASELINE_DEFECT':'PASS';
  if(variant.label==='current'&&definition.name==='normal-full-combat'){const file=path.join(output,'combat-result-1280.png');await page.screenshot({path:file});row.screenshot=file;}
 }catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;row.audit=await page.evaluate(()=>window.__rendererAudit).catch(()=>null);await page.screenshot({path:path.join(output,`FAIL-${variant.label}-${definition.name}.png`)}).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(output,'renderer-lifecycle-browser.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(`${variant.label} ${definition.name}: ${row.status}${row.wallMs?` ${row.wallMs.toFixed(1)}ms`:''}`);
}

try{
 for(const definition of definitions){if(options['--case']&&definition.name!==options['--case'])continue;for(const variant of variants){if(variant.label==='baseline'&&!definition.compare)continue;await run(variant,definition);}}
}finally{
 report.finished=new Date().toISOString();report.summary={cases:report.cases.length,passed:report.cases.filter(row=>row.status==='PASS').length,baselineDefects:report.cases.filter(row=>row.status==='REPRODUCED_BASELINE_DEFECT').length,failed:report.cases.filter(row=>row.status==='FAIL').length,runtimeErrors:report.errors.length};
 await fs.writeFile(path.join(output,'renderer-lifecycle-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify(report.summary));if(report.summary.failed||report.summary.runtimeErrors)process.exitCode=1;
