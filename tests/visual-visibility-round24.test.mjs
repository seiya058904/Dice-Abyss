import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observeVisualSurface} from '../src/visual-timeline.js';
import {throwFrames,restPose} from '../src/dice-motion.js';

let moduleId=0;
function environment(){
 const keys=['document','IntersectionObserver','ResizeObserver','devicePixelRatio','getComputedStyle','performance','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','matchMedia','innerWidth','innerHeight','Path2D','__visibility24'];
 const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 const intersections=[],resizes=[],canvases=[],queue=new Map(),timers=new Map(),listeners=new Map();
 const counts={draws:0,allocations:0,geometryReads:0,images:0,strokes:0,clears:0,materialOps:0},uniforms=new Map();
 let now=0,next=0,fontReady=true;
 class IO {
  constructor(callback){this.callback=callback;this.disconnected=false;intersections.push(this);}
  observe(target){this.target=target;}
  disconnect(){this.disconnected=true;}
  deliver(visible){this.callback([{target:this.target,isIntersecting:visible}]);}
 }
 globalThis.IntersectionObserver=IO;
 globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;resizes.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}deliver(){this.callback([]);}};
 const context=canvas=>new Proxy({
  drawImage(){counts.images++;},stroke(){counts.strokes++;},clearRect(){counts.clears++;},
  createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),
 },{get(target,key){if(key in target)return target[key];return()=>{if(canvas.className!=='scene-fx')counts.materialOps++;};}});
 const gl=new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_program,name)=>({name}),
  createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),
  uniform3f(location,...values){uniforms.set(location.name,values);},
  drawElements(){counts.draws++;},getExtension:()=>null,
 },{get(target,key){if(key in target)return target[key];if(/^[A-Z_]+$/.test(key)){target[key]=Object.keys(target).length;return target[key];}return()=>{};}});
 function canvas(){
  let width=300,height=150;const events=new Map(),element={className:'',dataset:{},style:{},parentElement:null,
   get width(){return width;},set width(value){width=value;if(element.className==='dice-surface')counts.allocations++;},
   get height(){return height;},set height(value){height=value;if(element.className==='dice-surface')counts.allocations++;},
   setAttribute(){},addEventListener:(type,callback)=>events.set(type,callback),emit(type){events.get(type)?.({preventDefault(){}});},
   getContext:kind=>kind==='webgl'?gl:element.ctx,
  };element.ctx=context(element);canvases.push(element);return element;
 }
 const rowClasses=new Set(),row={isConnected:true,width:1000,height:180,classList:{add:name=>rowClasses.add(name),remove:name=>rowClasses.delete(name),contains:name=>rowClasses.has(name)},
  prepend(element){element.parentElement=row;},getBoundingClientRect(){counts.geometryReads++;return{x:0,y:0,left:0,top:0,width:row.width,height:row.height};},
 };
 const dice=Array.from({length:6},(_,index)=>({parentElement:row,classList:{contains:name=>name==='resonant'},
  getBoundingClientRect(){counts.geometryReads++;return{x:50+index*145,y:20,left:50+index*145,top:20,width:100,height:140};},
  querySelectorAll:()=>Array.from({length:6},(_,face)=>({dataset:{face:String(face+1)}})),
 }));row.querySelectorAll=()=>dice;
 const panelBounds={x:0,y:0,left:0,top:0,right:1000,bottom:600,width:1000,height:600};
 const stage={style:{},append(){},getBoundingClientRect(){counts.geometryReads++;return panelBounds;},querySelector:()=>null,querySelectorAll:()=>dice};
 const sceneCanvas=canvas();sceneCanvas.className='scene-fx';sceneCanvas.getBoundingClientRect=()=>{counts.geometryReads++;return panelBounds;};
 const panel={firstChild:sceneCanvas,getBoundingClientRect:()=>panelBounds,prepend(){}};sceneCanvas.parentElement=panel;
 globalThis.document={visibilityState:'visible',fonts:{check:()=>fontReady,ready:Promise.resolve()},
  querySelector:selector=>selector==='.cube-row'?row:selector==='.scene-fx'?sceneCanvas:selector==='.combat-stage'?stage:null,
  querySelectorAll:()=>dice,createElement:canvas,
  addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},
  removeEventListener(type,callback){listeners.get(type)?.delete(callback);},
 };
 globalThis.devicePixelRatio=1;globalThis.getComputedStyle=()=>({color:'rgb(100,150,200)'});
 globalThis.performance={now:()=>now};globalThis.requestAnimationFrame=callback=>{queue.set(++next,callback);return next;};globalThis.cancelAnimationFrame=id=>queue.delete(id);
 globalThis.setTimeout=(callback,duration)=>{timers.set(++next,{callback,due:now+duration});return next;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.matchMedia=()=>({matches:false});globalThis.innerWidth=1920;globalThis.innerHeight=1080;
 globalThis.Path2D=class {moveTo(){}lineTo(){}closePath(){}};
 return {counts,uniforms,intersections,resizes,canvases,row,dice,sceneCanvas,queue,timers,listeners,
  async renderer(){return import(new URL(`../src/dice-renderer.js?visibility-test-${++moduleId}`,import.meta.url));},
  async effects(){
   globalThis.__visibility24={mountDiceSurface:()=>null};
   const source=(await readFile(new URL('../src/effects.js',import.meta.url),'utf8'))
    .replace("from './dice-motion.js'",`from ${JSON.stringify(new URL('../src/dice-motion.js',import.meta.url).href)}`)
    .replace("import { mountDiceSurface } from './dice-renderer.js';",'const {mountDiceSurface}=globalThis.__visibility24;')
    .replace("from './visual-timeline.js'",`from ${JSON.stringify(new URL('../src/visual-timeline.js',import.meta.url).href)}`);
   return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${++moduleId}`);
  },
  frame(time){now=time;const entry=queue.entries().next().value;assert(entry,'A real timeline callback must remain queued');queue.delete(entry[0]);entry[1](time);},
  expire(time){now=time;for(const [id,timer]of [...timers])if(timer.due<=time){timers.delete(id);timer.callback();}},
  hide(){document.visibilityState='hidden';for(const callback of [...listeners.get('visibilitychange')||[]])callback();},
  setFont(value){fontReady=value;},
  restore(){for(const key of keys){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}},
 };
}

test('Round24 surface visibility is conservative before delivery or without IntersectionObserver',()=>{
 const env=environment();
 try{
  const target={};let visibleEvents=0;const visibility=observeVisualSurface(target,()=>visibleEvents++),observer=env.intersections[0];
  assert.equal(visibility.visible,true);observer.deliver(false);assert.equal(visibility.visible,false);
  observer.deliver(true);assert.equal(visibleEvents,1);observer.deliver(true);assert.equal(visibleEvents,1);
  observer.callback([{target:{},isIntersecting:false}]);assert.equal(visibility.visible,true,'Unrelated targets cannot hide this surface');
  visibility.stop();observer.deliver(false);observer.deliver(true);assert.equal(visibleEvents,1);assert(observer.disconnected);
  delete globalThis.IntersectionObserver;const fallback=observeVisualSurface(target,()=>visibleEvents++);assert.equal(fallback.visible,true);fallback.stop();assert.equal(visibleEvents,1);
 }finally{env.restore();}
});

test('Round24 offscreen GPU submissions and allocations stop while the flight envelope and latest pose advance',async()=>{
 const env=environment();let surface;
 try{
  const {mountDiceSurface}=await env.renderer();surface=mountDiceSurface();await Promise.resolve();
  const observer=env.intersections[0],canvas=observer.target,initial={...env.counts},restStyle=canvas.style.cssText;
  observer.deliver(false);const poses=throwFrames(6,113,1.45,4.34);
  surface.draw(poses[20].dice);surface.draw(poses[65].dice);
  assert.equal(env.counts.draws,initial.draws);assert.equal(env.counts.allocations,initial.allocations);assert.equal(env.counts.geometryReads,initial.geometryReads);
  assert.notEqual(canvas.style.cssText,restStyle,'The observed surface expands to its conservative flight envelope even while skipped');
  observer.deliver(true);assert.equal(env.counts.draws-initial.draws,6);
  const latest=poses[65].dice.at(-1);assert.deepEqual(env.uniforms.get('uAngles'),[latest.rx,latest.ry,latest.rz].map(value=>value*Math.PI/180));
  const after=env.counts.draws;observer.deliver(true);assert.equal(env.counts.draws,after,'Equal visible notifications do not redraw an already current surface');
  surface.stop();observer.deliver(false);observer.deliver(true);env.resizes[0].deliver();assert.equal(env.counts.draws,after);assert(observer.disconnected);assert(env.resizes[0].disconnected);
 }finally{surface?.stop();env.restore();}
});

test('Round24 a hidden terminal pose survives resize and context restoration, then resumes at rest quality',async()=>{
 const env=environment();let surface;
 try{
  const {mountDiceSurface}=await env.renderer();surface=mountDiceSurface();await Promise.resolve();
  const observer=env.intersections[0],canvas=observer.target;observer.deliver(false);
  surface.draw(throwFrames(6,9)[40].dice);surface.draw();env.row.width=1100;env.resizes[0].deliver();
  const before=env.counts.draws;canvas.emit('webglcontextlost');assert.equal(env.row.classList.contains('gpu-dice'),false);
  canvas.emit('webglcontextrestored');assert.equal(env.counts.draws,before,'Restoration must not draw an offscreen surface');
  observer.deliver(true);assert.equal(env.counts.draws-before,6);assert.equal(canvas.dataset.motionQuality,'rest');assert.equal(canvas.dataset.pixelBudget,'1800000');
  const pose=restPose(5);assert.deepEqual(env.uniforms.get('uAngles'),[pose.rx,pose.ry,pose.rz].map(value=>value*Math.PI/180));
 }finally{surface?.stop();env.restore();}
});

test('Round24 a font becoming ready offscreen invalidates the static surface without repainting it early',async()=>{
 const env=environment();let surface;
 try{
  env.setFont(false);const {mountDiceSurface}=await env.renderer();surface=mountDiceSurface();
  const observer=env.intersections[0];observer.deliver(false);const before=env.counts.draws;
  env.setFont(true);await Promise.resolve();assert.equal(env.counts.draws,before);
  observer.deliver(true);assert.equal(env.counts.draws-before,6);assert.equal(observer.target.dataset.motionQuality,'rest');
 }finally{surface?.stop();env.restore();}
});

test('Round24 a stopped GPU mount cannot repaint the next owner through a queued observer callback',async()=>{
 const env=environment();let first,second;
 try{
  const {mountDiceSurface}=await env.renderer();first=mountDiceSurface();const oldObserver=env.intersections[0];oldObserver.deliver(false);first.draw(throwFrames(6,4)[20].dice);first.stop();
  second=mountDiceSurface();await Promise.resolve();const after=env.counts.draws;oldObserver.deliver(true);assert.equal(env.counts.draws,after);
  assert(oldObserver.disconnected);assert.equal(env.intersections.length,2);
 }finally{first?.stop();second?.stop();env.restore();}
});

test('Round24 offscreen combat effects keep time but skip canvas and flame raster work, and reentry paints only the latest time',async()=>{
 const env=environment();let presentation;
 try{
  const {mountEffects}=await env.effects();presentation=mountEffects({revision:4,phase:'combat',enemy:{shield:0,type:'combat'},lastRoll:{best:3,critical:true,follow:true,absorbed:0}},{busy:true,view:'game',event:'roll'},{effects:'full'},()=>{});
  const observer=env.intersections[0];assert.equal(observer.target,env.sceneCanvas);observer.deliver(false);
  const before={...env.counts};env.frame(16);env.frame(100);env.frame(500);
  assert.equal(env.counts.images,before.images);assert.equal(env.counts.strokes,before.strokes);assert.equal(env.counts.clears,before.clears);assert.equal(env.counts.materialOps,before.materialOps);assert.equal(env.counts.geometryReads,before.geometryReads);
  assert.equal(env.sceneCanvas.dataset.fxFrames,'0');assert.equal(env.sceneCanvas.dataset.fxElapsed,'500');assert.equal(presentation.status.elapsed,500);assert.equal(env.queue.size,1);
  observer.deliver(true);assert(env.counts.images>before.images);assert.equal(env.sceneCanvas.dataset.fxFrames,'1');assert.equal(env.sceneCanvas.dataset.fxElapsed,'500');
  const shown=env.counts.images;observer.deliver(true);assert.equal(env.counts.images,shown);
  observer.deliver(false);env.frame(1150);assert.equal(presentation.status.reason,'complete');assert.equal(env.queue.size,0);assert.equal(env.timers.size,0);assert(observer.disconnected);
  const complete=env.counts.images;observer.deliver(true);assert.equal(env.counts.images,complete,'An expired effect never restarts on scroll back');
 }finally{presentation?.stop();env.restore();}
});

for(const reason of ['cancelled','hidden','deadline'])test(`Round24 ${reason} cleanup disconnects offscreen effects and ignores delayed visibility notifications`,async()=>{
 const env=environment();let presentation;
 try{
  const {mountEffects}=await env.effects();presentation=mountEffects({revision:4,phase:'combat',enemy:{shield:0,type:'combat'},lastRoll:{best:3,critical:true,follow:false,absorbed:0}},{busy:true,view:'game',event:'roll'},{effects:'full'},()=>{});
  const observer=env.intersections[0];observer.deliver(false);env.frame(16);
  if(reason==='cancelled')presentation.stop();else if(reason==='hidden')env.hide();else env.expire(8001);
  const before=env.counts.images;observer.deliver(true);assert.equal(env.counts.images,before);assert(observer.disconnected);assert.equal(presentation.status.reason,reason);
  assert.equal(env.queue.size,0);assert.equal(env.timers.size,0);assert.equal(env.listeners.get('visibilitychange')?.size??0,0);
 }finally{presentation?.stop();env.restore();}
});
