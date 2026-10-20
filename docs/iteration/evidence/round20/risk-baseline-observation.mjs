import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root='/workspace/scratch/da3202002fbd/baseline/Dice-Abyss';
const E=await import(pathToFileURL(root+'/src/engine.js')),S=await import(pathToFileURL(root+'/src/storage.js')),{eventFixture}=await import(pathToFileURL(root+'/scripts/audit-event-context.mjs'));
const output='/workspace/scratch/da3202002fbd/analysis/browser-baseline-risk';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/tmp/dice-r15-browser/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),page=await context.newPage(),report={synthetic:true,errors:[],scenes:[]};page.on('pageerror',e=>report.errors.push(String(e)));
try{for(const type of ['gambit','wishingvault']){
 const s=eventFixture({E,S},type,{floor:type==='gambit'?1:140,rich:true});s.player.gold=s.event.costGold*3;
 await page.goto('http://127.0.0.1:4200');await page.evaluate(({raw,key,backup,settings})=>{localStorage.setItem(key,raw);localStorage.setItem(backup,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw:S.encodeSave(s),key:S.SAVE_KEY,backup:S.BACKUP_KEY,settings:S.SETTINGS_KEY});await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:output+'/'+type+'.jpg',type:'jpeg',quality:83});
 const scene={type,state:s,body:await page.locator('.event-screen').innerText(),html:await page.locator('.event-screen').innerHTML()};await page.locator('[data-action="event-choice"][data-id="roll"]').click();scene.confirmation=await page.locator('dialog').innerText();await page.screenshot({path:output+'/'+type+'-confirm.jpg',type:'jpeg',quality:83});report.scenes.push(scene);
}}finally{await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify({scenes:report.scenes.length,errors:report.errors}));
