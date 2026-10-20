// Real viewport resize during a committed presentation. Isolated synthetic
// saves; native input, timers, Canvas and engine/storage implementations.
// --source=/absolute/project --url=http://127.0.0.1:4189/
// --output=/tmp/fresh --expect=settled|baseline
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(2,at),arg.slice(at+1)];}));
assert(args.source&&args.url&&args.output);assert(['baseline','settled'].includes(args.expect));
const root=path.resolve(args.source),output=path.resolve(args.output),url=new URL(args.url);
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert(output!==root&&!output.startsWith(root+path.sep));
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const [E,S,Q]=await Promise.all(['engine','storage','equipment'].map(name=>import(pathToFileURL(path.join(root,'src',name+'.js')))));
const {eventFixture}=await import(pathToFileURL(path.join(root,'scripts/audit-event-context.mjs')));
let fight=E.newGame(20261017);fight.runId='round25-resize-boss';fight.floor=140;fight.fate=[6,6];fight.player.level=80;fight.player.gold=500000;fight.roomIndex=5;
fight.route=Array.from({length:6},(_,i)=>({id:`f140r${i}`,type:i===5?'boss':'combat',quality:0,done:i<5}));fight.phase='route';fight.player.hp=E.stats(fight).maxHp;fight=E.transition(fight,{type:'enter'});
fight.enemy.hp=1;fight.enemy.shield=0;fight.enemy.stage=2;
const chest=E.transition(fight,{type:'roll'});assert.equal(chest.phase,'chest');chest.runId='round25-resize-eternal';chest.chest.item=Q.makeItem(chest,'relic',7,140,'boss');
const fresh=E.newGame(251025);fresh.runId='round25-resize-fate';
const event=eventFixture({E,S},'gambit',{seed:251025,floor:140,rich:true});event.runId='round25-resize-event';
const scenes=[
 {name:'fate-dice',state:fresh,action:{type:'fate'},kind:'dice-only'},
 {name:'combat-dice',state:fight,action:{type:'roll'},kind:'dice-only'},
 {name:'boss-impact',state:fight,action:{type:'roll'},kind:'combat',geometry:true},
 {name:'chest-charge',state:chest,action:{type:'open'},kind:'chest-charge',geometry:true},
 {name:'eternal-reveal',state:chest,action:{type:'open'},kind:'loot-7',geometry:true},
 {name:'event-dice',state:event,action:{type:'event-choice',id:'roll',confirmed:true},kind:'dice-only',eventChoice:true},
 {name:'fate-mirror-warning',state:fresh,action:{type:'fate'},kind:'dice-only',mirrorWarning:true},
];
const report={status:'RUNNING',expect:args.expect,createdAt:new Date().toISOString(),url:url.href,source:root,protocol:{synthetic:true,from:{width:1920,height:1080},to:{width:1366,height:768},effects:'full',reducedMotion:'no-preference',clock:'Real native timers and page.setViewportSize; two native RAFs after resize. No mocked clock, engine, save API, resize event or geometry.',oracle:'Exact full state and both complete persisted bytes before/after resize; old presentation disconnected; stable result after old continuations; static inventory DOM retained.',limitations:['Linux Chromium software rendering; no physical GPU, Windows or phone certification.','A baseline animation can naturally finish during a slow resize; geometry reproductions are recorded individually, never relabeled.']},cases:[],errors:[],checks:0};
const check=(condition,label)=>{report.checks++;assert(condition,label);};
const eq=(a,b,label)=>{report.checks++;assert.deepEqual(a,b,label);};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
report.scriptSha256=sha(await fs.readFile(new URL(import.meta.url)));
report.protocol.oracle+=' Native primary-action focus, committed-result live text, no duplicate resize announcements, warning retention and served source hashes.';
report.protocol.limitations.push('Live-region DOM and focus checks do not certify real external screen-reader speech. A deliberately failed mirror write is an explicitly separate synthetic error scenario.');
const runtimeFiles=['index.html','package.json','src/release.js','src/app.js','src/effects.js','src/engine.js','src/storage.js','src/views.js'];
report.sourceBefore=Object.fromEntries(await Promise.all(runtimeFiles.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
async function load(page,state){
 assert(S.validateSave(state));const raw=S.encodeSave(state);await page.goto(url.href);
 await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({effects:'full',sound:false,scale:1}));},{raw,main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);await page.locator('#primary-action:not(:disabled)').waitFor();
 const served=await page.evaluate(async files=>Object.fromEntries(await Promise.all(files.map(async file=>{
  const response=await fetch(new URL(file,location.href),{cache:'no-store'});if(!response.ok)throw Error(file+': '+response.status);
  const hash=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());return [file,[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('')];
 }))),runtimeFiles.filter(file=>file!=='package.json'));
 eq(served,Object.fromEntries(Object.entries(report.sourceBefore).filter(([file])=>file!=='package.json')),'HTTP runtime bytes match the declared source files; private package metadata is checked on disk');
 eq(await page.evaluate(async()=> (await fetch(new URL('package.json',location.href))).status),404,'Private package metadata stays outside the HTTP runtime allowlist');
}
function resultIsAnnounced(text,scene,expected){
 if(scene.action.type==='fate')return text.includes('命运骰 '+expected.fate.join('、'))&&text.includes('本层路线已生成');
 if(scene.action.type==='roll')return text.includes('掷出 '+expected.lastRoll.values.join('、'))&&text.includes('实际削减敌人生命 '+expected.lastRoll.hpDamage);
 if(scene.action.type==='open')return text.includes('获得')&&text.includes(expected.loot.item.name);
 return text.includes(expected.event.outcome);
}
const records=page=>page.evaluate(({main,mirror})=>[localStorage.getItem(main),localStorage.getItem(mirror)],{main:S.SAVE_KEY,mirror:S.BACKUP_KEY});
try{
 for(const scene of scenes){
  const row={name:scene.name,status:'RUNNING',kind:scene.kind};report.cases.push(row);await save();
  const context=await browser.newContext({viewport:report.protocol.from,deviceScaleFactor:1,reducedMotion:'no-preference'});
  try{
   await context.route('**/*',r=>r.request().url().startsWith(url.origin+'/')?r.continue():r.abort());
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push({scene:scene.name,error:String(e)}));
   await load(page,scene.state);const expected=E.transition(scene.state,scene.action);check(S.validateSave(expected),'Expected complete transition is valid');
   await page.evaluate(()=>{
    window.__r25Announcements=[];const node=document.querySelector('#announcement');
    window.__r25AnnouncementObserver=new MutationObserver(records=>{for(const record of records)window.__r25Announcements.push(node.textContent);});
    window.__r25AnnouncementObserver.observe(node,{childList:true,characterData:true,subtree:true});
   });
   if(scene.mirrorWarning)await page.evaluate(key=>{
    const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic mirror quota failure','QuotaExceededError');return original.call(this,k,v);};
   },S.BACKUP_KEY);
   if(scene.eventChoice){await page.locator('[data-action="event-choice"][data-id="roll"]').click();await page.locator('dialog [data-action="confirm"]').click();}
   else await page.locator('#primary-action').click();
   await page.waitForFunction(kind=>{const canvas=document.querySelector('.scene-fx');return document.querySelector('#current-room.busy')&&canvas?.dataset.fxKind===kind&&(kind==='dice-only'||Number(canvas.dataset.fxFrames)>0);},scene.kind);
   row.before=await page.evaluate(()=>{
    const canvas=document.querySelector('.scene-fx');window.__r25OldResizeCanvas=canvas;
    const box=canvas.getBoundingClientRect(),owner=canvas.parentElement.getBoundingClientRect();
    return {kind:canvas.dataset.fxKind,logical:canvas.dataset.fxLogical||null,roi:canvas.dataset.fxRoi||null,frames:canvas.dataset.fxFrames,rect:{x:box.x,y:box.y,width:box.width,height:box.height},owner:{width:owner.width,height:owner.height},busy:!!document.querySelector('#current-room.busy'),announcement:document.querySelector('#announcement').textContent,announcementWrites:window.__r25Announcements.length};
   });
   eq((await records(page)).map(S.decodeSave),[expected,scene.mirrorWarning?scene.state:expected],'The complete result was committed before visual resize; a failed mirror stays at its original state');
   const raw=await records(page),started=Date.now();await page.setViewportSize(report.protocol.to);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   row.after=await page.evaluate(()=>{
    const old=window.__r25OldResizeCanvas,owner=old.parentElement?.getBoundingClientRect(),current=document.querySelector('.scene-fx');
    return {busy:!!document.querySelector('#current-room.busy'),phase:document.querySelector('.game-shell')?.dataset.scene,primaryEnabled:!document.querySelector('#primary-action').disabled,oldConnected:old.isConnected,oldLogical:old.dataset.fxLogical||null,oldFrames:old.dataset.fxFrames,oldLifecycle:old.dataset.fxLifecycle,oldOwner:owner?{width:owner.width,height:owner.height}:null,currentKind:current?.dataset.fxKind||null,focus:{tag:document.activeElement.tagName,id:document.activeElement.id},announcement:document.querySelector('#announcement').textContent,announcementWrites:window.__r25Announcements.length,warning:document.querySelector('.bottomline').textContent};
   });row.resizeObservedMs=Date.now()-started;
   eq(await records(page),raw,'Resize never changes either persisted record');
   row.geometryMismatch=!!(scene.geometry&&row.after.oldConnected&&row.after.oldLogical&&row.after.oldOwner&&Math.abs(JSON.parse(row.after.oldLogical).width-row.after.oldOwner.width)>1);
   row.settled=!row.after.busy&&row.after.primaryEnabled&&!row.after.oldConnected&&row.after.phase===expected.phase;
   if(args.expect==='settled'){
    check(row.settled,'Viewport resize immediately reveals the committed state and releases input');
    if(!scene.eventChoice)eq(row.after.focus.id,'primary-action','The initiating primary-button keyboard intent is restored after resize');
    check(resultIsAnnounced(row.after.announcement,scene,expected),'The live region contains the actual committed result after resize');
    const alreadyAnnounced=resultIsAnnounced(row.before.announcement,scene,expected);
    eq(row.after.announcementWrites-row.before.announcementWrites,alreadyAnnounced?0:1,'Only a previously unannounced result is published by resize');
    if(scene.mirrorWarning){check(row.after.announcement.includes('镜像'),'The live result preserves the mirror warning');check(row.after.warning.includes('镜像'),'The mirror warning also remains visibly present');}
    await page.setViewportSize({width:1440,height:900});await page.setViewportSize(report.protocol.to);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    eq(await records(page),raw,'Repeated resize cannot commit the action twice');
    eq(await page.evaluate(()=>window.__r25Announcements.length),row.after.announcementWrites,'Further idle resizes do not repeat the result announcement');
   }
   if(scene.name==='eternal-reveal'||scene.name==='boss-impact')await page.screenshot({path:path.join(output,scene.name+'.png')});
   // Native wait resolves old asynchronous presentation continuations. This is
   // lifecycle verification, not a performance sample or successful timeout.
   await page.waitForTimeout(2400);
   eq(await records(page),raw,'Old asynchronous continuations cannot change state after resize');
   await page.locator('#primary-action:not(:disabled)').waitFor();
   eq(await page.locator('.game-shell').getAttribute('data-scene'),expected.phase,'The final visible scene agrees with the full engine result');
   row.stateSha256=sha(expected);row.persistedSha256=raw.map(sha);row.status='PASS';
  }catch(error){row.status='FAIL';row.error=String(error);throw error;}
  finally{await context.close();await save();}
 }
 const context=await browser.newContext({viewport:report.protocol.from,deviceScaleFactor:1,reducedMotion:'reduce'});
 try{
  const page=await context.newPage();await load(page,fresh);await page.locator('.main-nav [data-action="inventory"]').click();
  await page.evaluate(()=>{window.__r25StaticInventory=document.querySelector('.inventory-screen');});const raw=await records(page);
  await page.setViewportSize(report.protocol.to);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check(await page.evaluate(()=>window.__r25StaticInventory===document.querySelector('.inventory-screen')),'Idle inventory resizing retains its DOM and browser state');
  eq(await records(page),raw,'Idle resize never changes save state');report.cases.push({name:'idle-inventory',status:'PASS'});
 }finally{await context.close();}
 if(args.expect==='baseline')check(report.cases.filter(row=>row.geometryMismatch).length>=1,'Native input baseline reproduces a stale FX geometry after real resize');
 for(const file of runtimeFiles)eq(sha(await fs.readFile(path.join(root,file))),report.sourceBefore[file],`Source remains unchanged: ${file}`);
 check(!report.errors.length,'No browser runtime errors');report.status=args.expect==='baseline'?'BASELINE_RESIZE_DEFECT_REPRODUCED':'PASS';
}catch(error){report.status='FAIL';report.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await browser.close();}
console.log(JSON.stringify({status:report.status,checks:report.checks,cases:report.cases.map(row=>({name:row.name,status:row.status,settled:row.settled,geometryMismatch:row.geometryMismatch})),failure:report.failure}));
