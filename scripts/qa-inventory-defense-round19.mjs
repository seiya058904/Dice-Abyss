// Optional local-browser QA. Playwright and Chromium are supplied by the tester.
// Example: node scripts/qa-inventory-defense-round19.mjs --url=http://127.0.0.1:4189/ --output=/tmp/dice-r19-defense
// Input observation: add --baseline --source=/path/to/immutable/input and use its server URL.
// --case=<group> reruns only a concrete remaining risk. No remote origins or user profiles.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
const source=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(args['--output']||'/tmp/dice-r19-defense');
const url=args['--url']||'http://127.0.0.1:4189/',baseline=!!args['--baseline'],only=args['--case'];
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'QA requires a disposable loopback origin');
const groupNames=['natural-defense-discovery','compare-equip-manual-replay','contexts-and-native-keyboard','responsive-defense-controls'];
assert(!only||groupNames.includes(only),'unknown --case');
assert(!baseline||!only||only===groupNames[0],'baseline observes only the existing discovery contract');
const [E,S,Q]=await Promise.all(['engine','storage','equipment'].map(name=>import(pathToFileURL(path.join(source,`src/${name}.js`)))));
const fixturePath='docs/iteration/evidence/round18/strategy/original-seed-23757-first-death.save.json';
const fixtureRaw=await fs.readFile(path.join(source,fixturePath),'utf8');
const original=S.decodeSave(fixtureRaw);
assert.equal(original.floor,30);assert.equal(original.phase,'dead');assert.equal(original.player.items.length,139);
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['index.html','package.json','src/app.js','src/views.js','src/inventory-query.js','src/inventory-dom.js','src/inventory-search.css','src/responsive.css'];
const identity=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await fs.readFile(path.join(source,file)))])));
const sourceBefore=await identity();
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:args['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={source,url,baseline,browser:browser.version(),started:new Date().toISOString(),sourceBefore,
  fixture:{kind:'ARCHIVED_NATURAL_FIXTURE_REPLAY',path:fixturePath,rawSha256:hash(fixtureRaw),stateSha256:hash(original),seed:23757,floor:30,phase:'dead',items:139},
  notes:['Archived first-defeat replay, not a newly observed natural journey or a human-win-rate experiment.',
    'Responsive cases rename only the compared candidate and current armor; they are synthetic layout derivatives.',
    'Only isolated localStorage, real native controls, engine transactions and complete durable-state comparisons are used.',
    'Reduced motion, low effects and logical viewports; no physical GPU/mobile, OS IME, screen-reader or audio claim.',
    'Import reset is covered by app integration tests; this browser script exercises cancelled, failed and successful new-run replacement.'],
  checks:0,cases:[],errors:[],screenshots:[]};
let trace=[],activeName='';
const compact=value=>typeof value==='string'&&value.length>500?{bytes:Buffer.byteLength(value),sha256:hash(value)}
  :value?.player&&value?.runId?{phase:value.phase,revision:value.revision,runId:value.runId,rng:value.rng,hp:value.player.hp,ward:value.ward,items:value.player.items.length,sha256:hash(value)}
  :value&&typeof value==='object'&&!Array.isArray(value)&&'main'in value?{mainSha256:hash(value.main),mirrorSha256:hash(value.mirror)}:value;
const check=(value,label)=>{report.checks++;trace.push({label,passed:!!value});assert(value,label);};
const equal=(actual,expected,label)=>{report.checks++;const row={label,actual:compact(actual),expected:compact(expected)};trace.push(row);assert.deepEqual(actual,expected,label);row.passed=true;};
const action=(page,type)=>page.locator(`[data-action="${type}"]`);
const inventory=page=>page.locator('.inventory-screen');
const itemAction=(page,type,id)=>page.locator(`.inventory-list [data-action="${type}"][data-id="${id}"]`);
const rawRecords=page=>page.evaluate(({main,mirror})=>({main:localStorage.getItem(main),mirror:localStorage.getItem(mirror)}),{main:S.SAVE_KEY,mirror:S.BACKUP_KEY});
const writeCount=page=>page.evaluate(()=>window.__round19SaveWrites.length);
const readState=async page=>S.decodeSave((await rawRecords(page)).main);
const idle=page=>page.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
const revision=(page,value)=>page.waitForFunction(({key,value})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===value,{key:S.SAVE_KEY,value});
const visibleIds=page=>page.locator('.inventory-list .item-card [data-action="lock"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.id));
async function exactState(page,expected,label){
  const raw=await rawRecords(page);
  equal(S.decodeSave(raw.main),expected,`${label}: full main state`);
  equal(S.decodeSave(raw.mirror),expected,`${label}: full mirror state`);
  equal(raw.main,raw.mirror,`${label}: both encoded records agree`);
}
async function noWrite(page,operation,label){
  const before=await rawRecords(page),expected=S.decodeSave(before.main),writes=await writeCount(page);
  await operation();
  equal(await rawRecords(page),before,`${label}: both original encoded records unchanged`);
  equal(await readState(page),expected,`${label}: complete game state unchanged`);
  equal(await writeCount(page),writes,`${label}: no game-storage write attempts`);
}
async function attach(page){
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>report.errors.push({case:activeName,error:String(error)}));
  page.on('console',message=>{if(message.type()==='error')report.errors.push({case:activeName,error:message.text()});});
  await page.addInitScript(({main,mirror})=>{
    const set=Storage.prototype.setItem;window.__round19SaveWrites=[];window.__round19BlockMain=false;
    Storage.prototype.setItem=function(key,value){
      if(key===main||key===mirror){
        const blocked=key===main&&window.__round19BlockMain;
        window.__round19SaveWrites.push({key,characters:String(value).length,blocked});
        if(blocked)throw new DOMException('Round19 isolated primary failure','QuotaExceededError');
      }
      return set.call(this,key,value);
    };
  },{main:S.SAVE_KEY,mirror:S.BACKUP_KEY});
}
async function load(page,state){
  assert(S.validateSave(state));await page.goto(url);
  await page.evaluate(({raw,main,mirror,settings})=>{
    localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);
    localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));
  },{raw:S.encodeSave(state),main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
  await page.reload();await action(page,'continue').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
  check((await page.title()).includes('Dice Abyss'),'intended game document title');
  check((await page.locator('#app').innerText()).length>100,'meaningful game UI loaded');
  await exactState(page,state,'loading the isolated fixture');
}
async function shot(page,name){
  if(report.screenshots.length>=2)return;
  const file=`${name}.jpg`;await page.screenshot({path:path.join(output,file),type:'jpeg',quality:74,animations:'disabled'});
  report.screenshots.push({file,bytes:(await fs.stat(path.join(output,file))).size});
}
async function run(name,fn){
  if(only&&only!==name)return;
  activeName=name;trace=[];
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  await attach(page);const started=performance.now(),checksBefore=report.checks,errorCount=report.errors.length;
  try{
    await fn({context,page});equal(report.errors.length,errorCount,'no browser runtime or console errors in this group');
    report.cases.push({name,status:'PASS',checks:report.checks-checksBefore,trace,ms:performance.now()-started});
  }catch(error){
    report.cases.push({name,status:'FAIL',checks:report.checks-checksBefore,trace,error:String(error),stack:error.stack,ms:performance.now()-started});
    await shot(page,`FAIL-${name}`).catch(()=>{});
  }finally{await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
  console.log(`${name}: ${report.cases.at(-1).status}`);
}
// Exact item effects form the read-only oracle; no replacement build, score or future RNG is consulted.
function selected(state,ui={}){
  const name=(ui.inventoryQuery||'').trim().toLowerCase();
  return state.player.items.filter(item=>(!ui.inventorySlot||item.slot===ui.inventorySlot)
    &&(ui.inventoryRarity==null||ui.inventoryRarity===''||item.rarity===Number(ui.inventoryRarity))
    &&(!name||item.name.toLowerCase().includes(name))
    &&(!ui.inventoryDefense||Q.itemStats(item)[ui.inventoryDefense]>0))
    .toSorted((a,b)=>ui.inventorySort==='rarity'?b.rarity-a.rarity||Q.itemValue(b)-Q.itemValue(a)
      :ui.inventorySort==='level'?b.level-a.level||Q.itemValue(b)-Q.itemValue(a):Q.itemValue(b)-Q.itemValue(a));
}
async function results(page,state,ui={},label='query results'){
  const expected=selected(state,ui);
  equal(await visibleIds(page),expected.slice(0,60).map(item=>item.id),`${label}: actual first-page item identities and order`);
  equal(Number((await page.locator('#inventory-search-result b').innerText()).replaceAll(',','')),expected.length,`${label}: exact visible total`);
  check((await page.locator('.inventory-pagination').innerText()).includes(`第 1 / ${Math.max(1,Math.ceil(expected.length/60))} 页`),`${label}: result change starts at page one`);
  return expected;
}
async function live(page,label){
  await page.waitForFunction(()=>document.querySelector('#announcement').textContent===document.querySelector('#inventory-search-result').textContent);
  equal(await page.locator('#announcement').textContent(),await page.locator('#inventory-search-result').textContent(),`${label}: exact committed count and criteria announced`);
}
async function choose(page,id,value,label){
  await noWrite(page,async()=>{await page.locator(`#${id}`).selectOption(value);await live(page,label);},label);
}
async function search(page,value,label){
  await noWrite(page,async()=>{await page.locator('#inventory-query').fill(value);await page.locator('#inventory-query').press('Enter');await live(page,label);},label);
}
async function slot(page,value,label){
  await noWrite(page,async()=>{await inventory(page).locator(`.slot-tabs [data-action="filter"][data-slot="${value}"]`).click();await live(page,label);},label);
}
async function prepareArmor(page){
  await noWrite(page,()=>page.locator('.defeat-actions [data-action="inventory"][data-slot="armor"]').click(),'dedicated armor preparation');
  await results(page,original,{inventorySlot:'armor'},'all 48 archived armors');
}
const queryContext=page=>page.evaluate(()=>({
  slot:document.querySelector('.inventory-screen .slot-tabs .active')?.dataset.slot,
  defense:document.querySelector('#inventory-defense')?.value,
  rarity:document.querySelector('#inventory-rarity')?.value,
  name:document.querySelector('#inventory-query')?.value,
  sort:document.querySelector('#inventory-sort')?.value,
}));
const scrollState=page=>page.evaluate(()=>({x:scrollX,y:scrollY,list:document.querySelector('.inventory-list')?.scrollTop,room:document.querySelector('#current-room')?.scrollTop}));

try{
  // Verify the URL serves the claimed version before deriving any A/B conclusion.
  for(const file of ['src/app.js','src/views.js','src/inventory-query.js']){
    const response=await fetch(new URL(file,url),{signal:AbortSignal.timeout(15000)});assert(response.ok,`${file}: HTTP ${response.status}`);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())),sourceBefore[file],`server bytes do not match --source for ${file}`);
  }
  await run(groupNames[0],async({page})=>{
    await load(page,original);await prepareArmor(page);
    if(baseline){
      equal(await page.locator('#inventory-defense').count(),0,'input version has no explicit defense selector');
      for(const term of ['恢复','防御','护盾']){
        await search(page,term,`input literal name ${term}`);
        await results(page,original,{inventorySlot:'armor',inventoryQuery:term},`input name-only search ${term}`);
        equal((await visibleIds(page)).length,0,'name contract can return zero while useful traits are owned');
      }
      report.baselineObservation={classification:'REACHABLE_DISCOVERY_GAP_NOT_A_NAME_SEARCH_BUG',armorCount:48,regen:14,barrier:11,reduction:12};
      return;
    }
    const actual={};
    for(const [key,count]of [['regen',14],['barrier',11],['reduction',12]]){
      await choose(page,'inventory-defense',key,`select ${key}`);
      const found=await results(page,original,{inventorySlot:'armor',inventoryDefense:key},key);
      equal(found.length,count,`${key}: predeclared archived count`);actual[key]=found.length;
    }
    await choose(page,'inventory-defense','barrier','opening ward again');await slot(page,'','all equipment slots');
    equal((await results(page,original,{inventoryDefense:'barrier'},'all-slot opening ward')).length,13,'two owned relics remain discoverable');
    const candidate=original.player.items.find(item=>item.slot==='armor'&&Q.itemStats(item).barrier>0);
    await slot(page,'armor','combine armor slot');await choose(page,'inventory-rarity',String(candidate.rarity),'combine actual rarity');
    await search(page,candidate.name,'combine actual full equipment name');
    const combined={inventorySlot:'armor',inventoryRarity:String(candidate.rarity),inventoryDefense:'barrier',inventoryQuery:candidate.name};
    check((await results(page,original,combined,'name plus slot plus rarity plus effect')).some(item=>item.id===candidate.id),'the chosen owned candidate survives the explicit intersection');
    await noWrite(page,async()=>{await action(page,'inventory-query-clear').click();await live(page,'clear only name');},'clear only the name');
    equal((await queryContext(page)).defense,'barrier','clear-name preserves defense');equal((await queryContext(page)).rarity,String(candidate.rarity),'clear-name preserves rarity');
    await results(page,original,{...combined,inventoryQuery:''},'clear-name result');
    await search(page,'没有这件装备 <[.]>','explicit no-match query');check(await action(page,'inventory-reset').isVisible(),'empty intersection exposes clear-all');
    await noWrite(page,async()=>{await action(page,'inventory-reset').click();await live(page,'clear all');},'clear all query conditions');
    equal(await queryContext(page),{slot:'',defense:'',rarity:'',name:'',sort:'power'},'clear-all resets all four conditions');
    await results(page,original,{},'restored full bag');await exactState(page,original,'all discovery actions remain read-only');
    report.discovery={armorCount:48,effects:actual,allSlotBarrier:13};
  });
  if(!baseline)await run(groupNames[1],async({page})=>{
    await load(page,original);await prepareArmor(page);await choose(page,'inventory-defense','regen','find recovery armor');
    const id='i123',compare=itemAction(page,'compare-details',id);check(await compare.count()===1,'recorded recovery candidate has one comparison action');
    await compare.scrollIntoViewIfNeeded();await compare.focus();const position=await scrollState(page),contextBefore=await queryContext(page);
    await noWrite(page,async()=>{
      await compare.click();await page.locator(`dialog[open] [data-comparison-item="${id}"]`).waitFor();
      check((await page.locator('dialog[open]').innerText()).includes('换装不会复活'),'comparison explains the real dead-state boundary');
      check(await page.locator('dialog[open] [data-comparison-key="regen"]').isVisible(),'actual before/after recovery is shown');
      await page.locator('dialog[open]').getByRole('button',{name:'关闭比较',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});
    },'compare and return to the same archived choice');
    equal(await queryContext(page),contextBefore,'comparison keeps every committed and draft query field');
    equal(await scrollState(page),position,'comparison close retains list, room and window position');
    equal(await page.evaluate(()=>({action:document.activeElement.dataset.action,id:document.activeElement.dataset.id})),{action:'compare-details',id},'comparison close restores the original item action');
    let expected=E.transition(original,{type:'equip',id});
    equal(expected.player.hp,0,'equip oracle does not revive');equal(expected.ward,original.ward,'equip oracle retains current ward');equal(expected.rng,original.rng,'equip oracle consumes no RNG');
    await itemAction(page,'equip',id).click();await revision(page,expected.revision);await idle(page);await exactState(page,expected,'one explicit equipment transaction');
    equal(await queryContext(page),contextBefore,'equipping retains the query context');
    check(await page.locator(`.item-equipped [data-action="lock"][data-id="${id}"]`).isVisible(),'selected armor is visibly equipped');
    await noWrite(page,()=>page.locator('.manual-control [data-action="game"]').click(),'return to real defeat screen');
    expected=E.transition(expected,{type:'retry'});await page.locator('#primary-action').click();await revision(page,expected.revision);await idle(page);await exactState(page,expected,'explicit manual retry');
    for(let turn=1;turn<=3;turn++){
      equal(expected.phase,'combat',`manual roll ${turn} starts in combat`);expected=E.transition(expected,{type:'roll'});
      await page.locator('#primary-action').click();await revision(page,expected.revision);await idle(page);await exactState(page,expected,`real manual combat roll ${turn}`);
    }
    await page.reload();await action(page,'continue').click();await idle(page);await exactState(page,expected,'refresh after three actual manual rolls');
    report.manualReplay={classification:'ARCHIVED_STATE_REPLAY_NOT_NEW_NATURAL_JOURNEY',candidate:id,manualRolls:3,finalStateSha256:hash(expected),finalPhase:expected.phase,finalRevision:expected.revision};
  });
  if(!baseline)await run(groupNames[2],async({context,page})=>{
    await load(page,original);await prepareArmor(page);
    await noWrite(page,async()=>{
      await page.locator('#inventory-defense').focus();await page.keyboard.press('ArrowDown');
      await page.waitForFunction(()=>document.querySelector('#inventory-defense').value==='regen');await live(page,'native ArrowDown');
      equal(await page.evaluate(()=>document.activeElement.id),'inventory-defense','native select retains focus after its committed change');
      await page.keyboard.press('Tab');equal(await page.evaluate(()=>document.activeElement.id),'inventory-sort','native Tab reaches the adjacent sorting control');
    },'native keyboard defense selection');
    const target=original.player.items.find(item=>item.id==='i123');
    await choose(page,'inventory-rarity',String(target.rarity),'retain rarity with recovery');
    await noWrite(page,()=>page.locator('#inventory-query').fill('未提交草稿'),'keep an unsubmitted name draft');
    const retained={slot:'armor',defense:'regen',rarity:String(target.rarity),name:'未提交草稿',sort:'power'};
    let expected=E.transition(original,{type:'lock',id:target.id});
    await itemAction(page,'lock',target.id).click();await revision(page,expected.revision);await exactState(page,expected,'same-tab lock');
    equal(await queryContext(page),retained,'same-tab lock preserves filter and draft');
    const originWrites=await writeCount(page),donor=await context.newPage();await attach(donor);await donor.goto(url);await action(donor,'continue').click();await idle(donor);
    await donor.locator('.defeat-actions [data-action="inventory"][data-slot="armor"]').click();
    expected=E.transition(expected,{type:'lock',id:target.id});await itemAction(donor,'lock',target.id).click();await revision(donor,expected.revision);
    await page.bringToFront();
    await page.waitForFunction(id=>document.querySelector(`.inventory-list [data-action="lock"][data-id="${id}"]`)?.getAttribute('aria-pressed')==='false',target.id);
    await exactState(page,expected,'same-run storage synchronization');await exactState(donor,expected,'donor exact lock result');
    equal(await queryContext(page),retained,'same-run synchronization preserves all filters and the unsubmitted draft');
    equal(await writeCount(page),originWrites,'receiving a same-run update does not write it back');await donor.close();
    await noWrite(page,()=>page.locator('.manual-control [data-action="game"]').click(),'return to defeat before dedicated reset');
    await noWrite(page,()=>page.locator('.defeat-actions [data-action="inventory"][data-slot="armor"]').click(),'dedicated preparation clears stale contexts');
    equal(await queryContext(page),{slot:'armor',defense:'',rarity:'',name:'',sort:'power'},'dedicated armor preparation clears name, rarity and defense');
    await results(page,expected,{inventorySlot:'armor'},'dedicated preparation after sync');
    await choose(page,'inventory-defense','regen','reapply effect before replacement');
    await choose(page,'inventory-rarity',String(target.rarity),'reapply rarity before replacement');
    await noWrite(page,()=>page.locator('#inventory-query').fill('替换前草稿'),'draft before replacing the run');
    const replacementContext=await queryContext(page);
    await noWrite(page,async()=>{
      await action(page,'home').click();await action(page,'new').click();await page.locator('dialog[open]').getByRole('button',{name:'取消',exact:true}).click();
      await action(page,'continue').click();await page.locator('.main-nav [data-action="inventory"]').click();
    },'cancelled new-run replacement');
    equal(await queryContext(page),replacementContext,'cancelling new-run review retains every query field');
    await action(page,'home').click();await action(page,'new').click();await page.evaluate(()=>{window.__round19BlockMain=true;});
    await action(page,'confirm').click();await page.locator('.toast.visible').filter({hasText:'本次操作未生效'}).waitFor();
    await page.evaluate(()=>{window.__round19BlockMain=false;});await exactState(page,expected,'failed new-run primary write');
    await noWrite(page,async()=>{await action(page,'continue').click();await page.locator('.main-nav [data-action="inventory"]').click();},'return after failed replacement');
    equal(await queryContext(page),replacementContext,'failed replacement preserves query context until a save succeeds');
    await action(page,'home').click();await action(page,'new').click();await action(page,'confirm').click();
    await page.waitForFunction(({key,runId})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).runId!==runId,{key:S.SAVE_KEY,runId:expected.runId});await idle(page);
    const next=await readState(page),seed=Number(next.runId.split('-')[0]),newOracle=E.newGame(seed);newOracle.runId=next.runId;
    await exactState(page,newOracle,'successful random-seed new-game construction');
    await noWrite(page,()=>page.locator('.main-nav [data-action="inventory"]').click(),'open replacement-run inventory');
    equal(await queryContext(page),{slot:'',defense:'',rarity:'',name:'',sort:'power'},'successful replacement clears every old inventory condition');
    await results(page,newOracle,{},'new-run equipment is discoverable');
  });
  if(!baseline)await run(groupNames[3],async({page})=>{
    const dimensions=[[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,740]],layouts=[];
    // Keep measured failures in the report even if an assertion stops this group.
    report.responsive={classification:'SYNTHETIC_LONG_NAME_DERIVATIVES',layouts};
    for(const nameMode of ['cjk','unbroken-ascii'])for(const [width,height]of dimensions){
      const state=S.decodeSave(fixtureRaw),name=nameMode==='cjk'?'长夜刻痕'.repeat(16):'W'.repeat(64),target=state.player.items.find(item=>item.id==='i123');
      target.name=name;state.player.items.find(item=>item.id===state.player.equipped.armor).name=name;
      await page.setViewportSize({width,height});await load(page,state);
      await noWrite(page,()=>page.locator('.defeat-actions [data-action="inventory"][data-slot="armor"]').click(),`${width}/${nameMode}: preparation`);
      await choose(page,'inventory-defense','regen',`${width}/${nameMode}: effect`);
      await choose(page,'inventory-rarity',String(target.rarity),`${width}/${nameMode}: rarity`);
      await choose(page,'inventory-sort','level',`${width}/${nameMode}: sort`);
      await search(page,name,`${width}/${nameMode}: long literal name`);
      await results(page,state,{inventorySlot:'armor',inventoryDefense:'regen',inventoryRarity:String(target.rarity),inventorySort:'level',inventoryQuery:name},`${width}/${nameMode}: all fields`);
      const geometry=await page.evaluate(()=>{
        const selectors=['#inventory-rarity','#inventory-defense','#inventory-sort','#inventory-query','#inventory-search-submit','[data-action="inventory-query-clear"]'];
        const controls=selectors.map(selector=>{const node=document.querySelector(selector),rect=node.getBoundingClientRect();return {selector,rect:rect.toJSON(),font:parseFloat(getComputedStyle(node).fontSize),visible:node.getClientRects().length>0,client:node.clientWidth,scroll:node.scrollWidth};});
        const text=[...document.querySelectorAll('.inventory-defense-filter,#inventory-defense,#inventory-defense-help')].map(node=>({text:node.tagName==='SELECT'?node.selectedOptions[0].textContent:node.textContent.trim(),font:parseFloat(getComputedStyle(node).fontSize),rect:node.getBoundingClientRect().toJSON(),client:node.clientWidth,scroll:node.scrollWidth}));
        const overlap=[];for(let a=0;a<controls.length;a++)for(let b=a+1;b<controls.length;b++){
          const x=controls[a].rect,y=controls[b].rect;
          if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)overlap.push([controls[a].selector,controls[b].selector]);
        }
        let sidebar=null;
        if(innerWidth>=1100){
          const list=document.querySelector('.game-shell:not(.fusion-mode) .right-rail > .equipment-list');
          const cards=[...list.querySelectorAll(':scope > .equipped-item')].map((card,index)=>({index,slot:card.dataset.slot,rect:card.getBoundingClientRect().toJSON(),
            rows:['.item-meta','h3','p','.equipment-depth'].map(selector=>{
              const node=card.querySelector(selector);if(!node)return {selector,missing:true};
              const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),rects=[];
              while(walker.nextNode())if(walker.currentNode.textContent.trim()){
                const range=document.createRange();range.selectNodeContents(walker.currentNode);
                rects.push(...[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0));
              }
              const textBounds=rects.length?{left:Math.min(...rects.map(rect=>rect.left)),right:Math.max(...rects.map(rect=>rect.right)),top:Math.min(...rects.map(rect=>rect.top)),bottom:Math.max(...rects.map(rect=>rect.bottom))}:null;
              return {selector,text:node.textContent.trim(),rect:node.getBoundingClientRect().toJSON(),textBounds,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight};
            })}));
          const outside=[],clipped=[],adjacentOverlap=[];
          for(const card of cards)for(const row of card.rows)if(!row.missing){
            for(const [kind,bounds]of [['row',row.rect],['rendered-text',row.textBounds]])if(bounds){
              const spill={left:card.rect.left-bounds.left,right:bounds.right-card.rect.right,top:card.rect.top-bounds.top,bottom:bounds.bottom-card.rect.bottom};
              if(Object.values(spill).some(amount=>amount>2))outside.push({card:card.index,slot:card.slot,selector:row.selector,kind,spill});
            }
            if(row.scrollWidth>row.clientWidth+2||row.scrollHeight>row.clientHeight+2)clipped.push({card:card.index,selector:row.selector,width:row.scrollWidth-row.clientWidth,height:row.scrollHeight-row.clientHeight});
          }
          for(let index=1;index<cards.length;index++){
            const previous=cards[index-1],next=cards[index],contentBottom=Math.max(previous.rect.bottom,...previous.rows.filter(row=>!row.missing).flatMap(row=>[row.rect.bottom,row.textBounds?.bottom??row.rect.bottom]));
            if(contentBottom>next.rect.top+2)adjacentOverlap.push({previous:previous.index,next:next.index,boxOverlap:previous.rect.bottom-next.rect.top,contentOverlap:contentBottom-next.rect.top});
          }
          sidebar={rect:list.getBoundingClientRect().toJSON(),clientWidth:list.clientWidth,scrollWidth:list.scrollWidth,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,overflowY:getComputedStyle(list).overflowY,cards,outside,clipped,adjacentOverlap};
        }
        return {width:innerWidth,height:innerHeight,body:document.body.scrollWidth,document:document.documentElement.scrollWidth,controls,text,overlap,sidebar};
      });
      layouts.push({nameMode,...geometry});
      check(geometry.body<=width+1&&geometry.document<=width+1,`${width}/${nameMode}: no horizontal body overflow`);
      equal(geometry.overlap,[],`${width}/${nameMode}: native controls do not overlap`);
      check(geometry.controls.every(control=>control.visible&&control.rect.width>0&&control.rect.height>0&&control.rect.left>=-1&&control.rect.right<=width+1),`${width}/${nameMode}: all controls have usable in-bounds widths`);
      check(geometry.text.every(text=>text.text.length>0&&text.font>=12&&text.scroll<=text.client+2),`${width}/${nameMode}: new labels and help remain nonempty, at least 12px and uncut`);
      if(width>=1100){
        const sidebar=geometry.sidebar;
        equal(sidebar.cards.length,5,`${width}/${nameMode}: all five desktop equipped cards remain present`);
        check(sidebar.cards.every(card=>card.rows.every(row=>!row.missing&&row.text.length>0&&row.textBounds)),`${width}/${nameMode}: every equipped card retains metadata, full title, effects and depth text`);
        check(sidebar.cards.find(card=>card.slot==='armor').rows.find(row=>row.selector==='h3').text.startsWith(name),`${width}/${nameMode}: current equipped armor also uses the full synthetic long name`);
        equal(sidebar.outside,[],`${width}/${nameMode}: all equipped-card rows and rendered text stay inside their own card`);
        equal(sidebar.clipped,[],`${width}/${nameMode}: equipped titles, effects and metadata have no internal text clipping`);
        equal(sidebar.adjacentOverlap,[],`${width}/${nameMode}: equipped content never overlaps the next card`);
        check(sidebar.scrollWidth<=sidebar.clientWidth+2,`${width}/${nameMode}: desktop equipment list has no horizontal content clipping`);
        check(sidebar.scrollHeight<=sidebar.clientHeight+2||['auto','scroll'].includes(sidebar.overflowY),`${width}/${nameMode}: any vertical equipment overflow remains scrollable`);
        await noWrite(page,async()=>{
          const list=page.locator('.game-shell:not(.fusion-mode) .right-rail > .equipment-list'),last=list.locator(':scope > .equipped-item').last();
          const initialScroll=await list.evaluate(node=>node.scrollTop);await last.scrollIntoViewIfNeeded();
          const reachable=await last.evaluate(node=>{const card=node.getBoundingClientRect(),list=node.parentElement.getBoundingClientRect();return card.top>=Math.max(list.top,0)-2&&card.bottom<=Math.min(list.bottom,innerHeight)+2;});
          check(reachable,`${width}/${nameMode}: the last equipped card is reachable inside the desktop rail`);
          await list.evaluate((node,top)=>{node.scrollTop=top;},initialScroll);
        },`${width}/${nameMode}: desktop equipment scrolling`);
      }
      for(const selector of ['#inventory-rarity','#inventory-defense','#inventory-sort']){
        const control=page.locator(selector);await control.scrollIntoViewIfNeeded();check(await control.isVisible(),`${width}/${nameMode}: ${selector} remains visible and reachable`);
      }
      if(width<1100)check(geometry.controls.every(control=>control.rect.height>=44),`${width}/${nameMode}: narrow controls retain 44px input targets`);
      equal(await page.locator('#inventory-defense option').evaluateAll(options=>options.map(option=>option.value)),['','regen','barrier','reduction'],`${width}/${nameMode}: all three effect options remain present`);
      if((width===1920&&nameMode==='cjk')||(width===390&&nameMode==='unbroken-ascii')){
        await page.locator('.v5-inventory-filters').scrollIntoViewIfNeeded();await shot(page,`defense-${width}-${nameMode}`);
      }
      await noWrite(page,async()=>{
        await itemAction(page,'compare-details',target.id).click();await page.locator('dialog[open] .comparison-detail').waitFor();
        const dialog=await page.locator('dialog[open]').evaluate(node=>({rect:node.getBoundingClientRect().toJSON(),client:node.clientWidth,scroll:node.scrollWidth,headings:[...node.querySelectorAll('.comparison-detail h3,.comparison-detail > p')].map(child=>({client:child.clientWidth,scroll:child.scrollWidth}))}));
        check(dialog.rect.left>=-1&&dialog.rect.right<=width+1&&dialog.rect.height<=height+1&&dialog.scroll<=dialog.client+2,`${width}/${nameMode}: comparison stays within the logical viewport`);
        check(dialog.headings.every(heading=>heading.scroll<=heading.client+2),`${width}/${nameMode}: comparison keeps both long equipment identities readable`);
        await page.locator('dialog[open]').getByRole('button',{name:'关闭比较',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});
      },`${width}/${nameMode}: reachable comparison and close`);
      equal((await queryContext(page)).name,name,`${width}/${nameMode}: comparison returns to the full long-name query`);
      await exactState(page,state,`${width}/${nameMode}: responsive checks preserve the full derivative fixture`);
    }
  });
}catch(error){report.errors.push({case:'setup-or-runner',error:String(error),stack:error.stack});}
finally{
  report.sourceAfter=await identity();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  report.finished=new Date().toISOString();const expectedGroups=only?1:baseline?1:groupNames.length;
  report.passed=report.cases.length===expectedGroups&&report.cases.every(row=>row.status==='PASS')&&!report.errors.length&&report.sourceStable;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({passed:report.passed,groups:report.cases.length,checks:report.checks,sourceStable:report.sourceStable,screenshots:report.screenshots,failures:report.cases.filter(row=>row.status!=='PASS').map(row=>({name:row.name,error:row.error})),errors:report.errors},null,2));
if(!report.passed)process.exitCode=1;
