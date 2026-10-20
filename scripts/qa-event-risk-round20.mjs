// Optional real-browser QA. Requires externally installed Playwright/Chromium;
// the game itself remains dependency-free. Every save is an isolated fixture.
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)];}));
const root=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(args['--output']||'/tmp/dice-abyss-event-risk-round20');
const url=args['--url']||'http://127.0.0.1:4188',only=args['--case'];
const knownCases=['preview-keyboard-and-affordability','all-outcomes-confirm-refresh-open-once','quota-failure-and-cross-tab-review','responsive-layout-and-cap-balances'];
assert(!only||knownCases.includes(only),'Unknown --case; refusing an empty acceptance run');
const loadModule=name=>import(pathToFileURL(path.join(root,name)));
const E=await loadModule('src/engine.js'),S=await loadModule('src/storage.js'),R=await loadModule('src/event-risk.js');
const {eventFixture}=await loadModule('scripts/audit-event-context.mjs');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const tracked=['index.html','package.json','src/release.js','src/app.js','src/views.js','src/event-risk.js','src/event-risk.css','src/engine.js','src/storage.js','src/encounters.js','src/deep-rules.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(tracked.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
const report={started:new Date().toISOString(),source:root,url,synthetic:true,sourceBefore:await sourceHashes(),cases:[],errors:[],notes:['Fresh browser contexts; no private saves.','Native clicks/keys/selects drive UI. Fixture setup and quota failures are explicit injections.','Viewport dimensions are logical CSS pixels at DPR1, not physical GPU/display certification.','Full decoded states and both durable strings are compared with authoritative engine transitions.']};
report.warnings=[];
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:args['--browser']||process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let total=0,trace=[];
const check=(ok,label,data)=>{total++;trace.push({label,passed:!!ok,...(data?{data}:{})});assert(ok,label);};
const equal=(actual,expected,label)=>{total++;const a=sha(actual),b=sha(expected);trace.push({label,actualSha256:a,expectedSha256:b,passed:a===b});assert.deepEqual(actual,expected,label);};
const button=(p,action,id)=>p.locator(`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`);
const raw=p=>p.evaluate(({key,backup})=>({main:localStorage.getItem(key),mirror:localStorage.getItem(backup)}),{key:S.SAVE_KEY,backup:S.BACKUP_KEY});
const saved=async p=>S.decodeSave((await raw(p)).main);
const idle=p=>p.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
const revision=(p,n)=>p.waitForFunction(({key,n})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===n,{key:S.SAVE_KEY,n});
const risk=(p,inDialog=false)=>p.locator(`${inDialog?'dialog':'.event-screen'} [data-event-risk]`);
const percent=n=>n===0?'0%':n<.0001?'<0.01%':`${(n*100).toFixed(2)}%`;
function fixture(key='gambit',floor=key==='gambit'?1:140){
 const s=eventFixture({E,S},key,{floor,rich:true});s.event.costGold=835;s.player.gold=2505;assert(S.validateSave(s));return s;
}
function outcomeFixture(key,group){
 const s=fixture(key);
 for(let i=1;i<=500;i++){
  const before={...s,rng:(Math.imul(i,2654435761)>>>0)||1};
  const after=E.transition(before,{type:'event-choice',id:'roll',confirmed:true});
  const n=key==='gambit'?after.event.roll:after.event.rolls.reduce((a,b)=>a+b,0);
  const actual=key==='gambit'?(n<=2?'refund':n<=4?'middle':'high'):(n<=5?'refund':n<=9?'middle':'high');
  if(actual===group)return before;
 }
 throw Error(`No registered outcome found: ${key}/${group}`);
}
async function setup(page,state,effects='low'){
 assert(S.validateSave(state));await page.goto(url);
 await page.evaluate(({value,key,mirror,settings,effects})=>{localStorage.setItem(key,value);localStorage.setItem(mirror,value);localStorage.setItem(settings,JSON.stringify({sound:false,effects,scale:1}));},{value:S.encodeSave(state),key:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY,effects});
 await page.reload();await button(page,'continue').click();await page.evaluate(()=>document.fonts.ready);await idle(page);
}
async function assertQuote(page,state,choiceId='roll',inDialog=false){
 const quote=R.eventRiskPreview(state,choiceId),scope=risk(page,inDialog);
 check(await scope.isVisible(),'risk preview is visibly rendered');
 equal(await scope.getAttribute('data-risk-choice'),choiceId,'preview corresponds to the actual reviewed choice');
 equal(await scope.locator('.event-risk-table tbody tr').count(),quote.outcomes.length,'every dice-result group is shown');
 for(const row of quote.outcomes){
  const target=scope.locator(`[data-risk-outcome="${row.key}"]`);
  equal((await target.locator('.event-risk-percent').innerText()).trim(),percent(row.probability),'rendered branch probability matches public rule model');
  if(quote.available){
   const gold=n=>Number(n).toLocaleString('en-US');
   const expected=row.rarityFloor===null?`返还 ${gold(row.refund.rawGold)} 金币 · 净支出 ${gold(row.netCostGold)} · 余额 ${gold(row.goldAfterChoice)}`:`余额 ${gold(row.goldAfterChoice)} 金币 · 宝箱待开启`;
   equal((await target.locator('td > small').innerText()).replace(/\s+/g,' ').trim(),expected,'each result row states the exact refund, net payment, and immediate balance');
  }
 }
 check((await scope.innerText()).includes('宝箱金币在开箱时另行结算'),'later chest gold is explicitly separate');
 equal(await saved(page),state,'all preview reads leave the entire run unchanged');
}
function wire(page){
 page.setDefaultTimeout(20000);
 page.on('pageerror',error=>report.errors.push({kind:'pageerror',message:String(error)}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({kind:'console',message:message.text()});else if(message.type()==='warning')report.warnings.push(message.text());});
 page.on('requestfailed',request=>report.errors.push({kind:'requestfailed',url:request.url(),failure:request.failure()}));
}
async function fresh(){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage();wire(page);
 return {context,page};
}
async function run(name,fn){
 if(only&&only!==name)return;trace=[];const env=await fresh(),start=performance.now(),before=total;
 try{await fn(env);report.cases.push({name,status:'PASS',checks:total-before,ms:performance.now()-start,trace});}
 catch(error){report.cases.push({name,status:'FAIL',checks:total-before,ms:performance.now()-start,error:String(error),stack:error.stack,trace});await env.page.screenshot({path:path.join(output,`FAIL-${name}.jpg`),type:'jpeg',quality:80}).catch(()=>{});}
 finally{await env.context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
 console.log(`${name}: ${report.cases.at(-1).status}`);
}
try{
 await run('preview-keyboard-and-affordability',async({page})=>{
  const s=fixture();await setup(page,s);check((await page.title()).includes('Dice Abyss'),'correct meaningful game page');
  equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),JSON.parse(await fs.readFile(path.join(root,'package.json'))).version,'served release matches source');
  await assertQuote(page,s);const before=await raw(page),summary=risk(page).locator('summary');
  await summary.focus();await page.keyboard.press('Space');check(await risk(page).locator('details').evaluate(el=>el.open),'Space opens native disclosure');
  equal(await raw(page),before,'opening disclosure neither saves nor rolls');
  equal(await risk(page).locator('.event-risk-distribution tbody tr').count(),8,'all eight qualities are listed');
  check((await risk(page).innerText()).includes('140 层解锁'),'future eternal gate is explicit');
  await page.keyboard.press('Space');check(!(await risk(page).locator('details').evaluate(el=>el.open)),'Space closes disclosure');
  equal(await saved(page),s,'native Space on summary did not trigger a gameplay action');
  await button(page,'event-choice','safe').click();await assertQuote(page,s,'safe',true);
  check((await button(page,'confirm').innerText()).includes('保底'),'confirmation names the guaranteed action');
  await page.locator('dialog .dialog-buttons [data-action="close-dialog"]').click();equal(await raw(page),before,'cancel preserves both complete durable strings');
  equal(await page.evaluate(()=>document.activeElement?.dataset.id),'safe','cancel returns focus to original choice');
  const poor=fixture();poor.player.gold=400;await setup(page,poor);await assertQuote(page,poor);
  check(await button(page,'event-choice','roll').isDisabled(),'unaffordable roll remains disabled');
  check(await button(page,'event-choice','safe').isDisabled(),'unaffordable guarantee remains disabled');
  check((await risk(page).innerText()).includes('还差 435'),'exact shortfall remains readable');
  check(await page.locator('#primary-action').isEnabled(),'safe leaving remains available');
  await page.locator('#primary-action').click();await revision(page,poor.revision+1);equal(await saved(page),E.transition(poor,{type:'event-choice',id:'leave'}),'declining spends nothing and follows the exact existing transition');
 });
 await run('all-outcomes-confirm-refresh-open-once',async({page})=>{
  for(const key of ['gambit','wishingvault'])for(const group of ['refund','middle','high']){
   const s=outcomeFixture(key,group);await setup(page,s);await assertQuote(page,s);const before=await raw(page);
   await button(page,'event-choice','roll').click();await assertQuote(page,s,'roll',true);equal(await raw(page),before,'opening confirmation does not spend or pre-roll');
   const expected=E.transition(s,{type:'event-choice',id:'roll',confirmed:true});
   await button(page,'confirm').dblclick({delay:15});await revision(page,expected.revision);await idle(page);
   equal(await saved(page),expected,`${key}/${group}: double click commits exactly one complete engine result`);
   const committed=await raw(page);equal(committed.main,committed.mirror,'primary and mirror both contain that exact result');
   await page.reload();await button(page,'continue').click();await idle(page);equal(await saved(page),expected,'refresh never rerolls or spends again');
   if(expected.phase==='chest'){
    await page.locator('#primary-action').click();await revision(page,expected.revision+1);await idle(page);
    const opened=E.transition(expected,{type:'open'});equal(await saved(page),opened,'later open credits the original saved prize exactly once');
    equal(opened.player.items.filter(item=>item.id===expected.chest.item.id).length,1,'single chest item ownership');
   }
  }
  const s=fixture();await setup(page,s);await button(page,'event-choice','safe').click();await button(page,'confirm').click();
  await revision(page,s.revision+1);await idle(page);equal(await saved(page),E.transition(s,{type:'event-choice',id:'safe',confirmed:true}),'guaranteed alternative retains its original two-price transaction');
 });
 await run('quota-failure-and-cross-tab-review',async({context,page})=>{
  const s=outcomeFixture('gambit','refund');await setup(page,s);const before=await raw(page);
  await page.evaluate(key=>{window.__riskSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic quota failure','QuotaExceededError');return window.__riskSet.call(this,k,v);};},S.SAVE_KEY);
  await button(page,'event-choice','roll').click();await button(page,'confirm').click();
  await page.locator('.toast').filter({hasText:'本次操作未生效'}).waitFor();equal(await raw(page),before,'failed primary write preserves full pre-payment main and mirror');await assertQuote(page,s);
  await page.evaluate(()=>{Storage.prototype.setItem=window.__riskSet;});
  await button(page,'event-choice','roll').click();await button(page,'confirm').click();await revision(page,s.revision+1);await idle(page);
  equal(await saved(page),E.transition(s,{type:'event-choice',id:'roll',confirmed:true}),'recovering from quota failure consumes original RNG once');
  const again=fixture('wishingvault');again.player.talentPoints=3;again.player.talents.luck=0;await setup(page,again);
  const second=await context.newPage();wire(second);
  await second.goto(url);await button(second,'continue').click();await idle(second);
  await button(page,'event-choice','roll').click();await assertQuote(page,again,'roll',true);
  await second.locator('.main-nav [data-action="talents"]').click();await button(second,'talent','luck').click();await revision(second,again.revision+1);
  const updated=E.transition(again,{type:'talent',id:'luck',count:1});equal(await saved(second),updated,'other tab performs one real visible luck investment');
  await page.waitForFunction(()=>!document.querySelector('dialog').open);equal(await saved(page),updated,'stale confirmation closes and latest full branch remains');
  await assertQuote(page,updated);check(R.eventRiskPreview(updated).luck>R.eventRiskPreview(again).luck,'probabilities are recomputed after actual luck change');
  await button(page,'event-choice','roll').click();await assertQuote(page,updated,'roll',true);await page.keyboard.press('Escape');equal(await saved(page),updated,'Escape cancels updated review without spending');
 });
 await run('responsive-layout-and-cap-balances',async({page})=>{
  const sizes=[[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,740]],layouts=[];
  for(const [width,height]of sizes)for(const key of ['gambit','wishingvault']){
   await page.setViewportSize({width,height});const s=fixture(key);if(key==='wishingvault')s.player.gold=E.GOLD_CAP;
   await setup(page,s);await assertQuote(page,s);const scope=risk(page);
   const inspect=async label=>{
    const data=await page.evaluate(()=>{
     const host=document.querySelector('dialog[open]')||document.querySelector('.event-screen');
     const tables=[...host.querySelectorAll('.event-risk table')].filter(el=>el.getBoundingClientRect().height>0);
     return {width:innerWidth,height:innerHeight,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,hostOverflow:host.scrollWidth>host.clientWidth+2,
      tableOverflow:tables.some(table=>{const t=table.getBoundingClientRect(),h=host.getBoundingClientRect();return t.width>h.width+2;}),
      textClipped:[...host.querySelectorAll('.event-risk th,.event-risk td,.event-risk-payment,.event-risk-heading')].filter(el=>el.getBoundingClientRect().height>0).some(el=>el.scrollWidth>el.clientWidth+2),
      fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')]};
    });
    layouts.push({key,label,...data});check(!data.documentOverflow&&!data.hostOverflow&&!data.tableOverflow&&!data.textClipped,`${width}/${key}/${label}: checked containers and text have no horizontal overflow`,data);check(data.fonts.every(Boolean),'both offline font faces loaded');
   };
   await inspect('collapsed');await scope.locator('summary').click();await inspect('expanded');equal(await saved(page),s,'disclosure at each viewport is read-only');
   await scope.locator('summary').click();await button(page,'event-choice','roll').scrollIntoViewIfNeeded();check(await button(page,'event-choice','roll').isVisible(),'payment choice reachable at every viewport');
   await button(page,'event-choice','roll').click();await assertQuote(page,s,'roll',true);await inspect('confirmation');
   await risk(page,true).locator('summary').click();await inspect('confirmation-expanded');
   await button(page,'confirm').scrollIntoViewIfNeeded();await button(page,'confirm').click({trial:true});check(await button(page,'confirm').isVisible(),'expanded-details confirmation passes native pointer actionability without purchasing');
   await page.locator('dialog .dialog-buttons [data-action="close-dialog"]').click();equal(await saved(page),s,'layout review never purchases');
   if((width===1920&&key==='gambit')||(width===390&&key==='wishingvault')){
    await page.evaluate(()=>{for(const selector of ['.event-screen','#current-room']){const el=document.querySelector(selector);if(el)el.scrollTop=0;}window.scrollTo(0,0);});
    await page.screenshot({path:path.join(output,`${key}-${width}.jpg`),type:'jpeg',quality:84});
   }
  }
  report.layouts=layouts;
 });
}finally{
 report.sourceAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
 report.checks=total;report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({checks:total,groups:report.cases.length,passed:report.cases.filter(row=>row.status==='PASS').length,errors:report.errors,sourceStable:report.sourceStable}));
if(report.cases.some(row=>row.status!=='PASS')||report.errors.length||!report.sourceStable)process.exitCode=1;
