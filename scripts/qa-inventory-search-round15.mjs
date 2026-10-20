// Isolated constructed saves, real DOM controls and exact engine-state checks.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH may point to environment-owned tools.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {selectInventoryItems} from '../src/inventory-query.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.split('='))),url=args['--url']||'http://127.0.0.1:4189/';
const out=path.resolve(args['--output']||'/tmp/dice-r15-inventory');
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function identity(){const files=['index.html','package.json',...(await fs.readdir(path.join(root,'src'))).filter(f=>/\.(js|css)$/.test(f)).map(f=>'src/'+f)];return Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await fs.readFile(path.join(root,f)))])));}
await fs.mkdir(out,{recursive:true});
const report={label:'Round15 isolated inventory search and whole-bag recycling',synthetic:true,url,started:new Date().toISOString(),sourceBefore:await identity(),notes:['All saves are explicit constructed fixtures, not natural player journeys.','Native Chromium controls and keyboard submission are tested; an OS IME is not exercised.','Low effects and logical viewports; physical GPU, audio and physical devices are not tested.'],cases:[]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let row,context,page;
const button=action=>page.locator(`[data-action="${action}"]`);
const check=(condition,label)=>{row.checks.push({label,pass:!!condition});assert(condition,label);};
const equal=(a,b,label)=>{try{assert.deepEqual(a,b,label);row.checks.push({label,pass:true});}catch(e){row.checks.push({label,pass:false});throw e;}};
const records=()=>page.evaluate(({a,b})=>[localStorage.getItem(a),localStorage.getItem(b)],{a:S.SAVE_KEY,b:S.BACKUP_KEY});
const saved=async()=>S.decodeSave((await records())[0]);
const revision=n=>page.waitForFunction(({key,n})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===n,{key:S.SAVE_KEY,n});
const visibleIds=()=>page.locator('.inventory-list .item-card [data-action="lock"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
const screenshot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});row.screenshots.push(name+'.png');};

function fixture(total=243,low=false){
  let s=E.newGame(151515);s.floor=140;s.player.level=100;s.player.gold=200;
  s=E.transition(s,{type:'fate'});s.route[0].type='rest';s=E.transition(s,{type:'enter'});
  for(const key of ['relic2','relic3']){const item=E.makeItem(s,'relic',0,140);s.player.items.push(item);s.player.equipped[key]=item.id;}
  for(const item of s.player.items)item.level=100;
  while(s.player.items.length<total){const i=s.player.items.length,item=E.makeItem(s,['weapon','armor','relic'][Math.floor(i/3)%3],low?i%2:i%8,140);item.level=1+i%7;if(i%3===0)item.name='寒潮 · '+item.name;s.player.items.push(item);}
  s.player.items.at(-1).name='最后的远征';
  s.player.items[8].locked=true;s.player.hp=E.stats(s).maxHp;
  s.round15Unknown={retained:['whole state',19,{nested:true}]};
  assert(S.validateSave(s));return s;
}
async function prepare(s,viewport={width:1920,height:1080},scale=1){
  context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>row.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.errors.push(m.text());});
  await page.goto(url);await page.evaluate(({raw,a,b,k,scale})=>{localStorage.setItem(a,raw);localStorage.setItem(b,raw);localStorage.setItem(k,JSON.stringify({effects:'low',sound:false,scale}));},{raw:S.encodeSave(s),a:S.SAVE_KEY,b:S.BACKUP_KEY,k:S.SETTINGS_KEY,scale});
  await page.reload();await button('continue').click();await page.locator('#primary-action:not(:disabled)').waitFor();await page.evaluate(()=>document.fonts.ready);
  row.identity={url:page.url(),title:await page.title(),viewport,scale};
  check(row.identity.url===url&&row.identity.title.includes('Dice Abyss'),'intended local game identity');
  check((await page.locator('#app').innerText()).length>100,'meaningful game UI, not a blank page');
  await page.getByRole('button',{name:'背包',exact:true}).click();await page.locator('#inventory-query').waitFor();
  equal(await saved(),s,'loading and opening inventory preserve complete state');
}
async function verifyResults(s,ui,pageNumber=0){
  const found=selectInventoryItems(s.player.items,ui),count=Math.max(1,Math.ceil(found.length/60)),index=Math.min(count-1,pageNumber);
  equal(await visibleIds(),found.slice(index*60,(index+1)*60).map(i=>i.id),'visible result order equals full-array filtered order');
  check((await page.locator('.inventory-pagination').innerText()).includes(`第 ${index+1} / ${count} 页`),'pagination derives from actual filtered result');
}
async function layout(){
  const g=await page.evaluate(()=>{const search=document.querySelector('.inventory-search'),list=document.querySelector('.inventory-list'),primary=document.querySelector('#primary-action');return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,search:search.getBoundingClientRect().toJSON(),list:list.getBoundingClientRect().toJSON(),primary:primary.getBoundingClientRect().toJSON(),controls:[...search.querySelectorAll('input,button')].map(n=>({rect:n.getBoundingClientRect().toJSON(),font:getComputedStyle(n).fontSize})),overflow:[...search.querySelectorAll('p,label,button')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent),inputLabel:document.querySelector('#inventory-query').labels[0]?.textContent};});
  row.layout=g;check(g.documentWidth<=g.width+1,'no document horizontal overflow');check(g.search.left>=-1&&g.search.right<=g.width+1,'search stays inside viewport');equal(g.overflow,[],'search copy and buttons do not overflow');equal(g.inputLabel,'装备名称','native input has an explicit visible label');
  for(const c of g.controls){check(c.rect.width>0&&c.rect.left>=-1&&c.rect.right<=g.width+1,'search control has a usable horizontal rectangle');check(parseFloat(c.font)>=12,'search control text remains at least 12px');}
  if(g.width>=1100){check(g.list.height>=100,'desktop inventory retains visible item space');check(g.primary.bottom<=g.height+1,'desktop primary action remains visible');}
  else for(const c of g.controls)check(c.rect.height>=44,'narrow search controls have 44px minimum height');
}
async function run(name,fn){if(args['--case']&&args['--case']!==name)return;row={name,checks:[],errors:[],screenshots:[],status:'RUNNING'};report.cases.push(row);context=null;page=null;try{await fn();equal(row.errors,[],'no relevant app/console errors');row.status='PASS';}catch(e){row.status='FAIL';row.error=String(e);row.stack=e.stack;if(page)await screenshot(name+'-FAIL').catch(()=>{});}finally{if(context)await context.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(name+': '+row.status+(row.error?' '+row.error:''));}}

try{
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,740]])await run(`layout-${width}`,async()=>{
    const s=fixture();await prepare(s,{width,height});const original=await records();
    await page.locator('#inventory-query').fill('寒潮');await page.locator('#inventory-query').press('Enter');
    await verifyResults(s,{inventoryQuery:'寒潮'});await layout();equal(await records(),original,'search keeps primary and mirror byte-identical');
    await screenshot(`search-${width}`);
  });
  await run('search-keyboard-and-state',async()=>{
    const s=fixture();await prepare(s);const original=await records();
    const input=page.locator('#inventory-query'),handle=await input.elementHandle();
    await input.fill('  寒潮  ');check(await handle.evaluate(n=>n.isConnected),'typing does not rerender or replace the input');
    equal(await visibleIds(),selectInventoryItems(s.player.items).slice(0,60).map(i=>i.id),'draft typing has not applied a filter');
    await page.locator('#inventory-sort').selectOption('level');equal(await page.locator('#inventory-query').inputValue(),'  寒潮  ','unsubmitted draft survives sorting');
    await page.locator('#inventory-query').press('Enter');await verifyResults(s,{inventoryQuery:'寒潮',inventorySort:'level'});
    equal(await page.evaluate(()=>document.activeElement.id),'inventory-query','Enter search restores native input focus');
    await page.locator('[data-action="inventory-page"][data-page="1"]').click();await verifyResults(s,{inventoryQuery:'寒潮',inventorySort:'level'},1);
    await page.locator('#inventory-rarity').selectOption('1');await button('filter').filter({hasText:'防具'}).click();
    await verifyResults(s,{inventoryQuery:'寒潮',inventorySort:'level',inventoryRarity:'1',inventorySlot:'armor'});
    await button('game').first().click();await page.getByRole('button',{name:'背包',exact:true}).click();equal(await page.locator('#inventory-query').inputValue(),'寒潮','ordinary navigation retains name filter');
    await button('inventory-query-clear').click();equal(await page.locator('#inventory-rarity').inputValue(),'1','clear name retains rarity');
    await verifyResults(s,{inventorySort:'level',inventoryRarity:'1',inventorySlot:'armor'});
    await page.locator('#inventory-query').fill('没有这件装备');await page.locator('#inventory-search-submit').click();check(await button('inventory-reset').isVisible(),'empty search exposes clear-all recovery');
    await button('inventory-reset').click();await verifyResults(s,{inventorySort:'level'});
    equal(await records(),original,'all search/filter/navigation operations never write game state');
    const id=(await visibleIds())[0],expected=E.transition(s,{type:'lock',id});await page.locator(`.inventory-list [data-action="lock"][data-id="${id}"]`).click();await revision(expected.revision);equal(await saved(),expected,'real item lock commits exactly once after searching');
    await page.reload();await button('continue').click();equal(await saved(),expected,'refresh restores the exact committed item state');
  });
  await run('full-bag-search-and-whole-bag-recycle',async()=>{
    const s=fixture(10000,true),quote=E.salvagePreview(s,undefined,false,true);check(quote.items.length>9000,'fixture has a real large safe batch');
    await prepare(s);const original=await records();
    await page.locator('#inventory-query').fill('最后的远征');await page.locator('#inventory-query').press('Enter');
    await verifyResults(s,{inventoryQuery:'最后的远征'});equal(await visibleIds(),[s.player.items.at(-1).id],'name search finds the last item without visiting 167 pages');
    check((await page.locator('.inventory-reclaim').innerText()).includes('不受搜索与筛选影响'),'recycling explicitly declares whole-bag scope');
    await button('salvage-preview').click();check((await page.locator('.confirmation-copy').innerText()).includes(quote.items.length.toLocaleString('en-US')),'confirmation shows full safe batch, not the one search result');
    await page.getByRole('button',{name:'取消',exact:true}).click();equal(await records(),original,'cancel retains both exact durable copies');
    await button('salvage-preview').click();const expected=E.transition(s,{type:'salvage',ids:quote.items.map(i=>i.id),allowOverflow:!!quote.overflow});await button('confirm').click();await revision(expected.revision);equal(await saved(),expected,'large confirmed recycling exactly matches engine state');
    check(expected.player.items.some(i=>i.id===s.player.items[8].id),'locked equipment survives large recycling');
    equal((await records())[0],(await records())[1],'both durable copies agree after large recycling');
    check(await button('inventory-reset').isVisible(),'removed search result exposes clear-filter recovery');
    await screenshot('recycle-complete');
    await page.reload();await button('continue').click();equal(await saved(),expected,'large recycling survives a real reload');
  });
  await run('primary-failure-preserves-batch',async()=>{
    const s=fixture(603,true);await prepare(s);const original=await records();await button('salvage-preview').click();
    await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Injected quota failure','QuotaExceededError');return original.call(this,k,v);};},S.SAVE_KEY);
    await button('confirm').click();await page.locator('.toast.visible').filter({hasText:'本次操作未生效'}).waitFor();equal(await records(),original,'failed primary write cannot remove any owned item or credit gold');
    equal(await saved(),s,'failure preserves complete initial state');check(await button('salvage-preview').isEnabled(),'failed batch remains reviewable');
  });
  await run('cross-tab-draft-and-stale-batch',async()=>{
    const s=fixture(303,true);await prepare(s);await page.locator('#inventory-query').fill('寒潮');
    const donor=await context.newPage();await donor.goto(url);const next=E.transition(s,{type:'lock',id:s.player.items[9].id});
    await donor.evaluate(({a,b,raw})=>{localStorage.setItem(a,raw);localStorage.setItem(b,raw);},{a:S.SAVE_KEY,b:S.BACKUP_KEY,raw:S.encodeSave(next)});
    await page.locator('.toast.visible').waitFor();
    check(['已同步另一窗口的最新进度。','主存档可用，但镜像尚未同步。请导出当前进度备份，后续成功保存会重建镜像。'].includes(await page.locator('.toast.visible').innerText()),'sync or the existing transient mirror state is explained');
    equal(await page.locator('#inventory-query').inputValue(),'寒潮','same-run storage refresh retains unsubmitted search draft');
    await page.locator('#inventory-query').press('Enter');await button('salvage-preview').click();
    const newer=E.transition(next,{type:'lock',id:s.player.items[10].id});await donor.evaluate(({a,b,raw})=>{localStorage.setItem(a,raw);localStorage.setItem(b,raw);},{a:S.SAVE_KEY,b:S.BACKUP_KEY,raw:S.encodeSave(newer)});
    await page.locator('dialog').waitFor({state:'hidden'});equal(await saved(),newer,'newer donor cancels stale batch without recycling');
    equal(await page.locator('#inventory-query').inputValue(),'寒潮','applied search survives same-run synchronization');
    await donor.close();
  });
}finally{
  await browser.close();report.sourceAfter=await identity();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  report.finished=new Date().toISOString();report.checks=report.cases.reduce((n,r)=>n+r.checks.length,0);report.passes=report.cases.filter(r=>r.status==='PASS').length;report.failures=report.cases.filter(r=>r.status!=='PASS').map(r=>r.name);
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,passes:report.passes,failures:report.failures,sourceStable:report.sourceStable}));
  if(report.failures.length||!report.sourceStable)process.exitCode=1;
}
