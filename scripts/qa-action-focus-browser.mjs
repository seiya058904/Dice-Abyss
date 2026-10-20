// Native Round08 keyboard continuity QA, with controlled presentation/lifecycle
// interference. Supply external PLAYWRIGHT_MODULE and CHROMIUM_PATH dependencies.
// node scripts/qa-action-focus-browser.mjs --source /path/to/Dice-Abyss
//   --url http://127.0.0.1:4289/ --output /tmp/action-focus-attempt-01
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const {values:args}=parseArgs({options:{source:{type:'string'},url:{type:'string'},output:{type:'string'}}});
const source=path.resolve(args.source||fileURLToPath(new URL('../',import.meta.url)));
assert(args.url&&args.output,'Pass --url and an explicit --output directory.');
const url=new URL(args.url).href,out=path.resolve(args.output),relative=path.relative(source,out);
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only loopback test origins.');
assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Keep generated QA evidence outside the source project.');
await fs.mkdir(out,{recursive:true});
await assert.rejects(fs.access(path.join(out,'action-focus.json')),'Use a fresh output directory to preserve previous attempts.');
const E=await import(pathToFileURL(source+'/src/engine.js')),S=await import(pathToFileURL(source+'/src/storage.js'));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=['src/app.js','src/action-focus.js','src/engine.js','src/views.js','src/storage.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await fs.readFile(source+'/'+file))])));
const report={source,url,started:new Date().toISOString(),scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore:await sourceHashes(),cases:[],errors:[],notes:[
 'Browser connector and CUA could not reach this loopback server (ERR_CONNECTION_REFUSED); using the user-authorized local Playwright fallback.',
 'All game actions run through the real app handlers, native localStorage and Web Locks with validator-accepted synthetic starting states.',
 'The two continuity groups use native Playwright Enter/Space. Timing-sensitive interference groups arm a MutationObserver that performs a DOM focus/click at the first busy render; no game method or timer is patched.',
 'Visibility is a clearly labeled document-property/event injection, not actual OS suspension. Main-save failure injects one native setItem rejection before committing.',
 'The run uses 1366x768 / Chrome software rendering / low effects / reduced motion; no timing, FPS or physical accessibility claim.'
]};
await fs.mkdir(out,{recursive:true});
let s=E.transition(E.transition(E.newGame(913),{type:'fate'}),{type:'enter'});s.runId='round08-focus-913';s.enemy.hp=1;s.enemy.shield=0;assert(S.validateSave(s));
await fs.writeFile(out+'/combat-start.json',S.encodeSave(s)+'\n');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let row;
const check=(value,label)=>{row.checks.push({label,passed:!!value});assert(value,label)};
const equal=(a,b,label)=>{const result={label,passed:false};row.checks.push(result);assert.deepEqual(a,b,label);result.passed=true};
const focus=page=>page.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id,action:document.activeElement?.dataset.action,inDialog:!!document.activeElement?.closest('dialog[open]')}));
const state=async page=>S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY));
const settled=async page=>page.locator('#primary-action:not(:disabled)').waitFor({timeout:15000});
async function verifyState(page,expected,label){equal(await state(page),expected,label+': complete decoded state');check(await page.evaluate(({main,mirror})=>localStorage.getItem(main)===localStorage.getItem(mirror),{main:S.SAVE_KEY,mirror:S.BACKUP_KEY}),label+': exact native mirror');}
async function prepare(initial=s){
 const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),page=await context.newPage();
 page.setDefaultTimeout(15000);
 await context.route('**/*',route=>route.request().url().startsWith(new URL(url).origin+'/')?route.continue():route.abort());
 page.on('pageerror',e=>{const error={case:row.name,message:e.message};report.errors.push(error);row.errors.push(error)});
 page.on('console',e=>{if(e.type()==='error'){const error={case:row.name,message:e.text()};report.errors.push(error);row.errors.push(error)}});
 await page.goto(url);await page.evaluate(({raw,main,mirror,settings})=>{localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}))},{raw:S.encodeSave(initial),main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await page.locator('[data-action="continue"]').click();await settled(page);
 if(!report.page){
  report.page={title:await page.title(),url:page.url(),viewport:page.viewportSize(),text:(await page.locator('#app').innerText()).slice(0,180)};check(report.page.title.includes('Dice Abyss'),'correct page title');check(report.page.text.length>30,'meaningful nonblank game surface');
  report.servedHashes={};for(const file of files){const response=await context.request.get(new URL(file,url).href);assert(response.ok(),file+' served');report.servedHashes[file]=hash(await response.body());}assert.deepEqual(report.servedHashes,report.sourceBefore,'Served runtime must match the selected source');
 }
 return {context,page};
}
async function arm(page,kind){
 await page.evaluate(kind=>{
  window.__focusInterference={kind,ran:false};
  const observer=new MutationObserver(()=>{
   if(!document.querySelector('#primary-action:disabled'))return;
   observer.disconnect();window.__focusInterference.ran=true;
   if(kind==='focus')document.querySelector('[data-action="settings"]').focus();
   if(kind==='skip'){const b=document.querySelector('[data-action="skip"]');b.focus();b.click();}
   if(kind==='dialog')document.querySelector('[data-action="settings"]').click();
   if(kind==='hidden'){Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));}
  });observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
 },kind);
}
async function run(name,fn,initial=s){
 row={name,status:'RUNNING',checks:[],errors:[]};report.cases.push(row);let env;
 try{env=await prepare(initial);await fn(env.page,env.context);equal(row.errors,[],'no runtime/console errors');row.status='PASS'}
 catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;if(env)await env.page.screenshot({path:out+'/'+name+'-FAIL.png'}).catch(()=>{})}
 finally{if(env)await env.context.close();await fs.writeFile(out+'/action-focus.json',JSON.stringify(report,null,2)+'\n')}
}
try{
 await run('enter-roll-chest-open-loot',async page=>{
  await page.locator('#primary-action').focus();row.before=await focus(page);await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.game-shell')?.dataset.scene==='chest');await settled(page);
  const chest=E.transition(s,{type:'roll'});await verifyState(page,chest,'keyboard roll');row.afterRoll=await focus(page);equal(row.afterRoll.id,'primary-action','chest action receives previous primary focus');
  await page.screenshot({path:out+'/keyboard-chest.png'});await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.game-shell')?.dataset.scene==='loot');await settled(page);const loot=E.transition(chest,{type:'open'});await verifyState(page,loot,'keyboard open');row.afterOpen=await focus(page);equal(row.afterOpen.id,'primary-action','loot action retains focus');
  await page.keyboard.press('Enter');await settled(page);await verifyState(page,E.transition(loot,{type:'next'}),'keyboard next');
 });
 const fate=E.newGame(428);fate.runId='round08-focus-fate';
 await run('space-fate-route-enter',async page=>{
  await page.locator('#primary-action').focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('.game-shell')?.dataset.scene==='route');await settled(page);const route=E.transition(fate,{type:'fate'});await verifyState(page,route,'Space fate');equal((await focus(page)).id,'primary-action','route action receives focus');
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('.game-shell')?.dataset.scene==='combat');await settled(page);await verifyState(page,E.transition(route,{type:'enter'}),'Space enter');
 },fate);
 for(const kind of ['focus','skip','dialog','hidden'])await run('during-reveal-'+kind,async page=>{
  await arm(page,kind);await page.locator('#primary-action').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__focusInterference?.ran);await settled(page);
  row.interference=await page.evaluate(()=>window.__focusInterference);await verifyState(page,E.transition(s,{type:'roll'}),'interfered one-roll result');row.after=await focus(page);
  if(kind==='focus')equal(row.after.action,'settings','intentional move to settings is preserved');
  else if(kind==='dialog'){check(row.after.inDialog,'open dialog keeps focus');await page.screenshot({path:out+'/dialog-keeps-focus.png'})}
  else equal(row.after.id,'primary-action','settled presentation returns its original primary focus');
 });
 await run('primary-save-failure',async page=>{
  const raw=await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY);
  await page.evaluate(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key){Storage.prototype.setItem=set;throw new DOMException('Focus QA write rejection','QuotaExceededError')}return set.call(this,name,value)}},S.SAVE_KEY);
  await page.locator('#primary-action').focus();await page.keyboard.press('Enter');await page.locator('.toast.visible').waitFor();await settled(page);
  equal(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY),raw,'failed primary save preserves exact original raw');await verifyState(page,s,'failed transaction');equal((await focus(page)).id,'primary-action','failed save keeps the actionable origin');row.notice=await page.locator('.toast').innerText();
 });
 await run('body-shortcut-scope-unchanged',async page=>{
  await page.locator('#primary-action').focus();await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('.game-shell')?.dataset.scene==='chest');await settled(page);await verifyState(page,E.transition(s,{type:'roll'}),'existing BODY combat shortcut');equal((await focus(page)).tag,'BODY','no new focus policy for a BODY-origin shortcut');
 });
}finally{
 await browser.close();report.sourceAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.finished=new Date().toISOString();report.summary={groups:report.cases.length,passed:report.cases.filter(r=>r.status==='PASS').length,failed:report.cases.filter(r=>r.status==='FAIL').length,checks:report.cases.reduce((n,r)=>n+r.checks.length,0),errors:report.errors.length};
 await fs.writeFile(out+'/action-focus.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,sourceStable:report.sourceStable,failed:report.cases.filter(r=>r.status==='FAIL').map(({name,error})=>({name,error})),out},null,2));
}
if(report.summary.failed||report.errors.length||!report.sourceStable)process.exitCode=1;
