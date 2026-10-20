import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
assert(args.output&&args.baseline&&args.current);
const output=path.resolve(args.output);await fs.mkdir(output);
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const state=E.newGame(27017);state.runId='qa-fonts-round27';
while(state.player.items.length<90)state.player.items.push(E.makeItem(state,'weapon',state.nextId%8));
state.player.items[3].name='深渊守卫 Abyss 123456 +900 混合名称';
const report={browser:browser.version(),os:os.release(),cpu:os.cpus()[0].model,backend:'ANGLE SwiftShader',dpr:1,runs:[],errors:[],comparisons:[]};
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
async function layout(page){
 return page.evaluate(()=>{
  const rect=r=>[r.x,r.y,r.width,r.height];
  const nodes=[...document.querySelectorAll('h1,h2,h3,button,.item-name,.item-card,.inventory-list,.item-effects')];
  return nodes.filter(e=>e.getBoundingClientRect().width).map(e=>{
   const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),texts=[];let n;
   while(n=walker.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);texts.push({text:n.textContent,rects:[...range.getClientRects()].map(rect)});}
   return{tag:e.tagName,action:e.dataset.action||'',text:e.textContent,rect:rect(e.getBoundingClientRect()),scroll:[e.scrollWidth,e.scrollHeight,e.scrollTop],texts};
  });
 });
}
try{
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:3840,height:2160},{width:390,height:844}]){
  for(let repeat=0;repeat<2;repeat++)for(const label of ['baseline','current']){
   const run={viewport,repeat,label,network:[],layouts:{},timings:{}};report.runs.push(run);
   const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
   await context.addInitScript(()=>{
    window.__cls=0;window.__lcp=0;window.__firstText=null;
    const visible=()=>{const e=document.querySelector('h1');if(e?.textContent.trim()&&e.getBoundingClientRect().width)window.__firstText=performance.now();else requestAnimationFrame(visible);};requestAnimationFrame(visible);
    new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(l=>{window.__lcp=l.getEntries().at(-1).startTime;}).observe({type:'largest-contentful-paint',buffered:true});
   });
   const page=await context.newPage(),cdp=await context.newCDPSession(page);page.setDefaultTimeout(15000);
   page.on('pageerror',e=>report.errors.push(String(e)));await cdp.send('Network.enable');
   const requests=new Map();
   cdp.on('Network.responseReceived',e=>{const row={url:e.response.url,type:e.type,status:e.response.status,contentEncoding:e.response.headers['Content-Encoding']||e.response.headers['content-encoding']||'identity',encodedBytes:0};requests.set(e.requestId,row);run.network.push(row);});
   cdp.on('Network.loadingFinished',e=>{if(requests.has(e.requestId))requests.get(e.requestId).encodedBytes=e.encodedDataLength;});
   await page.goto(args[label]);await page.evaluate(()=>document.fonts.ready);
   run.timings=await page.evaluate(()=>({fontsReady:performance.now(),fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcp:window.__lcp,cls:window.__cls,firstVisibleHeadingFrame:window.__firstText,fontCheck:document.fonts.check('96px "Abyss Pixel"')}));
   await page.screenshot({path:path.join(output,`${label}-${viewport.width}-${repeat}-title.png`)});
   Object.assign(run.timings,await page.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcp:window.__lcp,cls:window.__cls,firstVisibleHeadingFrame:window.__firstText})));
   run.coldNetwork=structuredClone(run.network);
   run.coldBytes=Object.fromEntries(['Font','Stylesheet','Script','Document'].map(type=>[type,run.coldNetwork.filter(x=>x.type===type).reduce((n,x)=>n+x.encodedBytes,0)]));
   await page.evaluate(raw=>{localStorage.setItem('dice-abyss:save:v1',raw);localStorage.setItem('dice-abyss:mirror:v1',raw);},S.encodeSave(state));
   await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);
   await page.locator('.main-nav [data-action="inventory"]').click();await page.evaluate(()=>document.fonts.ready);
   run.layouts.inventory=await layout(page);
   await page.locator('.inventory-list').evaluate(e=>{e.scrollTop=300;});
   run.layouts.scrolled=await layout(page);
   await page.screenshot({path:path.join(output,`${label}-${viewport.width}-${repeat}-inventory.png`)});
   if(viewport.width<500){await page.locator('.item-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${label}-${viewport.width}-${repeat}-cards.png`)});}
   run.normalFullRequests=run.network.filter(x=>/SourceHanSansCN|fusion-pixel-12px/.test(x.url)).length;
   if(label==='current')assert.equal(run.normalFullRequests,0,'Normal title/continue/inventory loads no Full fonts');
   if(label==='current'&&repeat===0&&viewport.width===1920){
    const derived=JSON.parse(await fs.readFile(args.derivation,'utf8'));
    const probe=String.fromCodePoint(derived.fonts.find(x=>x.family==='Abyss Text').fallbackProbe);
    // Legal save import through the public decoder, then the normal inventory render path.
    const imported=structuredClone(state);imported.player.items.forEach(x=>{x.name=probe;});
    const raw=S.encodeSave(imported);assert(S.validateSave(S.decodeSave(raw)));
    await page.evaluate(raw=>{localStorage.setItem('dice-abyss:save:v1',raw);localStorage.setItem('dice-abyss:mirror:v1',raw);},raw);
    await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.main-nav [data-action="inventory"]').click();await page.evaluate(()=>document.fonts.ready);
    await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const {root}=await cdp.send('DOM.getDocument');
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.inventory-list .item-card h3'});
    assert(nodeId,'Actual equipment name node exists');
    run.fallback={probe,fonts:(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts};
    assert(run.fallback.fonts.some(x=>x.isCustomFont&&x.familyName.includes('Fusion Pixel')&&x.glyphCount>0),'Actual equipment name uses original Full font');
    run.fallback.requests=run.network.filter(x=>/SourceHanSansCN|fusion-pixel-12px/.test(x.url));
    assert(run.fallback.requests.length>0,'Missing core glyph requests Full');
    await page.evaluate(probe=>{const e=document.createElement('p');e.id='text-full-probe';e.textContent=probe;e.style.fontFamily="'Abyss Text','Abyss Text Full',sans-serif";document.body.append(e);const s=document.createElement('p');s.id='system-probe';s.textContent='🦄';s.style.fontFamily="'Abyss Text','Abyss Text Full',sans-serif";document.body.append(s);},probe);
    await page.evaluate(()=>document.fonts.ready);
    const fontFor=async selector=>{const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});return(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;};
    run.textFallback=await fontFor('#text-full-probe');run.systemFallback=await fontFor('#system-probe');
    assert(run.textFallback.some(x=>x.isCustomFont&&x.familyName.includes('Source Han')),'Text Full actual glyph');
    assert(run.systemFallback.some(x=>!x.isCustomFont&&x.glyphCount),'Out-of-cmap system glyph');
    run.allFallbackRequests=run.network.filter(x=>/SourceHanSansCN|fusion-pixel-12px/.test(x.url));
    assert.equal(run.allFallbackRequests.length,2,'Each Full requested exactly once');
    await page.screenshot({path:path.join(output,'fallback.png')});
   }
   run.status='PASS';await context.close();await persist();
  }
  const runs=report.runs.filter(x=>x.viewport.width===viewport.width);
  for(const label of ['baseline','current'])assert.deepEqual(runs.find(x=>x.label===label&&x.repeat===0).layouts,runs.find(x=>x.label===label&&x.repeat===1).layouts,`${label} layout repeat noise`);
  assert.deepEqual(runs.find(x=>x.label==='baseline').layouts,runs.find(x=>x.label==='current').layouts,'Exact layout / line rectangles / scroll equality');
  report.comparisons.push({viewport,repeatNoise:0,coreVsFullLayout:'EXACT'});
 }
 assert.equal(report.errors.length,0);report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(String(e));process.exitCode=1;}
finally{await persist();await browser.close();}
console.log(JSON.stringify({status:report.status,comparisons:report.comparisons,errors:report.errors}));
