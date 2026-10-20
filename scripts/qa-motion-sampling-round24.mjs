// Deterministic supplied-RAF work counts, not a display refresh-rate or FPS test.
// Both roots must be local isolated game copies. No browser or save is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const ownRoot=fileURLToPath(new URL('..',import.meta.url));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function recordMotionSampling(root=ownRoot,options={}){
 const M=await import(pathToFileURL(path.join(root,'src/dice-motion.js')).href);
 const savedDocument=globalThis.document,hz=options.hz??160,count=options.count??6,seed=options.seed??113;
 const times=options.times?[...options.times]:[];
 if(!options.times){for(let index=0;index*1000/hz<M.THROW_DURATION;index++)times.push(index*1000/hz);times.push(M.THROW_DURATION);}
 let activeGPU=options.gpu!==false,elapsed=0,draw,frameCalls=0,styleWrites=0,lastPoses=null,lastLanded=false;
 const sounds=[],rest=[],submitted=[],trace=[];
 const style=()=>new Proxy({}, {set(target,key,value){styleWrites++;target[key]=value;return true;}});
 const row={classList:{contains:()=>activeGPU},getBoundingClientRect:()=>({width:1200})};
 const dice=Array.from({length:count},(_,index)=>{
  const nodes={'.die-flight':{style:style()},'.die-cube':{style:style()},'.die-shadow':{style:style()}};
  return {parentElement:row,nodes,getBoundingClientRect:()=>({width:100,x:200+index*150}),querySelector:selector=>nodes[selector]};
 });
 const dom=()=>dice.map(die=>Object.fromEntries(Object.entries(die.nodes).map(([key,node])=>[key,{...node.style}])));
 globalThis.document={querySelectorAll:()=>dice};
 let stop;
 try{
  stop=M.animateDice(seed,sound=>sounds.push({elapsed,sound}),(poses,landed)=>{
   frameCalls++;lastPoses=poses;lastLanded=landed;submitted.push({elapsed,poses,landed});
   if(options.afterFrameMode)activeGPU=options.afterFrameMode(elapsed,activeGPU);
  },{play(duration,callback){assert.equal(duration,M.THROW_DURATION);draw=callback;return()=>{};}},()=>rest.push(elapsed));
  for(const time of times){
   elapsed=time;if(options.modeAt)activeGPU=options.modeAt(time,activeGPU);
   draw(time);
   trace.push({elapsed,activeGPU,poses:lastPoses,landed:lastLanded,dom:dom()});
  }
  const beforeCleanup=styleWrites;stop();stop=null;
  return {
   hz,count,seed,durationMs:M.THROW_DURATION,rafCallbacks:times.length,frameCalls,
   uniqueSubmittedPoses:new Set(submitted.map(row=>row.poses)).size,
   styleWrites:beforeCleanup,cleanupStyleWrites:styleWrites-beforeCleanup,
   sounds,rest,cleanup:dom(),trace,submitted,
  };
 }finally{
  stop?.();if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;
 }
}

export async function compareMotionSampling(baselineRoot,currentRoot){
 const cases=[];
 const definitions=[...['gpu','fallback'].flatMap(mode=>[30,60,90,120,144,160,240,320].map(hz=>({name:`${mode}-${hz}hz`,hz,gpu:mode==='gpu'}))),
  {name:'fallback-switch-between-authored-frames',times:[100,101,102,103,104,116,1279,1280],modeAt:time=>time!==101&&time!==103},
  {name:'context-loss-during-surface-draw',times:[100,101,102,103,104,116,1279,1280],afterFrameMode:(time,mode)=>time===100?false:mode,modeAt:(time,mode)=>time>=103?true:mode},
  {name:'duplicate-and-delayed-deliveries',times:[0,0,3,3,4,4,100,100,700,700,1279,1279,1280]},
 ];
 for(const definition of definitions){
  const baseline=await recordMotionSampling(baselineRoot,definition),current=await recordMotionSampling(currentRoot,definition);
  // The effective pose, DOM fallback and sound timing must match at EVERY
  // supplied delivery, including deliveries that no longer submit a surface.
  assert.deepEqual(current.trace,baseline.trace,`${definition.name}: visible state after each supplied frame`);
  assert.deepEqual(current.sounds,baseline.sounds,`${definition.name}: exact sound sequence and times`);
  assert.deepEqual(current.rest,baseline.rest,`${definition.name}: terminal callback times`);
  assert.deepEqual(current.cleanup,baseline.cleanup,`${definition.name}: cancellation cleanup`);
  const summarize=row=>({rafCallbacks:row.rafCallbacks,surfaceCallbacks:row.frameCalls,uniqueSubmittedPoses:row.uniqueSubmittedPoses,styleWrites:row.styleWrites,cleanupStyleWrites:row.cleanupStyleWrites,soundEvents:row.sounds.length,restEvents:row.rest.length});
  cases.push({name:definition.name,baseline:summarize(baseline),current:summarize(current),skippedSurfaceCallbacks:baseline.frameCalls-current.frameCalls,
   effectiveTraceSha256:sha(current.trace),soundTraceSha256:sha(current.sounds),
   perDeliveryVisibleStateEqual:true,soundTimesEqual:true,restTimesEqual:true,cleanupEqual:true});
 }
 return {kind:'DETERMINISTIC_SYNTHETIC_RAF_WORK_COUNTS_NOT_FPS',seed:113,dice:6,
  baselineRoot:path.resolve(baselineRoot),currentRoot:path.resolve(currentRoot),
  notes:['RAF delivery times are supplied by this driver, not sampled from a monitor.',
   'surfaceCallbacks count the actual animateDice callback; GL commands require separate browser instrumentation.',
   'All display-state and sound comparisons use the untouched baseline implementation as the oracle.'],cases,
  summary:{cases:cases.length,passed:cases.length,failed:0}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
 if(options['--help'])console.log('node scripts/qa-motion-sampling-round24.mjs --baseline-root=/absolute/input --current-root=/absolute/current --output=/absolute/out.json');
 else{
  assert.equal(typeof options['--baseline-root'],'string','Provide the untouched isolated baseline root');
  assert.equal(typeof options['--output'],'string','Provide an external output JSON path');
  const report=await compareMotionSampling(path.resolve(options['--baseline-root']),path.resolve(options['--current-root']||ownRoot));
  await fs.mkdir(path.dirname(path.resolve(options['--output'])),{recursive:true});await fs.writeFile(options['--output'],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
 }
}
