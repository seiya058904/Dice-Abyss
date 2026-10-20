// Optional real-browser integration checks. Playwright and Chromium are supplied
// by the tester, never runtime dependencies. Natural samples are recorded from a
// fresh seeded simulation; all other states are explicitly constructed fixtures.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node
// scripts/qa-boons-round17.mjs --url=http://127.0.0.1:4189 --output=/tmp/boons-qa
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {eventChoices,EXTRA_BOSSES} from '../src/encounters.js';
import {boonReadout} from '../src/boon-readout.js';
import {eventChoicePreview} from '../src/event-preview.js';
import {encounterTactics} from '../src/encounter-tactics.js';
import {goldNum} from '../src/views.js';
import {eventFixture} from './audit-event-context.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(0,at),arg.slice(at+1)];}));
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(options['--output']||'/tmp/dice-abyss-boons-qa');
const url=options['--url']||'http://127.0.0.1:4189';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname),'Only isolated loopback origins are allowed');
const only=options['--case'];
const evidence=path.join(root,'docs/iteration/evidence/round17');
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['index.html','src/app.js','src/views.js','src/boons.css','src/boon-readout.js','src/event-preview.js','src/encounter-tactics.js','src/engine.js','src/storage.js'];
const identity=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha(await fs.readFile(path.join(root,file),'utf8'))])));
const report={started:new Date().toISOString(),sourceBefore:await identity(),url,cases:[],errors:[],screenshots:[],notes:[
 'Natural fixture saves are unmodified recorded states from seed 7919, adventurous/luck; resuming them in a browser is a replay, not a new manual 200-floor playthrough.',
 'Other fixtures use the existing eventFixture helper and validator. Boss variants change the mechanic in a copied natural combat save and are labelled synthetic.',
 'Reduced motion and low effects keep functional assertions separate from the full/low performance audit. No hardware GPU or physical 4K claim.',
 'Every committed action is compared with the full authoritative engine state, including RNG, revision, inventory and unknown fields.',
 'A failed case is retained. --case permits a separate targeted rerun; reports are never silently merged or slow samples dropped.'
]};
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:options['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let checks=0,trace=[];
const recorded=value=>value?.player&&value?.runId?{phase:value.phase,floor:value.floor,revision:value.revision,rng:value.rng,stateSha256:sha(value)}:value;
const check=(condition,label)=>{checks++;trace.push({label,passed:!!condition});assert(condition,label);};
const eq=(actual,expected,label)=>{checks++;const row={label,actual:recorded(actual),expected:recorded(expected)};trace.push(row);assert.deepEqual(actual,expected,label);row.passed=true;};
const action=(page,type)=>page.locator(`[data-action="${type}"]`);
const saved=async page=>S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY));
const idle=page=>page.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
const waitRevision=(page,revision)=>page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision});
async function load(page,state){
 assert(S.validateSave(state));await page.goto(url);
 await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));},{raw:S.encodeSave(state),main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await action(page,'continue').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
}
async function natural(name){return S.decodeSave(await fs.readFile(path.join(evidence,name+'.save.json'),'utf8'));}
function fixture(key){
 for(let i=0;i<300;i++){
  const s=eventFixture({E,S},['hollow_scale','silent_anvil'].includes(key)?'mystery':key,{seed:17017+i,floor:140,rich:true});
  if(s.event.key===key)return s;
 }
 throw Error('Missing fixture '+key);
}
function richBoonFixture(){const s=fixture('prayer');s.blessing=2;s.eventPower=15;s.eventLuck=8;s.nextLuck=5;s.v5Boons={echo:1,ward:1};assert(S.validateSave(s));return s;}
async function bossFixture(mechanic,turns=0){
 const s=await natural('ordinary-boss-no-tactics');
 Object.assign(s.enemy,EXTRA_BOSSES.find(boss=>boss.mechanic===mechanic),{type:'boss',combatRules:4,turns,stage:1});
 s.runId=`qa-boons-${mechanic}-${turns}`;s.nextLuck=5;s.enemy.openingEcho=turns===0?.25:0;
 assert(S.validateSave(s));return s;
}
const formatted=(value,unit)=>unit==='reserve'?(value?'已储备':'未储备'):unit==='level'?`Lv.${goldNum(value)}`:unit==='enhance'?`+${value}`:unit==='percent'?`${Math.round(value*10000)/100}%`:unit==='items'?`${goldNum(value)} 件`:goldNum(value);
async function verifyRows(parent,state,id){
 const quote=eventChoicePreview(state,id);check(quote?.available,'fixture has an available deterministic preview');
 eq(await parent.locator('.event-preview-row').count(),quote.rows.length,'every known consequence is rendered');
 for(const row of quote.rows){
  const node=parent.locator(`[data-preview-key="${row.key}"]`);
  eq(await node.locator('.event-preview-values > span').first().textContent(),formatted(row.before,row.unit),row.key+' exact before value');
  eq(await node.locator('.event-preview-values > strong').textContent(),formatted(row.after,row.unit),row.key+' exact after value');
  if(row.targetName)check((await node.innerText()).includes(row.targetName),'registered target name remains visible');
 }
}
async function screenshot(page,name,fullPage=false){await page.screenshot({path:path.join(output,name+'.png'),fullPage});report.screenshots.push(name+'.png');}
async function run(name,fn){
 if(only&&only!==name)return;
 trace=[];const started=performance.now(),before=checks;
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',error=>report.errors.push({case:name,error:String(error)}));
 try{await fn(page,context);report.cases.push({name,status:'PASS',checks:checks-before,trace,ms:performance.now()-started});}
 catch(error){report.cases.push({name,status:'FAIL',checks:checks-before,trace,ms:performance.now()-started,error:String(error),stack:error.stack});await screenshot(page,'FAIL-'+name).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
 console.log(`${name}: ${report.cases.at(-1).status}`);
}

try{
 await run('natural-benefits-and-first-roll',async page=>{
  for(const name of ['active-bonuses-invisible-in-exploration','reserved-ward-invisible-in-exploration','reserved-echo-invisible-in-exploration','opening-echo-invisible-before-roll']){
   const s=await natural(name);await load(page,s);const groups=boonReadout(s).groups;
   for(const group of groups)for(const entry of group.entries){
    const node=page.locator(`.boon-readout [data-boon-key="${entry.key}"]`);
    check(await node.isVisible(),`${name}: ${entry.name} is in the live readout`);check((await node.innerText()).includes(entry.value),'benefit value is explicit');
   }
   eq(await saved(page),s,'reading the natural sample never changes its save');
   if(name.startsWith('reserved-ward')){
    const expected=E.transition(s,{type:'next'});await page.locator('#primary-action').click();await waitRevision(page,expected.revision);await idle(page);
    eq(await saved(page),expected,'reserved ward enters battle with the exact existing transaction');eq(await page.locator('[data-boon-key="ward"]').count(),0,'used ward reserve leaves the list');
   }
   if(name.startsWith('opening-echo')){
    check(await page.locator('[data-ready-boon="openingEcho"]').isVisible(),'opening echo is visible next to the dice before input');
    await screenshot(page,'natural-opening-echo');const expected=E.transition(s,{type:'roll'});
    await page.locator('#primary-action').click();await waitRevision(page,expected.revision);await idle(page);eq(await saved(page),expected,'first roll uses the same complete state and RNG result');
    eq(await page.locator('[data-ready-boon="openingEcho"]').count(),0,'one-use first-roll banner is removed after consumption');
    await page.reload();await action(page,'continue').click();eq(await saved(page),expected,'refresh does not restore spent echo or redraw dice');
   }
  }
 });
 await run('event-preview-commit-cancel-refresh',async page=>{
  for(const [key,ids]of [['spring',['heal','ward']],['prayer',['luck','power']],['hollow_scale',['accept']],['silent_anvil',['accept']],['echochamber',['accept']],['wardbank',['accept']]])for(const id of ids){
   const s=fixture(key);if(key==='spring'){s.player.hp=Math.floor(E.stats(s).maxHp*.4);s.ward=E.stats(s).maxHp;}
   await load(page,s);const button=page.locator(`.event-option[data-id="${id}"]`),choice=eventChoices(s).find(o=>o.id===id);
   await verifyRows(button,s,id);eq(await saved(page),s,'opening the event view is read-only');
   if(key==='prayer'&&id==='power')await screenshot(page,'prayer-preview');
   await button.click();
   if(choice.confirm||choice.destructive){
    await page.locator('dialog[open]').waitFor();await verifyRows(page.locator('dialog[open]'),s,id);eq(await saved(page),s,'confirmation review has not paid or advanced RNG');
    await page.locator('dialog [data-action="close-dialog"]').last().click();eq(await saved(page),s,'cancel preserves all original fields');
    await button.click();await page.locator('dialog [data-action="confirm"]').click();
   }
   const expected=E.transition(s,{type:'event-choice',id,confirmed:true});await waitRevision(page,expected.revision);await idle(page);
   eq(await saved(page),expected,`${key}/${id}: payment and reward exactly match the authoritative transition`);eq(await page.locator('.event-screen .event-choice-preview').count(),0,'resolved event does not keep a prospective offer');eq(await page.locator('dialog[open]').count(),0,'completed confirmation is closed');
   await page.reload();await action(page,'continue').click();eq(await saved(page),expected,'refresh keeps the committed event, price, equipment and RNG');
  }
 });
 await run('disclosure-keyboard-scroll-and-new-run',async page=>{
  const s=richBoonFixture();await page.setViewportSize({width:1366,height:768});await load(page,s);
  const summary=page.locator('#boon-details-toggle');await summary.scrollIntoViewIfNeeded();await summary.focus();await page.keyboard.press('Space');
  check(await page.locator('[data-boon-details]').evaluate(node=>node.open),'Space opens the native lifetime disclosure');eq(await saved(page),s,'Space on summary never advances the game');
  await page.locator('.route-panel').evaluate(node=>{node.scrollTop=node.scrollHeight;});const scroll=await page.locator('.route-panel').evaluate(node=>node.scrollTop);check(scroll>0,'dense sidebar has reachable scrollable rules');
  await action(page,'settings').click();await page.locator('#effects').selectOption('full');await page.locator('#effects').selectOption('low');await page.locator('dialog [data-action="close-dialog"]').click();
  check(await page.locator('[data-boon-details]').evaluate(node=>node.open),'disclosure remains open after same-run renders');eq(await page.locator('.route-panel').evaluate(node=>node.scrollTop),scroll,'same-run rerender retains sidebar scroll');eq(await saved(page),s,'display settings and disclosure do not write game state');
  await page.locator('.main-nav [data-action="talents"]').click();await page.locator('#primary-action').click();
  check(await page.locator('[data-boon-details]').evaluate(node=>node.open),'returning from talents retains the same-run disclosure');eq(await page.locator('.route-panel').evaluate(node=>node.scrollTop),scroll,'returning from talents retains sidebar scroll');eq(await saved(page),s,'navigation preserves the full game state');
  await page.locator('.brand[data-action="home"]').click();await page.locator('.title-buttons [data-action="new"]').click();await page.locator('dialog [data-action="confirm"]').click();await idle(page);const next=await saved(page);
  check(next.runId!==s.runId,'new-game confirmation starts a distinct run');eq(await page.locator('.boon-readout').count(),0,'previous run benefits do not leak into a fresh run');
 });
 await run('six-boss-guides-and-turn-update',async page=>{
  for(const boss of EXTRA_BOSSES)for(const turns of [0,1]){
   const s=await bossFixture(boss.mechanic,turns);await load(page,s);const guide=encounterTactics(s.enemy,E.diceCount(s));
   const text=await page.locator('.enemy-mechanic').innerText();check(text.includes('当前一掷'),boss.mechanic+' has a current-turn heading');
   for(const line of guide.lines){check(text.includes(line.condition),'current condition is rendered');check(text.includes(line.effect),'current consequence is rendered');}
   eq(await saved(page),s,'boss guide reads no future RNG and makes no move');
  }
  const s=await bossFixture('boss_cinder');s.enemy.hp=s.enemy.maxHp=1e9;s.enemy.shield=0;s.enemy.attack=1;await load(page,s);const expected=E.transition(s,{type:'roll'});assert.equal(expected.phase,'combat');await page.locator('#primary-action').click();await waitRevision(page,expected.revision);await idle(page);eq(await saved(page),expected,'manual boss roll retains complete old-engine semantics');
  check((await page.locator('.enemy-mechanic').innerText()).includes('当前为偶数回合'),'boss turn guide advances after the real roll');
 });
 await run('first-critical-presentation-lifetime',async page=>{
  for(const killed of [false,true]){
   const s=eventFixture({E,S},'combat',{seed:7919,floor:140});s.player.talents.dawnCrit=3;s.nextLuck=0;s.rng=7;s.enemy.hp=killed?1:s.enemy.maxHp;s.enemy.shield=0;s.enemy.attack=1;s.player.hp=E.stats(s).maxHp;
   const expected=E.transition(s,{type:'roll'});assert.equal(expected.nextLuck,15);assert.equal(expected.lastRoll.luck,0);assert.equal(expected.lastRoll.killed,killed);
   await load(page,s);
   await page.evaluate(()=>{
    window.__boonPhases=[];
    const snapshot=()=>{const room=document.querySelector('#current-room'),row={phase:document.querySelector('.game-shell')?.dataset.scene,busy:!!room?.classList.contains('busy'),impact:!!room?.classList.contains('impact-reveal'),banners:[...document.querySelectorAll('[data-ready-boon]')].map(node=>({key:node.dataset.readyBoon,text:node.textContent}))};if(JSON.stringify(row)!==JSON.stringify(window.__boonPhases.at(-1)))window.__boonPhases.push(row);};
    window.__boonObserver=new MutationObserver(snapshot);window.__boonObserver.observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,attributeFilter:['class']});snapshot();
   });
   await page.locator('#primary-action').click();await waitRevision(page,expected.revision);await idle(page);
   const observations=await page.evaluate(()=>{window.__boonObserver.disconnect();return window.__boonPhases;});trace.push({killed,observations});
   check(observations.some(row=>row.busy&&row.impact),'the real impact stage was observed');check(observations.filter(row=>row.busy&&row.impact).every(row=>row.banners.length===0),'newly earned luck is absent throughout impact');
   eq(await saved(page),expected,'presentation observations do not change the committed roll');
   if(!killed)check((await page.locator('[data-ready-boon="nextLuck"]').innerText()).includes('下一掷生效'),'surviving combat exposes earned luck for the following input');else eq(await page.locator('[data-ready-boon]').count(),0,'chest has no current-roll banner');
  }
 });
 await run('responsive-layout',async page=>{
  const scenes=[['prayer',richBoonFixture()],['collector',await bossFixture('boss_collector')],['tide-even',await bossFixture('boss_tide',1)]];
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,740]]){
   await page.setViewportSize({width,height});
   for(const [name,s]of scenes){
    await load(page,s);
    const geometry=await page.evaluate(()=>{
     const selected=[...document.querySelectorAll('.event-preview-row,.event-preview-note,.boon-entry,.combat-boon-ready,.combat-tactics,.primary-action')];
     return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],overflow:selected.filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.left<-.5||r.right>innerWidth+.5||node.scrollWidth>node.clientWidth+1);}).map(node=>({className:node.className,text:node.textContent.slice(0,120),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth})),minimumFont:Math.min(...[...document.querySelectorAll('.event-choice-preview,.boon-entry,.combat-boon-ready p')].map(node=>parseFloat(getComputedStyle(node).fontSize)))};
    });
    check(geometry.scrollWidth<=width,`${width}/${name}: no document horizontal overflow`);eq(geometry.overflow,[],`${width}/${name}: new text and controls have no horizontal clipping`);check(geometry.fonts.every(Boolean),'bundled body and pixel fonts are available');check(geometry.minimumFont>=12,'new status and preview body text is at least 12 CSS pixels');trace.push({viewport:[width,height],scene:name,geometry});
    if(width===1366||width===320)await screenshot(page,`${name}-${width}`,width===320);
    const primary=page.locator('#primary-action');await primary.scrollIntoViewIfNeeded();check(await primary.isVisible(),'manual action remains reachable');
   }
  }
 });
}finally{
 report.sourceAfter=await identity();report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.checks=checks;report.finished=new Date().toISOString();report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify({passed:report.passed,failed:report.failed,checks,errors:report.errors,sourceUnchanged:report.sourceUnchanged}));
if(report.failed||report.errors.length||!report.sourceUnchanged)process.exitCode=1;
