// Bounded final acceptance: isolated synthetic saves, external artifacts only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {coreFontProof} from './core-font-proof.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
assert(args.output&&args.current&&(args.baseline||args['pace-only']));
const output=path.resolve(args.output);await fs.mkdir(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={status:'RUNNING',environment:{browser:browser.version(),backend:'ANGLE SwiftShader',viewport:'1920x1080 DPR1; 3840x2160 simulated',network:'loopback identity; no throttling',synthetic:true},cold:[],pace:[],lifecycle:[],errors:[]};
const sha=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
const b=(p,a)=>p.locator(`[data-action="${a}"]`);
const saved=p=>p.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY).then(S.decodeSave);
const idle=p=>p.locator('#primary-action:not(:disabled)').waitFor();
const shot=(p,name)=>p.screenshot({path:path.join(output,name+'.png')});
async function context(options={}){const c=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,...options});c.on('page',p=>{p.on('pageerror',e=>report.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});});return c;}
async function load(p,state,pace=false,effects='full'){await p.goto(args.current);await p.evaluate(({raw,pace,effects})=>{localStorage.setItem('dice-abyss:save:v1',raw);localStorage.setItem('dice-abyss:mirror:v1',raw);localStorage.setItem('dice-abyss:settings:v1',JSON.stringify({sound:false,effects,scale:1,fastPace:pace}));},{raw:S.encodeSave(state),pace,effects});await p.reload();await b(p,'continue').click();await idle(p);}
async function step(p,state,action,control=p.locator('#primary-action')){
 const expected=E.transition(state,action);assert.notEqual(expected,state);
 const start=performance.now();await control.click();await p.waitForFunction(({key,r})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===r,{key:S.SAVE_KEY,r:expected.revision});await idle(p);
 const ms=performance.now()-start;assert.deepEqual(await saved(p),expected);assert.deepEqual(S.decodeSave(await p.evaluate(k=>localStorage.getItem(k),S.BACKUP_KEY)),expected);return{state:expected,ms};
}
// Browser-only observer: actual busy intervals and finite CSS finish events.
function paceProbe(){
 const report=window.__paceProbe={waits:[],shortTimers:[],animations:[]},seen=new WeakSet();let start=null;
 const timeout=window.setTimeout;
 window.setTimeout=function(fn,ms,...rest){
  if(ms<200&&new Error().stack.includes('waitAnimation'))report.shortTimers.push(ms);
  return timeout.call(this,fn,ms,...rest);
 };
 document.addEventListener('click',e=>{if(e.target.closest?.('#primary-action')&&!e.target.closest('#primary-action').disabled)start=performance.now();},true);
 const observe=()=>{
  const room=document.querySelector('#current-room');
  if(room?.classList.contains('busy')){
   for(const animation of room.getAnimations({subtree:true})){
    if(seen.has(animation))continue;seen.add(animation);const t=animation.effect.getComputedTiming(),authored=animation.effect.getTiming();
    const row={name:animation.animationName||animation.transitionProperty,end:t.endTime,delay:authored.delay,rate:animation.playbackRate,finished:false};report.animations.push(row);
    requestAnimationFrame(()=>{row.rate=animation.playbackRate;});animation.addEventListener('finish',()=>{row.finished=true;row.rate=animation.playbackRate;});
   }
  }else if(start!==null){report.waits.push(performance.now()-start);start=null;}
 };
 new MutationObserver(observe).observe(document,{subtree:true,childList:true,attributes:true});
}
try{
 if(!args['pace-only'])for(let repeat=0;repeat<3;repeat++)for(const label of ['baseline','current']){
  const c=await context();await c.addInitScript(()=>{const probe=()=>{const e=document.querySelector('[data-action="new"]');if(e&&!e.disabled&&e.getBoundingClientRect().width)window.__ready=performance.now();else requestAnimationFrame(probe);};requestAnimationFrame(probe);});
  const p=await c.newPage();await p.goto(args[label]);await b(p,'new').waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0);
  const row=await p.evaluate(()=>{const r=performance.getEntriesByType('resource'),n=performance.getEntriesByType('navigation')[0];return{fontBytes:r.filter(x=>/woff2/.test(x.name)).reduce((a,x)=>a+x.transferSize,0),totalBytes:n.transferSize+r.reduce((a,x)=>a+x.transferSize,0),fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,usable:window.__ready,fonts:r.filter(x=>/woff2/.test(x.name)).map(x=>x.name)};});
  await b(p,'settings').click();await p.locator('dialog[open]').waitFor();row.interactionConfirmed=await p.evaluate(()=>performance.now());await b(p,'close-dialog').click();
  report.cold.push({label,repeat,...row});if(label==='current'){assert(!row.fonts.some(x=>/SourceHan|fusion-pixel/.test(x)));assert((await p.evaluate(coreFontProof)).ok);}
  if(repeat===0)await shot(p,label+'-title');
  if(label==='current'&&repeat===0){
   await p.evaluate(()=>{for(const [id,font,text] of [['pixel','Abyss Pixel','丂'],['text','Abyss Text','丂'],['system','Abyss Text','🦄']]){const e=document.createElement('p');e.id='probe-'+id;e.textContent=text;e.style.fontFamily=`'${font}','${font} Full',sans-serif`;document.body.append(e);}});await p.evaluate(()=>document.fonts.ready);
   const cdp=await c.newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');report.fallback={};
   for(const id of ['pixel','text','system']){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#probe-'+id});const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});report.fallback[id]=fonts;assert(fonts.some(f=>f.glyphCount&&(id==='system'?!f.isCustomFont:f.isCustomFont&&/Source Han|Fusion Pixel/.test(f.familyName))));}
  }
  await c.close();
 }
 if(!args['cold-only']){
 // Same ordinary seed and route in all three runs; no changes during playback.
 const initial=E.newGame(913);initial.runId='final-v527-route';
 for(const label of (args['pace-only']?['standard','fast','low-standard','low-fast']:['baseline-standard','standard','fast'])){
  const c=await context(args['pace-only']?{}:{recordVideo:{dir:path.join(output,'video'),size:{width:960,height:540}}});
  await c.addInitScript(paceProbe);const p=await c.newPage();
  if(label==='baseline-standard'){
   await p.goto(args.baseline);await p.evaluate(raw=>{localStorage.setItem('dice-abyss:save:v1',raw);localStorage.setItem('dice-abyss:mirror:v1',raw);},S.encodeSave(initial));await p.reload();await b(p,'continue').click();await idle(p);
  }else await load(p,initial,label.endsWith('fast'),label.startsWith('low-')?'low':'full');
  let state=initial;const row={label,nodes:[],totalMs:0};report.pace.push(row);
  for(let i=0;i<18;i++){
   const type=await p.locator('#primary-action').getAttribute('data-action');
   assert(['fate','enter','roll','open','next','gold','descend','rest','retry'].includes(type),`Unexpected route action ${type}`);
   const result=await step(p,state,{type});state=result.state;row.nodes.push({type,ms:result.ms,phase:state.phase,hash:sha(state)});row.totalMs+=result.ms;
   if(['roll','open'].includes(type)&&row.nodes.filter(n=>n.type===type).length===1)await shot(p,`${label}-${type}`);
  }
  row.probe=await p.evaluate(()=>window.__paceProbe);row.finalHash=sha(state);await p.reload();await b(p,'continue').click();assert.deepEqual(await saved(p),state);
  if(label==='fast'){
   await b(p,'settings').click();assert.equal(await b(p,'fast-pace').getAttribute('aria-checked'),'true');assert.equal(await p.locator('#effects').inputValue(),'full');await shot(p,'fast-settings');
   await b(p,'fast-pace').click();assert.equal(await b(p,'fast-pace').getAttribute('aria-checked'),'false');await b(p,'fast-pace').click();await b(p,'close-dialog').click();assert.deepEqual(await saved(p),state);
   await p.setViewportSize({width:3840,height:2160});await shot(p,'fast-4k');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  const video=p.video();await c.close();if(video)await video.saveAs(path.join(output,label+'.webm'));
 }
 const standard=report.pace.find(x=>x.label==='standard'),fast=report.pace.find(x=>x.label==='fast');
 assert.deepEqual(standard.nodes.map(x=>x.hash),fast.nodes.map(x=>x.hash));assert.deepEqual(report.pace[0].nodes.map(x=>x.hash),standard.nodes.map(x=>x.hash));
 report.waitReduction=1-fast.totalMs/standard.totalMs;assert(report.waitReduction>=.4);
 if(args['pace-only']){
  for(const row of report.pace)assert.deepEqual(row.nodes.map(x=>x.hash),standard.nodes.map(x=>x.hash));
  const low=report.pace.find(x=>x.label==='low-standard'),lowFast=report.pace.find(x=>x.label==='low-fast');
  const busy=row=>row.probe.waits.reduce((a,x)=>a+x,0);
  report.lowWaitReduction=1-busy(lowFast)/busy(low);
  assert(low.probe.shortTimers.length>0);
  assert.deepEqual(lowFast.probe.shortTimers,low.probe.shortTimers.map(ms=>ms/2));
  assert(busy(lowFast)<busy(low));
  const css=fast.probe.animations.filter(x=>Number.isFinite(x.end)&&x.end>0);
  assert(css.some(x=>x.name==='reward-rise'));assert(css.some(x=>x.delay>0));
  assert(css.every(x=>x.rate===2&&x.finished),JSON.stringify(css.filter(x=>x.rate!==2||!x.finished)));
 }
 for(const mode of ['skip','resize','hidden','reload','double-click','settings']){
  const c=await context(),p=await c.newPage();await load(p,initial,true);
  if(mode==='double-click')await p.locator('#primary-action').dblclick();else await p.locator('#primary-action').click();
  await p.waitForFunction(k=>JSON.parse(JSON.parse(localStorage.getItem(k)).payload).revision>0,S.SAVE_KEY);
  if(mode==='skip')await b(p,'skip').click();
  if(mode==='resize')await p.setViewportSize({width:1600,height:900});
  if(mode==='hidden')await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  if(mode==='reload'){await p.reload();await b(p,'continue').click();}
  if(mode==='settings'){await b(p,'settings').click();await b(p,'fast-pace').click();await b(p,'close-dialog').click();}
  await idle(p);assert.deepEqual(await saved(p),E.transition(initial,{type:'fate'}));
  report.lifecycle.push({mode,status:'PASS',visibility:mode==='hidden'?'synthetic visibility event':'native browser interaction'});await c.close();
 }
 {
  const c=await context(),p=await c.newPage();let rare=E.transition(E.newGame(913),{type:'fate'});rare.route[0].type='combat';rare=E.transition(rare,{type:'enter'});rare.enemy.hp=1;rare.enemy.shield=0;rare=E.transition(rare,{type:'roll'});rare.chest.item=E.makeItem(rare,'weapon',7);
  assert(S.validateSave(rare));await load(p,rare,true);const result=await step(p,rare,{type:'open'});await p.waitForTimeout(1200);assert(await p.locator('.loot-screen').isVisible());assert.deepEqual(await saved(p),result.state);await shot(p,'fast-eternal-reward');report.rareReward={status:'PASS',ms:result.ms,persistsUntilNextAction:true};await c.close();
 }
 // Normal inventory, complete authoritative gold/items comparison after every commit.
 const c=await context({reducedMotion:'reduce'}),p=await c.newPage();let state=E.newGame(527);state.runId='final-inventory';
 while(state.player.items.length<300)state.player.items.push(E.makeItem(state,'weapon',state.nextId%4));
 await load(p,state,true);await p.locator('.main-nav [data-action="inventory"]').click();
 await p.locator('[data-action="filter"][data-slot="weapon"]').click();await p.locator('[data-action="inventory-page"][data-page="1"]').click();assert.equal(await p.locator('.inventory-list .item-card').count(),60);
 await p.locator('[data-action="filter"][data-slot=""]').click();
 let control=p.locator('.inventory-list [data-action="equip"]:not(:disabled)').first(),id=await control.getAttribute('data-id');await control.click();state=E.transition(state,{type:'equip',id});await p.waitForTimeout(100);assert.deepEqual(await saved(p),state);
 control=p.locator('.inventory-list [data-action="salvage-item"]').first();id=await control.getAttribute('data-id');const item=state.player.items.find(x=>x.id===id);await control.click();await b(p,'confirm').click();state=E.transition(state,{type:'salvage',ids:[id],allowProtected:item.rarity>=3,allowOverflow:false});await p.waitForTimeout(100);assert.deepEqual(await saved(p),state);
 const preview=E.salvagePreview(state,undefined,false,true);assert(preview);await b(p,'salvage-preview').click();await b(p,'confirm').click();state=E.transition(state,{type:'salvage',ids:preview.items.map(x=>x.id),allowProtected:false,allowOverflow:!!preview.overflow});await p.waitForTimeout(100);assert.deepEqual(await saved(p),state);await shot(p,'inventory-300');
 await p.reload();await b(p,'continue').click();assert.deepEqual(await saved(p),state);report.inventory={status:'PASS',initialItems:300,finalItems:state.player.items.length,gold:state.player.gold};await c.close();
 }
 assert.equal(report.errors.length,0);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=String(e);report.stack=e.stack;process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({status:report.status,waitReduction:report.waitReduction,failure:report.failure}));
