// Optional, isolated browser regressions for cloud round 01. Playwright is a
// tester-provided dependency, never required by the game. All saves are synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(v=>{const n=v.indexOf('=');return [v.slice(0,n),v.slice(n+1)];}));
const root=resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
const baseURL=args['--url']||'http://127.0.0.1:4188', label=args['--label']||'after', baseline=label==='baseline';
const output=resolve(args['--output']||'docs/iteration/evidence/browser');
const selectedCases=new Set((args['--cases']||'').split(',').filter(Boolean));
const E=await import(pathToFileURL(resolve(root,'src/engine.js'))), S=await import(pathToFileURL(resolve(root,'src/storage.js')));
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await mkdir(output,{recursive:true});
const report={label,sourceVersion:pkg.version,sourceFiles:Object.fromEntries(await Promise.all(['src/app.js','src/views.js','src/dice-renderer.js','src/storage.js','src/quality.css','src/refinement.css'].map(async f=>[f,hash(await readFile(resolve(root,f),'utf8'))]))),started:new Date().toISOString(),method:'Native clicks and file-input imports in fresh Chromium contexts. Generated fixtures and deliberate faults are not personal saves or natural deep-floor play.',cases:[],errors:[],expectedErrors:[],screenshots:[],limitations:['Cloud software rendering, not hardware GPU or physical 4K validation.','WebGL loss uses WEBGL_lose_context, not an actual GPU driver reset.','Invalid imports are constructed faults with correct envelopes.']};
const browser=await chromium.launch({executablePath:args['--browser']||process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
let current,allowExpectedErrors=false;
const contexts=new Set();
async function fresh({state=null,main,mirror,effects='low'}={}){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});contexts.add(context);
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)?route.continue():route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>(allowExpectedErrors?report.expectedErrors:report.errors).push({case:current?.name,text:e.message}));
 page.on('console',m=>{if(m.type()==='error')(allowExpectedErrors?report.expectedErrors:report.errors).push({case:current?.name,text:m.text()});});
 await page.goto(baseURL,{waitUntil:'networkidle'});
 if(!report.environment)report.environment=await page.evaluate(()=>{const gl=document.querySelector('.dice-surface')?.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,dpr:devicePixelRatio,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',webLocks:!!navigator.locks};});
 const encoded=state?S.encodeSave(state):null;
 await page.evaluate(({main,mirror,effects,keys})=>{localStorage.clear();if(main!==null)localStorage.setItem(keys.main,main);if(mirror!==null)localStorage.setItem(keys.mirror,mirror);localStorage.setItem(keys.settings,JSON.stringify({sound:false,effects,scale:1}));},{main:main===undefined?encoded:main,mirror:mirror===undefined?(main===undefined?encoded:main):mirror,effects,keys:{main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY}});
 await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.title(),'骰狱：无尽深渊 · Dice Abyss');
 assert.equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),pkg.version);
 return {page,context};
}
async function close(context){await context.close();contexts.delete(context);}
async function shot(page,name){const filename=`${label}-${name}.png`;await page.screenshot({path:resolve(output,filename),animations:'disabled'});report.screenshots.push(filename);return filename;}
async function raw(page,key=S.SAVE_KEY){return page.evaluate(key=>localStorage.getItem(key),key);}
async function run(name,fn,{knownBug=false}={}){if(selectedCases.size&&!selectedCases.has(name))return;current={name,status:'running',checks:[]};report.cases.push(current);try{await fn();current.status=baseline&&knownBug?'reproduced':'passed';console.log(`${current.status.toUpperCase()} ${name}`);}catch(error){current.status='failed';current.error=error.stack;console.error(`FAIL ${name}: ${error.message}`);}finally{allowExpectedErrors=false;await writeFile(resolve(output,`${label}-iteration.json`),JSON.stringify(report,null,2));}}
function envelope(state){const payload=JSON.stringify(state);let n=2166136261;for(let i=0;i<payload.length;i++)n=Math.imul(n^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(n>>>0).toString(16),payload});}
function room(type){let s=E.newGame(741);s.runId='qa-round01-room-'+type;s.floor=200;s.player.level=50;s.player.gold=100000;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));return E.transition(s,{type:'enter'});}
try{
 await run('title-four-desktop-viewports',async()=>{
  const {page,context}=await fresh({effects:'full'});
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160]]){
   await page.setViewportSize({width,height});await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
   const geometry=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,h1:rect('.title-copy h1'),copy:rect('.title-copy>p'),buttons:rect('.title-buttons'),die:rect('.title-art .cube-die'),footer:rect('.title-footer'),fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],background:getComputedStyle(document.querySelector('.title-screen'),'::before').backgroundImage};});
   assert(geometry.fonts.every(Boolean));assert(geometry.scrollWidth<=width);assert(geometry.scrollHeight<=height+1);
   for(const item of [geometry.h1,geometry.copy,geometry.buttons,geometry.footer])assert(item.x>=0&&item.y>=0&&item.right<=width&&item.bottom<=height+1);
   assert(geometry.h1.bottom<=geometry.copy.y);assert(geometry.copy.bottom<=geometry.buttons.y);assert(geometry.h1.right<=geometry.die.x,'title copy and die do not intersect');
   if(!baseline)assert(geometry.background.includes('abyss-portal.webp'));
   current.checks.push(geometry);await shot(page,`title-${width}`);
  }
  await page.locator('[data-action="new"]').click();await page.waitForSelector('.game-shell');
  current.checks.push({primaryAction:'new game reached',phase:S.decodeSave(await raw(page)).phase});await close(context);
 });
 await run('static-webgl-loss-and-restoration',async()=>{
  let state=E.transition(E.transition(E.newGame(1138),{type:'fate'}),{type:'enter'});state.runId='qa-round01-static-webgl';
  const {page,context}=await fresh({state,effects:'full'});await page.locator('[data-action="continue"]').click();await page.waitForSelector('.cube-row.gpu-dice');const saved=await raw(page);
  const cycles=baseline?1:3;
  for(let i=0;i<cycles;i++){
   await page.evaluate(()=>{window.__roundCanvas=document.querySelector('.dice-surface');window.__roundContext=window.__roundCanvas.getContext('webgl');window.__roundExtension=window.__roundContext.getExtension('WEBGL_lose_context');window.__roundRestored=false;window.__roundCanvas.addEventListener('webglcontextrestored',()=>window.__roundRestored=true,{once:true});if(!window.__roundExtension)throw Error('WEBGL_lose_context unavailable');window.__roundExtension.loseContext();});
   await page.waitForFunction(()=>!document.querySelector('.cube-row')?.classList.contains('gpu-dice'));
   const lost=await page.evaluate(()=>({gpu:!!document.querySelector('.cube-row.gpu-dice'),fallbackFaces:document.querySelectorAll('.cube-face').length,canvasVisibility:getComputedStyle(document.querySelector('.dice-surface')).visibility,flightVisibility:getComputedStyle(document.querySelector('.die-flight')).visibility,phase:document.querySelector('.game-shell')?.dataset.scene}));
   assert.equal(lost.gpu,false);assert(lost.fallbackFaces>=6);assert.equal(lost.canvasVisibility,baseline?'visible':'hidden');assert.equal(lost.flightVisibility,'visible');if(i===0)await shot(page,'context-lost-fallback');
   await page.evaluate(()=>window.__roundExtension.restoreContext());await page.waitForFunction(()=>window.__roundRestored);
   if(!baseline)await page.waitForFunction(()=>document.querySelector('.dice-surface')?.dataset.contextState==='ready'&&document.querySelector('.cube-row')?.classList.contains('gpu-dice'));
   const restored=await page.evaluate(()=>({gpu:!!document.querySelector('.cube-row.gpu-dice'),sameCanvas:window.__roundCanvas===document.querySelector('.dice-surface'),canvases:document.querySelectorAll('.dice-surface').length,canvasVisibility:document.querySelector('.dice-surface')?getComputedStyle(document.querySelector('.dice-surface')).visibility:null,status:document.querySelector('.dice-surface')?.dataset.contextState||null}));
   assert.equal(restored.gpu,!baseline);assert.equal(await raw(page),saved);if(!baseline){assert(restored.sameCanvas);assert.equal(restored.canvases,1);assert.equal(restored.canvasVisibility,'visible');}
   current.checks.push({cycle:i+1,lost,restored,saveUnchanged:true});
  }
  await shot(page,'context-restored');
  if(!baseline){const expected=E.transition(state,{type:'roll'});await page.locator('#primary-action').click();await page.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision:expected.revision});assert.deepEqual(S.decodeSave(await raw(page)),expected);current.checks.push({postRecoveryRoll:'one exact committed transition'});}
  await close(context);
 },{knownBug:true});
 for(const type of ['abyssauction','oathgate'])await run(`reject-invalid-import-${type}`,async()=>{
  let invalid=room(type);assert(S.validateSave(invalid));if(type==='abyssauction')delete invalid.event.reward;else{invalid=E.transition(invalid,{type:'event-choice',id:'accept',confirmed:true});invalid.enemy=null;}
  const incoming=envelope(invalid),state=E.newGame(901);state.runId='qa-round01-import-original';
  const {page,context}=await fresh({state});const before=await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),[S.SAVE_KEY,S.BACKUP_KEY,S.LEGACY_BACKUP_KEY,S.V4_BACKUP_KEY]);
  await page.locator('[data-action="settings"]').click();await page.waitForSelector('dialog[open] #save-file',{state:'attached'});allowExpectedErrors=baseline;
  await page.locator('dialog[open] #save-file').setInputFiles({name:'synthetic-invalid.json',mimeType:'application/json',buffer:Buffer.from(incoming)});
  if(baseline){await page.waitForSelector('dialog[open] [data-action="confirm"]');await page.locator('dialog[open] [data-action="confirm"]').click();await page.waitForFunction(({key,previous})=>localStorage.getItem(key)!==previous,{key:S.SAVE_KEY,previous:before[S.SAVE_KEY]});assert.notEqual(await raw(page),before[S.SAVE_KEY]);}
  else{await page.waitForSelector('dialog[open] .dialog-notice');assert.equal(await page.locator('dialog[open] [data-action="confirm"]').count(),0);const after=await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(before));assert.deepEqual(after,before);assert((await page.locator('.dialog-notice').innerText()).length>4);}
  current.checks.push({incomingSha256:hash(incoming),accepted:baseline,originalSavePreserved:!baseline});await shot(page,`invalid-import-${type}`);await close(context);
 },{knownBug:true});
 await run('archive-the-recovered-v4-mirror',async()=>{
  const sample=JSON.parse(await readFile(resolve(root,'tests/fixtures/v4-baseline.json'),'utf8')).saves[0];const invalid=JSON.parse(JSON.parse(sample.raw).payload);invalid.nextId=3;const invalidRaw=envelope(invalid);
  const {page,context}=await fresh({main:invalidRaw,mirror:sample.raw});await page.locator('[data-action="continue"]').click();await page.locator('.game-footer [data-action="inventory"]').click();await page.waitForSelector('.inventory-list');
  await page.locator('.inventory-list [data-action="lock"]').first().click();await page.waitForFunction(key=>localStorage.getItem(key)!==null,S.V4_BACKUP_KEY);
  const archive=await raw(page,S.V4_BACKUP_KEY);assert.equal(archive,baseline?invalidRaw:sample.raw);assert(S.decodeSave(await raw(page)));
  current.checks.push({archiveMatchesRecoveredMirror:archive===sample.raw,currentSaveValid:true,archiveSha256:hash(archive)});await shot(page,'recovered-archive');await close(context);
 },{knownBug:true});
 await run('inventory-sort-instructions-match-controls',async()=>{
  const state=E.newGame(103);state.runId='qa-round01-sort';while(state.player.items.length<100)state.player.items.push(E.makeItem(state,undefined,state.player.items.length%8,200));
  const {page,context}=await fresh({state});await page.locator('[data-action="continue"]').click();await page.locator('.game-footer [data-action="inventory"]').click();const saved=await raw(page);
  for(const [value,labelText]of [['rarity','品质优先'],['level','等级优先'],['power','装备强度']]){
   const options=await page.locator('#inventory-sort option').evaluateAll(nodes=>nodes.map(n=>n.value));const selected=value==='power'?options.find(x=>!['rarity','level'].includes(x)):value;
   await page.locator('#inventory-sort').selectOption(selected);const text=await page.locator('.inventory-guidance').innerText();assert(text.includes(baseline?'按装备强度排序':labelText));if(baseline&&selected!=='power')assert(!text.includes(`当前排序：${labelText}`));current.checks.push({sort:selected,guidance:text});assert.equal(await raw(page),saved);
  }
  await shot(page,'inventory-sorting');await close(context);
 },{knownBug:true});
}finally{
 for(const context of contexts)await context.close();await browser.close();report.finished=new Date().toISOString();report.passed=report.cases.filter(c=>c.status==='passed').length;report.reproduced=report.cases.filter(c=>c.status==='reproduced').length;report.failed=report.cases.filter(c=>c.status==='failed').length;await writeFile(resolve(output,`${label}-iteration.json`),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({passed:report.passed,reproduced:report.reproduced,failed:report.failed,errors:report.errors.length}));
if(report.failed||report.errors.length)process.exitCode=1;
