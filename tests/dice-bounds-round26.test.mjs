import test from 'node:test';
import assert from 'node:assert/strict';
import {diceSurfaceBounds} from '../src/dice-renderer.js';
import {restPose,throwFrames} from '../src/dice-motion.js';
import {referenceDiceSurfaceBounds,countedBounds,boundsTrajectories} from '../scripts/audit-dice-bounds-round26.mjs';

const records=[{x:-100,y:-20,size:100},{x:100,y:-20,size:100}],poses=[restPose(0),restPose(1)];
const clip={left:-500,top:-350,right:500,bottom:350,width:1000,height:700};
const compare=(rows,frames,width,height,previous)=>{
  const actual=countedBounds(diceSurfaceBounds,rows,frames,width,height,previous);
  assert.deepEqual(actual.bounds,referenceDiceSurfaceBounds(rows,frames,width,height,previous));return actual;
};

test('Round26 all 144 authored trajectories keep exact v5.25 bounds while skipping proven projections',()=>{
  let count=0,fast=0;
  for(const row of boundsTrajectories()){
    let previous=null;
    for(const frame of row.frames){const result=compare(row.records,frame.dice,row.rowWidth,row.rowHeight,previous);previous=result.bounds;count++;if(result.trigCalls===0)fast++;}
  }
  assert.equal(count,22320);assert(fast>count*.8,'The authored workload must actually avoid most exact projection calls');
});

test('Round26 reuse returns the original public shape without aliasing or mutating its inputs',()=>{
  const previous=Object.freeze({...clip,privateMarker:'must not leak'}),frozenRows=records.map(Object.freeze),frozenPoses=poses.map(Object.freeze);
  const result=compare(frozenRows,frozenPoses,1000,180,previous);
  assert.equal(result.trigCalls,0);assert.notEqual(result.bounds,previous);
  assert.deepEqual(Object.keys(result.bounds),['left','top','right','bottom','width','height']);assert.deepEqual(result.bounds,clip);
});

test('Round26 first pose, resting pose and resize reset always use fresh exact geometry',()=>{
  for(const [frame,width,height,previous]of [[poses,1000,180,null],[undefined,1000,180,clip],[poses,1100,198,null],[poses,660,125,null]]){
    const result=compare(records,frame,width,height,previous);assert.equal(result.trigCalls,records.length*6);
  }
  assert(diceSurfaceBounds(records,undefined,1000,180,clip).width<clip.width);
});

test('Round26 translations outside the old envelope expand every required edge',()=>{
  for(const [axis,value]of [['x',20],['x',-20],['y',20],['y',-20],['z',10]]){
    const changed=poses.map(p=>({...p,[axis]:value})),result=compare(records,changed,1000,180,clip);
    assert.equal(result.trigCalls,records.length*6);assert.notDeepEqual(result.bounds,clip);
  }
});

test('Round26 focal plane crossings, behind-camera poses and invalid numbers retain exact fallback behavior',()=>{
  for(const z of [12.65,13.5,14.5,-100,Infinity,NaN]){
    const changed=poses.map(p=>({...p,z})),result=compare(records,changed,1000,180,clip);
    if(z>=12.65||!Number.isFinite(z))assert.equal(result.trigCalls,records.length*6);
  }
  for(const field of ['x','y','z','rx','ry','rz'])for(const value of [Infinity,-Infinity,NaN]){
    const result=compare(records,poses.map(p=>({...p,[field]:value})),1000,180,clip);assert.equal(result.trigCalls,records.length*6);
  }
  for(const width of [0,-1000,Infinity,NaN])assert.equal(compare(records,poses,width,180,clip).trigCalls,records.length*6);
  assert.equal(compare(records,poses,1000,NaN,clip).trigCalls,records.length*6);
});

test('Round26 missing poses, empty dice and malformed previous dimensions never enable reuse',()=>{
  for(const changed of [[],[poses[0]],null])assert.equal(compare(records,changed,1000,180,clip).trigCalls,records.length*6);
  compare([],[],1000,180,clip);
  for(const previous of [{...clip,width:999},{...clip,height:0},{left:clip.left},{...clip,right:Infinity},{...clip,left:NaN}]){
    assert.equal(compare(records,poses,1000,180,previous).trigCalls,records.length*6);
  }
  for(const size of [0,-100,Infinity,NaN])assert.equal(compare(records.map(d=>({...d,size})),poses,1000,180,clip).trigCalls,records.length*6);
});

test('Round26 fractional envelope edges preserve the original outward rounding',()=>{
  const rows=[{x:0,y:0,size:100}],frame=[{x:0,y:0,z:0,rx:35.2643897,ry:45,rz:0}];
  const exact=referenceDiceSurfaceBounds(rows,frame,1000,180,null);
  for(const delta of [-.999999,-.25,-1e-8,0,1e-8,.25,.999999]){
    for(const edge of ['left','top','right','bottom']){
      const previous={...exact,[edge]:exact[edge]+delta};previous.width=previous.right-previous.left;previous.height=previous.bottom-previous.top;
      compare(rows,frame,1000,180,previous);
    }
  }
});

test('Round26 arbitrary rotations, signs, scales and changing layouts match the frozen projector',()=>{
  let seed=117;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let previous=clip;
  for(let index=0;index<1800;index++){
    const width=50+random()*5000,height=20+random()*1500,count=1+index%6;
    const rows=Array.from({length:count},()=>({x:(random()-.5)*width*1.8,y:(random()-.5)*height,size:.01+random()*width*.4}));
    const frame=rows.map(()=>({x:(random()-.5)*30,y:(random()-.5)*30,z:(random()-.5)*45,rx:(random()-.5)*1e8,ry:(random()-.5)*1e8,rz:(random()-.5)*1e8}));
    if(index%5===0)previous=null;
    previous=compare(rows,frame,width,height,previous).bounds;
  }
});

test('Round26 frozen authored frames and previous envelopes remain unchanged after repeated calls',()=>{
  const frames=throwFrames(6,7919),rows=Array.from({length:6},(_,i)=>({x:(i-2.5)*145,y:-20,size:100})),before=JSON.stringify({frames,rows,clip});
  let previous=clip;for(const frame of frames)previous=compare(rows,frame.dice,1000,180,previous).bounds;
  assert.equal(JSON.stringify({frames,rows,clip}),before);
});
