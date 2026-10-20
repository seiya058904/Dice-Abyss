// Strict native repeatability diagnosis for the retained round24 motion A/B
// failures. Eight captures exactly: two identical inputs per version and clock.
// A later match never replaces the original A/B evidence or relaxes tolerance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {comparePixelBuffers} from './qa-renderer-round23.mjs';
import {installProbe,sourceIdentity,suppliedMotionCase} from './qa-surface-visibility-round24.mjs';

const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');

async function main(){
 const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
 if(args['--help']){console.log('PLAYWRIGHT_MODULE=/abs/playwright/index.js CHROMIUM_PATH=/abs/chromium node scripts/qa-motion-pixel-repeatability-round24.mjs --baseline-root=/abs/input --current-root=/abs/current --baseline-url=http://127.0.0.1:4194/ --current-url=http://127.0.0.1:4195/ --output=/abs/fresh-external-directory [--original-report=/abs/retained/surface-visibility-round24.json]');return;}
 for(const name of ['--baseline-root','--current-root','--baseline-url','--current-url','--output'])assert.equal(typeof args[name],'string',name);
 const variants=[{name:'baseline',root:path.resolve(args['--baseline-root']),url:args['--baseline-url']},{name:'current',root:path.resolve(args['--current-root']),url:args['--current-url']}];
 for(const variant of variants)assert(['127.0.0.1','localhost'].includes(new URL(variant.url).hostname),'Only explicit loopback game origins are permitted');
 const output=path.resolve(args['--output']);for(const variant of variants)assert(output!==variant.root&&!output.startsWith(variant.root+path.sep),'Write all observations outside the source trees');
 await fs.mkdir(output,{recursive:true});const reportFile=path.join(output,'motion-pixel-repeatability-round24.json');
 await fs.writeFile(reportFile,JSON.stringify({kind:'NATIVE_RGBA_REPEATABILITY_DIAGNOSTIC',status:'STARTING',started:new Date().toISOString()})+'\n',{flag:'wx'});
 let original=null;
 if(args['--original-report']){
  const originalFile=path.resolve(args['--original-report']),bytes=await fs.readFile(originalFile),data=JSON.parse(bytes);
  original={file:originalFile,sha256:sha(bytes),summary:data.summary,motionComparisons:data.pairs?.filter(pair=>pair.name.startsWith('motion-'))};
 }
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={kind:'NATIVE_RGBA_REPEATABILITY_DIAGNOSTIC',started:new Date().toISOString(),browser:browser.version(),contextConcurrency:1,expectedCaptures:8,
  scripts:{driver:sha(await fs.readFile(fileURLToPath(import.meta.url))),probe:sha(await fs.readFile(new URL('./qa-surface-visibility-round24.mjs',import.meta.url)))},
  original,captures:[],comparisons:[],errors:[],notes:[
   'Each clock has exactly two fresh-context baseline captures and two fresh-context current captures. One native browser context exists at a time.',
   'The production renderer receives the identical seed, geometry, fonts and explicitly supplied 160/240 Hz delivery clocks from the original native driver.',
   'Complete RGBA bytes including transparent RGB and alpha are retained and compared with zero tolerance. The comparison never strips channels or masks pixels.',
   'This tests rendering repeatability, not hardware refresh rate, FPS, or a replacement verdict for the retained original A/B strict failures.',
   'A baseline self mismatch establishes native variability in this input on this backend. A self match alone does not prove repeatability across all runs.',
  ]};
 const pixels=new Map();
 try{
  for(const hz of [160,240])for(const variant of variants)for(const repeat of [1,2]){
   const name=`${variant.name}-motion-${hz}-repeat-${repeat}`,row={name,variant:variant.name,hz,repeat,status:'RUNNING',console:[]};report.captures.push(row);
   const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
   await context.route('**/*',route=>{const url=new URL(route.request().url());return ['data:','about:'].includes(url.protocol)||url.origin===new URL(variant.url).origin?route.continue():route.abort();});
   const page=await context.newPage();page.setDefaultTimeout(30000);
   page.on('pageerror',error=>report.errors.push({name,type:'pageerror',message:error.message}));
   page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))row.console.push({type:message.type(),text:message.text()});});
   try{
    await page.goto(variant.url);await page.evaluate(()=>document.fonts.ready);
    row.identity={url:page.url(),title:await page.title(),release:await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),bodyTextCharacters:(await page.locator('body').innerText()).length,frameworkOverlays:await page.locator('vite-error-overlay,nextjs-portal,webpack-dev-server-client-overlay').count()};
    assert(row.identity.title.includes('骰'));assert(row.identity.bodyTextCharacters>100);assert.equal(row.identity.frameworkOverlays,0);
    row.sources=await sourceIdentity(page,variant.root);row.environment=await page.evaluate(installProbe);
    row.result=await suppliedMotionCase(page,hz);const capture=row.result.pixelCapture,rgba=Buffer.from(capture.rgbaBase64,'base64');
    assert.equal(rgba.length,capture.width*capture.height*4);assert(capture.opaquePixels>0);assert.equal(capture.error,0);
    const rgbaFile=`${name}.rgba.gz`;await fs.writeFile(path.join(output,rgbaFile),gzipSync(rgba));pixels.set(name,rgba);
    const {rgbaBase64,...metadata}=capture;row.result.pixelCapture={...metadata,rgbaFile,rgbaBytes:rgba.length,rgbaSha256:sha(rgba)};
    row.result.traceSha256=sha(row.result.trace);delete row.result.trace;
    row.screenshot=`${name}.png`;await page.screenshot({path:path.join(output,row.screenshot)});
    assert.equal(row.console.filter(entry=>entry.type==='error').length,0,'Browser errors must not be silently ignored');row.status='PASS';
   }catch(error){row.status='FAIL';row.error=String(error);row.stack=error.stack;row.screenshot=`FAIL-${name}.png`;await page.screenshot({path:path.join(output,row.screenshot)}).catch(()=>{});}
   finally{await context.close();await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');}
   console.log(`${name}: ${row.status}`);
  }
  for(const hz of [160,240])for(const variant of variants){
   const rows=report.captures.filter(row=>row.hz===hz&&row.variant===variant.name);
   const comparison={hz,variant:variant.name,kind:variant.name==='baseline'?'BASELINE_A_A':'CURRENT_B_B',captures:rows.map(row=>row.name),status:'UNAVAILABLE'};
   if(rows.length===2&&rows.every(row=>row.status==='PASS')){
    const [first,second]=rows,a=first.result,b=second.result;
    comparison.nativeDrawElements=[a.after.drawElements-a.before.drawElements,b.after.drawElements-b.before.drawElements];
    comparison.sameInputs=a.suppliedCallbacks===b.suppliedCallbacks&&first.sources.files.every((file,index)=>file.sha256===second.sources.files[index].sha256);
    comparison.domTraceEqual=a.traceSha256===b.traceSha256;comparison.soundTimesEqual=sha(a.sounds)===sha(b.sounds);comparison.restTimesEqual=sha(a.rest)===sha(b.rest);
    comparison.exactRGBA=comparePixelBuffers(pixels.get(first.name),pixels.get(second.name));
    comparison.status=comparison.sameInputs&&comparison.domTraceEqual&&comparison.soundTimesEqual&&comparison.restTimesEqual&&comparison.nativeDrawElements[0]===comparison.nativeDrawElements[1]&&comparison.exactRGBA.exact?'PASS':'FAIL';
   }
   report.comparisons.push(comparison);
  }
 }finally{
  await browser.close();report.finished=new Date().toISOString();report.summary={captures:report.captures.length,successfulCaptures:report.captures.filter(row=>row.status==='PASS').length,failedCaptures:report.captures.filter(row=>row.status==='FAIL').length,comparisons:report.comparisons.length,strictRepeatabilityFailures:report.comparisons.filter(row=>row.exactRGBA&&!row.exactRGBA.exact).length,unavailableComparisons:report.comparisons.filter(row=>row.status==='UNAVAILABLE').length,runtimeErrors:report.errors.length};
  await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
  if(report.summary.successfulCaptures!==8||report.comparisons.some(row=>row.status!=='PASS')||report.summary.runtimeErrors)process.exitCode=1;
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
