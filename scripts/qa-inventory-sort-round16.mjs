// External Playwright + Chromium only; neither is a game dependency.
// Isolated loopback contexts, synthetic saves, trusted click/keyboard controls.
// --smoke is a separate one-pair driver check and is never a formal sample.
// node scripts/qa-inventory-sort-round16.mjs --baseline-source /input/Dice-Abyss --source . --output /tmp/inventory-sort-browser.json [--smoke]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,loadavg,freemem,totalmem} from 'node:os';

const args={};
for(let index=2;index<process.argv.length;index++){
  const key=process.argv[index];
  if(['--smoke','--fixtures-only'].includes(key))args[key]=true;
  else{assert(['--baseline-source','--source','--baseline-url','--after-url','--output'].includes(key),`Unknown option ${key}`);assert(process.argv[index+1],`Missing value for ${key}`);args[key]=process.argv[++index];}
}
assert(args['--baseline-source']&&args['--output'],'Supply --baseline-source and --output.');
const baselineRoot=resolve(args['--baseline-source']),currentRoot=resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),output=resolve(args['--output']);
const smoke=!!args['--smoke'],fixturesOnly=!!args['--fixtures-only'],seed=20261017;
const variants=[{label:'baseline',root:baselineRoot,url:args['--baseline-url']||'http://127.0.0.1:4190/'},{label:'after',root:currentRoot,url:args['--after-url']||'http://127.0.0.1:4191/'}];
for(const variant of variants){const url=new URL(variant.url);assert(['http:','https:'].includes(url.protocol));assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only isolated loopback test URLs are accepted.');variant.url=url.href;}
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const at=(root,file)=>pathToFileURL(resolve(root,file));
async function runtimeIdentity(root,directory='src'){
  const entries=await readdir(resolve(root,directory),{withFileTypes:true}),files=[];
  for(const entry of entries){const file=posix.join(directory,entry.name);if(entry.isDirectory())files.push(...await runtimeIdentity(root,file));else if(/\.(js|css)$/.test(entry.name)){const bytes=await readFile(resolve(root,file));files.push({file,bytes:bytes.length,sha256:sha(bytes)});}}
  return files.toSorted((a,b)=>a.file.localeCompare(b.file));
}
async function identities(){
  return Object.fromEntries(await Promise.all(variants.map(async variant=>{
    const files=await runtimeIdentity(variant.root);
    for(const file of ['index.html','package.json']){const bytes=await readFile(resolve(variant.root,file));files.push({file,bytes:bytes.length,sha256:sha(bytes)});}
    return [variant.label,files];
  })));
}
const initialIdentity=await identities(),scriptSha256=sha(await readFile(new URL(import.meta.url))),modules={};
for(const variant of variants)modules[variant.label]={E:await import(at(variant.root,'src/engine.js')),S:await import(at(variant.root,'src/storage.js')),Q:await import(at(variant.root,'src/inventory-query.js')),V:await import(at(variant.root,'src/views.js'))};
const {E,S}=modules.baseline,keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
assert.deepEqual({main:modules.after.S.SAVE_KEY,mirror:modules.after.S.BACKUP_KEY,settings:modules.after.S.SETTINGS_KEY},keys);
const sortUi=inventorySort=>({view:'inventory',inventorySort,inventoryPage:0,inventorySlot:'',inventoryRarity:'',inventoryQuery:'',busy:false,rolling:false,forging:false});
function fixture(count){
  let state=E.newGame(seed);state.runId=`round16-mixed-inventory-${count}-${seed}`;state.floor=140;state.player.level=80;state.player.gold=500000;state.fate=[6,6];
  state.route=Array.from({length:6},(_,index)=>({id:`f140r${index}`,type:index===0?'rest':index===5?'boss':'combat',quality:0,done:false}));state.roomIndex=0;state.phase='route';state.player.hp=E.stats(state).maxHp;
  state=E.transition(state,{type:'enter'});assert.equal(state.phase,'rest');
  while(state.player.items.length<count){const index=state.player.items.length;state.player.items.push(E.makeItem(state,['weapon','armor','relic'][index%3],index%8));}
  for(const [index,item]of state.player.items.entries()){item.level=1+(index*37)%220;item.enhance=index%21;item.locked=index%97===0;}
  const latest=state.player.items.toReversed();
  for(const slot of ['weapon','armor'])state.player.equipped[slot]=latest.find(item=>item.slot===slot).id;
  const relics=latest.filter(item=>item.slot==='relic');for(const [index,slot]of ['relic','relic2','relic3'].entries())state.player.equipped[slot]=relics[index].id;
  state.player.hp=E.stats(state).maxHp;state.round16UnknownMetadata={kept:['synthetic',seed,{items:count}]};
  for(const {S:storage}of Object.values(modules))assert(storage.validateSave(state),`${count} is a valid synthetic schema5 fixture`);
  const raw=S.encodeSave(state);assert.equal(modules.after.S.encodeSave(state),raw);assert(Buffer.byteLength(raw)<5000000);
  for(const inventorySort of ['power','rarity','level'])assert.deepEqual(modules.after.Q.selectInventoryItems(state.player.items,sortUi(inventorySort)),modules.baseline.Q.selectInventoryItems(state.player.items,sortUi(inventorySort)));
  return {count,state,raw,manifest:{count,seed,runId:state.runId,rng:state.rng,phase:state.phase,rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:sha(raw),stateSha256:sha(state),equippedIds:E.equippedIds(state),rarityCounts:Array.from({length:8},(_,rarity)=>state.player.items.filter(item=>item.rarity===rarity).length)}};
}
const fixtures=[fixture(243),fixture(10000)];
const report={protocol:'round16-trusted-inventory-sort',status:'RUNNING',mode:fixturesOnly?'FIXTURES_ONLY':smoke?'SMOKE':'FORMAL',synthetic:true,seed,startedAt:new Date().toISOString(),scriptSha256,sourceBefore:initialIdentity,variants:variants.map(({label,root,url})=>({label,root,url})),fixtureManifest:fixtures.map(f=>f.manifest),
  method:{scenarios:[243,10000],warmupPairs:smoke?0:1,formalPairs:smoke?1:12,pairOrders:'AB for odd formal pairs, BA for even formal pairs; the one declared warmup is AB.',sequence:['open-power','sort-rarity','sort-level','sort-power'],viewport:{width:1920,height:1080,deviceScaleFactor:1},settings:{sound:false,effects:'low',scale:1},input:'A real main-nav click opens the bag; focused native select receives ArrowDown, ArrowDown, Home. Each timing starts in the trusted DOM click/change capture listener.',endpoint:'Second requestAnimationFrame callback after capture. This is callback latency, not measured paint completion, FPS or physical GPU performance.',longTasks:'All observed entries that overlap the measured capture-to-second-rAF window; observation is supplementary and does not change the endpoint.',oracle:'Every action requires the first 60 rendered IDs to equal its version selector, and all complete card DOM trees to equal its own source center() parsed by native DOMParser. Both persisted copies must remain exactly equal to the fixture string.',sampling:'No automatic retry, outlier removal, or replacement of failed/slow samples. All formal samples and the declared warmup remain separately visible. Smoke results are separate and must not be pooled.',timeoutMs:30000,quantiles:'p50 uses the middle-two mean; p95 uses nearest rank ceil(n*.95). With n=12, p95=max.',fixtures:'Generated from this script and the recorded seed/source hashes. Full ten-thousand-item save strings are deliberately not written into report files.'},host:{node:process.version,cpu:cpus()[0]?.model,cpuCount:cpus().length,totalMemory:totalmem(),loadBefore:loadavg(),freeMemoryBefore:freemem()},httpIdentity:[],contexts:[],orders:[],runs:[],aggregates:[],errors:[]};
const save=async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');};
const summarize=values=>{assert(values.length&&values.every(Number.isFinite));const sorted=values.toSorted((a,b)=>a-b);return {n:values.length,p50:(sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2,p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1),min:sorted[0],mean:values.reduce((a,b)=>a+b,0)/values.length};};
if(fixturesOnly){report.status='PASS';report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,mode:report.mode,output,fixtures:report.fixtureManifest},null,2));process.exit(0);}
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');assert(process.env.CHROMIUM_PATH,'Set CHROMIUM_PATH to the environment-owned Chromium executable.');
const launchArgs=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
report.browserConfiguration={headless:true,launchArgs,rendering:'Explicit ANGLE SwiftShader software rendering; no physical GPU or device claim.'};
let browser;const contexts=[],httpVerified=new Set();
async function fresh(variant,fixture){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});contexts.push(context);
  await context.addInitScript(()=>{
    window.__round16LongTasks=[];window.__round16LongTaskSupported=PerformanceObserver.supportedEntryTypes.includes('longtask');
    window.__round16RecordTasks=entries=>{for(const entry of entries)window.__round16LongTasks.push({startTime:entry.startTime,duration:entry.duration,name:entry.name});};
    if(window.__round16LongTaskSupported){window.__round16LongTaskObserver=new PerformanceObserver(list=>window.__round16RecordTasks(list.getEntries()));window.__round16LongTaskObserver.observe({type:'longtask',buffered:true});}
    window.__round16Cards=root=>[...(root||document).querySelectorAll('.inventory-list .item-card')].map(card=>({id:card.querySelector('[data-action="lock"]')?.dataset.id??null,html:card.outerHTML}));
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push({kind:'pageerror',text:String(error)}));page.on('console',message=>{if(message.type()==='error')errors.push({kind:'console',text:message.text()});});
  await page.goto(variant.url,{waitUntil:'domcontentloaded'});
  if(!httpVerified.has(variant.label)){
    const checks=[];
    for(const expected of initialIdentity[variant.label].filter(file=>file.file!=='package.json')){
      const response=await page.request.get(new URL(expected.file,variant.url).href),bytes=await response.body();assert.equal(response.status(),200,`${variant.label} HTTP ${expected.file}`);assert.equal(sha(bytes),expected.sha256,`${variant.label} served source ${expected.file}`);checks.push({file:expected.file,status:200,bytes:bytes.length,sha256:sha(bytes)});
    }
    report.httpIdentity.push({label:variant.label,checks});httpVerified.add(variant.label);
  }
  await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw:fixture.raw,keys});
  await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.game-shell[data-scene="rest"]').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(raw=>{window.__round16ExpectedSave=raw;},fixture.raw);
  const metadata=await page.evaluate(()=>({release:document.querySelector('meta[name="dice-abyss-release"]')?.content,title:document.title,url:location.href,effects:document.documentElement.dataset.effects,visibility:document.visibilityState}));
  const packageInfo=JSON.parse(await readFile(resolve(variant.root,'package.json'),'utf8'));assert.equal(metadata.release,packageInfo.version);assert.equal(metadata.effects,'low');
  const entry={context,page,variant,fixture,errors,oracles:{}};
  for(const sort of ['power','rarity','level']){
    const expectedIds=modules[variant.label].Q.selectInventoryItems(fixture.state.player.items,sortUi(sort)).slice(0,60).map(item=>item.id),html=modules[variant.label].V.center(fixture.state,sortUi(sort));
    const cards=await page.evaluate(html=>window.__round16Cards(new DOMParser().parseFromString(html,'text/html')),html);assert.deepEqual(cards.map(card=>card.id),expectedIds);entry.oracles[sort]={ids:expectedIds,cards:cards.map(card=>card.html),htmlSha256:sha(cards.map(card=>card.html).join(''))};
  }
  const saved=await unchanged(entry);assert(saved.main&&saved.mirror);
  report.contexts.push({label:variant.label,count:fixture.count,...metadata,rawSha256:fixture.manifest.rawSha256,mainAndMirrorExact:true,oracles:Object.fromEntries(Object.entries(entry.oracles).map(([sort,oracle])=>[sort,{idsSha256:sha(oracle.ids),cardHtmlSha256:oracle.htmlSha256}]))});return entry;
}
async function unchanged(entry){return entry.page.evaluate(keys=>({main:localStorage.getItem(keys.main)===window.__round16ExpectedSave,mirror:localStorage.getItem(keys.mirror)===window.__round16ExpectedSave}),keys);}
async function arm(page,type,selector){
  await page.evaluate(({type,selector})=>{
    window.__round16Done=new Promise(resolve=>{
      const capture=event=>{
        if(!event.target.closest(selector))return;document.removeEventListener(type,capture,true);
        const start=performance.now(),trusted=event.isTrusted,eventValue=event.target.value??null;
        requestAnimationFrame(firstRaf=>requestAnimationFrame(secondRaf=>{const end=performance.now();resolve({start,end,elapsedMs:end-start,firstRaf,secondRaf,trusted,eventType:type,eventValue,visibility:document.visibilityState});}));
      };document.addEventListener(type,capture,true);
    });
  },{type,selector});
}
async function resultWithinDeadline(page){let timer;try{return await Promise.race([page.evaluate(()=>window.__round16Done),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Measured event exceeded the fixed 30-second deadline; no replacement sample')),30000);})]);}finally{clearTimeout(timer);}}
async function action(entry,step,sort,key,roundInfo){
  const {page}=entry;
  if(key){await page.locator('#inventory-sort').focus();await arm(page,'change','#inventory-sort');await page.locator('#inventory-sort').press(key);}
  else{await arm(page,'click','.main-nav [data-action="inventory"]');await page.locator('.main-nav [data-action="inventory"]').click();}
  const measured=await resultWithinDeadline(page);
  const snapshot=await page.evaluate(({start,end})=>{
    if(window.__round16LongTaskObserver)window.__round16RecordTasks(window.__round16LongTaskObserver.takeRecords());
    return {sort:document.querySelector('#inventory-sort')?.value,cards:window.__round16Cards(),longTaskSupported:window.__round16LongTaskSupported,longTasks:window.__round16LongTasks.filter(task=>task.startTime<end&&task.startTime+task.duration>start)};
  },measured);
  const saved=await unchanged(entry),oracle=entry.oracles[sort];
  const row={label:entry.variant.label,count:entry.fixture.count,...roundInfo,step,sort,key:key??null,...measured,renderedCards:snapshot.cards.length,ids:snapshot.cards.map(card=>card.id),cardHtmlSha256:sha(snapshot.cards.map(card=>card.html).join('')),expectedCardHtmlSha256:oracle.htmlSha256,mainExact:saved.main,mirrorExact:saved.mirror,saveSha256:entry.fixture.manifest.rawSha256,longTaskSupported:snapshot.longTaskSupported,longTasks:snapshot.longTasks,status:'CHECKING'};
  report.runs.push(row);report.activeMeasurement={label:row.label,count:row.count,step,round:roundInfo.round};
  assert(measured.trusted,`${step} must come from a trusted native input`);assert.equal(measured.visibility,'visible');assert.equal(snapshot.sort,sort);assert.deepEqual(row.ids,oracle.ids,'Every rendered ID must match the current version selector');assert.deepEqual(snapshot.cards.map(card=>card.html),oracle.cards,'Complete rendered card DOM must match its own source oracle');assert(saved.main&&saved.mirror,'Both saved copies remain byte-identical');assert.deepEqual(entry.errors,[],'No application or console error');
  row.status='PASS';report.activeMeasurement=null;await save();return row;
}
async function sequence(entry,roundInfo){
  await entry.page.bringToFront();
  if(await entry.page.locator('.inventory-screen').count())await entry.page.locator('.manual-control [data-action="game"]').click();
  await entry.page.locator('.game-shell[data-scene="rest"]').waitFor();await entry.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await action(entry,'open-power','power',null,roundInfo);
  await action(entry,'sort-rarity','rarity','ArrowDown',roundInfo);
  await action(entry,'sort-level','level','ArrowDown',roundInfo);
  await action(entry,'sort-power','power','Home',roundInfo);
}
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:launchArgs});report.browserVersion=browser.version();
  for(const fixture of fixtures){
    report.activeCase={count:fixture.count,phase:'load'};const entries=[];for(const variant of variants)entries.push(await fresh(variant,fixture));
    for(let round=smoke?1:0;round<=(smoke?1:12);round++){
      const warmup=round===0,order=round===0||round%2?entries:entries.toReversed(),pairOrder=order.map(entry=>entry.variant.label);report.orders.push({count:fixture.count,round,warmup,pairOrder});
      for(const [position,entry]of order.entries()){
        report.activeCase={count:fixture.count,label:entry.variant.label,round,warmup};await sequence(entry,{round,warmup,pairOrder,position:position+1});
        console.log(`${fixture.count} ${entry.variant.label} ${warmup?'warmup':`pair ${round}`} complete`);
      }
    }
    for(const entry of entries){assert.deepEqual(entry.errors,[]);await entry.context.close();}
  }
  for(const fixture of fixtures)for(const variant of variants)for(const step of ['open-power','sort-rarity','sort-level','sort-power']){
    const runs=report.runs.filter(row=>row.count===fixture.count&&row.label===variant.label&&row.step===step&&!row.warmup);report.aggregates.push({count:fixture.count,label:variant.label,step,...summarize(runs.map(row=>row.elapsedMs)),longTasks:runs.reduce((n,row)=>n+row.longTasks.length,0)});
  }
  assert.deepEqual(await identities(),initialIdentity,'Source identity must stay fixed throughout the browser run');assert.equal(sha(await readFile(new URL(import.meta.url))),scriptSha256,'Driver source must stay fixed');report.sourceAndScriptStable=true;report.status='PASS';report.activeCase=null;
}catch(error){report.status='FAIL';report.errors.push({name:error.name,message:error.message,stack:error.stack});process.exitCode=1;}
finally{
  for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close();report.host.loadAfter=loadavg();report.host.freeMemoryAfter=freemem();report.completedAt=new Date().toISOString();await save();
}
console.log(JSON.stringify({status:report.status,mode:report.mode,output,samples:report.runs.length,aggregates:report.aggregates,errors:report.errors},null,2));
