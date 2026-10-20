// Optional local QA. Requires an external Playwright installation and Chromium.
// The four fixtures are save-valid constructed boundaries, not natural journeys.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';

const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return [value.slice(0,at),value.slice(at+1)];}));
const output=path.resolve(options['--output']||'/tmp/dice-abyss-fusion-cap-qa');
const baseURL=options['--url']||'http://127.0.0.1:4189';
const loopback=value=>{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&(url.hostname==='localhost'||url.hostname==='[::1]'||/^127(?:\.\d{1,3}){3}$/.test(url.hostname));};
assert(loopback(baseURL),'Only a loopback game server may be used');
const require=createRequire(import.meta.url);
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await fs.mkdir(output,{recursive:true});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(['src/fusion-view.js','src/fusion-controller.js','src/equipment.js'].map(async file=>[file,hash(await fs.readFile(new URL(`../${file}`,import.meta.url),'utf8'))])));
const report={started:new Date().toISOString(),url:baseURL,browser:null,contextCount:1,synthetic:true,
 method:'Native clicks in one new independent Playwright context. LocalStorage is seeded only with validated synthetic fixtures. No user browser or save is read. DOM selection plus exact decoded main/mirror state establish the result.',
 browserRouting:'The root recorded extension and cloud CDP ERR_CONNECTION_REFUSED for this local server; the taskbook permits Playwright and root explicitly requested this independent context.',
 viewports:[{width:1366,height:768},{width:375,height:812}],sourceBefore:await sourceHashes(),cases:[],screenshots:[],errors:[],warnings:[],network:{blocked:[],failed:[],httpErrors:[]},
 limitations:['Synthetic extreme levels/prices do not establish natural late-game incidence.','375px checks cover the existing fusion-specific responsive surface, not the overall desktop-first game.','Shared headless software rendering verifies behavior/layout only; it is not a performance or physical-device result.']};
const browser=await chromium.launch({executablePath:options['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=await browser.version();
const context=await browser.newContext({viewport:report.viewports[0],deviceScaleFactor:1});
await context.route('**/*',route=>{const url=route.request().url();if(loopback(url))return route.continue();report.network.blocked.push(url);return route.abort('blockedbyclient');});
const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
let active;
page.on('pageerror',error=>report.errors.push({case:active?.name,kind:'pageerror',message:error.message}));
page.on('console',message=>{if(message.type()==='error')report.errors.push({case:active?.name,kind:'console',message:message.text()});if(message.type()==='warning')report.warnings.push({case:active?.name,message:message.text()});});
page.on('requestfailed',request=>report.network.failed.push({case:active?.name,url:request.url(),reason:request.failure()?.errorText}));
page.on('response',response=>{if(response.status()>=400)report.network.httpErrors.push({case:active?.name,url:response.url(),status:response.status()});});
const note=(name,detail={})=>active.checks.push({name,...detail});
const eq=(actual,expected,name)=>{assert.deepEqual(actual,expected,name);note(name);};
const check=(value,name,detail={})=>{assert(value,name);note(name,detail);};
const control=action=>page.locator(`[data-action="${action}"]`);
const card=id=>page.locator(`[data-fusion-item="${id}"]`);
const materials=()=>page.locator('.fusion-card.is-selected').evaluateAll(nodes=>nodes.map(node=>node.dataset.fusionItem).sort());
const targets=()=>page.locator('.fusion-card.is-target').evaluateAll(nodes=>nodes.map(node=>node.dataset.fusionItem));
async function same(expected,name){const raw=await page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[S.SAVE_KEY,S.BACKUP_KEY]);eq(raw[0],raw[1],`${name}: main and mirror agree`);eq(S.decodeSave(raw[0]),expected,name);}
function fixture(kind){
 let state=E.newGame(9009);state.runId=`fusion-cap-browser-${kind}`;state.floor=140;state.player.level=100;state.player.gold=E.GOLD_CAP;
 state.fate=[3,4];state.phase='route';state.roomIndex=0;state.route=['fusion','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));
 state=E.transition(state,{type:'enter'});
 const target=state.player.items.find(item=>item.id===state.player.equipped.weapon);
 const count=kind==='bulk-cap'?2:kind==='budget'?3:1;
 target.level=kind==='single-cap'?1_000_000:kind==='bulk-cap'?500_000:kind==='exact-cap'?4_945_533:100;target.levelXp=0;
 if(kind==='exact-cap')state.player.level=5870;
 const ids=[];for(let i=0;i<count;i++){const item=E.makeItem(state,'weapon',0,140);item.level=1;item.levelXp=0;item.enhance=0;state.player.items.push(item);ids.push(item.id);}
 if(kind==='budget')state.player.gold=E.fusionPreview(state,[target.id],ids.slice(0,2)).cost;
 state.player.hp=E.stats(state).maxHp;
 assert(S.validateSave(state));assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);
 const preview=E.fusionPreview(state,[target.id],ids);
 if(kind.includes('-cap')&&kind!=='exact-cap')assert.equal(preview.cost,E.GOLD_CAP+1);
 if(kind==='exact-cap')assert.equal(preview.cost,E.GOLD_CAP,'Fixture quotes exactly the cap, not the sentinel');
 return {state,target:target.id,ids,preview};
}
async function fresh(f,viewport){
 await page.setViewportSize(viewport);await page.goto(baseURL);
 await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw:S.encodeSave(f.state),main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await control('continue').click();await page.locator('.fusion-workroom').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);
 const title=await page.title();check(/Dice Abyss|骰渊/i.test(title),'Correct page identity',{title,url:page.url()});check(page.url().startsWith(baseURL),'Requested loopback URL retained');
 check((await page.locator('.fusion-workroom').innerText()).includes('熔炼'),'Meaningful fusion page, not blank');check(await page.locator('vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay').count()===0,'No framework error overlay');
 await same(f.state,'Loaded fixture is exact');
 await card(f.target).click();for(const id of f.ids)await card(id).click();
 eq(await materials(),[...f.ids].sort(),'Native card clicks select intended material IDs');eq(await targets(),[f.target],'Native card click retains intended target');
 await page.mouse.move(4,4);await page.keyboard.press('Escape');
 await same(f.state,'Selection changes no save or RNG');
}
async function screenshot(suffix){const name=`${active.name}-${suffix}.png`;await page.screenshot({path:path.join(output,name),animations:'disabled',timeout:30000});report.screenshots.push(name);active.screenshots.push(name);}
async function geometry(selector){return page.locator(selector).evaluate(node=>{
 const r=node.getBoundingClientRect(),style=getComputedStyle(node),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
 return {text:node.textContent.trim(),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},fontSize:parseFloat(style.fontSize),horizontalTextOverflow:node.scrollWidth>node.clientWidth+1,inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,unoccluded:!!hit&&(node===hit||node.contains(hit)),documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollY};
 });}
async function inspectLayout(){
 await page.evaluate(()=>window.scrollTo(0,0));
 active.initialLayout=await geometry('.fusion-submit');check(active.initialLayout.inViewport,'Primary action remains in the viewport',active.initialLayout);check(!active.initialLayout.horizontalTextOverflow,'Primary label is not horizontally clipped');
 check(active.initialLayout.documentWidth<=active.initialLayout.viewportWidth+1,'Fusion surface has no horizontal document overflow',active.initialLayout);
 await screenshot('overview');
}
async function capBlocked(f,viewport,kind){
 const button=control('fusion-preview');check(await button.isDisabled(),'Over-cap primary action is truly disabled');
 const text=await page.locator('.fusion-settlement').innerText();check(text.includes('超过持有上限')&&text.includes('10,000,000,000'),'Readable cap condition and full capacity');
 check(!/还差 1 金币|余额\s*[-−]1|10,000,000,001/.test(text),'No false one-gold deficit, negative balance or sentinel price');
 if(kind==='single-cap'){check(text.includes('更换目标后再试'),'Single-material price directs player to change target');check(!text.includes('减少材料'),'Single-material price does not promise an impossible reduction');}
 else check(text.includes('减少材料或更换目标后再试'),'Bulk-only price offers a possible reduction');
 await inspectLayout();
 const bounds=await button.boundingBox();await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
 // A browser-generated click on a disabled button has no activation. Selection
 // and both save slots must remain unchanged; no controller internals are used.
 eq(await materials(),[...f.ids].sort(),'Disabled-button native click preserves selected materials');eq(await targets(),[f.target],'Disabled-button native click preserves target');await same(f.state,'Disabled-button click consumes nothing');
 await page.locator('.fusion-cost-details summary').click();
 const details=await page.locator('.fusion-cost-details').innerText();check(details.includes('组合费用超过金币持有上限'),'Expanded fee detail distinguishes capped quote');check(!details.includes('10,000,000,001'),'Fee detail never calls sentinel the true price');
 await page.locator('.fusion-budget-warning').evaluate(node=>node.scrollIntoView({block:'center'}));
 active.warningLayout=await geometry('.fusion-budget-warning');check(active.warningLayout.inViewport&&active.warningLayout.unoccluded,'Cap explanation is reachable without a fixed overlay covering it',active.warningLayout);check(!active.warningLayout.horizontalTextOverflow&&active.warningLayout.fontSize>=12,'Full cap explanation fits and uses at least 12px text');
 await screenshot('cap-explanation');
 if(kind==='bulk-cap'){
  await card(f.ids[1]).click();eq(await materials(),[f.ids[0]],'Removing one material preserves the remaining material');check(await button.isEnabled(),'A now-payable single-material combination enables fusion');check(!(await page.locator('.fusion-settlement').innerText()).includes('费用超过金币持有上限'),'Reduced combination clears the obsolete cap warning');await same(f.state,'Reduction is a preview only');
 }
 note('Boundary is constructed, not naturally reached',{playerLevel:f.state.player.level,targetLevel:f.state.player.items.find(i=>i.id===f.target).level,quotedCost:f.preview.cost,gold:f.state.player.gold,viewport});
}
async function budgetAdjust(f){
 const button=control('fusion-preview');check(await button.isEnabled(),'Ordinary shortage keeps budget adjustment enabled');check((await button.innerText()).includes('按预算调整材料'),'Primary action names budget adjustment');
 const text=await page.locator('.fusion-settlement').innerText();check(text.includes('无法结算')&&!/余额\s*[-−]/.test(text),'Unaffordable preview never presents a negative settled balance');check(!text.includes('费用超过金币持有上限'),'Ordinary shortage is not mislabeled a cap condition');
 await inspectLayout();await button.click();const retained=await materials();eq(retained.length,2,'Budget action keeps the affordable two-material combination');check(retained.every(id=>f.ids.includes(id)),'Budget repair only uses originally eligible materials');check((await button.innerText()).includes('投骰融合'),'Repaired combination can use the ordinary fusion action');await same(f.state,'Budget adjustment consumes no item, money or RNG');await screenshot('budget-adjusted');
}
async function exactCap(f){
 const button=control('fusion-preview');check(await button.isEnabled(),'An exact-cap quote remains executable');check((await button.innerText()).includes('投骰融合'),'Exact-cap action keeps normal intent');
 const text=await page.locator('.fusion-settlement').innerText();check(!text.includes('超过金币持有上限')&&!text.includes('无法结算'),'Exact-cap quote is not falsely disabled');check(/熔炼后余额\s+0(?:\s|$)/.test(text),'Exact-cap preview states zero remaining balance');
 await inspectLayout();const expected=E.transition(f.state,{type:'fuse',targets:[f.target],materials:f.ids,allowProtected:false});check(expected!==f.state,'Authoritative engine accepts exact-cap quote');eq(expected.player.gold,0,'Authoritative exact-cap cost spends exactly available funds');
 await button.click();await page.waitForFunction(({key,revision})=>{try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}},{key:S.SAVE_KEY,revision:expected.revision});await page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
 await same(expected,'One native exact-cap fusion equals the entire engine transition');check(!(await page.locator('.fusion-workroom').innerText()).includes('余额 -1'),'Completed exact-cap fusion has no negative balance');eq(await materials(),[],'Completed fusion clears consumed material selection');await screenshot('completed');
 await page.reload();await control('continue').click();await page.locator('.fusion-workroom').waitFor({state:'visible'});await same(expected,'Reload retains the completed exact-cap transaction');
}
try{
 for(const viewport of report.viewports)for(const kind of ['single-cap','bulk-cap','budget','exact-cap']){
  const name=`${kind}-${viewport.width}x${viewport.height}`;if(options['--cases']&&!options['--cases'].split(',').includes(name))continue;
  active={name,kind,viewport,checks:[],screenshots:[],status:'running'};report.cases.push(active);const count=report.errors.length;
  try{const f=fixture(kind);active.fixture={gold:f.state.player.gold,playerLevel:f.state.player.level,targetLevel:f.state.player.items.find(i=>i.id===f.target).level,materials:f.ids.length,cost:f.preview.cost,stateSha256:hash(f.state)};await fresh(f,viewport);if(kind==='budget')await budgetAdjust(f);else if(kind==='exact-cap')await exactCap(f);else await capBlocked(f,viewport,kind);check(report.errors.length===count,'No console or page errors in this flow');active.status='passed';console.log(`PASS ${name}`);}
  catch(error){active.status='failed';active.error=error.stack||String(error);process.exitCode=1;console.error(`FAIL ${name}: ${error.message}`);try{await screenshot('failure');}catch{}}
  await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
 }
}finally{
 report.finished=new Date().toISOString();report.sourceAfter=await sourceHashes();report.productionSourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.status=report.cases.length>0&&report.cases.every(row=>row.status==='passed')&&report.errors.length===0&&report.network.blocked.length===0&&report.network.httpErrors.length===0&&report.productionSourceUnchanged?'passed':'failed';report.checkCount=report.cases.reduce((sum,row)=>sum+row.checks.length,0);report.caseCount=report.cases.length;if(report.status!=='passed')process.exitCode=1;
 await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();console.log(JSON.stringify({status:report.status,cases:report.caseCount,checks:report.checkCount,errors:report.errors.length,warnings:report.warnings.length,screenshots:report.screenshots.length,report:path.join(output,'browser-report.json')}));
}
