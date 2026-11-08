// Isolated, reusable acceptance for the V5.27.2 decision changes. Synthetic
// records only; never attaches to a normal browser profile. Output is external.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {healthFixture,talentFixture} from '../tests/fixtures/decision-gains.mjs';

export async function runDecisionGainsQA({browser,url,output,noWebLocks=false,only=null}) {
 await fs.mkdir(output,{recursive:true});
 const report={browser:browser.version(),url,synthetic:true,noWebLocks,only,cases:[],errors:[],screenshots:[]};
 let context,page;
 const raw=()=>page.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY);
 const records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[S.SAVE_KEY,S.BACKUP_KEY]);
 async function load(s,{viewport={width:1440,height:900},suppressStorage=false}={}) {
  await context?.close();context=await browser.newContext({viewport,reducedMotion:'reduce'});
  if(noWebLocks)await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));
  if(suppressStorage)await context.addInitScript(()=>window.addEventListener('storage',e=>e.stopImmediatePropagation(),true));
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(String(e)));
  assert(S.validateSave(s));await page.goto(url);
  await page.evaluate(({keys,raw,settings})=>{for(const key of keys)localStorage.setItem(key,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{keys:[S.SAVE_KEY,S.BACKUP_KEY],raw:S.encodeSave(s),settings:S.SETTINGS_KEY});
  await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.game-shell').waitFor();
 }
 async function exact(s) {assert.deepEqual((await records()).map(S.decodeSave),[s,s]);}
 async function committed(s) {await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:s.revision});await exact(s);}
 const inventory=()=>page.locator('.main-nav [data-action="inventory"]').click();
 const equip=id=>page.locator(`[data-action="equip"][data-id="${id}"]`);
 async function shot(name) {await page.screenshot({path:path.join(output,`${name}.png`)});report.screenshots.push(`${name}.png`);}
 async function check(name,body) {
  if(only&&name!==only)return;
  const row={name,status:'RUNNING'};report.cases.push(row);
  try{await body();row.status='PASS';console.log(`decision-gains: ${name}: PASS`);}
  catch(e){row.status='FAIL';row.error=e.stack;await shot(`FAIL-${name}`).catch(()=>{});throw e;}
  finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
 }
 try {
  await check('capped-normal-partial-talent-and-reload',async()=>{
   for(const mode of ['capped','normal','partial']){
    const s=talentFixture(mode);await load(s);await page.locator('.main-nav [data-action="talents"]').click();
    const before=await records();await page.locator('[data-talent-preview="attune"]').focus();
    const row=page.locator('[data-benefit-key="echo"]');await row.waitFor();
    const expected=E.transition(s,{type:'talent',id:'attune'});
    assert.equal(Number(await row.getAttribute('data-before')),E.diceOdds(s).echoChance);
    assert.equal(Number(await row.getAttribute('data-after')),E.diceOdds(expected).echoChance);
    assert.deepEqual(await records(),before,'focus/preview writes nothing');
    if(mode==='capped'){
     assert.match(await page.locator('#talent-preview').innerText(),/无额外增益/);
     await page.locator('[data-action="talent-count"][data-count="max"]').click();
     assert.equal(await page.locator('[data-talent-inspected="attune"]').getAttribute('data-preview-count'),'5');
     await page.locator('[data-action="talent-count"][data-count="1"]').click();await shot('talent-capped');
    } else if(mode==='partial')assert.match(await page.locator('#talent-preview').innerText(),/部分增量/);
    await page.locator('[data-talent-preview="attune"]').press('Enter');await committed(expected);
    await page.reload();await page.locator('[data-action="continue"]').click();await exact(expected);
   }
  });
  await check('health-cancel-confirm-return-and-reload',async()=>{
   const s=healthFixture();await load(s);await inventory();const before=await records();
   await equip('i4').click();await page.locator('.equip-health-review').waitFor();
   assert.match(await page.locator('dialog').innerText(),/269 → 248/);assert.match(await page.locator('dialog').innerText(),/换回原装备不会补回/);
   await exact(s);await shot('health-confirmation');await page.keyboard.press('Escape');assert.deepEqual(await records(),before);
   assert.equal(await page.locator('[data-action="equip"][data-id="i4"]').evaluate(el=>el===document.activeElement),true,'cancel returns to the reviewed item');
   await equip('i4').press('Enter');await page.locator('[data-action="confirm"]').click();
   const swapped=E.transition(s,{type:'equip',id:'i4',slot:'armor'});await committed(swapped);assert.equal(swapped.player.hp,248);
   const restored=E.transition(swapped,{type:'equip',id:'i2',slot:'armor'});await equip('i2').click();await committed(restored);
   assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(restored.player.hp,248);
   await page.reload();await page.locator('[data-action="continue"]').click();await exact(restored);
  });
  await check('no-loss-and-defeated-swaps-stay-direct',async()=>{
   for(const dead of [false,true]){
    let s=healthFixture();
    if(dead){s=E.transition(E.transition(s,{type:'fate'}),{type:'enter'});s.phase='dead';s.player.hp=0;}
    else s.player.hp=100;
    await load(s);await inventory();await equip('i4').click();
    const expected=E.transition(s,{type:'equip',id:'i4',slot:'armor'});await committed(expected);
    assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(expected.player.hp,s.player.hp);
   }
  });
  await check('cross-tab-and-suppressed-event-stale-review',async()=>{
   for(const suppressStorage of [false,true]){
    const s=healthFixture();await load(s,{suppressStorage});await inventory();await equip('i4').click();await page.locator('.equip-health-review').waitFor();
    const donor=await context.newPage();await donor.goto(url);
    const changed=structuredClone(s);changed.player.gold++;
    await donor.evaluate(({keys,raw})=>keys.forEach(key=>localStorage.setItem(key,raw)),{keys:[S.SAVE_KEY,S.BACKUP_KEY],raw:S.encodeSave(changed)});
    if(suppressStorage){await page.locator('[data-action="confirm"]').click();await page.waitForFunction(()=>document.querySelector('.toast').textContent.includes('另一窗口'));}
    else await page.waitForFunction(()=>!document.querySelector('dialog').open);
    await exact(changed);assert.equal(S.decodeSave(await raw()).player.equipped.armor,'i2');
   }
  });
  await check('failed-primary-does-not-equip-or-lose-health',async()=>{
   const s=healthFixture();await load(s);await inventory();await equip('i4').click();await page.locator('.equip-health-review').waitFor();
   await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,k,v);};},S.SAVE_KEY);
   await page.locator('[data-action="confirm"]').click();await page.waitForFunction(()=>document.querySelector('.toast').textContent.includes('本次操作未生效'));
   await exact(s);assert.match(await page.locator('.player-health').innerText(),/269 \/ 269/);
  });
  await check('desktop-narrow-text-scale-and-keyboard-preview',async()=>{
   for(const viewport of [{width:1366,height:768},{width:390,height:844}])for(const scale of [.9,1,1.1]){
    const s=talentFixture();await load(s,{viewport});
    await page.locator('[data-action="settings"]').click();await page.locator('#ui-scale').selectOption(String(scale));await page.locator('[data-action="close-dialog"]').click();
    await page.locator('.main-nav [data-action="talents"]').click();
    // Narrow layouts expose one branch at a time through their normal tab.
    if(viewport.width<1100)await page.locator('.talent-branch-nav [data-id="luck"]').click();
    await page.locator('[data-talent-preview="attune"]').focus();await page.locator('[data-benefit-key="echo"]').waitFor();
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(dimensions.scroll<=dimensions.width+1);
    await page.locator('#talent-preview').focus();await page.keyboard.press('End');
    await page.waitForFunction(()=>document.querySelector('#talent-preview').scrollTop>0);
    await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#talent-preview').scrollTop===0);await exact(s);
    if(scale===1.1)await shot(`talent-${viewport.width}-110`);
   }
  });
  assert(report.cases.length,'No matching QA case');assert.deepEqual(report.errors,[]);report.status='PASS';return report;
 } catch(e){report.status='FAIL';throw e;}
 finally{await context?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return[arg.slice(2,i),arg.slice(i+1)];}));
 assert(args.url&&args.output,'--url and external --output required');
 assert(!path.resolve(args.output).startsWith(fileURLToPath(new URL('../',import.meta.url))));
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{await runDecisionGainsQA({browser,url:args.url,output:args.output,noWebLocks:args['no-web-locks']==='true',only:args.case});}finally{await browser.close();}
}
