// Optional browser A/B QA; Playwright is supplied by the tester, never the game.
// Fresh contexts, loopback origins and synthetic saves only. No quota overrides.
// The taskbook permits independent Playwright when the preferred browser route
// cannot reach loopback. The release's environment record identifies that route.
// Round 12 keeps each version's complete card DOM as its own source oracle:
// the new comparison controls intentionally change HTML across releases.
// qa-performance-round.mjs remains the untouched earlier-round protocol.
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
const source=path.resolve(args['--source']||'.'),output=path.resolve(args['--output']||'output/qa-performance-round12');
// An older served version can legitimately commit different optional metadata.
// Compare its complete result with its own authoritative engine, never by
// deleting fields or weakening the existing exact-transition assertion.
const baselineSource=path.resolve(args['--baseline-source']||source);
const variants=[{label:'baseline',url:args['--baseline-url']||'http://127.0.0.1:4188'},{label:'after',url:args['--after-url']||'http://127.0.0.1:4189'}];
for(const variant of variants){const u=new URL(variant.url);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Only loopback test URLs are allowed');assert(['http:','https:'].includes(u.protocol));}
const inventorySamples=mode==='smoke'?1:Number(args['--inventory-samples']||16),repeats=mode==='smoke'?1:Number(args['--repeats']||3);
assert(Number.isInteger(inventorySamples)&&inventorySamples>=1&&inventorySamples<=20);assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=5);
if(mode!=='smoke'&&['all','inventory'].includes(mode))assert(inventorySamples>=12,'Formal inventory A/B requires at least 12 samples per variant');
const windowMs=4200,seed=20261017,hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const requiredIdentityFiles=['index.html','package.json','src/app.js','src/engine.js','src/views.js','src/storage.js','src/dice-renderer.js','src/effects.js','src/dice-motion.js','src/visual-timeline.js'];
async function runtimeFiles(root,directory='src'){
 const entries=await fs.readdir(path.join(root,directory),{withFileTypes:true}),files=[];
 for(const entry of entries){
  const file=path.posix.join(directory,entry.name);
  if(entry.isDirectory())files.push(...await runtimeFiles(root,file));
  else if(entry.isFile()&&/\.(?:js|css)$/.test(file))files.push(file);
 }
 return files;
}
async function identityFiles(){return [...new Set([...requiredIdentityFiles,...await runtimeFiles(baselineSource),...await runtimeFiles(source)])].toSorted();}
const sourceFiles=await identityFiles();
async function sourceIdentity(root,files=sourceFiles){
 return Promise.all(files.map(async file=>{
  try{const bytes=await fs.readFile(path.join(root,file));return {file,exists:true,bytes:bytes.length,sha256:hash(bytes)};}
  catch(error){
   if(error.code!=='ENOENT'||requiredIdentityFiles.includes(file))throw error;
   // The shared union records a newer module/CSS file absent in the input.
   return {file,exists:false,bytes:0,sha256:null};
  }
 }));
}
const sourceBefore={baseline:await sourceIdentity(baselineSource),after:await sourceIdentity(source)};
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js'))),Q=await import(pathToFileURL(path.join(source,'src/equipment.js'))),C=await import(pathToFileURL(path.join(source,'src/content.js'))),V=await import(pathToFileURL(path.join(source,'src/views.js')));
const baselineEngine=baselineSource===source?E:await import(pathToFileURL(path.join(baselineSource,'src/engine.js'))),baselineStorage=baselineSource===source?S:await import(pathToFileURL(path.join(baselineSource,'src/storage.js'))),baselineEquipment=baselineSource===source?Q:await import(pathToFileURL(path.join(baselineSource,'src/equipment.js'))),baselineViews=baselineSource===source?V:await import(pathToFileURL(path.join(baselineSource,'src/views.js')));
const expectedModules={baseline:{engine:baselineEngine,storage:baselineStorage,equipment:baselineEquipment,views:baselineViews},after:{engine:E,storage:S,equipment:Q,views:V}};
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
assert.deepEqual({main:baselineStorage.SAVE_KEY,mirror:baselineStorage.BACKUP_KEY,settings:baselineStorage.SETTINGS_KEY},keys,'Both versions must use the unchanged persistence keys');
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
const report={protocol:'round12-own-source-complete-dom',mode,source,baselineSource,sourceBefore,synthetic:true,seed,startedAt:new Date(startedAt).toISOString(),scriptSha256:hash(await fs.readFile(new URL(import.meta.url),'utf8')),variants,fixtureManifest:manifest,inventory:{status:'NOT_RUN',requestedSamplesPerVariant:inventorySamples,warmupsPerVariant:1,runs:[],storage:[],aggregate:{},oracles:{},actualReferences:{},pairOrders:[]},frames:{status:'NOT_RUN',requestedRepeatsPerCell:repeats,requestedWindowMs:windowMs,runs:[],aggregate:[],pairOrders:[]},coverage:{status:'NOT_RUN',requestedRepeatsPerCell:1,requestedWindowMs:windowMs,runs:[],aggregate:[],pairOrders:[],purpose:'One 1920/full window per variant for rarities 0–6 only checks coverage; it is not evidence of a performance improvement and is not pooled with the main matrix.'},errors:[],status:'RUNNING',notes:[
 'Fresh isolated Chromium contexts and loopback URLs; no external pages or private saves.',
 'The taskbook permits this standalone Playwright route; consult the current release environment record for the observed preferred-browser limitations.',
 'Inventory time starts inside the trusted native click capture listener and ends at the second requestAnimationFrame callback; protocol transport is excluded.',
 'Inventory pairs alternate baseline/after then after/baseline. Frame and rarity-coverage pairs also alternate order across their complete matrices, including one-repeat cells. Each run records its pair and order; one inventory warmup each is excluded.',
 'Exclusion policy fixed before measuring: only the single declared inventory warmup is excluded. No timed sample or slow frame is discarded, trimmed, winsorized, or selected for a favorable result.',
 'No automatic retry replaces a failed sample. A failure stops the run, retains every completed sample, and records the active case. Smoke mode is a separate report and is never merged into formal aggregates.',
 'A measured browser promise has a fixed 30-second wall-time deadline. Exceeding it fails the run; it never triggers a replacement sample.',
 'Each frame window starts in the native action click capture listener. Callback intervals include initial input-to-frame latency; the actual window can exceed 4200ms under a long stall.',
 'Long-task aggregates include only tasks overlapping the measured window. Every RAF interval and every observed long-task entry is retained, including complete overlapping samples and the original largest-three summary. Quantiles use sorted rank floor((n-1)*p).',
 'ANGLE SwiftShader is explicitly requested. These are software-rendered browser callback timings, not physical GPU FPS or physical 4K60 validation.',
 'Fixture loading, native navigation back to the game, correctness checks, and optional screenshots occur outside timing windows.',
 'Boss fixtures contain six maximum-length legal logs. The source validator rejects a seventh log or a 181-character log; the real roll and rendered log remain capped at six.',
 'Every inventory sample compares all 60 complete outerHTML strings after its end timestamp with its own declared source gameView(inventory,{view:inventory,inventoryPage:0,...}) output parsed by native Chromium DOMParser. It also requires complete HTML stability within that version, identical cross-version card IDs/order/common action states, and unchanged complete persisted state. No card fields are removed or normalized to make versions match.',
 'Both versions retain complete source-rendered game HTML, expected card HTML, actual reference card HTML, all card hashes/bytes, and a lossless per-card cross-version difference report. Cross-version full HTML equality is recorded, not required: Round 12 intentionally adds comparison buttons and condition text.',
 'Source identity includes the union of all JavaScript and CSS under src plus the original core files. Every served runtime file must match its local bytes and SHA-256. package.json is deliberately not served: its local version must match the actual document release, and HTTP must reject access. Legitimately absent new baseline files must return HTTP 404/410 through the Playwright request API; expected missing files never filter genuine page console errors.',
 'Optional --baseline-source identifies the baseline engine for complete post-action equality. Defaults to --source for backward compatibility; no state fields are ignored.',
 ]};
const save=()=>fs.writeFile(path.join(output,'performance-round.json'),JSON.stringify(report,null,2)+'\n');
const orderedEntries=(entries,pair)=>pair%2?entries:entries.toReversed();
async function writeHtml(file,html){await fs.writeFile(path.join(output,file),html);return {file,sha256:hash(html),utf8Bytes:Buffer.byteLength(html),characters:html.length};}
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
 await context.addInitScript(()=>{
  // One native DOM reader is used for both the parsed source oracle and the
  // actual rendered inventory. It retains complete HTML, not a pruned tree.
  window.__qaInventorySnapshot=(root=document)=>{
   const cards=[...root.querySelectorAll('.inventory-list .item-card')];
   const attributes=node=>[...node.attributes].map(attribute=>[attribute.name,attribute.value]);
   const cardStates=cards.map(card=>{
    const action=name=>{
     const node=card.querySelector(`[data-action="${name}"]`);
     return node?{tagName:node.tagName,attributes:attributes(node),disabled:node.disabled,textContent:node.textContent}:null;
    };
    return {id:card.querySelector('[data-action="lock"]')?.dataset.id??null,attributes:attributes(card),equipped:card.classList.contains('item-equipped'),lockVisible:!!card.querySelector('.item-lock'),lock:action('lock'),equip:action('equip'),salvage:action('salvage-item')};
   });
   const cardOuterHTML=cards.map(card=>card.outerHTML);
   return {cards:cards.length,ids:cardStates.map(card=>card.id),cardStates,cardOuterHTML,outerHTML:cardOuterHTML.join('')};
  };
 });
 const page=await context.newPage();page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(60000);
 page.on('pageerror',error=>report.errors.push({label:variant.label,type:'pageerror',message:error.message}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({label:variant.label,type:'console',message:message.text()});});
 const documentResponse=await page.goto(variant.url);await page.evaluate(()=>document.fonts.ready);
 const environment=await page.evaluate(()=>{
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const result={ua:navigator.userAgent,platform:navigator.platform,dpr:devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],longTaskObserver:PerformanceObserver.supportedEntryTypes.includes('longtask'),webLocks:!!navigator.locks};
  gl?.getExtension('WEBGL_lose_context')?.loseContext();return result;
 });
 const served=await page.evaluate(()=>({release:document.querySelector('meta[name="dice-abyss-release"]')?.content??null,build:document.querySelector('meta[name="dice-abyss-build"]')?.content??null,documentUrl:location.href,linkedStylesheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.href)}));
 // API requests do not produce page console errors for an expected 404. The
 // ordinary pageerror/console listeners above remain complete and unfiltered.
 served.assets=await Promise.all(sourceBefore[variant.label].map(async expected=>{
  const response=await context.request.get(new URL(expected.file,served.documentUrl).href,{headers:{'Cache-Control':'no-cache'}}),bytes=await response.body();
  return {file:expected.file,expectedExists:expected.exists,url:response.url(),status:response.status(),bytes:bytes.length,sha256:hash(bytes)};
 }));
 served.documentStatus=documentResponse?.status()??null;assert(served.release&&served.documentStatus===200,'Actual HTTP release metadata is required');
  const localPackage=JSON.parse(await fs.readFile(path.join(variant.label==='baseline'?baselineSource:source,'package.json'),'utf8'));
  assert.equal(served.release,localPackage.version,'The served release must match the local package version');
 served.documentSha256=hash(await documentResponse.body());
 report.sourceHttpIdentity??=[];report.sourceHttpIdentity.push({label:variant.label,...served});
 assert.equal(served.documentSha256,sourceBefore[variant.label].find(file=>file.file==='index.html').sha256,'The navigated document must match the declared index.html');
 for(const asset of served.assets){
  const expected=sourceBefore[variant.label].find(file=>file.file===asset.file);
   if(asset.file==='package.json'){asset.scope='local-metadata-intentionally-not-served';assert.equal(asset.status,404,'The existing runtime-only server must keep package metadata private');continue;}
  if(!expected.exists){assert([404,410].includes(asset.status),`Absent ${variant.label} ${asset.file} must be absent over HTTP too`);continue;}
  assert.equal(asset.status,200,`Served ${variant.label} ${asset.file} must return HTTP 200`);
  assert.equal(asset.bytes,expected.bytes,`Served ${variant.label} ${asset.file} must match its declared byte size`);
  assert.equal(asset.sha256,expected.sha256,`Served ${variant.label} ${asset.file} must match its declared source`);
 }
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
const inventoryUi={screen:'game',view:'inventory',inventoryPage:0,inventorySlot:'',inventoryRarity:'',inventorySort:'power',busy:false,rolling:false,forgeSlot:'weapon',talentCount:1,saveError:''};
const inventoryOracles=new Map(),actualCardReferences=new Map();
function htmlDifference(before,after){
 if(before===after)return null;
 let prefix=0,suffix=0;
 while(prefix<Math.min(before.length,after.length)&&before[prefix]===after[prefix])prefix++;
 while(suffix<Math.min(before.length,after.length)-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
 return {commonPrefixCharacters:prefix,commonSuffixCharacters:suffix,removed:before.slice(prefix,before.length-suffix),added:after.slice(prefix,after.length-suffix)};
}
async function prepareInventoryOracles(entries){
 for(const entry of entries){
  const label=entry.variant.label,oracle=expectedModules[label],rendererState=structuredClone(inventory),raw=oracle.storage.encodeSave(rendererState);
  assert(oracle.storage.validateSave(rendererState),'The complete inventory fixture must be legal in each version');
  assert.deepEqual(oracle.storage.decodeSave(raw),inventory,'Each source decoder must retain the complete identical inventory state');
  const html=oracle.views.gameView(rendererState,inventoryUi);
  assert.deepEqual(rendererState,inventory,'Building the source DOM oracle must leave every fixture field unchanged');
  const snapshot=await entry.page.evaluate(html=>window.__qaInventorySnapshot(new DOMParser().parseFromString(html,'text/html')),html);
  const visibleItems=inventory.player.items.toSorted((a,b)=>oracle.equipment.itemValue(b)-oracle.equipment.itemValue(a)).slice(0,60);
  assert.equal(snapshot.cards,60,'The native source oracle must contain all 60 cards');
  assert.deepEqual(snapshot.ids,visibleItems.map(item=>item.id),'Source card IDs/order must match that version\'s real itemValue sort');
  for(const [index,item]of visibleItems.entries()){
   const card=snapshot.cardStates[index],equipped=Object.values(inventory.player.equipped).includes(item.id);
   assert.equal(card.equipped,equipped,'Every source card must expose its actual equipped state');
   assert.equal(card.lockVisible,!!item.locked,'Every source card must expose its actual locked state');
   assert.equal(card.lock?.attributes.find(([key])=>key==='aria-pressed')?.[1],String(!!item.locked));
   assert.equal(card.equip?.disabled,equipped);
   assert.equal(!!card.salvage,!equipped&&!item.locked&&item.id!==inventory.loot?.item?.id);
  }
  const itemStates=visibleItems.map(item=>({item:structuredClone(item),equippedSlots:Object.keys(inventory.player.equipped).filter(slot=>inventory.player.equipped[slot]===item.id)}));
  const sourceGameHtml=await writeHtml(`inventory-source-${label}-game-view.html`,html),cardHtml=await writeHtml(`inventory-source-${label}-cards.html`,snapshot.outerHTML);
  const details={sourceRoot:label==='baseline'?baselineSource:source,viewsSourceSha256:sourceBefore[label].find(file=>file.file==='src/views.js').sha256,ui:inventoryUi,stateSha256:hash(inventory),rawStateSha256:hash(raw),sourceGameHtml,cardHtml,cards:snapshot.cards,ids:snapshot.ids,cardIdsSha256:hash(snapshot.ids),cardStates:snapshot.cardStates,cardStatesSha256:hash(snapshot.cardStates),completeItemStates:itemStates,completeItemStatesSha256:hash(itemStates),sourceStateUnchanged:true};
  report.inventory.oracles[label]=details;inventoryOracles.set(label,{...snapshot,...details});
 }
 const baseline=inventoryOracles.get('baseline'),after=inventoryOracles.get('after');
 assert.deepEqual(after.ids,baseline.ids,'Cross-version card IDs and ordering must remain identical');
 assert.deepEqual(after.cardStates,baseline.cardStates,'Cross-version complete lock/equip/salvage control states must remain identical');
 assert.deepEqual(after.completeItemStates,baseline.completeItemStates,'Cross-version complete visible item fields and equipped slots must remain identical');
 assert.equal(after.stateSha256,baseline.stateSha256,'Cross-version complete fixture state must remain identical');
 const cards=baseline.cardOuterHTML.map((html,index)=>({index,id:baseline.ids[index],identical:html===after.cardOuterHTML[index],baseline:{html,sha256:hash(html),utf8Bytes:Buffer.byteLength(html)},after:{html:after.cardOuterHTML[index],sha256:hash(after.cardOuterHTML[index]),utf8Bytes:Buffer.byteLength(after.cardOuterHTML[index])},difference:htmlDifference(html,after.cardOuterHTML[index])}));
 const file='inventory-complete-card-dom-differences.json',differences={scope:'All 60 complete native-parsed source card trees, with no field pruning. Every actual warmup/measured inventory must separately match its own source oracle exactly.',baseline:baseline.cardHtml,after:after.cardHtml,completeHtmlIdentical:baseline.outerHTML===after.outerHTML,cardsDifferent:cards.filter(card=>!card.identical).length,cards};
 const encoded=JSON.stringify(differences,null,2)+'\n';await fs.writeFile(path.join(output,file),encoded);
 report.inventory.domDifferences={file,sha256:hash(encoded),utf8Bytes:Buffer.byteLength(encoded),cardsCompared:cards.length,cardsDifferent:differences.cardsDifferent,completeHtmlIdentical:differences.completeHtmlIdentical};
 report.inventory.crossVersionSourceStateIdentical=true;report.inventory.crossVersionCardStatesIdentical=true;
 await save();
}
async function armInventory(page){
 await page.evaluate(()=>{
  window.__qaInventoryDone=new Promise(resolve=>{
   const onClick=event=>{
    if(!event.target.closest('.main-nav [data-action="inventory"]'))return;
    document.removeEventListener('click',onClick,true);const start=performance.now(),trusted=event.isTrusted;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
     const elapsedMs=performance.now()-start,snapshot=window.__qaInventorySnapshot();
     resolve({elapsedMs,trusted,...snapshot,visibility:document.visibilityState});
    }));
   };document.addEventListener('click',onClick,true);
  });
 });
}
async function inventorySample(entry){
 const {page}=entry,label=entry.variant.label,oracle=inventoryOracles.get(label);await page.bringToFront();
 if(await page.locator('.inventory-screen').count())await page.locator('.manual-control [data-action="game"]').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await armInventory(page);await page.locator('.main-nav [data-action="inventory"]').click();
 const result=await measuredResult(page,'__qaInventoryDone');
 const cardHtmlSha256=hash(result.outerHTML),cardHtmlUtf8Bytes=Buffer.byteLength(result.outerHTML);
 // A failed DOM check retains the entire measured tree as well as its hash.
 report.activeMeasurement={...result,cardIdsSha256:hash(result.ids),cardHtmlSha256,cardHtmlUtf8Bytes,expectedCardHtml:oracle.cardHtml};
 if(!actualCardReferences.has(label)){
  const artifact=await writeHtml(`inventory-actual-${label}-cards.html`,result.outerHTML);
  report.inventory.actualReferences[label]={...artifact,cardIdsSha256:hash(result.ids),cardStatesSha256:hash(result.cardStates)};
  actualCardReferences.set(label,result);
 }else if(result.outerHTML!==actualCardReferences.get(label).outerHTML){
  report.activeMeasurement.unstableActualHtml=await writeHtml(`inventory-unstable-${label}-${report.activeCase.kind}-${report.activeCase.repeat??0}-cards.html`,result.outerHTML);
 }
 assert(result.trusted);assert.equal(result.cards,60);assert.equal(result.visibility,'visible');
 assert.deepEqual(result.ids,oracle.ids,'Every actual card ID and ordering must match the complete source oracle');
 assert.deepEqual(result.cardStates,oracle.cardStates,'Every actual card state must match the complete source oracle');
 assert.deepEqual(result.cardOuterHTML,oracle.cardOuterHTML,'Every actual complete card DOM tree must equal its own source gameView parsed by the same native browser');
 assert.equal(result.outerHTML,oracle.outerHTML,'The entire joined 60-card HTML must also match its source oracle without normalization');
 assert.equal(result.outerHTML,actualCardReferences.get(label).outerHTML,'All 60 complete card DOM trees must remain identical across warmup and repeats within a version');
 if(label==='baseline')report.inventory.referenceCardHtmlSha256??=cardHtmlSha256;
 const saved=await unchanged(page);assert(saved.main&&saved.mirror,'Inventory navigation must not alter either stored copy');
 return {elapsedMs:result.elapsedMs,trusted:true,cards:60,cardIdsSha256:hash(result.ids),cardStatesSha256:hash(result.cardStates),cardHtmlSha256,cardHtmlUtf8Bytes,actualCardHtmlFile:report.inventory.actualReferences[label].file,expectedCardHtmlSha256:oracle.cardHtml.sha256,completeSourceDomMatched:true,completeHtmlStableWithinVariant:true,stateSha256:hash(inventory),stateUnchanged:true,mirrorUnchanged:true};
}
async function measureInventory(entries){
 await prepareInventoryOracles(entries);
 for(const entry of entries){
  report.activeCase={kind:'inventory-warmup',label:entry.variant.label};
  const capacity=await load(entry,inventory,'low');report.inventory.storage.push({label:entry.variant.label,...capacity});
  if(!capacity.ok){report.inventory.status='BLOCKED_STORAGE_CAPACITY';await save();return;}
  const warmup=await inventorySample(entry);report.inventory.storage.at(-1).warmupMs=warmup.elapsedMs;report.inventory.storage.at(-1).warmup=warmup;
  report.activeMeasurement=null;report.activeCase=null;
 }
 for(let repeat=1;repeat<=inventorySamples;repeat++){
  const ordered=orderedEntries(entries,repeat),pairOrder=ordered.map(entry=>entry.variant.label);report.inventory.pairOrders.push({pair:repeat,repeat,order:pairOrder});
  for(const [position,entry]of ordered.entries()){
   report.activeCase={kind:'inventory',label:entry.variant.label,repeat,pair:repeat,pairOrder,position:position+1};
   const result=await inventorySample(entry);report.inventory.runs.push({label:entry.variant.label,repeat,pair:repeat,pairOrder,position:position+1,...result});
   report.activeMeasurement=null;report.activeCase=null;console.log(`inventory ${entry.variant.label} #${repeat}: ${result.elapsedMs.toFixed(1)}ms, 60 cards, unchanged save`);await save();
  }
 }
 for(const variant of variants)report.inventory.aggregate[variant.label]=summarize(report.inventory.runs.filter(run=>run.label===variant.label).map(run=>run.elapsedMs));
 report.inventory.cardSetsIdentical=new Set(report.inventory.runs.map(run=>run.cardIdsSha256)).size===1;assert(report.inventory.cardSetsIdentical);
 report.inventory.cardHtmlIdentical=new Set(report.inventory.runs.map(run=>run.cardHtmlSha256)).size===1;
 report.inventory.cardHtmlMatchedOwnSource=report.inventory.runs.every(run=>run.completeSourceDomMatched);assert(report.inventory.cardHtmlMatchedOwnSource);
 report.inventory.cardHtmlStableWithinVariant=Object.fromEntries(variants.map(variant=>[variant.label,new Set(report.inventory.runs.filter(run=>run.label===variant.label).map(run=>run.cardHtmlSha256)).size===1]));
 assert(Object.values(report.inventory.cardHtmlStableWithinVariant).every(Boolean),'Complete card HTML must be stable for every variant');
 report.inventory.cardStatesIdentical=new Set(report.inventory.runs.map(run=>run.cardStatesSha256)).size===1;assert(report.inventory.cardStatesIdentical);
 report.inventory.completeStateIdentical=new Set(report.inventory.runs.map(run=>run.stateSha256)).size===1;assert(report.inventory.completeStateIdentical);
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
    const taskSample=task=>({...task.toJSON(),start:task.startTime,duration:task.duration});
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>tasks.push(...list.getEntries().map(taskSample))):null;
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
      if(observer){tasks.push(...observer.takeRecords().map(taskSample));observer.disconnect();}
      const sorted=intervals.toSorted((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)]??null;
      const overlapping=tasks.filter(task=>task.start<end&&task.start+task.duration>start),durations=overlapping.map(task=>task.duration).toSorted((a,b)=>a-b);
      resolve({trusted,actualWindowMs,windowStartTimeMs:start,windowEndTimeMs:end,windowOverrunMs:actualWindowMs-windowMs,frames:intervals.length,rafIntervalsMs:intervals,firstFrameDelayMs:intervals[0],p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),over50:intervals.filter(value=>value>50).length,over100:intervals.filter(value=>value>100).length,peakPixels:peaks,effectKinds:[...kinds],longTasks:{supported:!!observer,count:overlapping.length,totalOverlapMs:overlapping.reduce((total,task)=>total+Math.max(0,Math.min(end,task.start+task.duration)-Math.max(start,task.start)),0),maxMs:durations.at(-1)??0,largest:overlapping.toSorted((a,b)=>b.duration-a.duration).slice(0,3).map(task=>({startOffsetMs:task.start-start,durationMs:task.duration})),samples:overlapping.map(task=>({...task,startOffsetMs:task.start-start,durationMs:task.duration,overlapMs:Math.max(0,Math.min(end,task.start+task.duration)-Math.max(start,task.start))})),observedSamples:tasks},visibility:document.visibilityState});
     },0);
    };requestAnimationFrame(tick);
   };document.addEventListener('click',onClick,true);
  });
 },windowMs);
}
function verifyFrameSamples(result){
 assert.equal(result.rafIntervalsMs.length,result.frames,'Every measured RAF interval must be retained');
 assert(result.rafIntervalsMs.every(value=>Number.isFinite(value)&&value>=0),'No non-finite or negative raw frame interval may be silently excluded');
 assert(Math.abs(result.rafIntervalsMs.reduce((sum,value)=>sum+value,0)-result.actualWindowMs)<1e-6,'Raw intervals must reconstruct the entire measured window, including the first callback delay');
 const summary=summarize(result.rafIntervalsMs);
 for(const key of ['p50','p95','p99','max'])assert.equal(result[key],summary[key],`Raw intervals must reconstruct ${key}`);
 assert.equal(result.longTasks.samples.length,result.longTasks.count,'Every overlapping long-task sample must be retained');
 assert(result.longTasks.observedSamples.every(task=>Number.isFinite(task.start)&&Number.isFinite(task.duration)&&task.duration>=0),'Every observed long-task sample must remain finite and complete');
 assert.equal(result.longTasks.samples.reduce((sum,task)=>sum+task.overlapMs,0),result.longTasks.totalOverlapMs,'All overlapping long-task durations must remain in the aggregate');
}
async function measureFrames(entries,coverage=false){
 const section=coverage?report.coverage:report.frames;
 const sizes=coverage||mode==='smoke'?[[1920,1080]]:(args['--sizes']||'1920x1080,3840x2160').split(',').map(size=>size.split('x').map(Number));
 const chosen=coverage?coverageScenes:mode==='smoke'?scenes.slice(0,1):scenes,effectModes=coverage?['full']:mode==='smoke'?['low']:['full','low'],repeatCount=coverage?1:repeats;
 for(const [width,height]of sizes){assert(Number.isInteger(width)&&Number.isInteger(height));for(const entry of entries)await entry.page.setViewportSize({width,height});
  for(const scene of chosen)for(const effects of effectModes)for(let repeat=1;repeat<=repeatCount;repeat++){
   const pair=section.pairOrders.length+1,ordered=orderedEntries(entries,pair),pairOrder=ordered.map(entry=>entry.variant.label);
   section.pairOrders.push({pair,scene:scene.name,width,height,effects,repeat,order:pairOrder});
   for(const [position,entry]of ordered.entries()){
    report.activeCase={kind:coverage?'coverage':'frames',label:entry.variant.label,scene:scene.name,width,height,effects,repeat,pair,pairOrder,position:position+1};
    const {page}=entry,capacity=await load(entry,scene.state,effects);assert(capacity.ok,'Small action fixture must fit real storage');
    const beforeLog=await page.locator('.log-panel li').allTextContents();assert.equal(beforeLog.length,scene.state.log.length);
    assert(beforeLog.every((text,i)=>text.includes(scene.state.log[i].text)),'The complete legal long log must be rendered before timing');
    await armFrames(page);await page.locator('#primary-action').click();
    const result=await measuredResult(page,'__qaFrameDone');report.activeMeasurement=result;assert(result.trusted);assert.equal(result.visibility,'visible');assert(result.frames>0);verifyFrameSamples(result);
    await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
    const oracle=expectedModules[entry.variant.label];
    const raw=await page.evaluate(key=>localStorage.getItem(key),keys.main),actual=oracle.storage.decodeSave(raw),expected=oracle.engine.transition(scene.state,{type:scene.action});assert.deepEqual(actual,expected,'Measured click commits one exact real engine transition');
    const mirror=await page.evaluate(key=>localStorage.getItem(key),keys.mirror);assert.equal(mirror,raw,'Small action save must keep both mirrors');
    const afterLog=await page.locator('.log-panel li').allTextContents();assert.equal(actual.log.length,6);assert.equal(afterLog.length,6);
    assert(afterLog.every((text,i)=>text.includes(actual.log[i].text)),'The rendered post-action log must match the six committed entries');
    if(scene.action==='open')assert.equal(await page.locator('.loot-screen').count(),1);else assert.equal(await page.locator('.combat-screen').count(),1);
    const effectObserved=effects==='low'||result.effectKinds.includes(scene.action==='open'?`loot-${scene.rarity}`:'combat');
    section.runs.push({label:entry.variant.label,scene:scene.name,rarity:scene.rarity??null,width,height,effects,repeat,pair,pairOrder,position:position+1,fixtureSha256:hash(scene.state),persistedSha256:hash(actual),exactTransition:true,mirrorSaved:true,logBefore:beforeLog.length,logAfter:afterLog.length,logMaxCharacters:Math.max(...scene.state.log.map(log=>log.text.length)),effectObserved,...result});
    report.activeMeasurement=null;report.activeCase=null;console.log(`${coverage?'coverage':'frames'} ${entry.variant.label} ${width} ${scene.name} ${effects} #${repeat}: p95=${result.p95.toFixed(1)} max=${result.max.toFixed(1)}ms frames=${result.frames}`);await save();
   }
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
 const afterFiles=await identityFiles();assert.deepEqual(afterFiles,sourceFiles,'No JavaScript/CSS files may be added or removed during measurement');
 report.sourceAfter={baseline:await sourceIdentity(baselineSource,afterFiles),after:await sourceIdentity(source,afterFiles)};
 assert.deepEqual(report.sourceAfter,report.sourceBefore,'Both declared source trees must remain unchanged during measurement');report.sourceStable=true;
 report.status=report.errors.length||report.inventory.status==='BLOCKED_STORAGE_CAPACITY'||[...report.frames.runs,...report.coverage.runs].some(run=>!run.effectObserved)||(report.frames.runs.length&&repeats<3&&mode!=='smoke')?'MEASURED_WITH_LIMITATIONS':mode==='smoke'?'SMOKE_ONLY':'MEASURED';
 if(mode==='smoke')report.notes.push('Smoke mode has one sample per variant and one low-effect 1920 boss window; its numbers are not a performance conclusion.');
}catch(error){report.status='FAILED';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;throw error;}
finally{report.completedAt=new Date().toISOString();report.elapsedWallMs=Date.now()-startedAt;await save();for(const context of contexts)await context.close();await browser.close();}
console.log(JSON.stringify({output:path.join(output,'performance-round.json'),status:report.status,inventorySamples:report.inventory.runs.length,frameWindows:report.frames.runs.length,coverageWindows:report.coverage.runs.length},null,2));
