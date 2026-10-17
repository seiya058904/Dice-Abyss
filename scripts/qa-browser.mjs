// Optional QA driver: requires Playwright in the tester's environment, never at runtime.
// All game saves below are synthetic and live in a fresh browser context.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i=arg.indexOf('='); return [arg.slice(0,i),arg.slice(i+1)]; }));
const source = path.resolve(args['--source'] || '.'), baseURL=args['--url'] || 'http://127.0.0.1:4199', label=args['--label'] || 'after';
const output=path.resolve(args['--output'] || 'docs/qa/evidence/browser'), mode=args['--mode'] || 'performance';
await fs.mkdir(output,{recursive:true});
const engine=await import(pathToFileURL(path.join(source,'src/engine.js'))), storage=await import(pathToFileURL(path.join(source,'src/storage.js'))), content=await import(pathToFileURL(path.join(source,'src/content.js')));
function fixture(roomType='boss',floor=140){
  const s=engine.newGame(20261017);s.runId=`synthetic-v51-${roomType}-${floor}`;s.floor=floor;s.fate=[6,6];s.player.level=80;s.player.gold=500000;s.player.talentPoints=35;s.roomIndex=roomType==='boss'?5:0;
  s.route=Array.from({length:6},(_,i)=>({id:`f${floor}r${i}`,type:i===s.roomIndex?roomType:i===5?'boss':'combat',quality:0,done:i<s.roomIndex}));
  for(const key of ['critical','resonance','keen','echo']) if(content.TALENTS[key])s.player.talents[key]=content.TALENTS[key].cap;
  s.phase='combat';s.enemy=engine.createEnemy(s,roomType);s.player.hp=engine.stats(s).maxHp;s.ward=0;
  return s;
}
// makeItem is kept in equipment.js rather than assuming an engine re-export.
const equipment=await import(pathToFileURL(path.join(source,'src/equipment.js')));
function geared(roomType='boss',floor=140){
  const s=fixture(roomType,floor);
  for(const [slot,key] of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){const item=equipment.makeItem(s,slot,4,floor);s.player.items.push(item);s.player.equipped[key]=item.id;}
  s.player.hp=engine.stats(s).maxHp;return s;
}
function scenarios(){
  const normal=geared('combat',30), burst=geared(), finish=geared();
  // A controlled six-die burst; combat RNG is searched, never replaced in the UI.
  for(let rng=1;rng<2000;rng++){const candidate={...burst,rng},next=engine.transition(candidate,{type:'roll'});if(next.lastRoll?.best>=3&&next.lastRoll.critical&&next.lastRoll.follow&&!next.lastRoll.killed){burst.rng=rng;break;}}
  finish.enemy.hp=1;finish.enemy.shield=0;finish.enemy.stage=2;finish.rng=burst.rng;
  const chest=engine.transition(finish,{type:'roll'});
  if(chest.phase!=='chest')throw Error('Synthetic boss did not yield a chest');
  function reward(grade){const s=structuredClone(chest);s.chest.item=equipment.makeItem(s,'relic',grade,140,'boss');return s;}
  return [{name:'normal-roll',state:normal,action:'roll'},{name:'boss-burst',state:burst,action:'roll'},{name:'boss-finish',state:finish,action:'roll'},{name:'legendary-open',state:reward(3),action:'open'},{name:'eternal-open',state:reward(7),action:'open'}];
}
const shots=async(page,name)=>page.screenshot({path:path.join(output,`${label}-${name}.png`),animations:'allow',timeout:90000});
const browser=await chromium.launch({executablePath:args['--browser'] || process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
context.setDefaultTimeout(90000);context.setDefaultNavigationTimeout(90000);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(baseURL);await page.evaluate(()=>document.fonts.ready);
const environment=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl'),d=g?.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,platform:navigator.platform,dpr:devicePixelRatio,renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'unavailable',vendor:d?g.getParameter(d.UNMASKED_VENDOR_WEBGL):'unavailable',fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],webLocks:!!navigator.locks};});
const report={label,source,baseURL,mode,browser:await browser.version(),environment,synthetic:true,notes:['Software-rendered Chromium; this does not establish physical-GPU 4K60.','Viewport pixels at DPR1; five identical fixture categories and4200ms windows, three repetitions each.','Screenshot collection is outside measured windows.'],runs:[],errors};
if(mode==='screenshots')report.notes=['Actual Chromium screenshots at DPR1 using valid synthetic saves and native action clicks.','Screenshots are outside performance measurements; native animation timing is not frozen or pixel-phase matched.','Each action is compared with the exact engine transition; generated concepts are stored separately.'];
if(mode==='screenshots'&&args['--resume']==='true'){
  const previous=JSON.parse(await fs.readFile(path.join(output,`${label}-${mode}.json`),'utf8'));
  assert.equal(previous.source,source);assert.equal(previous.baseURL,baseURL);
  report.runs=previous.runs;
  report.notes.push(`Resumed ${previous.runs.length} completed screenshot cases from an interrupted driver attempt; only exact-transition cases with matching fixture hashes are retained.`);
}
await shots(page,'title-1920');
async function load(s){
  if(!storage.validateSave(s))throw Error(`Invalid synthetic fixture ${s.phase}`);
  const raw=storage.encodeSave(s);
  await page.evaluate(({raw,key,mirror,settings})=>{localStorage.setItem(key,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'full',scale:1}));},{raw,key:storage.SAVE_KEY,mirror:storage.BACKUP_KEY,settings:storage.SETTINGS_KEY});
  await page.reload();await page.evaluate(()=>document.fonts.ready);await page.locator('[data-action="continue"]').click();await page.waitForTimeout(180);
}
const allScenes=args['--fixtures']?JSON.parse(await fs.readFile(path.resolve(args['--fixtures']),'utf8')):scenarios();
const list=args['--scenes']?allScenes.filter(s=>args['--scenes'].split(',').includes(s.name)):allScenes;
await fs.writeFile(path.join(output,`${label}-fixtures.json`),JSON.stringify(list,null,2));
try{
  const sizes=(args['--sizes']||'1920x1080,2560x1440,3840x2160').split(',').map(t=>t.split('x').map(Number));
  for(const [width,height]of sizes){
    await page.setViewportSize({width,height});
    if(mode==='screenshots'){await page.reload();await page.evaluate(()=>document.fonts.ready);await shots(page,`title-${width}`);}
    for(const scene of list){
      if(mode==='screenshots'){
        const prior=report.runs.find(r=>r.scene===scene.name&&r.width===width&&r.height===height);
        if(prior){assert(prior.exactTransition);assert.equal(prior.stateSha256,createHash('sha256').update(JSON.stringify(scene.state)).digest('hex'));continue;}
        await load(scene.state);await shots(page,`${scene.name}-${width}-ready`);
        await page.locator('#primary-action').click();
        await page.waitForSelector(scene.action==='open'?'.loot-screen':'.impact-reveal',{timeout:90000});
        await page.waitForTimeout(scene.action==='open'?350:160);await shots(page,`${scene.name}-${width}-impact`);
        const persisted=storage.decodeSave(await page.evaluate(key=>localStorage.getItem(key),storage.SAVE_KEY));
        assert.deepEqual(persisted,engine.transition(scene.state,{type:scene.action}),'Screenshot action must commit exactly one real engine transition');
        const dom=await page.evaluate(()=>({
          phase:document.querySelector('.combat-screen')?'combat':document.querySelector('.loot-screen')?'loot':document.querySelector('.chest-screen')?'chest':'other',
          effect:document.querySelector('.scene-fx')?.dataset.fxKind??null,
          dice:Array.from(document.querySelectorAll('.cube-die:not(.is-rolling)')).map(e=>e.dataset.value),
          fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')],
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
          viewport:{width:innerWidth,height:innerHeight}
        }));
        report.runs.push({scene:scene.name,width,height,action:scene.action,stateSha256:createHash('sha256').update(JSON.stringify(scene.state)).digest('hex'),persistedSha256:createHash('sha256').update(JSON.stringify(persisted)).digest('hex'),ready:`${label}-${scene.name}-${width}-ready.png`,impact:`${label}-${scene.name}-${width}-impact.png`,dom,exactTransition:true});
        await fs.writeFile(path.join(output,`${label}-${mode}.json`),JSON.stringify(report,null,2));
        console.log(`${label} screenshots ${width} ${scene.name}: exact transition, fonts=${dom.fonts.join('/')}`);
        continue;
      }
      for(let repeat=1;repeat<=3;repeat++){
        await load(scene.state);
        await page.evaluate(()=>{
          window.__qaFrames=[];window.__qaTasks=[];window.__qaPeakPixels={dice:0,effects:0,materials:0};window.__qaStartHeap=performance.memory?.usedJSHeapSize??null;
          const observer=new PerformanceObserver(list=>window.__qaTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({type:'longtask',buffered:false});
          const start=performance.now();let last=start;
          window.__qaDone=new Promise(resolve=>{
            function tick(now){
              const d=document.querySelector('.dice-surface'),fx=document.querySelector('.scene-fx'),kind=fx?.dataset.fxKind||'idle';
              window.__qaFrames.push({time:now-start,dt:now-last,kind});last=now;
              window.__qaPeakPixels.dice=Math.max(window.__qaPeakPixels.dice,(d?.width||0)*(d?.height||0));
              window.__qaPeakPixels.effects=Math.max(window.__qaPeakPixels.effects,Number(fx?.dataset.fxPixels||0));
              window.__qaPeakPixels.materials=Math.max(window.__qaPeakPixels.materials,Number(fx?.dataset.fxMaterialPixels||0));
              if(now-start<4200)requestAnimationFrame(tick);else{observer.disconnect();resolve({frames:window.__qaFrames,longTasks:window.__qaTasks,peakPixels:window.__qaPeakPixels,heapBefore:window.__qaStartHeap,heapAfter:performance.memory?.usedJSHeapSize??null});}
            }requestAnimationFrame(tick);
          });
        });
        await page.locator('#primary-action').click();
        // Include the initial interval: under a severe stall it may be the only
        // delivered frame. Dropping it would conceal the stall or empty metrics.
        const raw=await page.evaluate(()=>window.__qaDone),times=raw.frames.map(f=>f.dt).filter(n=>n>0).sort((a,b)=>a-b),q=p=>times.length?times[Math.min(times.length-1,Math.floor((times.length-1)*p))]:null;
        const result={scene:scene.name,width,height,repeat,p50:q(.5),p95:q(.95),p99:q(.99),max:times.at(-1),frames:times.length,over50:times.filter(n=>n>50).length,over100:times.filter(n=>n>100).length,...raw};
        report.runs.push(result);await fs.writeFile(path.join(output,`${label}-performance.json`),JSON.stringify(report,null,2));
        console.log(`${label} ${width} ${scene.name} #${repeat}: p95=${result.p95?.toFixed(1)??'unavailable'} max=${result.max?.toFixed(1)??'unavailable'} frames=${times.length}`);
      }
    }
  }
}finally{report.errors=errors;await fs.writeFile(path.join(output,`${label}-${mode}.json`),JSON.stringify(report,null,2));await browser.close();}
