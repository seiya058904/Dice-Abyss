import test from 'node:test';
import assert from 'node:assert/strict';
import {recordMotionSampling} from '../scripts/qa-motion-sampling-round24.mjs';
import {throwFrames,restPose,THROW_DURATION} from '../src/dice-motion.js';

for(const gpu of [true,false])test(`Round24 unchanged authored samples skip surface and shadow work in ${gpu?'GPU':'DOM fallback'} mode`,async()=>{
 const fast=await recordMotionSampling(undefined,{hz:240,gpu}),native=await recordMotionSampling(undefined,{hz:120,gpu});
 assert.equal(fast.uniqueSubmittedPoses,throwFrames(6,113).length);
 assert.equal(fast.frameCalls,fast.uniqueSubmittedPoses,'Every authored pose is submitted at most once');
 assert(fast.frameCalls<fast.rafCallbacks/1.9,'A 240 Hz supplied stream contains about two callbacks per authored pose');
 assert.equal(fast.styleWrites,fast.frameCalls*6*(gpu?2:4),'Repeated samples also avoid identical DOM writes');
 assert.equal(native.frameCalls,native.rafCallbacks,'Do not drop any distinct 120 Hz authored pose');
 for(const row of [fast,native]){
  assert.deepEqual(row.trace.at(-1).poses,Array.from({length:6},(_,index)=>restPose(index)));
  assert.equal(row.trace.at(-1).landed,true);assert.deepEqual(row.rest,[THROW_DURATION]);
  assert(row.sounds.length>0);assert(row.cleanup.every(die=>Object.values(die).every(style=>Object.values(style).every(value=>value===''))));
 }
});

test('Round24 repeated sample remains dirty when the GPU fallback mode changes',async()=>{
 const result=await recordMotionSampling(undefined,{times:[100,101,102,103,104],modeAt:time=>time!==101&&time!==103});
 assert.equal(result.uniqueSubmittedPoses,1);assert.equal(result.frameCalls,5,'Each mode change applies the latest pose to its active renderer');
 for(const row of result.trace.filter(row=>!row.activeGPU))for(const die of row.dom){
  assert.match(die['.die-flight'].transform,/translate3d/);assert.match(die['.die-cube'].transform,/rotateX/);
 }
});

test('Round24 loss during surface submission immediately updates the CSS fallback',async()=>{
 const result=await recordMotionSampling(undefined,{times:[100,101,102],afterFrameMode:()=>false});
 assert.equal(result.frameCalls,1,'Stable fallback then skips duplicate samples');
 assert.equal(result.trace[0].activeGPU,false);assert.match(result.trace[0].dom[0]['.die-cube'].transform,/rotateX/);
});

test('Round24 equal early timestamps do not discard the first sample or terminal notifications',async()=>{
 const result=await recordMotionSampling(undefined,{times:[0,0,0,0,THROW_DURATION,THROW_DURATION]});
 assert.equal(result.frameCalls,3,'First and terminal callbacks retain their established contract');
 assert.equal(result.submitted[0].landed,false);assert.deepEqual(result.rest,[THROW_DURATION,THROW_DURATION]);
 assert.deepEqual(result.trace.at(-1).poses,Array.from({length:6},(_,index)=>restPose(index)));
});
