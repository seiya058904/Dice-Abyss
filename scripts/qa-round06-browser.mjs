// Native browser integration for the round 06 storage boundary and event copy.
// Tester-provided Playwright/Chromium, isolated loopback contexts, synthetic saves.
// No quota replacement, production API stubbing, remote pages or private saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEventApi,contextFixtures} from './audit-event-context.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(0,at),arg.slice(at+1)];}));
const root=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(args['--output']||'/tmp/dice-round06-browser-qa');
assert(!output.startsWith(root+path.sep),'Keep generated QA output outside the complete project');
const baseline=args['--label']==='baseline',url=args['--url']||'http://127.0.0.1:4267/';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only loopback test origins');
const api=await loadEventApi(root),{E,S,C}=api,require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY,legacy:S.LEGACY_BACKUP_KEY,v4:S.V4_BACKUP_KEY};
const viewport={width:1920,height:1080},selected=new Set((args['--cases']||'').split(',').filter(Boolean));
await fs.mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),label:baseline?'baseline':'current',source:root,url,synthetic:true,scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url),'utf8')),cases:[],errors:[],notes:[
 'All event and extension-field fixtures are explicitly synthetic, accepted by the original validator. They are not natural player saves.',
 'Native clicks, file input, real app event handlers, native localStorage and Web Locks; no quota or storage method replacement.',
 'Functional checks use reduced motion and low effects. Elapsed test time is not an FPS, GPU or physical disk benchmark.',
 'A near-5-MB import may fit the primary while its mirror exceeds native origin quota. The actual outcome is recorded separately from the format boundary.',
 'Screenshots are actual browser captures. Viewport dimensions simulate desktop sizes, not physical devices.'
]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let row;
const check=(condition,label)=>{row.checks.push({label,passed:!!condition});assert(condition,label);};
const equal=(a,b,label)=>{row.checks.push({label,passed:false});assert.deepEqual(a,b,label);row.checks.at(-1).passed=true;};
const button=(page,action)=>page.locator(`[data-action="${action}"]`);
const snapshot=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
const raw=page=>page.evaluate(key=>localStorage.getItem(key),keys.main);
async function fresh(state=null){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
 page.setDefaultTimeout(30000);
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)?route.continue():route.abort();});
 page.on('pageerror',error=>report.errors.push({case:row.name,type:'pageerror',message:error.message}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({case:row.name,type:'console',message:message.text()});});
 await page.goto(url);await page.evaluate(({keys,raw})=>{localStorage.clear();localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));if(raw){localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);}},{keys,raw:state?S.encodeSave(state):null});
 await page.reload();await page.evaluate(()=>document.fonts.ready);
 if(!report.environment)report.environment=await page.evaluate(async()=>{
  const gl=document.querySelector('.dice-surface')?.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
  const files=await Promise.all(['src/app.js','src/storage.js','src/encounters.js','src/views.js','src/dice-renderer.js'].map(async file=>{const res=await fetch(new URL(file,location.href),{cache:'no-store'}),bytes=await res.arrayBuffer();return {file,status:res.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')};}));
  return {ua:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,webLocks:!!navigator.locks,release:document.querySelector('meta[name="dice-abyss-release"]').content,files};
 });
 if(state){await button(page,'continue').click();await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));}
 return {context,page};
}
async function run(name,fn){
 if(selected.size&&!selected.has(name))return;
 row={name,status:'RUNNING',checks:[]};report.cases.push(row);const start=performance.now();let env;
 try{env=await fresh();await fn(env);row.status=baseline&&row.reproduced?'REPRODUCED':'PASS';}
 catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;if(env)await env.page.screenshot({path:path.join(output,`FAIL-${name}.png`)}).catch(()=>{});}
 finally{row.durationMs=performance.now()-start;await env?.context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(`${name}: ${row.status} (${row.checks.length} checks)`);
}
async function load(page,state){
 assert(S.validateSave(state));await page.evaluate(({keys,raw})=>{localStorage.clear();localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);},{keys,raw:S.encodeSave(state)});
 await page.reload();await button(page,'continue').click();await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
}
async function shot(page,name){const filename=`${name}.png`;await page.screenshot({path:path.join(output,filename)});(row.screenshots||=[]).push(filename);}
async function importFile(page,incoming,name){
 await button(page,'settings').click();await page.locator('#save-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(incoming)});
 await page.locator('dialog[open] [data-action="confirm"]').waitFor();await page.locator('dialog[open] [data-action="confirm"]').click();
}
function envelope(state){const payload=JSON.stringify(state);let h=2166136261;for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(h>>>0).toString(16),payload});}
function padded(state,target,encode=S.encodeSave){
 state.auditPadding='';let length=target-Buffer.byteLength(encode(state));
 for(let salt=0;salt<26;salt++)for(let attempt=0;attempt<3;attempt++){
  state.auditPadding='a'.repeat(Math.max(0,length-1))+(length?String.fromCharCode(65+salt):'');
  const value=encode(state),delta=target-Buffer.byteLength(value);if(!delta)return value;length+=delta;
 }
 throw Error('Exact-byte synthetic fixture construction failed');
}

try{
 await run('event-context-native-decisions',async({page})=>{
  const names=['offering/entry','offering/locked','offering/empty-name','offering/empty-name-locked','offering/locked-and-cap','relicloom/entry','relicloom/locked','relicloom/empty-name','relicloom/empty-name-locked','bloodwell/entry','bloodwell/larger-armor-after-entry','bloodwell/smaller-armor-after-entry','bloodwell/would-be-lethal','bloodwell/one-hp-survives','memorywell/full-hp','memorywell/below-new-cap'];
  row.scenarios=[];
  for(const fixture of contextFixtures(api).filter(f=>names.includes(f.name))){
   const {name,state}=fixture;await load(page,state);const saved=await raw(page),p=C.eventPresentation(state),id=state.event.key==='memorywell'?'reset':'accept',choice=p.options.find(o=>o.id===id),control=page.locator(`[data-action="event-choice"][data-id="${id}"]`);
   equal(await control.isDisabled(),!!choice.disabled,`${name}: authoritative control state`);
   const text=await page.locator('.event-screen').innerText(),record={name,body:p.body,optionText:await control.innerText(),disabled:!!choice.disabled,beforeSha256:hash(saved)};row.scenarios.push(record);
   if(!baseline){
    if(name.startsWith('bloodwell/'))check(text.includes('入井时')&&text.includes('换装不重算'),`${name}: stored entry cost explained`);
    if(name.startsWith('memorywell/'))check(text.includes('当前生命会被裁减')&&text.includes('重新加点不会补回'),`${name}: reset HP clipping explained`);
    if(name.includes('empty-name'))check(record.optionText.includes(`未命名旧物（${state.event.offerId}）`)&&!record.optionText.includes('已不存在'),`${name}: accepted empty name retains identity`);
    if(name.endsWith('/locked')){const item=state.player.items.find(i=>i.id===state.event.offerId);check(record.optionText.includes(item.name)&&record.optionText.includes('锁定'),`${name}: locked registered item is named`);}
   }
   equal(await raw(page),saved,`${name}: presentation is read-only`);
   if(choice.disabled){check(await page.locator('[data-action="event-choice"][data-id="leave"]').isEnabled(),`${name}: exit remains available`);continue;}
   await control.click();await page.locator('dialog[open]').waitFor();record.confirmation=await page.locator('dialog[open]').innerText();
   equal(await raw(page),saved,`${name}: review does not commit`);
   check(record.confirmation.includes(choice.detail)&&record.confirmation.includes(choice.cost),`${name}: complete cost and explanation reach confirmation`);
   await page.locator('dialog[open] [data-action="close-dialog"]').first().click();equal(await raw(page),saved,`${name}: cancel preserves exact save`);
   await control.click();await page.locator('dialog[open] [data-action="confirm"]').click();
   const expected=E.transition(state,{type:'event-choice',id,confirmed:true});
   await page.waitForFunction(({key,rev})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===rev,{key:keys.main,rev:expected.revision});
   equal(S.decodeSave(await raw(page)),expected,`${name}: one exact engine commit`);
   equal(await page.evaluate(keys=>localStorage.getItem(keys.main)===localStorage.getItem(keys.mirror),keys),true,`${name}: mirror exact`);
   record.afterSha256=hash(await raw(page));record.afterHp=expected.player.hp;record.afterRng=expected.rng;
   if(name==='bloodwell/one-hp-survives')equal(expected.player.hp,1,'bloodwell: recorded cost leaves exactly one HP');
   if(name==='memorywell/full-hp')equal(expected.player.hp,467,'memorywell: current health actually clips to the reduced maximum');
   await page.reload();await button(page,'continue').click();equal(S.decodeSave(await raw(page)),expected,`${name}: refresh cannot charge again`);
  }
  equal(row.scenarios.length,names.length,'all 16 declared event contexts executed');
 });
 await run('event-four-desktop-viewports',async({page})=>{
  row.geometry=[];
  for(const name of ['offering/locked','relicloom/empty-name','bloodwell/larger-armor-after-entry','memorywell/full-hp']){
   const state=contextFixtures(api).find(f=>f.name===name).state;await load(page,state);
   for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
    const geometry=await page.evaluate(()=>{
     const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
     return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],panel:rect(document.querySelector('#current-room')),options:[...document.querySelectorAll('.event-option')].map(n=>({rect:rect(n),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,children:[...n.children].map(rect)}))};
    });
    check(geometry.fonts.every(Boolean),`${name}/${width}: offline fonts loaded`);check(geometry.scrollWidth<=width,`${name}/${width}: no horizontal page overflow`);
    for(const [index,option]of geometry.options.entries()){
     check(option.scrollWidth<=option.clientWidth+1,`${name}/${width}/${index}: option content wraps`);
     check(option.children.every(c=>c.x>=option.rect.x-1&&c.right<=option.rect.right+1&&c.y>=option.rect.y-1&&c.bottom<=option.rect.bottom+1),`${name}/${width}/${index}: child text contained in card`);
     for(let i=1;i<option.children.length;i++)check(option.children[i-1].bottom<=option.children[i].y+1,`${name}/${width}/${index}: sections do not overlap`);
    }
    row.geometry.push({name,...geometry});
    if(width===1366||width===3840)await shot(page,`${name.replaceAll('/','-')}-${width}`);
    const id=state.event.key==='memorywell'?'reset':'accept',control=page.locator(`[data-action="event-choice"][data-id="${id}"]`);
    if(await control.isEnabled()){
     await control.click();const dialog=page.locator('dialog[open]');check(await dialog.isVisible(),`${name}/${width}: confirmation reachable by native click`);
     const g=await dialog.evaluate(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('[data-action="confirm"]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,button:{top:b.top,bottom:b.bottom},width:innerWidth,height:innerHeight};});
     check(g.top>=0&&g.left>=0&&g.right<=g.width+1&&g.bottom<=g.height+1,`${name}/${width}: dialog inside viewport`);
     await page.locator('dialog[open] [data-action="close-dialog"]').first().click();equal(await raw(page),S.encodeSave(state),`${name}/${width}: cancelled review preserves save`);
    }
   }
  }
 });
 await run('near-limit-native-import-and-action',async({page})=>{
  const state=E.newGame(77613);state.runId='size-boundary-77613';const incoming=padded(state,4_999_900),next=E.transition(state,{type:'fate'}),nextRaw=S.encodeSave(next);
  check(nextRaw.length>5_000_000,'accepted starting file grows beyond decode character limit');
  row.fixture={inputBytes:Buffer.byteLength(incoming),inputCharacters:incoming.length,inputSha256:hash(incoming),nextBytes:Buffer.byteLength(nextRaw),nextCharacters:nextRaw.length,nextSha256:hash(nextRaw)};
  await importFile(page,incoming,'synthetic-near-limit.json');await page.waitForFunction(key=>!!localStorage.getItem(key),keys.main);
  equal(await raw(page),incoming,'native file import stores the exact accepted primary');
  const before=await snapshot(page);row.importMirrorExact=before[keys.mirror]===incoming;row.importNotice=await page.locator('.toast').innerText();
  await page.locator('#primary-action').click();
  if(baseline){
   await page.waitForFunction(({key,old})=>localStorage.getItem(key)!==old,{key:keys.main,old:incoming});
   equal(await raw(page),nextRaw,'baseline native primary overwrites with the oversized committed result');
   let unreadable=false;try{S.decodeSave(await raw(page));}catch{unreadable=true;}
   check(unreadable,'baseline loader rejects its newly written primary');row.reproduced=true;
   await page.reload();check(await button(page,'continue').count()===0,'baseline cannot continue from the unreadable primary without a fitting mirror');
  }else{
   await page.locator('.toast.visible').filter({hasText:'5 MB'}).waitFor();row.actionNotice=await page.locator('.toast').innerText();
   equal(await snapshot(page),before,'new size guard preserves every native storage entry');equal(S.decodeSave(await raw(page)),state,'new guard retains exact old RNG, revision and assets');
   equal(await page.locator('.game-shell').getAttribute('data-scene'),'fate','UI remains at the uncommitted manual fate');check(await page.locator('#primary-action').isEnabled(),'refused action does not leave controls busy');
   await button(page,'settings').click();const [download]=await Promise.all([page.waitForEvent('download'),button(page,'export').click()]);const stream=await download.createReadStream();const parts=[];for await(const part of stream)parts.push(part);const exported=Buffer.concat(parts).toString('utf8');
   equal(exported,incoming,'native export exactly rescues the previous accepted file');row.exportSha256=hash(exported);
   await page.reload();await button(page,'continue').click();equal(S.decodeSave(await raw(page)),state,'reload still resumes the exact pre-action state');
  }
  row.nativeStorageEntries=Object.fromEntries(Object.entries(await snapshot(page)).map(([k,v])=>[k,{characters:v.length,utf8Bytes:Buffer.byteLength(v),sha256:hash(v)}]));
  await shot(page,'near-limit-result');
 });
 await run('migration-growth-native-file-import',async({page})=>{
  const sample=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/v4-baseline.json'),'utf8')).saves[0],legacy=JSON.parse(JSON.parse(sample.raw).payload),incoming=padded(legacy,5_000_000,envelope),migrated=S.decodeSave(incoming);
  const active=E.newGame(918);await load(page,active);const before=await snapshot(page),migratedRaw=S.encodeSave(migrated);
  row.fixture={originalBytes:Buffer.byteLength(incoming),migratedBytes:Buffer.byteLength(migratedRaw),originalSha256:hash(incoming),migratedSha256:hash(migratedRaw)};
  check(Buffer.byteLength(migratedRaw)>5_000_000,'V4 migration genuinely grows the accepted original beyond the new-write limit');
  await importFile(page,incoming,'synthetic-v4-at-limit.json');
  if(baseline){
   await page.locator('.toast.visible').waitFor();const after=await snapshot(page);row.archiveWritten=after[keys.v4]===incoming;row.originalActivePreserved=after[keys.main]===before[keys.main];row.notice=await page.locator('.toast').innerText();
   check(row.archiveWritten,'baseline writes imported original archive before later native quota rejection');row.reproduced=true;
  }else{
   await page.locator('.toast.visible').filter({hasText:'5 MB'}).waitFor();equal(await snapshot(page),before,'migration-size rejection happens before native archive, primary or mirror writes');equal(S.decodeSave(await raw(page)),active,'original small active journey remains exact');
   row.notice=await page.locator('.toast').innerText();
  }
  await shot(page,'migration-growth-result');
 });
}finally{
 report.finished=new Date().toISOString();report.summary={groups:report.cases.length,passed:report.cases.filter(c=>c.status==='PASS').length,reproduced:report.cases.filter(c=>c.status==='REPRODUCED').length,failed:report.cases.filter(c=>c.status==='FAIL').length,checks:report.cases.reduce((n,c)=>n+c.checks.length,0),runtimeErrors:report.errors.length};
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify(report.summary));if(report.summary.failed||report.errors.length)process.exitCode=1;
