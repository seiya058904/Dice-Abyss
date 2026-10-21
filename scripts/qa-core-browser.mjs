// Independent regression of the unchanged gameplay paths affected by app.render.
// External QA browser and synthetic local saves only; no runtime dependencies.
// Replay with PLAYWRIGHT_MODULE=/path/to/playwright and CHROMIUM_PATH=/path/to/chrome:
// node scripts/qa-core-browser.mjs --url=http://127.0.0.1:4188/ --output=/tmp/core-qa
// Optional --case=<name> reruns one remaining risk without repeating passed cases.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
const output=path.resolve(options['--output']||process.env.QA_CORE_OUTPUT||'/tmp/dice-abyss-core-qa');
const url=options['--url']||process.env.QA_BASE_URL||'http://127.0.0.1:4188/';
const only=options['--case']||process.env.QA_CORE_CASE;
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:options['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={synthetic:true,source:'Independent non-fusion real-browser regression against current app integration',url,notes:['Only isolated synthetic local saves are used.','Reduced motion keeps functional checks short; full/low tests verify preference and save behavior, not animation performance.','State hashes summarize exact deep-equality assertions against the real engine transition.'],browser:browser.version(),started:new Date().toISOString(),cases:[],errors:[]};
let checks=0,currentTrace=[];
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const recorded=value=>value?.runId&&value?.player?{runId:value.runId,revision:value.revision,phase:value.phase,rng:value.rng,gold:value.player.gold,itemCount:value.player.items.length,stateSha256:sha(value)}:Array.isArray(value)?value.map(recorded):typeof value==='string'&&value.length>500?{bytes:Buffer.byteLength(value),sha256:sha(value)}:value;
const check=(condition,label)=>{checks++;currentTrace.push({label,passed:!!condition});assert(condition,label);};
const eq=(a,b,label)=>{checks++;const trace={label,actual:recorded(a),expected:recorded(b)};currentTrace.push(trace);assert.deepEqual(a,b,label);trace.passed=true;};
const button=(p,action)=>p.locator(`[data-action="${action}"]`),saved=async p=>S.decodeSave(await p.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY));
const waitRevision=(p,revision)=>p.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload)?.revision===revision,{key:S.SAVE_KEY,revision});
const idle=p=>p.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
async function create(){const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});if(options['--no-web-locks'])await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(String(error)));return{context,page};}
async function load(page,state){assert(S.validateSave(state));await page.goto(url);await page.evaluate(({raw,save,backup,settings})=>{localStorage.setItem(save,raw);localStorage.setItem(backup,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{raw:S.encodeSave(state),save:S.SAVE_KEY,backup:S.BACKUP_KEY,settings:S.SETTINGS_KEY});await page.reload();await button(page,'continue').click();await idle(page);}
async function screenshot(page,name){await page.screenshot({path:`${output}/${name}.png`});}
async function run(name,fn){if(only&&only!==name)return;currentTrace=[];const env=await create(),start=performance.now(),before=checks;try{await fn(env);report.cases.push({name,status:'PASS',checks:checks-before,trace:currentTrace,ms:performance.now()-start});}catch(error){report.cases.push({name,status:'FAIL',checks:checks-before,trace:currentTrace,ms:performance.now()-start,error:String(error),stack:error.stack});await screenshot(env.page,`FAIL-${name}`).catch(()=>{});}finally{await env.context.close();await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}console.log(`${name}: ${report.cases.at(-1).status}`);}
function combat(){let state=E.newGame(913);state=E.transition(state,{type:'fate'});state.route[0].type='combat';state=E.transition(state,{type:'enter'});state.enemy.hp=1;state.enemy.shield=0;assert.equal(E.transition(state,{type:'roll'}).phase,'chest');assert(S.validateSave(state));return state;}
try{
 await run('denied-storage-getter-recovery',async({context,page})=>{
  // Fault-inject the platform's permitted SecurityError at property access,
  // rather than only replacing getItem/setItem on an accessible Storage.
  await context.addInitScript(()=>{
   const storage=localStorage;
   window.__denyStorage=true;
   Object.defineProperty(window,'localStorage',{configurable:true,get(){if(window.__denyStorage)throw new DOMException('Synthetic storage policy denial','SecurityError');return storage;}});
   window.__qaStorageRecords=()=>[storage.getItem('dice-abyss:save:v1'),storage.getItem('dice-abyss:mirror:v1')];
   window.__qaQueuedStorageEvent=()=>window.dispatchEvent(new StorageEvent('storage',{key:'dice-abyss:save:v1',storageArea:storage}));
  });
  await page.goto(url);
  const start=page.locator('#app [data-action="new"]');
  check(await start.isVisible(),'denied getter still renders the title');
  check((await page.locator('.error-note').innerText()).includes('无法读取存档'),'read failure is visible');
  await button(page,'settings').click();
  check(await page.locator('dialog[open]').isVisible(),'settings remain reachable without storage');
  await button(page,'close-dialog').click();
  await start.click();await button(page,'confirm').click();
  await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('浏览器无法保存进度'));
  check(await start.isVisible(),'failed primary write never presents a started run');
  eq(await page.evaluate(()=>window.__qaStorageRecords()),[null,null],'denied new game writes neither save');
  await screenshot(page,'storage-denied-title');
  await page.evaluate(()=>{window.__denyStorage=false;});
  await start.click();await button(page,'confirm').click();await idle(page);
  const before=await saved(page),raw=await page.evaluate(()=>window.__qaStorageRecords());
  check(S.validateSave(before),'restored permission allows a durable new game');
  await page.evaluate(()=>{window.__denyStorage=true;window.__qaQueuedStorageEvent();});
  await page.locator('[data-save-recovery="unreadable"]').waitFor();
  check(await button(page,'export').isVisible(),'queued event after denial preserves an exportable memory copy');
  eq(await page.evaluate(()=>window.__qaStorageRecords()),raw,'denial and recovery UI leave original bytes intact');
  await screenshot(page,'storage-denied-recovery');
  await page.evaluate(()=>{window.__denyStorage=false;});await button(page,'recovery-check').click();
  await button(page,'recovery-load').click();await button(page,'confirm').click();await idle(page);
  eq(await saved(page),before,'explicit recovery resumes the same committed run after permission returns');
  eq(await page.evaluate(()=>window.__qaStorageRecords()),raw,'read recovery neither rewrites nor awards progress');
 });
 await run('title-new-manual-fate-continue',async({page})=>{
  await page.goto(url);check(await button(page,'new').isVisible(),'empty storage presents a real new-game action');await screenshot(page,'title');await button(page,'new').click();await page.waitForFunction(key=>!!localStorage.getItem(key),S.SAVE_KEY);await idle(page);
  const initial=await saved(page);check(S.validateSave(initial),'new game is valid and durable');eq(initial.phase,'fate','new game waits for manual fate');
  await page.waitForTimeout(100);eq(await saved(page),initial,'idle time never advances a new run');
  await page.locator('#primary-action').click();await waitRevision(page,initial.revision+1);await idle(page);const route=E.transition(initial,{type:'fate'});eq(await saved(page),route,'manual fate is one exact engine transition');
  await button(page,'home').click();check(await button(page,'continue').isVisible(),'home exposes continue');await button(page,'continue').click();eq(await saved(page),route,'continue never redraws RNG or consumes another action');eq(await page.locator('.game-shell').getAttribute('data-scene'),'route','route resumes visibly');
 });
 await run('manual-combat-chest-equip-refresh',async({page})=>{
  const before=combat();await load(page,before);await page.waitForTimeout(100);eq(await saved(page),before,'combat never auto-rolls');await page.locator('body').click({position:{x:1,y:1}});await page.keyboard.press('Space');
  await waitRevision(page,before.revision+1);await idle(page);const chest=E.transition(before,{type:'roll'});eq(await saved(page),chest,'Space commits exactly one manual roll');eq(await page.locator('.game-shell').getAttribute('data-scene'),'chest','defeated enemy yields a chest');
  await page.locator('#primary-action').click();await waitRevision(page,chest.revision+1);await idle(page);const loot=E.transition(chest,{type:'open'});eq(await saved(page),loot,'opening uses the original committed chest reward');check(await page.locator('.loot-screen').isVisible(),'loot is visible');await screenshot(page,'loot');
  const lootId=loot.loot.item.id;await page.locator(`[data-action="equip"][data-id="${lootId}"]`).first().click();await waitRevision(page,loot.revision+1);const equipped=E.transition(loot,{type:'equip',id:lootId});eq(await saved(page),equipped,'equipment changes use exactly the existing transaction');check(Object.values(equipped.player.equipped).includes(lootId),'reward is equipped');
  await page.reload();await button(page,'continue').click();eq(await saved(page),equipped,'refresh keeps loot, equipment, RNG and revision exact');check(await page.locator('.loot-screen').isVisible(),'refresh resumes the saved reward scene');
 });
 await run('inventory-scroll-lock-and-settings',async({page})=>{
  const before=combat();for(let i=0;i<90;i++){const item=E.makeItem(before,'weapon',i%3);before.player.items.push(item);}check(S.validateSave(before),'inventory fixture remains valid');await load(page,before);await page.locator('.main-nav [data-action="inventory"]').click();
  check(await page.locator('.inventory-list .item-card').count()===60,'inventory keeps its existing sixty-item page');await page.locator('.inventory-list').evaluate(node=>{node.scrollTop=300;});
  // A fixed offset may land between card action rows after legitimate layout
  // changes. Bring a real later lock control into view, then retain the same
  // full-visibility, exact transition and scroll-preservation assertions.
  await page.locator('.inventory-list [data-action="lock"]').nth(4).scrollIntoViewIfNeeded();
  const visibleId=await page.locator('.inventory-list').evaluate(node=>{const r=node.getBoundingClientRect();return [...node.querySelectorAll('[data-action="lock"]')].find(button=>{const b=button.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom;})?.dataset.id;});check(!!visibleId,'a lock button is fully visible after scrolling');
  const position=await page.locator('.inventory-list').evaluate(node=>node.scrollTop);await page.locator(`[data-action="lock"][data-id="${visibleId}"]`).click();await waitRevision(page,before.revision+1);const after=E.transition(before,{type:'lock',id:visibleId});eq(await saved(page),after,'inventory lock is one original transaction');eq(await page.locator('.inventory-list').evaluate(node=>node.scrollTop),position,'full app render retains inventory scrolling');
  await button(page,'settings').click();await page.locator('#effects').selectOption('full');eq(await page.evaluate(()=>document.documentElement.dataset.effects),'full','full effects setting updates current UI');await page.locator('#effects').selectOption('low');eq(await page.evaluate(()=>document.documentElement.dataset.effects),'low','low effects setting updates current UI');eq((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),S.SETTINGS_KEY)).effects,'low','setting is persisted');eq(await saved(page),after,'settings never modify game state');
  await page.locator('dialog [data-action="close-dialog"]').click();await screenshot(page,'inventory');await page.reload();await button(page,'continue').click();eq(await saved(page),after,'settings refresh preserves the run');eq(await page.evaluate(()=>document.documentElement.dataset.effects),'low','effects preference survives refresh');
 });
 await run('primary-save-failure-recovery',async({page})=>{
  const before=E.newGame(551);await load(page,before);const raw=await page.evaluate(({save,backup})=>[localStorage.getItem(save),localStorage.getItem(backup)],{save:S.SAVE_KEY,backup:S.BACKUP_KEY});
  await page.evaluate(key=>{window.__qaOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic main quota failure','QuotaExceededError');return window.__qaOriginalSetItem.call(this,k,v);};},S.SAVE_KEY);
  await page.locator('#primary-action').click();await page.locator('.toast.visible').filter({hasText:'本次操作未生效'}).waitFor();eq(await page.evaluate(({save,backup})=>[localStorage.getItem(save),localStorage.getItem(backup)],{save:S.SAVE_KEY,backup:S.BACKUP_KEY}),raw,'failed primary write leaves both durable copies untouched');eq(await page.locator('.game-shell').getAttribute('data-scene'),'fate','failed transition leaves original scene');check(await page.locator('#primary-action').isEnabled(),'failure retains usable manual action');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__qaOriginalSetItem;});await page.locator('#primary-action').click();await waitRevision(page,before.revision+1);await idle(page);eq(await saved(page),E.transition(before,{type:'fate'}),'retry consumes the original RNG once after storage recovers');
 });
 await run('mirror-write-warning-keeps-durable-result',async({page})=>{
  const before=E.newGame(891);await load(page,before);const mirror=await page.evaluate(key=>localStorage.getItem(key),S.BACKUP_KEY);
  await page.evaluate(key=>{window.__qaOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic mirror quota failure','QuotaExceededError');return window.__qaOriginalSetItem.call(this,k,v);};},S.BACKUP_KEY);
  await page.locator('#primary-action').click();await waitRevision(page,before.revision+1);await idle(page);const after=E.transition(before,{type:'fate'});eq(await saved(page),after,'primary save survives a failed mirror write');eq(await page.evaluate(key=>localStorage.getItem(key),S.BACKUP_KEY),mirror,'failed mirror remains the previous valid copy');check((await page.locator('.bottomline').innerText()).includes('镜像'),'warning remains visible');
  await page.reload();await button(page,'continue').click();eq(await saved(page),after,'reload uses exact latest primary result without reroll');
 });
 await run('cross-tab-sync-cancels-stale-confirmation',async({context,page})=>{
  const before=E.newGame(891),spare=E.makeItem(before,'weapon',0);before.player.items.push(spare);await load(page,before);const second=await context.newPage();second.on('pageerror',error=>report.errors.push(String(error)));await second.goto(url);await button(second,'continue').click();
  await page.locator('.main-nav [data-action="inventory"]').click();await page.locator(`[data-action="salvage-item"][data-id="${spare.id}"]`).click();check(await page.locator('dialog').isVisible(),'first tab reviews a concrete salvage');
  await second.locator('#primary-action').click();await waitRevision(second,before.revision+1);await idle(second);const after=E.transition(before,{type:'fate'});await page.waitForFunction(()=>!document.querySelector('dialog').open);eq(await saved(page),after,'first tab sees the latest exact save');check((await saved(page)).player.items.some(item=>item.id===spare.id),'stale review never consumes the spare');
  const notice=await page.locator('.toast').innerText();report.crossTabNotice=notice;
  // The existing primary-then-mirror transaction can deliver the primary storage
  // event before the mirror write. Both messages are real loadSave outcomes.
  check(['已同步另一窗口的最新进度。','主存档可用，但镜像尚未同步。请导出当前进度备份，后续成功保存会重建镜像。'].includes(notice),'sync or the exact transient mirror state is explained');
  await page.locator('#primary-action').click();eq(await page.locator('.game-shell').getAttribute('data-scene'),'route','first tab game view has latest scene after sync');eq(await saved(second),after,'both tabs retain the same branch and RNG');eq(await page.evaluate(()=>!!navigator.locks),!options['--no-web-locks'],'Declared Web Locks or API-absent fallback path is exercised');
 });
}finally{report.checks=checks;report.finished=new Date().toISOString();await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks,passes:report.cases.filter(c=>c.status==='PASS').length,failures:report.cases.filter(c=>c.status!=='PASS'),errors:report.errors},null,2));
if(report.cases.some(c=>c.status!=='PASS')||report.errors.length)process.exitCode=1;
