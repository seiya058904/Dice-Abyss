// Real native-browser actions for the Round16 equipment explanation.
// The only state injection is an isolated seeded start or an explicitly marked
// valid layout boundary. Ordinary game actions are checked against full states.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
const source=path.resolve(args['--source']||'.'),url=args['--url']||'http://127.0.0.1:4191/',output=path.resolve(args['--output']||'/tmp/dice-round16-comparison');
const expected=args['--expect']||'current',only=args['--case'];
assert(['baseline','current'].includes(expected));assert(['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js')));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(value).digest('hex');
const tracked=['src/views.js','src/equipment-comparison.js','src/engine.js','src/equipment.js','src/storage.js','src/decisions.css'];
async function identity(){return Object.fromEntries(await Promise.all(tracked.map(async file=>[file,hash(await fs.readFile(path.join(source,file)))])));}
await fs.mkdir(output,{recursive:true});
const report={audit:'round16-comparison-native-browser',source,url,expected,started:new Date().toISOString(),scriptSha256:hash(await fs.readFile(new URL(import.meta.url))),sourceBefore:await identity(),cases:[],errors:[],blockedRequests:[],checks:0,
 method:'Seed 3 starts from newGame. Every subsequent native game action is compared recursively with the complete engine transition, including RNG, runId, revision and assets. Read-only comparisons check both exact stored envelopes. Layout fixtures continue that natural sequence; the large-ward boundary is separately marked synthetic.',
 limitations:['Logical viewports at scale 1 with software rendering; no physical mobile, 4K GPU, native IME or audio assessment.','Screenshots and functional waits are not performance measurements.','This selected natural seed demonstrates explanation accuracy; it is not a win-rate sample.']};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();let active;
const check=(value,label,detail={})=>{report.checks++;active.checks.push({label,passed:!!value,...detail});assert(value,label);};
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);check(true,label);};
const rawCopies=page=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[S.SAVE_KEY,S.BACKUP_KEY]);
const saved=async page=>S.decodeSave((await rawCopies(page))[0]);
const idle=page=>page.waitForFunction(()=>!document.querySelector('#current-room')?.classList.contains('busy'));
async function load(page,state){
 assert(S.validateSave(state));const raw=S.encodeSave(state);await page.goto(url);
 await page.evaluate(({raw,main,backup,settings})=>{localStorage.setItem(main,raw);localStorage.setItem(backup,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw,main:S.SAVE_KEY,backup:S.BACKUP_KEY,settings:S.SETTINGS_KEY});
 await page.reload();await page.locator('[data-action="continue"]').click();await idle(page);await page.evaluate(()=>document.fonts.ready);
 equal(await saved(page),S.decodeSave(raw),'Application restores the complete valid isolated fixture');return S.decodeSave(raw);
}
async function step(page,before,action,locator){
 assert(E.canAct(before,action));const after=E.transition(before,action);assert.notStrictEqual(after,before);
 await (locator||page.locator('#primary-action')).click();
 await page.waitForFunction(({key,revision})=>{try{return JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision;}catch{return false;}},{key:S.SAVE_KEY,revision:after.revision});
 await idle(page);equal(await saved(page),after,`Native ${action.type} saves one exact complete transition`);
 equal((await rawCopies(page))[0],(await rawCopies(page))[1],`Native ${action.type} retains exact primary and mirror equality`);
 active.transactions.push({action,phase:after.phase,revision:after.revision,stateSha256:hash(JSON.stringify(after)),hp:after.player.hp,maxHp:E.stats(after).maxHp,ward:after.ward||0});return after;
}
async function inventory(page){await page.locator('.main-nav [data-action="inventory"]').click();}
async function game(page){await page.locator('.manual-control [data-action="game"]').click();}
const opener=(page,id)=>page.locator(`.inventory-list [data-action="compare-details"][data-id="${id}"]`);
async function open(page,id){await opener(page,id).click();check(await page.locator('.game-dialog').isVisible(),'Native comparison dialog opens');}
async function close(page,id){await page.keyboard.press('Escape');check(!await page.locator('.game-dialog').isVisible(),'Escape closes comparison');check(await opener(page,id).evaluate(el=>el===document.activeElement),'Escape restores the original comparison control');}
async function shot(page,name){await page.screenshot({path:path.join(output,`${name}.png`),animations:'disabled'});active.screenshots.push(`${name}.png`);}
async function preview(page,s,id){
 const target=E.transition(s,{type:'equip',id}),before=await rawCopies(page);await open(page,id);
 if(expected==='baseline')check(await page.locator('[data-comparison-context]').count()===0,'Input reproduces the absent immediate equipment-state explanation');
 else{
  const compact=text=>text.replace(/\s+/g,'');
  equal(compact(await page.locator('[data-comparison-context-key="hp"] dd').innerText()),`${s.player.hp}/${E.stats(s).maxHp}→${target.player.hp}/${E.stats(target).maxHp}`,'Displayed HP and maximum HP match the complete equip transition');
  equal(compact(await page.locator('[data-comparison-context-key="ward"] dd').innerText()),`${s.ward||0}→${target.ward||0}`,'Displayed current shield matches actual unchanged shield');
  if(id==='i4'&&E.diceCount(s)===1){const row=page.locator('[data-comparison-key="pairWard"]');equal(await row.getAttribute('data-comparison-possible'),'false','One die explicitly marks pair ward unattainable');check((await row.innerText()).includes('Lv.2')&&(await row.innerText()).includes('无法触发'),'The impossible condition explains the exact next-die unlock level');}
 }
 equal(await rawCopies(page),before,'Reading a comparison writes neither save copy');return before;
}
function natural(){let s=E.newGame(3);for(const type of ['fate','enter','roll','roll','open'])s=E.transition(s,{type});assert.equal(s.phase,'loot');return s;}
async function geometry(page,label){
 const values=await page.evaluate(()=>{
  const get=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};};
  const selectors=['.game-dialog','.comparison-detail','[data-comparison-context]','[data-comparison-context-key="hp"] dd','[data-comparison-context-key="ward"] dd','[data-comparison-key="pairWard"]'];
  return {width:innerWidth,height:innerHeight,body:{scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth},nodes:selectors.flatMap(selector=>{const el=document.querySelector(selector);return el?[{selector,...get(el)}]:[]}),fonts:[...document.querySelectorAll('[data-comparison-context] dt,[data-comparison-context] dd,[data-comparison-dice-count],[data-comparison-possible="false"] strong')].map(el=>({text:el.textContent,fontSize:parseFloat(getComputedStyle(el).fontSize)}))};
 });
 if(expected==='current'){
  check(values.nodes.length===6,`${label}: every required comparison and context node exists`);
  check(values.fonts.length>=6&&values.fonts.every(row=>row.text.trim().length>0),`${label}: new vitals, dice count and unattainable-condition text are present`);
 }
 check(values.body.scrollWidth<=values.body.clientWidth+1,`${label}: page has no horizontal overflow`,values.body);
 for(const node of values.nodes)check(node.left>=-1&&node.right<=values.width+1&&node.scrollWidth<=node.clientWidth+1,`${label}: ${node.selector} has no horizontal clipping`,node);
 const dialog=values.nodes[0];check(dialog.top>=-1&&dialog.bottom<=values.height+1,`${label}: dialog frame fits the viewport`,dialog);
 if(expected==='current')check(values.fonts.every(row=>row.fontSize>=11.5),`${label}: new explanation text is at least 11.5 CSS px`,{fonts:values.fonts});
 active.layouts.push(values);
}
async function run(name,fn){
 if(only&&only!==name)return;active={name,status:'RUNNING',checks:[],transactions:[],screenshots:[],layouts:[]};report.cases.push(active);
 const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);
 await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(['127.0.0.1','localhost','[::1]'].includes(host))return route.continue();report.blockedRequests.push(route.request().url());return route.abort();});
 page.on('pageerror',error=>report.errors.push({case:name,message:error.message}));page.on('console',message=>{if(message.type()==='error')report.errors.push({case:name,message:message.text()});});
 const start=performance.now();try{await fn(page,context);active.status='PASS';}catch(error){active.status='FAIL';active.error=error.stack||String(error);process.exitCode=1;await shot(page,`FAILED-${name}`).catch(()=>{});}
 finally{active.durationMs=performance.now()-start;await context.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${active.status} (${active.checks.length})`);}
}
try{
 await run('natural-first-loot-and-eight-hp-clamp',async page=>{
  let s=await load(page,E.newGame(3));for(const type of ['fate','enter','roll','roll','open'])s=await step(page,s,{type});
  check(s.player.level===1&&E.diceCount(s)===1&&s.loot.item.id==='i4','Seed 3 naturally reaches the exact one-die first-loot checkpoint');
  await inventory(page);let before=await preview(page,s,'i4');check((await page.locator('.game-dialog .comparison-verdict').innerText()).includes('82%'),'Existing +82% survival estimate is unchanged');
  await shot(page,'natural-first-loot');await close(page,'i4');await open(page,'i4');await page.keyboard.press('Space');
  equal(await rawCopies(page),before,'Space within an open comparison does not roll or save');if(await page.locator('.game-dialog').isVisible())await close(page,'i4');
  await game(page);s=await step(page,s,{type:'next'});equal([s.player.hp,E.stats(s).maxHp,s.ward],[165,165,4],'Natural next battle grants the actual original opening shield');
  await inventory(page);before=await preview(page,s,'i4');await close(page,'i4');
  s=await step(page,s,{type:'equip',id:'i4'},page.locator('.inventory-list [data-action="equip"][data-id="i4"]'));
  equal([s.player.hp,E.stats(s).maxHp,s.ward],[165,224,4],'Higher maximum HP grants no free healing and preserves existing shield');
  await game(page);s=await step(page,s,{type:'roll'});equal([s.player.hp,E.stats(s).maxHp,s.ward],[173,224,3],'One ordinary roll produces the natural injured regeneration checkpoint');
  await inventory(page);before=await preview(page,s,'i2');if(expected==='current')check((await page.locator('[data-comparison-context]').innerText()).includes('8 点'),'Lowering maximum HP clearly warns about the exact eight-point loss');
  await shot(page,'natural-eight-hp-clamp');await close(page,'i2');equal(await rawCopies(page),before,'The clipping warning itself changes no state');
  s=await step(page,s,{type:'equip',id:'i2'},page.locator('.inventory-list [data-action="equip"][data-id="i2"]'));
  equal([s.player.hp,E.stats(s).maxHp,s.ward],[165,165,3],'Real equip clamps eight HP and keeps the existing shield');
  await page.reload();await page.locator('[data-action="continue"]').click();await idle(page);equal(await saved(page),s,'Normal reload preserves the exact natural post-swap state');
 });
 await run('six-viewports-and-scrollable-close',async page=>{
  const s=await load(page,natural());await inventory(page);const before=await rawCopies(page);
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844],[320,740]]){
   await page.setViewportSize({width,height});await open(page,'i4');await geometry(page,`${width}x${height}`);
   if([1920,390,320].includes(width))await shot(page,`comparison-${width}`);
   const footer=page.locator('.comparison-detail > [data-action="close-dialog"]');await footer.scrollIntoViewIfNeeded();check(await footer.isVisible(),`${width}x${height}: long comparison close action is reachable`);await footer.click();
   check(!await page.locator('.game-dialog').isVisible(),`${width}x${height}: native footer closes modal`);check(await opener(page,'i4').evaluate(el=>el===document.activeElement),`${width}x${height}: focus returns after scrolling and closing`);
  }
  equal(await rawCopies(page),before,'All six viewport checks preserve exact primary and mirror bytes');equal(await saved(page),s,'Viewport changes retain all RNG, revision and player fields');
 });
 await run('synthetic-large-shield-boundary',async page=>{
  let s=natural();s=E.transition(s,{type:'next'});s.ward=1e15;assert(S.validateSave(s));active.fixtureKind='Synthetic ward=1e15 on an otherwise naturally reached valid combat state; not a natural reward.';
  s=await load(page,s);await page.setViewportSize({width:320,height:740});await inventory(page);const before=await rawCopies(page);await open(page,'i4');await geometry(page,'320x740-large-shield');
  if(expected==='current')check((await page.locator('[data-comparison-context-key="ward"] dd').innerText()).includes('万亿'),'Existing large-number formatter remains readable at the valid shield boundary');
  await shot(page,'large-shield-320');await close(page,'i4');equal(await rawCopies(page),before,'Boundary explanation writes no save');
 });
 assert(report.cases.length>0);report.sourceAfter=await identity();assert.deepEqual(report.sourceAfter,report.sourceBefore,'Source changed during browser QA');assert.equal(hash(await fs.readFile(new URL(import.meta.url))),report.scriptSha256,'The browser driver changed during QA');assert.equal(report.errors.length,0);assert.equal(report.blockedRequests.length,0);report.status=report.cases.every(row=>row.status==='PASS')?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors.length,output}));}
