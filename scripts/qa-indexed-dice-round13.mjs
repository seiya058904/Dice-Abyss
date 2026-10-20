// Deterministic renderer verification only. App startup is replaced with an
// empty test response on loopback, then real renderer modules and styles draw
// an explicit DOM fixture. readPixels/PNG synchronization excludes timing claims.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
assert(args['--baseline-source'],'--baseline-source=/absolute/immutable/input is required');
const variants=[{label:'baseline',source:path.resolve(args['--baseline-source']),url:args['--baseline-url']||'http://127.0.0.1:4188/'},{label:'current',source:path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),url:args['--url']||'http://127.0.0.1:4189/'}];
for(const variant of variants)assert(['127.0.0.1','localhost'].includes(new URL(variant.url).hostname),'Only isolated loopback origins are permitted');
assert(process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_PATH,'Use the declared browser runtime paths');
const modulePath=process.env.PLAYWRIGHT_MODULE.endsWith('.mjs')||process.env.PLAYWRIGHT_MODULE.endsWith('.js')?process.env.PLAYWRIGHT_MODULE:path.join(process.env.PLAYWRIGHT_MODULE,'index.mjs');
const {chromium}=await import(pathToFileURL(modulePath));
const output=path.resolve(args['--output']||'/tmp/dice-indexed-browser-round13');
await fs.mkdir(output,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const report={kind:'DETERMINISTIC_RENDERER_READBACK_NOT_GAMEPLAY_OR_TIMING',started:new Date().toISOString(),scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),cases:[],restorations:[],errors:[],environments:[],sourceBefore:{},sourceAfter:{},notes:[
  'Both variants load their actual index and CSS from verified loopback source; app.js is explicitly replaced by an empty response so the diagnostic owns the DOM. This is not natural gameplay.',
  'One complete six-face DOM die per record, fixed dimensions/values/colors and deterministic motion poses are supplied. The production mountDiceSurface implementation performs every native WebGL draw.',
  'Full RGBA drawing-buffer bytes are hashed immediately after a real draw. Pixel readback and PNG encoding deliberately synchronize graphics work; no elapsed values are used as performance evidence.',
  'The same complete bytes must match across versions at every case. Backing size, pose/record data, nonzero alpha, native draw methods and GL errors are retained.',
  'Three native WEBGL_lose_context cycles per version verify fresh resources and identical redraws. Mock failure coverage is a separate audit.',
  'Two native RAFs after static draw/stop check that idle renderer work does not continue; this does not measure display FPS or OS/device power behavior.',
]};
const save=()=>fs.writeFile(path.join(output,'indexed-browser.json'),JSON.stringify(report,null,2)+'\n');
const sourceFiles=['index.html','src/dice-renderer.js','src/dice-motion.js','src/visual-timeline.js'];
const sourceIdentity=async(variant,files)=>Promise.all(files.map(async file=>{const bytes=await fs.readFile(path.join(variant.source,file));return{file,bytes:bytes.length,sha256:hash(bytes)};}));
const cases=[
  {name:'phone-one-rest',viewport:[390,844],count:1,size:100,width:300,height:164,pose:null},
  {name:'phone-six-rest',viewport:[390,844],count:6,size:36,width:350,height:120,pose:null},
  {name:'desktop-two-rest',viewport:[1366,768],count:2,size:170,width:900,height:234,pose:null},
  {name:'fullhd-six-rest',viewport:[1920,1080],count:6,size:160,width:1540,height:224,pose:null,png:true},
  {name:'fourk-six-rest',viewport:[3840,2160],count:6,size:320,width:3080,height:384,pose:null},
  {name:'fourk-six-flight',viewport:[3840,2160],count:6,size:320,width:3080,height:384,pose:45,png:true},
  {name:'fourk-six-settling',viewport:[3840,2160],count:6,size:320,width:3080,height:384,pose:110},
];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const entries=[];
async function readPixels(page,includePng=false){
  return page.evaluate(async includePng=>{
    const fixture=window.__indexedDiceFixture,canvas=fixture.canvas,gl=fixture.gl;
    fixture.handle.draw(fixture.poses);
    const rgba=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    const error=gl.getError(),png=includePng?canvas.toDataURL('image/png').split(',')[1]:null;
    let opaquePixels=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i])opaquePixels++;
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(value=>value.toString(16).padStart(2,'0')).join('');
    return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,rgbaBytes:rgba.byteLength,sha256,opaquePixels,error,poses:fixture.poses,records:fixture.records,pixelBudget:Number(canvas.dataset.pixelBudget),motionQuality:canvas.dataset.motionQuality,meshDataset:{vertices:canvas.dataset.meshVertices??null,indices:canvas.dataset.meshIndices??null,bytes:canvas.dataset.meshBytes??null},probe:structuredClone(window.__indexedDiceProbe),...(png?{png}: {})};
  },includePng);
}
async function idleCheck(page,stop=false){
  return page.evaluate(async stop=>{
    const fixture=window.__indexedDiceFixture;if(stop){fixture.handle.stop();fixture.handle.stop();}
    const before=structuredClone(window.__indexedDiceProbe.draws);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {before,after:structuredClone(window.__indexedDiceProbe.draws)};
  },stop);
}
try{
  for(const variant of variants){
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    await context.route('**/src/app.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:'// Renderer-only verification: no application state or startup.'}));
    const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(30000);
    page.on('pageerror',error=>report.errors.push({label:variant.label,type:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error')report.errors.push({label:variant.label,type:'console',message:message.text()});});
    await page.goto(variant.url);await page.evaluate(async()=>{await Promise.all([document.fonts.load('16px "Abyss Text"','骰'),document.fonts.load('96px "Abyss Pixel"','123456')]);await document.fonts.ready;});
    const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>new URL(link.href).pathname.replace(/^\//,'')));
    const files=[...new Set([...sourceFiles,...styles])];for(const file of files)assert(!file.includes('..')&&!path.isAbsolute(file));
    const identity=await sourceIdentity(variant,files);report.sourceBefore[variant.label]=identity;
    for(const file of identity){const response=await context.request.get(new URL(file.file,variant.url).href);assert.equal(response.status(),200);const bytes=await response.body();assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256,'Every served runtime/style byte must match its declared local source');}
    const environment=await page.evaluate(async()=>{
      const probe=window.__indexedDiceProbe={uploads:[],draws:{arrays:0,elements:0},elementCounts:[]};
      const prototype=WebGLRenderingContext.prototype;
      for(const name of ['drawArrays','drawElements']){const original=prototype[name];prototype[name]=function(...args){if(this.canvas.className==='dice-surface'){probe.draws[name==='drawArrays'?'arrays':'elements']++;if(name==='drawElements')probe.elementCounts.push({mode:args[0],count:args[1],type:args[2],offset:args[3]});}return original.apply(this,args);};}
      const original=prototype.bufferData;prototype.bufferData=function(...args){if(this.canvas.className==='dice-surface')probe.uploads.push({target:args[0],bytes:typeof args[1]==='number'?args[1]:args[1].byteLength,type:args[1]?.constructor?.name,usage:args[2]});return original.apply(this,args);};
      window.__indexedDiceModules={renderer:await import(new URL('src/dice-renderer.js',location.href)),motion:await import(new URL('src/dice-motion.js',location.href))};
      return {url:location.href,title:document.title,ua:navigator.userAgent,dpr:devicePixelRatio,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')]};
    });
    assert(environment.fonts.every(Boolean));report.environments.push({label:variant.label,browser:await browser.version(),...environment});entries.push({variant,context,page,files});
  }
  for(let index=0;index<cases.length;index++){
    const scene=cases[index],ordered=index%2?[...entries].reverse():entries,results={};
    for(const entry of ordered){
      const {page,variant}=entry;await page.setViewportSize({width:scene.viewport[0],height:scene.viewport[1]});
      await page.evaluate(scene=>{
        window.__indexedDiceFixture?.handle.stop();
        const row=document.createElement('div');row.className='cube-row';row.style.cssText=`position:relative;display:block;transform:none;perspective:none;box-sizing:content-box;border:0;padding:0;margin:20px;width:${scene.width}px;height:${scene.height}px;max-width:none;min-height:0;`;
        for(let index=0;index<scene.count;index++){
          const die=document.createElement('div');die.className='cube-die';die.style.cssText=`position:absolute;box-sizing:content-box;border:0;padding:0;margin:0;left:${scene.width/2+(index-(scene.count-1)/2)*scene.size*1.5-scene.size/2}px;top:20px;width:${scene.size}px;height:${scene.size+30}px;max-width:none;transform:none;color:${['rgb(234,198,98)','rgb(136,191,230)','rgb(233,109,121)','rgb(198,233,255)','rgb(160,220,197)','rgb(196,148,231)'][index]};`;
          for(let face=0;face<6;face++){const element=document.createElement('span');element.className='cube-face';element.dataset.face=String((index+face)%6+1);element.textContent=element.dataset.face;die.append(element);}row.append(die);
        }
        document.body.replaceChildren(row);const {renderer,motion}=window.__indexedDiceModules,handle=renderer.mountDiceSurface();if(!handle)throw Error('Native WebGL renderer unavailable');
        const poses=scene.pose===null?undefined:motion.throwFrames(scene.count,713,1.5,Math.max(.8,scene.width/scene.size/2-.66))[scene.pose].dice;
        const canvas=row.querySelector('.dice-surface'),gl=canvas.getContext('webgl');
        const bounds=row.getBoundingClientRect(),records=[...row.querySelectorAll('.cube-die')].map(die=>{const b=die.getBoundingClientRect();return{x:b.x-bounds.x+b.width/2-bounds.width/2,y:b.y-bounds.y+b.width/2-bounds.height/2,size:b.width,color:getComputedStyle(die).color,values:[...die.querySelectorAll('.cube-face')].map(face=>Number(face.dataset.face))};});
        window.__indexedDiceFixture={handle,canvas,gl,poses,records};
      },scene);
      const result=await readPixels(page,!!scene.png);assert.equal(result.error,0);assert(result.opaquePixels>scene.count*20,'Real nontransparent 3D raster output must be present');assert(result.width*result.height<=result.pixelBudget);
      result.idle=await idleCheck(page);assert.deepEqual(result.idle.after,result.idle.before,'Static renderer must not keep redrawing between native frames');
      if(variant.label==='current'){assert(result.probe.draws.elements>0);assert.equal(result.probe.draws.arrays,0);assert.equal(Number(result.meshDataset.vertices),1014);assert.equal(Number(result.meshDataset.indices),5184);assert.equal(Number(result.meshDataset.bytes),46872);assert(result.probe.elementCounts.every(draw=>draw.mode===4&&draw.count===5184&&draw.type===5123&&draw.offset===0));}
      else{assert(result.probe.draws.arrays>0);assert.equal(result.probe.draws.elements,0);}
      if(result.png){const file=`${variant.label}-${scene.name}.png`;await fs.writeFile(path.join(output,file),Buffer.from(result.png,'base64'));delete result.png;result.pngFile=file;}
      results[variant.label]=result;
    }
    for(const key of ['width','height','rgbaBytes','sha256','opaquePixels','pixelBudget','motionQuality'])assert.equal(results.current[key],results.baseline[key],`${scene.name}: exact ${key} equivalence`);
    assert.deepEqual(results.current.poses,results.baseline.poses);assert.deepEqual(results.current.records,results.baseline.records);
    report.cases.push({scene,order:ordered.map(entry=>entry.variant.label),results,allPixelBytesEqual:true});await save();console.log(`${scene.name}: exact RGBA SHA-256 match, ${results.current.opaquePixels} drawn pixels`);
  }
  for(const {page,variant} of entries){
    const original=await readPixels(page),debug=await page.evaluate(()=>{const gl=window.__indexedDiceFixture.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null};});
    report.environments.find(row=>row.label===variant.label).graphics=debug;
    for(let cycle=1;cycle<=3;cycle++){
      const lost=await page.evaluate(async()=>{
        const fixture=window.__indexedDiceFixture,extension=fixture.gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('WEBGL_lose_context not exposed');fixture.extension=extension;
        let timer;try{await Promise.race([new Promise(resolve=>{fixture.canvas.addEventListener('webglcontextlost',resolve,{once:true});extension.loseContext();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native context loss deadline')),10000);})]);}finally{clearTimeout(timer);}
        return{state:fixture.canvas.dataset.contextState,gpu:fixture.canvas.parentElement.classList.contains('gpu-dice')};
      });assert.equal(lost.state,'lost');assert.equal(lost.gpu,false);
      const restored=await page.evaluate(async()=>{
        const fixture=window.__indexedDiceFixture,before=structuredClone(window.__indexedDiceProbe.draws);let timer;
        try{await Promise.race([new Promise(resolve=>{fixture.canvas.addEventListener('webglcontextrestored',resolve,{once:true});fixture.extension.restoreContext();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native context restoration deadline')),10000);})]);}finally{clearTimeout(timer);}
        return{state:fixture.canvas.dataset.contextState,gpu:fixture.canvas.parentElement.classList.contains('gpu-dice'),drawsBefore:before,drawsAfter:structuredClone(window.__indexedDiceProbe.draws)};
      });assert.equal(restored.state,'ready');assert.equal(restored.gpu,true);
      const method=variant.label==='current'?'elements':'arrays';assert.equal(restored.drawsAfter[method]-restored.drawsBefore[method],cases.at(-1).count,'Native restoration must draw the current complete scene');
      const result=await readPixels(page);assert.equal(result.error,0);assert.equal(result.sha256,original.sha256,'Restored native context must reproduce all RGBA bytes');assert(result.opaquePixels>0);
      report.restorations.push({label:variant.label,cycle,lost,restored,result});await save();
    }
    const stopped=await idleCheck(page,true);assert.deepEqual(stopped.before,stopped.after,'Double-stop must leave no continuing draws');
  }
  for(const entry of entries){report.sourceAfter[entry.variant.label]=await sourceIdentity(entry.variant,entry.files);assert.deepEqual(report.sourceAfter[entry.variant.label],report.sourceBefore[entry.variant.label]);}
  assert.equal(report.errors.length,0);report.status='PASS_RENDERER_EQUIVALENCE';report.summary={exactPixelPairs:report.cases.length,nativeRecoveryCycles:report.restorations.length,errors:0,performanceClaim:false,naturalGameplayClaim:false};
}catch(error){report.status='FAILED';report.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{report.finished=new Date().toISOString();await save();for(const {context}of entries)await context.close();await browser.close();}
console.log(JSON.stringify({output:path.join(output,'indexed-browser.json'),status:report.status,...report.summary,...(report.failure?{failure:report.failure.message}:{})},null,2));
