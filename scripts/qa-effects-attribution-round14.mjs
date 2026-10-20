// Optional, intrusive rendering diagnosis; these traces are NEVER FPS evidence.
// Reuses the actual loopback app and original game transaction, without routes,
// quota overrides, source replacement, CSS reduction or animation-time changes.
// Run only after the preferred Browser routes have been attempted or when the
// user explicitly authorizes an independent Chromium/Playwright environment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';

const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const parseArgs=()=>Object.fromEntries(process.argv.slice(2).map(v=>{const at=v.indexOf('=');assert(at>0,'Arguments use --name=value');return[v.slice(0,at),v.slice(at+1)];}));
const unionMs=intervals=>{
 let total=0,end=-Infinity;
 for(const [start,stop]of intervals.toSorted((a,b)=>a[0]-b[0])){if(stop>end){total+=stop-Math.max(start,end);end=stop;}}
 return total/1000;
};

// Inclusive trace slices may overlap or represent waiting; their duration is
// never labelled CPU usage, and different threads are never added as wall time.
export function summarizeEffectsTrace(events){
 const names=new Map(),processes=new Map(),stacks=new Map(),slices=[];let unmatchedEnd=0;
 for(const event of events){
  const key=`${event.pid}:${event.tid}`;
  if(event.ph==='M'&&event.name==='thread_name')names.set(key,event.args?.name||key);
  if(event.ph==='M'&&event.name==='process_name')processes.set(event.pid,event.args?.name||String(event.pid));
  if(event.ph==='X'&&Number.isFinite(event.dur))slices.push({...event,end:event.ts+event.dur});
  else if(event.ph==='B'){if(!stacks.has(key))stacks.set(key,[]);stacks.get(key).push(event);}
  else if(event.ph==='E'){
   const begin=stacks.get(key)?.pop();if(begin)slices.push({...begin,ph:'BE',dur:event.ts-begin.ts,end:event.ts});else unmatchedEnd++;
  }
 }
 const begin=events.find(e=>e.name==='round14-effects-window-start'),end=events.find(e=>e.name==='round14-effects-window-end');
 assert(begin&&end&&end.ts>=begin.ts,'Trace must contain both in-page measurement marks');
 const groups=new Map(),threads=new Map(),longSlices=[];
 for(const slice of slices){
  const start=Math.max(slice.ts,begin.ts),stop=Math.min(slice.end,end.ts);if(stop<=start)continue;
  const thread=names.get(`${slice.pid}:${slice.tid}`)||`${slice.pid}:${slice.tid}`,process=processes.get(slice.pid)||String(slice.pid),key=`${slice.pid}:${slice.tid}/${slice.name}`;
  if(!groups.has(key))groups.set(key,{pid:slice.pid,tid:slice.tid,process,thread,name:slice.name,category:slice.cat||'',count:0,inclusiveOverlapMs:0,maxSliceMs:0,maxOverlapMs:0});
  const group=groups.get(key),overlap=(stop-start)/1000;group.count++;group.inclusiveOverlapMs+=overlap;group.maxSliceMs=Math.max(group.maxSliceMs,slice.dur/1000);group.maxOverlapMs=Math.max(group.maxOverlapMs,overlap);
  const threadKey=`${slice.pid}:${slice.tid}`;if(!threads.has(threadKey))threads.set(threadKey,{pid:slice.pid,tid:slice.tid,process,thread,intervals:[]});threads.get(threadKey).intervals.push([start,stop]);
  if(slice.dur>=50000)longSlices.push({pid:slice.pid,tid:slice.tid,process,thread,name:slice.name,category:slice.cat||'',offsetMs:(slice.ts-begin.ts)/1000,durationMs:slice.dur/1000,overlapMs:overlap,phase:slice.ph});
 }
 return {traceEvents:events.length,windowMs:(end.ts-begin.ts)/1000,beginTraceTimestamp:begin.ts,endTraceTimestamp:end.ts,threadNames:[...names].map(([key,name])=>({key,name})),sliceGroups:[...groups.values()].toSorted((a,b)=>b.inclusiveOverlapMs-a.inclusiveOverlapMs),threads:[...threads.values()].map(({intervals,...thread})=>({...thread,coveredSliceUnionMs:unionMs(intervals)})),allSlicesAtLeast50Ms:longSlices,unmatchedBegin:[...stacks.values()].reduce((n,s)=>n+s.length,0),unmatchedEnd,interpretation:'Slice durations are inclusive elapsed spans, can overlap/nest, and can include waits. They are not additive CPU time or a physical GPU utilization/FPS measure.'};
}

export function installEffectsAttribution({windowMs,keys}){
 const now=()=>performance.now(),nativeRAF=requestAnimationFrame.bind(window),records={active:false,started:null,ended:null,trusted:false,frames:[],rectReads:[],domWrites:[],storage:[],canvasCalls:{},longCanvasCalls:[],canvasSnapshots:[],longTasks:[],longAnimationFrames:[],errors:[]};
 const label=node=>node?.id?`#${node.id}`:`${node?.tagName||'unknown'}.${[...(node?.classList||[])].join('.')}`;
 const nativeRect=Element.prototype.getBoundingClientRect;
 Element.prototype.getBoundingClientRect=function(...args){const start=now(),result=nativeRect.apply(this,args);if(records.active)records.rectReads.push({ms:start-records.started,durationMs:now()-start,target:label(this),left:result.left,top:result.top,width:result.width,height:result.height});return result;};
 const html=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
 Object.defineProperty(Element.prototype,'innerHTML',{...html,set(value){const start=now();html.set.call(this,value);if(records.active)records.domWrites.push({kind:'innerHTML',ms:start-records.started,durationMs:now()-start,target:label(this),characters:String(value).length});}});
 for(const method of ['append','prepend']){const original=Element.prototype[method];Element.prototype[method]=function(...args){const start=now(),result=original.apply(this,args);if(records.active)records.domWrites.push({kind:method,ms:start-records.started,durationMs:now()-start,target:label(this),children:args.map(label)});return result;};}
 for(const method of ['getItem','setItem','removeItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){const start=now(),result=original.apply(this,args);if(records.active)records.storage.push({kind:method,ms:start-records.started,durationMs:now()-start,key:args[0],characters:method==='setItem'?String(args[1]).length:typeof result==='string'?result.length:null});return result;};}
 for(const method of ['drawImage','stroke','fill','fillRect','strokeRect','clearRect','setTransform','beginPath','lineTo','moveTo','ellipse','save','restore','translate','rotate']){
  const original=CanvasRenderingContext2D.prototype[method];
  CanvasRenderingContext2D.prototype[method]=function(...args){
   const start=now(),result=original.apply(this,args);if(!records.active)return result;
   const durationMs=now()-start,kind=this.canvas.classList.contains('scene-fx')?this.canvas.dataset.fxKind||'scene-unassigned':'offscreen-material',key=`${kind}/${method}`;
   const group=records.canvasCalls[key]||={kind,method,count:0,submissionMs:0,maxSubmissionMs:0,firstMs:start-records.started,lastMs:0,positiveAlpha:0};
   group.count++;group.submissionMs+=durationMs;group.maxSubmissionMs=Math.max(group.maxSubmissionMs,durationMs);group.lastMs=start-records.started;if(this.globalAlpha>0)group.positiveAlpha++;
   if(durationMs>=5)records.longCanvasCalls.push({kind,method,ms:start-records.started,durationMs,width:this.canvas.width,height:this.canvas.height});return result;
  };
 }
 const observers=[];
 for(const [type,key]of [['longtask','longTasks'],['long-animation-frame','longAnimationFrames']])if(PerformanceObserver.supportedEntryTypes.includes(type)){
  const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())records[key].push(entry.toJSON());});observer.observe({type,buffered:false});observers.push({observer,key});
 }
 let resolveDone,lastSnapshot='';window.__round14AttributionDone=new Promise(resolve=>{resolveDone=resolve;});window.__round14Attribution=records;
 const capture=event=>{
  if(!event.target.closest('#primary-action'))return;
  document.removeEventListener('click',capture,true);records.trusted=event.isTrusted;records.started=now();records.active=true;let previous=records.started;
  performance.mark('round14-effects-window-start');
  const sample=()=>{
   const time=now(),fx=document.querySelector('.scene-fx'),dice=document.querySelector('.dice-surface'),kind=fx?.dataset.fxKind||'idle';
   records.frames.push({ms:time-records.started,intervalMs:time-previous,kind,busy:!!document.querySelector('#current-room')?.classList.contains('busy'),effectFrames:Number(fx?.dataset.fxFrames)||0,dicePixels:(dice?.width||0)*(dice?.height||0)});previous=time;
   const snapshot=JSON.stringify({kind,width:fx?.width||0,height:fx?.height||0,roi:fx?.dataset.fxRoi||null,logical:fx?.dataset.fxLogical||null,style:fx?.style.cssText||null,materialPixels:Number(fx?.dataset.fxMaterialPixels)||0,particles:Number(fx?.dataset.fxParticles)||0,motif:fx?.dataset.fxRewardMotif||null});
   if(snapshot!==lastSnapshot){records.canvasSnapshots.push({ms:time-records.started,...JSON.parse(snapshot)});lastSnapshot=snapshot;}
   if(time-records.started<windowMs){nativeRAF(sample);return;}
   records.ended=time;records.active=false;performance.mark('round14-effects-window-end');
   setTimeout(()=>{for(const {observer,key}of observers){records[key].push(...observer.takeRecords().map(e=>e.toJSON()));observer.disconnect();}resolveDone(records);},0);
  };nativeRAF(sample);
 };document.addEventListener('click',capture,true);
 records.observerSupport={longTasks:PerformanceObserver.supportedEntryTypes.includes('longtask'),longAnimationFrames:PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')};
 records.persistenceKeys=keys;
}

async function main(){
 const options=parseArgs(),source=path.resolve(options['--source']||'.'),baseline=path.resolve(options['--baseline-source']||source),output=path.resolve(options['--output']||'/tmp/dice-effects-attribution-round14'),traceOutput=path.resolve(options['--trace-output']||path.join(output,'raw-traces'));
 const variants=[{label:'baseline',url:options['--baseline-url']||'http://127.0.0.1:4388/',root:baseline},{label:'current',url:options['--url']||'http://127.0.0.1:4389/',root:source}].filter(v=>!options['--variant']||v.label===options['--variant']);
 for(const v of variants)assert(['localhost','127.0.0.1','[::1]'].includes(new URL(v.url).hostname),'Only isolated loopback sources are allowed');
 const repeats=Number(options['--repeats']||1),sizes=(options['--sizes']||'3840x2160').split(',').map(x=>x.split('x').map(Number)),modes=(options['--modes']||'low,full').split(','),windowMs=4200;
 assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=3);assert(modes.every(x=>['low','full'].includes(x)));
 const modulePath=process.env.PLAYWRIGHT_MODULE;assert(modulePath&&process.env.CHROMIUM_PATH,'Supply the tester-installed PLAYWRIGHT_MODULE and CHROMIUM_PATH');
 const {chromium}=await import(pathToFileURL(modulePath));
 const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js'))),Q=await import(pathToFileURL(path.join(source,'src/equipment.js'))),C=await import(pathToFileURL(path.join(source,'src/content.js')));
 const state=E.newGame(20261017);state.runId='qa-round-performance-boss-20261017';state.floor=140;state.fate=[6,6];state.player.level=80;state.player.gold=500000;state.player.talentPoints=35;state.roomIndex=5;state.route=Array.from({length:6},(_,i)=>({id:`f140r${i}`,type:i===5?'boss':'combat',quality:0,done:i<5}));state.phase='route';state.player.hp=E.stats(state).maxHp;
 let boss=E.transition(state,{type:'enter'});for(const key of ['critical','resonance','keen','echo'])boss.player.talents[key]=C.TALENTS[key].cap;
 for(const [slot,key]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){const item=Q.makeItem(boss,slot,4,140);boss.player.items.push(item);boss.player.equipped[key]=item.id;}
 boss.player.hp=E.stats(boss).maxHp;const log='深层战斗合成记录：六骰同点共鸣、暴击追击、护盾吸收与首领阶段交替；本段仅是固定负载，不描述自然探索成绩。';boss.log=Array.from({length:6},(_,i)=>({text:`记录 ${i+1} · ${log.repeat(5)}`.slice(0,180),tone:['','gold','rare','epic','legendary','danger'][i]}));
 let found=false;for(let rng=1;rng<=5000;rng++){const next=E.transition({...boss,rng},{type:'roll'}),r=next.lastRoll;if(r.best>=3&&r.critical&&r.follow&&!r.killed&&next.phase==='combat'){boss.rng=rng;found=true;break;}}assert(found);
 const finish=structuredClone(boss);finish.enemy.hp=1;finish.enemy.shield=0;finish.enemy.stage=2;
 const chest=E.transition(finish,{type:'roll'});chest.runId='qa-round-chest-7-20261017';chest.chest.item=Q.makeItem(chest,'relic',7,140,'boss');assert(S.validateSave(chest));
 const expectedFixtureSha='e497125e4510f94384b0ccabdf7c5772cd5007a4d2691ad00d34562ba5c3090a';assert.equal(sha(chest),expectedFixtureSha,'The input fixture must remain identical to the retained Round13 formal eternal-open fixture');
 const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY},raw=S.encodeSave(chest);
 await fs.mkdir(output,{recursive:true});await fs.mkdir(traceOutput,{recursive:true});
 const report={kind:'INTRUSIVE_RENDER_ATTRIBUTION_NOT_FPS',started:new Date().toISOString(),scriptSha256:sha(await fs.readFile(new URL(import.meta.url))),synthetic:true,fixtureSha256:sha(chest),fixtureRawSha256:sha(raw),windowMs,repeats,sizes,modes,variants:variants.map(({root,...v})=>({...v,root})),sourceBefore:{},cases:[],errors:[],status:'RUNNING',limitations:[
  'Preferred Browser extension and cloud CDP both failed to reach executor loopback with net::ERR_CONNECTION_REFUSED in this release session; the taskbook authorizes independent Chromium/Playwright fallback.',
  'Canvas, DOM, storage and layout wrappers plus CDP tracing perturb execution. These complete diagnostic RAF intervals must not be pooled into the ordinary performance matrix or advertised as FPS/speedup.',
  'Canvas durations measure synchronous API return, not GPU completion. Native rendering may continue on raster/compositor/GPU threads.',
  'CDP metrics span the pre-trace setup call through the post-window metrics call, a slightly wider interval than the marked click-to-last-RAF trace window; they are not substituted for exact in-page timing.',
  'Trace slices are inclusive elapsed spans that can nest, overlap and contain waits. Neither sums across nested slices nor sums across threads represent wall time or CPU work.',
  'Only the fixed original synthetic save is written. Expected-state equality is complete and checked against each version own engine. All timed samples and failures are retained without replacement.',
  'Raw trace files are stored separately with full SHA/byte identities; the package may retain the complete per-group and all-long-slice summary instead of bulky raw event streams.'
 ]};
 const runtimeFiles=async(root,directory='src')=>{
  const files=[];for(const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})){const file=path.posix.join(directory,entry.name);if(entry.isDirectory())files.push(...await runtimeFiles(root,file));else if(entry.isFile()&&/\.(?:js|css)$/.test(file))files.push(file);}return files;
 };
 const sourceFiles=[...new Set(['index.html','package.json',...await runtimeFiles(source),...await runtimeFiles(baseline)])].toSorted();
 const identities=async root=>Promise.all(sourceFiles.map(async file=>{try{const bytes=await fs.readFile(path.join(root,file));return {file,exists:true,bytes:bytes.length,sha256:sha(bytes)};}catch(error){if(error.code!=='ENOENT'||['index.html','package.json'].includes(file))throw error;return{file,exists:false,bytes:0,sha256:null};}}));
 for(const v of variants)report.sourceBefore[v.label]=await identities(v.root);
 const save=()=>fs.writeFile(path.join(output,'effects-attribution-round14.json'),JSON.stringify(report,null,2)+'\n');
 await save();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();let pair=0;const resources=new Map();
 report.contextProtocol='One reusable context per declared version, created in declared order, with bringToFront/reload and alternating A/B order. This separate diagnostic browser does not replay the formal matrix previous inventory/1080 workload.';
 try{
  for(const variant of variants){
   const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();page.setDefaultTimeout(30000);
   page.on('pageerror',e=>report.errors.push({variant:variant.label,case:report.cases.length,kind:'pageerror',message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({variant:variant.label,case:report.cases.length,kind:'console',message:m.text()});});
   resources.set(variant.label,{context,page});await page.goto(variant.url);await page.evaluate(()=>document.fonts.ready);
  }
  for(const [width,height]of sizes)for(const effects of modes)for(let repeat=1;repeat<=repeats;repeat++){
   const ordered=++pair%2?variants:variants.toReversed();
   for(const [position,variant]of ordered.entries()){
    const entry={variant:variant.label,width,height,effects,repeat,pair,position:position+1,pairOrder:ordered.map(v=>v.label),status:'RUNNING'};report.cases.push(entry);await save();
    const {context,page}=resources.get(variant.label);let cdp,tracing=false;
    const retainTrace=async(allowIncomplete=false)=>{
     const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');tracing=false;const traceInfo=await complete;entry.traceDataLoss=!!traceInfo.dataLossOccurred;
     let trace='';for(;;){const chunk=await cdp.send('IO.read',{handle:traceInfo.stream});trace+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:traceInfo.stream});
     const traceFile=path.join(traceOutput,`${String(report.cases.length).padStart(2,'0')}-${variant.label}-${width}-${effects}.json.gz`),compressed=gzipSync(trace);await fs.writeFile(traceFile,compressed);entry.rawTrace={path:traceFile,bytes:Buffer.byteLength(trace),sha256:sha(trace),gzipBytes:compressed.length,gzipSha256:sha(compressed)};
     try{entry.traceSummary=summarizeEffectsTrace(JSON.parse(trace).traceEvents);}catch(error){entry.traceSummaryFailure=String(error);if(!allowIncomplete)throw error;}
     if(!allowIncomplete)assert(!entry.traceDataLoss,'Trace data loss must fail diagnosis rather than remove missing samples');
    };
    try{
     await page.setViewportSize({width,height});await page.bringToFront();await page.goto(variant.url);await page.evaluate(({raw,keys,effects})=>{localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects,scale:1}));},{raw,keys,effects});
     await page.reload();await page.evaluate(()=>document.fonts.ready);await page.locator('[data-action="continue"]').click();await page.locator('#primary-action:not(:disabled)').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     entry.identity=await page.evaluate(()=>{const c=document.createElement('canvas'),gl=c.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');const result={url:location.href,title:document.title,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,bodyCharacters:document.body.innerText.length,overlays:document.querySelectorAll('vite-error-overlay,nextjs-portal,webpack-dev-server-client-overlay').length,dpr:devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')]};gl?.getExtension('WEBGL_lose_context')?.loseContext();return result;});
     assert.equal(new URL(entry.identity.url).origin,new URL(variant.url).origin);assert(entry.identity.bodyCharacters>100);assert.equal(entry.identity.overlays,0);assert(entry.identity.fonts.every(Boolean));
     entry.httpSources=[];for(const identity of report.sourceBefore[variant.label]){
      const response=await page.request.get(new URL(identity.file,variant.url).href),body=await response.body();
      if(identity.file==='package.json'){assert.equal(response.status(),404);assert.equal(entry.identity.release,JSON.parse(await fs.readFile(path.join(variant.root,'package.json'),'utf8')).version);}
      else if(!identity.exists)assert([404,410].includes(response.status()),'A baseline-absent file must also be absent from HTTP');
      else{assert.equal(response.status(),200);assert.equal(sha(body),identity.sha256);}
      entry.httpSources.push({...identity,status:response.status()});
     }
     await page.evaluate(installEffectsAttribution,{windowMs,keys});cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');entry.metricsBefore=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
     const buffer=[];cdp.on('Tracing.bufferUsage',e=>buffer.push(e));entry.traceBufferUsage=buffer;
     await cdp.send('Tracing.start',{transferMode:'ReturnAsStream',categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,toplevel,cc,gpu,viz',options:'record-until-full',bufferUsageReportingInterval:500});tracing=true;
     await page.locator('#primary-action').click();let deadline;try{entry.audit=await Promise.race([page.evaluate(()=>window.__round14AttributionDone),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Fixed 30-second diagnostic deadline exceeded; no replacement sample')),30000);})]);}finally{clearTimeout(deadline);}
     entry.metricsAfter=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));entry.metricsDelta=Object.fromEntries(Object.entries(entry.metricsAfter).map(([key,value])=>[key,value-(entry.metricsBefore[key]||0)]));
     await retainTrace();assert(entry.audit.trusted);assert.equal(entry.audit.frames.length>0,true);assert(Math.abs(entry.audit.frames.reduce((n,f)=>n+f.intervalMs,0)-(entry.audit.ended-entry.audit.started))<1e-6);
     entry.frameSummary={frames:entry.audit.frames.length,actualWindowMs:entry.audit.ended-entry.audit.started,maxIntervalMs:Math.max(...entry.audit.frames.map(f=>f.intervalMs)),kinds:[...new Set(entry.audit.frames.map(f=>f.kind))],peakDicePixels:Math.max(...entry.audit.frames.map(f=>f.dicePixels))};
     await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'),null,{polling:50});
     const actualRaw=await page.evaluate(keys=>({main:localStorage.getItem(keys.main),mirror:localStorage.getItem(keys.mirror)}),keys),VE=await import(pathToFileURL(path.join(variant.root,'src/engine.js'))),VS=await import(pathToFileURL(path.join(variant.root,'src/storage.js'))),expected=VE.transition(chest,{type:'open'});
     assert.deepEqual(VS.decodeSave(actualRaw.main),expected);assert.equal(actualRaw.main,actualRaw.mirror);entry.exactTransition=true;entry.persistedSha256=sha(actualRaw.main);
     entry.finalComputedStyles=await page.evaluate(()=>{const rows=[];for(const node of document.querySelectorAll('#current-room,#current-room *')){const style=getComputedStyle(node);if(style.filter!=='none'||style.backdropFilter!=='none'||style.boxShadow!=='none'||style.textShadow!=='none'||style.willChange!=='auto')rows.push({element:node.id?`#${node.id}`:`${node.tagName}.${[...node.classList].join('.')}`,filter:style.filter,backdropFilter:style.backdropFilter,boxShadow:style.boxShadow,textShadow:style.textShadow,willChange:style.willChange,transform:style.transform});}return {rows,openDialogs:document.querySelectorAll('dialog[open]').length,scene:document.querySelector('.game-shell')?.dataset.scene};});
     assert.equal(entry.finalComputedStyles.scene,'loot');entry.status='DIAGNOSTIC_COMPLETE';
    }catch(error){entry.status='FAILED';entry.error={message:error.message,stack:error.stack};entry.audit ||= await page.evaluate(()=>window.__round14Attribution).catch(()=>null);if(tracing)try{await retainTrace(true);}catch(traceError){entry.traceRetentionFailure=String(traceError);}report.status='FAILED';process.exitCode=1;throw error;}
    finally{if(tracing)await cdp?.send('Tracing.end').catch(()=>{});await cdp?.detach().catch(()=>{});await save();}
    console.log(JSON.stringify({variant:variant.label,width,effects,repeat,status:entry.status,frames:entry.frameSummary.frames,maxDiagnosticIntervalMs:entry.frameSummary.maxIntervalMs,traceGzipBytes:entry.rawTrace.gzipBytes}));
   }
  }
  report.sourceAfter={};for(const v of variants)report.sourceAfter[v.label]=await identities(v.root);assert.deepEqual(report.sourceAfter,report.sourceBefore,'Source trees must stay fixed throughout diagnosis');report.sourceStable=true;report.status=report.errors.length?'DIAGNOSTIC_WITH_ERRORS':'DIAGNOSTIC_COMPLETE';if(report.errors.length)process.exitCode=1;
 }finally{report.completed=new Date().toISOString();await save();for(const {context}of resources.values())await context.close();await browser.close();}
 console.log(JSON.stringify({output:path.join(output,'effects-attribution-round14.json'),status:report.status,cases:report.cases.length}));
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
