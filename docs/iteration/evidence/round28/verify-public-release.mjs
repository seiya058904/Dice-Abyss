// Public Pages verification for the merged main commit. Isolated browser
// contexts and synthetic saves only; never touches a real player profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return i<0?[x.replace(/^--/,''),true]:[x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
for(const key of ['url','repo','sha','output'])assert(args[key],'--'+key+' is required');
const url=args.url.endsWith('/')?args.url:args.url+'/';
const repo=path.resolve(args.repo),sha=args.sha,output=path.resolve(args.output);
assert(!output.startsWith(repo),'--output must be outside the repository');
await fs.mkdir(output,{recursive:true});
const ev=process.env;
const require=createRequire(import.meta.url);
const {chromium}=require(ev.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:ev.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={url,sha,browser:browser.version(),started:new Date().toISOString(),shippingFiles:{},functional:{},recovery:{},errors:[]};
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const E=await import(pathToFileURL(path.join(repo,'src/engine.js')).href);
const S=await import(pathToFileURL(path.join(repo,'src/storage.js')).href);
const git=file=>execFileSync('git',['-C',repo,'show',`${sha}:${file}`],{maxBuffer:20e6});
try{
 // 1) Every shipping file served by Pages must byte-match the merged main commit.
 const files=execFileSync('git',['-C',repo,'ls-tree','-r','--name-only',sha],{maxBuffer:20e6}).toString().trim().split(/\r?\n/).filter(file=>file==='index.html'||file==='favicon.svg'||file.startsWith('src/'));
 assert(files.length>60,`expected the full shipping set, got ${files.length}`);
 for(const file of files){
  const expected=git(file);
  const response=await fetch(`${url}${file}?release=${sha.slice(0,12)}`,{cache:'no-store'});
  assert.equal(response.status,200,file+' returned '+response.status);
  const actual=Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(actual),sha256(expected),`served bytes do not match the merged main commit: ${file}`);
  report.shippingFiles[file]=sha256(actual);
 }
 const html=await (await fetch(url,{cache:'no-store'})).text();
 const releaseMeta=/<meta name="dice-abyss-release" content="([^"]+)"/.exec(html)?.[1];
 const buildMeta=/<meta name="dice-abyss-build" content="([^"]+)"/.exec(html)?.[1];
 const packageVersion=JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8')).version;
 assert.equal(releaseMeta,packageVersion,'Pages release meta matches package.json');
 assert.equal(buildMeta,'5','Pages save-schema build meta stays 5');
 report.version={release:releaseMeta,build:buildMeta,files:files.length};
 // 2) Fresh public session: new game, manual fate, enter, manual roll, chest, loot, inventory, reload.
 const errors=[],failed=[];
 const track=page=>{page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());});page.on('requestfailed',request=>failed.push(request.url()+' '+request.failure()?.errorText));};
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
  const page=await context.newPage();page.setDefaultTimeout(10000);track(page);
  await page.goto(url,{waitUntil:'load'});
  assert.equal(await page.locator('[data-action="new"]').isVisible(),true,'title offers a new game');
  await page.locator('[data-action="new"]').click();
  await page.locator('#primary-action:not(:disabled)').waitFor();
  const afterNew=await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY);
  assert.equal(afterNew.phase,'fate','new game waits for a manual fate roll');assert(S.validateSave(afterNew));
  const revision=afterNew.revision;
  await page.locator('#primary-action').click();
  await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:revision+1});
  await page.locator('#primary-action:not(:disabled)').waitFor();
  const routeState=await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY);
  assert.deepEqual(routeState,E.transition(afterNew,{type:'fate'}),'public fate action equals the engine transition');
  await page.locator('#primary-action').click();
  await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:revision+2});
  await page.locator('#primary-action:not(:disabled)').waitFor();
  const combatState=await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY);
  assert.equal(combatState.phase,'combat','entering the first room starts combat');
  assert(S.validateSave(combatState));
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY),combatState,'idle time never advances a committed state');
  await page.screenshot({path:path.join(output,'public-combat.png')});
  report.functional.publicSession={phase:combatState.phase,revision:combatState.revision,floor:combatState.floor,items:combatState.player.items.length};
 }finally{await context.close();}
 // 3) Synthetic save: isolated context, manual roll + reload resume.
 const combatFixture=(()=>{let state=E.newGame(913);state=E.transition(state,{type:'fate'});state.route[0].type='combat';state=E.transition(state,{type:'enter'});state.enemy.hp=1;state.enemy.shield=0;assert.equal(E.transition(state,{type:'roll'}).phase,'chest');assert(S.validateSave(state));return state;})();
 const fixtureRaw=S.encodeSave(combatFixture);
 const context2=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
  const page=await context2.newPage();page.setDefaultTimeout(10000);track(page);
  await page.goto(url,{waitUntil:'load'});
  await page.evaluate(({raw,save,backup})=>{localStorage.setItem(save,raw);localStorage.setItem(backup,raw);},{raw:fixtureRaw,save:S.SAVE_KEY,backup:S.BACKUP_KEY});
  await page.reload();await page.locator('[data-action="continue"]').click();
  await page.locator('#primary-action:not(:disabled)').waitFor();
  assert.deepEqual(await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY),combatFixture,'synthetic save resumes exactly');
  await page.locator('#primary-action').click();
  for(let i=0;i<100;i++){const phase=await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).phase,S.SAVE_KEY);if(phase==='chest'||phase==='dead')break;await page.waitForTimeout(100);}
  const afterRoll=await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY);
  assert.deepEqual(afterRoll,E.transition(combatFixture,{type:'roll'}),'public manual roll commits exactly one engine transition');
  const durable=await page.evaluate(({save,backup})=>[localStorage.getItem(save),localStorage.getItem(backup)],{save:S.SAVE_KEY,backup:S.BACKUP_KEY});
  assert.equal(durable[0],durable[1],'primary and mirror agree after the roll');
  assert.equal(durable[0],S.encodeSave(afterRoll),'public bytes exactly equal the committed engine encoding');
  // Navigation is intentionally ignored while a committed reveal is still busy;
  // wait for the real idle state instead of racing the animation.
  await page.locator('#primary-action:not(:disabled)').waitFor();
  await page.locator('.main-nav [data-action="inventory"]').click();
  await page.locator('.inventory-list .item-card').first().waitFor();
  assert((await page.locator('.inventory-list .item-card').count())>=3,'inventory renders owned equipment');
  await page.reload();await page.locator('[data-action="continue"]').click();
  assert.deepEqual(await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY),afterRoll,'reload + continue resumes the committed result');
  report.functional.rollAndReload={phase:afterRoll.phase,revision:afterRoll.revision,sha256:sha256(durable[0])};
 }finally{await context2.close();}
 // 4) Mirror recovery and storage-loss protection are read-only until confirmed.
 const context3=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
  const page=await context3.newPage();page.setDefaultTimeout(10000);track(page);
  await page.goto(url,{waitUntil:'load'});
  await page.evaluate(({raw,save,backup})=>{localStorage.setItem(save,raw);localStorage.setItem(backup,raw);},{raw:fixtureRaw,save:S.SAVE_KEY,backup:S.BACKUP_KEY});
  await page.evaluate(({save})=>{const raw=localStorage.getItem(save);localStorage.setItem(save,'{corrupt primary for public recovery test');window.__qaGoodRaw=raw;},{save:S.SAVE_KEY});
  await page.reload();
  assert.match(await page.locator('.error-note').innerText(),/镜像|恢复/,'the mirror-recovery warning is visible before continuing');
  await page.locator('[data-action="continue"]').click();
  await page.locator('#primary-action:not(:disabled)').waitFor();
  assert.deepEqual(S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),S.BACKUP_KEY)),combatFixture,'the readable mirror is the recovered session');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY),'{corrupt primary for public recovery test','recovery is read-only until the next committed action');
  const recoveredExpected=E.transition(structuredClone(combatFixture),{type:'roll'});
  await page.locator('#primary-action').click();
  await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:recoveredExpected.revision},{timeout:15000});
  assert.deepEqual(await page.evaluate(key=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload),S.SAVE_KEY),recoveredExpected,'the recovered session commits exactly the next engine transition');
  await page.locator('#primary-action:not(:disabled)').waitFor();
  await page.evaluate(({save,backup})=>{localStorage.removeItem(save);localStorage.removeItem(backup);window.dispatchEvent(new StorageEvent('storage',{key:null,storageArea:localStorage}));},{save:S.SAVE_KEY,backup:S.BACKUP_KEY});
  await page.locator('[data-save-recovery="missing"]').waitFor();
  assert.equal(await page.evaluate(({save,backup})=>[localStorage.getItem(save),localStorage.getItem(backup)].every(value=>value===null),{save:S.SAVE_KEY,backup:S.BACKUP_KEY}),true,'loss protection never writes synthetic bytes');
  assert(await page.locator('[data-action="export"]').isVisible());
  report.recovery={mirrorRecovery:true,lossProtection:true,readOnly:true};
 }finally{await context3.close();}
 report.errors=errors;report.failedRequests=failed.filter(item=>!/favicon/.test(item));
 assert.equal(errors.length,0,'no public page/console errors: '+errors.join(' | '));
 assert.equal(report.failedRequests.length,0,'no failed public requests');
 report.status='PASS';
}catch(error){report.status='FAIL';report.errors.push(String(error),error.stack);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await persist();await browser.close();}
console.log(JSON.stringify({status:report.status,url:report.url,sha:report.sha,files:report.version?.files,functional:report.functional,recovery:report.recovery,errors:report.errors},null,2));
