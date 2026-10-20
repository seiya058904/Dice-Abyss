// Isolated, optional browser QA for the published bandit windows and the first
// eligible critical opportunity. Playwright/Chromium are supplied by the tester;
// this script adds no dependency to the game. All saves are synthetic fixtures.
//
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node
// scripts/qa-battle-windows-round21.mjs --url=http://127.0.0.1:4189/
//   --baseline-url=http://127.0.0.1:4188/ --output=/tmp/battle-windows-qa
// --case=<exact-name-or-prefix> reruns one risk in a NEW attempt directory.
// --case=dense-color-study is an explicitly ephemeral CSS direction study,
// excluded from the default correctness run and from final evidence.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {EXTRA_ENEMIES,encounterNarrative} from '../src/encounters.js';
import {encounterTactics} from '../src/encounter-tactics.js';
import {boonReadout} from '../src/boon-readout.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{
 const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];
}));
const root=fileURLToPath(new URL('../',import.meta.url));
const url=options['--url']||'http://127.0.0.1:4189/';
const baselineUrl=options['--baseline-url'];
for(const origin of [url,baselineUrl].filter(Boolean))assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Only isolated loopback origins are allowed');
const only=options['--case'];
const outputBase=path.resolve(options['--output']||'/tmp/dice-abyss-battle-windows-qa');
const attempt=`${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`;
const output=path.join(outputBase,attempt);
await fs.mkdir(output,{recursive:true});
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['index.html','src/app.js','src/views.js','src/styles.css','src/boons.css','src/deep-content.js','src/equipment-comparison.js','src/boon-readout.js','src/encounter-tactics.js','src/encounters.js','src/engine.js','src/storage.js'];
const identity=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));
const report={started:new Date().toISOString(),attempt,url,baselineUrl:baselineUrl||null,sourceBefore:await identity(),cases:[],errors:[],screenshots:[],manualTransitionsVerified:0,verifiedActionsByType:{},notes:[
 'Only isolated loopback browser contexts and validator-approved constructed saves are used; this is not natural progression evidence.',
 'Manual actions use real visible browser controls. Every action is checked against the complete engine transition, including RNG, revision, pending rewards and unknown fields.',
 'Native localStorage writes seed each isolated fixture before a native reload/Continue. There are no game-internal browser hooks or patched engine functions.',
 'Reduced motion, low effects and headless software rendering are correctness settings, not performance or physical 4K hardware measurements.',
 'Every attempt has a distinct directory. First failures and their original screenshots remain available; targeted reruns never replace them.',
 'Model/save mismatches and verified rendered contradictions are classified as game failures. Invalid fixtures are harness failures; unresolved selector/timeouts remain unclassified until independently triaged.',
 'The browser-plugin bootstrap was unavailable in the originating session: Browser access requires the originating browser context. Open ChatGPT in the browser with the connected extension and try again. The parent explicitly authorized isolated standalone Playwright QA.',
 'dense-color-study is an optional two-image ephemeral CSS study, never a final product screenshot or a saved style change.'
]};
let browser,checks=0,trace=[],currentCase='',stage='setup';
const baselineStates=new Map();
const recorded=value=>value?.runId&&value?.player?{phase:value.phase,floor:value.floor,revision:value.revision,rng:value.rng,turns:value.enemy?.turns,firstCritUsed:value.enemy?.firstCritUsed??'absent',nextLuck:value.nextLuck??0,stateSha256:sha(value)}:value;
const check=(condition,label,category='game')=>{
 checks++;const row={label,passed:!!condition};trace.push(row);
 if(!condition){const error=new Error(label);error.qaCategory=category;throw error;}
};
const eq=(actual,expected,label,category='game')=>{
 checks++;const row={label,actual:recorded(actual),expected:recorded(expected)};trace.push(row);
 try{assert.deepEqual(actual,expected,label);row.passed=true;}catch(error){error.qaCategory=category;throw error;}
};
const action=(page,type)=>page.locator(`[data-action="${type}"]`);
const saved=async page=>S.decodeSave(await page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY));
const rawSaved=async page=>page.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY);
const idle=page=>page.locator('#primary-action:not(:disabled)').waitFor({state:'visible'});
const waitRevision=(page,revision)=>page.waitForFunction(({key,revision})=>{
 try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}
},{key:S.SAVE_KEY,revision});
async function load(page,state,origin=url){
 stage='fixture validation';check(S.validateSave(state),'constructed fixture passes the real save validator','harness');
 stage='native fixture storage and reload';await page.goto(origin);
 await page.evaluate(({raw,main,mirror,settings})=>{
  localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);
  localStorage.setItem(settings,JSON.stringify({effects:'low',sound:false,scale:1}));
 },{raw:S.encodeSave(state),main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await action(page,'continue').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
 stage='resumed fixture';eq(await saved(page),state,'native Continue preserves the entire fixture');
}
async function refresh(page,state,label='native refresh'){
 stage=label;const raw=await rawSaved(page);await page.reload();await action(page,'continue').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
 eq(await saved(page),state,`${label} keeps the exact complete state`);eq(await rawSaved(page),raw,`${label} preserves the committed raw envelope`);
}
async function commit(page,state,command,control=page.locator('#primary-action')){
 stage=`manual ${command.type}`;check(E.canAct(state,command),'the fixture permits '+command.type,'harness');
 const expected=E.transition(state,command);check(expected.revision===state.revision+1,'the expected action has one revision','harness');
 await control.click();await waitRevision(page,expected.revision);await idle(page);
 eq(await saved(page),expected,`manual ${command.type} matches every engine/save field`);
 report.manualTransitionsVerified++;report.verifiedActionsByType[command.type]=(report.verifiedActionsByType[command.type]||0)+1;
 return expected;
}
async function screenshot(page,name,{fullPage=false,study=false}={}){
 const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage});report.screenshots.push({file,case:currentCase,study});return file;
}
async function persist(){report.checks=checks;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
async function run(name,fn,{viewport={width:1366,height:768},study=false}={}){
 if(study&&only!==name)return;
 if(only&&!name.startsWith(only))return;
 currentCase=name;trace=[];stage='new isolated context';const started=performance.now(),before=checks;
 const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(18000);
 page.on('pageerror',error=>report.errors.push({case:name,error:String(error)}));
 try{await fn(page,context);report.cases.push({name,status:'PASS',checks:checks-before,trace,ms:performance.now()-started});}
 catch(error){
  const row={name,status:'FAIL',checks:checks-before,trace,ms:performance.now()-started,failure:{classification:error.qaCategory||'unclassified',stage,error:String(error),stack:error.stack}};
  report.cases.push(row);row.failure.screenshot=await screenshot(page,'FAIL-'+name,{study}).catch(()=>null);
 }finally{await context.close();await persist();}
 console.log(JSON.stringify({case:name,status:report.cases.at(-1).status,checks:checks-before,report:path.join(output,'report.json')}));
}
function scene(type='combat'){
 let s=E.newGame(1);s.runId='qa-battle-round21-'+type;s.floor=80;s.player.level=11;s.player.talentPoints=3;s.player.xp=0;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f80r${i}`,type,done:false,quality:0}));s.phase='route';s=E.transition(s,{type:'enter'});
 Object.assign(s.enemy,{trait:'steady',hp:1e12,maxHp:1e12,shield:0,maxShield:0,attack:1,turns:0});delete s.enemy.mechanic;s.rng=7919;s.ward=0;
 s.futureMetadata={source:'constructed round21 browser QA',nested:[13,{preserve:true}]};s.enemy.futureRule={preserve:'unknown enemy field'};
 assert(S.validateSave(s));return s;
}
const historicNote='趁旅者停顿清点财物，前三击是夺回它的机会。';
function bandit(variant=0,{legacy=false,turns=0}={}){
 const s=scene('bandit');Object.assign(s.enemy,EXTRA_ENEMIES.find(enemy=>enemy.mechanic==='bandit'&&enemy.variant===variant),{turns});
 if(legacy)s.enemy.note=historicNote;assert(S.validateSave(s));return s;
}
function dense(){
 const s=bandit(0);Object.assign(s.enemy,{hp:2731,maxHp:3600,attack:23,openingEcho:.25});
 s.player.talents.dawnCrit=3;s.nextLuck=15;s.blessing=6;s.eventPower=30;s.eventLuck=20;
 assert(S.validateSave(s));return s;
}
function firstCritical(state){
 for(let i=0;i<100;i++){
  const before=state;state=E.transition(state,{type:'roll'});
  assert.equal(state.phase,'combat','critical search uses a surviving constructed fight');
  if(state.lastRoll.critical)return{before,after:state};
 }
 throw Error('The bounded deterministic fixture did not produce a critical');
}
async function scale(page,state,value){
 stage='native UI scale setting';await action(page,'settings').click();await page.locator('#ui-scale').selectOption(String(value));await page.locator('dialog [data-action="close-dialog"]').click();
 eq((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),S.SETTINGS_KEY)).scale,value,'native scale setting persists '+value);
 eq(await saved(page),state,'scale setting preserves the complete game state');
}
async function nativeDisclosure(page,state,selector,label,onOpen){
 stage='keyboard '+label;const summary=page.locator(selector);await summary.scrollIntoViewIfNeeded();await summary.focus();
 const before=await summary.evaluate(node=>node.parentElement.open);await page.keyboard.press('Space');
 eq(await summary.evaluate(node=>node.parentElement.open),!before,label+' opens or closes with native Space');
 check(await summary.evaluate(node=>document.activeElement===node),label+' retains keyboard focus');
 eq(await saved(page),state,label+' Space does not roll or alter any state');
 if(!before&&onOpen)await onOpen();
 await page.keyboard.press('Space');eq(await summary.evaluate(node=>node.parentElement.open),before,label+' closes or reopens with native Space');
 eq(await saved(page),state,label+' second Space also preserves the full state');
}
async function opportunity(page,state){
 stage='committed opportunity and earned-luck readout';
 const model=boonReadout(state),entry=model.groups.find(group=>group.key==='combatTrigger')?.entries[0];
 const node=page.locator('.boon-readout [data-boon-key="firstCritLuck"]');
 eq(await node.count(),entry?1:0,'only a live fight with an active source has one opportunity row');
 if(entry){
  eq(await node.locator('dt').textContent(),'启明星','opportunity uses the in-game ability name');
  eq(await node.locator('strong').textContent(),entry.value,'opportunity value matches the currently committed availability');
  eq(await node.locator('small').textContent(),entry.when,'opportunity duration/status is explicit');
  eq(await node.locator('..').locator('..').getAttribute('data-boon-group'),'combatTrigger','opportunity is in its own group');
 }
 eq(await page.locator('[data-ready-boon="firstCritLuck"]').count(),0,'an unused or spent opportunity is never shown as granted luck');
 const earned=page.locator('.boon-readout [data-boon-key="nextLuck"]');
 eq(await earned.count(),state.nextLuck>0?1:0,'already-earned luck has an independent row');
 if(state.nextLuck>0)eq(await earned.locator('strong').textContent(),`原始幸运 +${state.nextLuck}`,'earned luck reports the exact raw amount');
 const order=['opening','nextRoll','combatTrigger','reserve','floor'].filter(key=>model.groups.some(group=>group.key===key));
 eq(await page.locator('.boon-readout [data-boon-group]').evaluateAll(nodes=>nodes.map(node=>node.dataset.boonGroup)),order,'urgency ordering separates opening, earned, opportunity, reserve and floor effects');
 eq(await saved(page),state,'readouts never add flags or change any state');
}
async function guide(page,state){
 stage='visible bandit window truth';const e=state.enemy,alternate=e.variant===1;
 const damageLeft=Math.max(0,2-e.turns),goldLeft=Math.max(0,(alternate?2:3)-e.turns),factor=alternate?3:2;
 const panel=page.locator('[data-tactic="bandit"]'),rows=panel.locator('dl > div');
 eq(await panel.count(),1,'current-rules bandit has exactly one turn guide');
 eq(await panel.getAttribute('data-tactic-turn'),String(e.turns+1),'guide names the imminent actual roll');
 eq(await rows.count(),2,'damage and gold retain distinct deadline rows');
 eq(await rows.nth(0).locator('dt').textContent(),damageLeft?`先手增伤还剩 ${damageLeft} 掷`:'先手增伤已结束','opening damage countdown is based on the first two rolls');
 eq(await rows.nth(0).locator('dd').textContent(),damageLeft?`本击伤害 +${alternate?15:25}%`:'本击无先手增伤','opening damage amount remains the engine amount');
 eq(await rows.nth(1).locator('dt').textContent(),goldLeft?`夺金窗口还剩 ${goldLeft} 掷`:'夺金窗口已结束','gold countdown includes the imminent roll');
 eq(await rows.nth(1).locator('dd').textContent(),goldLeft?`本掷击破时金币 ×${factor}`:'金币恢复原倍率；击破仍有宝箱','gold multiplier and expired-window loot remain truthful');
 const model=encounterTactics(e,E.diceCount(state));
 check((await page.locator('.combat-rules > summary').textContent()).includes(model.next),'last-window or next-turn explanation is rendered');
 eq(await page.locator('.enemy-note').textContent(),encounterNarrative(e),'pending narrative uses only the narrow presentation correction');
 if(e.variant===1&&e.note===historicNote){
  check((await page.locator('.enemy-note').textContent()).includes('前两击'),'the known old note displays its real two-roll window');
  eq((await saved(page)).enemy.note,historicNote,'the inherited raw three-roll note remains saved verbatim');
 }
 eq(await saved(page),state,'reading the bandit guide does not redraw RNG or alter the fight');
}
async function learnDawnCrit(page,state){
 stage='actual talents UI';await page.locator('.main-nav [data-action="talents"]').click();
 await page.locator('.destiny-branch-title[data-id="critical"]').click();
 await page.locator('[data-action="talent-count"][data-count="1"]').click();
 const node=page.locator('.v5-talent[data-action="talent"][data-id="dawnCrit"]');await node.scrollIntoViewIfNeeded();
 check(await node.isEnabled(),'the unlocked dawnCrit node can be learned with the available point');
 const copy=await node.innerText();check(copy.includes('持有效果时首次暴击')&&copy.includes('每场一次'),'actual talent card states first eligible critical and once per fight');
 eq(await saved(page),state,'branch, quantity and node preview never invest a point');
 const after=await commit(page,state,{type:'talent',id:'dawnCrit',count:1},node);
 eq(after.player.talents.dawnCrit,(state.player.talents.dawnCrit||0)+1,'the real node invests exactly one rank');
 await page.locator('#primary-action').click();await page.locator('.combat-screen').waitFor();
 eq(await saved(page),after,'returning from talents keeps the learned rank and full pending fight');return after;
}
async function observeRoll(page,state){
 stage='observe actual roll animation';
 await page.evaluate(()=>{
  window.__battleWindowPhases=[];
  const snapshot=()=>{
   const room=document.querySelector('#current-room'),first=document.querySelector('.boon-readout [data-boon-key="firstCritLuck"]');
   const row={phase:document.querySelector('.game-shell')?.dataset.scene,busy:!!room?.classList.contains('busy'),impact:!!room?.classList.contains('impact-reveal'),firstCrit:first?{value:first.querySelector('strong').textContent,when:first.querySelector('small').textContent}:null,banners:[...document.querySelectorAll('[data-ready-boon]')].map(node=>({key:node.dataset.readyBoon,text:node.textContent}))};
   if(JSON.stringify(row)!==JSON.stringify(window.__battleWindowPhases.at(-1)))window.__battleWindowPhases.push(row);
  };
  window.__battleWindowObserver=new MutationObserver(snapshot);window.__battleWindowObserver.observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,attributeFilter:['class']});snapshot();
 });
 const after=await commit(page,state,{type:'roll'});
 const observations=await page.evaluate(()=>{window.__battleWindowObserver.disconnect();return window.__battleWindowPhases;});trace.push({animation:observations});
 const rolling=observations.filter(row=>row.busy&&!row.impact),impact=observations.filter(row=>row.busy&&row.impact);
 check(rolling.length>0,'actual before-roll animation stage was observed');check(impact.length>0,'actual committed impact stage was observed');
 const beforeEntry=boonReadout(state).groups.find(group=>group.key==='combatTrigger')?.entries[0];
 const afterEntry=boonReadout({...after,phase:'combat'}).groups.find(group=>group.key==='combatTrigger')?.entries[0];
 for(const row of rolling){
  eq(row.firstCrit?.value??null,beforeEntry?.value??null,'rolling uses the pre-roll opportunity state');
  check(row.banners.every(banner=>banner.key!=='firstCritLuck'),'animation never grants an opportunity as a current boon');
  if(state.nextLuck>0)check(row.banners.some(banner=>banner.key==='nextLuck'&&banner.text.includes('本掷生效')),'previously earned luck is identified as applying to this roll');
 }
 for(const row of impact){
  eq(row.firstCrit?.value??null,afterEntry?.value??null,'impact shows spent only while both combatants remain alive');
  eq(row.banners,[],'impact has no next-roll banner attributed to the just-finished roll');
 }
 await opportunity(page,after);return after;
}
async function inClip(page,selector,label){
 const target=page.locator(selector);await target.scrollIntoViewIfNeeded();
 const result=await target.evaluate(node=>{
  const r=node.getBoundingClientRect(),clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
  for(let p=node.parentElement;p;p=p.parentElement){
   const style=getComputedStyle(p),b=p.getBoundingClientRect();
   if(/auto|scroll|hidden|clip/.test(style.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right);}
   if(/auto|scroll|hidden|clip/.test(style.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom);}
  }
  const centerX=(r.left+r.right)/2,centerY=(r.top+r.bottom)/2,hit=document.elementFromPoint(centerX,centerY);
  return {rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},clip,visible:r.left>=clip.left-.5&&r.right<=clip.right+.5&&r.top>=clip.top-.5&&r.bottom<=clip.bottom+.5,notCovered:!!hit&&(hit===node||node.contains(hit))};
 });
 trace.push({label,geometry:result});check(result.visible&&result.notCovered,label+' is reachable inside all scroll clips and is not covered');return result;
}
async function geometry(page,label){
 stage='geometry: '+label;
 // The existing QA's 12px floor covers boon text and banners. The unchanged
 // tactic component deliberately uses max(.68rem,11px); measure it separately
 // instead of inventing a new universal typography requirement for this round.
 const result=await page.evaluate(()=>{
  const selected=[...document.querySelectorAll('.boon-entry,.combat-boon-ready,.combat-tactics,.combat-tactics dl > div,.combat-rules,.enemy-note,#primary-action')];
  const visible=selected.filter(node=>node.getBoundingClientRect().width>0);
  const minimum=selector=>Math.min(...[...document.querySelectorAll(selector)].map(node=>parseFloat(getComputedStyle(node).fontSize)));
  return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],overflow:visible.filter(node=>{const r=node.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5||node.scrollWidth>node.clientWidth+1;}).map(node=>{const r=node.getBoundingClientRect();return{className:node.className,id:node.id,text:node.textContent.slice(0,160),left:r.left,right:r.right,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};}),minimumBoonText:minimum('.boon-entry,.boon-entry small,.combat-boon-ready p'),minimumTacticText:minimum('.combat-tactics dt,.combat-tactics dd')};
 });
 trace.push({label,geometry:result});check(result.scrollWidth<=result.width+1,label+': document has no horizontal overflow');eq(result.overflow,[],label+': window guide, status text and manual action have no horizontal clipping');check(result.fonts.every(Boolean),label+': bundled text and pixel fonts have loaded');check(result.minimumBoonText>=12,label+': boon readout and banners retain their 12 CSS pixel floor');check(result.minimumTacticText>=11,label+': inherited tactic rows retain their 11 CSS pixel floor');return result;
}

try{
 browser=await chromium.launch({executablePath:options['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
 await run('dense-color-study',async page=>{
  const state=dense();await load(page,state);
  check(await page.locator('[data-boon-key="firstCritLuck"]').isVisible(),'dense fixture includes the current opportunity');
  check(await page.locator('[data-boon-key="nextLuck"]').isVisible(),'dense fixture separately includes earned luck');
  // A scrollable sidebar can contain a visible layout box outside its clip.
  // Frame the actual study target before comparing its one changed color.
  await page.locator('[data-boon-key="firstCritLuck"]').scrollIntoViewIfNeeded();
  check(await page.locator('[data-boon-key="firstCritLuck"]').evaluate(node=>{
   const r=node.getBoundingClientRect(),p=node.closest('.route-panel').getBoundingClientRect();
   return r.top>=p.top&&r.bottom<=p.bottom&&r.left>=0&&r.right<=innerWidth;
  }),'the complete color-study target is inside the sidebar clip','harness');
  trace.push({fixture:recorded(state),groups:boonReadout(state).groups});
  await screenshot(page,'STUDY-product-color',{study:true});
  const original=await page.locator('[data-boon-key="firstCritLuck"] strong').evaluate(node=>getComputedStyle(node).color);
  const temporary=await page.addStyleTag({content:'.boon-group[data-boon-group="combatTrigger"] .boon-entry strong { color: #d1d9de; }'});
  await screenshot(page,'STUDY-opportunity-blue-gray',{study:true});
  eq(await page.locator('[data-boon-key="firstCritLuck"] strong').evaluate(node=>getComputedStyle(node).color),'rgb(209, 217, 222)','one temporary selector applies the study color');
  await temporary.evaluate(node=>node.remove());
  eq(await page.locator('[data-boon-key="firstCritLuck"] strong').evaluate(node=>getComputedStyle(node).color),original,'removing the ephemeral style restores the product');
  eq(await saved(page),state,'the color study leaves the entire save unchanged');
 },{study:true});
 if(baselineUrl)await run('baseline-reproduces-inherited-copy-and-no-opportunity',async page=>{
  for(const variant of [0,1]){
   let state=bandit(variant,{legacy:variant===1});state.player.talents.dawnCrit=1;
   await load(page,state,baselineUrl);
   eq(await page.locator('[data-tactic="bandit"]').count(),0,'baseline has no bandit countdown despite an active reward window');
   eq(await page.locator('[data-boon-key="firstCritLuck"]').count(),0,'baseline omits an available first-critical opportunity');
   eq(await page.locator('.enemy-note').textContent(),state.enemy.note,'baseline displays the inherited authored note unchanged');
   if(variant===1)await screenshot(page,'baseline-inherited-three-roll-note');
   for(let turn=0;turn<4;turn++){
    state=await commit(page,state,{type:'roll'});eq(state.enemy.turns,turn+1,'baseline advances exactly one roll');
    if(turn===1)await refresh(page,state,'baseline pending combat refresh');
   }
   baselineStates.set(variant,structuredClone(state));trace.push({variant,baselineFinalState:recorded(state)});
  }
 });
 for(const variant of [0,1])await run(`bandit-${variant}-manual-turns-0-to-4`,async page=>{
  let state=bandit(variant,{legacy:variant===1});state.player.talents.dawnCrit=1;await load(page,state);
  const inherited=state.enemy.note;await guide(page,state);await opportunity(page,state);
  await nativeDisclosure(page,state,'.combat-rules > summary','complete encounter rules');
  for(let turn=0;turn<4;turn++){
   state=await commit(page,state,{type:'roll'});eq(state.enemy.turns,turn+1,'real manual input advances one completed roll');
   eq(state.enemy.note,inherited,'manual rolls do not rewrite the pending encounter note');await guide(page,state);await opportunity(page,state);
   if(turn===1||turn===3){await refresh(page,state,'bandit refresh after '+(turn+1)+' rolls');await guide(page,state);}
  }
  if(baselineStates.has(variant))eq(state,baselineStates.get(variant),'current browser ends in exactly the same complete state as the baseline browser after four manual rolls');
  trace.push({variant,currentFinalState:recorded(state)});
 });
 for(const variant of [0,1])for(const turns of [1,2,3])await run(`bandit-${variant}-kill-after-${turns}-completed-rolls`,async page=>{
  let state=bandit(variant,{legacy:variant===1,turns});state.enemy.hp=1;
  const neutral=structuredClone(state);delete neutral.enemy.mechanic;
  const ordinary=E.transition(neutral,{type:'roll'}),factor=turns<(variant===1?2:3)?variant===1?3:2:1;
  await load(page,state);await guide(page,state);state=await commit(page,state,{type:'roll'});
  eq(state.phase,'chest','the actual boundary kill generates a pending chest');
  eq(state.chest.gold,ordinary.chest.gold*factor,'actual chest gold matches the independent ordinary-gold control and deadline factor');
  eq(state.chest.item,ordinary.chest.item,'deadline bonus does not reroll or upgrade the chest item');eq(state.rng,ordinary.rng,'deadline gold factor never consumes extra RNG');
  await refresh(page,state,'pending boundary chest refresh');
  const pending=structuredClone(state.chest);state=await commit(page,state,{type:'open'});eq(state.loot,pending,'opening claims the same committed reward');
 });
 await run('custom-imported-note-preserved-and-escaped',async page=>{
  const state=bandit(1);state.enemy.note='自定义注记：前三击 <script>不可执行</script>';
  await load(page,state);eq(await page.locator('.enemy-note').textContent(),state.enemy.note,'a custom inherited note is displayed literally without correction');
  eq(await page.locator('.enemy-note script').count(),0,'imported note markup is escaped');await refresh(page,state,'custom pending-note refresh');
  eq(await page.locator('.enemy-note').textContent(),state.enemy.note,'custom narrative survives a native refresh verbatim');
 });
 await run('first-eligible-critical-learned-after-earlier-critical',async page=>{
  let state=scene();await load(page,state);await opportunity(page,state);
  for(let turn=0;turn<100;turn++){
   state=await commit(page,state,{type:'roll'});if(state.lastRoll.critical)break;
  }
  check(state.lastRoll.critical,'a real earlier critical was observed');eq(state.enemy.turns,2,'fixed fixture reaches its first ineligible critical on roll two','harness');
  eq(state.nextLuck,0,'a critical without the effect earns no luck');check(!Object.hasOwn(state.enemy,'firstCritUsed'),'earlier ineligible critical does not create or consume a flag');await opportunity(page,state);
  state=await learnDawnCrit(page,state);eq(state.enemy.turns,2,'learning does not restart or advance the fight');check(!Object.hasOwn(state.enemy,'firstCritUsed'),'learning preserves the absent legacy availability flag');await opportunity(page,state);
  for(let turn=0;turn<100;turn++){
   const expected=E.transition(state,{type:'roll'});
   state=expected.lastRoll.critical?await observeRoll(page,state):await commit(page,state,{type:'roll'});
   if(state.lastRoll.critical)break;
  }
  check(state.lastRoll.critical,'a later eligible critical was manually reached');eq(state.enemy.turns,9,'fixed fixture reaches its first eligible critical on roll nine','harness');
  eq(state.enemy.firstCritUsed,true,'the eligible critical consumes the once-per-fight opportunity');eq(state.nextLuck,5,'the first learned rank grants five raw luck');
  await inClip(page,'[data-boon-key="firstCritLuck"]','spent opportunity screenshot target');await screenshot(page,'critical-used-and-earned-luck');
  await refresh(page,state,'earned critical-luck refresh');await opportunity(page,state);
  const priorLuck=E.stats(state).luck;state=await observeRoll(page,state);
  eq(state.lastRoll.luck,priorLuck,'the next actual combat roll uses the previously earned luck');eq(state.nextLuck,0,'the next roll consumes earned luck');eq(state.enemy.firstCritUsed,true,'consuming luck does not restore the spent opportunity');await opportunity(page,state);
  state=await learnDawnCrit(page,state);eq(E.stats(state).firstCritLuck,10,'later rank raises only future eligible grants');eq(state.nextLuck,0,'a later upgrade does not grant fresh luck');eq(state.enemy.firstCritUsed,true,'upgrading does not restore current-fight availability');await opportunity(page,state);
  await nativeDisclosure(page,state,'#boon-details-toggle','trigger lifetime rules');await refresh(page,state,'upgraded-but-spent refresh');await opportunity(page,state);
 });
 await run('critical-lethal-animation-and-retry-reset',async page=>{
  let state=firstCritical(E.transition(scene(),{type:'talent',id:'dawnCrit'})).before;
  state.player.hp=1;state.ward=0;state.enemy.attack=1e12;
  const expected=E.transition(state,{type:'roll'});check(expected.lastRoll.critical&&expected.phase==='dead','constructed eligible critical is followed by a real lethal retaliation','harness');
  await load(page,state);await opportunity(page,state);state=await observeRoll(page,state);
  eq(state.nextLuck,5,'a lethal critical still follows the unchanged grant-before-death engine order');eq(state.enemy.firstCritUsed,true,'the lethal critical commits the consumed opportunity');
  eq(await page.locator('[data-boon-key="firstCritLuck"]').count(),0,'dead screen and impact omit live-fight availability');
  check((await page.locator('[data-boon-key="nextLuck"]').innerText()).includes('重燃时清除'),'earned luck in death explicitly says retry clears it');
  await refresh(page,state,'lethal critical save refresh');state=await commit(page,state,{type:'retry'});
  eq(state.enemy.turns,0,'retry resets the existing enemy turn counter');eq(state.enemy.firstCritUsed,false,'retry restores the explicit unused flag');eq(state.nextLuck,0,'retry clears earned luck');eq(state.enemy.openingEcho,0,'retry does not restore a consumed echo');await opportunity(page,state);
  await refresh(page,state,'retry reset refresh');await opportunity(page,state);
 });
 await run('critical-kill-chest-and-next-enemy-carry',async page=>{
  let state=E.transition(scene('duel'),{type:'talent',id:'dawnCrit'});state.route[0].waves=2;state.route[0].wave=1;state.route[0].waveType='elite';
  state=firstCritical(state).before;state.enemy.hp=1;state.enemy.shield=0;
  const expected=E.transition(state,{type:'roll'});check(expected.lastRoll.critical&&expected.phase==='chest','constructed eligible critical really kills the first wave','harness');
  await load(page,state);await opportunity(page,state);state=await observeRoll(page,state);
  eq(state.nextLuck,5,'critical kill carries earned luck into the pending chest');eq(await page.locator('[data-boon-key="firstCritLuck"]').count(),0,'a defeated enemy has no active opportunity');
  await refresh(page,state,'critical pending-chest refresh');const pending=structuredClone(state.chest);state=await commit(page,state,{type:'open'});
  eq(state.loot,pending,'opening keeps exact pending item, source and gold');eq(state.nextLuck,5,'opening does not consume carried luck');await opportunity(page,state);
  state=await commit(page,state,{type:'next'});eq(state.phase,'combat','manual continuation starts the second existing wave');eq(state.route[0].wave,2,'wave progress follows the unchanged engine');eq(state.nextLuck,5,'the next enemy retains prior earned luck');check(!state.enemy.firstCritUsed,'the next enemy has its own unused opportunity');await opportunity(page,state);
  await refresh(page,state,'new-enemy carried-luck refresh');await opportunity(page,state);
  const luck=E.stats(state).luck;state=await observeRoll(page,state);eq(state.lastRoll.luck,luck,'the new enemy first roll uses carried luck');eq(state.nextLuck,state.lastRoll.critical?5:0,'the carried amount is consumed and only a newly eligible critical can grant again');
 });
 const viewports=[[1366,768],[1920,1080],[2560,1440],[3840,2160],[1099,900],[390,844],[320,740]];
 for(const [width,height]of viewports)for(const value of [.9,1,1.1])await run(`dense-${width}x${height}-scale-${value}`,async page=>{
  const state=dense();await load(page,state);await scale(page,state,value);await guide(page,state);await opportunity(page,state);await geometry(page,'initial dense render');
  const capture=(width===1366&&value===1)||(width===390&&value===1)||(width===320&&value===1.1);
  if(capture&&width<400){await page.locator('[data-tactic="bandit"]').scrollIntoViewIfNeeded();await screenshot(page,`dense-${width}-scale-${value}-combat-viewport`);}
  await inClip(page,'[data-boon-key="firstCritLuck"]','unused opportunity');
  eq(await page.locator('[data-boon-key="firstCritLuck"] strong').evaluate(node=>getComputedStyle(node).color),'rgb(209, 217, 222)','product opportunity uses muted blue-gray');
  eq(await page.locator('[data-boon-key="nextLuck"] strong').evaluate(node=>getComputedStyle(node).color),'rgb(230, 199, 125)','already-earned luck retains the existing gold');
  await nativeDisclosure(page,state,'.combat-rules > summary','encounter rules');
  await nativeDisclosure(page,state,'#boon-details-toggle','boon lifetime rules',capture?async()=>{
   await inClip(page,'[data-boon-key="firstCritLuck"]','expanded rules opportunity screenshot target');
   await screenshot(page,`dense-${width}-scale-${value}-opportunity-viewport`);
  }:undefined);
  await geometry(page,'after keyboard disclosure toggles');await inClip(page,'#primary-action','manual roll control');check(await page.locator('#primary-action').isEnabled(),'manual roll control remains enabled');
  eq(await saved(page),state,'layout, scrolling and keyboard disclosures preserve all state');
 },{viewport:{width,height}});
}catch(error){
 report.errors.push({case:currentCase||'bootstrap',classification:error.qaCategory||'harness',stage,error:String(error),stack:error.stack});
}finally{
 report.sourceAfter=await identity();report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.finished=new Date().toISOString();
 report.passed=report.cases.filter(row=>row.status==='PASS').length;report.failed=report.cases.filter(row=>row.status==='FAIL').length;
 if(!report.cases.length&&!report.errors.length)report.errors.push({classification:'harness',error:'No cases matched the requested --case filter.'});
 report.verdict=report.failed||report.errors.length?'FAIL':report.sourceUnchanged?'PASS':'INCOMPLETE_SOURCE_CHANGED';
 await persist();if(browser)await browser.close();
}
console.log(JSON.stringify({verdict:report.verdict,passed:report.passed,failed:report.failed,checks,manualTransitionsVerified:report.manualTransitionsVerified,errors:report.errors.length,sourceUnchanged:report.sourceUnchanged,report:path.join(output,'report.json')}));
if(report.failed||report.errors.length)process.exitCode=1;else if(!report.sourceUnchanged)process.exitCode=2;
