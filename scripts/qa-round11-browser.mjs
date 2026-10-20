// Real Chromium interactions with disposable saves; no browser is a runtime dependency.
// PLAYWRIGHT_MODULE=/path/playwright CHROMIUM_PATH=/path/chrome node scripts/qa-round11-browser.mjs
//   --url=http://127.0.0.1:4188/ --output=/tmp/round11-browser [--case=name] [--baseline]
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,true]:[a.slice(0,i),a.slice(i+1)];}));
const root=path.resolve(args['--source']||new URL('..',import.meta.url).pathname);
const E=await import(pathToFileURL(path.join(root,'src/engine.js')));
const S=await import(pathToFileURL(path.join(root,'src/storage.js')));
const C=await import(pathToFileURL(path.join(root,'src/encounters.js')));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=args['--url']||'http://127.0.0.1:4188/',out=path.resolve(args['--output']||'/tmp/dice-round11-browser');
const baseline=!!args['--baseline'];
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const report={browser:browser.version(),url,baseline,synthetic:true,started:new Date().toISOString(),cases:[],geometry:[],errors:[],notes:['Synthetic save fixtures are explicitly separate from the native new-game journey.','Viewport checks do not certify a physical phone, physical GPU, screen reader or browser zoom.','Baseline mode records known narrow/focus defects without declaring them fixed.']};
const identityFiles=['index.html','package.json','src/app.js','src/views.js','src/responsive.css','src/settings-focus.js','src/engine.js','src/storage.js'];
async function sourceIdentity(){return Object.fromEntries(await Promise.all(identityFiles.map(async file=>[file,await fs.readFile(path.join(root,file),'utf8').then(sha).catch(error=>{if(error.code==='ENOENT')return null;throw error;})])));}
report.sourceBefore=await sourceIdentity();report.sourceVersion=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
let checks=0,trace=[];
const check=(v,label)=>{checks++;trace.push({label,pass:!!v});assert(v,label);};
const eq=(a,b,label)=>{checks++;const same=isDeepStrictEqual(a,b);trace.push({label,pass:same,actualHash:sha(a),expectedHash:sha(b)});assert.deepEqual(a,b,label);};
const saved=async p=>S.decodeSave(await p.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY));
const active=p=>p.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id,action:document.activeElement?.dataset?.action}));
const idle=p=>p.locator('#primary-action:not(:disabled)').waitFor();
async function environment(width=390,height=844){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(url);assert.equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),report.sourceVersion,'Served release matches declared source');await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({effects:'low',sound:false,scale:1})),S.SETTINGS_KEY);await page.reload();
 return{context,page};
}
async function load(p,s){
 check(S.validateSave(s),'fixture is a valid schema5 save');
 await p.evaluate(({raw,main,backup})=>{localStorage.setItem(main,raw);localStorage.setItem(backup,raw);},{raw:S.encodeSave(s),main:S.SAVE_KEY,backup:S.BACKUP_KEY});
 await p.reload();await p.locator('[data-action="continue"]').click();await idle(p);await p.evaluate(()=>document.fonts.ready);
}
function room(type,{floor=140,seed=731,level=60}={}){
 let s=E.newGame(seed);s.runId=`round11-browser-${type}-${seed}`;s.floor=floor;s.player.level=level;s.player.gold=250000;s.player.talentPoints=30;s.fate=[3,4];s.phase='route';
 s.route=[type,'combat','forge','combat','gold',floor%5===0?'boss':'elite'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));s.player.hp=E.stats(s).maxHp;
 return E.transition(s,{type:'enter'});
}
function collection(){const s=room('combat');for(let i=0;i<48;i++)s.player.items.push(E.makeItem(s,['weapon','armor','relic'][i%3],i%8));s.player.items.at(-1).name='回响长名'.repeat(16);s.player.items.at(-1).locked=true;return s;}
function reward(rarity){let s=room('combat');s.enemy.hp=1;s.enemy.shield=0;s=E.transition(s,{type:'roll'});s.chest.item=E.makeItem(s,['weapon','armor','relic'][rarity%3],rarity);return s;}
async function metrics(p,name,{primary=false}={}){
 const data=await p.evaluate(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scrollX,scrollY,primary:rect(document.querySelector('#primary-action')),center:rect(document.querySelector('#current-room')),dialog:document.querySelector('dialog').open?rect(document.querySelector('dialog')):null};});
 report.geometry.push({name,...data});
 if(!baseline){check(data.scrollWidth<=data.width+1,`${name}: page fits width`);check(Math.abs(data.scrollX)<1,`${name}: no horizontal offset`);
  if(primary){const r=data.primary;check(r&&r.x>=0&&r.right<=data.width+1&&r.y>=0&&r.bottom<=data.height+1,`${name}: primary action fits viewport`);}
 }
 return data;
}
async function hit(p,locator,label){
 await locator.scrollIntoViewIfNeeded();const result=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{fits:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1&&y>=0&&y<innerHeight,hit:e.contains(document.elementFromPoint(x,y))};});
 check(result.fits,`${label}: visible within the viewport`);check(result.hit,`${label}: not covered by another panel`);
}
async function action(p,type,locator=p.locator('#primary-action'),rest={}){
 const before=await saved(p),expected=E.transition(before,{type,...rest});check(expected!==before,`${type}: action is enabled by actual rules`);
 await hit(p,locator,type);await locator.click();
 if(rest.confirmed){const confirm=p.locator('dialog[open] [data-action="confirm"]');await confirm.waitFor();await hit(p,confirm,type+' confirmation');await confirm.click();}
 await p.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:expected.revision});await idle(p);
 eq(await saved(p),expected,`${type}: one exact durable engine transaction`);
}
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png')});}
async function run(name,fn,width=390,height=844){
 if(args['--case']&&args['--case']!==name)return;
 const env=await environment(width,height),start=performance.now(),before=checks;trace=[];
 try{await fn(env);report.cases.push({name,status:'PASS',checks:checks-before,ms:performance.now()-start,trace});}
 catch(error){report.cases.push({name,status:'FAIL',checks:checks-before,ms:performance.now()-start,error:error.stack,trace});await shot(env.page,'FAIL-'+name).catch(()=>{});}
 finally{await env.context.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(name+': '+report.cases.at(-1).status);
}
try{
 await run('viewport-matrix',async({page})=>{
  const widths=[[320,740],[390,844],[768,1024],[900,768],[1099,768],[1366,768],[1920,1080],[2560,1440],[3840,2160]];
  for(const [width,height]of widths){await page.setViewportSize({width,height});await page.reload();await page.evaluate(()=>document.fonts.ready);await metrics(page,`title-${width}`);await hit(page,page.locator('.title-primary'),`title ${width} start`);}
  const s=collection();await load(page,s);
  for(const [width,height]of widths){await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await metrics(page,`combat-${width}`,{primary:true});await hit(page,page.locator('#primary-action'),`combat ${width}`);}
  if(!report.renderer)report.renderer=await page.evaluate(()=>{const canvas=document.querySelector('.dice-surface'),gl=canvas?.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
 });
 await run('native-new-game-combat-reward-refresh',async({page})=>{
  await page.locator('[data-action="new"]').click();await idle(page);check((await saved(page)).phase==='fate','fresh run requires manual fate');
  await metrics(page,'native-fate',{primary:true});await action(page,'fate');await action(page,'enter');
  for(let i=0;i<30&&(await saved(page)).phase==='combat';i++)await action(page,'roll');
  check((await saved(page)).phase==='chest','natural first battle reaches a pending chest');await metrics(page,'native-chest',{primary:true});await action(page,'open');
  check((await saved(page)).phase==='loot','loot opens once');const before=await saved(page);await page.reload();await page.locator('[data-action="continue"]').click();eq(await saved(page),before,'refresh preserves the exact opened reward');
  await metrics(page,'native-loot',{primary:true});await action(page,'next');await shot(page,'native-route-390');
 });
 await run('collections-and-bottom-navigation',async({page})=>{
  await load(page,collection());const initial=await saved(page);
  for(const view of ['inventory','talents','codex','game']){
   const selector=view==='game'?'.manual-control [data-action="game"]':view==='codex'?'.header-actions [data-action="codex"]':`.main-nav [data-action="${view}"]`;
   await hit(page,page.locator(selector),view);await page.locator(selector).click();await metrics(page,view+'-390',{primary:true});
   eq(await saved(page),initial,view+' navigation never changes the saved journey');
   if(view==='inventory'){await page.locator('#inventory-sort').selectOption('level');await metrics(page,'inventory-sorted-390',{primary:true});await shot(page,'inventory-390');}
   if(view==='talents')await hit(page,page.locator('[data-action="talent"]:not(:disabled)').first(),'talent panel');
  }
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));check(await page.evaluate(()=>scrollY>500),'rail is reached by natural page scrolling');
  await page.locator('.main-nav [data-action="inventory"]').click();
  if(!baseline)check(await page.evaluate(()=>scrollY===0),'new view returns to its beginning');
  await metrics(page,'inventory-from-bottom',{primary:true});
 });
 await run('merchant-forge-event-choices',async({page})=>{
  let s=room('merchant');await load(page,s);const offer=s.shop.find(o=>o.item&&!o.sold&&o.price<=s.player.gold);check(!!offer,'merchant offers an affordable registered item');
  await metrics(page,'merchant-390',{primary:true});await action(page,'buy',page.locator(`[data-action="buy"][data-id="${offer.id}"]`),{id:offer.id});await action(page,'next');
  s=room('forge');await load(page,s);await metrics(page,'forge-390',{primary:true});await action(page,'forge',page.locator('[data-action="forge"]'),{id:s.player.equipped.weapon});await shot(page,'forge-390');
  s=room('starlibrary');await load(page,s);const choice=C.eventChoices(s).find(o=>!o.disabled&&o.id==='study');check(!!choice,'registered study is affordable');
  await metrics(page,'event-390',{primary:true});await action(page,'event-choice',page.locator(`[data-action="event-choice"][data-id="${choice.id}"]`),{id:choice.id,confirmed:!!choice.confirm});await metrics(page,'event-outcome-390',{primary:true});
 });
 await run('fusion-selection-confirmation',async({page})=>{
  const s=room('fusion');const target=s.player.items.find(i=>i.id===s.player.equipped.weapon);target.level=12;
  for(let i=0;i<3;i++){const item=E.makeItem(s,'weapon',0);item.level=4;s.player.items.push(item);}s.player.items.at(-1).locked=true;await load(page,s);
  await metrics(page,'fusion-390');const t=page.locator(`[data-fusion-item="${target.id}"]`);await hit(page,t,'fusion target');await t.click();
  const material=s.player.items.at(-1);await page.locator('#fusion-search').fill(material.id);const card=page.locator(`[data-fusion-item="${material.id}"]`);await hit(page,card,'fusion material');await card.click();
  await metrics(page,'fusion-selected-390');await shot(page,'fusion-390');
  const button=page.locator('[data-action="fusion-preview"]');await hit(page,button,'fusion review');await button.click();
  await page.locator('dialog[open]').waitFor();await metrics(page,'fusion-dialog-390');const raw=await saved(page);eq(raw,s,'reviewing protected fusion consumes nothing');await page.keyboard.press('Escape');eq(await saved(page),raw,'cancelled fusion consumes nothing');
  await action(page,'fuse',button,{targets:[target.id],materials:[material.id],allowProtected:true,confirmed:true});
  check(!(await saved(page)).player.items.some(item=>item.id===material.id),'confirmed material is consumed once');
  const remaining=s.player.items.at(-2),remainingCard=page.locator(`[data-fusion-item="${remaining.id}"]`);
  await page.locator('#fusion-search').fill(remaining.id);await remainingCard.scrollIntoViewIfNeeded();await remainingCard.click({button:'right'});
  const lock=page.locator('.fusion-context-menu [data-action="fusion-lock"]');await hit(page,lock,'fusion item lock');const y=await page.evaluate(()=>scrollY);check(y>100,'fusion transaction begins in a scrolled workbench');
  await action(page,'lock',lock,{id:remaining.id});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(!baseline)check(Math.abs(await page.evaluate(()=>scrollY)-y)<2,'in-room fusion lock preserves workbench page position');
 });
 await run('all-eight-reward-grades',async({page})=>{
  for(let rarity=0;rarity<8;rarity++){await load(page,reward(rarity));await metrics(page,`chest-grade-${rarity}`,{primary:true});await action(page,'open');await metrics(page,`loot-grade-${rarity}`,{primary:true});check((await saved(page)).loot.item.rarity===rarity,'issued grade remains exact');}
 });
 await run('settings-keyboard-persistence-and-failure',async({page})=>{
  await load(page,collection());const original=await saved(page);
  await page.locator('[data-action="settings"]').click();await metrics(page,'settings-390');
  await page.locator('[data-action="sound"]').focus();
  await page.evaluate(()=>{window.__qaScene=document.querySelector('#current-room');window.__qaSwitch=document.querySelector('[data-action="sound"]');});
  await page.keyboard.press('Space');
  if(!baseline){check((await active(page)).action==='sound','Space leaves keyboard focus on the switch');check(await page.evaluate(()=>window.__qaScene===document.querySelector('#current-room')&&window.__qaSwitch===document.querySelector('[data-action="sound"]')),'sound toggle preserves scene and switch node identities');}
  check(await page.locator('[data-action="sound"]').getAttribute('aria-checked')==='true','sound switch reflects the new value');
  await page.keyboard.press('Space');if(!baseline)check(await page.locator('[data-action="sound"]').getAttribute('aria-checked')==='false','second Space toggles the same switch back');
  await page.locator('#ui-scale').focus();await page.locator('#ui-scale').selectOption('1.1');await metrics(page,'settings-110-percent');
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});if(!baseline)check((await active(page)).action==='settings','Escape returns to the current settings opener after redraw');
  eq(await saved(page),original,'settings and focus never change game state');await metrics(page,'combat-110-percent',{primary:true});
  const storedSettings=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),S.SETTINGS_KEY);eq(storedSettings,{effects:'low',sound:false,scale:1.1},'settings are written under the actual settings key');
  await page.reload();await page.locator('[data-action="continue"]').click();await idle(page);await page.locator('[data-action="settings"]').click();
  check(await page.locator('#ui-scale').inputValue()==='1.1'&&await page.locator('#effects').inputValue()==='low'&&await page.locator('[data-action="sound"]').getAttribute('aria-checked')==='false','refresh restores persisted scale, effects and sound');
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});eq(await saved(page),original,'refresh after settings preserves the journey');
  await page.locator('[data-action="settings"]').click();await page.locator('#ui-scale').selectOption('0.9');await page.locator('#effects').selectOption('low');
  await page.locator('[data-action="sound"]').focus();
  const beforeFault=await page.evaluate(k=>localStorage.getItem(k),S.SETTINGS_KEY);
  await page.evaluate(k=>{window.__qaSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===k)throw new DOMException('Synthetic settings quota','QuotaExceededError');return window.__qaSet.call(this,key,value);};},S.SETTINGS_KEY);
  await page.keyboard.press('Space');check((await page.locator('.dialog-notice').innerText()).includes('本次会话内仍然生效'),'settings write failure stays visible in the same modal');
  if(!baseline)check((await active(page)).action==='sound','write failure retains switch focus');await page.evaluate(()=>Storage.prototype.setItem=window.__qaSet);
  eq(await page.evaluate(k=>localStorage.getItem(k),S.SETTINGS_KEY),beforeFault,'failed settings write leaves the previous persistent settings intact');
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});eq(await saved(page),original,'settings write fault leaves game save intact');
 });
 await run('settings-export-import-cancel',async({page})=>{
  await load(page,collection());await page.locator('[data-action="settings"]').click();const raw=await saved(page);
  const downloadPromise=page.waitForEvent('download');await hit(page,page.locator('[data-action="export"]'),'save export');await page.locator('[data-action="export"]').click();const download=await downloadPromise;
  const bytes=await fs.readFile(await download.path(),'utf8');eq(S.decodeSave(bytes),raw,'export contains exact valid current state');
  await page.locator('#save-file').setInputFiles({name:'round11-test-save.json',mimeType:'application/json',buffer:Buffer.from(bytes)});await page.locator('[data-action="confirm"]').waitFor();
  await metrics(page,'import-confirmation-390');await page.keyboard.press('Escape');eq(await saved(page),raw,'cancelled import preserves exact current state');
 });
}finally{report.sourceAfter=await sourceIdentity();report.sourceStable=JSON.stringify(report.sourceAfter)===JSON.stringify(report.sourceBefore);report.checks=checks;report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks,passes:report.cases.filter(c=>c.status==='PASS').length,failures:report.cases.filter(c=>c.status!=='PASS').map(c=>({name:c.name,error:c.error})),errors:report.errors},null,2));
if(!report.cases.length){console.error('No cases ran; check --case spelling.');process.exitCode=1;}
if(!report.sourceStable||report.errors.length||report.cases.some(c=>c.status!=='PASS'))process.exitCode=1;
