// Deterministic native-WebGL correctness diagnostics, never a timing benchmark.
// Both real loopback apps and their complete CSS are loaded without response
// replacement. Explicit component fixtures then own the document. Terminal
// callbacks receive declared synthetic RAF timestamps; readback synchronizes GL.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const sha=value=>createHash('sha256').update(value).digest('hex');
export function comparePixelBuffers(a,b){
  if(a.length!==b.length)return{exact:false,bytesA:a.length,bytesB:b.length,dimensionMismatch:true};
  assert.equal(a.length%4,0);
  let changedPixels=0,changedChannels=0,alphaChangedPixels=0,maxChannelDelta=0,sumAbsoluteChannelDelta=0;
  const channelDeltaHistogram=Array(256).fill(0);
  for(let i=0;i<a.length;i+=4){
    let changed=false;
    for(let channel=0;channel<4;channel++){
      const delta=Math.abs(a[i+channel]-b[i+channel]);channelDeltaHistogram[delta]++;
      if(!delta)continue;
      changed=true;changedChannels++;sumAbsoluteChannelDelta+=delta;maxChannelDelta=Math.max(maxChannelDelta,delta);
      if(channel===3)alphaChangedPixels++;
    }
    if(changed)changedPixels++;
  }
  return{exact:changedChannels===0,bytes:a.length,pixels:a.length/4,changedPixels,changedChannels,alphaChangedPixels,maxChannelDelta,sumAbsoluteChannelDelta,channelDeltaHistogram};
}

async function installRendererProbe(){
  const modules={renderer:await import(new URL('src/dice-renderer.js',location.href)),motion:await import(new URL('src/dice-motion.js',location.href)),effects:await import(new URL('src/effects.js',location.href))};
  // Release the normal title presentation before the diagnostic owns the DOM.
  modules.effects.mountEffects({},{busy:false},{effects:'low'},()=>{}).stop();
  const probe={active:false,group:null,draws:[],resizes:[]};
  const isSurface=canvas=>canvas?.classList?.contains('dice-surface');
  for(const method of ['drawElements','drawArrays']){
    const native=WebGLRenderingContext.prototype[method];
    WebGLRenderingContext.prototype[method]=function(...args){
      const result=native.apply(this,args);
      if(probe.active&&isSurface(this.canvas)){
        const entry={method,args:[...args],quality:this.canvas.dataset.motionQuality,pixelBudget:Number(this.canvas.dataset.pixelBudget),width:this.drawingBufferWidth,height:this.drawingBufferHeight};
        probe.draws.push(entry);probe.group?.draws.push(entry);
      }
      return result;
    };
  }
  for(const dimension of ['width','height']){
    const original=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,dimension);
    Object.defineProperty(HTMLCanvasElement.prototype,dimension,{...original,set(value){
      const before=original.get.call(this);original.set.call(this,value);
      if(probe.active&&isSurface(this)){
        const entry={dimension,before,after:original.get.call(this),width:this.width,height:this.height};
        probe.resizes.push(entry);probe.group?.resizes.push(entry);
      }
    }});
  }
  const audit=window.__round23Renderer={modules,probe,fixture:null,presentation:null};
  audit.capture=()=>{
    const {canvas,gl,poses,values}=audit.fixture;
    const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,rgba=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    const error=gl.getError(),program=gl.getParameter(gl.CURRENT_PROGRAM);
    let binary='',opaquePixels=0;
    for(let i=0;i<rgba.length;i+=8192)binary+=String.fromCharCode(...rgba.subarray(i,i+8192));
    for(let i=3;i<rgba.length;i+=4)if(rgba[i])opaquePixels++;
    return{width,height,error,opaquePixels,rgbaBase64:btoa(binary),png:canvas.toDataURL('image/png').split(',')[1],quality:canvas.dataset.motionQuality,pixelBudget:Number(canvas.dataset.pixelBudget),poses:poses??null,values,
      programLinked:!!program&&gl.getProgramParameter(program,gl.LINK_STATUS),
      uniforms:program?Array.from({length:gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS)},(_,i)=>{const u=gl.getActiveUniform(program,i);return{name:u.name,size:u.size,type:u.type};}):[],
    };
  };
  return{url:location.href,userAgent:navigator.userAgent,dpr:devicePixelRatio,fonts:{text:document.fonts.check('16px "Abyss Text"'),pixel:document.fonts.check('96px "Abyss Pixel"')},nativeReadback:true};
}

function buildRendererFixture(scene){
  const audit=window.__round23Renderer;
  audit.presentation?.stop();audit.fixture?.handle?.stop();audit.presentation=null;
  const {count,size,width,height}=scene,host=document.createElement('section'),row=document.createElement('div');
  host.style.cssText='position:relative;isolation:isolate;';
  row.className=`cube-row${scene.terminal?' rolling':''}`;
  row.style.cssText=`position:relative;display:block;transform:none;perspective:none;box-sizing:content-box;border:0;padding:0;margin:20px;width:${width}px;height:${height}px;max-width:none;min-height:0;`;
  const values=[];
  for(let index=0;index<count;index++){
    const die=document.createElement('div');die.className='cube-die';
    die.style.cssText=`--size:${size}px;position:absolute;box-sizing:content-box;border:0;padding:0;margin:0;left:${width/2+(index-(count-1)/2)*size*1.5-size/2}px;top:20px;width:${size}px;height:${size+30}px;max-width:none;transform:none;color:${['rgb(234,198,98)','rgb(136,191,230)','rgb(233,109,121)','rgb(198,233,255)','rgb(160,220,197)','rgb(196,148,231)'][index]};`;
    const shadow=document.createElement('div'),flight=document.createElement('div'),cube=document.createElement('div');
    shadow.className='die-shadow';flight.className='die-flight';cube.className='die-cube';
    const rowValues=scene.repeated?[6,1,6,3,2,5]:Array.from({length:6},(_,face)=>[6,2,4,1,5,3][(index+face)%6]);values.push(rowValues);
    for(let face=0;face<6;face++){
      const el=document.createElement('div');el.className=`cube-face face-${face}`;el.dataset.face=String(rowValues[face]);el.textContent=el.dataset.face;cube.append(el);
    }
    flight.append(cube);die.append(shadow,flight);row.append(die);
  }
  const fx=document.createElement('canvas');fx.className='scene-fx';host.append(fx,row);document.body.replaceChildren(host);
  const axisFaces=[{rx:0,ry:0,rz:0},{rx:0,ry:-90,rz:0},{rx:0,ry:180,rz:0},{rx:0,ry:90,rz:0},{rx:-90,ry:0,rz:0},{rx:90,ry:0,rz:0}];
  let poses;
  if(Number.isInteger(scene.face))poses=Array.from({length:count},()=>({x:0,y:0,z:0,...axisFaces[scene.face]}));
  else if(scene.repeated)poses=Array.from({length:count},(_,i)=>({x:0,y:0,z:0,...axisFaces[i]}));
  else if(Number.isInteger(scene.motion))poses=audit.modules.motion.throwFrames(count,713,1.5,Math.max(.8,width/size/2-.66))[scene.motion].dice;
  const handle=scene.terminal?null:audit.modules.renderer.mountDiceSurface();
  if(!scene.terminal&&!handle)throw Error('Production WebGL dice renderer is unavailable');
  const canvas=row.querySelector('.dice-surface'),gl=canvas?.getContext('webgl');
  audit.fixture={host,row,fx,handle,canvas,gl,poses,values};
}

function terminalRendererCapture(scene){
  const audit=window.__round23Renderer,{probe}=audit;
  const nativeRAF=window.requestAnimationFrame,nativeCancel=window.cancelAnimationFrame,queue=new Map();let id=-1;
  const groups=[];probe.draws=[];probe.resizes=[];probe.active=true;
  window.requestAnimationFrame=callback=>{queue.set(id,callback);return id--;};
  window.cancelAnimationFrame=key=>{if(queue.has(key))queue.delete(key);else nativeCancel.call(window,key);};
  try{
    audit.presentation=audit.modules.effects.mountEffects({revision:0},{busy:true,rolling:true,view:'game'},{effects:'full'},()=>{});
    const canvas=audit.fixture.row.querySelector('.dice-surface');if(!canvas)throw Error('Production effects did not mount a WebGL surface');
    audit.fixture.canvas=canvas;audit.fixture.gl=canvas.getContext('webgl');
    const origin=performance.now();
    for(const elapsed of [16,audit.modules.motion.THROW_DURATION+250]){
      const entries=[...queue];queue.clear();if(entries.length!==1)throw Error(`Expected one presentation callback, received ${entries.length}`);
      const group={syntheticTimestamp:origin+elapsed,draws:[],resizes:[]};groups.push(group);probe.group=group;
      for(const [,callback]of entries)callback(group.syntheticTimestamp);
      probe.group=null;
    }
    const capture=audit.capture();
    return{capture,groups,allDraws:probe.draws,allResizes:probe.resizes,pendingSyntheticFrames:queue.size,status:audit.presentation.status,fixture:scene};
  }finally{
    audit.presentation?.stop();window.requestAnimationFrame=nativeRAF;window.cancelAnimationFrame=nativeCancel;probe.group=null;probe.active=false;
  }
}

async function main(){
  const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');assert(at>0,'Use --name=value arguments');return[value.slice(0,at),value.slice(at+1)];}));
  assert(args['--baseline-source'],'Supply --baseline-source=/absolute/immutable/input');
  assert(process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_PATH,'Supply PLAYWRIGHT_MODULE and CHROMIUM_PATH');
  const output=path.resolve(args['--output']||'/tmp/dice-renderer-round23');
  await fs.mkdir(output,{recursive:true});
  // A fresh diagnostic result cannot silently replace a previous failed run.
  const reportPath=path.join(output,'renderer-round23.json');await fs.writeFile(reportPath,'{}\n',{flag:'wx'});
  const variants=[{label:'baseline',source:path.resolve(args['--baseline-source']),url:args['--baseline-url']||'http://127.0.0.1:4188/'},{label:'current',source:path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),url:args['--url']||'http://127.0.0.1:4189/'}];
  for(const v of variants)assert(['127.0.0.1','localhost','[::1]'].includes(new URL(v.url).hostname),'Loopback sources only');
  const report={kind:'NATIVE_RENDERER_PIXEL_AND_TERMINAL_SUBMISSION_DIAGNOSTIC_NOT_FPS',started:new Date().toISOString(),scriptSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),status:'RUNNING',sourcesBefore:{},sourcesAfter:{},environments:[],cases:[],terminal:[],restorations:[],errors:[],notes:[
    'The actual index, app startup, modules and full linked CSS are served without routes, response replacement or shader replacement. A declared component fixture then replaces the document body; this is not natural gameplay.',
    'Every pixel comparison uses every RGBA byte, including alpha and transparent RGB, with no masks, tolerated pixels, thresholds or adjusted source. Complete buffers are preserved as gzip files.',
    'All six faces receive all six nonsequential values. A separate case supplies repeated values and shows six different faces. Unchanged rotation, projection, material, mesh and budgets remain in production modules.',
    'Terminal diagnostics invoke actual effects and motion with two explicitly synthetic RAF timestamps. Actual native WebGL draw calls and backing resizes are recorded. These clocks and synchronized readPixels/PNG calls are never timing or FPS evidence.',
    'Native context loss/restoration is verified on a live moving pose. Readback in the restored event checks the production automatic redraw before a test-triggered draw can repair it.',
  ]};
  const save=()=>fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  const identity=async(v,files)=>Promise.all(files.map(async file=>{const bytes=await fs.readFile(path.join(v.source,file));return{file,bytes:bytes.length,sha256:sha(bytes)};}));
  const saveCapture=async(label,name,capture)=>{
    const {rgbaBase64,png,...data}=capture,rgba=Buffer.from(rgbaBase64,'base64'),packed=gzipSync(rgba,{level:9});
    const rawFile=`${label}-${name}.rgba.gz`,pngFile=`${label}-${name}.png`;
    await fs.writeFile(path.join(output,rawFile),packed);await fs.writeFile(path.join(output,pngFile),Buffer.from(png,'base64'));
    return{rgba,data:{...data,rgbaBytes:rgba.length,rgbaSha256:sha(rgba),rawFile,gzipBytes:packed.length,gzipSha256:sha(packed),pngFile}};
  };
  const pair=(results,name)=>{
    const a=results.baseline,b=results.current;
    const pixels=comparePixelBuffers(a.rgba,b.rgba),dimensions=a.data.width===b.data.width&&a.data.height===b.data.height;
    assert.deepEqual(a.data.values,b.data.values,`${name} fixture values`);assert.deepEqual(a.data.poses,b.data.poses,`${name} fixture poses`);
    const uniformInventoryEqual=JSON.stringify([...a.data.uniforms].sort((x,y)=>x.name.localeCompare(y.name)))===JSON.stringify([...b.data.uniforms].sort((x,y)=>x.name.localeCompare(y.name)));
    return{results:{baseline:a.data,current:b.data},comparison:{...pixels,dimensionsEqual:dimensions,uniformInventoryEqual,qualityEqual:a.data.quality===b.data.quality,pixelBudgetEqual:a.data.pixelBudget===b.data.pixelBudget},exact:dimensions&&pixels.exact};
  };
  const defaultScene={viewport:[1920,1080],count:6,size:160,width:1540,height:224};
  const scenes=[
    ...Array.from({length:6},(_,face)=>({...defaultScene,name:`six-dice-face-${face}`,face})),
    {...defaultScene,name:'six-faces-repeated-values',repeated:true},
    {...defaultScene,name:'six-dice-rest'},
    {...defaultScene,name:'six-dice-flight',motion:45},
    {...defaultScene,name:'six-dice-settling',motion:110},
    {...defaultScene,name:'single-die-rest',count:1,width:600},
    {name:'fourk-six-dice-rest',viewport:[3840,2160],count:6,size:320,width:3080,height:384},
  ];
  const modulePath=process.env.PLAYWRIGHT_MODULE;
  const {chromium}=await import(pathToFileURL(modulePath));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const entries=[];
  try{
    for(const variant of variants){
      const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();
      page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(30000);
      page.on('pageerror',error=>report.errors.push({label:variant.label,kind:'pageerror',message:error.message}));page.on('console',msg=>{if(msg.type()==='error')report.errors.push({label:variant.label,kind:'console',message:msg.text()});});
      entries.push({variant,context,page,files:[]});
      await page.goto(variant.url);await page.evaluate(async()=>{await import(new URL('src/app.js',location.href));await Promise.all([document.fonts.load('16px "Abyss Text"','骰'),document.fonts.load('96px "Abyss Pixel"','123456')]);await document.fonts.ready;});
      const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>new URL(link.href).pathname.replace(/^\//,'')));
      const files=[...new Set(['index.html','src/app.js','src/dice-renderer.js','src/dice-motion.js','src/effects.js','src/visual-timeline.js',...styles])];
      for(const file of files)assert(!path.isAbsolute(file)&&!file.includes('..'));
      entries.at(-1).files=files;report.sourcesBefore[variant.label]=await identity(variant,files);
      for(const local of report.sourcesBefore[variant.label]){
        const response=await context.request.get(new URL(local.file,variant.url).href);assert.equal(response.status(),200);const body=await response.body();assert.equal(body.length,local.bytes);assert.equal(sha(body),local.sha256);
      }
      const environment=await page.evaluate(installRendererProbe);assert(environment.fonts.text&&environment.fonts.pixel);
      report.environments.push({label:variant.label,browser:browser.version(),...environment});await save();
    }
    for(const [index,scene]of scenes.entries()){
      const order=index%2?[...entries].reverse():entries,results={};
      for(const {variant,page}of order){
        await page.setViewportSize({width:scene.viewport[0],height:scene.viewport[1]});await page.evaluate(buildRendererFixture,scene);
        const capture=await page.evaluate(()=>{const a=window.__round23Renderer;a.fixture.handle.draw(a.fixture.poses);return a.capture();});
        assert.equal(capture.error,0);assert(capture.programLinked);assert(capture.opaquePixels>scene.count*20);assert(capture.width*capture.height<=capture.pixelBudget);
        results[variant.label]=await saveCapture(variant.label,scene.name,capture);
      }
      const comparison=pair(results,scene.name);report.cases.push({scene,order:order.map(e=>e.variant.label),...comparison});await save();
      console.log(`${scene.name}: exact=${comparison.exact} changedPixels=${comparison.comparison.changedPixels??'dimensions'} maxChannelDelta=${comparison.comparison.maxChannelDelta??'dimensions'}`);
    }
    for(const size of [100,160]){
      const scene={...defaultScene,name:`terminal-six-dice-${size}`,terminal:true,size,width:size*9.625,height:size+64},results={},terminals={};
      for(const {variant,page}of entries){
        await page.setViewportSize({width:1920,height:1080});await page.evaluate(buildRendererFixture,scene);
        const terminal=await page.evaluate(terminalRendererCapture,scene),{capture,...details}=terminal;
        assert.equal(capture.error,0);assert(capture.programLinked);assert.equal(capture.quality,'rest');assert.equal(capture.pixelBudget,1800000);assert.equal(terminal.pendingSyntheticFrames,0);assert.equal(terminal.status.reason,'complete');
        const last=terminal.groups.at(-1);assert.equal(last.draws.length,variant.label==='baseline'?12:6,'Terminal draw count must match the declared optimization');
        assert(last.draws.slice(-6).every(draw=>draw.quality==='rest'&&draw.method==='drawElements'&&draw.args[1]===5184));
        if(variant.label==='current')assert(last.draws.every(draw=>draw.quality==='rest'),'The current terminal callback cannot first submit motion quality');
        terminals[variant.label]=details;results[variant.label]=await saveCapture(variant.label,scene.name,capture);
      }
      report.terminal.push({scene,...pair(results,scene.name),terminals});await save();
      console.log(`${scene.name}: native drawElements terminal baseline=12 current=6`);
    }
    for(const {variant,page}of entries){
      const scene={...defaultScene,name:'restoration-moving-pose',motion:45};await page.evaluate(buildRendererFixture,scene);
      const original=await saveCapture(variant.label,scene.name,await page.evaluate(()=>{const a=window.__round23Renderer;a.fixture.handle.draw(a.fixture.poses);return a.capture();}));
      const environment=await page.evaluate(()=>{const gl=window.__round23Renderer.fixture.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null};});
      Object.assign(report.environments.find(e=>e.label===variant.label),environment);
      const lost=await page.evaluate(async()=>{
        const a=window.__round23Renderer,f=a.fixture,extension=f.gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('Native context loss extension unavailable');f.extension=extension;
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Context loss deadline')),10000);f.canvas.addEventListener('webglcontextlost',()=>{clearTimeout(timer);resolve();},{once:true});extension.loseContext();});
        return{state:f.canvas.dataset.contextState,gpu:f.row.classList.contains('gpu-dice')};
      });assert.deepEqual(lost,{state:'lost',gpu:false});
      const restored=await page.evaluate(async()=>{
        const a=window.__round23Renderer,f=a.fixture;let timer;
        try{return await new Promise((resolve,reject)=>{
          timer=setTimeout(()=>reject(Error('Context restoration deadline')),10000);
          f.canvas.addEventListener('webglcontextrestored',()=>{try{resolve({state:f.canvas.dataset.contextState,gpu:f.row.classList.contains('gpu-dice'),capture:a.capture()});}catch(error){reject(error);}},{once:true});f.extension.restoreContext();
        });}finally{clearTimeout(timer);}
      });
      assert.equal(restored.state,'ready');assert.equal(restored.gpu,true);assert.equal(restored.capture.error,0);assert(restored.capture.programLinked);
      const recovery=await saveCapture(variant.label,'restoration-automatic-redraw',restored.capture),comparison=comparePixelBuffers(original.rgba,recovery.rgba);
      report.restorations.push({label:variant.label,scene,lost,restored:{state:restored.state,gpu:restored.gpu},original:original.data,recovery:recovery.data,comparison});await save();
      assert(comparison.exact,'Automatic restored redraw must preserve every byte of the current pose');
    }
    for(const {variant,files}of entries){report.sourcesAfter[variant.label]=await identity(variant,files);assert.deepEqual(report.sourcesAfter[variant.label],report.sourcesBefore[variant.label]);}
    const exactPairs=report.cases.filter(c=>c.exact).length,terminalExactPairs=report.terminal.filter(c=>c.exact).length;
    report.summary={pixelPairs:report.cases.length,exactPairs,terminalPairs:report.terminal.length,terminalExactPairs,recoveryCycles:report.restorations.length,errors:report.errors.length,performanceClaim:false};
    report.status=exactPairs===report.cases.length&&terminalExactPairs===report.terminal.length&&!report.errors.length?'PASS_RENDERER_EQUIVALENCE':'FAILED_RENDERER_EQUIVALENCE';
    if(report.status!=='PASS_RENDERER_EQUIVALENCE')process.exitCode=1;
  }catch(error){report.status='FAILED';report.failure={message:error.message,stack:error.stack};process.exitCode=1;}
  finally{report.finished=new Date().toISOString();await save();for(const {context}of entries)await context.close();await browser.close();}
  console.log(JSON.stringify({report:reportPath,status:report.status,...report.summary,...(report.failure?{failure:report.failure.message}:{})},null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
