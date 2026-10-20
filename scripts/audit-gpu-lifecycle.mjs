import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const source=resolve(process.argv[2]||fileURLToPath(new URL('../',import.meta.url)));


const active=new Set(),canvases=[],noop=()=>{},boundBuffers=new Map();let fail='',generation=0,draws=0,observers=0,program,lost=false,bufferCalls=0;
const counts={created:0,deleted:0};
const fresh=type=>{const value={type,generation};active.add(value);counts.created++;return value;};
const release=value=>{if(active.delete(value))counts.deleted++;};
const valid=value=>assert(value&&value.generation===generation,'no stale-generation handles');
const gl=new Proxy({
 createShader:()=>fail==='shader-create'?null:fresh('shader'),getShaderParameter:()=>fail!=='shader-compile',
 createProgram:()=>fail==='program-create'?null:fresh('program'),getProgramParameter:()=>fail!=='program-link',
 createBuffer:()=>{bufferCalls++;return fail==='buffer-create'||(fail==='index-buffer-create'&&bufferCalls===2)?null:fresh('buffer');},createTexture:()=>fail==='texture-create'?null:fresh('texture'),
 getAttribLocation:()=>fail==='attribute'?-1:0,getUniformLocation:()=>fail==='uniform'?null:{type:'uniform',generation},
 deleteShader:release,deleteProgram:release,deleteBuffer:release,deleteTexture:release,
 useProgram:value=>{valid(value);program=value;},bindBuffer:(target,value)=>{valid(value);boundBuffers.set(target,value);},bufferData:(target,data)=>{const buffer=boundBuffers.get(target);valid(buffer);assert(ArrayBuffer.isView(data));buffer.data=data;},bindTexture:(_target,value)=>valid(value),
 drawArrays:()=>{assert(!lost);valid(program);draws++;},
 drawElements:(mode,count,type,offset)=>{assert(!lost);valid(program);const vertex=boundBuffers.get('ARRAY_BUFFER'),index=boundBuffers.get('ELEMENT_ARRAY_BUFFER');valid(vertex);valid(index);assert.equal(mode,'TRIANGLES');assert.equal(type,'UNSIGNED_SHORT');assert.equal(offset,0);assert(index.data instanceof Uint16Array);assert.equal(count,index.data.length);for(const value of index.data)assert(value<vertex.data.length/9,'index remains inside complete attribute buffer');draws++;},
 uniform1f:valid,uniform1i:valid,uniform1fv:valid,uniform2f:valid,uniform3f:valid,uniform3fv:valid,uniform4f:valid,
 getExtension:()=>null,
},{get(target,key){return key in target?target[key]:String(key).toUpperCase()===key?key:noop;}});
const ctx=new Proxy({},{get:()=>noop}),classes=new Set();
const die={getBoundingClientRect:()=>({x:70,y:20,width:100,height:130}),querySelectorAll:()=>Array.from({length:6},(_,i)=>({dataset:{face:String(i+1)}}))};
const row={isConnected:true,children:[],classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)},getBoundingClientRect:()=>({x:0,y:0,width:300,height:160}),querySelectorAll:()=>[die],prepend(canvas){if(canvas.parentElement)canvas.remove();this.children.unshift(canvas);canvas.parentElement=this;}};
globalThis.document={querySelector:()=>row,fonts:{check:()=>true,ready:Promise.resolve()},createElement(){
 const listeners=new Map(),canvas={width:300,height:150,dataset:{},style:{},setAttribute:noop,parentElement:null,getContext:type=>type==='webgl'?gl:ctx,
  addEventListener(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},
  dispatch(name){if(name==='webglcontextlost'){lost=true;active.clear();boundBuffers.clear();}else{lost=false;generation++;program=null;bufferCalls=0;}for(const fn of listeners.get(name)||[])fn({preventDefault:noop});},
  listenerCount:name=>(listeners.get(name)||[]).length,
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}};
 canvases.push(canvas);return canvas;
}};
globalThis.getComputedStyle=()=>({color:'rgb(220, 190, 120)'});globalThis.devicePixelRatio=1;
globalThis.ResizeObserver=class{constructor(){observers++;this.active=true;}observe(){}disconnect(){if(this.active){this.active=false;observers--;}}};
const R=await import(pathToFileURL(resolve(source,'src/dice-renderer.js')));const handle=R.mountDiceSurface();await Promise.resolve();
const readyResources=typeof R.indexedRoundedCubeMesh==='function'?4:3;
const canvas=canvases[0];assert.equal(active.size,readyResources);assert.equal(observers,1);const failures=[];
for(const failure of ['shader-create','shader-compile','program-create','program-link','buffer-create','texture-create','attribute','uniform',...(readyResources===4?['index-buffer-create']:[])]){
 canvas.dispatch('webglcontextlost');fail=failure;const before=draws;
 canvas.dispatch('webglcontextrestored');assert.equal(active.size,0,`${failure}: release every partially initialized resource`);assert.equal(draws,before);assert(!classes.has('gpu-dice'));assert.equal(canvas.dataset.contextState,'fallback');
 canvas.dispatch('webglcontextlost');fail='';canvas.dispatch('webglcontextrestored');assert.equal(active.size,readyResources);assert.equal(draws,before+1);assert(classes.has('gpu-dice'));failures.push(failure);
}
for(let i=0;i<25;i++){canvas.dispatch('webglcontextlost');canvas.dispatch('webglcontextrestored');assert.equal(active.size,readyResources);assert.equal(observers,1);}
assert.equal(canvas.listenerCount('webglcontextlost'),1);assert.equal(canvas.listenerCount('webglcontextrestored'),1);
handle.stop();handle.stop();assert.equal(observers,0);const before=draws;canvas.dispatch('webglcontextlost');canvas.dispatch('webglcontextrestored');assert.equal(draws,before);
const report={method:'independent strict generation/resource-count mock; not a browser/GPU memory measurement',faultCases:failures.length,faults:failures,repeatRecoveryCycles:25,liveResourcesPerReadyContext:readyResources,observerCountAfterDoubleStop:observers,lossListeners:canvas.listenerCount('webglcontextlost'),restoreListeners:canvas.listenerCount('webglcontextrestored'),allPassed:true};
if(process.argv[3])writeFileSync(resolve(process.argv[3]),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
