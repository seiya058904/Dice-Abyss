// Native inventory navigation regression, with explicitly separate expectations
// for the original defects and the fixed behavior. Run against a loopback server
// serving --source. Generated evidence must stay outside the complete project.
// Example: PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome
// node scripts/qa-inventory-navigation.mjs --source=/path/to/project \
//   --url=http://127.0.0.1:4277/ --output=/tmp/inventory-qa --expect=fixed
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {values:args}=parseArgs({options:{source:{type:'string'},url:{type:'string'},output:{type:'string'},expect:{type:'string'}}});
const source=path.resolve(args.source||fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(args.output||'/tmp/dice-inventory-navigation');
const url=args.url||'http://127.0.0.1:4277/',expect=args.expect||'fixed',baseline=expect==='baseline';
assert(['baseline','fixed'].includes(expect),'--expect must be baseline or fixed');
assert(output!==source&&!output.startsWith(source+path.sep),'Keep generated evidence outside the complete project');
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only isolated loopback test origins are supported');
const [E,S]=await Promise.all(['src/engine.js','src/storage.js'].map(file=>import(pathToFileURL(path.join(source,file)))));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
const desktopSizes=[[1366,768],[1920,1080],[2560,1440],[3840,2160]],coreViewport={width:1366,height:768};
const fixture=E.newGame(27017);fixture.runId='qa-round07-inventory-27017';
while(fixture.player.items.length<145)fixture.player.items.push(E.makeItem(fixture,'weapon',fixture.nextId%3));
assert(S.validateSave(fixture),'The synthetic 145-item starting state must pass the real validator');
const fixtureRaw=S.encodeSave(fixture);
await fs.mkdir(path.join(output,'states'),{recursive:true});
await fs.writeFile(path.join(output,'states','initial.json'),fixtureRaw+'\n');
const files=['src/app.js','src/engine.js','src/storage.js','src/views.js','src/styles.css','src/visual.css','src/rooms.css','src/deep.css'];
try{await fs.access(path.join(source,'src/inventory-dom.js'));files.push('src/inventory-dom.js');}catch{}
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await fs.readFile(path.join(source,file)))])));
const report={started:new Date().toISOString(),expect,source,url,synthetic:true,coreViewport,desktopSizes,
  scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),sourceHashes,
  fixture:{file:'states/initial.json',sha256:hash(fixtureRaw),items:fixture.player.items.length,runId:fixture.runId,seed:27017},
  cases:[],errors:[],notes:[
    'All scenarios use a generated, validator-accepted starting save, real app handlers, native localStorage and native Web Locks. No production method or browser storage API is replaced.',
    'Every state checkpoint deep-compares the complete decoded state with a real engine transition or the unchanged initial state. Actual and expected save envelopes are retained for independent review.',
    '--expect=baseline deliberately asserts the observed input defects. REPRODUCED is evidence of a defect, not a usability pass.',
    'Functional runs use reduced motion and initially low effects. These results and DOM access counts make no FPS, GPU, layout-duration or physical-device performance claim.',
    'The four desktop viewport sizes are emulated browser window dimensions. In fixed mode the 390px case now verifies Round11 reflow; baseline mode retains the historical minimum-width reproduction. Neither certifies physical mobile devices.'
  ]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let row;
const check=(condition,label)=>{row.checks.push({label,passed:!!condition});assert(condition,label);};
const equal=(actual,expected,label)=>{const record={label,passed:false};row.checks.push(record);assert.deepEqual(actual,expected,label);record.passed=true;};
const near=(actual,expected,label)=>check(Math.abs(actual-expected)<=1,`${label} (actual ${actual}, expected ${expected}, tolerance 1 CSS px)`);
const raw=page=>page.evaluate(key=>localStorage.getItem(key),keys.main);
const inventory=page=>page.locator('.inventory-list');
const pager=(page,direction)=>page.locator('.inventory-pagination [data-action="inventory-page"]').nth(direction==='previous'?0:1);
function expectedIds(state,{sort='power',rarity='',slot='',page=0}={}){
  const sorted=state.player.items.filter(item=>(!slot||item.slot===slot)&&(rarity===''||item.rarity===Number(rarity))).toSorted((a,b)=>
    sort==='rarity'?b.rarity-a.rarity||E.itemValue(b)-E.itemValue(a):sort==='level'?b.level-a.level||E.itemValue(b)-E.itemValue(a):E.itemValue(b)-E.itemValue(a));
  return sorted.slice(page*60,(page+1)*60).map(item=>item.id);
}
async function observe(page){
  return page.evaluate(()=>{
    const list=document.querySelector('.inventory-list'),box=list.getBoundingClientRect(),active=document.activeElement;
    const cards=[...list.querySelectorAll('.item-card')].map(card=>{const rect=card.getBoundingClientRect();return {id:card.querySelector('[data-action="lock"]').dataset.id,offset:rect.top-box.top,height:rect.height};});
    const pages=[...document.querySelectorAll('.inventory-pagination [data-action="inventory-page"]')];
    return {scroll:list.scrollTop,scrollLeft:list.scrollLeft,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,
      ids:cards.map(card=>card.id),cards,pagination:document.querySelector('.inventory-pagination').innerText,
      focus:{tag:active.tagName,id:active.id,data:{...active.dataset},disabled:!!active.disabled,inDialog:!!active.closest('dialog[open]'),pageDirection:pages.indexOf(active)},
      dialogOpen:!!document.querySelector('dialog[open]')};
  });
}
async function shot(page,name){
  const file=`${row.name}-${name}.png`;await page.screenshot({path:path.join(output,file)});(row.screenshots||=[]).push(file);
}
async function stateEvidence(page,expected,label,{unchanged=false}={}){
  const actualRaw=await raw(page),expectedRaw=S.encodeSave(expected),prefix=`${row.name}-${label}`;
  await fs.writeFile(path.join(output,'states',`${prefix}-actual.json`),actualRaw+'\n');
  await fs.writeFile(path.join(output,'states',`${prefix}-expected.json`),expectedRaw+'\n');
  (row.states||=[]).push({label,actual:`states/${prefix}-actual.json`,expected:`states/${prefix}-expected.json`,actualSha256:hash(actualRaw),expectedSha256:hash(expectedRaw),revision:expected.revision});
  equal(S.decodeSave(actualRaw),expected,`${label}: complete actual state equals the authoritative expected state`);
  equal(await page.evaluate(keys=>localStorage.getItem(keys.main)===localStorage.getItem(keys.mirror),keys),true,`${label}: native primary and mirror remain byte-identical`);
  if(unchanged)equal(actualRaw,fixtureRaw,`${label}: UI-only operation preserves the original primary bytes`);
}
async function waitCommit(page,expected){
  await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:keys.main,revision:expected.revision});
}
async function scrollAndFocus(page,control){
  await control.scrollIntoViewIfNeeded();await control.focus();return observe(page);
}
function focusItem(after,id,action,label){
  check(after.focus.tag==='BUTTON'&&!after.focus.disabled&&after.focus.data.id===id&&after.focus.data.action===action,label);
}
function resetResult(before,after,label){
  near(after.scroll,baseline?before.scroll:0,`${label}: ${baseline?'input retains stale list position':'changed results start at list top'}`);
}
function pageFocus(after,direction,label){
  if(baseline)equal(after.focus.tag,'BODY',`${label}: input loses the remounted page control focus`);
  else check(after.focus.pageDirection===(direction==='previous'?0:1)&&!after.focus.disabled,`${label}: focus remains on the enabled ${direction} direction`);
}
async function fresh(viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(30000);
  await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  for(const type of ['pageerror','console'])page.on(type,event=>{
    if(type==='console'&&event.type()!=='error')return;
    const error={case:row.name,type,message:type==='pageerror'?event.message:event.text()};row.errors.push(error);report.errors.push(error);
  });
  try{
    await page.goto(url);
    await page.evaluate(({keys,raw})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{keys,raw:fixtureRaw});
    await page.reload();await page.evaluate(()=>document.fonts.ready);
    await page.locator('[data-action="continue"]').click();await page.locator('.main-nav [data-action="inventory"]').click();
    equal(await page.locator('.inventory-screen h1').innerText(),'随身行囊','real inventory route is mounted');
    equal(await inventory(page).locator('.item-card').count(),60,'first page contains the actual 60 rendered item cards');
    check(!(await page.locator('dialog[open]').count()),'initial inventory has no open modal overlay');
    if(!report.environment){
      report.environment=await page.evaluate(async files=>({ua:navigator.userAgent,webLocks:!!navigator.locks,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,
        files:Object.fromEntries(await Promise.all(files.map(async file=>{const res=await fetch(new URL(file,location.href),{cache:'no-store'});if(!res.ok)throw Error(`${file}: HTTP ${res.status}`);const bytes=await res.arrayBuffer();return [file,[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')];})))
      }),files);
      equal(report.environment.files,sourceHashes,'served runtime and styles match the explicitly selected source files');
      check(report.environment.webLocks,'native Web Locks are available for the actual save handler');
    }
    return {context,page};
  }catch(error){await context.close();throw error;}
}
async function run(name,fn,{reproduces=false,limitation=false,viewport=coreViewport}={}){
  row={name,status:'RUNNING',viewport,checks:[],errors:[]};report.cases.push(row);let env;
  try{
    env=await fresh(viewport);await fn(env.page);equal(row.errors,[],'no native page exceptions or console errors');
    row.status=limitation?'KNOWN_LIMITATION':baseline&&reproduces?'REPRODUCED':'PASS';
  }catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;if(env)await shot(env.page,'FAIL').catch(()=>{});}
  finally{await env?.context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(`${name}: ${row.status} (${row.checks.length} checks)`);
}

try{
  await run('same-page-lock',async page=>{
    const control=inventory(page).locator('[data-action="lock"]').nth(8),id=await control.getAttribute('data-id');
    row.before=await scrollAndFocus(page,control);row.targetId=id;await shot(page,'before');
    await control.press('Enter');const locked=E.transition(fixture,{type:'lock',id});await waitCommit(page,locked);row.after=await observe(page);
    near(row.after.scroll,row.before.scroll,'same-page lock preserves the existing scroll behavior');
    focusItem(row.after,id,'lock','same-page lock keeps its keyboard action');equal(row.after.ids,row.before.ids,'locking preserves visible sorted item identity');
    await stateEvidence(page,locked,'locked');await shot(page,'locked');
    await inventory(page).locator(`[data-action="lock"][data-id="${id}"]`).press('Enter');
    const unlocked=E.transition(locked,{type:'lock',id});await waitCommit(page,unlocked);row.unlocked=await observe(page);
    near(row.unlocked.scroll,row.after.scroll,'same-page unlock also preserves scroll');focusItem(row.unlocked,id,'lock','same-page unlock retains the same keyboard action');
    equal(await inventory(page).locator(`[data-action="lock"][data-id="${id}"]`).getAttribute('aria-pressed'),'false','native unlocked control exposes the updated pressed state');
    await stateEvidence(page,unlocked,'unlocked');
  });
  for(const kind of ['sort','rarity','slot'])await run(kind,async page=>{
    await inventory(page).evaluate(node=>{node.scrollTop=900;});
    const control=kind==='sort'?page.locator('#inventory-sort'):kind==='rarity'?page.locator('#inventory-rarity'):page.locator('.inventory-screen [data-action="filter"][data-slot="weapon"]');
    await control.focus();row.before=await observe(page);
    if(kind==='slot')await control.press('Enter');else await control.selectOption(kind==='sort'?'rarity':'0');
    row.after=await observe(page);resetResult(row.before,row.after,kind);
    equal(row.after.ids,expectedIds(fixture,kind==='sort'?{sort:'rarity'}:kind==='rarity'?{rarity:'0'}:{slot:'weapon'}),`${kind}: visible results reflect the requested selection`);
    if(kind==='slot')check(row.after.focus.data.action==='filter'&&row.after.focus.data.slot==='weapon',`${kind}: initiating category control retains focus`);
    else equal(row.after.focus.id,kind==='sort'?'inventory-sort':'inventory-rarity',`${kind}: initiating select retains focus`);
    check(row.after.pagination.includes('第 1 /'),`${kind}: selected results restart at the first page`);
    await stateEvidence(page,fixture,'selected',{unchanged:true});await shot(page,'after');
  },{reproduces:true});
  for(const kind of ['page','page-last-fallback','page-first-fallback'])await run(kind,async page=>{
    if(kind!=='page')await pager(page,'next').click();
    await inventory(page).evaluate(node=>{node.scrollTop=900;});
    const direction=kind==='page-first-fallback'?'previous':'next';await pager(page,direction).focus();row.before=await observe(page);
    await pager(page,direction).press('Enter');row.after=await observe(page);
    const resultPage=kind==='page'?1:kind==='page-last-fallback'?2:0;
    resetResult(row.before,row.after,kind);equal(row.after.ids,expectedIds(fixture,{page:resultPage}),`${kind}: actual cards belong to the destination page`);
    pageFocus(row.after,kind==='page-last-fallback'?'previous':'next',kind);
    if(kind!=='page')check(await pager(page,direction).isDisabled(),`${kind}: exhausted direction is disabled`);
    await stateEvidence(page,fixture,'paged',{unchanged:true});await shot(page,'after');
  },{reproduces:true});
  await run('equip',async page=>{
    const control=inventory(page).locator('[data-action="equip"]:not(:disabled)').nth(8),id=await control.getAttribute('data-id');
    row.targetId=id;row.before=await scrollAndFocus(page,control);await shot(page,'before');
    await control.press('Enter');const expected=E.transition(fixture,{type:'equip',id});await waitCommit(page,expected);row.after=await observe(page);
    check(await inventory(page).locator(`[data-action="equip"][data-id="${id}"]`).isDisabled(),'the newly equipped button is now disabled by the real engine state');
    check(row.after.scroll>0,'equipping does not restart the long list at the top');
    if(baseline)equal(row.after.focus.tag,'BODY','input loses focus when the old equip action becomes disabled');
    else{focusItem(row.after,id,'lock','equipping moves focus to the same item usable lock action');near(row.after.cards.find(card=>card.id===id).offset,row.before.cards.find(card=>card.id===id).offset,'equipping preserves the visible item anchor');}
    await stateEvidence(page,expected,'equipped');await shot(page,'after');
  },{reproduces:true});
  await run('removed-item-salvage',async page=>{
    const control=inventory(page).locator('[data-action="salvage-item"]').nth(8),id=await control.getAttribute('data-id');
    row.targetId=id;row.before=await scrollAndFocus(page,control);const oldIndex=row.before.ids.indexOf(id),neighbor=row.before.ids[oldIndex+1]||row.before.ids[oldIndex-1];row.expectedNeighbor=neighbor;
    await shot(page,'before');await control.press('Enter');
    check(await page.locator('dialog[open]').isVisible(),'single item salvage opens the real confirmation');
    check((await observe(page)).focus.inDialog,'confirmation takes native keyboard focus');
    await stateEvidence(page,fixture,'review',{unchanged:true});await shot(page,'review');
    const preview=E.salvagePreview(fixture,[id],true,true),action={type:'salvage',ids:[id],allowProtected:preview.items[0].rarity>=3,allowOverflow:!!preview.overflow};
    await page.locator('dialog[open] [data-action="confirm"]').click();const expected=E.transition(fixture,action);await waitCommit(page,expected);row.after=await observe(page);
    check(!row.after.ids.includes(id),'confirmed salvage removes the original item card');
    if(baseline)equal(row.after.focus.tag,'BODY','input has no focus fallback after the confirmed item disappears');
    else{focusItem(row.after,neighbor,'salvage-item','removed item falls forward to the surviving old neighbor action');near(row.after.cards.find(card=>card.id===neighbor).offset,row.before.cards.find(card=>card.id===id).offset,'surviving neighbor occupies the removed item visible anchor');}
    await stateEvidence(page,expected,'salvaged');await shot(page,'after');
  },{reproduces:true});
  await run('dialog-focus',async page=>{
    await inventory(page).evaluate(node=>{node.scrollTop=900;});
    await page.locator('[data-action="settings"]').click();await page.locator('dialog[open] #effects').focus();row.before=await observe(page);
    check(row.before.focus.inDialog&&row.before.focus.id==='effects','settings select starts with native modal focus');
    await page.locator('dialog[open] #effects').selectOption('full');row.after=await observe(page);
    equal(await page.locator('html').getAttribute('data-effects'),'full','native settings change invokes the app render path');
    check(row.after.dialogOpen&&row.after.focus.inDialog&&row.after.focus.id==='effects','inventory redraw preserves dialog focus priority');
    near(row.after.scroll,row.before.scroll,'background inventory redraw keeps the existing position');
    await stateEvidence(page,fixture,'settings-render',{unchanged:true});await shot(page,'after');
    await page.keyboard.press('Escape');check(!(await page.locator('dialog[open]').count()),'native Escape still dismisses settings');
  });
  await run('four-desktop-layouts',async page=>{
    row.geometry=[];
    for(const [width,height]of desktopSizes){
      await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
      const geometry=await page.evaluate(()=>{
        const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
        const list=document.querySelector('.inventory-list'),pagination=document.querySelector('.inventory-pagination'),card=list.querySelector('.item-card');
        return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],
          list:{...rect(list),scrollWidth:list.scrollWidth,clientWidth:list.clientWidth,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight},pagination:rect(pagination),buttons:[...pagination.querySelectorAll('button')].map(rect),card:{...rect(card),scrollWidth:card.scrollWidth,clientWidth:card.clientWidth}};
      });row.geometry.push(geometry);
      check(geometry.fonts.every(Boolean),`${width}: both offline typefaces loaded`);
      check(geometry.scrollWidth<=width,`${width}: desktop page has no horizontal overflow`);
      check(geometry.list.clientHeight>0&&geometry.list.scrollHeight>geometry.list.clientHeight,`${width}: long inventory has a usable internal scroll area`);
      check(geometry.list.scrollWidth<=geometry.list.clientWidth+1&&geometry.card.scrollWidth<=geometry.card.clientWidth+1,`${width}: list and first item content do not overflow horizontally`);
      check(geometry.list.bottom<=geometry.pagination.top+1&&geometry.pagination.bottom<=height+1,`${width}: pagination remains below the list and inside the viewport`);
      check(geometry.buttons.every(button=>button.left>=0&&button.right<=width+1&&button.top>=0&&button.bottom<=height+1),`${width}: both page controls fit inside the viewport`);
      await shot(page,`${width}x${height}`);
      await pager(page,'next').click();equal((await observe(page)).ids,expectedIds(fixture,{page:1}),`${width}: native next-page click reaches the actual second page`);
      await pager(page,'previous').click();equal((await observe(page)).ids,expectedIds(fixture),`${width}: native previous-page click reaches the actual first page`);
      await stateEvidence(page,fixture,`${width}-navigation`,{unchanged:true});
    }
  });
  await run('narrow-window-reflow',async page=>{
    row.geometry=await page.evaluate(()=>{
      const list=document.querySelector('.inventory-list'),note=document.querySelector('.small-window-note'),rect=list.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyMinWidth:getComputedStyle(document.body).minWidth,list:{left:rect.left,right:rect.right,width:rect.width,height:rect.height},note:{visible:!!note&&getComputedStyle(note).display!=='none',text:note?.innerText}};
    });
    equal(row.geometry.width,390,'390 CSS-pixel viewport is actually used');
    if(baseline)check(row.geometry.scrollWidth>390,'historical desktop minimum-width overflow is explicitly reproduced');
    else{check(row.geometry.scrollWidth<=391,'narrow inventory page fits the viewport');check(row.geometry.list.left>=-1&&row.geometry.list.right<=391,'inventory list fits the narrow viewport');}
    check(row.geometry.list.width>0&&row.geometry.list.height>0,'the inventory list remains visible');
    await stateEvidence(page,fixture,'narrow-render',{unchanged:true});await shot(page,'390x844');
    if(baseline)row.limitation=`The historical inventory remains wider than 390px. The small-window note is ${row.geometry.note.visible?'visible':'hidden by CSS'}. This is defect evidence, not a mobile usability pass.`;
  },{limitation:baseline,viewport:{width:390,height:844}});
}finally{
  await browser.close();report.finished=new Date().toISOString();
  report.summary={groups:report.cases.length,checks:report.cases.reduce((sum,item)=>sum+item.checks.length,0),passedChecks:report.cases.reduce((sum,item)=>sum+item.checks.filter(check=>check.passed).length,0),failedGroups:report.cases.filter(item=>item.status==='FAIL').length,reproducedGroups:report.cases.filter(item=>item.status==='REPRODUCED').length,knownLimitations:report.cases.filter(item=>item.status==='KNOWN_LIMITATION').length,nativeErrors:report.errors.length};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));if(report.summary.failedGroups||report.errors.length)process.exitCode=1;
}
