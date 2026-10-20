// Round22 native browser checks. Tester supplies Playwright/Chromium; no runtime dependency.
// --source=/absolute/project --url=http://127.0.0.1:4221/ --output=/tmp/fresh-dir
// --suite=inventory|deep|layout|visual|services --expect=baseline|current
// Connected Browser and cloud CUA both returned ERR_CONNECTION_REFUSED for this
// workspace's loopback server. The task explicitly permits local Playwright QA.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(2,at),arg.slice(at+1)];}));
const root=path.resolve(args.source),url=args.url,output=path.resolve(args.output),suite=args.suite||'inventory',baseline=args.expect==='baseline';
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname));
assert(!output.startsWith(root+path.sep),'Evidence stays outside source');
await fs.mkdir(output,{recursive:true});
await assert.rejects(fs.access(path.join(output,'report.json')),'Use a new attempt directory');
const [E,S]=await Promise.all(['engine','storage'].map(file=>import(pathToFileURL(path.join(root,'src',file+'.js')))));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['index.html','package.json','src/release.js','src/app.js','src/views.js','src/engine.js','src/storage.js','src/inventory-dom.js','src/inventory-render.js','src/deep-rules.js','src/deep-content.js','src/encounter-tactics.js','src/deep.css'];
const identity=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async p=>{try{return [p,sha(await fs.readFile(path.join(root,p)))];}catch(e){if(e.code==='ENOENT'&&p==='src/inventory-render.js')return [p,null];throw e;}})));
const report={started:new Date().toISOString(),suite,expected:baseline?'baseline':'current',url,sourceBefore:await identity(),scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),cases:[],errors:[],notes:[
 'All contexts and saves are disposable. Fixture preparation uses the real validator and codec. No private save or external server is touched.',
 'Inputs use native pointer/keyboard/select controls and real localStorage/Web Locks. Only initial test fixtures are installed programmatically.',
 'Synthetic fixtures are not natural gameplay evidence. Full save equality compares every field, including RNG, revision, unknown fields and pending rewards.',
 'Functional checks use low effects and reduced motion. Separate performance scripts record their own protocols; none certify physical Windows or hardware GPU performance.'
]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let row;
const check=(value,label,detail)=>{row.checks.push({label,passed:!!value,...(detail===undefined?{}:{detail})});assert(value,label);};
const eq=(actual,expected,label)=>{row.checks.push({label,passed:false,actualSha256:sha(actual),expectedSha256:sha(expected)});assert.deepEqual(actual,expected,label);row.checks.at(-1).passed=true;};
const button=(p,a)=>p.locator(`[data-action="${a}"]`);
const raw=p=>p.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY);
const saved=async p=>S.decodeSave(await raw(p));
const idle=p=>p.waitForFunction(()=>!document.querySelector('.room-panel')?.classList.contains('busy')&&!document.querySelector('#current-room')?.classList.contains('busy'));
const waitState=(p,s)=>p.waitForFunction(({key,expected})=>localStorage.getItem(key)===expected,{key:S.SAVE_KEY,expected:S.encodeSave(s)});
async function exact(p,state,label){eq(await saved(p),state,label);eq(await p.evaluate(k=>localStorage.getItem(k),S.BACKUP_KEY),await raw(p),label+' mirror');}
async function install(p,state,{effects='low',scale=1}={}){
 assert(S.validateSave(state));assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);
 await p.goto(url);await p.evaluate(({raw,keys,effects,scale})=>{localStorage.clear();localStorage.setItem(keys[0],raw);localStorage.setItem(keys[1],raw);localStorage.setItem(keys[2],JSON.stringify({sound:false,effects,scale}));},{raw:S.encodeSave(state),keys:[S.SAVE_KEY,S.BACKUP_KEY,S.SETTINGS_KEY],effects,scale});
 await p.reload();await button(p,'continue').click();await p.evaluate(()=>document.fonts.ready);await idle(p);
}
async function shot(p,name){await p.screenshot({path:path.join(output,name+'.jpg'),type:'jpeg',quality:76});row.screenshots??=[];row.screenshots.push(name+'.jpg');}
async function run(name,fn,viewport={width:1366,height:768}){
 row={name,status:'RUNNING',checks:[],viewport};report.cases.push(row);
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.route('**/*',r=>r.request().url().startsWith(new URL(url).origin+'/')?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));
 try{await fn({context,page});row.status='PASS';}catch(e){row.status='FAIL';row.error=String(e);row.stack=e.stack;await shot(page,'FAIL-'+name).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(name+': '+row.status);}
}
function inventoryFixture(count=145){const s=E.newGame(22031);s.runId='round22-inventory-22031';s.round22Unknown={preserve:['all','fields']};while(s.player.items.length<count)s.player.items.push(E.makeItem(s,['weapon','armor','relic'][s.nextId%3],s.nextId%3));assert(S.validateSave(s));return s;}
const inventory=p=>p.locator('.main-nav [data-action="inventory"]').click();
const selection=p=>p.locator('#inventory-query').evaluate(n=>({value:n.value,start:n.selectionStart,end:n.selectionEnd,direction:n.selectionDirection,focused:document.activeElement===n}));
async function selectDraft(p){const input=p.locator('#inventory-query');await input.fill('甲乙丙丁戊己');await input.press('Home');await input.press('ArrowRight');await input.press('ArrowRight');await input.press('Shift+ArrowRight');await input.press('Shift+ArrowRight');}
function combatFixture(api,mechanic,{qualifies,level=3}={}){
 for(let seed=22100;seed<23100;seed++){
  let s=api.newGame(seed);s.runId='round22-combat-'+mechanic+'-'+seed;s.floor=200;s.player.level=level;s.player.hp=api.stats(s).maxHp;
  s=api.transition(s,{type:'fate'});s.route[0].type=mechanic;s=api.transition(s,{type:'enter'});
  if(s.enemy.variant!==1)continue;
  // Declared fixture values keep the enemy/player alive for several real rolls.
  s.enemy.attack=1;s.enemy.hp=80000;s.enemy.maxHp=100000;s.enemy.shield=0;s.enemy.maxShield=18000;s.player.hp=api.stats(s).maxHp;
  s.round22Unknown={nested:['must','survive']};
  const after=api.transition(s,{type:'roll'}),v=after.lastRoll.values;
  const ok=mechanic==='sequence'?after.lastRoll.best>=2:v.filter(n=>n%2===0).length>v.length/2;
  if(qualifies===undefined||ok===qualifies)return s;
 }
 throw Error('No deterministic constructed fixture found in declared 1000-seed range');
}

try{
 if(suite==='inventory'){
  await run('same-run-native-storage-preserves-draft-selection',async({context,page})=>{
   const s=inventoryFixture();await install(page,s);await inventory(page);
   const peer=await context.newPage();peer.on('pageerror',e=>report.errors.push(String(e)));await peer.goto(url);await button(peer,'continue').click();await inventory(peer);
   await selectDraft(page);const before=await selection(page);eq([before.start,before.end],[2,4],'native keyboard creates middle selection');
   const lock=peer.locator('.inventory-list [data-action="lock"]').first(),id=await lock.getAttribute('data-id');
   const expected=E.transition(s,{type:'lock',id});await lock.click();await waitState(page,expected);
   await page.locator('.toast').filter({hasText:/另一窗口|镜像/}).waitFor({state:'visible'});
   const after=await selection(page);row.before=before;row.after=after;
   eq(after.value,before.value,'same-run unsubmitted draft survives');check(after.focused,'focus stays in search');
   if(baseline){check(after.start!==before.start||after.end!==before.end,'input version reproduces selection loss',{before,after});row.result='REPRODUCED_PRODUCT_BUG';}
   else eq(after,before,'same-run storage update preserves exact selection and direction');
   await exact(page,expected,'peer lock remains one complete engine transition');
   await page.locator('#inventory-query').press('x');const edited=await selection(page);row.nextTypedValue=edited.value;
   if(!baseline)eq(edited.value,'甲乙x戊己','typing replaces the intended selection after synchronization');
   await shot(page,'same-run-caret');
  });
  await run('pure-inventory-actions-keep-state-and-correct-results',async({page})=>{
   const s=inventoryFixture(300);await install(page,s);await inventory(page);
   await page.evaluate(()=>{window.__round22Shell={top:document.querySelector('.topbar'),left:document.querySelector('.left-rail'),right:document.querySelector('.right-rail'),bottom:document.querySelector('.bottomline')};});
   const controls=await page.locator('.inventory-screen [data-action]').evaluateAll(ns=>ns.slice(0,12).map(n=>({...n.dataset,text:n.textContent.trim()})));row.controls=controls;
   const slots=page.locator('.inventory-screen [data-action="filter"][data-slot="weapon"]');
   await slots.click();await page.locator('.inventory-list').waitFor();
   const slotValues=await page.locator('.inventory-list [data-action="lock"]').evaluateAll(ns=>ns.map(n=>n.dataset.id));
   check(slotValues.length>0&&slotValues.every(id=>s.player.items.find(i=>i.id===id)?.slot==='weapon'),'weapon filter shows only actual weapons');
   await page.locator('#inventory-sort').selectOption('level');
   await page.locator('#inventory-query').fill(s.player.items.find(i=>i.slot==='weapon').name);
   await page.locator('#inventory-query').press('Enter');
   const ids=await page.locator('.inventory-list [data-action="lock"]').evaluateAll(ns=>ns.map(n=>n.dataset.id));
   check(ids.length>0,'submitted search has matching items');
   const live=await selection(page);check(live.focused,'search submission keeps keyboard focus');
   const same=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__round22Shell).map(([key,node])=>[key,node===document.querySelector({top:'.topbar',left:'.left-rail',right:'.right-rail',bottom:'.bottomline'}[key])])));row.shellIdentity=same;
   if(baseline)check(Object.values(same).some(x=>!x),'input rebuilds shell on pure filter');else check(Object.values(same).every(Boolean),'current keeps all outer shell nodes during pure view changes');
   await exact(page,s,'view-only actions never alter save or RNG');await shot(page,'inventory-results');
  });
 }
 else if(suite==='deep'){
  assert(!baseline,'New mechanics suite targets the current build');
  const oldE=await import(pathToFileURL(path.join(path.resolve(args['baseline-source']),'src/engine.js')));
  for(const mechanic of ['parity','sequence'])for(const qualifies of [false,true]){
   await run(`${mechanic}-${qualifies?'hit':'miss'}-manual-roll-refresh`,async({page})=>{
    const s=combatFixture(E,mechanic,{qualifies});await install(page,s);check(s.enemy.combatRules===5,'new enemy contains committed known combat-rules version');
    const title=mechanic==='parity'?'偶点先行':'共鸣破阵';eq(await page.locator('.tactic-variant').innerText(),title,'variant title visibly identifies new rules');
    const firstText=await page.locator('.combat-tactics').innerText();row.initialGuide=firstText;row.fixture={seed:s.runId,source:'generated encounter, synthetic floor/level/HP/attack declared in script'};
    check(firstText.includes(mechanic==='parity'?'偶点':'双同'),'current guide states actual alternate trigger');
    await page.locator('.combat-rules summary').press('Space');check(await page.locator('.combat-rules').evaluate(n=>n.open),'keyboard opens full rules');check((await page.locator('.combat-rules').innerText()).includes(s.enemy.label),'saved label appears in complete rules');
    let state=s;
    for(let i=0;i<3;i++){
     const expected=E.transition(state,{type:'roll'});await page.locator('#primary-action').click();await waitState(page,expected);await page.locator('#primary-action:not(:disabled)').waitFor();await exact(page,expected,'manual roll '+(i+1)+' complete state');
     eq(await page.locator('.combat-tactics').getAttribute('data-tactic-turn'),String(i+2),'guide advances only after committed roll');
     if(i===0){row.firstRoll={values:expected.lastRoll.values,mechanics:expected.lastRoll.mechanics,shield:expected.enemy.shield,total:expected.lastRoll.total};if(mechanic==='sequence')check(expected.lastRoll.mechanics.some(n=>n.includes(qualifies?'合鸣破阵':'独声未破阵')),'correct branch settles and is recorded');}
     state=expected;
    }
    const committed=await raw(page);await page.reload();await button(page,'continue').click();await exact(page,state,'refresh preserves new pending fight');eq(await raw(page),committed,'refresh never rewrites envelope');eq(await page.locator('.tactic-variant').innerText(),title,'refresh keeps variant label');
    if(qualifies)await shot(page,'new-'+mechanic);
   });
  }
  for(const mechanic of ['parity','sequence'])for(const legacyUnknown of ['absent','number','object'])await run(`${mechanic}-legacy-${legacyUnknown}-pending-roll-and-retry`,async({page})=>{
   const s=combatFixture(oldE,mechanic,{qualifies:false});check(s.enemy.combatRules===4,'input-generated fight has the original known rules version');if(legacyUnknown!=='absent')s.enemy.deepVariantRules=legacyUnknown==='number'?1:{owner:'legacy-test',custom:['keep','unchanged']};await install(page,s);
   eq(await page.locator('.tactic-variant').count(),0,'old pending never displays a new-rule badge');
   const expected=oldE.transition(s,{type:'roll'});eq(E.transition(s,{type:'roll'}),expected,'new engine preserves complete old pending transition');
   await page.locator('#primary-action').click();await waitState(page,expected);await page.locator('#primary-action:not(:disabled)').waitFor();await exact(page,expected,'browser old pending equals input engine');
   const dead=structuredClone(expected);dead.phase='dead';dead.player.hp=0;await install(page,dead);const retry=oldE.transition(dead,{type:'retry'});eq(E.transition(dead,{type:'retry'}),retry,'old retry equals input engine');
   await page.locator('[data-action="retry"]').first().click();await waitState(page,retry);await exact(page,retry,'retry remains full original saved fight');eq(await page.locator('.tactic-variant').count(),0,'old retry has no new-rule badge');
  });
  for(const mechanic of ['parity','sequence'])await run(`${mechanic}-new-retry-chest-loot`,async({page})=>{
   const s=combatFixture(E,mechanic);s.phase='dead';s.player.hp=0;await install(page,s);
   let expected=E.transition(s,{type:'retry'});await button(page,'retry').first().click();await waitState(page,expected);await exact(page,expected,'new retry commits once');check(expected.enemy.combatRules===5,'new retry keeps original combat-rules version');check(await page.locator('.tactic-variant').isVisible(),'new retry displays correct rule');
   // A separate disclosed low-HP fixture exercises the unchanged chest boundary.
   expected.enemy.hp=1;expected.enemy.shield=0;await install(page,expected);const chest=E.transition(expected,{type:'roll'});check(chest.phase==='chest','test fixture reaches real chest action');
   await page.locator('#primary-action').click();await waitState(page,chest);await page.locator('#primary-action:not(:disabled)').waitFor();await exact(page,chest,'new opponent yields one committed chest');
   const loot=E.transition(chest,{type:'open'});await page.locator('#primary-action').click();await waitState(page,loot);await page.locator('#primary-action:not(:disabled)').waitFor();await exact(page,loot,'chest opens original reward once');check(await page.locator('.loot-screen').isVisible(),'reward is actually rendered');
  });
 }
 else if(suite==='services'){
  function service(type){let s=E.newGame(22127);s.runId='round22-service-'+type;s.floor=200;s.player.level=50;s.player.gold=100000;s.player.hp=E.stats(s).maxHp;s=E.transition(s,{type:'fate'});s.route[0].type=type;s.route[1].type='combat';s=E.transition(s,{type:'enter'});s.round22Unknown={case:type};return s;}
  await run('merchant-buy-equip-and-reload',async({page})=>{
   const s=service('merchant');await install(page,s);const offer=s.shop.find(o=>o.item&&!o.sold);check(!!offer,'real merchant generates an equipment offer');
   const expected=E.transition(s,{type:'buy',id:offer.id});await page.locator(`[data-action="buy"][data-id="${offer.id}"]`).click();await waitState(page,expected);await exact(page,expected,'merchant purchase uses exact original price and original item');
   check(await page.locator(`[data-action="buy"][data-id="${offer.id}"]`).isDisabled(),'sold item cannot be purchased twice');
   await inventory(page);const equipped=E.transition(expected,{type:'equip',id:offer.item.id});await page.locator(`[data-action="equip"][data-id="${offer.item.id}"]`).click();await waitState(page,equipped);await exact(page,equipped,'purchased equipment commits through the existing save transaction');
   await page.reload();await button(page,'continue').click();await exact(page,equipped,'refresh preserves purchase and equipment');
  });
  await run('paid-event-cancel-confirm-next-fight',async({page})=>{
   const s=service('echochamber');await install(page,s);const accept=page.locator('[data-action="event-choice"][data-id="accept"]');await accept.click();check(await page.locator('dialog').isVisible(),'paid choice presents review');await exact(page,s,'opening payment review does not spend');
   await page.locator('dialog [data-action="close-dialog"]').first().click();await exact(page,s,'cancel leaves every state field and RNG unchanged');
   await accept.click();const expected=E.transition(s,{type:'event-choice',id:'accept',confirmed:true});await page.locator('dialog [data-action="confirm"]').click();await waitState(page,expected);await exact(page,expected,'explicit confirmation spends once and stores the original boon');check(expected.v5Boons.echo===1,'paid boon exists in the real state');
   const next=E.transition(expected,{type:'next'});await page.locator('#primary-action').click();await waitState(page,next);await page.locator('#primary-action:not(:disabled)').waitFor();await exact(page,next,'next room uses the original saved route');check(next.enemy.openingEcho===.25,'next real enemy receives the original opening echo');
   const roll=E.transition(next,{type:'roll'});await page.locator('#primary-action').click();await waitState(page,roll);await page.locator('#primary-action:not(:disabled)').waitFor();await exact(page,roll,'paid boon settles through a native manual combat roll');
  });
 }
 else if(suite==='visual'){
  await run('native-rule-label-style-exploration',async({page})=>{
   const s=combatFixture(E,'sequence');await install(page,s);await page.locator('.combat-tactics').scrollIntoViewIfNeeded();
   const choices=[
    {id:'plain-type',css:'.tactic-variant{border-color:transparent;background:transparent;padding-left:0;padding-right:0;color:#d1d9de}'},
    {id:'gold-stamp',css:'.tactic-variant{border-color:#8f713d;color:#ead39c;background:#2c2318}'},
    {id:'cyan-edge-selected',css:''}
   ];row.choices=[];
   for(const choice of choices){
    const style=choice.css?await page.addStyleTag({content:choice.css}):null;
    const properties=await page.locator('.tactic-variant').evaluate(n=>{const s=getComputedStyle(n),b=n.getBoundingClientRect();return {text:n.textContent,color:s.color,background:s.backgroundColor,border:s.borderColor,fontSize:s.fontSize,width:b.width,height:b.height};});
    const file='visual-'+choice.id+'.jpg';await page.locator('.enemy-trait').screenshot({path:path.join(output,file),type:'jpeg',quality:82});
    row.choices.push({...choice,properties,file,sha256:sha(await fs.readFile(path.join(output,file)))});
    eq(properties.text,'共鸣破阵','each visual proposal keeps exact rule identity');check(parseFloat(properties.fontSize)>=11,'visual exploration retains compact text minimum');
    if(style)await style.evaluate(n=>n.remove());
   }
   row.selection='cyan-edge-selected';await exact(page,s,'temporary visual study keeps full save unchanged');
  });
 }
 else if(suite==='layout'){
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[1100,700],[390,844]]){
   for(const mechanic of ['parity','sequence'])await run(`layout-${mechanic}-${width}x${height}`,async({page})=>{
    const s=combatFixture(E,mechanic);await install(page,s,{scale:width===1100?1.1:1});
    await page.locator('.combat-tactics').scrollIntoViewIfNeeded();
    const measurements=await page.locator('.combat-tactics').evaluate(n=>{
     const r=n.getBoundingClientRect(),badge=n.querySelector('.tactic-variant'),b=badge.getBoundingClientRect();
     return {viewport:[innerWidth,innerHeight],pageOverflow:document.documentElement.scrollWidth>innerWidth+1,rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},badge:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,fontSize:getComputedStyle(badge).fontSize},overflow:n.scrollWidth>n.clientWidth+1};
    });row.measurements=measurements;
    check(!measurements.pageOverflow,'no horizontal page overflow');check(!measurements.overflow,'tactic card has no clipped horizontal text');
    check(measurements.badge.left>=0&&measurements.badge.right<=width+1,'variant badge stays in viewport');check(measurements.badge.top>=0&&measurements.badge.bottom<=height+1,'variant badge is reachable by scrolling');check(parseFloat(measurements.badge.fontSize)>=11,'badge meets existing compact-text floor');
    await page.locator('.combat-rules summary').press('Space');check(await page.locator('.combat-rules').evaluate(n=>n.open),'full rules remain keyboard operable');
    if(width===1366||width===390)await shot(page,`layout-${mechanic}-${width}`);
    await page.locator('#primary-action').click({trial:true});check(true,'manual roll control reachable and unobstructed');await exact(page,s,'layout and rules never modify save');
   },{width,height});
  }
 }
 else throw Error('Unimplemented suite '+suite);
}finally{
 report.finished=new Date().toISOString();report.sourceAfter=await identity();report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
 report.checks=report.cases.reduce((n,r)=>n+r.checks.length,0);report.failed=report.cases.filter(r=>r.status!=='PASS').length;
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({cases:report.cases.length,checks:report.checks,failed:report.failed,errors:report.errors,sourceUnchanged:report.sourceUnchanged}));
if(report.failed||report.errors.length)process.exitCode=1;
