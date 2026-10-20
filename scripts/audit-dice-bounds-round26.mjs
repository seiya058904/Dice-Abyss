// Exact bounds and deterministic work counts; optional timings are CPU-only,
// not display FPS or GPU measurements. No browser or saved game is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {throwFrames} from '../src/dice-motion.js';

const ownRoot=fileURLToPath(new URL('..',import.meta.url));
export const BASELINE_RENDERER_SHA256='87848cec1a848afe4aae0097a6963097860dda21a04314951d789aae20566f61';
const sha=value=>createHash('sha256').update(value).digest('hex');

// Frozen v5.25 arithmetic, copied before editing the renderer. Keeping this
// small oracle makes future regression checks independent of another ZIP.
function baselineRestPose(index=0){const [rx,ry,rz]=[[-18,-24,-3],[-15,18,4],[-20,-16,-4],[-16,20,3],[-20,-20,-2],[-14,14,3]][index%6];return{x:0,y:0,z:0,rx,ry,rz};}
function baselineProjector(d,p,rowWidth){
  const [rx,ry,rz]=[p.rx,p.ry,p.rz].map(a=>a*Math.PI/180),[cx,cy,cz]=[rx,ry,rz].map(Math.cos),[sx,sy,sz]=[rx,ry,rz].map(Math.sin);
  return point=>{
  const [x,y,z]=point,ay=y*cx-z*sx,az=y*sx+z*cx,bx=x*cy+az*sy,bz=-x*sy+az*cy;
  const px=(bx*cz-ay*sz)*d.size+d.x+p.x*d.size,py=(bx*sz+ay*cz)*d.size+d.y+p.y*d.size,pz=bz*d.size+p.z*d.size,focal=rowWidth*1.35;
  return {x:px*focal/(focal-pz),y:py*focal/(focal-pz)};
  };
}
export function referenceDiceSurfaceBounds(records,poses,rowWidth,rowHeight,previous=null){
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(let i=0;i<records.length;i++){const project=baselineProjector(records[i],poses?.[i]||baselineRestPose(i),rowWidth);for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
    const q=project([x,y,z]);
    left=Math.min(left,q.x);top=Math.min(top,q.y);right=Math.max(right,q.x);bottom=Math.max(bottom,q.y);
  }}
  left=Math.floor(left-4);top=Math.floor(top-4);right=Math.ceil(right+4);bottom=Math.ceil(bottom+4);
  if(poses){
    const overscan=Math.max(...records.map(d=>d.size))*2.2;
    left=Math.min(left,previous?.left??-rowWidth/2);right=Math.max(right,previous?.right??rowWidth/2);
    top=Math.min(top,previous?.top??(-rowHeight/2-overscan));bottom=Math.max(bottom,previous?.bottom??(rowHeight/2+overscan));
  }
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}

export function boundsTrajectories(){
  const rows=[];
  for(const [rowWidth,size]of [[420,44],[660,70],[1000,100],[1900,190]])for(let count=1;count<=6;count++)for(const seed of [1,2,113,7919,31676,4294967295]){
    const spacing=1.45,rowHeight=size*1.8;
    const records=Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*size*spacing,y:-size*.2,size}));
    const frames=throwFrames(count,seed,spacing,Math.max(.8,rowWidth/size/2-.66));
    rows.push({name:`${rowWidth}px-${count}dice-seed${seed}`,rowWidth,rowHeight,records,frames});
  }
  return rows;
}

export function countedBounds(bounds,...args){
  const sin=Math.sin,cos=Math.cos;let trigCalls=0;
  Math.sin=(...values)=>{trigCalls++;return sin(...values);};Math.cos=(...values)=>{trigCalls++;return cos(...values);};
  try{return {bounds:bounds(...args),trigCalls};}finally{Math.sin=sin;Math.cos=cos;}
}

export async function auditDiceBounds({baselineRoot,currentRoot=ownRoot,timingPairs=0}={}){
  const currentPath=path.join(currentRoot,'src/dice-renderer.js'),current=await import(pathToFileURL(currentPath).href);
  let baseline={diceSurfaceBounds:referenceDiceSurfaceBounds},baselineIdentity={kind:'FROZEN_V5_25_ARITHMETIC',rendererSha256:BASELINE_RENDERER_SHA256};
  if(baselineRoot){
    const baselinePath=path.join(baselineRoot,'src/dice-renderer.js'),actual=sha(await fs.readFile(baselinePath));
    assert.equal(actual,BASELINE_RENDERER_SHA256,'A/B input must be the actual unmodified v5.25 renderer');
    baseline=await import(pathToFileURL(baselinePath).href);baselineIdentity={kind:'EXACT_INPUT_RENDERER',rendererSha256:actual};
  }
  const trajectories=boundsTrajectories(),cases=[];let frames=0,fastFrames=0,baselineTrig=0,currentTrig=0;
  for(const row of trajectories){
    let before=null,after=null,localFast=0;const trace=[];
    for(const frame of row.frames){
      const a=countedBounds(baseline.diceSurfaceBounds,row.records,frame.dice,row.rowWidth,row.rowHeight,before);
      const b=countedBounds(current.diceSurfaceBounds,row.records,frame.dice,row.rowWidth,row.rowHeight,after);
      assert.deepEqual(b.bounds,a.bounds,`${row.name}: exact bounds at t=${frame.t}`);
      assert.deepEqual(a.bounds,referenceDiceSurfaceBounds(row.records,frame.dice,row.rowWidth,row.rowHeight,before),'Frozen oracle must match actual input');
      assert.deepEqual(Object.keys(b.bounds),['left','top','right','bottom','width','height']);
      before=a.bounds;after=b.bounds;frames++;baselineTrig+=a.trigCalls;currentTrig+=b.trigCalls;
      if(b.trigCalls===0){fastFrames++;localFast++;}trace.push(b.bounds);
    }
    cases.push({name:row.name,frames:row.frames.length,fastFrames:localFast,exactBoundsSha256:sha(JSON.stringify(trace))});
  }
  let timing=null;
  if(timingPairs){
    assert(Number.isInteger(timingPairs)&&timingPairs>=1&&timingPairs<=50,'Use a declared bounded 1–50 timing pairs');
    const run=bounds=>{
      let checksum=0;const start=performance.now();
      for(const row of trajectories){let previous=null;for(const frame of row.frames){previous=bounds(row.records,frame.dice,row.rowWidth,row.rowHeight,previous);checksum+=previous.left+previous.bottom;}}
      return {elapsedMs:performance.now()-start,checksum};
    };
    const warmup=[run(baseline.diceSurfaceBounds),run(current.diceSurfaceBounds)],pairs=[];
    for(let i=0;i<timingPairs;i++){
      let a,b;if(i%2){b=run(current.diceSurfaceBounds);a=run(baseline.diceSurfaceBounds);}else{a=run(baseline.diceSurfaceBounds);b=run(current.diceSurfaceBounds);}
      assert.equal(a.checksum,b.checksum);pairs.push({pair:i+1,order:i%2?'current-first':'baseline-first',baselineMs:a.elapsedMs,currentMs:b.elapsedMs});
    }
    const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),at=q=>sorted[Math.floor((sorted.length-1)*q)];return{n:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1),min:sorted[0]};};
    timing={kind:'CPU_FUNCTION_ONLY_NOT_NATIVE_FRAMETIME',warmup,pairs,baselineMs:stats(pairs.map(p=>p.baselineMs)),currentMs:stats(pairs.map(p=>p.currentMs))};
  }
  return {kind:'EXACT_CLIP_AND_DETERMINISTIC_PROJECTION_WORK_NOT_FPS',baseline:baselineIdentity,currentRendererSha256:sha(await fs.readFile(currentPath)),
    summary:{trajectories:trajectories.length,frames,fastFrames,exactFrames:frames-fastFrames,baselineTrig,currentTrig,savedTrig:baselineTrig-currentTrig,
      baselineProjectedCorners:baselineTrig/6*8,currentProjectedCorners:currentTrig/6*8,exactBounds:true},cases,timing};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
  if(options['--help'])console.log('node scripts/audit-dice-bounds-round26.mjs --baseline-root=/absolute/input --current-root=/absolute/current --output=/absolute/report.json [--timing-pairs=12]');
  else{
    assert.equal(typeof options['--output'],'string','Provide a project-external report path');
    if(options['--baseline-root']!==undefined)assert.equal(typeof options['--baseline-root'],'string','Provide an explicit baseline directory');
    if(options['--current-root']!==undefined)assert.equal(typeof options['--current-root'],'string','Provide an explicit current directory');
    const output=path.resolve(options['--output']),currentRoot=path.resolve(options['--current-root']||ownRoot),baselineRoot=options['--baseline-root']?path.resolve(options['--baseline-root']):undefined;
    // Resolve the nearest existing ancestor too: a convenient symlink must not
    // turn an external evidence path into a write inside either input tree.
    let ancestor=output;const missing=[];
    for(;;){try{ancestor=await fs.realpath(ancestor);break;}catch(error){if(error.code!=='ENOENT')throw error;missing.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}}
    const actualOutput=path.join(ancestor,...missing);
    for(const root of [ownRoot,currentRoot,baselineRoot].filter(Boolean)){
      const actualRoot=await fs.realpath(root);
      assert(actualOutput!==actualRoot&&!actualOutput.startsWith(actualRoot+path.sep),'Write raw evidence outside every baseline/current/project tree');
    }
    try{await fs.lstat(output);assert.fail('Refusing to replace existing evidence; choose a new output path');}catch(error){if(error.code!=='ENOENT')throw error;}
    const report=await auditDiceBounds({baselineRoot,currentRoot,timingPairs:Number(options['--timing-pairs']||0)});
    await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report.summary));
  }
}
