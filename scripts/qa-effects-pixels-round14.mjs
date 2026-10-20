// Native Canvas pixel equivalence, deliberately isolated from app startup.
// This controlled fixture does not measure FPS or natural action latency.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const options=Object.fromEntries(process.argv.slice(2).map(v=>{const p=v.indexOf('=');assert(p>0,'Arguments use --name=value');return[v.slice(0,p),v.slice(p+1)];}));
const source=path.resolve(options['--source']||'.'),baseline=path.resolve(options['--baseline-source']||source),output=path.resolve(options['--output']||'/tmp/dice-effects-pixels-round14');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const variants=[{label:'baseline',root:baseline,url:options['--baseline-url']||'http://127.0.0.1:4388/'},{label:'current',root:source,url:options['--url']||'http://127.0.0.1:4389/'}];
for(const v of variants)assert(['localhost','127.0.0.1'].includes(new URL(v.url).hostname),'Only isolated loopback origins are permitted');
assert(process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_PATH,'Use existing tester-owned browser dependencies');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const E=await import(pathToFileURL(path.join(baseline,'src/engine.js'))),Q=await import(pathToFileURL(path.join(baseline,'src/equipment.js'))),S=await import(pathToFileURL(path.join(baseline,'src/storage.js')));
let base=E.newGame(20261017);base.runId='qa-effects-pixels-round14';base.floor=140;base.fate=[6,6];base.player.level=80;base.player.gold=500000;base.roomIndex=5;base.route=Array.from({length:6},(_,i)=>({id:`f140r${i}`,type:i===5?'boss':'combat',quality:0,done:i<5}));base.phase='route';base.player.hp=E.stats(base).maxHp;base=E.transition(base,{type:'enter'});
base.enemy.hp=1;base.enemy.shield=0;base.enemy.stage=2;const chest=E.transition(base,{type:'roll'});assert.equal(chest.phase,'chest');
const ui={screen:'game',view:'game',busy:true,event:'open',rolling:false,forging:false,inventoryPage:0,inventorySlot:'',inventoryRarity:'',inventorySort:'rarity',saveError:''};
const definitions=[{name:'chest-charge',state:chest,ui},...Array.from({length:8},(_,rarity)=>{const before=structuredClone(chest);before.chest.item=Q.makeItem(before,'relic',rarity,140,'boss');const state=E.transition(before,{type:'open'});assert(S.validateSave(state));return{name:`loot-${rarity}`,state,ui};})];
const combat={...chest,phase:'combat',enemy:{...chest.enemy,type:'boss',shield:0},lastRoll:{...chest.lastRoll,best:3,critical:true,follow:true,killed:true,phaseChanged:true,absorbed:100,values:[6,6,6,6,6,6]}};
definitions.push({name:'combat-boss',state:combat,ui:{...ui,event:'roll'}});
const definitionsAtSizes=[...definitions.map(d=>({...d,width:1920,height:1080,elapsed:150})),...['chest-charge','loot-0','loot-7','combat-boss'].flatMap(name=>[[390,844],[3840,2160]].map(([width,height])=>({...definitions.find(d=>d.name===name),width,height,elapsed:name==='combat-boss'?550:300})))];
const repeats=Number(options['--repeats']||1);assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=3);
const cases=definitionsAtSizes.filter(d=>(!options['--names']||options['--names'].split(',').includes(d.name))&&(!options['--sizes']||options['--sizes'].split(',').includes(`${d.width}x${d.height}`))).flatMap(d=>Array.from({length:repeats},(_,repeat)=>({...d,repeat:repeat+1})));assert(cases.length);
await fs.mkdir(output,{recursive:true});
const report={kind:'NATIVE_CONTROLLED_EFFECT_PIXELS_NOT_FPS',started:new Date().toISOString(),repeats,cases:[],errors:[],status:'RUNNING',scriptSha256:sha(await fs.readFile(new URL(import.meta.url))),notes:[
 'Preferred extension and cloud browser failed with net::ERR_CONNECTION_REFUSED for executor loopback; the user taskbook permits this Chromium/Playwright fallback.',
 'Each variant loads its actual index, CSS, fonts and effect modules. Only app.js startup is explicitly replaced with an empty response so the deterministic diagnostic owns the complete source-rendered game DOM.',
 'The browser uses real Canvas2D and WebGL APIs, actual layout and complete getImageData RGBA readback. The small mock clock only supplies deterministic visual timestamps; it does not simulate pixels.',
 'Complete RGBA SHA, nontransparent pixel count, backing-store dimensions, logical frame, ROI, particle/material counts and post-stop cleanup are compared. Readback stalls and screenshots are not timing samples.',
 'These are controlled full-DOM fixtures, not natural gameplay or a physical 4K60 test.'
]};
const save=()=>fs.writeFile(path.join(output,'effects-pixels-round14.json'),JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
try{
 const contexts=[];
 try{
  for(const variant of variants){
   variant.views=await import(pathToFileURL(path.join(variant.root,'src/views.js')));
   const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();contexts.push(context);variant.page=page;
   await page.route('**/src/app.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:'// Explicit controlled effect-pixel fixture; application startup is isolated.\n'}));
   page.on('pageerror',error=>report.errors.push({variant:variant.label,kind:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error')report.errors.push({variant:variant.label,kind:'console',message:message.text()});});
   await page.goto(variant.url);await page.evaluate(async()=>{
    // Empty app isolation does not make either font used. Request both actual
    // font faces before the gate; fonts.ready alone can resolve for an empty DOM.
    await Promise.all([document.fonts.load('16px "Abyss Text"'),document.fonts.load('16px "Abyss Pixel"')]);await document.fonts.ready;
   });
   variant.identity=await page.evaluate(()=>({url:location.href,title:document.title,release:document.querySelector('meta[name="dice-abyss-release"]')?.content,fonts:[document.fonts.check('16px "Abyss Text"'),document.fonts.check('16px "Abyss Pixel"')]}));
   assert(variant.identity.fonts.every(Boolean));assert.equal(new URL(variant.identity.url).origin,new URL(variant.url).origin);
   const files=['src/effects.js','src/visual-timeline.js','src/dice-motion.js','src/dice-renderer.js','src/views.js',...(await fs.readdir(path.join(variant.root,'src'))).filter(x=>x.endsWith('.css')).map(x=>`src/${x}`)];
   variant.sources=[];for(const file of files){const bytes=await fs.readFile(path.join(variant.root,file)),response=await page.request.get(new URL(file,variant.url).href),body=await response.body();assert.equal(response.status(),200);assert.equal(sha(body),sha(bytes));variant.sources.push({file,sha256:sha(bytes),bytes:bytes.length,status:response.status()});}
   await page.evaluate(async()=>{
    const queue=new Map(),timeouts=new Map();let next=0,time=100;
    window.__pixelClock={set(value){time=value;},sample(value){time=value;for(const [id,fn]of [...queue]){queue.delete(id);fn(value);}},pending(){return{frames:queue.size,timers:timeouts.size};}};
    performance.now=()=>time;window.requestAnimationFrame=fn=>{queue.set(++next,fn);return next;};window.cancelAnimationFrame=id=>queue.delete(id);window.setTimeout=(fn,delay)=>{timeouts.set(++next,{fn,delay});return next;};window.clearTimeout=id=>timeouts.delete(id);
    window.__pixelEffects=await import('./src/effects.js');document.documentElement.dataset.effects='full';document.documentElement.style.setProperty('--user-scale','1');
   });
  }
  report.variants=variants.map(({page,views,...v})=>v);
  for(const definition of cases){
   const pair={name:definition.name,width:definition.width,height:definition.height,elapsed:definition.elapsed,repeat:definition.repeat,fixtureSha256:sha(definition.state),variants:[],status:'RUNNING'},rawBuffers=[];report.cases.push(pair);await save();
   for(const variant of variants){
    const html=variant.views.gameView(definition.state,definition.ui);await variant.page.setViewportSize({width:definition.width,height:definition.height});
    const result=await variant.page.evaluate(async({html,state,ui,elapsed})=>{
     window.__pixelPresentation?.stop();document.querySelector('#app').innerHTML=html;window.__pixelClock.set(100);window.__pixelPresentation=window.__pixelEffects.mountEffects(state,ui,{effects:'full'},()=>{});
     // Step through identical physical presentation times; avoid a single late
     // first callback being calibrated to the timeline's 100ms maximum step.
     for(let ms=0;ms<elapsed;ms+=50)window.__pixelClock.sample(100+ms);window.__pixelClock.sample(100+elapsed);
     const canvas=document.querySelector('.scene-fx'),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
     let nontransparent=0,alphaSum=0;for(let i=3;i<data.length;i+=4){if(data[i])nontransparent++;alphaSum+=data[i];}
     const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');let binary='';for(let offset=0;offset<data.length;offset+=32768)binary+=String.fromCharCode(...data.subarray(offset,offset+32768));
     const rect=canvas.getBoundingClientRect(),snapshot={width:canvas.width,height:canvas.height,rgbaBytes:data.length,rgbaSha256:sha,nontransparent,alphaSum,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},roi:canvas.dataset.fxRoi,logical:canvas.dataset.fxLogical,pixels:Number(canvas.dataset.fxPixels),materialPixels:Number(canvas.dataset.fxMaterialPixels),kind:canvas.dataset.fxKind,particles:Number(canvas.dataset.fxParticles),motif:canvas.dataset.fxRewardMotif,columns:Number(canvas.dataset.fxRewardColumns),rims:Number(canvas.dataset.fxRewardRims),frames:Number(canvas.dataset.fxFrames),elapsed:Number(canvas.dataset.fxElapsed),pending:window.__pixelClock.pending(),firstChild:canvas.parentElement.firstChild===canvas};
     return {...snapshot,rgbaBase64:btoa(binary)};
    },{html,state:definition.state,ui:definition.ui,elapsed:definition.elapsed});
    const rgba=Buffer.from(result.rgbaBase64,'base64');delete result.rgbaBase64;assert.equal(sha(rgba),result.rgbaSha256);rawBuffers.push(rgba);
    const rawFile=`rgba-${String(report.cases.length).padStart(2,'0')}-${variant.label}.bin.gz`,compressed=gzipSync(rgba);await fs.writeFile(path.join(output,rawFile),compressed);
    assert(result.nontransparent>0,'A transparent canvas cannot pass visual equality');assert(result.pixels>0);pair.variants.push({label:variant.label,htmlSha256:sha(html),rawRgba:{file:rawFile,gzipBytes:compressed.length,gzipSha256:sha(compressed)},...result});
    if(variant.label==='current'&&definition.name==='loot-7'&&[390,3840].includes(definition.width)){const file=path.join(output,`eternal-effect-${definition.width}.png`);await variant.page.screenshot({path:file,fullPage:false});pair.screenshot=file;}
    const stop=await variant.page.evaluate(()=>{window.__pixelPresentation.stop();window.__pixelPresentation.stop();return window.__pixelClock.pending();});assert.deepEqual(stop,{frames:0,timers:0});
   }
   const [{label:bl,htmlSha256:bh,rawRgba:br,...b},{label:al,htmlSha256:ah,rawRgba:ar,...a}]=pair.variants;
   pair.completeHtmlSame=bh===ah;
   try{assert.deepEqual(a,b);assert(rawBuffers[0].equals(rawBuffers[1]));pair.exactPixelsAndGeometry=true;pair.status='PASS';}
   catch(error){
    pair.exactPixelsAndGeometry=false;pair.status='STRICT_DIFFERENCE';pair.differenceMessage=String(error);let changedBytes=0,maxDelta=0;const changedPixels=new Set(),differences=[];
    for(let i=0;i<Math.max(rawBuffers[0].length,rawBuffers[1].length);i++)if(rawBuffers[0][i]!==rawBuffers[1][i]){changedBytes++;const pixel=Math.floor(i/4),delta=Math.abs((rawBuffers[1][i]??0)-(rawBuffers[0][i]??0));changedPixels.add(pixel);maxDelta=Math.max(maxDelta,delta);differences.push({byte:i,pixel,x:pixel%b.width,y:Math.floor(pixel/b.width),channel:['r','g','b','a'][i%4],baseline:rawBuffers[0][i]??null,current:rawBuffers[1][i]??null});}
    pair.rgbaDifference={changedBytes,changedPixels:changedPixels.size,maxChannelDelta:maxDelta,allChangedBytes:differences};
   }
   await save();console.log(`${pair.name} ${pair.width} #${pair.repeat}: ${pair.status} ${a.nontransparent} nontransparent pixels`);
  }
  for(const v of variants)for(const file of v.sources)assert.equal(sha(await fs.readFile(path.join(v.root,file.file))),file.sha256,'Sources used for native pixels must stay fixed');
  report.sourceStable=true;assert.equal(report.errors.length,0);report.status=report.cases.every(c=>c.status==='PASS')?'PASS_NATIVE_EFFECT_EQUIVALENCE':'STRICT_PIXEL_DIFFERENCE_RETAINED';if(report.status!=='PASS_NATIVE_EFFECT_EQUIVALENCE')process.exitCode=2;
 }finally{for(const context of contexts)await context.close();}
}catch(error){report.status='FAILED';report.failure={message:error.message,stack:error.stack};process.exitCode=1;throw error;}
finally{report.completed=new Date().toISOString();await save();await browser.close();}
console.log(JSON.stringify({output:path.join(output,'effects-pixels-round14.json'),status:report.status,cases:report.cases.length}));
