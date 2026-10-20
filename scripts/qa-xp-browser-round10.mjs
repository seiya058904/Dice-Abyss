// Round10 native XP truth, confirmation and HUD regression. External QA only.
// Supply PLAYWRIGHT_MODULE and CHROMIUM_PATH; the game has no dependencies.
// --source /path/to/game --url http://127.0.0.1:4188/ --output /tmp/fresh-qa
// --expect baseline records known old feedback; current checks the repaired UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const {values:a}=parseArgs({options:{source:{type:'string'},url:{type:'string'},output:{type:'string'},expect:{type:'string',default:'current'},cases:{type:'string'}}});
assert(a.url&&a.output,'Explicit loopback URL and fresh output directory required');
assert(['current','baseline'].includes(a.expect));
const root=path.resolve(a.source||fileURLToPath(new URL('../',import.meta.url))),out=path.resolve(a.output),url=new URL(a.url).href,baseline=a.expect==='baseline';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));
const relative=path.relative(root,out);assert(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative),'Keep generated evidence outside source');
await fs.mkdir(out,{recursive:true});await assert.rejects(fs.access(path.join(out,'report.json')),'Use fresh output; never overwrite failed evidence');
const [E,S,C]=await Promise.all(['engine','storage','encounters'].map(f=>import(pathToFileURL(path.join(root,'src',f+'.js')))));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const sourceFiles=['index.html','package.json',...(await fs.readdir(root+'/src')).filter(x=>/\.(js|css)$/.test(x)).map(x=>'src/'+x)];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async x=>[x,hash(await fs.readFile(path.join(root,x)))])));
const report={started:new Date().toISOString(),source:root,url,expectation:a.expect,sourceBefore:await sourceHashes(),scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),cases:[],errors:[],warnings:[],screenshots:[],notes:[
 'Chrome extension and CUA could not reach the isolated loopback server. The user taskbook permits this local Chromium/Playwright fallback.',
 'Legal synthetic boundary saves; room entry and all tested actions use each selected version\'s own engine. Not natural reached level/XP caps or human play.',
 'Native click/keyboard/confirmation/reload with exact full-state and primary/mirror comparisons. Storage failures are labeled injections; no gameplay or DOM handlers are replaced.',
 'Low effects and reduced motion for functionality/layout. Four simulated desktop viewports, not physical 4K/GPU or a screen-reader certification.',
 'Counters are individual assertions and scenario groups, not independent players. Baseline observations are not repaired-behavior passes.'
]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
const selected=new Set((a.cases||'').split(',').filter(Boolean)),keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY},exact=x=>Number(x).toLocaleString('en-US');
let row;
const check=(ok,label,detail)=>{row.checks.push({label,passed:!!ok,...(detail===undefined?{}:{detail})});assert(ok,label);};
const eq=(actual,expected,label)=>{const record={label,passed:false,actualSha256:hash(actual),expectedSha256:hash(expected)};row.checks.push(record);assert.deepEqual(actual,expected,label);record.passed=true;};
const disk=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const idle=p=>p.waitForFunction(()=>document.querySelector('.game-shell')&&!document.querySelector('#primary-action')?.disabled&&!document.querySelector('#current-room')?.classList.contains('busy'));
const waitSave=async(p,s)=>{await p.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key:keys.main,raw:S.encodeSave(s)});await idle(p);};
function fixture(key,{level=1e6,xp=1e8,gold=1e10,talentPoints=0}={}){
 let s=E.newGame(3);s.runId=`round10-native-${key}-${level}-${xp}-${talentPoints}`;s.floor=140;s.player.level=level;s.player.xp=xp;s.player.gold=gold;s.player.talentPoints=talentPoints;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=[key==='memory_archive'?'mystery':key,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';s=E.transition(s,{type:'enter'});assert.equal(s.event.key,key);assert(S.validateSave(s));return s;
}
function quote(s){const id=s.event.key==='memory_archive'?'accept':'study',choice=C.eventChoices(s).find(o=>o.id===id),raw=s.event.key==='memory_archive'?Math.min(1e6,40+s.player.level*5):Math.min(1e6,100+s.player.level*10);return {id,choice,raw,credit:Math.min(raw,1e8-s.player.xp)};}
async function install(p,s){
 assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);await p.goto(url);
 await p.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({effects:'low',sound:false,scale:1}));localStorage.setItem('qa:round10','unrelated sentinel');},{raw:S.encodeSave(s),keys});
 await p.reload();await p.evaluate(()=>document.fonts.ready);await p.locator('[data-action="continue"]').click();await idle(p);
}
async function durable(p,s,label){const d=await disk(p);eq(S.decodeSave(d[keys.main]),s,label+': full state');eq(d[keys.main],S.encodeSave(s),label+': primary bytes');eq(d[keys.mirror],d[keys.main],label+': mirror bytes');eq(d['qa:round10'],'unrelated sentinel',label+': unrelated data');}
async function shot(p,label){const name=label+'.png';await p.screenshot({path:path.join(out,name)});report.screenshots.push(name);row.screenshots.push(name);}
async function openChoice(p,id){await p.locator(`.event-options [data-action="event-choice"][data-id="${id}"]`).click();await p.locator('dialog[open]').waitFor();}
async function preview(p,q,scope=''){
 const el=p.locator(scope+' [data-experience-preview]');eq(await el.count(),1,'one contextual XP quote');
 for(const [key,value] of [['raw',q.raw],['credited',q.credit],['overflow',q.raw-q.credit]])eq((await el.locator(`[data-experience-row="${key}"] dd`).innerText()).trim(),exact(value),'exact '+key+' experience');
 const text=await el.innerText();check(q.credit||text.includes('本次计入为 0'),'zero credit is explicit');
 if(q.raw>q.credit)check(text.includes('不会保留')&&text.includes('升级后补回'),'discarded XP cannot be silently recovered after upgrade');
}
async function run(name,fn){
 if(selected.size&&!selected.has(name))return;
 row={name,status:'RUNNING',checks:[],knownDefects:[],screenshots:[]};report.cases.push(row);
 const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(18000);
 await context.route('**/*',r=>r.request().url().startsWith(new URL(url).origin+'/')?r.continue():r.abort());
 p.on('pageerror',e=>report.errors.push({case:name,error:e.message}));p.on('console',e=>{if(e.type()==='error')report.errors.push({case:name,error:e.text()});else if(e.type()==='warning')report.warnings.push({case:name,warning:e.text()});});
 try{await fn(p,context);row.status=row.knownDefects.length?'REPRODUCED':'PASS';}
 catch(e){row.status='FAIL';row.error=e.stack;await shot(p,'FAIL-'+name).catch(()=>{});row.failureText=await p.locator('body').innerText().catch(()=>null);}
 finally{await context.close();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(name+': '+row.status+' ('+row.checks.length+' checks)');}
}
try{
 await run('page-identity',async(p,context)=>{
  await p.goto(url);check((await p.title()).includes('Dice Abyss')&&p.url()===url,'exact title and URL');check((await p.locator('#app').innerText()).length>30,'not blank');eq(await p.locator('vite-error-overlay,nextjs-portal,[data-webpack-error]').count(),0,'no framework overlay');
  const served={};for(const f of sourceFiles.filter(f=>f!=='package.json')){const r=await context.request.get(new URL(f,url).href);check(r.ok(),f+' served');served[f]=hash(await r.body());}
  eq(served,Object.fromEntries(Object.keys(served).map(f=>[f,report.sourceBefore[f]])),'served source exact');
  check(await p.evaluate(()=>!!navigator.locks),'native Web Locks');
  const fonts=await p.evaluate(async()=>{await Promise.all(['Abyss Pixel','Abyss Text'].map(name=>document.fonts.load(`16px "${name}"`,'经验上限零')));await document.fonts.ready;return [...document.fonts].map(f=>({family:f.family.replace(/["']/g,''),status:f.status}));});
  check(['Abyss Pixel','Abyss Text'].every(name=>fonts.some(f=>f.family===name&&f.status==='loaded')),'both bundled font faces really loaded',fonts);
 });
 for(const key of ['memory_archive','starlibrary'])await run(key+'-credit-and-confirm',async p=>{
  for(const [kind,opts]of [['full',{level:100,xp:E.xpNeeded(100)-1}],['partial',{xp:1e8-10}],['zero',{}]]){
   const s=fixture(key,opts),q=quote(s);await install(p,s);const before=await disk(p);
   if(!baseline)await preview(p,q,'.event-screen');
   await openChoice(p,q.id);const text=await p.locator('dialog').innerText();
   if(baseline&&q.credit<q.raw){check(!text.includes('经验计入 0')&&!text.includes('上限未计入'),'old review omits capacity loss');row.knownDefects.push({kind,key,raw:q.raw,actualCredit:q.credit,confirmation:text});}
   if(!baseline){await preview(p,q,'dialog');check(await p.locator('dialog [data-action="confirm"]').innerText()===(q.credit?'支付并研读':'仍支付并研读'),'concrete payment action label');}
   await p.keyboard.press('Escape');await p.locator('dialog').waitFor({state:'hidden'});eq(await disk(p),before,'Escape cancels without writes');
   await openChoice(p,q.id);if(!baseline&&kind==='zero')await shot(p,key+'-zero-confirm');
   await p.locator('dialog .dialog-buttons [data-action="close-dialog"]').click();eq(await disk(p),before,'cancel button leaves all saved bytes unchanged');
   await openChoice(p,q.id);const after=E.transition(s,{type:'event-choice',id:q.id,confirmed:true});
   await p.locator('dialog [data-action="confirm"]').dblclick();await waitSave(p,after);await durable(p,after,'native payment');
   const outcome=await p.locator('.event-outcome').innerText();check(outcome.includes(after.event.outcome),'committed outcome visible');
   if(!baseline&&q.credit<q.raw)check(outcome.includes('计入 '+q.credit)&&outcome.includes('未计入 '+(q.raw-q.credit)),'actual credited/discarded XP stated in result');
   check(s.player.gold>after.player.gold,'registered fee still charged');
   if(kind==='full'){check(after.player.level>s.player.level,'normal payment upgrades');check(after.player.xp<s.player.xp+q.credit,'XP is spent on upgrade, not mistaken for negative credit');}
   await p.reload();await p.locator('[data-action="continue"]').click();await idle(p);await durable(p,after,'reload result');check((await p.locator('.event-outcome').innerText()).includes(after.event.outcome),'result survives refresh');
   if(kind==='partial')await shot(p,key+'-partial-result');
  }
 });
 await run('hud-boundaries',async p=>{
  for(const [label,opts]of [['normal',{level:100,xp:400}],['pending',{level:100,xp:1e8}],['capped-balance',{level:1e6,xp:123}],['capped-full',{}]]){
   const s=fixture('memory_archive',opts);await install(p,s);const before=await disk(p);
   const hud=await p.locator('.player-level').evaluate(el=>({text:el.innerText,title:el.title,width:parseFloat(el.querySelector('.xp-track>span').style.width),value:el.querySelector('.xp-track').getAttribute('aria-valuenow'),maximum:el.querySelector('.xp-track').getAttribute('aria-valuemax'),label:el.querySelector('.xp-track').getAttribute('aria-label'),detail:el.querySelector('.xp-track').getAttribute('aria-valuetext')}));row.hud??=[];row.hud.push({label,...hud});
   if(baseline&&(label==='pending'||label==='capped-full')){check(hud.width>100,'old legal imported XP exceeds 100% width');row.knownDefects.push({label,width:hud.width,text:hud.text});}
   if(!baseline){check(hud.width>=0&&hud.width<=100,'track is bounded 0..100');check(Number(hud.value)<=Number(hud.maximum),'semantic value bounded');check(hud.detail?.length>15,'meaningful accessible XP description');if(label.startsWith('capped'))check(hud.text.includes('等级上限')&&hud.label==='经验余额容量'&&hud.maximum==='100000000','capped HUD means capacity, not a next level');if(label==='pending')check(hud.text.includes('待结算升级'),'pending imported XP is honest');}
   eq(await disk(p),before,'HUD rendering never mutates/import-normalizes save');
  }
 });
 if(!baseline){
  await run('exchange-long-name-double-cap',async(p,context)=>{
   // A legal synthetic 64-character saved name stresses the newly shared quote
   // inside an exchange dialog; the spare is registered by real room entry.
   let s=E.newGame(3);s.runId='round10-exchange-long-name-double-cap';s.floor=140;
   Object.assign(s.player,{level:1e6,xp:1e8,gold:1e10});s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
   const spare=E.makeItem(s,'weapon',1);spare.name='回响星海藏书深渊旧梦旅人远行余烬'.repeat(4);s.player.items.push(spare);
   s.route=['exchange','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';
   check(spare.name.length===64,'reserved equipment name is exactly 64 legal characters');check(S.validateSave(s),'long-name pre-entry save validates');
   s=E.transition(s,{type:'enter'});check(S.validateSave(s),'real exchange entry validates');eq(s.event.offerId,spare.id,'entry reserves the exact long-name spare');
   await fs.writeFile(out+'/exchange-long-name-double-cap.save.json',S.encodeSave(s)+'\n');
   await install(p,s);const before=await disk(p),choice=C.eventChoices(s).find(o=>o.id==='salvage');
   check(!choice.disabled,'dual-cap exchange remains available under original rules');check((await p.title()).includes('Dice Abyss')&&p.url()===url,'exchange page identity');
   check((await p.locator('#app').innerText()).length>30,'exchange page is not blank');eq(await p.locator('vite-error-overlay,nextjs-portal,[data-webpack-error]').count(),0,'exchange has no framework error overlay');
   for(const f of ['src/app.js','src/views.js','src/experience.css','src/experience.js']){const response=await context.request.get(new URL(f,url).href);check(response.ok(),f+' served for exchange');eq(hash(await response.body()),report.sourceBefore[f],f+' matches frozen source');}
   const geometry=()=>p.locator('dialog').evaluate(el=>{
    const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const cancel=el.querySelector('.dialog-buttons [data-action="close-dialog"]'),confirm=el.querySelector('[data-action="confirm"]');
    const hit=node=>{const r=node.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')?.isSameNode(node);};
    return {viewport:{width:innerWidth,height:innerHeight},dialog:box(el),scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,cancel:box(cancel),confirm:box(confirm),cancelHit:hit(cancel),confirmHit:hit(confirm)};
   });
   const verifyActions=g=>{
    check(g.dialog.x>=0&&g.dialog.right<=g.viewport.width&&g.dialog.y>=0&&g.dialog.bottom<=g.viewport.height,'long exchange dialog stays inside 1366×768');
    check(g.scrollWidth<=g.clientWidth+1,'long exchange content has no horizontal scroll overflow');
    for(const name of ['cancel','confirm']){const b=g[name];check(b.x>=g.dialog.x&&b.right<=g.dialog.right&&b.y>=g.dialog.y&&b.bottom<=g.dialog.bottom,name+' is fully reachable inside scrolled dialog');check(g[name+'Hit'],name+' receives a native pointer hit');}
    const overlap=Math.min(g.cancel.right,g.confirm.right)-Math.max(g.cancel.x,g.confirm.x)>0&&Math.min(g.cancel.bottom,g.confirm.bottom)-Math.max(g.cancel.y,g.confirm.y)>0;
    check(!overlap,'cancel and confirm buttons do not overlap');
   };
   await openChoice(p,'salvage');await preview(p,{raw:1e6,credit:0},'dialog');
   const dialogText=await p.locator('dialog').innerText();check(dialogText.includes(spare.name),'review retains the complete reserved name');check(dialogText.includes('两项入账均为 0')&&dialogText.includes('仍会永久消耗'),'dual-zero exchange states its permanent item cost');
   const initial=await geometry();await shot(p,'exchange-long-name-confirm-top-1366');
   await p.locator('dialog .dialog-buttons [data-action="close-dialog"]').scrollIntoViewIfNeeded();
   await p.locator('dialog [data-action="confirm"]').scrollIntoViewIfNeeded();const scrolled=await geometry();verifyActions(scrolled);
   if(initial.scrollHeight>initial.clientHeight+1)check(scrolled.scrollTop>initial.scrollTop,'native scrolling reaches initially clipped action row');
   row.layout={initial,scrolled};await shot(p,'exchange-long-name-confirm-actions-1366');
   await p.locator('dialog .dialog-buttons [data-action="close-dialog"]').click();await p.locator('dialog').waitFor({state:'hidden'});
   eq(await disk(p),before,'cancel preserves every storage key and exact byte');await durable(p,s,'cancel preserves all equipment, gold, XP and RNG');
   await openChoice(p,'salvage');await p.locator('dialog [data-action="confirm"]').scrollIntoViewIfNeeded();verifyActions(await geometry());
   const after=E.transition(s,{type:'event-choice',id:'salvage',confirmed:true});
   await p.locator('dialog [data-action="confirm"]').dblclick();await waitSave(p,after);await durable(p,after,'rapid native confirmation commits exactly one exchange');
   eq(after.player.gold,s.player.gold,'dual-zero exchange credits no gold');eq(after.player.xp,s.player.xp,'dual-zero exchange credits no XP');
   eq(after.player.items.map(i=>i.id),s.player.items.filter(i=>i.id!==spare.id).map(i=>i.id),'one reserved item is removed and every other item remains');
   eq(after.player.equipped,s.player.equipped,'equipped slots remain intact');eq(after.rng,s.rng,'exchange does not advance RNG');
   check((await p.locator('.event-outcome').innerText()).includes(after.event.outcome),'one committed exchange result is visible');
   await shot(p,'exchange-long-name-result-1366');await p.reload();await p.locator('[data-action="continue"]').click();await idle(p);await durable(p,after,'reload preserves the single exchange');
   await fs.writeFile(out+'/exchange-transaction-proof.json',JSON.stringify({method:'Synthetic valid initial state; native cancel, double-click confirmation and reload; selected engine computes one exact expected transaction.',before:s,after,nativeStorage:await disk(p)},null,2)+'\n');
  });
  await run('point-credit-upgrade',async p=>{
   for(const points of [1999998,1999999,2000000]){const s=fixture('memory_archive',{level:100,xp:E.xpNeeded(100)-1,talentPoints:points}),q=quote(s);await install(p,s);await openChoice(p,q.id);await p.locator('dialog [data-action="confirm"]').click();const after=E.transition(s,{type:'event-choice',id:q.id,confirmed:true});await waitSave(p,after);await durable(p,after,'talent capacity');const credit=after.player.talentPoints-points;check(after.log.some(l=>l.text.includes('天赋点')&&l.text.includes(String(credit))),'log shows actual '+credit+' talent points');row.results??=[];row.results.push({points,credited:credit,log:after.log});}
  });
  await run('learning-primary-write-failure',async p=>{
   const s=fixture('starlibrary',{xp:1e8-10}),q=quote(s);await install(p,s);const before=await disk(p);await openChoice(p,q.id);
   await p.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key){Storage.prototype.setItem=original;throw new DOMException('Synthetic round10 primary quota failure','QuotaExceededError');}return original.call(this,k,v);};},keys.main);
   await p.locator('dialog [data-action="confirm"]').click();await p.locator('.toast.visible').filter({hasText:'本次操作未生效'}).waitFor();eq(await disk(p),before,'failed primary write keeps all keys and original gold/XP');
   await openChoice(p,q.id);await p.locator('dialog [data-action="confirm"]').click();const after=E.transition(s,{type:'event-choice',id:q.id,confirmed:true});await waitSave(p,after);await durable(p,after,'retry once');
  });
  await run('learning-cross-tab-stale-confirmation',async(p,context)=>{
   const s=fixture('memory_archive'),q=quote(s);await install(p,s);const second=await context.newPage();await second.goto(url);await second.locator('[data-action="continue"]').click();await idle(second);
   await openChoice(p,q.id);await second.locator('#primary-action').click();const after=E.transition(s,{type:'event-choice',id:'leave'});await waitSave(second,after);await p.waitForFunction(()=>!document.querySelector('dialog')?.open);await durable(p,after,'other tab left event');check((await p.locator('.event-outcome').innerText()).includes(after.event.outcome),'stale quote dismissed and current result visible');eq(after.player.gold,s.player.gold,'stale paid review never charged');
  });
  await run('desktop-learning-layouts',async p=>{
   row.layouts=[];
   for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160]])for(const key of ['memory_archive','starlibrary']){
    await p.setViewportSize({width,height});const s=fixture(key,{xp:1e8-10}),q=quote(s);await install(p,s);await preview(p,q,'.event-screen');
    const geometry=await p.evaluate(()=>{const b=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,panel:b(document.querySelector('#current-room')),dock:b(document.querySelector('.game-footer')),action:b(document.querySelector('#primary-action')),preview:b(document.querySelector('.event-screen [data-experience-preview]')),screen:document.querySelector('.event-screen').clientHeight,scroll:document.querySelector('.event-screen').scrollHeight};});
    check(geometry.pageWidth<=width+1,'no desktop whole-page horizontal overflow');check(geometry.panel.bottom<=geometry.dock.y+1,'room does not cover dock');check(geometry.action.bottom<=height&&geometry.action.y>=0,'main action reachable');
    for(const sel of ['.experience-values','.event-options [data-action="event-choice"][data-id="'+q.id+'"]']){await p.locator(sel).scrollIntoViewIfNeeded();check(await p.locator(sel).isVisible(),'native scroll reveals '+sel);}
    await p.locator('.experience-preview').scrollIntoViewIfNeeded();if(key==='starlibrary'&&[1366,1920].includes(width))await shot(p,'xp-room-'+width);
    await openChoice(p,q.id);await preview(p,q,'dialog');const dialog=await p.locator('dialog').evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,scroll:el.scrollHeight,client:el.clientHeight}));
    await p.locator('dialog [data-action="confirm"]').scrollIntoViewIfNeeded();check(await p.locator('dialog [data-action="confirm"]').isVisible(),'confirmation action reachable');check(dialog.width<=width&&dialog.height<=height,'dialog fits viewport');row.layouts.push({width,height,key,geometry,dialog});await p.keyboard.press('Escape');
   }
  });
 }
}finally{
 await browser.close();report.sourceAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.finished=new Date().toISOString();report.summary={groups:report.cases.length,passed:report.cases.filter(x=>x.status==='PASS').length,reproduced:report.cases.filter(x=>x.status==='REPRODUCED').length,failed:report.cases.filter(x=>x.status==='FAIL').length,checks:report.cases.reduce((n,x)=>n+x.checks.length,0),errors:report.errors.length};await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,sourceStable:report.sourceStable,out}));
}
if(report.summary.failed||report.errors.length||!report.sourceStable)process.exitCode=1;
