import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roundedCubeMesh,projectDiePoint,diceSurfaceBounds,resizeDiceBuffer} from '../src/dice-renderer.js';
import {restPose,throwFrames} from '../src/dice-motion.js';

test('uniforms shared across shader stages declare the same type and effective precision',()=>{
 const source=readFileSync(new URL('../src/dice-renderer.js',import.meta.url),'utf8');
 const stages=['vertex','fragment'].map(stage=>{
  const shader=source.match(new RegExp('const '+stage+'=`([\\s\\S]*?)`;'))?.[1];assert(shader,`${stage} shader source is present`);
  const defaultPrecision=shader.match(/precision\s+(lowp|mediump|highp)\s+float\s*;/)?.[1]||(stage==='vertex'?'highp':undefined);
  return new Map([...shader.matchAll(/uniform\s+(?:(lowp|mediump|highp)\s+)?(\w+)\s+(\w+)(\[[^\]]+\])?\s*;/g)].map(([,precision,type,name,array=''])=>[name,{type:type+array,precision:precision||defaultPrecision}]));
 });
 for(const [name,declaration]of stages[0])if(stages[1].has(name))assert.deepEqual(stages[1].get(name),declaration,`${name} must link across vertex/fragment stages`);
 assert.deepEqual(stages[0].get('uViewport'),{type:'vec2',precision:'highp'},'projection retains its original precision');
});

test('beveled dice mesh has six complete faces, finite unit normals and a bounded body',()=>{
  const mesh=roundedCubeMesh(),faces=new Set();let rounded=0;
  assert.equal(mesh.length,6*12*12*6*9);
  for(let i=0;i<mesh.length;i+=9){
    const [x,y,z,nx,ny,nz,u,v,face]=mesh.slice(i,i+9);
    assert([x,y,z,nx,ny,nz,u,v,face].every(Number.isFinite));
    assert(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))<=.500001);
    assert(Math.abs(Math.hypot(nx,ny,nz)-1)<.000001);
    assert(u>=0&&u<=1&&v>=0&&v<=1);
    faces.add(face);
    if([nx,ny,nz].filter(n=>Math.abs(n)>.01).length>1)rounded++;
  }
  assert.deepEqual([...faces],[0,1,2,3,4,5]);
  assert(rounded>0,'the cube needs real curved bevel geometry');
});

const layout=(count,size=100,width=900)=>({width,height:size+64,records:Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*size*1.5,y:-12,size}))});
const inside=(box,q)=>q.x>=box.left&&q.x<=box.right&&q.y>=box.top&&q.y<=box.bottom;
function referenceProjection(d,p,point,width){
 // Independent sequential rotations matching the shader's column-major matrices.
 let [x,y,z]=point;for(const [axis,degrees]of [['x',p.rx],['y',p.ry],['z',p.rz]]){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);if(axis==='x')[y,z]=[c*y-s*z,s*y+c*z];else if(axis==='y')[x,z]=[c*x+s*z,-s*x+c*z];else [x,y]=[c*x-s*y,s*x+c*y];}
 const f=width*1.35,scale=f/(f-(z+p.z)*d.size);return{x:(x*d.size+d.x+p.x*d.size)*scale,y:(y*d.size+d.y+p.y*d.size)*scale};
}
test('crop keeps the original perspective and screen coordinates across resting and moving windows',()=>{
 const {records,width,height}=layout(6),poses=throwFrames(6,713,1.5,width/100/2-.66)[45].dice;
 const rest=diceSurfaceBounds(records,null,width,height),motion=diceSurfaceBounds(records,poses,width,height);
 for(let i=0;i<records.length;i++)for(const point of [[0,0,.5],[.5,-.5,.5],[-.5,.5,-.5]]){
  const q=projectDiePoint(records[i],poses[i],point,width),expected=referenceProjection(records[i],poses[i],point,width);assert(Math.abs(q.x-expected.x)<1e-9&&Math.abs(q.y-expected.y)<1e-9);
  for(const clip of [rest,motion]){const ndcX=(q.x-(clip.left+clip.width/2))/(clip.width/2),ndcY=-(q.y-(clip.top+clip.height/2))/(clip.height/2);assert(Math.abs((ndcX+1)*clip.width/2+clip.left+width/2-(expected.x+width/2))<1e-9);assert(Math.abs((1-ndcY)*clip.height/2+clip.top+height/2-(expected.y+height/2))<1e-9);}
 }
});
test('resting crop tightly bounds 1–6 complete bodies at several user scales',()=>{
 for(const count of [1,2,3,4,5,6])for(const scale of [.9,1,1.1,1.8]){
  const {records,width,height}=layout(count,90*scale,900*scale),box=diceSurfaceBounds(records,null,width,height),oldArea=width*(height+records[0].size*4.4);
  assert(box.width*box.height<oldArea*.5,'static transparent surface should lose at least half its area');
  const mesh=roundedCubeMesh(4);for(let i=0;i<count;i++)for(let v=0;v<mesh.length;v+=9)assert(inside(box,referenceProjection(records[i],restPose(i),mesh.slice(v,v+3),width)));
 }
});
test('flight window contains complete bodies across generated trajectories and only grows until rest',()=>{
 for(const count of [1,2,3,4,5,6])for(const seed of [1,713,4294967295]){
  const {records,width,height}=layout(count),frames=throwFrames(count,seed,1.5,width/100/2-.66);let previous=null;
  for(const {dice}of frames){const box=diceSurfaceBounds(records,dice,width,height,previous);if(previous){assert(box.left<=previous.left&&box.top<=previous.top&&box.right>=previous.right&&box.bottom>=previous.bottom);}
   for(let i=0;i<count;i++)for(const x of [-.5,0,.5])for(const y of [-.5,0,.5])for(const z of [-.5,0,.5])assert(inside(box,referenceProjection(records[i],dice[i],[x,y,z],width)));
   previous=box;
  }
  const rest=diceSurfaceBounds(records,null,width,height);assert(rest.height<previous.height);
 }
 // Out-of-envelope input is covered by the actual projected corners as well;
 // correctness does not rely on only the current motion generator's samples.
 const {records,width,height}=layout(1),pose={x:6,y:-8,z:.65,rx:27,ry:49,rz:-11},box=diceSurfaceBounds(records,[pose],width,height);
 for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])assert(inside(box,referenceProjection(records[0],pose,[x,y,z],width)));
});
test('buffer resize never creates a transient allocation larger than old or final pixel counts',()=>{
 for(const [oldW,oldH,newW,newH]of [[1800,1000,500,1800],[500,1800,1800,500],[1800,1000,900,500],[300,150,1800,1000]]){
  let w=oldW,h=oldH;const allocations=[],canvas={get width(){return w;},set width(v){w=v;allocations.push(w*h);},get height(){return h;},set height(v){h=v;allocations.push(w*h);}};
  resizeDiceBuffer(canvas,newW,newH);assert.equal(w,newW);assert.equal(h,newH);assert(allocations.every(n=>n<=Math.max(oldW*oldH,newW*newH)));const writes=allocations.length;resizeDiceBuffer(canvas,newW,newH);assert.equal(allocations.length,writes);
 }
});
