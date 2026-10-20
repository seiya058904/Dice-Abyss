// Optional browser regression. Uses an external Playwright module and browser;
// neither is a shipping dependency. All saves are synthetic, in isolated contexts.
// PLAYWRIGHT_MODULE=/path/to/playwright node scripts/qa-reward-browser.mjs \
//   --url=http://127.0.0.1:4188/ --browser=/path/to/chrome --output=/tmp/reward-qa
// Both --name=value and --name value are accepted. --case=<name> limits a rerun.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {eventChoices} from '../src/encounters.js';
import {RARITIES} from '../src/content.js';

const options={};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i],at=arg.indexOf('='),key=at<0?arg:arg.slice(0,at);
 assert(['--url','--browser','--output','--case'].includes(key),`Unknown option: ${key}`);
 const value=at<0?process.argv[++i]:arg.slice(at+1);
 assert(typeof value==='string'&&value.length>0&&!value.startsWith('--'),`Missing value: ${key}`);options[key]=value;
}
const cases=['gambit-safe','exchange-relic','legacy-pending-import','auction-collision-import'];
assert(!options['--case']||cases.includes(options['--case']),'--case must name one of: '+cases.join(', '));
const url=options['--url']||process.env.QA_BASE_URL||'http://127.0.0.1:4188/';
const output=path.resolve(options['--output']||'/tmp/dice-abyss-reward-qa');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['src/engine.js','src/equipment.js','src/equipment-content.js','src/content.js','src/encounters.js','src/deep-content.js','src/deep-rules.js','src/rarity.js','src/storage.js','src/app.js','src/views.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'))])));
await fs.mkdir(output,{recursive:true});
const report={synthetic:true,url,viewport:{width:1440,height:900},started:new Date().toISOString(),sourceHashesBefore:await sourceHashes(),cases:[],errors:[],console:[],notes:[
 'Four independent contexts use legal synthetic floor-140 fixtures. This is a targeted functional regression, not a natural-progression or visual-performance claim.',
 'Only fixture setup injects localStorage. Every choice, cancellation, confirmation and import uses real rendered controls or the file chooser; no app closure or internal UI state is read.',
 'Assertions compare complete decoded saves and exact primary/mirror bytes. Rejected imports and read-only operations compare every localStorage entry, including absent archive slots.',
 'The invalid auction is one reward-ID collision inside an otherwise valid current-format envelope with a recomputed checksum. It is uploaded through the UI and is never injected as active storage.',
 'Console warnings are recorded verbatim for review. Page exceptions and console errors fail the run.'
]};
const browser=await chromium.launch({executablePath:options['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let checks=0,trace=[],screenshots=[];
const recorded=value=>{
 if(value?.player&&value?.runId)return{runId:value.runId,revision:value.revision,phase:value.phase,rng:value.rng,gold:value.player.gold,items:value.player.items.length,sha256:sha(value)};
 if(typeof value==='string'&&value.length>500)return{bytes:Buffer.byteLength(value),sha256:sha(value)};
 if(Array.isArray(value))return value.map(recorded);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,recorded(v)]));
 return value;
};
function check(value,label){checks++;const entry={label,passed:!!value};trace.push(entry);assert(value,label);}
function eq(actual,expected,label){checks++;const entry={label,passed:false,actual:recorded(actual),expected:recorded(expected)};trace.push(entry);assert.deepEqual(actual,expected,label);entry.passed=true;}
const button=(page,action)=>page.locator(`[data-action="${action}"]`);
const choice=(page,id)=>page.locator(`.event-options [data-action="event-choice"][data-id="${id}"]`);
const disk=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
const saved=async page=>S.decodeSave((await disk(page))[S.SAVE_KEY]);
const idle=page=>page.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
const waitRevision=(page,revision)=>page.waitForFunction(({key,revision})=>{
 try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}
},{key:S.SAVE_KEY,revision});
const waitRaw=(page,raw)=>page.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key:S.SAVE_KEY,raw});
function room(type,seed){
 let s=E.newGame(seed);s.runId=`qa-reward-140-${type}-${seed}`;s.floor=140;s.player.level=100;s.player.hp=E.stats(s).maxHp;s.player.gold=1e7;s.fate=[3,4];
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.roomIndex=0;s.phase='route';
 if(type==='exchange'||type==='mystery')s.player.items.push(E.makeItem(s,'relic',1));
 s=E.transition(s,{type:'enter'});assert(S.validateSave(s),'generated room fixture is valid');assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);return s;
}
async function durable(page,expected,label){
 const storage=await disk(page),raw=S.encodeSave(expected);
 eq(storage[S.SAVE_KEY],raw,label+': exact primary bytes');eq(storage[S.BACKUP_KEY],raw,label+': exact mirror bytes');
 eq(S.decodeSave(storage[S.SAVE_KEY]),expected,label+': complete decoded save');
}
async function load(page,state){
 assert(S.validateSave(state));await page.goto(url);
 eq(new URL(page.url()).href,new URL(url).href,'page URL identifies the requested local app');
 check((await page.title()).includes('Dice Abyss'),'page title identifies Dice Abyss');
 await page.evaluate(({raw,save,mirror,settings})=>{
  localStorage.setItem(save,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));
 },{raw:S.encodeSave(state),save:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await button(page,'continue').click();await idle(page);
 check((await page.locator('#app').innerText()).length>100,'meaningful app content is rendered');
 check(await page.locator('vite-error-overlay, nextjs-portal, webpack-dev-server-client-overlay').count()===0,'no framework error overlay');
 await durable(page,state,'fixture resumes without an action or reroll');
}
async function shot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:false});screenshots.push(name+'.png');}
async function upload(page,raw,name){
 // The user-visible Import button opens the actual file input. No change event
 // is dispatched by the test, and imported bytes never bypass app.decodeSave.
 const chooser=page.waitForEvent('filechooser');await page.locator('dialog [data-action="import"]').click();
 await(await chooser).setFiles({name,mimeType:'application/json',buffer:Buffer.from(raw)});
}
async function settings(page){await button(page,'settings').click();await page.locator('dialog #save-file').waitFor({state:'attached'});}
async function commitMinimum(page,before,id,name,minimum){
 const option=eventChoices(before).find(o=>o.id===id);assert(option&&!option.disabled);
 const after=E.transition(before,{type:'event-choice',id,confirmed:true});
 check(after.chest.item.rarity===4,'fixture witnesses a real mythic result above the minimum');
 const rawBefore=await disk(page);
 eq(await choice(page,id).locator('.event-reward b').innerText(),minimum,'pending UI states the minimum before payment');
 check((await choice(page,id).locator('.event-cost b').innerText()).includes(option.cost),'pending UI states the actual cost');
 await shot(page,name+'-pending');await choice(page,id).click();await page.locator('dialog[open]').waitFor();
 eq(await page.locator('.event-confirm-terms dd').nth(1).innerText(),minimum,'confirmation repeats the same minimum');
 eq(await page.locator('.event-confirm-terms dd').nth(0).innerText(),option.cost,'confirmation repeats the actual cost');
 eq(await disk(page),rawBefore,'opening the confirmation pays nothing and consumes no RNG');
 await page.getByRole('button',{name:'取消',exact:true}).click();eq(await disk(page),rawBefore,'cancelling leaves every stored byte unchanged');
 await choice(page,id).click();await page.locator('dialog [data-action="confirm"]').click();
 await waitRevision(page,after.revision);await idle(page);await page.locator('.chest-screen').waitFor({state:'visible'});
 await page.locator('.toast.visible').filter({hasText:after.event.outcome}).waitFor({state:'visible'});
 eq(await page.locator('.toast.visible').innerText(),after.event.outcome,'rendered settlement names the actual committed reward');
 check(after.event.outcome.includes(RARITIES[after.chest.item.rarity].name),'settlement rarity equals the generated chest rarity');
 await durable(page,after,'one confirmed reward transaction');await shot(page,name+'-settled');return after;
}
async function openLoot(page,chest,name){
 const opened=E.transition(chest,{type:'open'});await page.locator('#primary-action').click();await waitRevision(page,opened.revision);await idle(page);
 await page.locator('.loot-screen').waitFor({state:'visible'});await durable(page,opened,'real Open button claims the original reward once');
 check((await page.locator('.loot-screen .drop-banner').innerText()).includes(RARITIES[chest.chest.item.rarity].name),'visible loot banner shows the actual reward quality');
 eq(opened.loot.item.id,chest.chest.item.id,'opened item retains its committed ID');eq(opened.rng,chest.rng,'opening the saved chest does not reroll RNG');
 await shot(page,name+'-loot');return opened;
}
function invalidAuctionEnvelope(offered){
 const bad=structuredClone(offered);bad.event.reward.item.id=bad.player.items[0].id;
 const envelope=JSON.parse(S.encodeSave(offered));envelope.payload=JSON.stringify(bad);let hash=2166136261;
 for(let i=0;i<envelope.payload.length;i++)hash=Math.imul(hash^envelope.payload.charCodeAt(i),16777619);
 envelope.checksum=(hash>>>0).toString(16);const raw=JSON.stringify(envelope);
 assert(!S.validateSave(bad));assert.throws(()=>S.decodeSave(raw),/内容不完整|不兼容/);return{bad,raw};
}
async function run(name,fn){
 if(options['--case']&&options['--case']!==name)return;
 trace=[];screenshots=[];const before=checks,start=performance.now();
 const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
 page.on('pageerror',error=>report.errors.push({case:name,message:String(error)}));
 page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))report.console.push({case:name,type:message.type(),text:message.text()});});
 let result;
 try{const details=await fn(page);result={name,status:'PASS',details};}
 catch(error){result={name,status:'FAIL',error:String(error),stack:error.stack};await shot(page,'FAIL-'+name).catch(()=>{});}
 finally{
  report.cases.push({...result,checks:checks-before,trace,screenshots,ms:performance.now()-start});await context.close();
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(`${name}: ${result.status}`);
}
try{
 await run('gambit-safe',async page=>{
  const before=room('gambit',285084);await load(page,before);
  const after=await commitMinimum(page,before,'safe','gambit','至少稀有宝箱');
  eq(after.player.gold,before.player.gold-before.event.costGold*2,'safe gamble pays exactly the quoted twofold cost');
  const opened=await openLoot(page,after,'gambit');
  await page.reload();await button(page,'continue').click();await durable(page,opened,'reload preserves claimed gamble item and RNG');
  return{seed:285084,floor:140,minimum:'稀有',actual:RARITIES[after.chest.item.rarity].name,cost:before.event.costGold*2,stateSha256:sha(opened)};
 });
 await run('exchange-relic',async page=>{
  const before=room('exchange',15838);await load(page,before);
  const after=await commitMinimum(page,before,'relic','exchange','至少史诗遗物宝箱');
  eq(after.player.equipped,before.player.equipped,'exchange retains every equipped ID');
  eq(after.player.items.map(i=>i.id),before.player.items.filter(i=>i.id!==before.event.offerId).map(i=>i.id),'exchange consumes only the selected spare');
  const opened=await openLoot(page,after,'exchange');
  return{seed:15838,floor:140,minimum:'史诗',actual:RARITIES[after.chest.item.rarity].name,consumed:before.event.offerId,stateSha256:sha(opened)};
 });
 await run('legacy-pending-import',async page=>{
  // This unchanged template is the old saved narrative. Its naturally selected
  // key and assets are generated by enter; only presentation should clarify it.
  const pending=room('mystery',110866),oldText='廊中的刻印愿收下一件旧遗物，归还一只史诗遗物宝箱。';
  eq(pending.event.key,'relic_exchange','fixture naturally selects the legacy relic exchange');eq(pending.event.text,oldText,'fixture contains the original saved narrative');
  const active=E.newGame(617);active.runId='qa-reward-active-before-legacy';await load(page,active);const beforeDisk=await disk(page),raw=S.encodeSave(pending);
  await settings(page);await upload(page,raw,'legacy-pending-relic.json');await page.getByRole('button',{name:'确认导入',exact:true}).waitFor();
  eq(await disk(page),beforeDisk,'file selection and import preview do not replace the current run');
  await page.getByRole('button',{name:'取消',exact:true}).click();eq(await disk(page),beforeDisk,'cancelling an import preserves all storage');
  await settings(page);await upload(page,raw,'legacy-pending-relic.json');await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await waitRaw(page,raw);await page.locator('.event-screen').waitFor({state:'visible'});await durable(page,pending,'confirmed legacy-description import preserves the exact state');
  const rendered='廊中的刻印愿收下一件旧遗物，归还一只至少史诗的遗物宝箱。';
  eq(await page.locator('.event-screen .room-heading p').innerText(),rendered,'visible old pending description clarifies the minimum');
  const importedDisk=await disk(page);await choice(page,'accept').click();
  eq(await page.locator('.event-confirm-terms dd').nth(1).innerText(),'至少史诗遗物宝箱','old pending decision uses the corrected guarantee');
  await page.getByRole('button',{name:'取消',exact:true}).click();eq(await disk(page),importedDisk,'inspecting and cancelling the old event preserves all bytes and RNG');
  await page.reload();await button(page,'continue').click();await durable(page,pending,'reload keeps the old text stored without redrawing the event');
  eq(await page.locator('.event-screen .room-heading p').innerText(),rendered,'read-only correction survives a normal reload');
  eq((await saved(page)).event.text,oldText,'original saved text is retained rather than silently rewritten');await shot(page,'legacy-pending');
  return{seed:110866,floor:140,storedText:oldText,renderedText:rendered,rng:pending.rng,stateSha256:sha(pending)};
 });
 await run('auction-collision-import',async page=>{
  const active=E.newGame(618);active.runId='qa-reward-active-before-auction';await load(page,active);
  const offered=room('abyssauction',741),invalid=invalidAuctionEnvelope(offered),beforeDisk=await disk(page);
  await settings(page);await upload(page,invalid.raw,'invalid-auction-owned-id.json');
  await page.locator('.toast.visible').filter({hasText:'存档内容不完整或版本不兼容。'}).waitFor({state:'visible'});
  eq(await disk(page),beforeDisk,'rejected collision import leaves primary, mirror, settings and archive slots exactly unchanged');
  eq(await saved(page),active,'the prior playable run remains selected after the rejection');
  eq(await page.locator('dialog #dialog-title').innerText(),'旅途设置','invalid file is rejected before a replacement confirmation');
  check(await page.getByRole('button',{name:'确认导入',exact:true}).count()===0,'there is no way to confirm the invalid import');await shot(page,'auction-import-rejected');
  // A valid counterpart proves that rejection is specific to the collision.
  const raw=S.encodeSave(offered);await upload(page,raw,'valid-auction.json');await page.getByRole('button',{name:'确认导入',exact:true}).waitFor();
  eq(await disk(page),beforeDisk,'valid import still waits for an explicit replacement confirmation');
  await page.getByRole('button',{name:'确认导入',exact:true}).click();await waitRaw(page,raw);await page.locator('.auction-preview').waitFor({state:'visible'});
  await durable(page,offered,'the valid auction counterpart imports exactly');
  check((await page.locator('.auction-preview').innerText()).includes(offered.event.reward.item.name),'visible auction preview shows the saved actual item');
  await choice(page,'accept').click();
  check((await page.locator('.event-confirm-terms dd').nth(1).innerText()).includes(offered.event.reward.item.name),'auction confirmation shows that same committed item');
  await durable(page,offered,'auction confirmation itself changes no state');
  const bought=E.transition(offered,{type:'event-choice',id:'accept',confirmed:true});await page.locator('dialog [data-action="confirm"]').click();await waitRevision(page,bought.revision);await idle(page);
  await durable(page,bought,'real auction acceptance retains its exact generated reward');eq(bought.rng,offered.rng,'accepting the imported auction uses no new RNG');
  const opened=await openLoot(page,bought,'auction');
  return{seed:741,floor:140,invalidPayloadChange:'event.reward.item.id equals an owned equipment ID',rejectedRawSha256:sha(invalid.raw),activePreservedSha256:sha(active),validRewardId:offered.event.reward.item.id,validStateSha256:sha(opened)};
 });
}finally{
 report.checks=checks;report.finished=new Date().toISOString();report.sourceHashesAfter=await sourceHashes();
 report.sourceStable=JSON.stringify(report.sourceHashesBefore)===JSON.stringify(report.sourceHashesAfter);
 report.passed=report.cases.length>0&&report.cases.every(c=>c.status==='PASS')&&report.errors.length===0&&!report.console.some(c=>c.type==='error')&&report.sourceStable;
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify({passed:report.passed,checks,sourceStable:report.sourceStable,cases:report.cases.map(({name,status,checks})=>({name,status,checks})),errors:report.errors,console:report.console,report:path.join(output,'report.json')},null,2));
if(!report.passed)process.exitCode=1;
