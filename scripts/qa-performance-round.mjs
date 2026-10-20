// Optional browser A/B QA; Playwright is supplied by the tester, never the game.
// Fresh contexts, loopback origins and synthetic saves only. No quota overrides.
// The taskbook permits independent Playwright when the preferred browser route
// cannot reach loopback. The release's environment record identifies that route.
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
const mode=args['--mode']||'all';
assert(['all','inventory','frames','smoke','fixtures'].includes(mode),'--mode is all, inventory, frames, smoke or fixtures');
const source=path.resolve(args['--source']||'.'),output=path.resolve(args['--output']||'output/qa-performance-round');
// An older served version can legitimately commit different optional metadata.
// Compare its complete result with its own authoritative engine, never by
// deleting fields or weakening the existing exact-transition assertion.
const baselineSource=path.resolve(args['--baseline-source']||source);
const variants=[{label:'baseline',url:args['--baseline-url']||'http://127.0.0.1:4188'},{label:'after',url:args['--after-url']||'http://127.0.0.1:4189'}];
for(const variant of variants){const u=new URL(variant.url);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Only loopback test URLs are allowed');assert(['http:','https:'].includes(u.protocol));}
const inventorySamples=mode==='smoke'?1:Number(args['--inventory-samples']||16),repeats=mode==='smoke'?1:Number(args['--repeats']||3);
assert(Number.isInteger(inventorySamples)&&inventorySamples>=1&&inventorySamples<=20);assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=5);
if(mode!=='smoke'&&['all','inventory'].includes(mode))assert(inventorySamples>=12,'Formal inventory A/B requires at least 12 samples per variant');
const windowMs=4200,seed=20261017,hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js'))),Q=await import(pathToFileURL(path.join(source,'src/equipment.js'))),C=await import(pathToFileURL(path.join(source,'src/content.js')));
const baselineEngine=baselineSource===source?E:await import(pathToFileURL(path.join(baselineSource,'src/engine.js'))),baselineStorage=baselineSource===source?S:await import(pathToFileURL(path.join(baselineSource,'src/storage.js')));
const expectedModules={baseline:{engine:baselineEngine,storage:baselineStorage},after:{engine:E,storage:S}};
async function sourceIdentity(root){
 const files=['index.html','package.json','src/app.js','src/engine.js','src/views.js','src/storage.js','src/dice-renderer.js','src/effects.js','src/dice-motion.js','src/visual-timeline.js'];
 return Promise.all(files.map(async file=>({file,sha256:hash(await fs.readFile(path.join(root,file),'utf8'))})));
}
const sourceBefore={baseline:await sourceIdentity(baselineSource),after:await sourceIdentity(source)};
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
await fs.mkdir(output,{recursive:true});
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
function inventoryFixture(){
 const s=room('rest');s.runId=`qa-round-inventory-10000-equipped-tail-${seed}`;
 const equipped=[];s.player.equipped={};
 for(const [slot,key]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){
  const item=Q.makeItem(s,slot,3,140);item.level=160;item.enhance=10;equipped.push(item);s.player.equipped[key]=item.id;
 }
 const base=Q.makeItem(s,'weapon',0,140);base.level=1;base.enhance=0;
 const filler=Array.from({length:9995},()=>({...base,id:`i${s.nextId++}`}));
 s.player.items=[...filler,...equipped];s.player.hp=E.stats(s).maxHp;
 assert.deepEqual(s.player.items.slice(-5).map(item=>item.id),Object.values(s.player.equipped));
 return s;
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
const inventory=inventoryFixture(),{main:scenes,coverage:coverageScenes}=effectFixtures();
const fixtures=[{name:'inventory-10000',action:'inventory',state:inventory},...scenes,...coverageScenes];
const manifest=fixtures.map(fixture=>{
 assert(S.validateSave(fixture.state),`Invalid synthetic fixture ${fixture.name}`);
 const raw=S.encodeSave(fixture.state);assert.deepEqual(S.decodeSave(raw),fixture.state);
 if(fixture.action!=='inventory')assert(S.validateSave(E.transition(fixture.state,{type:fixture.action})),`Invalid post-action fixture ${fixture.name}`);
 return {name:fixture.name,action:fixture.action,rarity:fixture.rarity??null,seed,rng:fixture.state.rng,runId:fixture.state.runId,items:fixture.state.player.items.length,equippedIds:Object.values(fixture.state.player.equipped),logCount:fixture.state.log.length,logCharacters:fixture.state.log.map(log=>log.text.length),rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:hash(raw),stateSha256:hash(fixture.state)};
});
await fs.writeFile(path.join(output,'fixture-manifest.json'),JSON.stringify({source,synthetic:true,manifest},null,2)+'\n');
if(mode==='fixtures'){console.log(JSON.stringify({mode,manifest},null,2));process.exit(0);}

const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const executablePath=args['--browser']||process.env.CHROMIUM_PATH;
assert(executablePath,'Provide --browser or CHROMIUM_PATH for the already-installed test browser');
const startedAt=Date.now();
const report={mode,source,baselineSource,sourceBefore,synthetic:true,seed,startedAt:new Date(startedAt).toISOString(),scriptSha256:hash(await fs.readFile(new URL(import.meta.url),'utf8')),variants,fixtureManifest:manifest,inventory:{status:'NOT_RUN',requestedSamplesPerVariant:inventorySamples,warmupsPerVariant:1,runs:[],storage:[],aggregate:{}},frames:{status:'NOT_RUN',requestedRepeatsPerCell:repeats,requestedWindowMs:windowMs,runs:[],aggregate:[]},coverage:{status:'NOT_RUN',requestedRepeatsPerCell:1,requestedWindowMs:windowMs,runs:[],aggregate:[],purpose:'One 1920/full window per variant for rarities 0–6 only checks coverage; it is not evidence of a performance improvement and is not pooled with the main matrix.'},errors:[],status:'RUNNING',notes:[
 'Fresh isolated Chromium contexts and loopback URLs; no external pages or private saves.',
 'The taskbook permits this standalone Playwright route; consult the current release environment record for the observed preferred-browser limitations.',
 'Inventory time starts inside the trusted native click capture listener and ends at the second requestAnimationFrame callback; protocol transport is excluded.',
 'Inventory variants alternate baseline then after for every sample; one warmup each is excluded.',
 'Exclusion policy fixed before measuring: only the single declared inventory warmup is excluded. No timed sample or slow frame is discarded, trimmed, winsorized, or selected for a favorable result.',
 'No automatic retry replaces a failed sample. A failure stops the run, retains every completed sample, and records the active case. Smoke mode is a separate report and is never merged into formal aggregates.',
 'A measured browser promise has a fixed 30-second wall-time deadline. Exceeding it fails the run; it never triggers a replacement sample.',
 'Each frame window starts in the native action click capture listener. Callback intervals include initial input-to-frame latency; the actual window can exceed 4200ms under a long stall.',
 'Long tasks are filtered to overlap the measured window. Quantiles use sorted rank floor((n-1)*p); frame raw traces are not retained.',
 'ANGLE SwiftShader is explicitly requested. These are software-rendered browser callback timings, not physical GPU FPS or physical 4K60 validation.',
 'Fixture loading, native navigation back to the game, correctness checks, and optional screenshots occur outside timing windows.',
 'Boss fixtures contain six maximum-length legal logs. The source validator rejects a seventh log or a 181-character log; the real roll and rendered log remain capped at six.',
 'Every inventory sample checks the complete outerHTML hash of all 60 cards after its end timestamp. HTTP release metadata and source byte hashes identify what both origins actually served.',
 'Optional --baseline-source identifies the baseline engine for complete post-action equality. Defaults to --source for backward compatibility; no state fields are ignored.',
 ]};
const save=()=>fs.writeFile(path.join(output,'performance-round.json'),JSON.stringify(report,null,2)+'\n');
async function measuredResult(page,key){
 let timer;
 try{return await Promise.race([page.evaluate(key=>window[key],key),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Measured ${key} exceeded the fixed 30-second wall deadline`)),30000);})]);}
 finally{clearTimeout(timer);}
}
const browser=await chromium.launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
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
 const served=await page.evaluate(async()=>{
  const files=['src/views.js','src/dice-renderer.js','src/storage.js'];
  const assets=await Promise.all(files.map(async file=>{
   const response=await fetch(new URL(file,location.href),{cache:'no-store'}),bytes=await response.arrayBuffer();
   if(!response.ok)throw new Error(`HTTP source identification failed: ${file} ${response.status}`);
   const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
   return {file,url:response.url,status:response.status,bytes:bytes.byteLength,sha256};
  }));
  return {release:document.querySelector('meta[name="dice-abyss-release"]')?.content??null,build:document.querySelector('meta[name="dice-abyss-build"]')?.content??null,documentUrl:location.href,assets};
 });
 served.documentStatus=documentResponse?.status()??null;assert(served.release&&served.documentStatus===200,'Actual HTTP release metadata is required');
 for(const asset of served.assets)assert.equal(asset.sha256,sourceBefore[variant.label].find(file=>file.file===asset.file)?.sha256,`Served ${variant.label} ${asset.file} must match its declared source`);
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
async function unchanged(page){
 return page.evaluate(keys=>({main:localStorage.getItem(keys.main)===window.__qaExpectedRaw,mirror:localStorage.getItem(keys.mirror)===window.__qaOriginalMirror}),keys);
}
async function armInventory(page){
 await page.evaluate(()=>{
  window.__qaInventoryDone=new Promise(resolve=>{
   const onClick=event=>{
    if(!event.target.closest('.main-nav [data-action="inventory"]'))return;
    document.removeEventListener('click',onClick,true);const start=performance.now(),trusted=event.isTrusted;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
     const elapsedMs=performance.now()-start,cards=[...document.querySelectorAll('.inventory-list .item-card')];
     resolve({elapsedMs,trusted,cards:cards.length,ids:cards.map(card=>card.querySelector('[data-action="lock"]')?.dataset.id),outerHTML:cards.map(card=>card.outerHTML).join(''),visibility:document.visibilityState});
    }));
   };document.addEventListener('click',onClick,true);
  });
 });
}
async function inventorySample(entry){
 const {page}=entry;await page.bringToFront();
 if(await page.locator('.inventory-screen').count())await page.locator('.manual-control [data-action="game"]').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await armInventory(page);await page.locator('.main-nav [data-action="inventory"]').click();
 const result=await measuredResult(page,'__qaInventoryDone');
 const {outerHTML,...measurement}=result,cardHtmlSha256=hash(outerHTML);
 report.activeMeasurement={...measurement,cardIdsSha256:hash(result.ids),cardHtmlSha256,cardHtmlUtf8Bytes:Buffer.byteLength(outerHTML)};
 assert(result.trusted);assert.equal(result.cards,60);assert.equal(result.visibility,'visible');
 assert.deepEqual(result.ids,inventory.player.items.toSorted((a,b)=>Q.itemValue(b)-Q.itemValue(a)).slice(0,60).map(item=>item.id));
 report.inventory.referenceCardHtmlSha256??=cardHtmlSha256;
 assert.equal(cardHtmlSha256,report.inventory.referenceCardHtmlSha256,'All 60 complete card DOM trees must be identical between variants and repeats');
 const saved=await unchanged(page);assert(saved.main&&saved.mirror,'Inventory navigation must not alter either stored copy');
 return {elapsedMs:result.elapsedMs,trusted:true,cards:60,cardIdsSha256:hash(result.ids),cardHtmlSha256,cardHtmlUtf8Bytes:Buffer.byteLength(outerHTML),stateUnchanged:true};
}
async function measureInventory(entries){
 for(const entry of entries){
  report.activeCase={kind:'inventory-warmup',label:entry.variant.label};
  const capacity=await load(entry,inventory,'low');report.inventory.storage.push({label:entry.variant.label,...capacity});
  if(!capacity.ok){report.inventory.status='BLOCKED_STORAGE_CAPACITY';await save();return;}
  const warmup=await inventorySample(entry);report.inventory.storage.at(-1).warmupMs=warmup.elapsedMs;
  report.activeMeasurement=null;report.activeCase=null;
 }
 for(let repeat=1;repeat<=inventorySamples;repeat++)for(const entry of entries){
  report.activeCase={kind:'inventory',label:entry.variant.label,repeat};
  const result=await inventorySample(entry);report.inventory.runs.push({label:entry.variant.label,repeat,...result});
  report.activeMeasurement=null;report.activeCase=null;console.log(`inventory ${entry.variant.label} #${repeat}: ${result.elapsedMs.toFixed(1)}ms, 60 cards, unchanged save`);await save();
 }
 for(const variant of variants)report.inventory.aggregate[variant.label]=summarize(report.inventory.runs.filter(run=>run.label===variant.label).map(run=>run.elapsedMs));
 report.inventory.cardSetsIdentical=new Set(report.inventory.runs.map(run=>run.cardIdsSha256)).size===1;assert(report.inventory.cardSetsIdentical);
 report.inventory.cardHtmlIdentical=new Set(report.inventory.runs.map(run=>run.cardHtmlSha256)).size===1;assert(report.inventory.cardHtmlIdentical);
 const b=report.inventory.aggregate.baseline,a=report.inventory.aggregate.after;
 report.inventory.comparison={medianDeltaMs:a.p50-b.p50,medianPercentChange:(a.p50/b.p50-1)*100,p95DeltaMs:a.p95-b.p95,maxDeltaMs:a.max-b.max};
 report.inventory.status='MEASURED';
}
async function armFrames(page){
 await page.evaluate(windowMs=>{
  window.__qaFrameDone=new Promise(resolve=>{
   const onClick=event=>{
    if(!event.target.closest('#primary-action'))return;
    document.removeEventListener('click',onClick,true);
    const start=performance.now(),trusted=event.isTrusted,intervals=[],tasks=[],kinds=new Set(),peaks={dice:0,effects:0,materials:0};let last=start;
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(task=>({start:task.startTime,duration:task.duration})))):null;
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
      if(observer){tasks.push(...observer.takeRecords().map(task=>({start:task.startTime,duration:task.duration})));observer.disconnect();}
      const sorted=intervals.toSorted((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)]??null;
      const overlapping=tasks.filter(task=>task.start<end&&task.start+task.duration>start),durations=overlapping.map(task=>task.duration).toSorted((a,b)=>a-b);
      resolve({trusted,actualWindowMs,windowOverrunMs:actualWindowMs-windowMs,frames:intervals.length,firstFrameDelayMs:intervals[0],p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),over50:intervals.filter(value=>value>50).length,over100:intervals.filter(value=>value>100).length,peakPixels:peaks,effectKinds:[...kinds],longTasks:{supported:!!observer,count:overlapping.length,totalOverlapMs:overlapping.reduce((total,task)=>total+Math.max(0,Math.min(end,task.start+task.duration)-Math.max(start,task.start)),0),maxMs:durations.at(-1)??0,largest:overlapping.toSorted((a,b)=>b.duration-a.duration).slice(0,3).map(task=>({startOffsetMs:task.start-start,durationMs:task.duration}))},visibility:document.visibilityState});
     },0);
    };requestAnimationFrame(tick);
   };document.addEventListener('click',onClick,true);
  });
 },windowMs);
}
async function measureFrames(entries,coverage=false){
 const section=coverage?report.coverage:report.frames;
 const sizes=coverage||mode==='smoke'?[[1920,1080]]:(args['--sizes']||'1920x1080,3840x2160').split(',').map(size=>size.split('x').map(Number));
 const chosen=coverage?coverageScenes:mode==='smoke'?scenes.slice(0,1):scenes,effectModes=coverage?['full']:mode==='smoke'?['low']:['full','low'],repeatCount=coverage?1:repeats;
 for(const [width,height]of sizes){assert(Number.isInteger(width)&&Number.isInteger(height));for(const entry of entries)await entry.page.setViewportSize({width,height});
  for(const scene of chosen)for(const effects of effectModes)for(let repeat=1;repeat<=repeatCount;repeat++)for(const entry of entries){
   report.activeCase={kind:coverage?'coverage':'frames',label:entry.variant.label,scene:scene.name,width,height,effects,repeat};
   const {page}=entry,capacity=await load(entry,scene.state,effects);assert(capacity.ok,'Small action fixture must fit real storage');
   const beforeLog=await page.locator('.log-panel li').allTextContents();assert.equal(beforeLog.length,scene.state.log.length);
   assert(beforeLog.every((text,i)=>text.includes(scene.state.log[i].text)),'The complete legal long log must be rendered before timing');
   await armFrames(page);await page.locator('#primary-action').click();
   const result=await measuredResult(page,'__qaFrameDone');report.activeMeasurement=result;assert(result.trusted);assert.equal(result.visibility,'visible');assert(result.frames>0);
   await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
   const oracle=expectedModules[entry.variant.label];
   const raw=await page.evaluate(key=>localStorage.getItem(key),keys.main),actual=oracle.storage.decodeSave(raw),expected=oracle.engine.transition(scene.state,{type:scene.action});assert.deepEqual(actual,expected,'Measured click commits one exact real engine transition');
   const mirror=await page.evaluate(key=>localStorage.getItem(key),keys.mirror);assert.equal(mirror,raw,'Small action save must keep both mirrors');
   const afterLog=await page.locator('.log-panel li').allTextContents();assert.equal(actual.log.length,6);assert.equal(afterLog.length,6);
   assert(afterLog.every((text,i)=>text.includes(actual.log[i].text)),'The rendered post-action log must match the six committed entries');
   if(scene.action==='open')assert.equal(await page.locator('.loot-screen').count(),1);else assert.equal(await page.locator('.combat-screen').count(),1);
   const effectObserved=effects==='low'||result.effectKinds.includes(scene.action==='open'?`loot-${scene.rarity}`:'combat');
   section.runs.push({label:entry.variant.label,scene:scene.name,rarity:scene.rarity??null,width,height,effects,repeat,fixtureSha256:hash(scene.state),persistedSha256:hash(actual),exactTransition:true,mirrorSaved:true,logBefore:beforeLog.length,logAfter:afterLog.length,logMaxCharacters:Math.max(...scene.state.log.map(log=>log.text.length)),effectObserved,...result});
   report.activeMeasurement=null;report.activeCase=null;console.log(`${coverage?'coverage':'frames'} ${entry.variant.label} ${width} ${scene.name} ${effects} #${repeat}: p95=${result.p95.toFixed(1)} max=${result.max.toFixed(1)}ms frames=${result.frames}`);await save();
  }
 }
 const groups=new Map();for(const run of section.runs){const key=[run.label,run.scene,run.width,run.height,run.effects].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(run);}
 section.aggregate=[...groups.values()].map(runs=>({label:runs[0].label,scene:runs[0].scene,width:runs[0].width,height:runs[0].height,effects:runs[0].effects,repeats:runs.length,medianRunP50:summarize(runs.map(run=>run.p50)).p50,medianRunP95:summarize(runs.map(run=>run.p95)).p50,worstFrameMs:Math.max(...runs.map(run=>run.max)),longTasks:runs.reduce((total,run)=>total+run.longTasks.count,0),longTaskOverlapMs:runs.reduce((total,run)=>total+run.longTasks.totalOverlapMs,0),observedAllExpectedEffects:runs.every(run=>run.effectObserved)}));
 section.status='MEASURED';
}
try{
 const entries=[];for(const variant of variants)entries.push(await fresh(variant));report.environments=entries.map(entry=>({label:entry.variant.label,...entry.environment}));
 if(['all','inventory','smoke'].includes(mode))await measureInventory(entries);
 if(['all','frames','smoke'].includes(mode))await measureFrames(entries);
 if(['all','frames'].includes(mode))await measureFrames(entries,true);
 report.sourceAfter={baseline:await sourceIdentity(baselineSource),after:await sourceIdentity(source)};
 assert.deepEqual(report.sourceAfter,report.sourceBefore,'Both declared source trees must remain unchanged during measurement');report.sourceStable=true;
 report.status=report.errors.length||report.inventory.status==='BLOCKED_STORAGE_CAPACITY'||[...report.frames.runs,...report.coverage.runs].some(run=>!run.effectObserved)||(report.frames.runs.length&&repeats<3&&mode!=='smoke')?'MEASURED_WITH_LIMITATIONS':mode==='smoke'?'SMOKE_ONLY':'MEASURED';
 if(mode==='smoke')report.notes.push('Smoke mode has one sample per variant and one low-effect 1920 boss window; its numbers are not a performance conclusion.');
}catch(error){report.status='FAILED';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;throw error;}
finally{report.completedAt=new Date().toISOString();report.elapsedWallMs=Date.now()-startedAt;await save();for(const context of contexts)await context.close();await browser.close();}
console.log(JSON.stringify({output:path.join(output,'performance-round.json'),status:report.status,inventorySamples:report.inventory.runs.length,frameWindows:report.frames.runs.length,coverageWindows:report.coverage.runs.length},null,2));
