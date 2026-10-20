// Optional round-17 paired UI evidence. Tester-supplied Playwright/Chromium.
// node boons-ab.mjs SOURCE BASELINE_URL CURRENT_URL EXTERNAL_OUTPUT
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const [source,baselineURL,currentURL,output]=process.argv.slice(2).map((s,i)=>[0,3].includes(i)?path.resolve(s):s);
for(const url of [baselineURL,currentURL])assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
const S=await import(pathToFileURL(path.join(source,'src/storage.js'))),E=await import(pathToFileURL(path.join(source,'src/engine.js')));
const {eventFixture}=await import(pathToFileURL(path.join(source,'scripts/audit-event-context.mjs')));
const natural=S.decodeSave(await fs.readFile(path.join(source,'docs/iteration/evidence/round17/opening-echo-invisible-before-roll.save.json'),'utf8'));
const scenes=[['natural-opening-echo',natural],['prayer-preview',eventFixture({E,S},'prayer',{seed:17017,floor:140,rich:true})]];
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={method:'Same exact committed save, viewport, effects, DPR and reduced-motion preference on two isolated origins. Natural sample is a replay; prayer is a declared valid constructed fixture. No gameplay action or performance timing.',browser:browser.version(),viewport:[1440,900],started:new Date().toISOString(),rows:[],errors:[]};
try{
 for(const [scene,state]of scenes)for(const [label,url]of [['baseline',baselineURL],['current',currentURL]]){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(url);
  const raw=S.encodeSave(state);
  await page.evaluate(({raw,save,backup,settings})=>{localStorage.setItem(save,raw);localStorage.setItem(backup,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{raw,save:S.SAVE_KEY,backup:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
  await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('#primary-action:not(:disabled)').waitFor();await page.evaluate(()=>document.fonts.ready);
  const observation=await page.evaluate(()=>({release:document.querySelector('meta[name="dice-abyss-release"]').content,boonEntries:document.querySelectorAll('[data-boon-key]').length,readyEntries:document.querySelectorAll('[data-ready-boon]').length,previewCards:document.querySelectorAll('.event-option .event-choice-preview').length,previewRows:document.querySelectorAll('.event-option .event-preview-row').length,body:document.querySelector('#app').innerText}));
  const stored=await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY);assert.deepEqual(S.decodeSave(stored),state);assert.equal(stored,raw);
  if(label==='baseline'){assert.equal(observation.boonEntries,0);assert.equal(observation.readyEntries,0);assert.equal(observation.previewRows,0);}
  else if(scene==='natural-opening-echo'){assert(observation.boonEntries>0);assert(observation.readyEntries>0);}else{assert.equal(observation.previewCards,2);assert.equal(observation.previewRows,5);}
  const screenshot=`${label}-${scene}.png`;await page.screenshot({path:path.join(output,screenshot)});
  const {body,...visible}=observation;report.rows.push({scene,label,...visible,stateSha256:hash(state),rawSha256:hash(raw),bodySha256:hash(body),stateUnchanged:true,screenshot});await context.close();
 }
 report.status=report.errors.length?'FAIL':'PASS';assert.equal(report.errors.length,0);
}finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
