// Native Round09 gold receipt QA. Serve the selected source before running.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node
// scripts/qa-gold-browser.mjs --source /path/to/Dice-Abyss --url http://127.0.0.1:4189/
//   --output /tmp/gold-current --expect current
// Use --expect baseline with that version's own --source and --url to record
// known misleading labels as REPRODUCED, never as fixed-behavior passes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';

const {values:args}=parseArgs({options:{source:{type:'string'},url:{type:'string'},output:{type:'string'},expect:{type:'string',default:'current'},cases:{type:'string'}}});
assert(args.url&&args.output,'Pass explicit --url and --output paths.');
assert(['current','baseline'].includes(args.expect),'--expect must be current or baseline');
const source=path.resolve(args.source||fileURLToPath(new URL('../',import.meta.url))),url=new URL(args.url).href,output=path.resolve(args.output),baseline=args.expect==='baseline';
const rel=path.relative(source,output);assert(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),'Keep screenshots and reports outside the source tree.');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only isolated loopback origins are allowed.');
const names=['gold-native','chest-history','exchange-native','typed-imports','primary-save-failure','fate-native','desktop-layouts'],selected=new Set((args.cases||'').split(',').filter(Boolean));
assert([...selected].every(name=>names.includes(name)),'Unknown --cases name.');
await fs.mkdir(output,{recursive:true});await assert.rejects(fs.access(path.join(output,'report.json')),'Use a fresh output directory so failed attempts remain available.');
const moduleAt=file=>import(pathToFileURL(path.join(source,file)));
const [E,S,C]=await Promise.all(['src/engine.js','src/storage.js','src/encounters.js'].map(moduleAt));
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)??'undefined').digest('hex');
const files=['src/app.js','src/engine.js','src/views.js','src/storage.js','src/encounters.js','src/deep-rules.js','src/equipment.js','index.html','package.json',...(!baseline?['src/gold.js','src/gold.css']:[])];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fs.readFile(path.join(source,file)))])));
const report={started:new Date().toISOString(),source,url,expectation:args.expect,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore:await sourceHashes(),cases:[],errors:[],warnings:[],screenshots:[],notes:[
 'The Browser connector and cloud CUA failed to reach loopback with ERR_CONNECTION_REFUSED in this round. The task explicitly permits Chromium/Playwright, so this is the recorded local fallback.',
 'The flow is: exact synthetic pending reward -> native click/confirmation -> exact committed gold/XP/items -> native reload -> historical receipt. Initial fixtures edit gold/floor/level/route and are not naturally reached cap states.',
 'Every committed state is compared in full to the selected version\'s own engine, with exact primary and mirror bytes. Capture JSON files retain full observed DOM, all localStorage strings, decoded main state, and the selected-engine expected state where available. No product state, RNG or DOM handlers are patched to manufacture successful settlements.',
 'The primary-write failure is an explicitly injected Storage.prototype.setItem error. Typed imports use the real native file chooser and application validator.',
 'Low effects, reduced motion and SwiftShader are functional/layout conditions. These checks do not measure FPS, GPU performance, physical 4K, phone, screen-reader output or OS power loss.',
 'Baseline REPRODUCED means the known misleading behavior was observed while unrelated safety checks passed; it never means the new receipt UI was present.'
]};
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY},cap=E.GOLD_CAP;
const button=(page,action)=>page.locator(`[data-action="${action}"]`);
const disk=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
const idle=page=>page.waitForFunction(()=>document.querySelector('.game-shell')&&!document.querySelector('#current-room')?.classList.contains('busy')&&!document.querySelector('#primary-action')?.disabled);
const exact=value=>Number(value).toLocaleString('en-US'),compact=text=>text.replace(/\s+/g,' ').trim();
let row;
function check(condition,label,detail){row.checks.push({label,passed:!!condition,...(detail===undefined?{}:{detail})});assert(condition,label);}
function equal(actual,expected,label){const result={label,passed:false,actualSha256:sha(actual),expectedSha256:sha(expected)};row.checks.push(result);assert.deepEqual(actual,expected,label);result.passed=true;}
function known(condition,label,detail){check(condition,'baseline reproduction: '+label,detail);row.knownDefects.push({label,detail});}
async function capture(page,label,expected){
 const observed=await page.evaluate(()=>({url:location.href,viewport:{width:innerWidth,height:innerHeight},scene:document.querySelector('.game-shell')?.dataset.scene,dom:document.documentElement.outerHTML,bodyText:document.body.innerText,localStorage:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))}));
 const value={case:row.name,label,captured:new Date().toISOString(),...observed,decodedMain:S.decodeSave(observed.localStorage[keys.main])};
 if(expected!==undefined){value.expectedState=expected;value.expectedPrimaryBytes=S.encodeSave(expected);}
 const file=`capture-${row.name}-${String(row.captures.length+1).padStart(3,'0')}.json`,raw=JSON.stringify(value,null,2)+'\n';
 await fs.writeFile(path.join(output,file),raw);row.captures.push({label,file,sha256:sha(raw),bytes:Buffer.byteLength(raw)});return observed.localStorage;
}
async function durable(page,expected,label){const values=await capture(page,label,expected);equal(S.decodeSave(values[keys.main]),expected,label+': complete selected-engine state');equal(values[keys.main],S.encodeSave(expected),label+': exact primary bytes');equal(values[keys.mirror],values[keys.main],label+': exact mirror bytes');equal(values['qa:gold:sentinel'],'keep all unrelated keys\n',label+': unrelated sentinel retained');}
async function waitSave(page,expected){await page.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key:keys.main,raw:S.encodeSave(expected)});await idle(page);}
async function shot(page,name){const file=name+'.png';await page.screenshot({path:path.join(output,file)});row.screenshots.push(file);report.screenshots.push(file);await capture(page,'screenshot '+name);}
async function install(page,state){
 assert(S.validateSave(state),'fixture passes selected source validator');assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);
 await page.goto(url);await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));localStorage.setItem('qa:gold:sentinel','keep all unrelated keys\n');},{raw:S.encodeSave(state),keys});
 await page.reload();await page.evaluate(()=>document.fonts.ready);await button(page,'continue').click();await idle(page);await capture(page,'installed fixture before native action',state);
}
async function reload(page){await page.reload();await button(page,'continue').click();await idle(page);}
async function environment(context,page){
 const served={};for(const file of files.filter(file=>file!=='package.json')){const response=await context.request.get(new URL(file,url).href);check(response.ok(),file+' is served');served[file]=sha(await response.body());}
 equal(served,Object.fromEntries(Object.keys(served).map(file=>[file,report.sourceBefore[file]])),'HTTP source identity matches chosen engine and UI');
 const runtime=await page.evaluate(()=>({title:document.title,url:location.href,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,webLocks:!!navigator.locks,body:document.querySelector('#app')?.innerText.slice(0,120)}));
 check(runtime.title.includes('Dice Abyss')&&runtime.url===url,'page identity is exact');check(runtime.body?.length>20,'app is not a blank page');check(runtime.webLocks,'native Web Locks available');check(await page.locator('vite-error-overlay,nextjs-portal,[data-webpack-error]').count()===0,'no framework error overlay');report.environment=runtime;
}
async function run(name,fn){
 if(selected.size&&!selected.has(name))return;
 row={name,status:'RUNNING',checks:[],knownDefects:[],screenshots:[],captures:[],errors:[]};report.cases.push(row);
 const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);
 await context.route('**/*',route=>route.request().url().startsWith(new URL(url).origin+'/')?route.continue():route.abort());
 page.on('pageerror',error=>{const event={case:name,type:'pageerror',message:error.message};row.errors.push(event);report.errors.push(event);});
 page.on('console',message=>{if(message.type()==='error'){const event={case:name,type:'console',message:message.text()};row.errors.push(event);report.errors.push(event);}else if(message.type()==='warning')report.warnings.push({case:name,message:message.text()});});
 try{await page.goto(url);if(!report.environment)await environment(context,page);await fn(page);equal(row.errors,[],name+': no browser errors');row.status=row.knownDefects.length?'REPRODUCED':'PASS';}
 catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;row.failureDom=await page.evaluate(()=>({scene:document.querySelector('.game-shell')?.dataset.scene,body:document.body.innerText.slice(-2200)})).catch(()=>null);await shot(page,'FAIL-'+name).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(`${name}: ${row.status} (${row.checks.length} checks, ${row.knownDefects.length} known defects)`);
}
function room(type,held=cap-10,{seed=7919,level=100,xp=0}={}){
 let state=E.newGame(seed);state.runId=`native-gold-${type}-${held}-${level}-${xp}`;state.floor=140;state.player.level=level;state.player.xp=xp;state.player.gold=held;state.player.hp=E.stats(state).maxHp;state.fate=[3,4];
 state.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));state.phase='route';
 if(type==='exchange')state.player.items.push(E.makeItem(state,'relic',1));return E.transition(state,{type:'enter'});
}
async function receiptView(page,raw,credited,label){
 const receipt=page.locator('.gold-reward'),text=compact(await receipt.innerText()),amount=await receipt.locator(':scope > strong').innerText();
 if(baseline){known(amount.includes(exact(raw))&&!text.includes('金币实收'),label+': nominal amount shown as received',{raw,credited,text});}
 else{equal(await receipt.getAttribute('data-gold-receipt'),'recorded',label+': recorded receipt tag');check(text.includes('金币实收')&&amount.replace(/\s/g,'')===`+${exact(credited)}`,label+': exact actual credit visible');if(raw>credited)check(text.includes(`原额 ${exact(raw)}`)&&text.includes(`上限截去 ${exact(raw-credited)}`),label+': exact discarded amount visible');}
}
async function cancel(page){await page.locator('dialog .dialog-buttons [data-action="close-dialog"]').click();await page.locator('dialog').waitFor({state:'hidden'});}
function envelope(state){const payload=JSON.stringify(state);let hash=2166136261;for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(hash>>>0).toString(16),payload});}
async function upload(page,raw,name){const chooser=page.waitForEvent('filechooser');await page.locator('dialog [data-action="import"]').click();await(await chooser).setFiles({name,mimeType:'application/json',buffer:Buffer.from(raw)});}
async function geometry(page,selectors,label){
 const read=()=>page.evaluate(selectors=>{
  const box=element=>{if(!element)return null;const r=element.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,panel:box(document.querySelector('#current-room')),dock:box(document.querySelector('.game-footer')),primary:box(document.querySelector('#primary-action')),targets:selectors.map(selector=>{const element=document.querySelector(selector),r=box(element);return{selector,box:r,scrollWidth:element?.scrollWidth,clientWidth:element?.clientWidth,text:element?.innerText};})};
 },selectors);
 const first=await read();check(first.documentWidth<=first.viewport.width+1,label+': no whole-page horizontal overflow');check(first.primary.y>=0&&first.primary.bottom<=first.viewport.height+1,label+': primary action remains in viewport');check(first.dock&&first.panel.bottom<=first.dock.y+1,label+': room panel does not overlap action dock');
 for(const target of first.targets){
  check(target.box?.width>0&&target.box?.height>0,label+': '+target.selector+' has visible geometry');check(target.box.x>=first.panel.x-1&&target.box.right<=first.panel.right+1,label+': '+target.selector+' fits panel width');
  await page.locator(target.selector).scrollIntoViewIfNeeded();const current=(await read()).targets.find(row=>row.selector===target.selector),panel=(await read()).panel;
  check(current.box.y>=panel.y-1&&current.box.bottom<=panel.bottom+1,label+': '+target.selector+' is readable with native scroll');
 }
 const firstViewport=first.targets.map(target=>({selector:target.selector,visible:!!target.box&&target.box.y>=Math.max(0,first.panel.y)-1&&target.box.bottom<=Math.min(first.viewport.height,first.panel.bottom)+1}));
 return {initial:first,firstViewport,requiredNativeScroll:firstViewport.some(target=>!target.visible),afterNativeScroll:await read()};
}

try{
 await run('gold-native',async page=>{
  for(const held of [cap-10,cap]){
   const before=room('gold',held),credited=cap-held,raw=958;await install(page,before);const snapshot=await disk(page),label=held===cap?'full':'near';
   const amount=compact(await page.locator('.gold-hoard>strong').innerText());
   if(baseline)known(amount===`+${raw}`,'gold '+label+' predicts nominal '+raw,{credited});
   else{equal(amount,`+${credited}`,'gold '+label+' predicts exact credit');check((await page.locator('.gold-limit-detail').innerText()).includes(exact(raw-credited)),'gold '+label+' previews exact overflow');check((await page.locator('.gold-balance-preview').innerText()).includes(exact(cap)),'gold '+label+' shows exact resulting balance');}
   equal(await disk(page),snapshot,'gold preview is read-only');await shot(page,'gold-'+label+'-pending');const after=E.transition(before,{type:'gold'});await page.locator('#primary-action').click();await waitSave(page,after);await durable(page,after,'gold '+label+' native one-click');
   equal(after.player.gold-before.player.gold,credited,'gold '+label+' actual delta');if(!baseline)check((await page.locator('#announcement').innerText()).includes(`金币实收 ${credited}`),'gold '+label+' announces actual receipt');
  }
 });
 await run('chest-history',async page=>{
  for(const held of [cap-10,cap]){
   const before=room('chest',held),raw=before.chest.gold,credited=cap-held,label=held===cap?'full':'near';await install(page,before);
   if(baseline)known(await page.locator('[data-gold-preview]').count()===0,'pending chest has no actual-capacity quote');else{const text=await page.locator('[data-gold-preview]').innerText();check(text.includes('金币可收')&&text.includes('+'+credited),'pending chest '+label+' quotes actual amount');}
   const after=E.transition(before,{type:'open'});await page.locator('#primary-action').click();await waitSave(page,after);await durable(page,after,'chest '+label+' opened once');await receiptView(page,raw,credited,'chest '+label);await shot(page,'loot-'+label);
   await reload(page);await durable(page,after,'chest '+label+' reloaded without reroll');await receiptView(page,raw,credited,'reloaded '+label);
  }
  let state=room('chest',0);const old=E.makeItem(state,'weapon',1);state.player.items.push(old);await install(page,state);
  state=E.transition(state,{type:'open'});await page.locator('#primary-action').click();await waitSave(page,state);const credited=state.lootCreditedGold,raw=state.loot.gold;
  await page.locator('.main-nav [data-action="inventory"]').click();await page.locator(`[data-action="salvage-item"][data-id="${old.id}"]`).click();await page.locator('dialog [data-action="confirm"]').click();
  const salvaged=E.transition(state,{type:'salvage',ids:[old.id],allowProtected:false,allowOverflow:false});await waitSave(page,salvaged);await durable(page,salvaged,'later legal salvage');check(salvaged.player.gold>state.player.gold,'later salvage really changes current balance');equal(salvaged.lootCreditedGold,credited,'later transaction leaves historical field exact');
  await page.locator('.manual-control [data-action="game"]').click();if(!baseline)await receiptView(page,raw,credited,'history after later salvage');
  const legacy=structuredClone(salvaged);delete legacy.lootCreditedGold;legacy.player.gold=cap;await install(page,legacy);await durable(page,legacy,'legacy history remains byte-for-byte unchanged');
  const text=compact(await page.locator('.gold-reward').innerText());if(baseline)known(text.includes('已存入行囊')&&!text.includes('未记实收'),'legacy history labels nominal gold as received',{text});else{equal(await page.locator('.gold-reward').getAttribute('data-gold-receipt'),'legacy','missing metadata gets legacy presentation');check(text.includes('未记实收')&&text.includes(exact(raw)),'legacy history states uncertainty and preserves nominal value');}
 });
 await run('exchange-native',async page=>{
  for(const held of [cap-10,cap]){
   const before=room('exchange',held),credited=cap-held,option=page.locator('[data-action="event-choice"][data-id="salvage"]');await install(page,before);const snapshot=await disk(page),text=compact(await option.innerText());
   if(baseline)known(text.includes('835 金币与 540 经验')&&!text.includes('金币可收'),'exchange previews nominal gold',{credited});else check(text.includes(`金币可收 ${credited}`)&&text.includes('540 经验'),'exchange preview shows actual gold and valid XP');
   await option.click();const confirmation=compact(await page.locator('dialog').innerText());await capture(page,'exchange confirmation before cancel',before);check(confirmation.includes(before.player.items.find(item=>item.id===before.event.offerId).name),'confirmation names the exact reserved item');
   if(!baseline)check(confirmation.includes(`金币可收 ${credited}`)&&confirmation.includes('540 经验'),'confirmation repeats exact gold and XP');
   await cancel(page);equal(await disk(page),snapshot,'cancel preserves every localStorage byte');await option.click();await page.locator('dialog [data-action="confirm"]').click();const after=E.transition(before,{type:'event-choice',id:'salvage',confirmed:true});await waitSave(page,after);await durable(page,after,'exchange '+held+' accepted once');
   equal(after.player.gold-held,credited,'exchange gold equals actual capacity');equal(after.player.xp-before.player.xp,540,'exchange XP really enters');check(!after.player.items.some(item=>item.id===before.event.offerId),'only selected old item is consumed');if(!baseline)check((await page.locator('.event-outcome').innerText()).includes(`金币实收 ${credited}`),'result reports actual gold');
  }
  const capped=room('exchange',cap,{level:1e6,xp:1e8});await install(page,capped);await page.locator('[data-action="event-choice"][data-id="salvage"]').click();const confirmation=compact(await page.locator('dialog').innerText());await capture(page,'dual-cap exchange confirmation',capped);await shot(page,'exchange-dual-cap-confirmation');
  if(baseline)known(confirmation.includes('1000000 经验')&&!confirmation.includes('经验可计入 0'),'dual cap still promises XP');else check(confirmation.includes('经验可计入 0')&&confirmation.includes('两项入账均为 0')&&confirmation.includes('仍会永久消耗'),'dual-cap confirmation is explicit');
  await page.locator('dialog [data-action="confirm"]').click();const after=E.transition(capped,{type:'event-choice',id:'salvage',confirmed:true});await waitSave(page,after);await durable(page,after,'dual-cap accepted once');equal(after.player.xp,capped.player.xp,'dual-cap XP does not increase');if(!baseline)check((await page.locator('.event-outcome').innerText()).includes('经验计入 0'),'dual-cap result describes admitted XP');
 });
 await run('typed-imports',async page=>{
  for(const value of ['10',-1,1e8+1]){
   const active=room('chest',cap-10);await install(page,active);const snapshot=await disk(page),malformed=E.transition(room('chest',0),{type:'open'});malformed.lootCreditedGold=value;
   await button(page,'settings').click();await upload(page,envelope(malformed),'malformed-credited-gold.json');
   await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='导入这段旅途？'||document.querySelector('.toast.visible')?.textContent?.includes('不完整')||document.querySelector('.toast.visible')?.textContent?.includes('不兼容'));
   const title=await page.locator('#dialog-title').innerText();
   if(baseline){known(title==='导入这段旅途？','new top-level lootCreditedGold field was previously opaque metadata',{value});await cancel(page);}else{check(title!=='导入这段旅途？','malformed receipt is rejected before overwrite confirmation');check(/不完整|不兼容/.test(await page.locator('.toast').innerText()),'native import explains validation failure');}
   equal(await capture(page,'typed import attempt leaves active save unchanged',active),snapshot,'malformed import attempt changes no storage bytes');
  }
 });
 await run('primary-save-failure',async page=>{
  const before=room('chest',cap-10),after=E.transition(before,{type:'open'});await install(page,before);const snapshot=await disk(page);
  await page.evaluate(key=>{window.__goldOriginalSetItem=Storage.prototype.setItem;window.__goldAnnouncements=[];new MutationObserver(()=>window.__goldAnnouncements.push(document.querySelector('#announcement')?.textContent||'')).observe(document.querySelector('#announcement'),{subtree:true,childList:true,characterData:true});Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic gold receipt main failure','QuotaExceededError');return window.__goldOriginalSetItem.call(this,k,v);};},keys.main);
  await page.locator('#primary-action').click();await page.locator('.toast.visible').filter({hasText:'本次操作未生效'}).waitFor();await idle(page);equal(await capture(page,'failed main write before retry',before),snapshot,'failed open leaves every durable key unchanged');equal(await page.locator('.game-shell').getAttribute('data-scene'),'chest','failed open stays at its original chest');equal(await page.locator('.loot-screen').count(),0,'failure does not reveal successful loot');check(!(await page.evaluate(()=>window.__goldAnnouncements)).some(text=>text.includes('金币实收')),'failure never announces a successful receipt');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__goldOriginalSetItem;});await page.locator('#primary-action').click();await waitSave(page,after);await durable(page,after,'recovered write settles the original chest exactly once');
 });
 await run('fate-native',async page=>{
  let first;for(let seed=1;seed<=80;seed++){const state=E.newGame(seed),after=E.transition(state,{type:'fate'});if(after.fate[0]===after.fate[1]){first=state;break;}}assert(first);
  for(const held of [cap-10,cap]){const before=structuredClone(first);before.player.gold=held;await install(page,before);const after=E.transition(before,{type:'fate'});await page.locator('#primary-action').click();await waitSave(page,after);await durable(page,after,'fate double '+held);const notice=await page.locator('#announcement').innerText();if(baseline)known(!notice.includes('金币实收'),'fate announcer omits clipped receipt',{notice,credited:after.player.gold-held});else check(notice.includes(`金币实收 ${cap-held}`),'fate announces exact clipped credit');}
 });
 await run('desktop-layouts',async page=>{
  row.layouts=[];
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160]]){
   await page.setViewportSize({width,height});const gold=room('gold'),chest=room('chest'),loot=E.transition(chest,{type:'open'}),exchange=room('exchange');
   for(const [kind,state,selectors]of [
    ['gold',gold,['.gold-hoard',...(!baseline?['.gold-limit-detail>p','.gold-balance-preview']:[])]],
    ['chest',chest,baseline?['.chest-screen h1']:['[data-gold-preview]>p','[data-gold-preview] .gold-limit-detail>p']],
    ['loot',loot,['.gold-reward>strong',...(!baseline?['.gold-reward .gold-limit-detail>p']:[])]],
    ['exchange',exchange,['[data-action="event-choice"][data-id="salvage"] .event-reward','[data-action="event-choice"][data-id="salvage"] .event-option-choose']],
   ]){
    await install(page,state);const snapshot=await disk(page);await shot(page,`layout-${width}x${height}-${kind}`);const measure=await geometry(page,selectors,`${width}x${height}/${kind}`);equal(await disk(page),snapshot,'layout inspection and native scroll are read-only');row.layouts.push({width,height,kind,measure});
   }
  }
 });
}finally{
 report.sourceAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.finished=new Date().toISOString();report.summary={groups:report.cases.length,passed:report.cases.filter(row=>row.status==='PASS').length,reproduced:report.cases.filter(row=>row.status==='REPRODUCED').length,failed:report.cases.filter(row=>row.status==='FAIL').length,checks:report.cases.reduce((sum,row)=>sum+row.checks.length,0),knownDefects:report.cases.reduce((sum,row)=>sum+row.knownDefects.length,0),sourceStable:report.sourceStable,errors:report.errors.length};
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report.summary,null,2));
}
if(report.cases.some(row=>row.status==='FAIL')||report.errors.length||!report.sourceStable)process.exitCode=1;
