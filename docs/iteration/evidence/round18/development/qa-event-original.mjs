// Optional real-browser QA. Uses supplied Playwright/Chromium, not game deps.
// All fixtures, file uploads and storage live in disposable loopback contexts.
// --before captures the same equipment fixture against the input version.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {loadEventApi,eventFixture} from './audit-event-context.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
const source=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),out=path.resolve(args['--output']||'/tmp/dice-r18-events');
const url=args['--url']||'http://127.0.0.1:4189/',beforeMode=!!args['--before'];
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
const api=await loadEventApi(source),{E,S,C}=api;
await fs.mkdir(out,{recursive:true});
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={source,url,beforeMode,browser:browser.version(),synthetic:true,started:new Date().toISOString(),cases:[],errors:[],checks:0,notes:['Constructed valid entry states, actual UI actions and exact complete-state assertions.','Logical viewports and software rendering; not physical devices, screen-reader or GPU certification.','Failed file reads are delayed only inside isolated QA contexts to test ordering.']};
const hashFiles=['src/app.js','src/views.js','src/storage.js','src/encounters.js','src/event-references.js','src/event-equipment.css'];
report.sourceHashes=await Promise.all(hashFiles.map(async file=>{try{return {file,sha256:sha(await fs.readFile(path.join(source,file),'utf8'))};}catch{return {file,missing:true};}}));
let trace=[];
const check=(value,label)=>{report.checks++;trace.push({label,passed:!!value});assert(value,label);};
const equal=(actual,expected,label)=>{report.checks++;const row={label,actualSha256:sha(actual),expectedSha256:sha(expected)};trace.push(row);assert.deepEqual(actual,expected,label);row.passed=true;};
function fixture(key){for(let seed=1;seed<=300;seed++){const s=eventFixture(api,['silent_anvil','hollow_scale','relic_exchange'].includes(key)?'mystery':key,{seed,floor:140,rich:true});if(s.event.key===key)return s;}throw Error(key);}
const action=(p,a)=>p.locator(`[data-action="${a}"]`),option=(p,id)=>p.locator(`.event-options [data-action="event-choice"][data-id="${id}"]`);
const saved=p=>p.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY);
const records=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
const revision=(p,r)=>p.waitForFunction(({key,r})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===r,{key:S.SAVE_KEY,r});
const idle=p=>p.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
async function load(page,s){
 assert(S.validateSave(s));await page.goto(url);
 await page.evaluate(({raw,main,backup,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(backup,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{raw:S.encodeSave(s),main:S.SAVE_KEY,backup:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await action(page,'continue').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
}
async function shot(page,name){await page.screenshot({path:path.join(out,`${name}.jpg`),type:'jpeg',quality:78});}
async function run(name,fn){
 if(args['--case']&&args['--case']!==name)return;
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);trace=[];
 page.on('pageerror',error=>report.errors.push({name,error:String(error)}));page.on('console',m=>{if(m.type()==='error')report.errors.push({name,error:m.text()});});
 const start=performance.now(),checks=report.checks;
 try{await fn({context,page});report.cases.push({name,status:'PASS',checks:report.checks-checks,trace,ms:performance.now()-start});}
 catch(error){report.cases.push({name,status:'FAIL',checks:report.checks-checks,trace,error:String(error),stack:error.stack});await shot(page,`FAIL-${name}`).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(`${name}: ${report.cases.at(-1).status}`);
}
function malformedAnvil(){const s=fixture('silent_anvil');const target=s.player.items.find(i=>i.id===s.event.targetId);target.enhance=5;s.event.offerId=target.id;return s;}
function uncheckedEnvelope(s){const payload=JSON.stringify(s);let h=2166136261;for(let i=0;i<payload.length;i++){h^=payload.charCodeAt(i);h=Math.imul(h,16777619);}return JSON.stringify({format:'dice-abyss',version:s.version,checksum:(h>>>0).toString(16),payload});}
const upload=(p,raw,name='round18-save.json')=>p.locator('#save-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(raw)});
async function settings(page){await action(page,'settings').click();await page.locator('#save-file').waitFor({state:'attached'});}

try{
 if(beforeMode){
  await run('input-equipment-same-fixture',async({page})=>{
   const s=fixture('silent_anvil');await load(page,s);equal(await saved(page),s,'fixture loads without changes');
   check(await page.locator('.event-atmosphere').isVisible(),'input has decorative event emblem');
   check(await page.locator('.event-equipment').count()===0,'input has no explicit material/target area');
   await shot(page,'event-before');await option(page,'accept').click();await shot(page,'review-before');
   equal(await saved(page),s,'opening old review spends nothing');
  });
 }else{
  await run('material-review-compare-cancel-commit-refresh',async({page})=>{
   const s=fixture('silent_anvil'),offer=s.event.offerId,target=s.event.targetId;await load(page,s);
   check((await page.title()).includes('Dice Abyss'),'page identity');check((await page.locator('#app').innerText()).length>100,'meaningful app renders');
   check(await page.locator('.event-equipment').isVisible(),'concrete equipment replaces empty emblem');
   check(await page.locator('.event-atmosphere').count()===0,'equipment view has no unknown-emblem duplication');await shot(page,'event-after');
   await page.locator(`[data-event-item-id="${offer}"] [data-action="compare-details"]`).click();check(await page.locator('dialog[open]').isVisible(),'material comparison is reachable');equal(await saved(page),s,'comparison never writes game state');
   await action(page,'close-dialog').filter({visible:true}).first().click();await option(page,'accept').click();
   const review=page.locator('dialog[open]');check(await review.locator(`[data-event-item-id="${offer}"]`).isVisible(),'review names exact consumed item');check(await review.locator(`[data-event-item-id="${target}"]`).isVisible(),'review names exact retained target');
   check(await review.locator('[data-action="compare-details"]').count()===0,'payment cannot be replaced by nested comparison');await shot(page,'review-after');
   await review.getByRole('button',{name:'取消',exact:true}).click();equal(await saved(page),s,'cancelling changes no full state');
   await option(page,'accept').click();await action(page,'confirm').click();const expected=E.transition(s,{type:'event-choice',id:'accept',confirmed:true});await revision(page,expected.revision);equal(await saved(page),expected,'native accept matches full engine transaction');
   check(!expected.player.items.some(i=>i.id===offer)&&expected.player.items.some(i=>i.id===target),'only material is consumed');
   await page.reload();await action(page,'continue').click();equal(await saved(page),expected,'refresh preserves full committed result');
  });
  await run('blank-materials-all-consumption-paths',async({page})=>{
   for(const [key,id]of [['exchange','salvage'],['exchange','relic'],['relic_exchange','accept'],['silent_anvil','accept'],['offering','accept'],['relicloom','accept']]){
    const s=fixture(key),offer=s.player.items.find(i=>i.id===s.event.offerId);offer.name='';offer.levelXp=17;await load(page,s);
    const item=page.locator(`[data-event-item-role="consume"][data-event-item-id="${offer.id}"]`);
    check((await item.innerText()).includes(`（${offer.id}）`),`${key}/${id} names blank item by ID`);check((await item.innerText()).includes('17 /'),`${key}/${id} shows actual XP`);
    check(!(await option(page,id).innerText()).includes('已不存在'),`${key}/${id} never calls unnamed item missing`);
    await option(page,id).click();check((await page.locator('dialog[open]').innerText()).includes('17 /'),`${key}/${id} keeps XP in confirmation`);
    equal(await saved(page),s,`${key}/${id} review keeps full source state`);
    await action(page,'confirm').click();const expected=E.transition(s,{type:'event-choice',id,confirmed:true});await revision(page,expected.revision);equal(await saved(page),expected,`${key}/${id} exact payment`);
   }
  });
  await run('protected-material-and-registered-target',async({page})=>{
   let s=fixture('silent_anvil');await load(page,s);await page.locator('.main-nav [data-action="inventory"]').click();await page.locator(`.inventory-list [data-action="lock"][data-id="${s.event.offerId}"]`).click();s=E.transition(s,{type:'lock',id:s.event.offerId});await revision(page,s.revision);
   await page.locator('.main-nav [data-action="game"]').click();check(!await option(page,'accept').isEnabled(),'locked material cannot be chosen');check((await page.locator('[data-event-item-role="consume"]').innerText()).includes('已锁定'),'locked material explains protection');equal(await saved(page),s,'lock is exactly one original transaction');
   await page.reload();await action(page,'continue').click();equal(await saved(page),s,'protected pending save still loads');check(!await option(page,'accept').isEnabled(),'protection survives refresh');
   for(const key of ['silent_anvil','hollow_scale']){
    let changed=fixture(key);const target=changed.event.targetId,newWeapon=E.makeItem(changed,'weapon',1);changed.player.items.push(newWeapon);changed=E.transition(changed,{type:'equip',id:newWeapon.id});changed=E.transition(changed,{type:'lock',id:target});await load(page,changed);
    check(await page.locator(`[data-event-item-role="retain"][data-event-item-id="${target}"]`).isVisible(),`${key} keeps original weapon target`);check(await option(page,'accept').isEnabled(),`${key} retained locked weapon remains upgradable`);
    await option(page,'accept').click();await action(page,'confirm').click();const after=E.transition(changed,{type:'event-choice',id:'accept',confirmed:true});await revision(page,after.revision);equal(await saved(page),after,`${key} original target upgrade and unknown fields exact`);
   }
  });
  await run('invalid-import-preservation-and-same-file-retry',async({page})=>{
   const current=E.newGame(18181);current.futureMetadata={keep:['unchanged',17]};await load(page,current);const original=await records(page);await settings(page);
   await upload(page,uncheckedEnvelope(malformedAnvil()),'same-file.json');await page.locator('#save-import-result[data-state="error"]').waitFor();
   check((await page.locator('#save-import-result').innerText()).includes('同一件装备'),'specific contradictory-reference error persists');check(await page.locator('[data-action="confirm"]').count()===0,'invalid import never opens a commit review');equal(await records(page),original,'invalid import changes no main, mirror, settings or archive records');
   check(await page.locator('#save-file').inputValue()==='','native input is reset for same filename retry');await shot(page,'import-error');
   await upload(page,'{"broken":','same-file.json');await page.locator('#save-import-result').filter({hasText:'有效的 JSON'}).waitFor();equal(await records(page),original,'same-name malformed retry still preserves all records');
   const imported=fixture('offering');imported.futureMetadata={nested:{retained:true}};const raw=S.encodeSave(imported);await upload(page,raw,'same-file.json');await page.locator('dialog[open] #dialog-title').filter({hasText:'导入这段旅途'}).waitFor();
   equal(await records(page),original,'valid same-name retry still needs explicit confirmation');await action(page,'confirm').click();await revision(page,imported.revision);equal(await saved(page),imported,'valid import preserves complete unknown fields and state');
   await page.reload();await action(page,'continue').click();equal(await saved(page),imported,'import refresh is exact');
  });
  await run('stale-file-read-cancel-and-latest-selection',async({page})=>{
   const current=E.newGame(18182);await load(page,current);const initial=await records(page);await settings(page);
   await page.evaluate(()=>{const read=File.prototype.text;window.__qaReleaseRead=null;File.prototype.text=function(){if(this.name==='slow.json')return new Promise(resolve=>{window.__qaReleaseRead=()=>read.call(this).then(resolve);});return read.call(this);};});
   const oldRaw=S.encodeSave(fixture('silent_anvil'));await upload(page,oldRaw,'slow.json');await page.locator('#save-import-result[data-state="reading"]').waitFor();
   const chooserPromise=page.waitForEvent('filechooser');await page.locator('dialog[open] [data-action="import"]').first().click();const chooser=await chooserPromise;
   await page.evaluate(()=>window.__qaReleaseRead());await page.waitForTimeout(40);
   check((await page.locator('#dialog-title').innerText()).includes('旅途设置'),'opening another chooser cancels old read before the next change');equal(await records(page),initial,'late old read cannot commit or archive');
   const newer=fixture('offering');await chooser.setFiles({name:'latest.json',mimeType:'application/json',buffer:Buffer.from(S.encodeSave(newer))});await page.locator('#dialog-title').filter({hasText:'导入这段旅途'}).waitFor();await action(page,'confirm').click();await revision(page,newer.revision);equal(await saved(page),newer,'latest selected file is the only imported state');
   await settings(page);await upload(page,oldRaw,'slow.json');await page.locator('#save-import-result[data-state="reading"]').waitFor();await page.locator('dialog[open] [data-action="close-dialog"]').click();await page.evaluate(()=>window.__qaReleaseRead());await page.waitForTimeout(40);
   check(!await page.locator('dialog').isVisible(),'closing settings prevents a late review from reopening');equal(await saved(page),newer,'closed stale read never changes game state');
  });
  await run('responsive-equipment-and-import-error',async({page})=>{
   const sizes=[[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,760]];
   const s=fixture('silent_anvil');for(const item of s.player.items)if([s.event.offerId,s.event.targetId].includes(item.id))item.name='长夜刻痕'.repeat(16);
   for(const [width,height]of sizes){
    await page.setViewportSize({width,height});await load(page,s);
    const geometry=await page.locator('.event-equipment').evaluate(node=>{
     const box=node.getBoundingClientRect(),children=[...node.querySelectorAll('h2,h3,p,dt,dd,button')].map(el=>({tag:el.tagName,font:parseFloat(getComputedStyle(el).fontSize),left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:el.clientWidth,scroll:el.scrollWidth}));
     return {left:box.left,right:box.right,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,children};
    });
    check(geometry.left>=-1&&geometry.right<=width+1,`${width}: material area fits viewport`);check(geometry.pageWidth<=width+1,`${width}: no horizontal page overflow`);
    check(geometry.children.every(c=>c.font>=12&&c.left>=geometry.left-1&&c.right<=geometry.right+1&&c.scroll<=c.width+2),`${width}: long names and numeric rows fit readable bounds`);
    await option(page,'accept').click();const modal=await page.locator('dialog[open]').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,height:el.getBoundingClientRect().height,viewport:innerHeight}));check(modal.scroll<=modal.client+2&&modal.height<=height+1,`${width}: confirmation fits and scrolls`);
    await page.locator('dialog[open]').getByRole('button',{name:'取消',exact:true}).click();equal(await saved(page),s,`${width}: responsive review never changes state`);
    if(width===1366||width===390)await shot(page,`equipment-${width}`);
    await settings(page);await upload(page,uncheckedEnvelope(malformedAnvil()),'超长文件名称'.repeat(10)+'.json');await page.locator('#save-import-result[data-state="error"]').waitFor();
    const error=await page.locator('#save-import-result').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,font:parseFloat(getComputedStyle(el).fontSize)}));check(error.scroll<=error.client+2&&error.font>=14,`${width}: import error remains readable without horizontal overflow`);
    if(width===390)await shot(page,'import-error-390');
   }
  });
 }
}finally{
 report.finished=new Date().toISOString();report.passed=report.cases.every(c=>c.status==='PASS')&&!report.errors.length;
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({passed:report.passed,groups:report.cases.length,checks:report.checks,failures:report.cases.filter(c=>c.status!=='PASS').map(c=>({name:c.name,error:c.error})),errors:report.errors},null,2));
if(!report.passed)process.exitCode=1;
