import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualTimeline,MAX_VISUAL_STEP,VISUAL_WALL_LIMIT} from '../src/visual-timeline.js';

function clock(){
 const keys=['document','performance','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),frames=new Map(),timers=new Map(),listeners=new Set();let id=0,now=100;
 globalThis.document={visibilityState:'visible',addEventListener:(_event,fn)=>listeners.add(fn),removeEventListener:(_event,fn)=>listeners.delete(fn)};
 globalThis.performance={now:()=>now};
 globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.setTimeout=(fn,ms)=>{timers.set(++id,{fn,due:now+ms});return id;};globalThis.clearTimeout=id=>timers.delete(id);
 return {frames,timers,listeners,
  frame(time){now=time;for(const [id,fn]of [...frames]){frames.delete(id);fn(now);}},
  advance(time){now=time;for(const [id,timer]of [...timers])if(timer.due<=now){timers.delete(id);timer.fn();}},
  hide(){document.visibilityState='hidden';for(const fn of [...listeners])fn();},
  restore(){for(const key of keys){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}}
 };
}

test('inactive scenes create no RAF, deadline timer or visibility listener',()=>{
 const env=clock();try{const t=createVisualTimeline();assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);t.stop();assert.equal(t.status.reason,'cancelled');}finally{env.restore();}
});

test('a late first sample is bounded and later normal frames preserve wall-clock pacing',async()=>{
 const env=clock(),samples=[];let t;
 try{
  t=createVisualTimeline();t.play(300,ms=>samples.push(ms));let resolved=false;const done=t.wait(300).then(result=>{resolved=true;return result;});
  env.frame(3100);assert.equal(samples.at(-1),MAX_VISUAL_STEP);await Promise.resolve();assert.equal(resolved,false,'The first delivered RAF cannot expire the UI wait before presentation');
  env.frame(3116);assert.equal(samples.at(-1),116);env.frame(3150);assert.equal(samples.at(-1),150);
  env.frame(3200);env.frame(3300);const result=await done;assert.equal(result.reason,'elapsed');assert.equal(result.elapsed,300);assert.equal(samples.at(-1),300);assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);
 }finally{t?.stop();env.restore();}
});

test('a subsequent long scheduling gap advances real elapsed time without extending slow motion',async()=>{
 const env=clock(),samples=[];let t;
 try{
  t=createVisualTimeline();t.play(300,ms=>samples.push(ms));let settled=false;const done=t.wait(300).then(result=>{settled=true;return result;});
  env.frame(116);env.frame(150);assert.deepEqual(samples,[16,50]);
  env.frame(3150);await Promise.resolve();assert.equal(settled,true,'Only the first RAF may be calibrated; later gaps must not prolong moving dice');
  assert.deepEqual(samples,[16,50,300]);const result=await done;assert.equal(result.reason,'elapsed');assert.equal(result.elapsed,3050);assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);
 }finally{t?.stop();env.restore();}
});

test('an earlier first timestamp is clamped and does not move the visual clock backward',()=>{
 const env=clock(),samples=[];let t;
 try{t=createVisualTimeline();t.play(100,ms=>samples.push(ms));env.frame(80);env.frame(90);env.frame(110);assert.deepEqual(samples,[0,0,10]);}finally{t?.stop();env.restore();}
});

test('render cancellation settles every old waiter and cannot stop a replacement timeline',async()=>{
 const env=clock(),firstStops=[],secondSamples=[];let first,second;
 try{
  first=createVisualTimeline(result=>firstStops.push(result));first.play(1200,()=>{});const a=first.wait(1200),b=first.wait(1800);
  first.stop();second=createVisualTimeline();second.play(200,ms=>secondSamples.push(ms));first.stop();
  assert.equal((await a).reason,'cancelled');assert.equal((await b).reason,'cancelled');assert.equal(firstStops.length,1);env.frame(150);assert.equal(secondSamples.length,1);assert.equal(env.frames.size,1);
 }finally{first?.stop();second?.stop();env.restore();}
});

test('missing RAF reaches a fixed explicit deadline and frees waiters and listeners',async()=>{
 const env=clock();let t;
 try{
  t=createVisualTimeline();t.play(1200,()=>assert.fail('No frame was delivered'));const done=t.wait(1200);env.advance(100+VISUAL_WALL_LIMIT);
  const result=await done;assert.equal(result.reason,'deadline');assert.equal(result.frames,0);assert.equal(result.elapsed,0);assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);
  assert.equal((await t.wait(100)).reason,'deadline','A later caller observes the deadline; it cannot restart the abandoned scene');
 }finally{t?.stop();env.restore();}
});

test('backgrounding cancels immediately and an already hidden scene never starts RAF',async()=>{
 const env=clock();let first,second;
 try{
  first=createVisualTimeline();first.play(1200,()=>{});const pending=first.wait(1200);env.hide();assert.equal((await pending).reason,'hidden');assert.equal(env.frames.size,0);assert.equal(env.listeners.size,0);
  second=createVisualTimeline();second.play(1200,()=>assert.fail('A hidden scene cannot draw'));assert.equal((await second.wait(1200)).reason,'hidden');assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.size,0);
 }finally{first?.stop();second?.stop();env.restore();}
});

test('an effect can finish before the phase wait without rerasterizing its last frame',async()=>{
 const env=clock(),samples=[];let t;
 try{
  t=createVisualTimeline();t.play(100,ms=>samples.push(ms));const done=t.wait(250);
  env.frame(150);env.frame(200);env.frame(250);env.frame(300);env.frame(350);
  assert.deepEqual(samples,[50,100]);assert.equal((await done).elapsed,250);assert.equal(env.frames.size,0);
 }finally{t?.stop();env.restore();}
});

test('a synthetic cleanup failure still releases old waiters and permits a new scene',async()=>{
 const env=clock();let first,second;
 try{
  first=createVisualTimeline(()=>{throw new Error('Synthetic cleanup failure');});first.play(1200,()=>{});const waiting=first.wait(1200);
  assert.doesNotThrow(()=>first.stop());const result=await waiting;assert.equal(result.reason,'cancelled');assert.match(result.cleanupError,/Synthetic cleanup failure/);
  assert.equal(env.timers.size,0);assert.equal(env.frames.size,0);assert.equal(env.listeners.size,0);
  second=createVisualTimeline();second.play(100,()=>{});const next=second.wait(100);env.frame(200);assert.equal((await next).reason,'elapsed');
 }finally{first?.stop();second?.stop();env.restore();}
});
