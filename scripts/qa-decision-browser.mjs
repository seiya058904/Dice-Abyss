// Read-only previews and explicit consumption through the shipping app.
// External Playwright; fresh contexts and synthetic loopback saves only.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(0,at),arg.slice(at+1)];}));
assert(options['--output'],'Pass an external --output directory');
const output=path.resolve(options['--output']),url=options['--url']||'http://127.0.0.1:4197/';
assert.equal(new URL(url).hostname,'127.0.0.1');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
const report={browser:browser.version(),synthetic:true,url,cases:[],errors:[],geometry:[],started:new Date().toISOString()};
await fs.mkdir(output,{recursive:true});
let checks=0;
const check=(value,label)=>{checks++;assert(value,label);};
const equal=(a,b,label)=>{checks++;assert.deepEqual(a,b,label);};
const raw=p=>p.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY);
const state=async p=>S.decodeSave(await raw(p));
async function load(p,s){
 assert(S.validateSave(s));await p.goto(url);
 await p.evaluate(({raw,save,mirror,settings})=>{localStorage.setItem(save,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},
  {raw:S.encodeSave(s),save:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await p.reload();await p.locator('[data-action="continue"]').click();await p.locator('.game-shell').waitFor();
}
async function commit(p,selector,revision){
 await p.locator(selector).click();
 await p.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision});
 await p.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
}
async function run(name,body){
 if(options['--case']&&options['--case']!==name)return;
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await context.newPage();
 p.setDefaultTimeout(12000);p.on('pageerror',error=>report.errors.push({name,message:error.message}));
 const start=checks,errors=report.errors.length;
 try{await body(p,context);equal(report.errors.length,errors,'No page errors');report.cases.push({name,status:'PASS',checks:checks-start});}
 catch(error){report.cases.push({name,status:'FAIL',checks:checks-start,error:error.stack});await p.screenshot({path:path.join(output,`FAIL-${name}.png`)}).catch(()=>{});}
 finally{await context.close();console.log(`${name}: ${report.cases.at(-1).status}`);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
function fixture(count=65){
 const s=E.newGame(711);s.player.level=10;
 const worn=s.player.items.find(i=>i.id===s.player.equipped.weapon),candidate=E.makeItem(s,'weapon',1);s.player.items.push(candidate);
 for(const [item,catalogId,level]of [[worn,'weapon-4-2-1',11],[candidate,'v4-weapon-3-3-1',10]]){
  const e=CATALOG_BY_ID.get(catalogId);Object.assign(item,{catalogId,level,levelXp:0,rarity:e.rarity,profile:e.profile,theme:e.theme,name:e.name,enhance:0});
 }
 for(let i=1;i<count;i++){const item=E.makeItem(s,'weapon',0);item.level=1;s.player.items.push(item);}
 candidate.extra={original:['keep',17]};s.qaDecision={unknown:true};s.player.hp=E.stats(s).maxHp;
 return {s,candidate};
}
try{
 await run('review-exclude-page-commit-reload',async p=>{
  const {s,candidate}=fixture(),quote=E.salvagePreview(s,undefined,false,true);await load(p,s);
  await p.locator('.main-nav [data-action="inventory"]').click();await p.locator('[data-action="salvage-preview"]').click();
  const row=p.locator('.salvage-review-item').filter({has:p.locator(`[data-salvage-select="${candidate.id}"]`)});
  await row.locator('summary').click();check((await row.innerText()).includes('基础伤害估值 +11%'),'The existing comparison discloses the upgrade');
  check((await row.innerText()).includes('穿盾需权衡'),'Penetration tradeoff is retained');
  const first=p.locator(`[data-salvage-select="${candidate.id}"]`);await first.focus();await first.press('Space');
  check(!(await first.isChecked()),'Keyboard can exclude a candidate');check(await first.evaluate(n=>document.activeElement===n),'Checkbox focus survives quote update');
  await p.locator('[data-action="review-page"][data-page="1"]').click();
  const last=quote.items.at(-1).id;await p.locator(`[data-salvage-select="${last}"]`).uncheck();
  await p.locator('[data-action="review-page"][data-page="0"]').click();check(!(await first.isChecked()),'Selection survives paging');
  const ids=quote.items.map(i=>i.id).filter(id=>![candidate.id,last].includes(id)),selected=E.salvagePreview(s,ids,false,true);
  check((await p.locator('#salvage-review-summary').innerText()).includes(`${ids.length} / ${quote.items.length}`),'Selected count is current');
  check((await p.locator('#salvage-review-summary').innerText()).includes(selected.gold.toLocaleString('en-US')),'Gold quote is current');
  equal(await raw(p),S.encodeSave(s),'Review and navigation never save or consume RNG');
  await p.screenshot({path:path.join(output,'salvage-review.png')});
  await commit(p,'dialog [data-action="confirm"]',s.revision+1);
  const expected=E.transition(s,{type:'salvage',ids,allowOverflow:!!selected.overflow});equal(await state(p),expected,'Only selected items are consumed');
  equal((await state(p)).player.items.find(i=>i.id===candidate.id),candidate,'Excluded candidate and extra metadata survive');
  await p.reload();await p.locator('[data-action="continue"]').click();equal(await state(p),expected,'Exact state survives reload');
 });
 await run('empty-overflow-cancel-and-stale-review',async(p,context)=>{
  const {s,candidate}=fixture(1);s.player.gold=E.GOLD_CAP;await load(p,s);
  await p.locator('.main-nav [data-action="inventory"]').click();await p.locator('[data-action="salvage-preview"]').click();
  const box=p.locator(`[data-salvage-select="${candidate.id}"]`);check((await p.locator('#salvage-review-summary').innerText()).includes('溢出金币'),'Overflow is explicit');
  await box.uncheck();check(await p.locator('dialog [data-action="confirm"]').isDisabled(),'Empty selection cannot commit');
  check(!(await p.locator('#salvage-review-summary').innerText()).includes('溢出金币'),'Empty selection has no abandoned gold');
  await box.check();await p.locator('dialog [data-action="close-dialog"]').first().click();equal(await raw(p),S.encodeSave(s),'Cancel writes nothing');
  await p.locator('[data-action="salvage-preview"]').click();
  const other=await context.newPage();await other.goto(url);
  const updated=E.transition(s,{type:'lock',id:candidate.id});
  await other.evaluate(({raw,save,mirror})=>{localStorage.setItem(save,raw);localStorage.setItem(mirror,raw);},{raw:S.encodeSave(updated),save:S.SAVE_KEY,mirror:S.BACKUP_KEY});
  await p.locator('dialog').waitFor({state:'hidden'});equal(await state(p),updated,'Cross-tab change cancels stale confirmation without consumption');
  await p.locator('[data-action="salvage-preview"]').click();check(!(await p.locator('dialog').isVisible()),'Locked candidate cannot be reviewed again');
 });
 await run('talent-readiness-investment-and-reload',async p=>{
  const s=E.newGame(712);s.player.level=2;s.player.talentPoints=2;await load(p,s);
  await p.locator('.main-nav [data-action="talents"]').click();const node=p.locator('[data-talent-preview="sum"]');
  await node.focus();check((await p.locator('#talent-preview').innerText()).includes('当前最多 12 点'),'Focus exposes the current maximum');
  check((await p.locator('#talent-preview').innerText()).includes('Lv.3 解锁'),'Unlock is explicit');equal(await raw(p),S.encodeSave(s),'Preview is read-only');
  await p.screenshot({path:path.join(output,'talent-readiness.png')});
  await commit(p,'[data-talent-preview="sum"]',1);const invested=E.transition(s,{type:'talent',id:'sum'});
  equal(await state(p),invested,'Early investment remains exactly the existing transaction');
  await p.reload();await p.locator('[data-action="continue"]').click();equal(await state(p),invested,'Talent investment resumes unchanged');
  s.player.level=3;await load(p,s);await p.locator('.main-nav [data-action="talents"]').click();await node.focus();
  check((await p.locator('#talent-preview').innerText()).includes('骰数条件已满足'),'The first available dice count is reflected');
 });
 await run('short-window-inventory-scroll-focus',async p=>{
  const {s}=fixture();await p.setViewportSize({width:1366,height:768});await load(p,s);
  await p.locator('.main-nav [data-action="inventory"]').click();
  await p.locator('[data-action="settings"]').click();await p.locator('#ui-scale').selectOption('1.1');await p.locator('dialog [data-action="close-dialog"]').first().click();
  const screen=p.locator('.inventory-screen');await screen.hover();await p.mouse.wheel(0,360);
  await p.waitForFunction(()=>document.querySelector('.inventory-screen').scrollTop>0);
  const card=p.locator('.inventory-list .item-card').nth(2);await card.scrollIntoViewIfNeeded();
  const geometry=await card.evaluate(node=>{const card=node.getBoundingClientRect(),screen=node.closest('.inventory-screen').getBoundingClientRect();return {card:card.height,port:screen.height};});
  check(geometry.port>geometry.card,'A complete normal equipment card fits in the short-window scroll port');
  const lock=card.locator('[data-action="lock"]'),id=await lock.getAttribute('data-id');await lock.evaluate(n=>n.scrollIntoView({block:'center'}));
  check(await lock.evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===n;}),'The lock control is unobscured before its native click');
  const position=await screen.evaluate(n=>n.scrollTop),offset=await lock.evaluate(n=>n.getBoundingClientRect().top);
  await commit(p,`.inventory-list [data-action="lock"][data-id="${id}"]`,s.revision+1);
  equal(await state(p),E.transition(s,{type:'lock',id}),'The scrolled lock is still one exact transaction');
  equal(await screen.evaluate(n=>n.scrollTop),position,'Full redraw preserves the outer inventory scroll');
  equal(await lock.evaluate(n=>n.getBoundingClientRect().top),offset,'The same action stays in place');
  check(await lock.evaluate(n=>document.activeElement===n),'Native action focus survives the redraw');
  const next=p.locator('[data-action="inventory-page"]').last();
  check(await next.evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===n;}),'Sticky pagination is unobscured while reading items');
  await p.screenshot({path:path.join(output,'inventory-short-window.png')});
  await next.click();equal(await screen.evaluate(n=>n.scrollTop),0,'Changing pages starts with current results and filters');
  check(await p.locator('[data-action="inventory-page"]').first().evaluate(n=>document.activeElement===n),'Last-page navigation keeps focus on an enabled direction');
  await p.locator('#inventory-sort').focus();await p.locator('#inventory-sort').selectOption('level');equal(await screen.evaluate(n=>n.scrollTop),0,'Sorting starts at the top');
  check(await p.locator('#inventory-sort').evaluate(n=>document.activeElement===n),'Sorting retains its control');
 });
 await run('readability-layout-and-scale',async p=>{
  const {s}=fixture(65);s.player.items[1].name='长名称装备'.repeat(10);await load(p,s);await p.locator('.main-nav [data-action="inventory"]').click();
  for(const [width,height]of [[1366,768],[1440,900],[1920,1080],[390,844]])for(const scale of [.9,1,1.1]){
   await p.setViewportSize({width,height});await p.locator('[data-action="settings"]').click();await p.locator('#ui-scale').selectOption(String(scale));await p.locator('dialog [data-action="close-dialog"]').first().click();
   await p.evaluate(()=>document.fonts.ready);
   const sample=await p.evaluate(()=>{
    const selectors=['.inventory-reclaim > span','.inventory-list .item-card > p','.equipment-list .equipped-item p','.equipment-depth'];
    const button=document.querySelector('#primary-action').getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,fonts:selectors.map(selector=>({selector,size:parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)})),primary:{top:button.top,bottom:button.bottom},listHeight:document.querySelector('.inventory-list').getBoundingClientRect().height};
   });sample.scale=scale;report.geometry.push(sample);
   check(sample.documentWidth<=width,`No horizontal page overflow ${width}/${scale}`);
   check(sample.fonts.every(row=>row.size>=12),`Decision text stays at least 12 CSS pixels ${width}/${scale}`);
   check(sample.primary.top>=0&&sample.primary.bottom<=height,`Primary action remains visible ${width}/${scale}`);
   check(sample.listHeight>=100,`Inventory retains a usable scrolling region ${width}/${scale}`);
   if(scale===1||width===1366&&scale===1.1)await p.screenshot({path:path.join(output,`inventory-${width}-${scale}.png`)});
  }
  for(const width of [1366,1440,1920]){
   const samples=report.geometry.filter(row=>row.width===width),normal=samples.find(row=>row.scale===1),large=samples.find(row=>row.scale===1.1);
   check(large.fonts.every((row,i)=>row.size>normal.fonts[i].size),`110% increases decision text even in short windows ${width}`);
  }
  equal(await raw(p),S.encodeSave(s),'Layout and settings leave gameplay save untouched');
 });
}finally{
 report.checks=checks;report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
if(report.cases.some(row=>row.status!=='PASS')||report.errors.length)process.exitCode=1;
