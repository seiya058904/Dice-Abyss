// Independent browser gate for presentation APIs which may be absent or
// degraded (ResizeObserver / Web Animations). Fresh isolated contexts and
// synthetic saves only; never touches a real browser profile.
// node scripts/qa-api-fallback-browser.mjs --url=http://127.0.0.1:4188/ --output=/tmp/qa-api-fallback [--no-web-locks]
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return i<0?[x.replace(/^--/,''),true]:[x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
assert(args.url,'--url is required');
const url=args.url;
assert(args.output,'--output external directory is required');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(args.output);assert(!output.startsWith(root),'--output must be outside the repository');
await fs.mkdir(output,{recursive:true});
const noLocks=args['no-web-locks']==='true';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={mode:noLocks?'API_ABSENT':'NATIVE',url,browser:browser.version(),started:new Date().toISOString(),cases:[],errors:[]};
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const sha=x=>x?.runId?{runId:x.runId,revision:x.revision,phase:x.phase}:x;
function combat(seed=913){let state=E.newGame(seed);state.runId='qa-api-fallback-'+seed;state=E.transition(state,{type:'fate'});state.route[0].type='combat';state=E.transition(state,{type:'enter'});state.enemy.hp=1;state.enemy.shield=0;assert.equal(E.transition(state,{type:'roll'}).phase,'chest');assert(S.validateSave(state));return state;}
const readSave=page=>page.evaluate(key=>{try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload);}catch{return null;}},S.SAVE_KEY);
async function loadGame(page,state,settings){
 await page.goto(args.url);
 await page.evaluate(({raw,save,backup,settingsKey,settingsValue})=>{localStorage.setItem(save,raw);localStorage.setItem(backup,raw);localStorage.setItem(settingsKey,settingsValue);},{raw:S.encodeSave(state),save:S.SAVE_KEY,backup:S.BACKUP_KEY,settingsKey:S.SETTINGS_KEY,settingsValue:JSON.stringify(settings)});
 await page.reload();
 await page.locator('[data-action="continue"]').click();
 await page.locator('#primary-action:not(:disabled)').waitFor();
}
async function waitRevision(page,revision){await page.waitForFunction(({key,revision})=>{try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}},{key:S.SAVE_KEY,revision});await page.locator('#primary-action:not(:disabled)').waitFor();}
async function status(page){return {busy:await page.locator('#primary-action').isDisabled(),scene:await page.evaluate(()=>document.querySelector('.game-shell')?.getAttribute('data-scene')??null),surfaces:await page.evaluate(()=>document.querySelectorAll('.dice-surface').length),gpuRow:await page.evaluate(()=>!!document.querySelector('.cube-row.gpu-dice'))};}
async function run(name,inits,settings,action){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 try{
  for(const init of inits)await context.addInitScript(init);
  if(noLocks)await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));
  const page=await context.newPage();page.setDefaultTimeout(8000);
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  const before=combat(913+report.cases.length);
  await loadGame(page,before,settings);
  const step=await action(page,before);
  const check={name,steps:step,pageErrors,consoleErrors};
  assert.equal(pageErrors.length,0,`page errors: ${pageErrors.join(' | ')}`);
  assert.equal(consoleErrors.length,0,`console errors: ${consoleErrors.join(' | ')}`);
  check.status='PASS';check.state=sha(await readSave(page));
  report.cases.push(check);
  await page.screenshot({path:path.join(output,name+'.png')});
 }catch(error){
  report.cases.push({name,status:'FAIL',error:String(error),stack:error.stack});
 }finally{await persist();await context.close();}
}
async function rollAndVerify(page,before){
 const expected=E.transition(before,{type:'roll'});
 await page.locator('#primary-action').click();
 await waitRevision(page,expected.revision);
 assert.deepEqual(await readSave(page),expected,'the committed roll is exactly the engine transition');
 const afterRoll=await status(page);
 assert.equal(afterRoll.busy,false,'the reveal always releases the busy control');
 assert.equal(afterRoll.scene,'chest','the committed chest is visible after the fallback reveal');
 await page.locator('#primary-action').click();
 await waitRevision(page,expected.revision+1);
 const loot=await readSave(page);
 assert.equal(loot.revision,expected.revision+1,'the following open is exactly one more transaction');
 await page.reload();
 const durable=await page.evaluate(({save,backup})=>[localStorage.getItem(save),localStorage.getItem(backup)],{save:S.SAVE_KEY,backup:S.BACKUP_KEY});
 assert.equal(durable[0],durable[1],'primary and mirror hold the exact same committed bytes');
 assert.equal(durable[0],S.encodeSave(loot),'browser bytes exactly equal the engine encoding of the committed state');
 const saveSha256=createHash('sha256').update(durable[0]).digest('hex');
 await page.reload();
 await page.locator('[data-action="continue"]').click();
 assert.deepEqual(await readSave(page),loot,'reload resumes the committed result');
 return {rollPhase:afterRoll.scene,surfaces:afterRoll.surfaces,gpuRow:afterRoll.gpuRow,phase:loot.phase,saveSha256,lootVisible:await page.locator('.loot-screen').isVisible()};
}
const full={fastPace:true,effects:'full',sound:false,scale:1};
const low={fastPace:false,effects:'low',sound:false,scale:1};
const noResize=()=>{Object.defineProperty(window,'ResizeObserver',{value:undefined,configurable:true});};
const noAnimations=()=>{Object.defineProperty(Element.prototype,'getAnimations',{value:undefined,configurable:true});};
const throwingAnimations=()=>{Object.defineProperty(Element.prototype,'getAnimations',{value(){throw new TypeError('synthetic getAnimations failure');},configurable:true});};
const partialAnimation=()=>{const real=Element.prototype.getAnimations;Object.defineProperty(Element.prototype,'getAnimations',{configurable:true,value:function(...list){const current=real.apply(this,list);if(current&&current.length)return current;return [{effect:{getComputedTiming(){return {endTime:1};}}}];}});};
const rejectedFinished=()=>{if(window.Animation)Object.defineProperty(Animation.prototype,'finished',{configurable:true,get(){return Promise.reject(new Error('synthetic finished rejection'));}});};
const overridableVisibility=()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get(){return window.__qaHidden?'hidden':'visible';}});};
try{
 // Four presentation combinations with Web Animations absent.
 for(const [label,settings] of [['pace-on-full',full],['pace-on-low',low],['pace-off-full',{...full,fastPace:false}],['pace-off-low',low]]){
  await run('missing-animations-'+label,[noAnimations],settings,(page,before)=>rollAndVerify(page,before));
 }
 await run('missing-resize-observer',[noResize],full,(page,before)=>rollAndVerify(page,before));
 await run('throwing-animations',[throwingAnimations],full,(page,before)=>rollAndVerify(page,before));
 await run('partial-animation-object',[partialAnimation],full,(page,before)=>rollAndVerify(page,before));
 await run('rejected-finished-promise',[rejectedFinished],full,(page,before)=>rollAndVerify(page,before));
 await run('skip-during-fallback-reveal',[noAnimations],full,async(page,before)=>{
  const expected=E.transition(before,{type:'roll'});
  await page.locator('#primary-action').click();
  await page.locator('[data-action="skip"]').click();
  await waitRevision(page,expected.revision);
  assert.deepEqual(await readSave(page),expected,'skip never duplicates or re-awards the committed roll');
  return {status:await status(page)};
 });
 await run('resize-during-fallback-reveal',[noAnimations],full,async(page,before)=>{
  const expected=E.transition(before,{type:'roll'});
  await page.locator('#primary-action').click();
  await page.setViewportSize({width:1100,height:760});
  await waitRevision(page,expected.revision);
  assert.deepEqual(await readSave(page),expected,'resize only reveals the already committed roll');
  return {status:await status(page)};
 });
 await run('hidden-during-fallback-reveal',[noAnimations,overridableVisibility],full,async(page,before)=>{
  const expected=E.transition(before,{type:'roll'});
  await page.locator('#primary-action').click();
  await page.evaluate(()=>{window.__qaHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  await waitRevision(page,expected.revision);
  assert.deepEqual(await readSave(page),expected,'a hidden page reveals the committed roll without rewinding progress');
  return {status:await status(page)};
 });
 await run('double-click-one-transaction',[noAnimations],full,async(page,before)=>{
  const expected=E.transition(before,{type:'roll'});
  await page.locator('#primary-action').click();
  await page.locator('#primary-action').click({force:true}).catch(()=>{});
  await waitRevision(page,expected.revision);
  assert.deepEqual(await readSave(page),expected,'a second click cannot commit a second roll');
  return {status:await status(page)};
 });
 report.status=report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.errors.push(String(error),error.stack);}
finally{await persist();await browser.close();}
console.log(JSON.stringify({status:report.status,mode:report.mode,cases:report.cases.map(c=>({name:c.name,status:c.status,error:c.error}))},null,2));
if(report.status!=='PASS')process.exitCode=1;
