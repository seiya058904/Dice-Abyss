import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Point this file at the untouched input to reproduce this round's failures.
const root=process.env.QA_RENDER_ROOT?pathToFileURL(process.env.QA_RENDER_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const V=await import(new URL('src/views.js',root));

function fakeWebGLDOM(){
 const keys=['document','getComputedStyle','devicePixelRatio','ResizeObserver','requestAnimationFrame'],saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 const calls={programs:0,buffers:0,textures:0,atlasUploads:0,draws:0,observers:0,rafs:0,deletedPrograms:0},canvases=[];
 let generation=0,lost=false,failLink=false,program,selected;
 const noop=()=>{},fresh=type=>({type,generation}),valid=resource=>assert.equal(resource?.generation,generation,'restored context cannot use an old GPU resource');
 const gl=new Proxy({
  createShader:()=>fresh('shader'),getShaderParameter:()=>true,createProgram:()=>{calls.programs++;return fresh('program');},getProgramParameter:()=>!failLink,
  createBuffer:()=>{calls.buffers++;return fresh('buffer');},createTexture:()=>{calls.textures++;return fresh('texture');},getAttribLocation:()=>0,getUniformLocation:()=>fresh('uniform'),
  useProgram:value=>{valid(value);program=value;},bindBuffer:(_target,value)=>valid(value),bindTexture:(_target,value)=>valid(value),
  texImage2D:()=>{assert(!lost);calls.atlasUploads++;},drawArrays:()=>{assert(!lost);valid(program);calls.draws++;},
  uniform3f:(uniform,...values)=>{valid(uniform);calls.lastVector=values;},uniform3fv:(uniform,values)=>{valid(uniform);calls.lastColor=[...values];},
  uniform1fv:(uniform,values)=>{valid(uniform);calls.lastValues=[...values];},isContextLost:()=>lost,deleteProgram:()=>{calls.deletedPrograms++;},getExtension:()=>null,
 },{get(target,key){if(key in target)return target[key];return String(key).toUpperCase()===key?key:noop;}});
 const ctx=new Proxy({}, {get:()=>noop});
 function row(face=6,width=300){
  const classes=new Set(),element={isConnected:true,children:[],classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},getBoundingClientRect:()=>({x:0,y:0,width,height:160}),prepend(canvas){if(canvas.parentElement)canvas.remove();this.children.unshift(canvas);canvas.parentElement=this;}};
  const die={getBoundingClientRect:()=>({x:70,y:20,width:100,height:130}),querySelectorAll:()=>Array.from({length:6},(_,i)=>({dataset:{face:String(i?i:face)}}))};
  element.querySelectorAll=()=>[die];return element;
 }
 selected=row();
 globalThis.document={querySelector:()=>selected,fonts:{check:()=>true,ready:Promise.resolve()},createElement(){
  const listeners=new Map();
  const canvas={width:300,height:150,className:'',dataset:{},style:{},parentElement:null,setAttribute:noop,getContext:type=>type==='webgl'?gl:ctx,
   addEventListener(name,fn){const handlers=listeners.get(name)||[];handlers.push(fn);listeners.set(name,handlers);},
   dispatch(name){if(name==='webglcontextlost')lost=true;if(name==='webglcontextrestored'){lost=false;generation++;program=null;}for(const fn of listeners.get(name)||[])fn({preventDefault(){calls.prevented=true;}});},
   listenerCount:name=>(listeners.get(name)||[]).length,
   remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}};
  canvases.push(canvas);return canvas;
 }};
 globalThis.getComputedStyle=()=>({color:'rgb(220, 190, 120)'});globalThis.devicePixelRatio=1;
 globalThis.requestAnimationFrame=()=>{calls.rafs++;return 1;};
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;this.active=true;calls.observers++;}observe(){}disconnect(){if(this.active){calls.observers--;this.active=false;}}};
 return {calls,canvases,row,get selected(){return selected;},set selected(value){selected=value;},set failLink(value){failLink=value;},restore(){for(const key of keys){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}}};
}
let moduleId=0;
async function withSurface(run){
 const env=fakeWebGLDOM();
 try{const module=await import(new URL(`src/dice-renderer.js?lifecycle-test=${++moduleId}`,root));await run(env,module);await Promise.resolve();}
 finally{env.restore();}
}

test('idle GPU dice rebuild resources and redraw the same canvas immediately after context restoration',()=>withSurface(async(env,R)=>{
 const handle=R.mountDiceSurface(),canvas=env.canvases[0],row=env.selected;await Promise.resolve();
 assert(row.classList.contains('gpu-dice'));assert.equal(env.calls.draws,1);
 canvas.dispatch('webglcontextlost');assert(env.calls.prevented);assert(!row.classList.contains('gpu-dice'));
 const before=env.calls.draws;canvas.dispatch('webglcontextrestored');
 assert(row.classList.contains('gpu-dice'),'restoration must recover the current idle scene without an app render');
 assert.equal(row.children[0],canvas);assert.equal(env.calls.draws,before+1);assert.equal(env.calls.programs,2);assert.equal(env.calls.buffers,2);assert.equal(env.calls.textures,2);assert.equal(env.calls.atlasUploads,2);
 for(let i=0;i<3;i++){canvas.dispatch('webglcontextlost');canvas.dispatch('webglcontextrestored');}
 assert.equal(canvas.listenerCount('webglcontextlost'),1);assert.equal(canvas.listenerCount('webglcontextrestored'),1);assert.equal(env.calls.observers,1);assert.equal(env.calls.rafs,0);
 handle.stop();assert.equal(env.calls.observers,0);
}));

test('a scene mounted while context is lost owns restoration, and an old stop cannot detach it',()=>withSurface(async(env,R)=>{
 const first=R.mountDiceSurface(),oldRow=env.selected,canvas=env.canvases[0];await Promise.resolve();
 canvas.dispatch('webglcontextlost');first.stop();oldRow.isConnected=false;
 env.selected=env.row(2,460);const nextRow=env.selected,second=R.mountDiceSurface();
 assert(second,'lost context must still retain the new scene mount');first.stop();
 const before=env.calls.draws;canvas.dispatch('webglcontextrestored');
 assert(!oldRow.classList.contains('gpu-dice'));assert(nextRow.classList.contains('gpu-dice'));assert.equal(canvas.parentElement,nextRow);assert.equal(env.calls.draws,before+1);assert.equal(env.calls.lastValues[0],2);assert.equal(env.calls.observers,1);
 second.stop();
}));

test('restoration uses the latest visual pose without adding an animation loop',()=>withSurface(async(env,R)=>{
 const handle=R.mountDiceSurface(),canvas=env.canvases[0];await Promise.resolve();
 canvas.dispatch('webglcontextlost');handle.draw([{x:.3,y:-.4,z:.2,rx:60,ry:80,rz:10}]);
 const before=env.calls.draws;canvas.dispatch('webglcontextrestored');
 assert.equal(env.calls.draws,before+1);assert.equal(canvas.dataset.motionQuality,'motion');assert.equal(env.calls.rafs,0);handle.stop();
}));

test('failed GPU resource recovery keeps CSS dice visible and a later successful restore can recover',()=>withSurface(async(env,R)=>{
 const handle=R.mountDiceSurface(),canvas=env.canvases[0];await Promise.resolve();
 canvas.dispatch('webglcontextlost');env.failLink=true;const before=env.calls.draws;
 assert.doesNotThrow(()=>canvas.dispatch('webglcontextrestored'));assert(!env.selected.classList.contains('gpu-dice'));assert.equal(env.calls.draws,before);
 env.failLink=false;canvas.dispatch('webglcontextlost');canvas.dispatch('webglcontextrestored');
 assert(env.selected.classList.contains('gpu-dice'));assert.equal(env.calls.draws,before+1);handle.stop();
}));

test('stopped or disconnected scenes are never redrawn by later restoration callbacks',()=>withSurface(async(env,R)=>{
 const handle=R.mountDiceSurface(),canvas=env.canvases[0];await Promise.resolve();
 canvas.dispatch('webglcontextlost');handle.stop();env.selected.isConnected=false;
 const before=env.calls.draws;canvas.dispatch('webglcontextrestored');assert.equal(env.calls.draws,before);assert.equal(env.calls.observers,0);assert(!env.selected.classList.contains('gpu-dice'));
}));

function inventoryFixture(){
 const s=E.newGame(20261017);s.floor=140;s.player.level=80;
 while(s.player.items.length<10000){const i=s.player.items.length;s.player.items.push(E.makeItem(s,['weapon','armor','relic'][i%3],i%8));}
 const newest=s.player.items.toReversed();
 for(const slot of ['weapon','armor'])s.player.equipped[slot]=newest.find(item=>item.slot===slot).id;
 for(const [i,slot]of ['relic','relic2','relic3'].entries())s.player.equipped[slot]=newest.filter(item=>item.slot==='relic')[i].id;
 s.nextLuck=24;s.player.talents.critical=3;s.player.talents.high=2;s.player.hp=E.stats(s).maxHp;return s;
}
test('paged inventory comparisons match full inventory semantics and never cache an old build',()=>{
 const s=inventoryFixture(),ui={view:'inventory',inventorySort:'power',inventoryPage:0,busy:false};
 for(let pass=0;pass<2;pass++){
  if(pass){s.player.talents.critical=0;s.player.talents.high=5;s.nextLuck=0;s.player.equipped.weapon=s.player.items.find(item=>item.slot==='weapon').id;s.player.items.at(-1).enhance=17;}
  const before=JSON.stringify(s),html=V.center(s,ui),cards=html.match(/<article\b[\s\S]*?<\/article>/g)||[];assert.equal(cards.length,60);
  for(const card of cards){const id=card.match(/data-action="equip" data-id="([^"]+)"/)?.[1],item=s.player.items.find(item=>item.id===id);assert(item);assert(card.includes(V.comparison(s,item)),`comparison must match the full build for ${id}, pass ${pass}`);}
  assert.equal(JSON.stringify(s),before,'view rendering must preserve inventory, RNG, talents and progression');
 }
});
test('inventory guidance names the active ordering, including the default',()=>{
 const s=E.newGame(101);
 for(const [inventorySort,label]of [[undefined,'装备强度'],['power','装备强度'],['rarity','品质优先'],['level','等级优先']]){
  const html=V.center(s,{view:'inventory',inventorySort});assert(html.includes(`当前排序：${label}`),`truthful inventory ordering: ${label}`);
 }
});
