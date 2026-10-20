// Native storage events in isolated same-origin browser contexts. No private
// browser profile, production storage, remote service or deployment is used.
// --expect=baseline records the V5.12 behavior; --expect=fixed verifies recovery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
const source=path.resolve(args['--source']||'.'),url=args['--url']||'http://127.0.0.1:4189/',output=path.resolve(args['--output']||'/tmp/dice-round13-save-recovery');
const expected=args['--expect']||'fixed',only=args['--case'];
assert(['baseline','fixed'].includes(expected));assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
const caseNames=['clear-memory-export-restore','remove-pair-and-new-run-read','restore-lock-conflict','unreadable-original-records','pending-confirm-cancel','committed-animation-preserved','native-session-storage-filter','recovery-viewports-keyboard','queued-clear-recreate','queued-remove-recreate','queued-identical-recreate'];
assert(!only||caseNames.includes(only),`Unknown --case=${only}; choose one of ${caseNames.join(', ')}`);
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js')));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(value).digest('hex');
const tracked=['src/app.js','src/storage.js','src/save-recovery-view.js','src/save-recovery.css'];
async function identity(){const result={};for(const file of tracked){try{result[file]=hash(await fs.readFile(path.join(source,file)));}catch(error){if(error.code!=='ENOENT')throw error;}}return result;}
await fs.mkdir(output,{recursive:true});
const report={source,url,expected,started:new Date().toISOString(),sourceBefore:await identity(),cases:[],checks:0,errors:[],browser:null,scope:'Fresh isolated contexts with complete constructed valid saves; native storage.clear/removeItem/setItem, native sessionStorage iframe events, actual downloads and existing Web Locks.',limitations:['Logical browser viewports, not physical devices or external screen readers.','Explicit storage-write fault injection remains in node tests; this driver does not override browser quota.','No claim that localStorage offers atomic compare-and-set when Web Locks are unavailable or noncooperating writers bypass the lock.']};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let active;
const control=(page,action)=>page.locator(`[data-action="${action}"]`);
const copies=page=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[S.SAVE_KEY,S.BACKUP_KEY]);
const check=(condition,label,data={})=>{report.checks++;active.checks.push({label,passed:!!condition,...data});assert(condition,label);};
const equal=(actual,value,label)=>{assert.deepEqual(actual,value,label);check(true,label);};
const contrast=(foreground,background)=>{
  const luminance=color=>{
    const parts=color.match(/[\d.]+/g)?.map(Number);assert(parts?.length>=3,'Expected a native computed RGB color');
    assert(parts.length===3||parts[3]===1,'Contrast requires opaque computed colors');
    const linear=parts.slice(0,3).map(channel=>{const value=channel/255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});
    return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  };
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);
};
const hasRecovery=page=>page.locator('[data-save-recovery]').count();
const waitEvent=(page,key,count=1)=>page.waitForFunction(({key,count})=>(window.__saveEvents||[]).filter(event=>event.key===key).length>=count,{key,count});
const waitRecovery=(page,status)=>page.locator(`[data-save-recovery="${status}"]`).waitFor();
async function shot(page,name){await page.screenshot({path:path.join(output,`${name}.png`),animations:'disabled'});active.screenshots.push(`${name}.png`);}
async function download(page,action,name){
  // Closed native dialogs retain their markup. Target only a visible control;
  // an open confirmation's export is last, after the underlying page action.
  // Promise.all observes both failures so a failed click cannot leave an
  // unhandled download timeout that bypasses the per-case evidence writer.
  const [item]=await Promise.all([page.waitForEvent('download'),page.locator(`[data-action="${action}"]:visible`).last().click()]);
  const file=path.join(output,`${active.name}-${name}.json`);await item.saveAs(file);const raw=await fs.readFile(file,'utf8');
  active.downloads.push({file:path.basename(file),suggestedFilename:item.suggestedFilename(),bytes:Buffer.byteLength(raw),sha256:hash(raw)});return raw;
}
async function exportMemory(page,name='memory'){
  if(!await hasRecovery(page)&&!await page.locator('.game-dialog[open]').count())await control(page,'settings').click();
  return download(page,'export',name);
}
async function load(page,context,{full=false}={}){
  const state=E.newGame(130130);state.runId='round13-native-memory';state.qaRecovery={unicode:'本页完整旅途 🧭',nested:[null,{futureField:true}]};
  const raw=S.encodeSave(state);await page.goto(url);
  await page.evaluate(({raw,main,mirror,settings,full})=>{localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:full?'full':'low',scale:1}));},{raw,main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY,full});
  await page.reload();await control(page,'continue').click();await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{window.__saveEvents=[];window.addEventListener('storage',event=>window.__saveEvents.push({key:event.key,area:event.storageArea===localStorage?'local':event.storageArea===sessionStorage?'session':'other',trusted:event.isTrusted,oldLength:event.oldValue?.length??null,newLength:event.newValue?.length??null}));});
  const donor=await context.newPage();await donor.goto(url);
  equal(await copies(page),[raw,raw],'Complete fixture loads into both browser records');return {state,raw,donor};
}
async function write(donor,state){const raw=S.encodeSave(state);await donor.evaluate(({raw,keys})=>{for(const key of keys)localStorage.setItem(key,raw);},{raw,keys:[S.SAVE_KEY,S.BACKUP_KEY]});return raw;}
async function clear(donor,page){await donor.evaluate(()=>localStorage.clear());await waitEvent(page,null);const events=await page.evaluate(()=>window.__saveEvents);check(events.some(event=>event.key===null&&event.area==='local'&&event.trusted),'clear delivers a real trusted localStorage event with a null key');}
async function run(name,fn,{full=false}={}){
  if(only&&only!==name)return;
  active={name,status:'RUNNING',checks:[],screenshots:[],downloads:[]};report.cases.push(active);
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:full?'no-preference':'reduce',acceptDownloads:true});
  await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>report.errors.push({case:name,message:error.message}));
  page.on('console',message=>{if(message.type()==='error')report.errors.push({case:name,message:message.text()});});
  const started=performance.now();
  try{const fixture=await load(page,context,{full});await fn(page,context,fixture);active.events=await page.evaluate(()=>window.__saveEvents);active.status='PASS';}
  catch(error){active.status='FAIL';active.error=error.stack||String(error);process.exitCode=1;await shot(page,`FAILED-${name}`).catch(()=>{});}
  finally{active.durationMs=performance.now()-started;await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${active.status} (${active.checks.length})`);}
}

try {
  await run('clear-memory-export-restore',async(page,context,{state,raw,donor})=>{
    await clear(donor,page);equal(await copies(page),[null,null],'Loss handling performs no automatic save');
    if(expected==='baseline'){equal(await hasRecovery(page),0,'Baseline ignores the clear notification');equal(await exportMemory(page),raw,'Baseline memory can still be rescued through settings');return;}
    await waitRecovery(page,'missing');check(await page.locator('#save-recovery-title').evaluate(node=>node===document.activeElement),'First recovery entry moves focus to its visible explanation');
    equal(await page.locator('#primary-action').count(),0,'Game transaction controls are replaced by the recovery surface');
    await page.keyboard.press('Space');equal(await copies(page),[null,null],'Space cannot write a new game step during protection');
    equal(await exportMemory(page),raw,'The downloaded memory envelope is exactly the complete original');
    const backup=page.locator('.recovery-content [data-action="export"]');
    const colors=()=>backup.evaluate(node=>{const css=getComputedStyle(node);return {foreground:css.color,background:css.backgroundColor,image:css.backgroundImage,border:css.borderTopColor};});
    await page.mouse.move(2,2);let reading=await colors(),ratio=contrast(reading.foreground,reading.background);
    check(reading.image==='none'&&ratio>=4.5,'The complete-backup action has readable normal-state computed foreground/background contrast',{...reading,contrastRatio:ratio});
    await backup.hover();reading=await colors();ratio=contrast(reading.foreground,reading.background);
    check(reading.image==='none'&&ratio>=4.5,'Native hover keeps the complete-backup action readable instead of white on white',{...reading,contrastRatio:ratio});
    equal(reading.background,'rgb(27, 70, 82)','The recovery-only dark cyan hover background wins over the global primary style');
    await shot(page,'recovery-backup-hover');await page.mouse.move(2,2);await shot(page,'recovery-missing-desktop');
    await control(page,'recovery-restore').click();check(await page.locator('.game-dialog[open]').count()===1,'Restore requires explicit confirmation');equal(await copies(page),[null,null],'Opening the restore confirmation does not write');
    await control(page,'confirm').click();await page.waitForFunction(()=>!document.querySelector('[data-save-recovery]'));
    equal(await copies(page),[raw,raw],'Confirmed restore writes the exact full memory envelope to both records');
    const after=E.transition(state,{type:'fate'});await page.locator('#primary-action').click();
    await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:after.revision});
    equal(S.decodeSave((await copies(page))[0]),after,'The next native game action commits the exact engine result after restoration');
  });

  await run('remove-pair-and-new-run-read',async(page,context,{raw,donor})=>{
    await donor.evaluate(key=>localStorage.removeItem(key),S.SAVE_KEY);await waitEvent(page,S.SAVE_KEY);
    check((await page.locator('body').innerText()).includes('镜像'),'Removing only primary still exposes the existing mirror warning');equal(await hasRecovery(page),0,'A readable remaining mirror does not enter missing-save recovery');
    await donor.evaluate(key=>localStorage.removeItem(key),S.BACKUP_KEY);await waitEvent(page,S.BACKUP_KEY);
    if(expected==='fixed'){
      await waitRecovery(page,'missing');await control(page,'recovery-restore').click();
      check(await page.locator('.game-dialog[open]').count()===1,'A protected restore confirmation is open when the next tab update arrives');
    }else equal(await hasRecovery(page),0,'Baseline gives no protection screen after both remove events');
    const other=E.newGame(130131);other.runId='round13-native-new-run';other.qaOther={future:['保留',42]};const otherRaw=await write(donor,other);await waitEvent(page,S.SAVE_KEY,2);
    if(expected==='baseline'){equal(await exportMemory(page),otherRaw,'Baseline automatically replaces the previous memory with the new run');return;}
    await waitRecovery(page,'available');equal(await page.locator('.game-dialog[open]').count(),0,'New browser records cancel an obsolete protected restore confirmation');
    check(await page.locator('#save-recovery-title').evaluate(node=>node===document.activeElement),'Cancellation while already protected restores focus to the new visible explanation');
    equal(await exportMemory(page),raw,'New browser progress does not discard the protected memory copy');equal(await copies(page),[otherRaw,otherRaw],'Candidate detection leaves both new browser records unchanged');await shot(page,'recovery-new-run-candidate');
    await control(page,'recovery-load').click();equal(await download(page,'export','memory-in-read-confirmation'),raw,'Old memory remains exportable from the read confirmation');
    await page.keyboard.press('Escape');check(await control(page,'recovery-load').evaluate(node=>node===document.activeElement),'Escape returns focus to the read action');
    await control(page,'recovery-load').click();await control(page,'confirm').click();await page.waitForFunction(()=>!document.querySelector('[data-save-recovery]'));
    equal(await copies(page),[otherRaw,otherRaw],'Reading the confirmed candidate writes neither record');equal(await exportMemory(page,'read-candidate'),otherRaw,'The explicit read adopts the exact candidate state');
  });

  await run('restore-lock-conflict',async(page,context,{raw,donor})=>{
    await clear(donor,page);
    if(expected==='baseline'){equal(await control(page,'recovery-restore').count(),0,'Baseline has no explicit protected recovery action');return;}
    await waitRecovery(page,'missing');
    await donor.evaluate(()=>{window.__saveLockReady=false;window.__saveLockDone=navigator.locks.request('dice-abyss:save-write',async()=>{window.__saveLockReady=true;await new Promise(resolve=>{window.__releaseSaveLock=resolve;});});});
    await donor.waitForFunction(()=>window.__saveLockReady);
    await control(page,'recovery-restore').click();await control(page,'confirm').click();
    equal(await copies(page),[null,null],'Restore waits while the existing save lock is held by the other tab');
    const other=E.newGame(130132);other.runId='round13-conflicting-new-run';const otherRaw=await write(donor,other);
    await waitRecovery(page,'available');await donor.evaluate(()=>window.__releaseSaveLock());await donor.evaluate(()=>window.__saveLockDone);
    await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('重新检查'));
    equal(await copies(page),[otherRaw,otherRaw],'A newly created run survives the stale queued restore');equal(await exportMemory(page),raw,'The rejected queued restore still leaves the original memory exportable');
  });

  await run('unreadable-original-records',async(page,context,{raw,donor})=>{
    const corrupt='{坏的原始存档\n';await donor.evaluate(({keys,corrupt})=>{localStorage.setItem(keys[0],corrupt);localStorage.setItem(keys[1],'');},{keys:[S.SAVE_KEY,S.BACKUP_KEY],corrupt});await waitEvent(page,S.SAVE_KEY);
    equal(await copies(page),[corrupt,''],'The original malformed and empty strings remain unchanged');
    if(expected==='baseline'){equal(await hasRecovery(page),0,'Baseline displays an error while leaving the game surface active');equal(await exportMemory(page),raw,'Baseline still has its memory copy before a new valid save arrives');return;}
    await waitRecovery(page,'unreadable');equal(await control(page,'recovery-restore').count(),0,'Existing unreadable data never grants restore permission');
    const bundle=JSON.parse(await download(page,'recovery-export-raw','original-records'));
    equal(bundle,{format:'dice-abyss-raw-records',records:{[S.SAVE_KEY]:corrupt,[S.BACKUP_KEY]:''}},'Raw export preserves both exact original strings, including the present empty string');
    equal(await exportMemory(page),raw,'The ordinary export remains the original complete game memory');
    await donor.evaluate(keys=>{for(const key of keys)localStorage.removeItem(key);},[S.SAVE_KEY,S.BACKUP_KEY]);await waitRecovery(page,'missing');
    await control(page,'recovery-restore').click();await control(page,'confirm').click();await page.waitForFunction(()=>!document.querySelector('[data-save-recovery]'));
    equal(await copies(page),[raw,raw],'Recovery becomes available only after both original records are truly absent');
  });

  await run('pending-confirm-cancel',async(page,context,{raw,donor})=>{
    await control(page,'settings').click();await control(page,'new').click();check(await page.locator('.game-dialog[open]').count()===1,'An ordinary replace-game confirmation is genuinely open');
    await clear(donor,page);
    equal(await page.locator('.game-dialog[open]').count(),expected==='fixed'?0:1,'Loss cancels the obsolete confirmation only in the fixed version');
    if(expected==='fixed'){await page.keyboard.press('Enter');equal(await copies(page),[null,null],'Enter on the protection surface cannot execute the old pending new-game callback');equal(await exportMemory(page),raw,'The cancelled dialog did not discard the memory state');}
  });

  await run('committed-animation-preserved',async(page,context,{state,donor})=>{
    const committed=E.transition(state,{type:'fate'}),raw=S.encodeSave(committed);
    await page.locator('#primary-action').click();await page.locator('#current-room.busy').waitFor();equal((await copies(page))[0],raw,'The animated result was durably committed before storage loss');
    await clear(donor,page);
    if(expected==='fixed'){await waitRecovery(page,'missing');equal(await page.locator('#current-room.busy').count(),0,'Loss ends the old visual presentation');}
    else equal(await hasRecovery(page),0,'Baseline receives no clear recovery feedback during presentation');
    equal(await exportMemory(page),raw,'Export contains the complete committed result, not the pre-animation display snapshot');
  },{full:true});

  await run('native-session-storage-filter',async(page,context,{raw})=>{
    await page.evaluate(url=>new Promise(resolve=>{const frame=document.createElement('iframe');frame.id='qa-session-source';frame.style.display='none';frame.onload=resolve;frame.src=url;document.body.append(frame);}),url);
    await control(page,'settings').click();check(await page.locator('.game-dialog[open]').count()===1,'Settings is open before the unrelated sessionStorage event');
    const child=page.frames().find(frame=>frame!==page.mainFrame());assert(child);
    await child.evaluate(key=>sessionStorage.setItem(key,'unrelated session-only value'),S.SAVE_KEY);await waitEvent(page,S.SAVE_KEY);
    const event=(await page.evaluate(()=>window.__saveEvents)).find(event=>event.area==='session');check(event?.trusted,'The iframe emits an actual trusted sessionStorage event');
    equal(await page.locator('.game-dialog[open]').count(),expected==='fixed'?1:0,'Matching sessionStorage keys cannot close the fixed application dialog');equal(await copies(page),[raw,raw],'The unrelated session event never changes localStorage records');
  });

  await run('recovery-viewports-keyboard',async(page,context,{raw,donor})=>{
    await clear(donor,page);
    if(expected==='baseline'){equal(await hasRecovery(page),0,'Baseline recovery layout is absent');return;}
    await waitRecovery(page,'missing');
    for(const [width,height] of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,812]]){
      await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
      const geometry=await page.locator('[data-save-recovery]').evaluate(root=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...root.querySelectorAll('button')].map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,height:box.height};})}));
      check(geometry.scroll<=width+1&&geometry.controls.every(box=>box.left>=-1&&box.right<=width+1&&box.height>=43),`Recovery fits ${width}x${height} with reachable 44px controls`,geometry);
      if(width===390||width===320)await shot(page,`recovery-${width}x${height}`);
    }
    await page.locator('#save-recovery-title').focus();await page.keyboard.press('Tab');check(await control(page,'export').evaluate(node=>node===document.activeElement),'Keyboard reaches the complete backup action first');
    await page.keyboard.press('Tab');check(await control(page,'recovery-restore').evaluate(node=>node===document.activeElement),'Keyboard reaches the explicitly confirmed restore action next');
    await page.keyboard.press('Enter');check(await page.locator('.game-dialog[open]').count()===1,'Enter opens the real restore dialog');await page.keyboard.press('Escape');
    check(await control(page,'recovery-restore').evaluate(node=>node===document.activeElement),'Escape returns focus to the surviving restore opener');equal(await copies(page),[null,null],'Keyboard navigation and dialog cancellation write no records');equal(await exportMemory(page,'narrow-memory'),raw,'The narrow view keeps the complete export functional');
  });

  for(const mode of ['clear','remove'])await run(`queued-${mode}-recreate`,async(page,context,{state,raw,donor})=>{
    const other=mode==='clear'?E.newGame(130133):structuredClone(state);
    if(mode==='clear')other.runId='round13-queued-new-run';else other.qaRecovery.extraBranch={unknown:'changed while run ID and revision remain equal'};
    const otherRaw=S.encodeSave(other);
    await donor.evaluate(({mode,raw,keys})=>{
      // One donor task may still run concurrently with the receiving tab. Do
      // not treat this native delete/recreate sequence as an atomic snapshot.
      if(mode==='clear')localStorage.clear();else for(const key of keys)localStorage.removeItem(key);
      for(const key of keys)localStorage.setItem(key,raw);
    },{mode,raw:otherRaw,keys:[S.SAVE_KEY,S.BACKUP_KEY]});
    await page.waitForFunction(count=>(window.__saveEvents||[]).length>=count,mode==='clear'?3:4);
    const events=await page.evaluate(()=>window.__saveEvents);
    check(events.some(event=>event.trusted&&event.area==='local'&&(mode==='clear'?event.key===null:event.key!==null&&event.newLength===null)),'The queued sequence includes a real trusted deletion notification');
    equal(await copies(page),[otherRaw,otherRaw],'The fully recreated browser run remains byte-identical');
    if(expected==='baseline'){equal(await hasRecovery(page),0,'Baseline synchronizes immediately after queued deletion and recreation');equal(await exportMemory(page),otherRaw,'Baseline no longer exports the previously surviving memory');return;}
    await waitRecovery(page,'available');equal(await exportMemory(page),raw,'A queued deletion preserves the old full memory even when replacement storage is already readable');
    if(mode==='remove'){equal(other.runId,state.runId,'The new branch intentionally retains the run ID');equal(other.revision,state.revision,'The new branch intentionally retains the revision');check(otherRaw!==raw,'The complete unknown state content still differs');}
    equal(await copies(page),[otherRaw,otherRaw],'Memory export cannot overwrite the new browser candidate');
  });

  await run('queued-identical-recreate',async(page,context,{state,raw,donor})=>{
    // Record all native getter returns in sequence, including reads before a
    // diagnostic capture marker. The app and tail listener use the same normal
    // phase, with the app registered first. Group only at that trailing marker;
    // no assumption about Window's target/capture ordering gates any read.
    active.readObserver=await page.evaluate(keys=>{
      const storage=localStorage,nativeGet=Storage.prototype.getItem;let sequence=0;
      window.__saveReadTimeline=[];
      const record=item=>window.__saveReadTimeline.push({sequence:++sequence,mode:window.__saveReadMode??null,...item});
      const start=event=>{
        if(event.storageArea!==storage||(event.key!==null&&!keys.includes(event.key)))return;
        record({kind:'capture-marker',key:event.key,trusted:event.isTrusted,eventPhase:event.eventPhase});
      };
      const end=event=>{
        if(event.storageArea!==storage||(event.key!==null&&!keys.includes(event.key)))return;
        record({kind:'event-tail',key:event.key,trusted:event.isTrusted,eventPhase:event.eventPhase,protectedAfter:!!document.querySelector('[data-save-recovery]'),dialogOpenAfter:!!document.querySelector('.game-dialog[open]')});
      };
      const observedGet=function(key){
        let value;
        try{value=Reflect.apply(nativeGet,this,arguments);}
        catch(error){if(this===storage&&keys.includes(key))record({kind:'read',key,error:{name:error.name,message:error.message}});throw error;}
        if(this===storage&&keys.includes(key))record({kind:'read',key,value});return value;
      };
      Storage.prototype.getItem=observedGet;
      window.addEventListener('storage',start,true);window.addEventListener('storage',end);
      window.__restoreSaveReadObserver=()=>{Storage.prototype.getItem=nativeGet;window.removeEventListener('storage',start,true);window.removeEventListener('storage',end);};
      return {prototypeInstalled:Storage.prototype.getItem===observedGet,localUsesWrapper:storage.getItem===observedGet};
    },[S.SAVE_KEY,S.BACKUP_KEY]);
    active.observations=[];
    try{
      check(active.readObserver.prototypeInstalled&&active.readObserver.localUsesWrapper,'The continuous observer wraps the actual native localStorage getter');
      for(const mode of ['clear','remove']){
        await control(page,'settings').click();await page.evaluate(mode=>{window.__saveReadMode=mode;window.__sameRecoveryScene=document.querySelector('.game-shell');},mode);
        const count=await page.evaluate(()=>window.__saveEvents.length);
        await donor.evaluate(({mode,raw,keys})=>{if(mode==='clear')localStorage.clear();else for(const key of keys)localStorage.removeItem(key);for(const key of keys)localStorage.setItem(key,raw);},{mode,raw,keys:[S.SAVE_KEY,S.BACKUP_KEY]});
        await page.waitForFunction(count=>(window.__saveEvents||[]).length>=count,count+(mode==='clear'?3:4));
        const timeline=await page.evaluate(mode=>{const result=window.__saveReadTimeline.filter(item=>item.mode===mode);window.__saveReadMode=null;return result;},mode);
        const observations=[];let reads=[];
        for(const item of timeline){
          if(item.kind==='read')reads.push(item);
          if(item.kind==='event-tail'){observations.push({...item,reads});reads=[];}
        }
        active.observations.push({mode,events:observations,ungroupedReads:reads});
        assert.equal(reads.length,0,`${mode}: no actual getter return is left outside the observed event sequence`);
        equal(await copies(page),[raw,raw],`${mode}: all recreated original save bytes remain intact`);
        if(expected==='baseline'){
          equal(await hasRecovery(page),0,`${mode}: baseline has no recovery surface after identical recreation`);
          equal(await page.locator('.game-dialog[open]').count(),0,`${mode}: baseline closes settings on the later save notifications`);
          equal(await page.evaluate(()=>document.querySelector('.game-shell')===window.__sameRecoveryScene),false,`${mode}: baseline replaces the scene on later save notifications`);
        }else{
          check(observations.length===(mode==='clear'?3:4)&&observations.every(item=>item.trusted),`${mode}: every real deletion and recreation event has an app-read observation`);
          const snapshots=observations.map(observation=>{
            const reads=observation.reads;
            if(reads.some(read=>read.error))return {status:'unreadable',error:reads.find(read=>read.error).error};
            assert.deepEqual(reads.map(read=>read.key),[S.SAVE_KEY,S.BACKUP_KEY],`${mode}: each actual recovery inspection reads the ordered complete raw pair`);
            const pair={primary:reads[0].value,mirror:reads[1].value};
            const loaded=S.loadSave({getItem:key=>key===S.SAVE_KEY?pair.primary:key===S.BACKUP_KEY?pair.mirror:null});
            if(loaded.state)assert.deepEqual(loaded.state,state,`${mode}: every readable observation is the complete original state, including unknown fields`);
            return {status:loaded.state?'available':pair.primary===null&&pair.mirror===null?'missing':'unreadable',bothOriginal:pair.primary===raw&&pair.mirror===raw};
          });
          const observedLoss=snapshots.some(snapshot=>snapshot.status!=='available');
          Object.assign(active.observations.at(-1),{snapshots,observedLoss});
          equal(await hasRecovery(page),observedLoss?1:0,`${mode}: protection exactly follows whether an actual app inspection lost both readable copies`);
          equal(await page.locator('.game-dialog[open]').count(),observedLoss?0:1,`${mode}: an observed loss cancels the old dialog; continuously readable identical progress keeps it`);
          if(!observedLoss&&snapshots.every(snapshot=>snapshot.bothOriginal))equal(await page.evaluate(()=>document.querySelector('.game-shell')===window.__sameRecoveryScene),true,`${mode}: fully identical observed pairs preserve the scene node`);
          if(observedLoss){
            await waitRecovery(page,'available');
            equal(await exportMemory(page,`${mode}-protected-memory`),raw,`${mode}: an observed temporary loss keeps the complete original memory exportable`);
            await control(page,'recovery-load').click();
            equal(await copies(page),[raw,raw],`${mode}: reviewing the identical browser candidate writes neither record`);
            await control(page,'confirm').click();await page.waitForFunction(()=>!document.querySelector('[data-save-recovery]'));
          }
        }
        equal(await exportMemory(page,`${mode}-final-memory`),raw,`${mode}: the final exported state is the complete original envelope`);
        equal(await copies(page),[raw,raw],`${mode}: the completed interaction leaves both original browser strings unchanged`);
        await page.keyboard.press('Escape');
      }
    }finally{
      active.storageReadTimeline=await page.evaluate(()=>window.__saveReadTimeline);
      await page.evaluate(()=>window.__restoreSaveReadObserver());
    }
  });
} finally {
  report.sourceAfter=await identity();report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  report.finished=new Date().toISOString();report.passed=report.cases.filter(item=>item.status==='PASS').length;report.failed=report.cases.filter(item=>item.status==='FAIL').length;
  if(!report.cases.length){report.runError='No browser cases executed.';process.exitCode=1;}
  if(report.errors.length||!report.sourceUnchanged)process.exitCode=1;
  await browser.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,checks:report.checks,errors:report.errors.length,sourceUnchanged:report.sourceUnchanged,output}));
}
