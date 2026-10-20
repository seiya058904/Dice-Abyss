// Native WebGL loss/restore on the running game, then one real manual action.
// Synthetic disposable saves; functional restoration evidence, not FPS or strict RGBA.
// Immediate post-draw readback is confined to the three restoration cycles.
// --baseline-source=/abs/input --source=/abs/current --baseline-url=http://127.0.0.1:4188/
// --url=http://127.0.0.1:4189/ --output=/abs/fresh-external-directory
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');assert(at>0);return [value.slice(2,at),value.slice(at+1)];}));
const output=path.resolve(args.output),variants=[{name:'baseline',root:path.resolve(args['baseline-source']),url:args['baseline-url']},{name:'current',root:path.resolve(args.source),url:args.url}];
for(const v of variants){assert(['localhost','127.0.0.1'].includes(new URL(v.url).hostname));assert(output!==v.root&&!output.startsWith(v.root+path.sep));}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const report={status:'RUNNING',started:new Date().toISOString(),scriptSha256:sha(await fs.readFile(new URL(import.meta.url))),scope:'Real WebGL_lose_context events and production restoration on an idle visible game canvas, followed by a native manual fate action. Native draw calls are counted; only restoration draws are sampled synchronously for a nontransparent framebuffer and GL errors. A first nontransparent partial draw is not a complete dice-image or strict pixel-equivalence oracle. Readback is functional instrumentation, never a timing sample. No physical-GPU or speed claim.',cases:[],errors:[],warnings:[]};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
 for(const v of variants){
  const row={name:v.name,status:'RUNNING',cycles:[],checks:0};report.cases.push(row);await save();
  const check=(value,label)=>{row.checks++;assert(value,label);};
  const eq=(actual,expected,label)=>{row.checks++;assert.deepEqual(actual,expected,label);};
  const [E,S]=await Promise.all(['engine','storage'].map(name=>import(pathToFileURL(path.join(v.root,'src',name+'.js')))));
  const state=E.newGame(251025);state.runId='round25-native-context';check(S.validateSave(state),'The synthetic initial state is valid');
  const raw=S.encodeSave(state),files=['src/app.js','src/dice-renderer.js','src/dice-motion.js','src/effects.js','src/engine.js','src/storage.js'];
  row.sourceBefore=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(path.join(v.root,f)))])));
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
  try{
   await context.route('**/*',r=>r.request().url().startsWith(new URL(v.url).origin+'/')?r.continue():r.abort());
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push({variant:v.name,kind:'pageerror',error:String(e)}));
   page.on('console',message=>{if(message.type()==='error')report.errors.push({variant:v.name,kind:'console-error',error:message.text()});else if(message.type()==='warning')report.warnings.push({variant:v.name,message:message.text()});});
   await page.goto(v.url);await page.evaluate(({raw,keys})=>{localStorage.clear();localStorage.setItem(keys[0],raw);localStorage.setItem(keys[1],raw);localStorage.setItem(keys[2],JSON.stringify({sound:false,effects:'low',scale:1}));},{raw,keys:[S.SAVE_KEY,S.BACKUP_KEY,S.SETTINGS_KEY]});
   await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>document.querySelector('#current-room .dice-surface')?.dataset.contextState==='ready');
   const served=await page.evaluate(async files=>Object.fromEntries(await Promise.all(files.map(async file=>{
    const response=await fetch(new URL(file,location.href),{cache:'no-store'});if(!response.ok)throw Error(file+': '+response.status);return [file,[...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('')];
   }))),files);eq(served,row.sourceBefore,'The live browser runs the declared source bytes');
   const records=()=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[S.SAVE_KEY,S.BACKUP_KEY]);
   await page.evaluate(()=>{
    const canvas=document.querySelector('#current-room .dice-surface'),gl=canvas.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('WEBGL_lose_context unavailable');
    const probe=window.__round25Context={canvas,gl,extension,draws:0,lost:0,restored:0,sampleRestoration:false,readback:null};
    const draw=gl.drawElements;gl.drawElements=function(...args){
     const result=draw.apply(this,args);probe.draws++;
     if(probe.sampleRestoration){
      const capture=probe.readback;
      try{
       const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4),drawError=gl.getError();
       // Read in the same native draw call: preserveDrawingBuffer is false, so
       // a later page.evaluate/readPixels could observe a cleared backbuffer.
       gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const readError=gl.getError();
       let nontransparent=0,alphaSum=0;for(let i=3;i<rgba.length;i+=4){if(rgba[i])nontransparent++;alphaSum+=rgba[i];}
       const sample={draw:probe.draws,width,height,rgbaBytes:rgba.length,nontransparent,alphaSum,drawError,readError};capture.attempts.push(sample);
       if(nontransparent>0){
        probe.sampleRestoration=false;capture.sample=sample;
        capture.digest=crypto.subtle.digest('SHA-256',rgba).then(value=>[...new Uint8Array(value)].map(n=>n.toString(16).padStart(2,'0')).join('')).catch(error=>{capture.error=String(error);return null;});
       }
      }catch(error){capture.error=String(error);probe.sampleRestoration=false;}
     }
     return result;
    };
    canvas.addEventListener('webglcontextlost',()=>probe.lost++);canvas.addEventListener('webglcontextrestored',()=>probe.restored++);
   });
   for(let cycle=1;cycle<=3;cycle++){
    await page.evaluate(()=>window.__round25Context.extension.loseContext());
    await page.waitForFunction(()=>window.__round25Context.canvas.dataset.contextState==='lost');
    check(await page.evaluate(()=>{const p=window.__round25Context;return p.gl.isContextLost()&&!p.canvas.parentElement.classList.contains('gpu-dice')&&p.canvas.parentElement.querySelectorAll('.cube-die').length===2;}),'Loss exposes the existing two-dice DOM fallback');
    eq(await records(),[raw,raw],'Both complete persisted snapshots remain unchanged after loss');
    const drawBeforeRestore=await page.evaluate(()=>{const p=window.__round25Context;p.readback={attempts:[],sample:null,digest:null,error:null};p.sampleRestoration=true;return p.draws;});
    await page.evaluate(()=>window.__round25Context.extension.restoreContext());
    await page.waitForFunction(()=>{const p=window.__round25Context;return p.canvas.dataset.contextState==='ready'&&p.canvas.parentElement.classList.contains('gpu-dice')&&!p.gl.isContextLost();});
    const result=await page.evaluate(async()=>{const p=window.__round25Context,capture=p.readback,rgbaSha256=capture.digest?await capture.digest:null;p.sampleRestoration=false;p.readback=null;return {draws:p.draws,lost:p.lost,restored:p.restored,width:p.canvas.width,height:p.canvas.height,connected:p.canvas.isConnected,readback:{attempts:capture.attempts,sample:capture.sample?{...capture.sample,rgbaSha256}:null,error:capture.error}};});
    result.cycle=cycle;result.status='CAPTURED';result.drawBeforeRestore=drawBeforeRestore;row.cycles.push(result);
    check(result.draws>drawBeforeRestore&&result.width>0&&result.height>0&&result.connected,'The production restore callback submits to a connected nonzero-sized buffer after the confirmed loss');
    check(result.readback.sample?.draw>drawBeforeRestore&&result.readback.sample.nontransparent>0&&/^[0-9a-f]{64}$/.test(result.readback.sample.rgbaSha256||''),'At least one restored native draw has a captured nontransparent framebuffer');
    check(!result.readback.error&&result.readback.attempts.length>0&&result.readback.attempts.every(sample=>sample.drawError===0&&sample.readError===0),'Restoration readback attempts report no draw/read GL errors or capture exception');
    eq([result.lost,result.restored],[cycle,cycle],'Each native cycle delivers one loss and one restoration');
    eq(await records(),[raw,raw],'Both complete persisted snapshots remain unchanged after restoration');result.status='PASS';
   }
   const expected=E.transition(state,{type:'fate'});await page.locator('#primary-action').click();
   await page.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key:S.SAVE_KEY,raw:S.encodeSave(expected)});await page.locator('#primary-action:not(:disabled)').waitFor();
   eq((await records()).map(S.decodeSave),[expected,expected],'The restored game accepts exactly one subsequent manual action');
   eq(await page.locator('.game-shell').getAttribute('data-scene'),expected.phase,'The visible route agrees with the committed result');
   for(const file of files)eq(sha(await fs.readFile(path.join(v.root,file))),row.sourceBefore[file],'Source is frozen: '+file);
   row.stateSha256=sha(expected);row.status='PASS';
  }catch(error){row.status='FAIL';row.error=String(error);throw error;}
  finally{await context.close();await save();}
 }
 assert.equal(report.errors.length,0);report.status='PASS';
}catch(error){report.status='FAIL';report.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{report.finished=new Date().toISOString();await save();await browser?.close();}
console.log(JSON.stringify({status:report.status,cases:report.cases.map(r=>({name:r.name,status:r.status,cycles:r.cycles.length,checks:r.checks})),errors:report.errors,warnings:report.warnings,failure:report.failure}));
