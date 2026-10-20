// Native-browser QA for the Round14 defeat review and preparation navigation.
// Browser dependencies stay outside the package. Use fresh output directories.
// node scripts/qa-defeat-round14.mjs --source /path/current --baseline /path/baseline --url http://127.0.0.1:4389/ --baseline-url http://127.0.0.1:4388/ --output /tmp/defeat-qa-attempt-01
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const {values:args}=parseArgs({options:{source:{type:'string'},baseline:{type:'string'},url:{type:'string'},'baseline-url':{type:'string'},output:{type:'string'}}});
assert(args.source&&args.baseline&&args.url&&args['baseline-url']&&args.output);
const source=path.resolve(args.source),baseline=path.resolve(args.baseline),out=path.resolve(args.output),url=new URL(args.url).href,baselineUrl=new URL(args['baseline-url']).href;
for(const address of [url,baselineUrl])assert(['127.0.0.1','localhost','[::1]'].includes(new URL(address).hostname));
for(const root of [source,baseline]){const relative=path.relative(root,out);assert(relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Write QA evidence outside source.');}
await fs.mkdir(out,{recursive:true});await assert.rejects(fs.access(path.join(out,'report.json')),'Choose a fresh output directory.');
const E=await import(pathToFileURL(source+'/src/engine.js')),S=await import(pathToFileURL(source+'/src/storage.js'));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const naturalRaw=await fs.readFile(path.join(baseline,'docs/iteration/evidence/round13/natural-current-round13.json.seed-23757.incomplete-save.txt'),'utf8');
const natural=S.decodeSave(naturalRaw);assert.equal(natural.phase,'dead');assert.equal(natural.counters.deaths,21);assert.equal(natural.player.items.length,139);
const tracked=['index.html','package.json','src/app.js','src/views.js','src/engine.js','src/storage.js','src/defeat-review.js','src/defeat-review.css','src/release.js','src/responsive.css'];
async function identity(root){const result={};for(const file of tracked){try{result[file]=hash(await fs.readFile(path.join(root,file)));}catch(error){if(error.code!=='ENOENT')throw error;}}return result;}
const report={audit:'round14-native-defeat-review',source,baseline,url,baselineUrl,started:new Date().toISOString(),scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),inputSha256:hash(naturalRaw),sourceBefore:await identity(source),baselineBefore:await identity(baseline),cases:[],errors:[],blockedRequests:[],limitations:[
 'Browser extension and CUA both returned net::ERR_CONNECTION_REFUSED at the already-running loopback server; the task explicitly permits the isolated Playwright fallback. See the separate browser-environment record.',
 'Chrome software rendering and logical viewports are used, not physical phones, hardware GPU timing, screen-reader listening or OS suspension.',
 'The principal fixture is the exact retained natural seed-23757 failure. Only the two explicitly named boundary groups edit initial talent points or remove alternatives/lastRoll; they are not natural outcomes.',
 'The shipped scale choices are 0.9/1/1.1. The largest real setting, 1.1, is tested without injecting an unsupported 1.2 value.',
 'Contrast checks use the darkest-window palette and a conservative #202126 surface bound covering the existing faint frame wash; screenshot inspection remains separate from numeric geometry checks.'
]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
let row,context,page;
const check=(value,label,detail)=>{row.checks.push({label,passed:!!value,...(detail===undefined?{}:{detail})});assert(value,label);};
const equal=(a,b,label)=>{const item={label,passed:false};row.checks.push(item);assert.deepEqual(a,b,label);item.passed=true;};
const copies=()=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[S.SAVE_KEY,S.BACKUP_KEY]);
const settled=()=>page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy')&&document.querySelector('#primary-action')&&!document.querySelector('#primary-action').disabled);
const scene=name=>page.waitForFunction(name=>document.querySelector('.game-shell')?.dataset.scene===name,name);
const shot=async name=>{const file=name+'.png';await page.screenshot({path:path.join(out,file),animations:'disabled'});row.screenshots.push(file);};
async function readState(){const raw=(await copies())[0];return S.decodeSave(raw);}
async function verifyState(expected,label){const raw=await copies();equal(S.decodeSave(raw[0]),expected,label+' complete decoded state');equal(raw[0],raw[1],label+' primary and mirror bytes');row.stateChecks.push({label,revision:expected.revision,rng:expected.rng,phase:expected.phase,stateSha256:hash(expected),rawSha256:hash(raw[0])});}
async function action(expected,act,locator){const next=E.transition(expected,act);assert.notStrictEqual(next,expected);await locator.click();await page.waitForFunction(({key,revision})=>{try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}},{key:S.SAVE_KEY,revision:next.revision});await settled();await verifyState(next,JSON.stringify(act));return next;}
async function navigate(locator,name){const before=await copies();await locator.click();await scene(name);await settled();equal(await copies(),before,`navigation to ${name} preserves both raw saves`);}
const focusInfo=()=>page.evaluate(()=>{const e=document.activeElement,r=e?.getBoundingClientRect(),s=e?getComputedStyle(e):null;return {action:e?.dataset.action,slot:e?.dataset.slot,id:e?.id,pressed:e?.getAttribute('aria-pressed'),text:e?.textContent,visible:!!r&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,outline:s?{style:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor}:null};});
async function prepare(initial,viewport,address=url,scale=1){
 check(S.validateSave(initial),'validator accepts the complete initial fixture');
 context=await browser.newContext({viewport,reducedMotion:'reduce',deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(20000);
 const origin=new URL(address).origin;
 await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();report.blockedRequests.push(route.request().url());return route.abort();});
 page.on('pageerror',error=>{const item={case:row.name,message:error.message};row.errors.push(item);report.errors.push(item);});
 page.on('console',message=>{if(message.type()==='error'){const item={case:row.name,message:message.text()};row.errors.push(item);report.errors.push(item);}});
 await page.goto(address);const raw=S.encodeSave(initial);
 await page.evaluate(({raw,keys,scale})=>{localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects:'low',scale}));},{raw,keys:{main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY},scale});
 await page.reload();await page.locator('[data-action="continue"]').click();await settled();await page.evaluate(()=>document.fonts.ready);
 row.identity={url:page.url(),title:await page.title(),viewport,scale,bodyText:(await page.locator('#app').innerText()).slice(0,200)};
 check(row.identity.url===address&&row.identity.title.includes('Dice Abyss'),'correct page URL and title');check(row.identity.bodyText.length>50,'meaningful nonblank game');
 check(await page.locator('vite-error-overlay,nextjs-portal,[data-nextjs-dialog-overlay]').count()===0,'no framework error overlay');
 await verifyState(initial,'initial app load');
}
async function layout(label){
 const geometry=await page.evaluate(()=>{const room=document.querySelector('.defeat-review'),primary=document.querySelector('#primary-action'),footer=document.querySelector('.control-strip'),r=room.getBoundingClientRect(),p=primary.getBoundingClientRect(),f=footer.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,room:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,clientWidth:room.clientWidth,scrollWidth:room.scrollWidth,clientHeight:room.clientHeight,scrollHeight:room.scrollHeight,overflowY:getComputedStyle(room).overflowY},primary:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},footer:{top:f.top,bottom:f.bottom},typography:[...room.querySelectorAll('h1,h2,p,dt,dd,button')].map(el=>({text:el.textContent.slice(0,60),font:getComputedStyle(el).fontSize,lineHeight:getComputedStyle(el).lineHeight,color:getComputedStyle(el).color})),horizontalOverflow:[...room.querySelectorAll('h1,h2,p,dt,dd,button')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent.slice(0,60))};});
 row.layouts??=[];row.layouts.push({label,...geometry});
 check(geometry.documentWidth<=geometry.viewport.width+1,label+' has no document horizontal overflow',geometry.documentWidth);
 check(geometry.room.left>=-1&&geometry.room.right<=geometry.viewport.width+1&&geometry.room.scrollWidth<=geometry.room.clientWidth+1,label+' review stays inside horizontal viewport');
 check(geometry.horizontalOverflow.length===0,label+' complete text and controls wrap without clipping',geometry.horizontalOverflow);
 check(geometry.primary.left>=0&&geometry.primary.right<=geometry.viewport.width+1&&geometry.primary.top>=0&&geometry.primary.bottom<=geometry.viewport.height+1,label+' persistent retry remains visible');
 if(geometry.viewport.width>=1100){check(geometry.room.bottom<=geometry.footer.top+1,label+' desktop review does not cover action footer');if(geometry.room.scrollHeight>geometry.room.clientHeight+1){await page.locator('.defeat-review').hover();await page.mouse.wheel(0,1200);await page.waitForFunction(()=>document.querySelector('.defeat-review').scrollTop>0);check(true,label+' desktop review scrolls natively');await page.locator('.defeat-review').evaluate(el=>el.scrollTop=0);}}
}
async function contrast(){
 const readings=await page.locator('.defeat-review').evaluate(room=>{
  const rgb=text=>(text.match(/[\d.]+/g)||[]).slice(0,3).map(Number),luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),base=luminance([32,33,38]);
  return [...room.querySelectorAll('h1,h2,p,dt,dd,button')].map(el=>{const s=getComputedStyle(el),l=luminance(rgb(s.color));return {text:el.textContent.slice(0,45),color:s.color,font:parseFloat(s.fontSize),contrast:(Math.max(l,base)+.05)/(Math.min(l,base)+.05)};});
 });row.contrast=readings;check(readings.every(r=>r.contrast>=4.5),'new review text passes 4.5:1 against conservative surface bound',Math.min(...readings.map(r=>r.contrast)));
 const controls=page.locator('.defeat-actions button');row.controlStates=[];
 for(let i=0;i<await controls.count();i++){
  const control=controls.nth(i);await control.hover();const hover=await control.evaluate(el=>{const s=getComputedStyle(el);return {text:el.textContent,color:s.color,background:s.backgroundColor,border:s.borderColor,height:el.getBoundingClientRect().height};});
  await page.keyboard.press('Tab');await control.focus();const focus=await focusInfo();row.controlStates.push({hover,focus});
  check(hover.height>=44,'preparation control keeps a 44px target');check(focus.outline.style!=='none'&&parseFloat(focus.outline.width)>=2,'preparation control has a visible keyboard focus ring');
 }
 await page.locator('#primary-action').focus();await page.locator('.defeat-review').evaluate(el=>el.scrollTop=0);await page.evaluate(()=>scrollTo(0,0));
}
async function navigationChecks(){
 await navigate(page.locator('.main-nav [data-action="inventory"]'),'inventory');
 const raw=await copies();await page.locator('.slot-tabs [data-slot="weapon"]').click();await page.locator('#inventory-rarity').selectOption('7');
 equal(await copies(),raw,'native weapon/eternal filters preserve both raw saves');check(await page.locator('.room-empty').count()===1,'the real retained inventory has no rarity-seven candidates');
 await navigate(page.locator('#primary-action'),'dead');
 await navigate(page.locator('.defeat-actions [data-slot="armor"]'),'inventory');
 equal(await page.locator('#inventory-rarity').inputValue(),'','defeat armor entry clears stale rarity');equal(await page.locator('.slot-tabs .active').getAttribute('data-slot'),'armor','defeat armor entry selects armor');
 let focus=await focusInfo();check(focus.action==='filter'&&focus.slot==='armor'&&focus.visible,'armor filter receives visible keyboard focus',focus);
 check(await page.locator('.inventory-list .item-card').count()===48,'all 48 owned armor items appear, including the equipped piece');
 await page.locator('#inventory-rarity').selectOption('7');await page.locator('.slot-tabs [data-slot="weapon"]').click();
 await navigate(page.locator('#primary-action'),'dead');await navigate(page.locator('.defeat-actions [data-slot=""]'),'inventory');
 equal(await page.locator('#inventory-rarity').inputValue(),'','open bag entry clears stale rarity');equal(await page.locator('.slot-tabs .active').getAttribute('data-slot'),'','open bag entry selects all slots');
 focus=await focusInfo();check(focus.action==='filter'&&focus.slot===''&&focus.visible,'all-slots filter receives visible focus',focus);
 await navigate(page.locator('#primary-action'),'dead');await navigate(page.locator('.defeat-actions [data-action="talents"]'),'talents');
 focus=await focusInfo();check(focus.action==='talent-group'&&focus.pressed==='true'&&focus.visible,'selected talent branch receives visible focus',focus);
 check(await page.locator('[data-talent-points]').innerText()==='0','natural defeat reports zero unspent talents');
 await navigate(page.locator('#primary-action'),'dead');await verifyState(natural,'after all read-only navigation');
}
async function nativeRescue(){
 let expected=natural;await navigate(page.locator('.defeat-actions [data-slot="armor"]'),'inventory');
 const before=await copies();await page.locator('[data-action="compare-details"][data-id="i123"]').click();await page.locator('dialog[open] [data-comparison-key="regen"]').waitFor();
 row.comparisonText=await page.locator('dialog[open]').innerText();check(row.comparisonText.includes('存活恢复')&&row.comparisonText.includes('5%')&&row.comparisonText.includes('近似计入'),'i123 dialog exposes exact regenerative condition and score scope');
 await shot('i123-comparison');await page.keyboard.press('Escape');check(await page.locator('dialog[open]').count()===0,'Escape closes comparison');equal(await copies(),before,'comparison and Escape preserve both raw saves');
 expected=await action(expected,{type:'equip',id:'i123'},page.locator('[data-action="equip"][data-id="i123"]'));
 check(expected.phase==='dead'&&expected.player.hp===0,'legal defensive swap while dead does not heal or revive');equal(expected.rng,natural.rng,'equip does not spend RNG');equal(expected.player.gold,natural.player.gold,'equip does not spend gold');
 const saved=await copies();await page.reload();await page.locator('[data-action="continue"]').click();await scene('dead');await settled();equal(await copies(),saved,'refresh preserves the equipped defeat bytes');await verifyState(expected,'equipped defeat after refresh');
 expected=await action(expected,{type:'retry'},page.locator('#primary-action'));await scene('combat');
 row.nativeFight=[];
 while(expected.phase==='combat'&&row.nativeFight.length<256){expected=await action(expected,{type:'roll'},page.locator('#primary-action'));row.nativeFight.push({roll:row.nativeFight.length+1,rng:expected.rng,hp:expected.player.hp,enemyHp:expected.enemy.hp,enemyShield:expected.enemy.shield,phase:expected.phase,lastRoll:expected.lastRoll});}
 check(expected.phase==='chest'&&row.nativeFight.length===29,'same natural defeat plus i123 wins after exactly 29 manual button rolls');check(expected.counters.deaths===21,'successful diagnostic adds no death to the unchanged original 21');
 await shot('native-rescue-chest');expected=await action(expected,{type:'open'},page.locator('#primary-action'));await scene('loot');check(expected.player.items.length===140,'native open adds exactly one owned reward');await shot('native-rescue-loot');
 await fs.writeFile(path.join(out,'native-rescue-loot.save.json'),S.encodeSave(expected)+'\n');
}
async function run(name,fn){row={name,status:'RUNNING',checks:[],errors:[],screenshots:[],stateChecks:[]};report.cases.push(row);context=null;page=null;try{await fn();equal(row.errors,[],'no relevant runtime or console errors');row.status='PASS';}catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;if(page)await shot(name+'-FAIL').catch(()=>{});}finally{if(context)await context.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({name,status:row.status,checks:row.checks.length,error:row.error}));}}
try{
 await run('baseline-same-dead-1366',async()=>{await prepare(natural,{width:1366,height:768},baselineUrl);check(await page.locator('.death-screen').count()===1,'same saved natural defeat renders in input build');check(await page.locator('.defeat-review').count()===0,'input build retains its original short death message');await shot('baseline-dead-1366');});
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:2560,height:1440},{width:3840,height:2160},{width:390,height:844},{width:320,height:740}]){
  const name=`current-${viewport.width}x${viewport.height}`;
  await run(name,async()=>{await prepare(natural,viewport);check(await page.locator('.defeat-prepare').innerText().then(t=>t.includes('134')&&t.includes('47')&&t.includes('当前没有未用天赋点')),'natural 134 alternatives / 47 armor / zero-points copy');await layout(name);await contrast();await shot(name);await navigationChecks();if(viewport.width===1366)await nativeRescue();});
 }
 for(const viewport of [{width:1920,height:1080},{width:390,height:844}])await run(`scale11-${viewport.width}`,async()=>{await prepare(natural,viewport,url,1.1);equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--user-scale').trim()),'1.1','real maximum UI scale is active');await layout('scale 1.1');await contrast();await shot(`scale11-${viewport.width}`);await navigationChecks();});
 await run('synthetic-two-talent-points',async()=>{const initial=structuredClone(natural);initial.player.talentPoints=2;await prepare(initial,{width:390,height:844});check(await page.locator('.defeat-prepare').innerText().then(t=>t.includes('2 点')),'synthetic unspent points are displayed');await navigate(page.locator('.defeat-actions [data-action="talents"]'),'talents');let expected=await action(initial,{type:'talent',id:'power',count:1},page.locator('[data-action="talent"][data-id="power"]'));check(expected.player.talentPoints===1&&expected.player.talents.power===85&&expected.player.hp===0,'one native point investment preserves defeat and HP zero');await page.reload();await page.locator('[data-action="continue"]').click();await scene('dead');await settled();await verifyState(expected,'talent investment after refresh');await shot('synthetic-one-point-remains');});
 await run('synthetic-no-alternatives-no-roll',async()=>{const initial=structuredClone(natural),ids=new Set(E.equippedIds(initial));initial.player.items=initial.player.items.filter(item=>ids.has(item.id));initial.lastRoll=null;await prepare(initial,{width:320,height:740});check(await page.locator('.defeat-prepare').innerText().then(t=>t.includes('暂时没有未装备')),'empty alternative message is truthful');check(await page.locator('.defeat-actions [data-slot="armor"]').count()===0,'no unusable armor-specific entry');check(await page.locator('.defeat-last-roll').count()===0,'legacy missing roll does not invent a last-turn number');await layout('synthetic no alternatives');await shot('synthetic-no-alternatives');await navigate(page.locator('.defeat-actions [data-slot=""]'),'inventory');await verifyState(initial,'empty alternative navigation');});
}finally{
 await browser.close();report.sourceAfter=await identity(source);report.baselineAfter=await identity(baseline);report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.baselineStable=JSON.stringify(report.baselineBefore)===JSON.stringify(report.baselineAfter);report.finished=new Date().toISOString();report.summary={groups:report.cases.length,passed:report.cases.filter(row=>row.status==='PASS').length,failed:report.cases.filter(row=>row.status==='FAIL').length,checks:report.cases.reduce((n,row)=>n+row.checks.length,0),stateChecks:report.cases.reduce((n,row)=>n+row.stateChecks.length,0),errors:report.errors.length};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,sourceStable:report.sourceStable,baselineStable:report.baselineStable,output:out,failures:report.cases.filter(row=>row.status==='FAIL').map(({name,error})=>({name,error}))}));
}
if(report.summary.failed||report.errors.length||!report.sourceStable||!report.baselineStable)process.exitCode=1;
