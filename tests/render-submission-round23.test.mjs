import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {animateDice,restPose,THROW_DURATION} from '../src/dice-motion.js';
import {indexedRoundedCubeMesh} from '../src/dice-renderer.js';
import {comparePixelBuffers} from '../scripts/qa-renderer-round23.mjs';
import {dice} from '../src/views.js';

function scene(gpu=true){
  const keys=['document','performance','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','matchMedia','__round23Surface'];
  const saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  let now=0,id=0;const frames=new Map(),timers=new Map(),listeners=new Set(),draws=[];
  const row={classList:{contains:name=>gpu&&name==='gpu-dice'},getBoundingClientRect:()=>({width:1100})};
  const dice=Array.from({length:6},(_,index)=>{
    const nodes={'.die-flight':{style:{}},'.die-cube':{style:{}},'.die-shadow':{style:{}}};
    return{parentElement:row,nodes,getBoundingClientRect:()=>({x:50+index*150,width:100}),querySelector:selector=>nodes[selector]};
  });
  const canvas={dataset:{}};
  globalThis.document={visibilityState:'visible',querySelector:selector=>selector==='.scene-fx'?canvas:null,querySelectorAll:()=>dice,addEventListener:(_name,listener)=>listeners.add(listener),removeEventListener:(_name,listener)=>listeners.delete(listener)};
  globalThis.performance={now:()=>now};
  globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
  globalThis.cancelAnimationFrame=key=>frames.delete(key);
  globalThis.setTimeout=(callback,duration)=>{timers.set(++id,{callback,due:now+duration});return id;};
  globalThis.clearTimeout=key=>timers.delete(key);
  globalThis.matchMedia=()=>({matches:false});
  globalThis.__round23Surface={mountDiceSurface:()=>({draw:poses=>draws.push(poses),stop(){}})};
  return{dice,canvas,draws,frames,timers,listeners,
    frame(time){now=time;const entry=frames.entries().next().value;assert(entry,'An actual timeline callback must be queued');frames.delete(entry[0]);entry[1](time);},
    advance(time){now=time;for(const [key,timer]of [...timers])if(timer.due<=now){timers.delete(key);timer.callback();}},
    restore(){for(const key of keys){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}},
  };
}

test('Round23 final pose still reaches onFrame when onRest is omitted, including DOM fallback',()=>{
  for(const gpu of [false,true]){
    const env=scene(gpu),samples=[];let draw,stop;
    try{
      stop=animateDice(113,()=>{},(poses,landed)=>samples.push({poses,landed}),{play(duration,callback){assert.equal(duration,THROW_DURATION);draw=callback;return()=>{};}});
      draw(16);draw(THROW_DURATION-1);draw(THROW_DURATION);
      assert.equal(samples.length,3);assert.deepEqual(samples.map(s=>s.landed),[false,false,true]);
      assert.deepEqual(samples.at(-1).poses,Array.from({length:6},(_,i)=>restPose(i)));
      if(!gpu){
        for(const [i,die]of env.dice.entries()){
          assert.equal(die.nodes['.die-flight'].style.transform,'translate3d(0px,0px,0px)');
          const p=restPose(i);assert.equal(die.nodes['.die-cube'].style.transform,`rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`);
        }
      }
    }finally{stop?.();env.restore();}
  }
});

test('Round23 retains the legacy final onFrame then onRest callback order',()=>{
  const env=scene(),calls=[];let draw,stop;
  try{
    stop=animateDice(113,()=>{},poses=>calls.push({name:'frame',poses}),{play(_duration,callback){draw=callback;return()=>{};}},()=>calls.push({name:'rest'}));
    draw(THROW_DURATION);
    assert.deepEqual(calls.map(c=>c.name),['frame','rest']);
    assert.deepEqual(calls[0].poses,Array.from({length:6},(_,i)=>restPose(i)));
  }finally{stop?.();env.restore();}
});

test('Round23 cancelled, hidden and expired presentations never fabricate a landed frame',()=>{
  for(const reason of ['cancelled','hidden','deadline']){
    const env=scene(),landed=[];let stop,restCalls=0;
    try{
      stop=animateDice(113,()=>{},(_poses,isLanded)=>landed.push(isLanded),null,()=>restCalls++);
      env.frame(16);
      if(reason==='cancelled')stop();
      else if(reason==='hidden'){document.visibilityState='hidden';for(const listener of [...env.listeners])listener();}
      else env.advance(8001);
      assert.deepEqual(landed,[false],`${reason} cannot submit the final pose`);assert.equal(restCalls,0);
      assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);
    }finally{stop?.();env.restore();}
  }
});

test('Round23 real effects and motion submit one final resting surface instead of an overwritten moving surface',async()=>{
  const env=scene();let presentation;
  try{
    const source=(await readFile(new URL('../src/effects.js',import.meta.url),'utf8'))
      .replace("from './dice-motion.js'",`from ${JSON.stringify(new URL('../src/dice-motion.js',import.meta.url).href)}`)
      .replace("import { mountDiceSurface } from './dice-renderer.js';",'const {mountDiceSurface}=globalThis.__round23Surface;')
      .replace("from './visual-timeline.js'",`from ${JSON.stringify(new URL('../src/visual-timeline.js',import.meta.url).href)}`);
    const {mountEffects}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    presentation=mountEffects({revision:0},{busy:true,rolling:true},{effects:'full'},()=>{});
    env.frame(16);assert.equal(env.draws.length,1);assert.equal(env.draws[0].length,6);
    const before=env.draws.length;env.frame(THROW_DURATION);
    assert.equal(env.draws.length-before,1,'The final timeline callback must submit only the rest-sized surface');
    assert.equal(env.draws.at(-1),undefined,'undefined selects original full-detail rest bounds and budget');
    assert.equal(presentation.status.reason,'complete');
    assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);
  }finally{presentation?.stop();env.restore();}
});

test('Round23 shader face-value interpolation is supported by every complete indexed triangle',()=>{
  const {vertices,indices}=indexedRoundedCubeMesh(),covered=new Set();
  for(let offset=0;offset<indices.length;offset+=3){
    const faces=[0,1,2].map(i=>vertices[indices[offset+i]*9+8]);
    assert(faces.every(face=>Number.isInteger(face)&&face>=0&&face<6));
    assert(faces.every(face=>face===faces[0]),'No interpolated triangle may cross face-value boundaries');
    covered.add(faces[0]);
  }
  assert.deepEqual([...covered].sort(),[0,1,2,3,4,5]);
});

test('Round23 production resting and rolling markup supplies discrete 1–6 atlas values for every face',()=>{
  for(const count of [1,2,3,4,5,6])for(const value of [1,2,3,4,5,6])for(const rolling of [false,true]){
    const html=dice(Array(count).fill(value),{rolling}),faces=[...html.matchAll(/data-face="([^"]+)"/g)].map(match=>Number(match[1]));
    assert.equal(faces.length,count*6);
    for(let offset=0;offset<faces.length;offset+=6){
      const values=faces.slice(offset,offset+6);
      assert(values.every(v=>Number.isInteger(v)&&v>=1&&v<=6));
      assert.deepEqual([...values].sort(),[1,2,3,4,5,6]);
      assert.equal(values[0],rolling?[2,5,3,6,1,4][offset/6]:value);
    }
  }
});

test('Round23 pixel diagnostic retains transparent RGB, alpha and one-level differences without tolerances',()=>{
  const a=Uint8Array.from([0,0,0,0,10,20,30,255]),b=Uint8Array.from([1,0,0,0,10,20,30,253]);
  const delta=comparePixelBuffers(a,b);
  assert.equal(delta.exact,false);assert.equal(delta.changedPixels,2);assert.equal(delta.changedChannels,2);assert.equal(delta.alphaChangedPixels,1);
  assert.equal(delta.maxChannelDelta,2);assert.equal(delta.sumAbsoluteChannelDelta,3);
  assert.equal(delta.channelDeltaHistogram[0],6);assert.equal(delta.channelDeltaHistogram[1],1);assert.equal(delta.channelDeltaHistogram[2],1);
  assert.equal(comparePixelBuffers(a,a).exact,true);assert.equal(comparePixelBuffers(a,b.subarray(0,4)).dimensionMismatch,true);
});
