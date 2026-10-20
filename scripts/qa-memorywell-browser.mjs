// Native integration for the round 07 memorywell consequence preview.
// Tester-provided Chromium; isolated loopback storage; no production API stubs.
// Synthetic fixtures are labeled separately from an optional recorded natural run.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEventApi,contextFixtures} from './audit-event-context.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
const root=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(args['--output']||'/tmp/dice-memorywell-browser');
assert(output!==root&&!output.startsWith(root+path.sep),'Keep generated evidence outside the project');
const url=args['--url']||'http://127.0.0.1:4277/';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only loopback test origins');
const selected=new Set((args['--cases']||'').split(',').filter(Boolean));
const api=await loadEventApi(root),{E,S,C}=api;
assert.equal(typeof E.memorywellPreview,'function','This checks the round 07 preview');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
const report={started:new Date().toISOString(),source:root,url,scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),cases:[],errors:[],notes:[
 'Normal cases load explicitly synthetic validator-accepted snapshots. All clicks, confirmations, saving and reloads use the real application.',
 'An optional natural-fixture case loads a snapshot captured from a separately recorded seeded engine journey. It is a browser replay of that snapshot, not a whole journey played in the browser.',
 'Functional runs use low effects and reduced motion on software Chromium. Timings are not performance measurements.',
 'Four desktop viewports are simulated. The existing general game shell has a 900px minimum width; a 390px probe only checks the dialog and records that known whole-page limitation.'
]};
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let row;
const check=(condition,label)=>{row.checks.push({label,passed:!!condition});assert(condition,label);};
const equal=(actual,expected,label)=>{row.checks.push({label,passed:false});assert.deepEqual(actual,expected,label);row.checks.at(-1).passed=true;};
const button=(page,action)=>page.locator(`[data-action="${action}"]`);
const snapshot=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
async function load(page,state){
 assert(S.validateSave(state));
 await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);},{raw:S.encodeSave(state),keys});
 await page.reload();await page.evaluate(()=>document.fonts.ready);await button(page,'continue').click();
 await page.locator('[data-memorywell-preview]').waitFor();
}
async function shot(page,name){const filename=`${name}.png`;await page.screenshot({path:path.join(output,filename)});(row.screenshots||=[]).push(filename);}
async function run(name,fn){
 if(selected.size&&!selected.has(name))return;
 row={name,status:'RUNNING',checks:[]};report.cases.push(row);const started=performance.now();let context,page;
 try{
  context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.errors.push({case:name,type:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')report.errors.push({case:name,type:'console',message:message.text()});});
  await page.goto(url);await fn(page);row.status='PASS';
 }catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;await page?.screenshot({path:path.join(output,`FAIL-${name}.png`)}).catch(()=>{});}
 finally{row.durationMs=performance.now()-started;await context?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(`${name}: ${row.status} (${row.checks.length} checks)`);
}
const standard=contextFixtures(api).find(f=>f.name==='memorywell/full-hp').state;
standard.player.talentPoints=7;assert(S.validateSave(standard));
const exact=n=>n===null?'无法提交':n.toLocaleString('en-US');
async function verifyRows(container,preview,label){
 const shown=await container.locator('[data-memorywell-row]').evaluateAll(nodes=>nodes.map(node=>{
  const clean=element=>{const clone=element.cloneNode(true);clone.querySelectorAll('.sr-only').forEach(n=>n.remove());return clone.textContent.trim();};
  return {key:node.dataset.memorywellRow,before:clean(node.querySelector('.memorywell-before')),after:clean(node.querySelector('dd>strong'))};
 }));
 equal(shown,['hp','maxHp','talentPoints','gold'].map(key=>({key,before:exact(preview.before[key]),after:exact(preview.after[key])})),`${label}: all four exact before/after values`);
 equal(await container.getAttribute('data-can-reset'),String(preview.canReset),`${label}: authoritative availability`);
}
async function decision(page,state,name,{screenshot=false}={}){
 await load(page,state);const before=await snapshot(page),preview=E.memorywellPreview(state),choice=C.eventChoices(state).find(o=>o.id==='reset');
 check(preview.canReset,`${name}: declared executable fixture`);
 const room=page.locator('.event-screen [data-memorywell-preview]');await verifyRows(room,preview,`${name}/room`);
 const roomMarkup=await room.innerHTML();equal(S.decodeSave(before[keys.main]),state,`${name}: exact loaded state`);
 if(screenshot)await shot(page,`${name}-room`);
 const control=page.locator('[data-action="event-choice"][data-id="reset"]');
 await control.click();const dialog=page.locator('dialog[open]'),copy=dialog.locator('[data-memorywell-preview]');await verifyRows(copy,preview,`${name}/confirmation`);
 equal(await copy.innerHTML(),roomMarkup,`${name}: room and confirmation share the full fragment`);
 const confirmation=await dialog.innerText();check(confirmation.includes(choice.detail)&&confirmation.includes(choice.cost),`${name}: original full explanation and cost retained`);
 equal(await snapshot(page),before,`${name}: opening review changes no storage`);
 if(screenshot)await shot(page,`${name}-confirmation`);
 await dialog.locator('[data-action="close-dialog"]').first().click();equal(await snapshot(page),before,`${name}: cancel changes no storage`);
 await control.click();await page.locator('dialog[open] [data-action="confirm"]').click();
 const expected=E.transition(state,{type:'event-choice',id:'reset',confirmed:true});
 await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:keys.main,revision:expected.revision});
 const after=await snapshot(page);equal(S.decodeSave(after[keys.main]),expected,`${name}: complete state equals one real transition`);
 equal(after[keys.mirror],after[keys.main],`${name}: mirror equals primary`);equal(Object.keys(after),Object.keys(before),`${name}: no extra storage entries`);
 equal(after[keys.settings],before[keys.settings],`${name}: settings preserved`);equal(expected.rng,state.rng,`${name}: RNG preserved`);
 equal({hp:expected.player.hp,maxHp:E.stats(expected).maxHp,gold:expected.player.gold,talentPoints:expected.player.talentPoints},preview.after,`${name}: visible projection equals committed values`);
 equal(await page.locator('.event-screen [data-memorywell-preview]').count(),0,`${name}: resolved history has no new preview`);
 equal(await page.locator('dialog[open]').count(),0,`${name}: successful confirmation is closed`);
 await page.reload();await button(page,'continue').click();equal(await snapshot(page),after,`${name}: refresh cannot repeat the charge`);
 equal(await page.locator('.event-screen [data-memorywell-preview]').count(),0,`${name}: refresh preserves resolved presentation`);
 (row.scenarios||=[]).push({name,beforeSha256:hash(before),afterSha256:hash(after),preview,committedRevision:expected.revision});
 return expected;
}
async function geometry(container){return container.evaluate(node=>{
 const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 return {rect:rect(node),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,rows:[...node.querySelectorAll('[data-memorywell-row]')].map(n=>({key:n.dataset.memorywellRow,rect:rect(n),parts:[...n.children].map(rect),numbers:[...n.querySelectorAll('dd>span,dd>strong')].map(rect)}))};
 });}
function checkGeometry(g,label){
 check(g.scrollWidth<=g.clientWidth+1,`${label}: no preview horizontal overflow`);
 for(const line of g.rows){
  check([...line.parts,...line.numbers].every(n=>n.left>=line.rect.left-1&&n.right<=line.rect.right+1&&n.top>=line.rect.top-1&&n.bottom<=line.rect.bottom+1),`${label}/${line.key}: labels and values contained`);
 }
 for(let i=1;i<g.rows.length;i++)check(g.rows[i-1].rect.bottom<=g.rows[i].rect.top+1,`${label}: rows do not overlap`);
}
try{
 await run('exact-preview-cancel-commit-refresh',async page=>{
  const wounded=structuredClone(standard);wounded.player.hp=100;
  const old=structuredClone(standard);old.event.costGold=17;
  const changed=E.transition(standard,{type:'equip',id:'i6'});
  for(const [name,state]of [['full',standard],['wounded',wounded],['changed-armor',changed],['saved-old-price',old]])await decision(page,state,name,{screenshot:name==='full'});
 });
 await run('disabled-previews-stay-uncommitted',async page=>{
  const poor=structuredClone(standard);poor.player.gold=poor.event.costGold-1;
  const empty=structuredClone(standard);for(const key of Object.keys(empty.player.talents))empty.player.talents[key]=0;empty.player.hp=Math.min(empty.player.hp,E.stats(empty).maxHp);
  const over=structuredClone(standard);over.player.talentPoints=2_000_000;
  for(const [name,state]of [['short-one-coin',poor],['no-invested-points',empty],['points-over-cap',over]]){
   await load(page,state);const before=await snapshot(page),preview=E.memorywellPreview(state),room=page.locator('.event-screen [data-memorywell-preview]');
   check(!preview.canReset,`${name}: declared unavailable fixture`);await verifyRows(room,preview,name);
   check(await page.locator('[data-action="event-choice"][data-id="reset"]').isDisabled(),`${name}: native reset control disabled`);
   check((await room.innerText()).includes('以下仅为清空天赋后的数值对照，当前无法提交'),`${name}: theoretical values clearly labeled`);
   equal(await room.locator('.memorywell-refund,.memorywell-loss').count(),0,`${name}: hypothetical values have no success/loss color`);
   equal(await snapshot(page),before,`${name}: inspection preserves full storage`);
   check(await page.locator('#primary-action[data-id="leave"]').isEnabled(),`${name}: leave remains reachable`);
   if(name==='points-over-cap')await shot(page,'disabled-over-cap');
   await page.locator('#primary-action').click();const expected=E.transition(state,{type:'event-choice',id:'leave'});
   await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:keys.main,revision:expected.revision});
   equal(S.decodeSave((await snapshot(page))[keys.main]),expected,`${name}: leave commits the exact safe transition`);
  }
 });
 await run('four-desktop-layouts-and-narrow-dialog',async page=>{
  const large=structuredClone(standard);large.player.level=1_000_000;large.player.gold=10_000_000_000;large.player.talents.vitality=1_000_000;
  for(const item of large.player.items){item.level=10_000_000_000_000;item.levelXp=0;}large.player.hp=E.stats(large).maxHp;assert(S.validateSave(large));
  row.geometry=[];
  for(const [name,state]of [['standard',standard],['large-numbers',large]]){
   await load(page,state);const before=await snapshot(page);
   for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844]]){
    await page.setViewportSize({width,height});const pageSize=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')]}));
    check(pageSize.fonts.every(Boolean),`${name}/${width}: offline fonts loaded`);
    if(width>=900)check(pageSize.scrollWidth<=width,`${name}/${width}: no whole-page horizontal overflow`);
    const room=page.locator('.event-screen [data-memorywell-preview]');const rg=await geometry(room);checkGeometry(rg,`${name}/${width}/room`);
    await page.locator('[data-action="event-choice"][data-id="reset"]').click();const dialog=page.locator('dialog[open]'),dg=await geometry(dialog.locator('[data-memorywell-preview]'));checkGeometry(dg,`${name}/${width}/dialog`);
    const bounds=await dialog.evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight};});
    check(bounds.left>=-1&&bounds.top>=-1&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,`${name}/${width}: dialog contained in viewport`);
    check(await dialog.locator('[data-action="confirm"]').isEnabled(),`${name}/${width}: confirmation remains available`);
    if((name==='standard'&&width===1366)||(name==='large-numbers'&&(width===3840||width===390)))await shot(page,`${name}-dialog-${width}`);
    await dialog.locator('[data-action="close-dialog"]').first().click();equal(await snapshot(page),before,`${name}/${width}: all layout inspection is read-only`);
    row.geometry.push({name,...pageSize,room:rg,dialog:dg,dialogBounds:bounds,wholePageSupported:width>=900});
   }
  }
 });
 if(args['--natural-fixture'])await run('recorded-natural-journey-replay',async page=>{
  const raw=await fs.readFile(args['--natural-fixture'],'utf8'),input=JSON.parse(raw);
  const state=input.format==='dice-abyss'?S.decodeSave(raw):input.state||input;
  assert(S.validateSave(state));assert.equal(state.event?.key,'memorywell');assert.equal(state.event?.status,'pending');
  row.provenance=args['--natural-provenance']?JSON.parse(await fs.readFile(args['--natural-provenance'],'utf8')):input.provenance||'Read the accompanying natural journey receipt for the generation path.';
  row.fixtureFileSha256=hash(await fs.readFile(args['--natural-fixture']));row.browserReplayOnly=true;
  await decision(page,state,'natural-memorywell',{screenshot:true});
 });
}finally{
 report.finished=new Date().toISOString();report.summary={groups:report.cases.length,passed:report.cases.filter(c=>c.status==='PASS').length,failed:report.cases.filter(c=>c.status==='FAIL').length,checks:report.cases.reduce((n,c)=>n+c.checks.length,0),runtimeErrors:report.errors.length};
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify(report.summary));if(report.summary.failed||report.errors.length)process.exitCode=1;
