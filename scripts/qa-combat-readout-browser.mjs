// Native Round08 readout/import/history QA. Playwright and Chromium are tester
// dependencies; neither is bundled with the game. Serve the chosen source first.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node
// scripts/qa-combat-readout-browser.mjs --source /path/to/Dice-Abyss
//   --url http://127.0.0.1:4289/ --output /tmp/readout-attempt-01
// Optional: --cases summary-native-keys,mechanic-fixtures,desktop-layouts,
// rules-native-scroll,narrow-window,typed-imports,historical-factors
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';

const {values:args}=parseArgs({options:{source:{type:'string'},url:{type:'string'},output:{type:'string'},cases:{type:'string'}}});
const source=path.resolve(args.source||fileURLToPath(new URL('../',import.meta.url)));
assert(args.url&&args.output,'Pass --url and an explicit --output directory.');
const url=new URL(args.url).href,output=path.resolve(args.output),relative=path.relative(source,output);
assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Keep QA output outside the source project.');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only loopback test origins.');
const selected=new Set((args.cases||'').split(',').filter(Boolean));
const caseNames=['summary-native-keys','mechanic-fixtures','desktop-layouts','rules-native-scroll','narrow-window','typed-imports','historical-factors'];
assert([...selected].every(name=>caseNames.includes(name)),'Unknown --cases selection.');
await fs.mkdir(output,{recursive:true});
await assert.rejects(fs.access(path.join(output,'report.json')),'Use a fresh output directory to preserve previous attempts.');
const moduleAt=file=>import(pathToFileURL(path.join(source,file)));
const [E,S,C,D]=await Promise.all(['src/engine.js','src/storage.js','src/content.js','src/deep-content.js'].map(moduleAt));
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const files=['src/app.js','src/action-focus.js','src/engine.js','src/views.js','src/encounter-tactics.js','src/deep-rules.js','src/encounters.js','src/deep.css','src/storage.js','index.html','package.json'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fs.readFile(path.join(source,file)))])));
const report={started:new Date().toISOString(),source,url,scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore:await sourceHashes(),cases:[],errors:[],screenshots:[],notes:[
 'The Browser connector and cloud CUA could not reach the loopback server in the authoring environment (ERR_CONNECTION_REFUSED). This script uses the user-authorized local Playwright fallback.',
 'Deep contexts are explicitly synthetic: a real generated encounter at a selected floor, with declared turn, stage, wave and level boundaries. They are validator-accepted fixtures, not naturally reached journeys.',
 'The history path replays the shipped seed7919 / 65-action reproduction. This is a recheck of that one existing natural sample, not an additional independent journey.',
 'Native keyboard, pointer, file chooser, localStorage and Web Locks execute the app handlers. Only initial fixture installation assigns localStorage; no RNG, timer, storage method or engine action is patched.',
 'Reduced motion, low effects and software Chromium are functional/layout conditions. This suite makes no timing, FPS, hardware GPU, physical phone or OS suspension claim.',
 '390px records the existing 900px whole-page minimum. It is not counted as a new mobile layout pass.'
]};
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let row;
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY,legacy:S.LEGACY_BACKUP_KEY,v4:S.V4_BACKUP_KEY};
const button=(page,action)=>page.locator(`[data-action="${action}"]`);
const disk=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
const focus=page=>page.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id,action:document.activeElement?.dataset.action,summary:document.activeElement?.matches('.combat-rules summary')}));
const idle=page=>page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
const compact=s=>s.replace(/\s+/g,' ').trim();
function check(condition,label,detail){row.checks.push({label,passed:!!condition,...(detail===undefined?{}:{detail})});assert(condition,label);}
function equal(actual,expected,label){const result={label,passed:false,actualSha256:sha(actual),expectedSha256:sha(expected)};row.checks.push(result);assert.deepEqual(actual,expected,label);result.passed=true;}
async function durable(page,expected,label){const d=await disk(page);equal(S.decodeSave(d[keys.main]),expected,label+': entire decoded state');equal(d[keys.main],S.encodeSave(expected),label+': exact primary bytes');equal(d[keys.mirror],d[keys.main],label+': exact native mirror');}
async function waitSave(page,expected){await page.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key:keys.main,raw:S.encodeSave(expected)});await idle(page);}
async function shot(page,name){const file=name+'.png';await page.screenshot({path:path.join(output,file)});row.screenshots??=[];row.screenshots.push(file);report.screenshots.push(file);}
async function install(page,state){
 assert(S.validateSave(state),'Fixture must pass the current save validator');assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);
 await page.goto(url);await page.evaluate(({raw,keys})=>{
  localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);
  localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));
  localStorage.setItem('qa:readout:sentinel','keep\u00a0all keys\n');
 },{raw:S.encodeSave(state),keys});
 await page.reload();await page.evaluate(()=>document.fonts.ready);await button(page,'continue').click();await idle(page);
}
async function environment(context,page){
 // The production allowlist intentionally does not expose package metadata.
 const publicFiles=files.filter(file=>file!=='package.json'),served={};for(const file of publicFiles){const response=await context.request.get(new URL(file,url).href);check(response.ok(),file+' served');served[file]=sha(await response.body());}
 equal(served,Object.fromEntries(publicFiles.map(file=>[file,report.sourceBefore[file]])),'Browser server serves the exact chosen source');
 const runtime=await page.evaluate(()=>({title:document.title,url:location.href,ua:navigator.userAgent,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,webLocks:!!navigator.locks,viewport:{width:innerWidth,height:innerHeight}}));
 check(runtime.title.includes('Dice Abyss'),'correct meaningful game page');check(runtime.webLocks,'native Web Locks available');report.environment=runtime;
}
async function run(name,fn,viewport={width:1366,height:768}){
 if(selected.size&&!selected.has(name))return;
 row={name,status:'RUNNING',checks:[],errors:[]};report.cases.push(row);
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);
 await context.route('**/*',route=>route.request().url().startsWith(new URL(url).origin+'/')?route.continue():route.abort());
 page.on('pageerror',error=>{const e={case:name,type:'pageerror',message:error.message};row.errors.push(e);report.errors.push(e);});
 page.on('console',message=>{if(message.type()==='error'){const e={case:name,type:'console',message:message.text()};row.errors.push(e);report.errors.push(e);}});
 try{await page.goto(url);if(!report.environment)await environment(context,page);await fn(page);equal(row.errors,[],name+': no page/console errors');row.status='PASS';}
 catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;row.failureDom=await page.evaluate(()=>({scene:document.querySelector('.game-shell')?.dataset.scene,body:document.body.innerText.slice(-1800),probe:window.__summaryProbe,focus:{tag:document.activeElement?.tagName,id:document.activeElement?.id}})).catch(()=>null);await shot(page,'FAIL-'+name).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(`${name}: ${row.status} (${row.checks.length} checks)`);
}

// Find a real authored target through createEnemy's normal selection, then set
// the explicitly synthetic pre-roll context. No template or RNG is overwritten.
const mechanics=[...new Set([...D.DEEP_ENEMIES,...D.DEEP_BOSSES].map(e=>e.mechanic))];
assert.equal(mechanics.length,16);
function fixture(mechanic,{turns=0,stage=1,wave=1,count=6}={}){
 const boss=mechanic.startsWith('boss_'),type=boss?'boss':mechanic;
 for(let attempt=0;attempt<500;attempt++){
  let s=E.newGame(84001+mechanics.indexOf(mechanic)*1000+attempt);s.runId=`readout-synthetic-${mechanic}-${turns}-${stage}-${wave}-${count}`;s.floor=200;s.player.level=C.DICE_LEVELS[count-1];s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';
  s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));s=E.transition(s,{type:'enter'});
  if(s.enemy.mechanic!==mechanic)continue;
  s.enemy.turns=turns;s.enemy.stage=stage;if(stage===2)s.enemy.hp=Math.floor(s.enemy.maxHp/2);
  if(mechanic==='onslaught'){s.route[0].waves=3;s.route[0].wave=wave;s.enemy.wave=wave;}
  assert.equal(E.diceCount(s),count);assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);return s;
 }
 throw Error('Could not select authored encounter '+mechanic);
}
// These expected display terms come from an independent reading of the real
// combatModifiers / deepEnemyAttack / postRetaliation / encounterReward rules.
// They deliberately do not call encounterTactics to manufacture expectations.
const baseExpected={
 parity:['6 骰中至少 4 颗奇点（1 / 3 / 5）','本击伤害 +35%'],
 sequence:['至少 3 种不同点数','本击伤害 +40%','最大生命 3% 的护盾'],
 laststand:['前两掷的缓冲期','反击 -25%'],
 undertow:['总点数至少 24','本击伤害 +25%，阻止本次回血','最大生命的 2%'],
 hush:['双同或更高共鸣','本次反击 -20%','所有点数各不相同','本击额外穿盾 50%'],
 hourward:['当前为奇数回合','本次反击 -20%'],
 onslaught:['当前为第 1 波','首波反击强度','压低本次反击 25%'],
 bounty:['加赏窗口还剩 3 掷','本击伤害 +20%；本掷击破时金币 ×3'],
 abyssking:['第一阶段：出现 6 点','本击伤害 +35%'],
 archiveguard:['至少 4 种不同点数','本击伤害 +50%；获得生命上限 8% 的护盾','本次反击 +15%'],
 boss_prism:['至少 3 种不同点数','本击伤害 +40%','本次反击 +15%'],
 boss_eclipse:['奇数回合：出现 6 点','阻止本次额外反击','没有 6 点','本次反击 +25%'],
 boss_witness:['本场首次掷骰','本击伤害 +50%'],
 boss_thread:['双同或更高共鸣','本击额外穿盾 45%，阻止本次重织','最大生命 2% 的护盾'],
 boss_origin:['总点数至少 24','本击伤害 +40%','总点数不超过 14','本次反击 +25%'],
 boss_infinite:['第一阶段：至少 4 种不同点数','本击伤害 +40%']
};
async function geometry(page,label){
 const g=await page.evaluate(()=>{
  const names={guide:'.combat-tactics',counter:'.enemy-warning',rules:'.combat-rules',caption:'.roll-caption',dice:'.combat-stage .dice-row',result:'.damage-result',primary:'#primary-action',panel:'#current-room'};
  const boxes=Object.fromEntries(Object.entries(names).map(([name,selector])=>{const element=document.querySelector(selector),r=element?.getBoundingClientRect();return [name,r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null];}));
  const details=document.querySelector('.combat-rules');return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,boxes,rules:details?{open:details.open,scrollTop:details.scrollTop,scrollHeight:details.scrollHeight,clientHeight:details.clientHeight}:null};
 });
 const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
 const conflicts=[];for(const a of ['guide','counter','rules'])for(const b of ['caption','dice','result','primary'])if(overlap(g.boxes[a],g.boxes[b]))conflicts.push([a,b]);
 if(overlap(g.boxes.guide,g.boxes.counter))conflicts.push(['guide','counter']);
 check(Object.values(g.boxes).every(Boolean),label+': required visible regions exist');
 check(conflicts.length===0,label+': readout/counter/rules do not overlap dice/result/action',{conflicts,boxes:g.boxes});
 check(g.documentWidth<=g.viewport.width+1,label+': desktop whole page fits viewport');
 check(g.boxes.primary.y>=0&&g.boxes.primary.bottom<=g.viewport.height+1,label+': primary action stays in viewport');
 check(g.boxes.guide.x>=g.boxes.panel.x-1&&g.boxes.guide.right<=g.boxes.panel.right+1,label+': guide fits the center panel');
 return g;
}
async function inspect(page,state,terms,name,{open=true}={}){
 await install(page,state);const before=await disk(page),guide=page.locator('.combat-tactics'),summary=page.locator('.combat-rules summary');
 const text=compact(await guide.innerText()),context=compact(await page.locator('.combat-tactics-heading>span').innerText());
 equal(await guide.getAttribute('data-tactic'),state.enemy.mechanic,name+': correct mechanism');equal(await guide.getAttribute('data-tactic-turn'),String(state.enemy.turns+1),name+': upcoming roll index');
 check(context.includes(`第 ${state.enemy.turns+1} 掷`)&&context.includes(`${E.diceCount(state)} 骰`),name+': current roll and actual dice count visible');
 for(const term of terms)check(text.includes(term),name+': '+term);
 if(state.enemy.type==='boss')check(context.includes(`阶段 ${state.enemy.stage} / 2`),name+': pre-roll boss stage visible');
 if(state.enemy.mechanic==='onslaught')check(context.includes(`第 ${state.enemy.wave} 波`),name+': exact current wave visible');
 const result={name,mechanic:state.enemy.mechanic,turns:state.enemy.turns,stage:state.enemy.stage,wave:state.enemy.wave,count:E.diceCount(state),fixtureSha256:sha(state),text,context,summary:compact(await summary.innerText()),impossible:await guide.locator('[data-tactic-possible="false"]').allTextContents()};
 if(open){
  result.closed=await geometry(page,name+' closed');await summary.focus();await page.keyboard.press('Enter');check(await page.locator('.combat-rules').evaluate(e=>e.open),name+': native Enter expands rules');
  result.rulesText=compact(await page.locator('.combat-rules').innerText());check(result.rulesText.includes(state.enemy.label),name+': original rule preserved when open');result.open=await geometry(page,name+' open');
 }
 equal(await disk(page),before,name+': inspection preserves all localStorage bytes');return result;
}
function malformedEnvelope(state){const payload=JSON.stringify(state);let h=2166136261;for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(h>>>0).toString(16),payload});}
async function upload(page,raw,name){const chooser=page.waitForEvent('filechooser');await page.locator('dialog [data-action="import"]').click();await(await chooser).setFiles({name,mimeType:'application/json',buffer:Buffer.from(raw)});}

try{
 await run('summary-native-keys',async page=>{
  const state=fixture('parity');await install(page,state);const before=await disk(page),summary=page.locator('.combat-rules summary');
  await page.evaluate(()=>{window.__summaryProbe={events:[],toasts:[],busy:[]};document.addEventListener('keydown',e=>window.__summaryProbe.events.push({key:e.key,code:e.code,target:e.target.tagName,prevented:e.defaultPrevented}));new MutationObserver(()=>window.__summaryProbe.toasts.push(document.querySelector('.toast')?.textContent)).observe(document.querySelector('.toast'),{childList:true,subtree:true,characterData:true});new MutationObserver(()=>window.__summaryProbe.busy.push(!!document.querySelector('#current-room.busy'))).observe(document.querySelector('#app'),{childList:true,subtree:true});});
  await summary.focus();await page.keyboard.press('Enter');check(await page.locator('.combat-rules').evaluate(e=>e.open),'Enter expands native details');equal(await disk(page),before,'Enter expansion is read-only');
  await page.keyboard.press('Tab');row.forward=await focus(page);check(row.forward.tag!=='BODY'&&!row.forward.summary,'Tab advances from summary to another native control');await page.keyboard.press('Shift+Tab');check((await focus(page)).summary,'Shift+Tab returns to summary');
  await page.keyboard.press('Enter');check(!(await page.locator('.combat-rules').evaluate(e=>e.open)),'Enter closes native details');
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('.combat-rules')?.open||document.querySelector('#current-room')?.classList.contains('busy')||document.querySelector('.game-shell')?.dataset.scene!=='combat');await idle(page);
  row.afterSpace={focus:await focus(page),state:S.decodeSave((await disk(page))[keys.main]),detailsOpen:await page.locator('.combat-rules').evaluateAll(es=>es[0]?.open??null)};
  equal(await disk(page),before,'Space on native rules summary never commits a combat roll');check(row.afterSpace.detailsOpen,'Space expands native details');check(row.afterSpace.focus.summary,'Space retains summary focus');
  await page.keyboard.press('Space');check(!(await page.locator('.combat-rules').evaluate(e=>e.open)),'second Space closes native details');equal(await disk(page),before,'all summary keys preserve every storage byte');
 });
 await run('mechanic-fixtures',async page=>{
  row.scenarios=[];await fs.mkdir(path.join(output,'fixtures'),{recursive:true});
  for(const mechanic of mechanics){const state=fixture(mechanic);await fs.writeFile(path.join(output,'fixtures',mechanic+'.save.json'),S.encodeSave(state)+'\n');row.scenarios.push(await inspect(page,state,baseExpected[mechanic],mechanic));}
  const bosses=row.scenarios.filter(s=>s.mechanic.startsWith('boss_')).sort((a,b)=>b.rulesText.length-a.rulesText.length);report.longestBoss={mechanic:bosses[0].mechanic,characters:bosses[0].rulesText.length,compared:bosses.map(s=>({mechanic:s.mechanic,characters:s.rulesText.length}))};
  const variants=[];
  for(let count=1;count<=6;count++)variants.push(['parity',{turns:1,count},[`${count} 骰中至少 ${Math.floor(count/2)+1} 颗偶点（2 / 4 / 6）`]]);
  for(const turns of [1,2,6,200])variants.push(['laststand',{turns},[turns===1?'反击 -25%':turns===2?'反击 +12%':'反击 +60%']]);
  for(const [mechanic,count,turns=0,stage=1] of [['sequence',2],['undertow',3],['hush',1],['archiveguard',3],['boss_prism',2],['boss_witness',2,1],['boss_thread',1],['boss_origin',3],['boss_eclipse',2,1],['abyssking',2,1,2],['boss_infinite',3],['boss_infinite',2,1,2]])variants.push([mechanic,{count,turns,stage},[`当前仅 ${count} 骰，无法达成此条件`]]);
  for(const turns of [1,2,3])variants.push(['bounty',{turns},[turns<3?`加赏窗口还剩 ${3-turns} 掷`:'三掷加赏窗口已过',turns<3?'本掷击破时金币 ×3':'金币恢复原倍率']]);
  for(const wave of [2,3])variants.push(['onslaught',{wave,count:2},[`当前为第 ${wave} 波`,`反击比首波高 ${(wave-1)*20}%`,'当前仅 2 骰，无法达成此条件']]);
  variants.push(['hourward',{turns:1},['当前为偶数回合','本击伤害 +35%']]);
  for(const [mechanic,extra,terms] of variants){const state=fixture(mechanic,extra),name=mechanic+'-'+Object.entries(extra).map(([k,v])=>k+v).join('-');const detail=await inspect(page,state,terms,name,{open:false});
   if(mechanic==='parity')check(detail.summary.includes('下一掷改为奇点占多数'),name+': next parity stays visible without expansion');
   if(mechanic==='laststand')check(detail.summary.includes(extra.turns===1?'下一掷：反击 +12%':extra.turns===2?'下一掷：反击 +24%':'下一掷：反击 +60%'),name+': exact next escalation visible');
   if(mechanic==='bounty'&&extra.turns===2)check(detail.summary.includes('这是获得三倍金币的最后一掷'),name+': final bounty opportunity remains visible');
   if(terms.some(term=>term.includes('无法达成')))check(detail.impossible.length>0,name+': impossible condition is also structurally marked');row.scenarios.push(detail);
  }
  check(new Set(row.scenarios.map(s=>s.mechanic)).size===16,'all 16 authored deep mechanics rendered');
 });
 await run('desktop-layouts',async page=>{
  row.scenarios=[];let longest=report.longestBoss?.mechanic;
  if(!longest){const candidates=[];for(const mechanic of mechanics.filter(m=>m.startsWith('boss_'))){await install(page,fixture(mechanic));await page.locator('.combat-rules summary').click();candidates.push({mechanic,characters:(await page.locator('.combat-rules').innerText()).length});}candidates.sort((a,b)=>b.characters-a.characters);longest=candidates[0].mechanic;report.longestBoss={...candidates[0],compared:candidates};}
  for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:2560,height:1440},{width:3840,height:2160}])for(const mechanic of ['parity',longest]){
   await page.setViewportSize(viewport);const state=fixture(mechanic);await install(page,state);const before=await disk(page),name=`${mechanic}-${viewport.width}x${viewport.height}`,result={name,viewport,closed:await geometry(page,name+' closed')};
   if(mechanic==='parity'&&[1366,1920].includes(viewport.width))await shot(page,name+'-closed');
   const summary=page.locator('.combat-rules summary');await summary.focus();await page.keyboard.press('Enter');check(await page.locator('.combat-rules').evaluate(e=>e.open),name+': Enter opens');result.open=await geometry(page,name+' open');
   if(mechanic===longest&&[1366,3840].includes(viewport.width))await shot(page,name+'-open');
   if(result.open.rules.scrollHeight>result.open.rules.clientHeight+1){const box=await page.locator('.combat-rules').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height*.8);await page.mouse.wheel(0,400);await page.waitForFunction(()=>document.querySelector('.combat-rules').scrollTop>0);result.afterWheel=await page.locator('.combat-rules').evaluate(e=>({scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}));check(result.afterWheel.scrollTop>0,name+': real wheel reaches overflowing rule text');}
   await summary.focus();await page.keyboard.press('Enter');check(!(await page.locator('.combat-rules').evaluate(e=>e.open)),name+': Enter closes after scroll');equal(await disk(page),before,name+': layout, expand and scroll are read-only');row.scenarios.push(result);
  }
 });
 await run('rules-native-scroll',async page=>{
  // The longest text by character count can fit without overflow. The extra
  // stage note makes this authored three-paragraph boss a real scroll case.
  const state=fixture('boss_infinite');await install(page,state);const before=await disk(page),summary=page.locator('.combat-rules summary');row.closed=await geometry(page,'scroll fixture closed');
  await summary.focus();await page.keyboard.press('Enter');row.open=await geometry(page,'scroll fixture open');check(row.open.rules.scrollHeight>row.open.rules.clientHeight,'authored rules genuinely overflow at 1366x768');
  const box=await page.locator('.combat-rules').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height*.8);await page.mouse.wheel(0,400);await page.waitForFunction(()=>document.querySelector('.combat-rules').scrollTop>0);row.scrolled=await geometry(page,'native scroll at bottom');check(row.scrolled.rules.scrollTop>0,'native wheel scrolls the rules body');check((await focus(page)).summary,'wheel leaves native summary focus intact');
  await page.mouse.wheel(0,-400);await page.waitForFunction(()=>document.querySelector('.combat-rules').scrollTop===0);check(await page.locator('.combat-rules').evaluate(e=>e.scrollTop===0),'reverse native wheel returns to the summary');
  await page.keyboard.press('Enter');check(!(await page.locator('.combat-rules').evaluate(e=>e.open)),'Enter still closes the scrollable native disclosure');equal(await disk(page),before,'native wheel and disclosure keys preserve all storage bytes');
 });
 await run('narrow-window',async page=>{
  await install(page,fixture('parity'));row.layout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyMinWidth:getComputedStyle(document.body).minWidth,shellWidth:document.querySelector('.game-shell').getBoundingClientRect().width}));
  check(row.layout.documentWidth>=900&&row.layout.documentWidth>row.layout.viewport,'existing 900px desktop minimum reproduced at 390px',row.layout);row.knownLimitation='Whole-page horizontal overflow at 390px is retained from the input project; no mobile support claim.';
 },{width:390,height:844});
 await run('typed-imports',async page=>{
  const prior=E.newGame(48017);prior.runId='readout-import-prior';await install(page,prior);await button(page,'settings').click();const before=await disk(page);row.imports=[];
  await page.evaluate(()=>{window.__readoutNotices=0;window.__readoutConfirmations=[];new MutationObserver(()=>{const title=document.querySelector('dialog[open] #dialog-title')?.textContent;if(title?.includes('导入这段旅途'))window.__readoutConfirmations.push(title);}).observe(document.querySelector('dialog'),{childList:true,subtree:true});new MutationObserver(()=>window.__readoutNotices++).observe(document.querySelector('.toast'),{childList:true,subtree:true,characterData:true});});
  for(const [label,talents] of [['array',[]],['boolean',true],['number',1]]){
   const invalid=structuredClone(prior);invalid.player.talents=talents;const raw=malformedEnvelope(invalid);check(!S.validateSave(invalid),'talents '+label+': current validator rejects');assert.throws(()=>S.decodeSave(raw));
   await fs.writeFile(path.join(output,'invalid-talents-'+label+'.json'),raw+'\n');const notices=await page.evaluate(()=>window.__readoutNotices);await upload(page,raw,'invalid-talents-'+label+'.json');await page.waitForFunction(before=>window.__readoutNotices>before,notices);await page.locator('.toast.visible').filter({hasText:'存档内容不完整或版本不兼容'}).waitFor();
   equal(await disk(page),before,'talents '+label+': all localStorage raw bytes unchanged');check(await page.getByRole('button',{name:'确认导入',exact:true}).count()===0,'talents '+label+': no confirmation is presented');equal(await page.evaluate(()=>window.__readoutConfirmations),[],'talents '+label+': no transient import confirmation');
   row.imports.push({label,talents,toast:await page.locator('.toast.visible').innerText(),rawSha256:sha(raw),diskSha256:sha(await disk(page))});if(label==='array')await shot(page,'talents-array-rejected');
  }
  const sparse=E.newGame(48018);sparse.runId='readout-sparse-talents';sparse.player.talents={};sparse.player.talentPoints=2;check(S.validateSave(sparse),'sparse object remains a legal save');const raw=S.encodeSave(sparse);await upload(page,raw,'legal-sparse-talents.json');await page.getByRole('button',{name:'确认导入',exact:true}).waitFor();equal(await disk(page),before,'legal sparse import waits for confirmation without writes');await page.getByRole('button',{name:'确认导入',exact:true}).click();await waitSave(page,sparse);await durable(page,sparse,'legal sparse object imported');
  await button(page,'talents').click();const expected=E.transition(sparse,{type:'talent',id:'power',count:1});await page.locator('[data-action="talent"][data-id="power"]').click();await waitSave(page,expected);await durable(page,expected,'native allocation persists the sparse object rank');check(expected.player.talents.power===1&&expected.player.talentPoints===1,'one real point purchased one rank');await page.reload();await button(page,'continue').click();await idle(page);await durable(page,expected,'reload preserves the purchased sparse-object rank');
 });
 await run('historical-factors',async page=>{
  const f=JSON.parse(await fs.readFile(path.join(source,'tests/fixtures/round08-history-actions.json'),'utf8'));let state=E.newGame(f.seed);state.runId='readout-natural-replay-'+f.seed;
  for(const action of f.actions){assert(E.canAct(state,action));state=E.transition(state,action);assert(S.validateSave(state));}
  check(f.actions.length===65,'replays the same existing 65-action natural path');check(state.floor===3&&state.roomIndex===1&&state.phase==='combat','same natural combat endpoint');equal(state.lastRoll.values,[5,6,4,5],'same historical dice');check(state.lastRoll.main===764&&state.lastRoll.extra===267&&state.lastRoll.total===1031,'same historical damage totals');check(state.lastRoll.criticalMultiplier===1.8&&state.lastRoll.followMultiplier===.35,'new snapshot records the actual 1.8 / 35% factors');
  await fs.writeFile(path.join(output,'natural-65-current.save.json'),S.encodeSave(state)+'\n');await install(page,state);
  const labels=async()=>({critical:await page.locator('.critical-tag').innerText(),follow:await page.locator('.follow-tag').innerText(),history:await page.locator('.hit-history').innerText(),main:await page.locator('.hit-primary b').innerText(),extra:await page.locator('.hit-follow b').innerText(),total:await page.locator('.damage-number>strong').innerText()});
  row.before=await labels();equal(row.before.critical,'暴击 ×1.8','historical critical label reflects the saved factor');equal(row.before.follow,'连锁追击 +35%','historical follow label reflects the saved factor');check(row.before.history.includes('第 1 掷结算'),'history identified as the completed roll');const original=structuredClone(state);
  await button(page,'talents').click();await page.locator('.destiny-branch-title[data-action="talent-group"][data-id="critical"]').click();
  for(const id of ['crush','pursuit']){state=E.transition(state,{type:'talent',id,count:1});await page.locator(`[data-action="talent"][data-id="${id}"]`).click();await waitSave(page,state);await durable(page,state,'native '+id+' allocation');}
  check(E.talent(state,'crush')===E.talent(original,'crush')+1&&E.talent(state,'pursuit')===E.talent(original,'pursuit')+1,'both real ranks were bought');equal(state.lastRoll,original.lastRoll,'new talents leave the entire previous roll unchanged');check(state.rng===original.rng,'allocations do not draw RNG');await page.locator('#primary-action[data-action="game"]').click();await idle(page);row.after=await labels();equal(row.after,row.before,'new talents do not retroactively relabel historical factors or damage');await shot(page,'history-after-real-talents');
  await page.reload();await button(page,'continue').click();await idle(page);equal(await labels(),row.before,'reload retains historical labels');await durable(page,state,'history save reload');
  const legacy=structuredClone(original);delete legacy.lastRoll.criticalMultiplier;delete legacy.lastRoll.followMultiplier;check(S.validateSave(legacy),'old result without factor fields remains accepted');await fs.writeFile(path.join(output,'natural-65-legacy-fields.save.json'),S.encodeSave(legacy)+'\n');await install(page,legacy);const before=await disk(page);row.legacy=await labels();equal(row.legacy.critical,'暴击','old result does not invent a critical factor');equal(row.legacy.follow,'连锁追击','old result does not invent a follow factor');equal(await disk(page),before,'viewing old result does not backfill factor fields');
 });
}finally{
 report.sourceAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sourceAfter)===JSON.stringify(report.sourceBefore);report.finished=new Date().toISOString();report.checks=report.cases.reduce((n,c)=>n+c.checks.length,0);report.passed=report.cases.length>0&&report.cases.every(c=>c.status==='PASS')&&report.errors.length===0&&report.sourceStable;
 await browser.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,cases:report.cases.map(({name,status})=>({name,status})),sourceStable:report.sourceStable,errors:report.errors}));if(!report.passed)process.exitCode=1;
