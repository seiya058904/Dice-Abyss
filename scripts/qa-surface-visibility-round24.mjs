// Native browser component/lifecycle acceptance. One context at a time.
// Motion delivery clocks are explicitly supplied; native GL calls/readPixels
// prove submitted work and correctness, never a physical refresh rate or FPS.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {comparePixelBuffers} from './qa-renderer-round23.mjs';

const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');

async function installProbe(){
 const modules={motion:await import(new URL('src/dice-motion.js',location.href)),renderer:await import(new URL('src/dice-renderer.js',location.href)),effects:await import(new URL('src/effects.js',location.href)),views:await import(new URL('src/views.js',location.href))};
 const probe=window.__visibilityRound24={modules,draws:[],resizes:[],fxCalls:0,materialCalls:0,observations:[],restCaptures:[],nextCaptureDraws:0,lastCapture:null,fixture:null,presentation:null,active:false};
 const NativeIO=window.IntersectionObserver;
 probe.NativeIO=NativeIO;probe.intersections=new Map();probe.witnesses=[];
 probe.watch=target=>{
  if(!NativeIO)return;
  const observer=new NativeIO(entries=>{for(const entry of entries){probe.intersections.set(entry.target,entry.isIntersecting);probe.observations.push({surface:entry.target.className,visible:entry.isIntersecting,time:performance.now(),rect:{x:entry.boundingClientRect.x,y:entry.boundingClientRect.y,width:entry.boundingClientRect.width,height:entry.boundingClientRect.height}});}});
  observer.observe(target);probe.witnesses.push(observer);
 };
 probe.capture=gl=>{
  const canvas=gl.canvas,width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4);
  gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  let binary='',opaquePixels=0;for(let offset=0;offset<rgba.length;offset+=8192)binary+=String.fromCharCode(...rgba.subarray(offset,offset+8192));for(let offset=3;offset<rgba.length;offset+=4)if(rgba[offset])opaquePixels++;
  const program=gl.getParameter(gl.CURRENT_PROGRAM),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {width,height,rgbaBase64:btoa(binary),opaquePixels,error:gl.getError(),quality:canvas.dataset.motionQuality,pixelBudget:Number(canvas.dataset.pixelBudget),
   renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
   programLinked:!!program&&gl.getProgramParameter(program,gl.LINK_STATUS),
   rowValues:[...canvas.parentElement.querySelectorAll('.cube-die')].map(d=>[...d.querySelectorAll('.cube-face')].map(f=>Number(f.dataset.face)))};
 };
 const nativeDraw=WebGLRenderingContext.prototype.drawElements;
 WebGLRenderingContext.prototype.drawElements=function(...args){
  const result=nativeDraw.apply(this,args);if(!probe.active||!this.canvas.classList.contains('dice-surface'))return result;
  probe.draws.push({time:performance.now(),quality:this.canvas.dataset.motionQuality,width:this.drawingBufferWidth,height:this.drawingBufferHeight});
  if(probe.nextCaptureDraws>0&&!--probe.nextCaptureDraws)probe.lastCapture=probe.capture(this);
  if(probe.captureAppRest&&this.canvas.dataset.motionQuality==='rest'&&!this.canvas.parentElement.classList.contains('rolling')&&probe.draws.length%6===0)probe.restCaptures.push(probe.capture(this));
  return result;
 };
 for(const dimension of ['width','height']){
  const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,dimension);
  Object.defineProperty(HTMLCanvasElement.prototype,dimension,{...descriptor,set(value){const before=descriptor.get.call(this);descriptor.set.call(this,value);if(probe.active&&this.classList.contains('dice-surface'))probe.resizes.push({dimension,before,after:descriptor.get.call(this)});}});
 }
 for(const method of ['drawImage','stroke','fill','fillRect','strokeRect']){
  const native=CanvasRenderingContext2D.prototype[method];
  CanvasRenderingContext2D.prototype[method]=function(...args){
   if(probe.active&&this.globalAlpha>0){if(this.canvas.classList.contains('scene-fx'))probe.fxCalls++;else probe.materialCalls++;}
   return native.apply(this,args);
  };
 }
 probe.snapshot=()=>({drawElements:probe.draws.length,resizes:probe.resizes.length,fxCalls:probe.fxCalls,materialCalls:probe.materialCalls});
 return {url:location.href,userAgent:navigator.userAgent,devicePixelRatio,hasIntersectionObserver:typeof NativeIO==='function',fonts:{text:document.fonts.check('16px "Abyss Text"'),pixel:document.fonts.check('96px "Abyss Pixel"')}};
}

async function componentFixture({rolling=false,effects=false,noIO=false}){
 const probe=window.__visibilityRound24;probe.modules.effects.mountEffects({},{busy:false},{effects:'low'},()=>{}).stop();
 const shell=document.createElement('main');shell.id='visibility-probe';shell.style.cssText='position:fixed;left:24px;top:24px;width:900px;height:520px;box-sizing:border-box;overflow:hidden;background:#020304;color:#eee;border:1px solid #999;padding:16px;';
 shell.innerHTML='<h1 style="font:20px sans-serif;margin:0 0 20px">Dice Abyss · Native visibility probe</h1><p style="font:13px sans-serif;margin:0 0 30px">Production geometry, fonts and Canvas/WebGL renderers.</p><div id="probe-stage" class="combat-stage" style="position:relative;display:block;width:840px;height:360px;padding:0;margin:0"><canvas class="scene-fx"></canvas><div class="roll-caption" style="height:28px">命运骰 · 可见性验证</div>'+probe.modules.views.dice([6,6,6,6,6,6],{rolling,match:6,critical:true,follow:true})+'<div class="damage-result" style="height:45px;margin-top:18px">六骰实测</div></div>';
 document.body.replaceChildren(shell);const row=shell.querySelector('.cube-row');row.style.cssText='position:relative;display:flex;gap:24px;justify-content:center;box-sizing:content-box;width:800px;height:135px;padding:0;margin:40px 0 0;perspective:none;';
 for(const die of row.querySelectorAll('.cube-die'))die.style.cssText+=';--size:72px;flex:0 0 72px;box-sizing:content-box;width:72px;max-width:72px;height:110px;perspective:none;';
 if(noIO)window.IntersectionObserver=undefined;
 const state={revision:415,phase:'combat',enemy:{type:'boss',shield:0},lastRoll:{best:6,critical:true,follow:true,killed:true,phaseChanged:true,absorbed:120}};
 const ui={busy:true,view:'game',event:'roll'};
 const handle=effects?null:probe.modules.renderer.mountDiceSurface();
 if(effects)probe.presentation=probe.modules.effects.mountEffects(state,ui,{effects:'full'},()=>{});
 const canvas=row.querySelector('.dice-surface');if(!canvas)throw Error('Native WebGL surface unavailable');
 const gl=canvas.getContext('webgl');if(!gl)throw Error('Native WebGL context unavailable');
 probe.fixture={shell,row,canvas,gl,handle,state,ui,fx:shell.querySelector('.scene-fx')};probe.watch(canvas);if(effects)probe.watch(probe.fixture.fx);
 probe.active=true;
 return {canvas:{width:canvas.width,height:canvas.height},nativeGL:gl instanceof WebGLRenderingContext,probeKind:effects?'SYNTHETIC_COMPONENT_EFFECT':'SYNTHETIC_COMPONENT_DICE',noIO};
}

async function settleIntersection(page,surface,visible){
 await page.waitForFunction(({surface,visible})=>{
  const probe=window.__visibilityRound24,target=probe.fixture[surface];return probe.intersections.get(target)===visible;
 },{surface,visible},{timeout:15000});
 // Deliver the implementation observer too before counting a stable window.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
}

async function sourceIdentity(page,root){
 const files=['index.html','src/app.js','src/views.js','src/engine.js','src/storage.js','src/dice-motion.js','src/dice-renderer.js','src/effects.js','src/visual-timeline.js',...(await fs.readdir(path.join(root,'src'))).filter(file=>file.endsWith('.css')).map(file=>`src/${file}`)].sort();
 const local=await Promise.all(files.map(async file=>{const bytes=await fs.readFile(path.join(root,file));return {file,bytes:bytes.length,sha256:sha(bytes)};}));
 // The production static server intentionally does not expose package.json.
 // API requests verify that boundary without adding a browser console error.
 const served=await Promise.all(files.map(async file=>{const response=await page.request.get(new URL(file,page.url()).href,{headers:{'Cache-Control':'no-cache'}}),bytes=await response.body();return {file,status:response.status(),bytes:bytes.length,sha256:sha(bytes)};}));
 for(let index=0;index<files.length;index++){assert.equal(served[index].status,200);assert.equal(served[index].sha256,local[index].sha256,files[index]);assert.equal(served[index].bytes,local[index].bytes);}
 const packageBytes=await fs.readFile(path.join(root,'package.json')),version=JSON.parse(packageBytes).version,release=await page.locator('meta[name="dice-abyss-release"]').getAttribute('content');
 const packageResponse=await page.request.get(new URL('package.json',page.url()).href);assert.equal(packageResponse.status(),404,'The static server must keep package.json private');assert.equal(version,release,'Local package version must match the served page metadata');
 return {files:served,package:{file:'package.json',localSha256:sha(packageBytes),localVersion:version,pageRelease:release,status:packageResponse.status(),expectedStatus:404}};
}

async function gpuOffscreenCase(page,{current,noIO=false,restore=false,terminal=false}){
 const setup=await page.evaluate(componentFixture,{noIO});await settleIntersection(page,'canvas',true);
 await page.evaluate(()=>{window.__visibilityRound24.fixture.shell.style.transform='translateY(4000px)';});await settleIntersection(page,'canvas',false);
 const hidden=await page.evaluate(({terminal})=>{
  const probe=window.__visibilityRound24,{handle,row}=probe.fixture,before=probe.snapshot(),rest=probe.fixture.canvas.style.cssText;
  const width=row.getBoundingClientRect().width,die=row.querySelector('.cube-die').getBoundingClientRect().width;
  const poses=probe.modules.motion.throwFrames(6,113,(die+24)/die,Math.max(.8,width/die/2-.66));
  for(const index of [18,38,68])handle.draw(poses[index].dice);
  const envelopeAdvanced=probe.fixture.canvas.style.cssText!==rest;
  probe.fixture.latestPoses=terminal?undefined:poses[68].dice;if(terminal)handle.draw();
  return {before,after:probe.snapshot(),envelopeAdvanced,latestPoses:probe.fixture.latestPoses??null};
 },{terminal});
 assert(hidden.envelopeAdvanced);const skipped=current&&!noIO;
 assert.equal(hidden.after.drawElements-hidden.before.drawElements,skipped?0:(terminal?24:18));
 if(skipped)assert.equal(hidden.after.resizes,hidden.before.resizes);
 let restored=null;
 if(restore){
  await page.evaluate(()=>{const p=window.__visibilityRound24;p.fixture.extension=p.fixture.gl.getExtension('WEBGL_lose_context');if(!p.fixture.extension)throw Error('WEBGL_lose_context unavailable');p.fixture.extension.loseContext();});
  await page.waitForFunction(()=>window.__visibilityRound24.fixture.canvas.dataset.contextState==='lost');
  const lost=await page.evaluate(()=>{const p=window.__visibilityRound24;p.fixture.handle.draw(p.fixture.latestPoses);p.restoreStart=p.draws.length;return {fallback:!p.fixture.row.classList.contains('gpu-dice'),draws:p.draws.length};});assert(lost.fallback);
  await page.evaluate(()=>window.__visibilityRound24.fixture.extension.restoreContext());
  await page.waitForFunction(()=>window.__visibilityRound24.fixture.canvas.dataset.contextState==='ready');
  restored=await page.evaluate(()=>{const p=window.__visibilityRound24;return {hiddenRestorationDraws:p.draws.length-p.restoreStart,contextState:p.fixture.canvas.dataset.contextState};});
  assert.equal(restored.hiddenRestorationDraws,skipped?0:6);
 }
 const beforeReturn=await page.evaluate(()=>{const p=window.__visibilityRound24;p.nextCaptureDraws=6;p.fixture.shell.style.transform='';return p.snapshot();});
 await settleIntersection(page,'canvas',true);
 const reentry=await page.evaluate(()=>{const p=window.__visibilityRound24;return {after:p.snapshot(),capture:p.lastCapture};});
 assert.equal(reentry.after.drawElements-beforeReturn.drawElements,skipped?6:0);
 if(!skipped)reentry.capture=await page.evaluate(()=>{const p=window.__visibilityRound24;p.fixture.handle.draw(p.fixture.latestPoses);return p.lastCapture;});
 assert(reentry.capture?.opaquePixels>0);assert.equal(reentry.capture.error,0);assert(reentry.capture.programLinked);
 if(terminal)assert.equal(reentry.capture.quality,'rest');
 const stopped=await page.evaluate(()=>{const p=window.__visibilityRound24;p.fixture.handle.stop();const before=p.snapshot();p.fixture.shell.style.transform='translateY(4000px)';return before;});
 await settleIntersection(page,'canvas',false);await page.evaluate(()=>{window.__visibilityRound24.fixture.shell.style.transform='';});await settleIntersection(page,'canvas',true);
 assert.equal((await page.evaluate(()=>window.__visibilityRound24.snapshot())).drawElements,stopped.drawElements);
 return {setup,hidden,restored,reentry,stopped,latestPoseRestored:true,stoppedMountDidNotRepaint:true,pixelCapture:reentry.capture};
}

async function suppliedMotionCase(page,hz){
 const setup=await page.evaluate(componentFixture,{rolling:true});await settleIntersection(page,'canvas',true);
 const result=await page.evaluate(hz=>{
  const probe=window.__visibilityRound24,M=probe.modules.motion,{handle,row,gl}=probe.fixture;
  let draw,elapsed=0;const sounds=[],rest=[],trace=[],before=probe.snapshot();
  const stop=M.animateDice(113,sound=>sounds.push({elapsed,sound}),(poses,landed)=>handle.draw(landed?undefined:poses),{play(duration,callback){if(duration!==M.THROW_DURATION)throw Error('Unexpected throw duration');draw=callback;return()=>{};}},()=>rest.push(elapsed));
  const times=[];for(let index=0;index*1000/hz<M.THROW_DURATION;index++)times.push(index*1000/hz);times.push(M.THROW_DURATION);
  for(const time of times){elapsed=time;draw(time);trace.push({elapsed,dom:[...row.querySelectorAll('.cube-die')].map(d=>[...d.querySelectorAll('.die-flight,.die-cube,.die-shadow')].map(n=>n.getAttribute('style')))});}
  const capture=probe.capture(gl),after=probe.snapshot();stop();handle.stop();return {hz,suppliedCallbacks:times.length,before,after,sounds,rest,trace,pixelCapture:capture};
 },hz);
 assert(result.pixelCapture.opaquePixels>0);assert.equal(result.pixelCapture.error,0);assert.equal(result.pixelCapture.quality,'rest');assert.equal(result.rest.length,1);
 return {setup,...result,kind:'SUPPLIED_TIMESTAMPS_WITH_NATIVE_GL_NOT_MONITOR_HZ'};
}

async function effectsOffscreenCase(page,current){
 const setup=await page.evaluate(componentFixture,{effects:true});await settleIntersection(page,'fx',true);
 await page.waitForFunction(()=>Number(window.__visibilityRound24.fixture.fx.dataset.fxFrames)>0);
 await page.evaluate(()=>{window.__visibilityRound24.fixture.shell.style.transform='translateY(4000px)';});await settleIntersection(page,'fx',false);
 const before=await page.evaluate(()=>{const p=window.__visibilityRound24;return {counts:p.snapshot(),elapsed:p.presentation.status.elapsed,active:p.presentation.status.active};});assert(before.active,'Effect must still be active when hidden window begins');
 await page.waitForTimeout(170);
 const hidden=await page.evaluate(()=>{const p=window.__visibilityRound24;return {counts:p.snapshot(),elapsed:p.presentation.status.elapsed,active:p.presentation.status.active};});assert(hidden.active,'Effect must retain time for the visible reentry check');assert(hidden.elapsed>before.elapsed);
 if(current){assert.equal(hidden.counts.fxCalls,before.counts.fxCalls);assert.equal(hidden.counts.materialCalls,before.counts.materialCalls);}else assert(hidden.counts.fxCalls>before.counts.fxCalls);
 await page.evaluate(()=>{window.__visibilityRound24.fixture.shell.style.transform='';});await settleIntersection(page,'fx',true);
 await page.waitForFunction(before=>window.__visibilityRound24.fxCalls>before,hidden.counts.fxCalls);
 const visible=await page.evaluate(()=>{const p=window.__visibilityRound24;return {counts:p.snapshot(),elapsed:p.presentation.status.elapsed,canvasElapsed:Number(p.fixture.fx.dataset.fxElapsed)};});assert(visible.elapsed>=hidden.elapsed);
 await page.waitForFunction(()=>!window.__visibilityRound24.presentation.status.active);
 const complete=await page.evaluate(()=>{const p=window.__visibilityRound24;return {counts:p.snapshot(),status:p.presentation.status,canvasLifecycle:p.fixture.fx.dataset.fxLifecycle};});assert.equal(complete.status.reason,'complete');
 await page.evaluate(()=>{window.__visibilityRound24.fixture.shell.style.transform='translateY(4000px)';});await settleIntersection(page,'fx',false);
 await page.evaluate(()=>{window.__visibilityRound24.fixture.shell.style.transform='';});await settleIntersection(page,'fx',true);
 assert.equal((await page.evaluate(()=>window.__visibilityRound24.snapshot())).fxCalls,complete.counts.fxCalls);
 return {setup,before,hidden,visible,complete,noExpiredReplay:true,clockContinuedWhileOffscreen:true};
}

async function appOffscreenRoll(page,variant){
 const E=await import(pathToFileURL(path.join(variant.root,'src/engine.js'))),S=await import(pathToFileURL(path.join(variant.root,'src/storage.js')));
 let state=E.newGame(24024);state.runId='qa-round24-native-offscreen-roll';state.player.level=80;state.player.hp=E.stats(state).maxHp;
 state=E.transition(state,{type:'fate'});state.route[0].type='combat';state=E.transition(state,{type:'enter'});state.enemy.hp=state.enemy.maxHp=1000000;assert(S.validateSave(state));assert.equal(E.diceCount(state),6);
 const expected=E.transition(state,{type:'roll'});assert.equal(expected.phase,'combat');
 const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
 await page.evaluate(({raw,keys})=>{localStorage.setItem(keys.main,raw);localStorage.setItem(keys.mirror,raw);localStorage.setItem(keys.settings,JSON.stringify({effects:'full',sound:false,scale:1}));},{raw:S.encodeSave(state),keys});
 await page.reload();await page.evaluate(()=>document.fonts.ready);await page.locator('[data-action="continue"]').click();await page.locator('.cube-row').scrollIntoViewIfNeeded();
 await page.evaluate(installProbe);
 await page.evaluate(()=>{const p=window.__visibilityRound24;p.active=true;p.captureAppRest=true;document.addEventListener('click',event=>{if(event.target.closest('#primary-action'))p.trustedRoll=event.isTrusted;},true);});
 await page.locator('#primary-action').click();await page.locator('.cube-row.rolling').waitFor({state:'visible'});
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 await page.waitForFunction(()=>{const canvas=document.querySelector('.dice-surface');if(!canvas)return false;const box=canvas.getBoundingClientRect();return box.bottom<=0||box.top>=innerHeight;});
 const hidden=await page.evaluate(()=>({scrollY,canvasBox:document.querySelector('.dice-surface').getBoundingClientRect().toJSON(),busy:document.querySelector('#current-room').classList.contains('busy')}));assert(hidden.busy,'Scroll-away must occur while the committed action is still being presented');
 await page.waitForFunction(()=>!document.querySelector('#current-room').classList.contains('busy'),null,{timeout:15000});
 const saved=await page.evaluate(keys=>({main:localStorage.getItem(keys.main),mirror:localStorage.getItem(keys.mirror)}),keys);assert.deepEqual(S.decodeSave(saved.main),expected);assert.equal(saved.main,saved.mirror);
 await page.locator('.cube-row').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
 const visible=await page.evaluate(()=>{const p=window.__visibilityRound24,canvas=document.querySelector('.dice-surface'),row=document.querySelector('.cube-row');return {trustedRoll:p.trustedRoll,values:[...row.querySelectorAll('.cube-die')].map(d=>Number(d.dataset.value)),canvasBox:canvas.getBoundingClientRect().toJSON(),quality:canvas.dataset.motionQuality,gpu:row.classList.contains('gpu-dice'),primaryEnabled:!document.querySelector('#primary-action').disabled,restCapture:p.restCaptures.at(-1),restCaptureCount:p.restCaptures.length,counts:p.snapshot(),bodyText:document.body.innerText.length};});
 assert.equal(visible.trustedRoll,true);assert.deepEqual(visible.values,expected.lastRoll.values);assert.equal(visible.quality,'rest');assert(visible.gpu);assert(visible.primaryEnabled);assert(visible.bodyText>100);assert(visible.restCapture?.opaquePixels>0);
 return {kind:'NATIVE_MANUAL_CLICK_WITH_SYNTHETIC_VALID_SAVE',fixtureSha256:sha(state),expectedSaveSha256:sha(expected),hidden,visible,pixelCapture:visible.restCapture,savedExact:true,mirrorExact:true,latestFacesVisible:true};
}

async function main(){
 const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
 if(args['--help']){console.log('PLAYWRIGHT_MODULE=/abs/playwright/index.js CHROMIUM_PATH=/abs/chromium node scripts/qa-surface-visibility-round24.mjs --baseline-root=/abs/input --current-root=/abs/current --baseline-url=http://127.0.0.1:4194/ --current-url=http://127.0.0.1:4195/ --output=/abs/external-directory [--case=motion-160]');return;}
 for(const name of ['--baseline-root','--current-root','--baseline-url','--current-url','--output'])assert.equal(typeof args[name],'string',name);
 const variants=[{name:'baseline',root:path.resolve(args['--baseline-root']),url:args['--baseline-url']},{name:'current',root:path.resolve(args['--current-root']),url:args['--current-url']}];
 for(const variant of variants)assert(['127.0.0.1','localhost'].includes(new URL(variant.url).hostname),'Only explicit loopback game origins are permitted');
 const output=path.resolve(args['--output']);for(const variant of variants)assert(output!==variant.root&&!output.startsWith(variant.root+path.sep),'Write all observations outside the source trees');await fs.mkdir(output,{recursive:true});
 const cases=['motion-160','motion-240','gpu-offscreen','gpu-offscreen-terminal','gpu-offscreen-context-restore','gpu-no-intersection-observer','fx-offscreen','app-offscreen-complete-roll'];
 if(args['--case'])assert(cases.includes(args['--case']),'Unknown --case');
 const reportFile=path.join(output,'surface-visibility-round24.json');
 await fs.writeFile(reportFile,JSON.stringify({kind:'NATIVE_GL_AND_VISIBILITY_ACCEPTANCE_NOT_FPS',status:'STARTING',started:new Date().toISOString()})+'\n',{flag:'wx'});
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={kind:'NATIVE_GL_AND_VISIBILITY_ACCEPTANCE_NOT_FPS',started:new Date().toISOString(),browser:browser.version(),scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),contextConcurrency:1,cases:[],pairs:[],errors:[],notes:[
  'Every component uses the production module and native WebGL/Canvas/IntersectionObserver APIs; wrappers count actual native calls.',
  'Motion 160/240 Hz denotes supplied timestamps. It does not assert a monitor refresh rate or measured FPS.',
  'Offscreen culling skips submissions after the first observer delivery. Initial unknown visibility remains conservatively drawable.',
  'The full-app action uses a trusted native click and an isolated valid synthetic save, never a private user save.',
  'Raw complete RGBA includes transparent RGB and alpha. Exact mismatch is retained without tolerance changes.',
 ]};
 const captures=new Map();
 const persistCapture=async (capture,name)=>{
  if(!capture)return null;const rgba=Buffer.from(capture.rgbaBase64,'base64');assert.equal(rgba.length,capture.width*capture.height*4);
  const filename=`${name}.rgba.gz`;await fs.writeFile(path.join(output,filename),gzipSync(rgba));captures.set(name,rgba);
  const {rgbaBase64,...metadata}=capture;return {...metadata,rgbaFile:filename,rgbaBytes:rgba.length,rgbaSha256:sha(rgba)};
 };
 try{
  for(const name of cases){if(args['--case']&&args['--case']!==name)continue;
   for(const variant of variants){
    const row={name,variant:variant.name,status:'RUNNING'};report.cases.push(row);
    const context=await browser.newContext({viewport:name==='app-offscreen-complete-roll'?{width:480,height:840}:{width:1280,height:800},deviceScaleFactor:1});
    await context.route('**/*',route=>{const url=new URL(route.request().url());return ['data:','about:'].includes(url.protocol)||url.origin===new URL(variant.url).origin?route.continue():route.abort();});
    const page=await context.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',error=>report.errors.push({name,variant:variant.name,type:'pageerror',message:error.message}));
    row.console=[];page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
    try{
     await page.goto(variant.url);await page.evaluate(()=>document.fonts.ready);
     row.identity={url:page.url(),title:await page.title(),release:await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),bodyTextCharacters:(await page.locator('body').innerText()).length,frameworkOverlays:await page.locator('vite-error-overlay,nextjs-portal,webpack-dev-server-client-overlay').count()};
     assert(row.identity.title.includes('骰'));assert(row.identity.bodyTextCharacters>100);assert.equal(row.identity.frameworkOverlays,0);row.sources=await sourceIdentity(page,variant.root);
     if(name==='app-offscreen-complete-roll')row.result=await appOffscreenRoll(page,variant);
     else{
      row.environment=await page.evaluate(installProbe);
      if(name.startsWith('motion-'))row.result=await suppliedMotionCase(page,Number(name.split('-')[1]));
      else if(name==='fx-offscreen')row.result=await effectsOffscreenCase(page,variant.name==='current');
      else row.result=await gpuOffscreenCase(page,{current:variant.name==='current',noIO:name.includes('no-intersection'),restore:name.includes('restore'),terminal:name.includes('terminal')||name.includes('restore')});
     }
     if(row.result.pixelCapture){row.result.pixelCapture=await persistCapture(row.result.pixelCapture,`${variant.name}-${name}`);if(row.result.reentry)row.result.reentry.capture=row.result.pixelCapture;if(row.result.visible?.restCapture)row.result.visible.restCapture=row.result.pixelCapture;}
     if(row.result.trace){row.result.traceSha256=sha(row.result.trace);delete row.result.trace;}
     const screenshot=`${variant.name}-${name}.png`;await page.screenshot({path:path.join(output,screenshot)});row.screenshot=screenshot;
     assert.equal(row.console.filter(entry=>entry.type==='error').length,0,'Relevant browser console errors must not be silently ignored');row.status='PASS';
    }catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;const screenshot=`FAIL-${variant.name}-${name}.png`;await page.screenshot({path:path.join(output,screenshot)}).catch(()=>{});row.screenshot=screenshot;}
    finally{await context.close();await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');}
    console.log(`${variant.name} ${name}: ${row.status}`);
   }
   const pair=report.cases.filter(row=>row.name===name);if(pair.length===2&&pair.every(row=>row.status==='PASS')){
    const [before,after]=pair;const comparison={name,status:'PASS',functionalStatus:'PASS',strictRGBAStatus:'NOT_APPLICABLE'};
    if(name.startsWith('motion-')){
     comparison.nativeDrawElements=[before.result.after.drawElements-before.result.before.drawElements,after.result.after.drawElements-after.result.before.drawElements];
     comparison.skippedNativeDraws=comparison.nativeDrawElements[0]-comparison.nativeDrawElements[1];comparison.domTraceEqual=before.result.traceSha256===after.result.traceSha256;comparison.soundTimesEqual=sha(before.result.sounds)===sha(after.result.sounds);
     if(!comparison.domTraceEqual||!comparison.soundTimesEqual||comparison.skippedNativeDraws<=0)comparison.status=comparison.functionalStatus='FAIL';
    }
    const a=captures.get(`baseline-${name}`),b=captures.get(`current-${name}`);if(a&&b){comparison.exactRGBA=comparePixelBuffers(a,b);comparison.strictRGBAStatus=comparison.exactRGBA.exact?'PASS':'FAIL';if(!comparison.exactRGBA.exact)comparison.status='FAIL';}
    report.pairs.push(comparison);
   }
  }
 }finally{
  await browser.close();report.finished=new Date().toISOString();report.summary={cases:report.cases.length,passed:report.cases.filter(row=>row.status==='PASS').length,failed:report.cases.filter(row=>row.status==='FAIL').length,pairChecks:report.pairs.length,pairFailures:report.pairs.filter(row=>row.status==='FAIL').length,functionalPairFailures:report.pairs.filter(row=>row.functionalStatus==='FAIL').length,strictRGBAFailures:report.pairs.filter(row=>row.strictRGBAStatus==='FAIL').length,runtimeErrors:report.errors.length};
  await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));if(report.summary.failed||report.summary.pairFailures||report.summary.runtimeErrors)process.exitCode=1;
 }
}

export {installProbe,sourceIdentity,suppliedMotionCase};

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
