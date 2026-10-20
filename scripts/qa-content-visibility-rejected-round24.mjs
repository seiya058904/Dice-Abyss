// Reproduce the rejected Round24 content-visibility candidate, without changing
// the shipped CSS. Functional experiment only: no latency or FPS sampling.
// Fresh contexts use the selected release as the control, then inject 22rem.
// Example: PLAYWRIGHT_MODULE=/absolute/playwright/index.js CHROMIUM_PATH=/absolute/chrome
// node scripts/qa-content-visibility-rejected-round24.mjs --source=/absolute/Dice-Abyss \
//   --url=http://127.0.0.1:4195/ --output=/absolute/external/css-regression
// Exit 0 means the control passed and only the known candidate anchor defect
// was reproduced; it never means the candidate CSS passed or was published.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const {values:a}=parseArgs({options:{source:{type:'string'},url:{type:'string'},output:{type:'string'},intrinsic:{type:'string'}}});
assert(a.source&&a.output&&a.url,'Provide --source, --url and an external --output directory');
const source=path.resolve(a.source),output=path.resolve(a.output),url=a.url;
assert(!output.startsWith(source+path.sep)&&output!==source);
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
const [E,S]=await Promise.all(['src/engine.js','src/storage.js'].map(file=>import(pathToFileURL(path.join(source,file)))));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const hash=x=>createHash('sha256').update(x).digest('hex');
const files=['src/app.js','src/views.js','src/engine.js','src/storage.js','src/inventory-dom.js','src/inventory-render.js','src/responsive.css','src/release.js'];
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await fs.readFile(path.join(source,f)))])));
const fixture=E.newGame(27017);fixture.runId='round24-css-native-input-27017';fixture.floor=200;fixture.player.level=100;fixture.player.gold=1000000;fixture.player.hp=E.stats(fixture).maxHp;
while(fixture.player.items.length<10000)fixture.player.items.push(E.makeItem(fixture,undefined,fixture.nextId%8));
assert(S.validateSave(fixture));const fixtureRaw=S.encodeSave(fixture);
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
await fs.mkdir(output,{recursive:true});
const report={status:'RUNNING',protocol:{kind:'Native functional comparison; no timing claim',url,source,viewport:{width:1920,height:1080},fixtureSha256:hash(fixtureRaw),fixtureItems:10000,seed:27017,sourceHashes,scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),variants:['none',a.intrinsic||'22rem'],tolerance:1,backend:'Headless Linux ANGLE SwiftShader; isolated contexts; native Web Locks and localStorage',fallback:'Parent actually attempted Browser plugin and CUA; both ERR_CONNECTION_REFUSED for loopback; taskbook permits isolated Playwright fallback'},variants:[],errors:[]};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
async function settle(page){await page.evaluate(()=>new Promise(resolve=>{let count=0;const tick=()=>++count>=4?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}));}
// Chromium animates native PageDown/End even when CSS motion is reduced.
// Wait for the real scroller to settle, without replacing keyboard or scroll APIs.
// The earlier exploratory attempt sampled at four rAFs; its false PageUp/Home
// direction assertions on both variants are retained in the external evidence.
async function settleScroll(page){await page.evaluate(()=>new Promise((resolve,reject)=>{
  const list=document.querySelector('.inventory-list'),start=performance.now();
  let prior=[list.scrollTop,window.scrollY],stable=0;
  const tick=()=>{const current=[list.scrollTop,window.scrollY];stable=current.every((x,i)=>x===prior[i])?stable+1:0;prior=current;
    if(stable>=6&&performance.now()-start>=150)return resolve();
    if(performance.now()-start>3000)return reject(Error('Native inventory scroll did not settle within 3 seconds'));
    requestAnimationFrame(tick);};requestAnimationFrame(tick);
}));}
async function observe(page){return page.evaluate(()=>{
  const list=document.querySelector('.inventory-list'),rect=list.getBoundingClientRect(),active=document.activeElement,focusBox=active.getBoundingClientRect();
  const cards=[...list.children].map((card,index)=>{const box=card.getBoundingClientRect();return {id:card.querySelector('[data-action="lock"]').dataset.id,index,offset:box.top-rect.top,height:box.height,expanded:card.querySelector('h3').checkVisibility({contentVisibilityAuto:true})};});
  const visible=cards.filter(c=>c.offset<list.clientHeight&&c.offset+c.height>0);
  return {scroll:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,documentScroll:window.scrollY,visible,skipped:cards.filter(c=>!c.expanded).length,cards,
    focus:{tag:active.tagName,id:active.id,data:{...active.dataset},disabled:!!active.disabled,inDialog:!!active.closest('dialog[open]'),inList:list.contains(active),top:focusBox.top-rect.top,bottom:focusBox.bottom-rect.top,inside:focusBox.bottom>Math.max(0,rect.top)&&focusBox.top<Math.min(innerHeight,rect.bottom)}};
});}
try{
for(const intrinsic of report.protocol.variants){
  const css=intrinsic==='none'?'':`.inventory-list > .item-card { content-visibility:auto; contain-intrinsic-block-size:auto ${intrinsic}; }`;
  const row={intrinsic,css,checks:[],observations:{},errors:[]};report.variants.push(row);
  const check=(passed,label,detail)=>{row.checks.push({passed:!!passed,label,...(detail===undefined?{}:{detail})});};
  const near=(actual,expected,label)=>check(Math.abs(actual-expected)<=1,label,{actual,expected,delta:actual-expected,tolerance:1});
  const exact=(actual,expected,label)=>{try{assert.deepEqual(actual,expected);check(true,label);}catch(e){check(false,label,String(e));}};
  const context=await browser.newContext({viewport:report.protocol.viewport,reducedMotion:'reduce',deviceScaleFactor:1});
  try{
    await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',e=>{row.errors.push(String(e));report.errors.push({intrinsic,message:String(e)});});
    page.on('console',e=>{if(e.type()==='error'){row.errors.push(e.text());report.errors.push({intrinsic,message:e.text()});}});
    await page.goto(url);await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{raw:fixtureRaw,keys});
    await page.reload();await page.evaluate(()=>document.fonts.ready);if(css)await page.addStyleTag({content:css});
    await page.locator('[data-action="continue"]').click();await page.locator('.main-nav [data-action="inventory"]').click();await settle(page);
    check(new URL(page.url()).origin===new URL(url).origin,'page identity stays on selected loopback origin');
    row.title=await page.title();check(row.title.includes('骰'), 'page title identifies the game');
    check(await page.locator('.inventory-screen h1').innerText()==='随身行囊','actual inventory content is mounted');
    check(await page.locator('.inventory-list > .item-card').count()===60,'all 60 first-page cards remain in the DOM');
    const served=await page.evaluate(async files=>Object.fromEntries(await Promise.all(files.map(async f=>{const r=await fetch(f,{cache:'no-store'});if(!r.ok)throw Error(f);return [f,[...new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('')];}))),files);
    exact(served,sourceHashes,'served sources match on-disk current release');
    check(await page.evaluate(()=>!!navigator.locks),'native Web Locks are present');
    row.observations.initial=await observe(page);
    check(row.observations.initial.visible.every(c=>c.expanded),'all initially visible card content is laid out');
    await page.screenshot({path:path.join(output,`${intrinsic}-top.png`)});

    const list=page.locator('.inventory-list');const box=await list.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    const wheel=[];let before=await observe(page);
    for(const direction of [1,-1])for(let step=0;step<16;step++){
      await page.mouse.wheel(0,480*direction);await settleScroll(page);const after=await observe(page);
      const canMove=direction>0?before.scroll<before.scrollHeight-before.clientHeight-1:before.scroll>1;
      check(!canMove||(after.scroll-before.scroll)*direction>0,`native wheel ${direction>0?'down':'up'} ${step+1} advances in the requested direction`);
      check(after.visible.length>0&&after.visible.every(c=>c.expanded),`native wheel ${direction>0?'down':'up'} ${step+1} exposes complete visible cards`);
      check(after.documentScroll===0,`native wheel ${direction>0?'down':'up'} ${step+1} stays in the inventory scroller`);
      wheel.push({direction,step,scroll:after.scroll,scrollHeight:after.scrollHeight,visible:after.visible,skipped:after.skipped});before=after;
    }
    row.observations.wheel=wheel;

    const first=page.locator('.inventory-list [data-action="lock"]').first();await first.focus();await settle(page);
    const tabs=[];
    for(let i=0;i<48;i++){
      await page.keyboard.press('Tab');await settleScroll(page);const after=await observe(page);
      check(after.focus.inList&&!after.focus.disabled&&after.focus.inside,`native Tab ${i+1} reveals and focuses a usable inventory action`);
      check(after.visible.every(c=>c.expanded),`native Tab ${i+1} keeps all visible cards rendered`);
      if(i%6===5)tabs.push({index:i+1,scroll:after.scroll,focus:after.focus,visible:after.visible});
    }
    row.observations.tabs=tabs;
    const paging=[];
    for(const key of ['PageDown','PageDown','PageDown','PageUp','PageUp','End','Home']){
      const prior=await observe(page);await page.keyboard.press(key);await settleScroll(page);const after=await observe(page);
      const direction=['PageDown','End'].includes(key)?1:-1;
      check((after.scroll-prior.scroll)*direction>0,`native ${key} changes the inventory scroll in the expected direction`);
      check(after.visible.length>0&&after.visible.every(c=>c.expanded),`native ${key} shows complete visible card content`);
      paging.push({key,before:prior.scroll,after:after.scroll,scrollHeight:after.scrollHeight,visible:after.visible});
    }
    row.observations.paging=paging;
    exact(await page.evaluate(key=>localStorage.getItem(key),keys.main),fixtureRaw,'wheel and keyboard navigation preserve every primary save byte');
    exact(await page.evaluate(key=>localStorage.getItem(key),keys.mirror),fixtureRaw,'wheel and keyboard navigation preserve every mirror save byte');

    let expected=fixture;const locks=[];
    for(const index of [15,30,55]){
      const control=page.locator('.inventory-list [data-action="lock"]').nth(index),id=await control.getAttribute('data-id');
      await control.scrollIntoViewIfNeeded();await control.focus();await settle(page);const prior=await observe(page);
      await control.press('Enter');expected=E.transition(expected,{type:'lock',id});
      await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:keys.main,revision:expected.revision});await settle(page);const after=await observe(page);
      near(after.cards.find(c=>c.id===id).offset,prior.cards.find(c=>c.id===id).offset,`deep item ${index} lock preserves its visible card anchor`);
      check(after.focus.data.id===id&&after.focus.data.action==='lock'&&after.focus.inside,`deep item ${index} lock retains a visible keyboard action`);
      exact(S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),keys.main)),expected,`deep item ${index} lock commits the exact authoritative engine state`);
      exact(await page.evaluate(keys=>localStorage.getItem(keys.main)===localStorage.getItem(keys.mirror),keys),true,`deep item ${index} lock keeps primary and mirror identical`);
      locks.push({index,id,before:prior,after});
    }
    row.observations.locks=locks;
    await page.screenshot({path:path.join(output,`${intrinsic}-deep-lock.png`)});
    await page.locator('[data-action="settings"]').click();await page.locator('dialog[open] #effects').focus();await settle(page);const prior=await observe(page);
    await page.locator('dialog[open] #effects').selectOption('full');await settle(page);const after=await observe(page);const anchor=prior.visible[0];
    near(after.cards.find(c=>c.id===anchor.id).offset,anchor.offset,'deep inventory background keeps its visible anchor after settings redraw');
    check(after.focus.id==='effects'&&after.focus.inDialog,'settings retains its native modal focus after redraw');
    exact(S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),keys.main)),expected,'settings redraw preserves the complete saved gameplay state');
    await page.keyboard.press('Escape');await settle(page);const closed=await observe(page);
    near(closed.cards.find(c=>c.id===anchor.id).offset,anchor.offset,'closing settings leaves the original deep inventory anchor unchanged');
    row.observations.settings={anchor,before:prior,after,closed};
    await page.screenshot({path:path.join(output,`${intrinsic}-after-settings.png`)});
    check(row.errors.length===0,'no relevant page errors or console errors');
  }catch(e){row.failure={message:String(e),stack:e.stack};}
  finally{await context.close();row.status=row.failure||row.checks.some(c=>!c.passed)?'FAIL':'PASS';await save();console.log(JSON.stringify({intrinsic:row.intrinsic,status:row.status,checks:row.checks.length,failures:row.checks.filter(c=>!c.passed),error:row.failure?.message}));}
}
const hashesAfter=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await fs.readFile(path.join(source,f)))])));
assert.deepEqual(hashesAfter,sourceHashes,'runtime source remains stable through the functional comparison');report.sourceHashesAfter=hashesAfter;
const [control,candidate]=report.variants;
const knownFailures=new Set(['deep inventory background keeps its visible anchor after settings redraw','closing settings leaves the original deep inventory anchor unchanged']);
const candidateFailures=candidate.checks.filter(c=>!c.passed);
report.knownCandidateAnchorDefectReproduced=control.status==='PASS'&&!candidate.failure&&candidateFailures.length>0&&candidateFailures.every(c=>knownFailures.has(c.label));
report.status=report.knownCandidateAnchorDefectReproduced?'REJECTED_CANDIDATE_REPRODUCED':control.status!=='PASS'?'FAILED_CONTROL':'REVIEW_REQUIRED';
if(!report.knownCandidateAnchorDefectReproduced)process.exitCode=1;
}catch(e){report.status='FAILED';report.failure={message:String(e),stack:e.stack};process.exitCode=1;}
finally{await browser.close();await save();console.log(JSON.stringify({status:report.status,variants:report.variants.map(v=>({intrinsic:v.intrinsic,status:v.status,checks:v.checks.length,failed:v.checks.filter(c=>!c.passed).length})),errors:report.errors.length}));}
