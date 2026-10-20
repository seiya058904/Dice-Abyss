// Reproducible native-browser checks for the Round 12 decision and save UX.
// Playwright/Chromium belong to the QA environment, never to the game package.
// --expect=baseline records the known missing/misleading controls in V5.11.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
const source=path.resolve(args['--source']||'.'),url=args['--url']||'http://127.0.0.1:4189/',output=path.resolve(args['--output']||'/tmp/dice-round12-decisions');
const expected=args['--expect']||'fixed',only=args['--case'];
assert(['baseline','fixed'].includes(expected));assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js'))),Q=await import(pathToFileURL(path.join(source,'src/equipment-content.js')));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const tracked=['index.html','package.json','src/app.js','src/views.js','src/engine.js','src/storage.js','src/responsive.css','src/equipment-comparison.js','src/save-capacity-view.js','src/decisions.css'];
async function identity(){const result={};for(const file of tracked){try{result[file]=hash(await fs.readFile(path.join(source,file)));}catch(error){if(error.code!=='ENOENT')throw error;}}return result;}
await fs.mkdir(output,{recursive:true});
const report={source,url,expected,started:new Date().toISOString(),sourceBefore:await identity(),browser:null,cases:[],errors:[],blockedRequests:[],checks:0,fixtureScope:'New isolated contexts; a native new game plus explicitly constructed valid saves. No private saves, quota overrides, remote accounts or deployments.',limitations:['Logical viewports and software rendering, not physical devices.','Near-limit and 10000-item fixtures intentionally have only a primary copy so no browser-quota override is needed.','Functional screenshot timings are not performance benchmarks.']};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let active;
const check=(value,label,detail={})=>{report.checks++;active.checks.push({label,passed:!!value,...detail});assert(value,label);};
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);check(true,label);};
const saved=async page=>S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY));
const rawCopies=page=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[S.SAVE_KEY,S.BACKUP_KEY]);
const idle=page=>page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
const control=(page,action)=>page.locator(`[data-action="${action}"]`);
async function load(page,state,{mirror=true,scale=1}={}){
 assert(S.validateSave(state),'The fixture must obey the current save schema');
 const raw=S.encodeSave(state);await page.goto(url);
 await page.evaluate(({raw,main,backup,settings,mirror,scale})=>{localStorage.setItem(main,raw);if(mirror)localStorage.setItem(backup,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale}));},{raw,main:S.SAVE_KEY,backup:S.BACKUP_KEY,settings:S.SETTINGS_KEY,mirror,scale});
 await page.reload();await control(page,'continue').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
 equal(await saved(page),S.decodeSave(raw),'Normal application load restores the complete fixture');
 return S.decodeSave(raw);
}
async function step(page,before,action,locator){
 const after=E.transition(before,action);assert.notStrictEqual(after,before,`${action.type} must be legal`);
 await (locator||page.locator(`[data-action="${action.type}"]`).first()).click();
 await page.waitForFunction(({key,revision})=>{try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}},{key:S.SAVE_KEY,revision:after.revision});
 await idle(page);equal(await saved(page),after,`Native ${action.type} commits one exact complete engine result`);return after;
}
async function shot(page,name){await page.screenshot({path:path.join(output,`${name}.png`),animations:'disabled'});active.screenshots.push(`${name}.png`);}
async function geometry(page,selector,label){
 const data=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
 check(data.left>=-1&&data.right<=data.width+1&&data.scrollWidth<=data.clientWidth+1,label,data);return data;
}
async function run(name,fn){
 if(only&&only!==name)return;
 active={name,status:'RUNNING',checks:[],screenshots:[]};report.cases.push(active);
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);
 await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(['127.0.0.1','localhost','[::1]'].includes(host))return route.continue();report.blockedRequests.push(route.request().url());return route.abort();});
 page.on('pageerror',error=>report.errors.push({case:name,message:error.message}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({case:name,message:message.text()});});
 const start=performance.now();
 try{await fn(page,context);active.status='PASS';}
 catch(error){active.status='FAIL';active.error=error.stack||String(error);process.exitCode=1;await shot(page,`FAILED-${name}`).catch(()=>{});}
 finally{active.durationMs=performance.now()-start;await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${active.status} (${active.checks.length})`);}
}
function gear(catalogId,id,level=80){const c=Q.CATALOG_BY_ID.get(catalogId);return {id,catalogId,slot:c.slot,rarity:c.rarity,profile:c.profile,theme:c.theme,name:c.name,level,levelXp:0,enhance:0,depth:140,locked:false};}
function build(){const s=E.newGame(12012);s.runId='round12-comparison-browser';s.floor=140;s.player.level=80;s.player.items=[gear('weapon-6-0-7','i1'),gear('armor-0-0-0','i2'),gear('relic-0-0-0','i3'),gear('weapon-0-0-7','i4',84),gear('relic-0-0-1','i5'),gear('relic-0-0-2','i6'),gear('relic-1-0-7','i7')];s.nextId=8;s.player.equipped.relic2='i5';s.player.equipped.relic3='i6';s.player.hp=E.stats(s).maxHp;assert(S.validateSave(s));return s;}
function shop(type='merchant',count=3){let s=E.newGame(1212);s.runId=`round12-${type}-${count}`;s.fate=[2,3];s.route=[type,'combat','rest','combat','gold','elite'].map((type,i)=>({id:`f1r${i}`,type,quality:0,done:false}));s.phase='route';s.player.gold=100000;s=E.transition(s,{type:'enter'});while(s.player.items.length<count)s.player.items.push({...s.player.items[0],id:`i${s.nextId++}`});assert(S.validateSave(s));return s;}
function nearLimit(){const s=E.newGame(12012);s.runId='round12-capacity-browser';s.qaUnicode='界'.repeat(1_500_000);s.qaPadding='';let size=4999900-Buffer.byteLength(S.encodeSave(s));for(let salt=0;salt<26;salt++)for(let n=0;n<3;n++){s.qaPadding='a'.repeat(Math.max(0,size-1))+String.fromCharCode(65+salt);const raw=S.encodeSave(s),delta=4999900-Buffer.byteLength(raw);if(!delta)return s;size+=delta;}throw Error('Exact UTF-8 fixture could not be constructed');}

try{
 await run('loot-live-lock-refresh',async page=>{
  let s=E.newGame(913);s=E.transition(s,{type:'fate'});s=E.transition(s,{type:'enter'});s.enemy.hp=1;s.enemy.shield=0;s=E.transition(s,{type:'roll'});s=await load(page,s);
  s=await step(page,s,{type:'open'},page.locator('#primary-action'));const id=s.loot.item.id;
  s=await step(page,s,{type:'lock',id},page.locator(`.loot-screen [data-action="lock"][data-id="${id}"]`));
  equal(s.loot.item.locked,expected==='baseline','Reward record follows the expected baseline/fixed ownership semantics');
  await page.reload();await control(page,'continue').click();await idle(page);s=await saved(page);
  s=await step(page,s,{type:'lock',id},page.locator(`.loot-screen [data-action="lock"][data-id="${id}"]`));
  const labels=await page.locator(`[data-action="lock"][data-id="${id}"]`).allTextContents();
  check(labels.length===2,'Both center and right-rail reward controls were inspected');
  equal(labels.map(text=>text.trim()),expected==='fixed'?['锁定','锁定']:['解锁','解锁'],'After reload then unlock, labels match the documented fixed/baseline state');
  check(s.player.items.find(item=>item.id===id).locked===false,'Owned item is actually unlocked');
  if(expected==='fixed'){equal(s.loot.item.locked,false,'Original unlocked snapshot remains unchanged');await page.reload();await control(page,'continue').click();equal(await saved(page),s,'A second refresh preserves complete state');}
  await shot(page,'reward-current-lock');
 });
 await run('comparison-conditions-and-relic-slots',async page=>{
  const s=await load(page,build());await page.locator('.main-nav [data-action="inventory"]').click();
  if(expected==='baseline'){check((await page.locator('.inventory-list').innerText()).includes('估算提升'),'Baseline contains the unqualified estimate');check(await control(page,'compare-details').count()===0,'Baseline has no condition comparison control');await shot(page,'comparison-baseline');return;}
  const before=await rawCopies(page);await page.locator('.inventory-list [data-action="compare-details"][data-id="i4"]').click();
  check(await page.locator('.game-dialog').isVisible(),'Comparison opens a native modal');check((await page.locator('.comparison-verdict').last().innerText()).includes('条件需权衡'),'Misleading grade is replaced with a condition tradeoff');
  const first=page.locator('[data-comparison-key="firstBonus"]');check((await first.innerText()).includes('24%')&&(await first.innerText()).includes('0%'),'First-hit loss is visible');check((await first.innerText()).includes('每场首次掷骰'),'Exact first-hit trigger is visible');
  await geometry(page,'.game-dialog','Comparison dialog fits desktop viewport');await shot(page,'comparison-first-hit');await page.keyboard.press('Escape');
  check(await page.locator('.inventory-list [data-action="compare-details"][data-id="i4"]').evaluate(el=>el===document.activeElement),'Escape restores the comparison opener');
  await page.locator('.inventory-list [data-action="compare-details"][data-id="i7"]').click();
  for(const slot of ['relic','relic2','relic3']){await page.locator('#comparison-slot').selectOption(slot);equal(await page.locator('#comparison-slot').inputValue(),slot,'Selected relic slot remains explicit');check(await page.locator('#comparison-slot').evaluate(el=>el===document.activeElement),'Slot changes preserve keyboard focus');}
  await page.keyboard.press('Escape');check(await page.locator('.inventory-list [data-action="compare-details"][data-id="i7"]').evaluate(el=>el===document.activeElement),'After all three slot changes, Escape restores the same relic comparison opener');
  equal(await rawCopies(page),before,'Opening and changing comparisons write no save');equal(await saved(page),s,'Comparison does not change RNG, revision or player assets');
 });
 await run('full-shop-and-empty-filter',async page=>{
  const s=await load(page,shop('merchant',10000),{mirror:false});const before=await rawCopies(page);
  check(await page.locator('.shop-grid [data-action="buy"]:disabled').count()===3,'Full bag actually disables all item purchases');
  const statuses=await page.locator('.offer-status').allTextContents();equal(statuses,Array(3).fill(expected==='fixed'?'背包容量已满，请先整理闲置装备':'购买后在背包装备'),'Disabled reason is accurate, or the baseline contradiction is reproduced');
  await shot(page,'full-shop');
  if(expected==='fixed')await page.locator('.shop-capacity-note [data-action="inventory"]').click();else await page.locator('.main-nav [data-action="inventory"]').click();
  await page.locator('[data-action="filter"][data-slot="weapon"]').click();await page.locator('#inventory-rarity').selectOption('7');check((await page.locator('.inventory-list').innerText()).includes('暂无符合筛选'),'Empty filter state is visible');
  if(expected==='fixed'){await control(page,'inventory-reset').click();equal(await page.locator('#inventory-rarity').inputValue(),'','Rarity filter is cleared');check(await page.locator('[data-action="filter"][data-slot=""]').evaluate(el=>el===document.activeElement),'Focus reaches the surviving all-items filter');check(await page.locator('.inventory-list .item-card').count()===60,'A full page returns from the same 10000-item bag');}
  else check(await control(page,'inventory-reset').count()===0,'Baseline lacks one-step empty-filter recovery');
  equal(await rawCopies(page),before,'Disabled purchase and filtering preserve all stored bytes');equal(await saved(page),s,'No item or gold is changed by recovery navigation');
 });
 await run('purchase-snapshot-and-compare',async page=>{
  let s=await load(page,shop('blackmarket'));const offer=s.shop.find(o=>o.item);const id=offer.item.id;
  if(expected==='fixed'){await page.locator(`.shop-grid [data-action="compare-details"][data-id="${id}"]`).click();check(await page.locator('.comparison-detail').isVisible(),'An unowned shop item can be compared');await page.keyboard.press('Escape');}
  s=await step(page,s,{type:'buy',id:offer.id},page.locator(`.shop-grid [data-action="buy"][data-id="${offer.id}"]`));
  await page.locator('.main-nav [data-action="inventory"]').click();s=await step(page,s,{type:'lock',id},page.locator(`.inventory-list [data-action="lock"][data-id="${id}"]`));
  await page.locator('.manual-control [data-action="game"]').click();
  if(expected==='fixed'){check((await page.locator('.shop-grid').innerText()).includes('购入时属性 · 当前状态见背包'),'Sold goods are explicitly historical');equal(s.shop.find(o=>o.id===offer.id).item.locked,false,'Purchase record does not change when owned item is locked');}
  await page.reload();await control(page,'continue').click();equal(await saved(page),s,'Bought and locked state survives a normal reload');
 });
 await run('capacity-check-export-and-safe-rejection',async(page,context)=>{
  let s=await load(page,nearLimit(),{mirror:false});const before=await rawCopies(page);check(Buffer.byteLength(before[0])===4999900,'The browser contains a real 4,999,900-byte UTF-8 envelope');
  await control(page,'settings').click();
  if(expected==='baseline'){check(await control(page,'save-capacity').count()===0,'Baseline settings have no preflight capacity check');await shot(page,'capacity-baseline');return;}
  await page.evaluate(()=>{window.__round12Scene=document.querySelector('.game-shell');window.__round12Switch=document.querySelector('[data-action="sound"]');});
  await control(page,'save-capacity').click();const text=await page.locator('#save-capacity-result').innerText();check(text.includes('4,999,900')&&text.includes('100 字节'),'Exact file bytes and 100-byte remaining space are visible');check(text.includes('接近文件上限')&&text.includes('不是浏览器剩余空间'),'Capacity and browser quota are distinguished');
  check(await page.evaluate(()=>window.__round12Scene===document.querySelector('.game-shell')&&window.__round12Switch===document.querySelector('[data-action="sound"]')),'Capacity request preserves scene and setting node identity');
  check(await control(page,'save-capacity').evaluate(el=>el===document.activeElement),'Check result does not steal keyboard focus');equal(await rawCopies(page),before,'Measurement does not write either save copy');
  await shot(page,'capacity-near-limit');
  const downloadPromise=page.waitForEvent('download');await control(page,'export').click();const download=await downloadPromise,downloadPath=path.join(output,'synthetic-capacity-export.json');await download.saveAs(downloadPath);const exported=await fs.readFile(downloadPath,'utf8');equal(exported,before[0],'Native export retains the complete exact original envelope');await fs.unlink(downloadPath);active.export={bytes:Buffer.byteLength(exported),sha256:hash(exported),downloadedAndVerified:true};
  await page.keyboard.press('Escape');await page.locator('#primary-action').click();await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('本次操作未保存'));
  check((await page.locator('.toast').innerText()).includes('现有主档与镜像未改动'),'Growth beyond the file limit explains that this operation did not save');equal(await rawCopies(page),before,'Failed growing transaction leaves both original copies untouched');equal(await saved(page),s,'Rejected fate roll keeps full RNG/revision/assets');
  await control(page,'settings').click();await control(page,'save-capacity').click();check((await page.locator('#save-capacity-result').innerText()).includes('4,999,900'),'A new check reflects the retained prior progress');
 });
  await run('capacity-cross-tab-refresh',async(page,context)=>{
   if(expected==='baseline'){active.skippedReason='The input has no capacity result to invalidate.';return;}
   let s=await load(page,E.newGame(121214));await control(page,'settings').click();await control(page,'save-capacity').click();
   const oldBytes=Buffer.byteLength(S.encodeSave(s));check((await page.locator('#save-capacity-result').innerText()).includes(oldBytes.toLocaleString('en-US')),'Initial settings capacity matches the complete current save');
   const other=await context.newPage();other.on('pageerror',error=>report.errors.push({case:active.name,page:'other',message:error.message}));other.on('console',message=>{if(message.type()==='error')report.errors.push({case:active.name,page:'other',message:message.text()});});await other.goto(url);await control(other,'continue').click();await idle(other);
   s=await step(other,s,{type:'fate'},other.locator('#primary-action'));await page.locator('.game-dialog').waitFor({state:'hidden'});await page.bringToFront();
   check(!await page.locator('.game-dialog').isVisible(),'A real save from another tab closes the old settings result');equal(await saved(page),s,'The observing tab contains the complete newly committed progress');
   await control(page,'settings').click();check(await page.locator('#save-capacity-result .capacity-reading').count()===0,'Reopened settings do not reuse an old measured value');await control(page,'save-capacity').click();
   const newRaw=S.encodeSave(s),newBytes=Buffer.byteLength(newRaw),before=await rawCopies(page);check(newBytes!==oldBytes,'The native fate transaction actually changed the envelope size');check((await page.locator('#save-capacity-result').innerText()).includes(newBytes.toLocaleString('en-US')),'Recheck measures the new complete progress');
   const nextDownload=page.waitForEvent('download');await control(page,'export').click();const download=await nextDownload,file=path.join(output,'synthetic-cross-tab-export.json');await download.saveAs(file);const exported=await fs.readFile(file,'utf8');equal(exported,newRaw,'Native export after cross-tab synchronization contains the new complete state');await fs.unlink(file);active.export={bytes:newBytes,sha256:hash(exported),downloadedAndVerified:true};equal(await rawCopies(page),before,'Capacity recheck and export make no further writes');
  });
  await run('responsive-new-controls',async page=>{
  if(expected==='baseline'){active.skippedReason='New-control layout belongs to the fixed build only.';return;}
  const s=await load(page,build());await page.locator('.main-nav [data-action="inventory"]').click();
  const viewports=[[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,812]];
  for(const [width,height]of viewports){await page.setViewportSize({width,height});await page.locator('.inventory-list [data-action="compare-details"][data-id="i4"]').click();await geometry(page,'.game-dialog',`${width}×${height}: complete condition dialog has no horizontal clipping`);await geometry(page,'.comparison-detail',`${width}×${height}: condition content fits`);if(width===390)await shot(page,'comparison-narrow');await page.keyboard.press('Escape');
   await control(page,'settings').click();await control(page,'save-capacity').click();await geometry(page,'.game-dialog',`${width}×${height}: settings fit`);await geometry(page,'.save-capacity',`${width}×${height}: capacity block fits`);if(width===390)await shot(page,'capacity-narrow');await page.keyboard.press('Escape');
  }
  equal(await saved(page),s,'Viewport and repeated read-only actions leave progress unchanged');
 });
 check(report.cases.some(row=>row.checks.length>0),'At least one requested case actually executed');
 report.sourceAfter=await identity();assert.deepEqual(report.sourceAfter,report.sourceBefore,'Source changed during the browser run');
 assert.equal(report.errors.length,0,'No console or page errors');assert.equal(report.blockedRequests.length,0,'No external network requests');
 report.status=report.cases.every(row=>row.status==='PASS')?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
