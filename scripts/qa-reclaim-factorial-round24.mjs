// Fixed Round24 diagnostic, not a replacement for the complete-release A/B.
// Only /src/views.js is replaced, inside an isolated browser context. Every
// other runtime file is the current release. No production source is modified.
// PLAYWRIGHT_MODULE=/absolute/playwright/index.js CHROMIUM_PATH=/absolute/chrome
// node scripts/qa-reclaim-factorial-round24.mjs --baseline-source=/absolute/old \
//   --current-source=/absolute/current --url=http://127.0.0.1:4195/ \
//   --output=/absolute/fresh-output [--prepare-only]
// prepare-only validates source construction, the exact fixture, original
// center() oracles and quote eligibility reads. It never imports Playwright.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {gzipSync} from 'node:zlib';

const {values:args}=parseArgs({options:{'baseline-source':{type:'string'},'current-source':{type:'string'},url:{type:'string'},output:{type:'string'},'prepare-only':{type:'boolean'},help:{type:'boolean'}}});
if(args.help){console.log('Required: --baseline-source=/old --current-source=/current --url=http://127.0.0.1:4195/ --output=/fresh/external/directory. Optional --prepare-only. Fixed 1 warmup block + 8 measured Latin blocks, four fresh sequential contexts per block. No trace or adaptive retries.');process.exit(0);}
assert(args['baseline-source']&&args['current-source']&&args.url&&args.output,'Provide both source roots, loopback --url and fresh external --output');
const roots={baseline:path.resolve(args['baseline-source']),current:path.resolve(args['current-source'])},output=path.resolve(args.output),url=new URL(args.url);
assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&['http:','https:'].includes(url.protocol),'Only explicit loopback origins');
assert(url.pathname==='/'&&!url.search&&!url.hash,'Serve the selected current project at its loopback origin root');
for(const root of Object.values(roots))assert(output!==root&&!output.startsWith(root+path.sep),'Evidence must be outside both projects');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
async function runtimeFiles(root,dir='src'){
 const files=[];for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
  const file=path.posix.join(dir,entry.name);if(entry.isDirectory())files.push(...await runtimeFiles(root,file));else if(entry.isFile()&&/\.(?:js|css)$/.test(file))files.push(file);
 }return files;
}
const files=[...new Set(['index.html','package.json',...(await Promise.all(Object.values(roots).map(root=>runtimeFiles(root)))).flat()])].sort();
async function identity(){return Object.fromEntries(await Promise.all(Object.entries(roots).map(async([label,root])=>[label,Object.fromEntries(await Promise.all(files.map(async file=>{
 try{const bytes=await fs.readFile(path.join(root,file));return[file,{bytes:bytes.length,sha256:sha(bytes)}];}catch(e){if(e.code==='ENOENT')return[file,null];throw e;}
})))])));}
const sourceBefore=await identity();
const originals=Object.fromEntries(await Promise.all(Object.entries(roots).map(async([label,root])=>[label,await fs.readFile(path.join(root,'src/views.js'),'utf8')])));
const packages=Object.fromEntries(await Promise.all(Object.entries(roots).map(async([label,root])=>[label,JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'))])));
assert.equal(packages.baseline.version,'5.23.0');assert.equal(packages.current.version,'5.24.0');
const replaceOnce=(text,needle,replacement,label)=>{assert.equal(text.split(needle).length-1,1,`${label}: source anchor occurs exactly once`);return text.replace(needle,replacement);};
const oldCompute='  const visibleItems=items.slice(page*60,(page+1)*60), salvage=salvagePreview(s,undefined,false,true);';
const noCompute='  const visibleItems=items.slice(page*60,(page+1)*60);';
const nullCompute='  const visibleItems=items.slice(page*60,(page+1)*60), salvage=null;';
const oldButton="button(salvage?`回收安全旧装 · ${num(salvage.items.length)} 件 / +${num(salvage.gold)} 金币${salvage.overflow?' / 有溢出':''}`:'当前无可回收批次','salvage-preview','small',salvage?'':'disabled')";
const newButton="button('检查可回收旧装','salvage-preview','small','aria-haspopup=\"dialog\" title=\"先查看物品与金币，确认后回收\"')";
const bSource=replaceOnce(originals.baseline,oldButton,newButton,'B changes only the reclaim presentation');
const cSource=replaceOnce(originals.baseline,oldCompute,nullCompute,'C replaces the quote with null');
let derivedCurrent=replaceOnce(bSource,oldCompute,noCompute,'D removes the quote declaration');
derivedCurrent=replaceOnce(derivedCurrent,', salvagePreview, diceOdds',', diceOdds','D removes the now-unused import');
assert.equal(derivedCurrent,originals.current,'The complete current views source is exactly the declared changes; reject unrelated source drift');
const conditions=[
 {id:'A',compute:true,presentation:'old',oracle:'baseline',description:'Complete original baseline views; real quote and old control',text:originals.baseline},
 {id:'B',compute:true,presentation:'new',oracle:'current',description:'Baseline views with only the new control; real quote retained',text:bSource},
 {id:'C',compute:false,presentation:'old',oracle:'baseline',description:'Baseline views with salvage=null; old control retained',text:cSource},
 {id:'D',compute:false,presentation:'new',oracle:'current',description:'Complete original current views',text:originals.current},
];
async function archive(file,text){
 const bytes=Buffer.from(text),compressed=gzipSync(bytes,{level:9});await fs.mkdir(path.dirname(path.join(output,file)),{recursive:true});await fs.writeFile(path.join(output,file),compressed);
 return {file,bytes:bytes.length,sha256:sha(bytes),gzipBytes:compressed.length,gzipSha256:sha(compressed)};
}
const archives={originals:{},conditions:{}};
for(const [label,text]of Object.entries(originals))archives.originals[label]=await archive(`sources/original-${label}-views.js.gz`,text);
for(const c of conditions){c.sha256=sha(c.text);archives.conditions[c.id]=await archive(`sources/${c.id}-views.js.gz`,c.text);}
const apis={};for(const [label,root]of Object.entries(roots)){
 const [E,S,V]=await Promise.all(['engine','storage','views'].map(n=>import(pathToFileURL(path.join(root,'src',n+'.js')))));apis[label]={E,S,V};
}
const {E,S}=apis.current;
function makeFixture(api){
 const s=api.E.newGame(27017);s.runId='qa-round06-native-storage-10000-27017';s.floor=200;s.player.level=100;s.player.gold=1000000;s.player.hp=api.E.stats(s).maxHp;
 while(s.player.items.length<10000)s.player.items.push(api.E.makeItem(s,undefined,s.nextId%8));assert(api.S.validateSave(s));return s;
}
const state=makeFixture(apis.current);assert.deepEqual(makeFixture(apis.baseline),state);
const raw=S.encodeSave(state);assert.equal(apis.baseline.S.encodeSave(state),raw);assert.deepEqual(S.decodeSave(raw),state);
const fixtureSha256='c4390fd5079e909fbf54e01471647ca68f609c375c302415ac7bbf673dae5ab5';
assert.equal(sha(raw),fixtureSha256,'Use the exact original native inventory fixture, not the different Node timing fixture');
for(const api of Object.values(apis))assert.equal(api.E.salvagePreview(state,undefined,false,true),null,'The fixed fixture must have a null authoritative full-bag quote');
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
const ui={open:{view:'inventory',inventorySlot:'',inventoryPage:0,busy:false},filter:{view:'inventory',inventorySlot:'weapon',inventoryPage:0,busy:false}};
const quoteButton=/<button\b[^>]*\bdata-action="salvage-preview"[^>]*>[\s\S]*?<\/button>/g;
function normalizeButton(html){assert.equal((html.match(quoteButton)||[]).length,1);return html.replace(quoteButton,'<button data-action="salvage-preview">DECLARED_PRESENTATION_FACTOR</button>');}
const oracle={},oracleArchives={};
for(const label of ['baseline','current']){oracle[label]={};oracleArchives[label]={};for(const [stage,choice]of Object.entries(ui)){
 oracle[label][stage]=apis[label].V.center(state,choice);oracleArchives[label][stage]=await archive(`oracles/${label}-${stage}.html.gz`,oracle[label][stage]);
}}
for(const stage of Object.keys(ui))assert.equal(normalizeButton(oracle.baseline[stage]),normalizeButton(oracle.current[stage]),'Only the declared control differs in the original center() oracles');
const {selectInventoryItems}=await import(pathToFileURL(path.join(roots.current,'src/inventory-query.js')));
const expectedIds=Object.fromEntries(Object.entries(ui).map(([stage,choice])=>[stage,selectInventoryItems(state.player.items,choice).slice(0,60).map(i=>i.id)]));
const offPage=state.player.items.find(i=>!Object.values(expectedIds).some(ids=>ids.includes(i.id))&&!E.equippedIds(state).includes(i.id));assert(offPage);
const preflight=[];
// Node preflight adapts relative import specifiers only. Its instrumented getter
// is never installed in the native page or timed window. This checks that B's
// retained quote really reads the off-page eligibility input despite not using
// its return value in the new button. No heavy counter is added to production JS.
for(const c of conditions){
 let rewrites=0;const nodeSource=c.text.replace(/^import[^\n]*\bfrom\s+(['"])(\.\/[^'"]+)\1;?\s*$/gm,line=>line.replace(/(['"])(\.\/[^'"]+)\1/,(_,q,relative)=>{rewrites++;return JSON.stringify(pathToFileURL(path.resolve(roots.current,'src',relative)).href);}));
 assert.equal(rewrites,c.text.split('\n').filter(line=>line.startsWith('import ')).length,'Every Node preflight import binds current dependencies');
 const module=await import('data:text/javascript;base64,'+Buffer.from(nodeSource+`\n//# sourceURL=round24-factor-${c.id}-preflight.js\n`).toString('base64'));
 const row={condition:c.id,sourceSha256:c.sha256,nodeImportAdaptationSha256:sha(nodeSource),checks:[]};
 for(const [stage,choice]of Object.entries(ui)){
  const probe=structuredClone(state),item=probe.player.items.find(i=>i.id===offPage.id),locked=item.locked;let reads=0;
  Object.defineProperty(item,'locked',{enumerable:true,configurable:true,get(){reads++;return locked;}});
  const html=module.center(probe,choice);assert.equal(html,oracle[c.oracle][stage]);assert.equal(reads,c.compute?1:0,`${c.id}/${stage}: quote computation eligibility read`);
  row.checks.push({stage,fullHtmlEqual:true,offPageItemId:offPage.id,eligibilityReads:reads,expectedReads:c.compute?1:0});
 }preflight.push(row);
}
const rotations=[['A','B','C','D'],['B','C','D','A'],['C','D','A','B'],['D','A','B','C']];
const schedule=[...rotations[0].map((condition,position)=>({phase:'warmup',block:0,position:position+1,condition})),...Array.from({length:8},(_,i)=>rotations[i%4].map((condition,position)=>({phase:'measured',block:i+1,position:position+1,condition}))).flat()];
const report={status:'PREPARED',createdAt:new Date().toISOString(),scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore,archives,oracleArchives,preflight,
 protocol:{kind:'Fixed views-only 2x2 causal diagnostic; not a replacement release benchmark',url:url.href,versions:{baseline:packages.baseline.version,current:packages.current.version},fixture:{seed:27017,runId:state.runId,items:10000,rawSha256:fixtureSha256,rawUtf8Bytes:Buffer.byteLength(raw),stateSha256:sha(state),authoritativeQuote:null,archive:await archive('fixture/save.json.gz',raw)},
  conditions:conditions.map(({text,...c})=>c),viewport:{width:1920,height:1080},deviceScaleFactor:1,effects:'low',reducedMotion:'reduce',blocks:8,warmupBlocks:1,schedule,
  factorMeaning:'Presentation jointly changes wording, disabled state, aria-haspopup and title; it is not a pure enabled/disabled factor.',
  isolation:'Each condition uses a fresh context. Only the actual views.js module response is fulfilled from the recorded variant; all other JS/CSS/document bytes match current 5.24.0. No contexts overlap.',
  clock:'Trusted weapon filter click capture to the second requestAnimationFrame callback. Real inventory opening and all correctness/geometry checks are outside the measured interval.',
  cdpClock:'Wider counter window: after the explicit trial click, before the actual Playwright click, to after the measured result is received. Counts/durations must not be treated as an exact decomposition of click latency.',
  order:'Fixed cyclic Latin rotation, each condition in each position twice across eight measured blocks. One A/B/C/D warmup block is recorded separately.',
  quantile:'Sorted rank floor((n-1)*p), including every measured sample; no adaptive sample count, tail removal, retry replacement or post-hoc threshold.',
  contrasts:'Per block: quote removal=(C+D-A-B)/2; new presentation=(B+D-A-C)/2; interaction=D-C-B+A; combined D-A. A/B/C use diagnostic source, other runtime files are current.',
  limits:['Fixed synthetic null-quote inventory only.','Linux headless ANGLE SwiftShader, not physical GPU FPS.','Non-timed Node getter probe confirms B computation in that execution; no native optimization trace is collected by this core driver.','D is authentic current source and also removes the unused import/binding; C retains the null binding. Initial module loading is outside timing.','No storage, Web Locks, game handler, animation or RNG API is replaced. No Chrome trace in this fixed core experiment.']},runs:[],httpIdentity:[],errors:[],aggregate:{}};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
if(args['prepare-only']){report.sourceAfter=await identity();assert.deepEqual(report.sourceAfter,sourceBefore);report.sourceUnchanged=true;await save();console.log(JSON.stringify({status:report.status,conditions:conditions.map(c=>({id:c.id,sha256:c.sha256})),fixtureSha256,preflight,samples:32,warmups:4,output}));process.exit(0);}

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();report.status='RUNNING';
const metricNames=['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration','LayoutCount','RecalcStyleCount','Nodes','JSHeapUsedSize','JSHeapTotalSize'];
const durationNames=['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'];
const countNames=['LayoutCount','RecalcStyleCount'];
const filterSelector='[data-action="filter"][data-slot="weapon"]';
async function frames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function deadline(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label}: fixed 30-second host deadline exceeded`)),30000);})]);}finally{clearTimeout(timer);}}
async function metrics(cdp){const m=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));for(const k of [...metricNames,'Timestamp'])assert(Number.isFinite(m[k]),`Required CDP metric ${k} is available`);return m;}
async function measure(page,cdp){
 await page.locator(filterSelector).scrollIntoViewIfNeeded();await page.locator(filterSelector).click({trial:true});
 await page.evaluate(selector=>{window.__factorDone=new Promise(resolve=>{
  const listener=event=>{
   if(!event.target.closest(selector))return;document.removeEventListener('click',listener,true);
   const start=performance.now(),trusted=event.isTrusted,tasks=[];
   const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))):null;
   observer?.observe({type:'longtask',buffered:false});
   requestAnimationFrame(()=>{const first=performance.now();requestAnimationFrame(()=>{const end=performance.now();setTimeout(()=>{
    tasks.push(...(observer?.takeRecords()||[]).map(e=>({start:e.startTime,duration:e.duration})));observer?.disconnect();
    resolve({start,first,end,elapsedMs:end-start,firstFrameDelayMs:first-start,trusted,visibility:document.visibilityState,longTasks:tasks.filter(e=>e.start<end&&e.start+e.duration>start).map(e=>({...e,overlapMs:Math.max(0,Math.min(end,e.start+e.duration)-Math.max(start,e.start))}))});
   },0);});});
  };document.addEventListener('click',listener,true);
 });},filterSelector);
 const before=await metrics(cdp);await page.locator(filterSelector).click();const result=await deadline(page.evaluate(()=>window.__factorDone),'Measured filter result');const after=await metrics(cdp);
 assert(result.trusted&&result.visibility==='visible');assert(Number.isFinite(result.elapsedMs)&&result.elapsedMs>=0);
 result.cdpObservation={wallSpanMs:(after.Timestamp-before.Timestamp)*1000,startTimestamp:before.Timestamp,endTimestamp:after.Timestamp,
  durationMs:Object.fromEntries(durationNames.map(k=>[k,(after[k]-before[k])*1000])),counts:Object.fromEntries(countNames.map(k=>[k,after[k]-before[k]])),
  before:Object.fromEntries(metricNames.map(k=>[k,before[k]])),after:Object.fromEntries(metricNames.map(k=>[k,after[k]]))};
 for(const n of [...Object.values(result.cdpObservation.durationMs),...Object.values(result.cdpObservation.counts)])assert(Number.isFinite(n)&&n>=0);
 return result;
}
async function verifyDom(page,c,stage){
 const result=await page.evaluate(({expected,raw,keys,saveRefs})=>{
  const actual=document.querySelector('.inventory-screen'),parsed=new DOMParser().parseFromString(expected,'text/html').querySelector('.inventory-screen');
  const cards=[...actual.querySelectorAll('.inventory-list > .item-card')],id=card=>card.querySelector('[data-action="lock"]').dataset.id;
  const shellSelectors=['.topbar','.left-rail','.right-rail','.bottomline'];
  if(saveRefs)window.__factorRefs={shell:shellSelectors.map(s=>document.querySelector(s)),reclaim:actual.querySelector('.inventory-reclaim'),list:actual.querySelector('.inventory-list'),cards:new Map(cards.map(card=>[id(card),card]))};
  const refs=window.__factorRefs;
  return {equal:actual.outerHTML===parsed.outerHTML,actual:actual.outerHTML,expected:parsed.outerHTML,cardIds:cards.map(id),nodeCount:actual.querySelectorAll('*').length,
   shellRetained:shellSelectors.map((s,i)=>refs.shell[i]===document.querySelector(s)),reclaimRetained:refs.reclaim===actual.querySelector('.inventory-reclaim'),listRetained:refs.list===actual.querySelector('.inventory-list'),retainedCardIds:cards.filter(card=>refs.cards.get(id(card))===card).map(id),
   mainByteEqual:localStorage.getItem(keys.main)===raw,mirrorByteEqual:localStorage.getItem(keys.mirror)===raw,mirrorsIdentical:localStorage.getItem(keys.main)===localStorage.getItem(keys.mirror),
   controlValues:[...actual.querySelectorAll('input,select')].map(n=>({id:n.id,value:n.value}))};
 },{expected:oracle[c.oracle][stage],raw,keys,saveRefs:stage==='open'});
 if(!result.equal){await fs.writeFile(path.join(output,`FAIL-${report.active.block}-${c.id}-${stage}-actual.html`),result.actual);await fs.writeFile(path.join(output,`FAIL-${report.active.block}-${c.id}-${stage}-expected.html`),result.expected);}
 assert(result.equal,`${c.id}/${stage}: complete native DOM equals original source center oracle`);assert.deepEqual(result.cardIds,expectedIds[stage]);
 assert(result.mainByteEqual&&result.mirrorByteEqual&&result.mirrorsIdentical,'Every main and mirror save byte remains identical to the validated starting save');
 if(stage==='filter')assert(result.shellRetained.every(Boolean)&&result.reclaimRetained&&result.listRetained,'The pure filter retains shell, reclaim strip and list container');
 const {actual,expected,...receipt}=result;return {...receipt,actualDomSha256:sha(actual),expectedDomSha256:sha(expected),rawSaveSha256:fixtureSha256};
}
async function geometry(page){return page.evaluate(()=>{
 const screen=document.querySelector('.inventory-screen'),reclaim=screen.querySelector('.inventory-reclaim'),list=screen.querySelector('.inventory-list');
 const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
 const styles=(node,keys)=>{const s=getComputedStyle(node);return Object.fromEntries(keys.map(k=>[k,s.getPropertyValue(k)]));};
 const button=reclaim.querySelector('button'),span=reclaim.querySelector('span');
 return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},rootFontSize:getComputedStyle(document.documentElement).fontSize,documentScroll:{x:scrollX,y:scrollY},screen:rect(screen),
  reclaim:{rect:rect(reclaim),styles:styles(reclaim,['display','gap','padding-top','padding-bottom','flex-wrap']),span:{rect:rect(span),styles:styles(span,['font-size','line-height','max-width'])},button:{rect:rect(button),text:button.textContent,disabled:button.disabled,styles:styles(button,['font-size','line-height','min-height','white-space','opacity'])}},
  list:{rect:rect(list),scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,scrollWidth:list.scrollWidth,clientWidth:list.clientWidth,styles:styles(list,['grid-template-columns','gap','padding','overflow-y','scrollbar-gutter']),cards:[...list.querySelectorAll('.item-card')].map(card=>({id:card.querySelector('[data-action="lock"]').dataset.id,rect:rect(card),descendants:card.querySelectorAll('*').length}))}};
});}
async function servedIdentity(context,page,response,c,entry,loaded){
 assert.equal(response.status(),200);assert.equal(sha(await response.body()),sourceBefore.current['index.html'].sha256);
 assert.equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),'5.24.0');
 // APIRequestContext intentionally checks the underlying current server, not
 // the routed module. The executed views module is checked separately from
 // actual browser script Response.body() receipts after each document load.
 const assets=await Promise.all(files.map(async file=>{
  const response=await context.request.get(new URL(file,url).href,{headers:{'Cache-Control':'no-cache'}}),bytes=await response.body(),expected=sourceBefore.current[file];
  const result={file,status:response.status(),bytes:bytes.length,sha256:sha(bytes)};
  if(file==='package.json'){assert.equal(result.status,404);result.scope='local-metadata-not-served';}
  else if(expected){assert.equal(result.status,200);assert.equal(result.bytes,expected.bytes);assert.equal(result.sha256,expected.sha256);}
  else assert([404,410].includes(result.status));return result;
 }));
 await Promise.all(loaded.pending);assert(loaded.rows.some(row=>row.file==='src/views.js'&&row.sha256===c.sha256&&row.resourceType==='script'),'Actual browser-imported views response matches the condition source');
 report.httpIdentity.push({...entry,underlyingServerVersion:'5.24.0',underlyingAssets:assets,loadedBrowserResponses:loaded.rows});
}
const summarize=xs=>{assert(xs.length&&xs.every(Number.isFinite));const a=xs.toSorted((x,y)=>x-y),q=p=>a[Math.floor((a.length-1)*p)];return{n:a.length,p50:q(.5),p95:q(.95),max:a.at(-1),min:a[0],mean:xs.reduce((n,x)=>n+x,0)/xs.length};};
try{
 for(const entry of schedule){
  const c=conditions.find(c=>c.id===entry.condition),row={...entry,status:'RUNNING',conditionSourceSha256:c.sha256};report.runs.push(row);report.active={...entry,stage:'load'};await save();
  const context=await browser.newContext({viewport:report.protocol.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  try{
   let fulfillCount=0;
   await context.route('**/*',route=>{
    const request=new URL(route.request().url());if(request.origin!==url.origin)return route.abort();
    if(request.pathname==='/src/views.js'){fulfillCount++;return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',headers:{'Cache-Control':'no-store'},body:c.text});}
    return route.continue();
   });
   const page=await context.newPage();page.setDefaultTimeout(30000);const loaded={pending:[],rows:[]},localErrors=[];
   page.on('pageerror',e=>{const error={...entry,type:'pageerror',message:String(e)};localErrors.push(error);report.errors.push(error);});
   page.on('console',e=>{if(e.type()==='error'){const error={...entry,type:'console',message:e.text()};localErrors.push(error);report.errors.push(error);}});
   page.on('response',response=>{
    const address=new URL(response.url()),file=address.pathname.slice(1),resourceType=response.request().resourceType();
    if(address.origin!==url.origin||!['script','stylesheet'].includes(resourceType)||!file.startsWith('src/'))return;
    const pending=(async()=>{const bytes=await response.body(),expected=file==='src/views.js'?{bytes:Buffer.byteLength(c.text),sha256:c.sha256}:sourceBefore.current[file];assert(expected,`Declared current resource ${file}`);assert.equal(response.status(),200);assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256);loaded.rows.push({file,url:response.url(),resourceType,bytes:bytes.length,sha256:sha(bytes),scope:file==='src/views.js'?'actual-routed-module':'actual-current-runtime'});})();
    // Keep a rejection handled until the explicit load-stage await inspects it.
    pending.catch(()=>{});loaded.pending.push(pending);
   });
   const response=await page.goto(url.href);await servedIdentity(context,page,response,c,entry,loaded);
   await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw,keys});
   await page.reload();await Promise.all(loaded.pending);assert(loaded.rows.filter(r=>r.file==='src/views.js'&&r.resourceType==='script').length>=2,'Both initial and fixture-reloaded documents import the routed variant');
   await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);await frames(page);
   row.environment=await page.evaluate(()=>({userAgent:navigator.userAgent,webLocks:!!navigator.locks,visibility:document.visibilityState,dpr:devicePixelRatio,effects:document.documentElement.dataset.effects,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));
   assert(row.environment.webLocks&&row.environment.visibility==='visible'&&row.environment.effects==='low'&&row.environment.reducedMotion);
   report.active.stage='untimed-open';await page.locator('.main-nav [data-action="inventory"]').click();await frames(page);
   row.beforeDom=await verifyDom(page,c,'open');row.beforeGeometry=await geometry(page);
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');report.active.stage='filter';
   row.measurement=await measure(page,cdp);report.active.measurement=row.measurement;await save();
   row.afterGeometry=await geometry(page);row.afterDom=await verifyDom(page,c,'filter');row.fulfilledViewsResponses=fulfillCount;
   assert.equal(localErrors.length,0,'No native application/console errors');assert(fulfillCount>=2);row.status='MEASURED';
  }catch(e){row.status='FAIL';row.failure={message:String(e),stack:e.stack};throw e;}
  finally{await context.close();await save();}
  console.log(JSON.stringify({phase:entry.phase,block:entry.block,condition:c.id,status:row.status,elapsedMs:row.measurement?.elapsedMs,counts:row.measurement?.cdpObservation.counts}));
 }
 const metricSpecs={elapsedMs:r=>r.measurement.elapsedMs,firstFrameDelayMs:r=>r.measurement.firstFrameDelayMs,
  ...Object.fromEntries(durationNames.map(k=>[k+'Ms',r=>r.measurement.cdpObservation.durationMs[k]])),...Object.fromEntries(countNames.map(k=>[k,r=>r.measurement.cdpObservation.counts[k]]))};
 const measured=report.runs.filter(r=>r.phase==='measured');assert.equal(measured.length,32);assert.equal(report.runs.filter(r=>r.phase==='warmup').length,4);
 for(const c of conditions){const rows=measured.filter(r=>r.condition===c.id);assert.equal(rows.length,8);report.aggregate[c.id]=Object.fromEntries(Object.entries(metricSpecs).map(([name,select])=>[name,summarize(rows.map(select))]));}
 report.contrasts={};for(const [name,select]of Object.entries(metricSpecs)){
  const blocks=Array.from({length:8},(_,i)=>{const x=Object.fromEntries(measured.filter(r=>r.block===i+1).map(r=>[r.condition,select(r)]));assert.equal(Object.keys(x).length,4);return{block:i+1,A:x.A,B:x.B,C:x.C,D:x.D,removeQuoteOld:x.C-x.A,removeQuoteNew:x.D-x.B,newPresentationWithQuote:x.B-x.A,newPresentationWithoutQuote:x.D-x.C,removeQuote:(x.C+x.D-x.A-x.B)/2,newPresentation:(x.B+x.D-x.A-x.C)/2,interaction:x.D-x.C-x.B+x.A,combined:x.D-x.A};});
  const keys=['removeQuoteOld','removeQuoteNew','newPresentationWithQuote','newPresentationWithoutQuote','removeQuote','newPresentation','interaction','combined'];report.contrasts[name]={blocks,summary:Object.fromEntries(keys.map(k=>[k,summarize(blocks.map(b=>b[k]))]))};
 }
 report.status=report.errors.length?'MEASURED_WITH_ERRORS':'MEASURED';delete report.active;
}catch(e){report.status='FAIL';report.failure={message:String(e),stack:e.stack};process.exitCode=1;}
finally{
 await browser.close();report.sourceAfter=await identity();const finalFiles=[...new Set(['index.html','package.json',...(await Promise.all(Object.values(roots).map(root=>runtimeFiles(root)))).flat()])].sort();
 report.sourceUnchanged=JSON.stringify(finalFiles)===JSON.stringify(files)&&JSON.stringify(report.sourceAfter)===JSON.stringify(sourceBefore);if(!report.sourceUnchanged){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await save();
}
console.log(JSON.stringify({status:report.status,samples:report.runs.filter(r=>r.phase==='measured').length,warmups:report.runs.filter(r=>r.phase==='warmup').length,errors:report.errors.length,sourceUnchanged:report.sourceUnchanged,aggregate:report.aggregate,output}));
