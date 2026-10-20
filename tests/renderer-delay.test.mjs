import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// The untouched input can reproduce the first-frame expiry independently of
// browser load: QA_RENDER_ROOT=/absolute/input node --test this-file.mjs.
const root=process.env.QA_RENDER_ROOT?pathToFileURL(process.env.QA_RENDER_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const M=await import(new URL('src/dice-motion.js',root));
const visualModule=new URL('src/visual-timeline.js',root).href;

function fakeScene(){
 const keys=['document','performance','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','matchMedia','innerWidth','innerHeight','devicePixelRatio','Path2D','__rendererDelay'];
 const saved=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),frames=new Map(),timers=new Map(),events=new Map(),draws={images:0,strokes:0,clears:0,surfaceRest:0},styles={flight:{},cube:{},shadow:{}};
 let sequence=0,now=0;
 const ctx=new Proxy({drawImage(){draws.images++;},stroke(){draws.strokes++;},clearRect(){draws.clears++;},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get(target,key){return key in target?target[key]:()=>{};},set(target,key,value){target[key]=value;return true;}});
 const bounds={x:0,y:0,left:0,top:0,right:900,bottom:400,width:900,height:400},canvas={style:{},dataset:{},getBoundingClientRect:()=>bounds,getContext:()=>ctx},die={classList:{contains:className=>className==='resonant'},getBoundingClientRect:()=>({x:200,left:200,top:100,width:100,height:140}),querySelector:selector=>({style:selector==='.die-flight'?styles.flight:selector==='.die-cube'?styles.cube:styles.shadow})};
 const stage={style:{},append(){},getBoundingClientRect:()=>bounds,querySelector:()=>null,querySelectorAll:()=>[die]};
 die.parentElement={getBoundingClientRect:()=>bounds,classList:{contains:()=>false}};canvas.parentElement={getBoundingClientRect:()=>bounds,prepend(){}};
 globalThis.document={visibilityState:'visible',querySelector:selector=>selector==='.scene-fx'?canvas:selector==='.combat-stage'?stage:null,querySelectorAll:()=>[die],createElement:()=>({width:300,height:150,getContext:()=>ctx}),addEventListener(type,fn){events.set(type,fn);},removeEventListener(type,fn){if(events.get(type)===fn)events.delete(type);}};
 globalThis.performance={now:()=>now};globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.setTimeout=(fn,ms)=>{timers.set(++sequence,{fn,due:now+ms});return sequence;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.matchMedia=()=>({matches:false});globalThis.innerWidth=1920;globalThis.innerHeight=1080;globalThis.devicePixelRatio=1;
 globalThis.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 globalThis.__rendererDelay={animateDice:M.animateDice,mountDiceSurface:()=>({draw:poses=>{if(!poses)draws.surfaceRest++;},stop(){}})};
 return {frames,timers,events,draws,styles,canvas,
  frame(time){now=time;const entry=frames.entries().next().value;if(!entry)return false;frames.delete(entry[0]);entry[1](time);return true;},
  advance(time){now=time;for(const [id,timer]of [...timers])if(timer.due<=now){timers.delete(id);timer.fn();}},
  hide(){document.visibilityState='hidden';events.get('visibilitychange')?.();},
  restore(){for(const key of keys){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}}
 };
}

test('a late first dice frame begins the throw rather than silently landing',()=>{
 const env=fakeScene(),samples=[];let stop;
 try{
  stop=M.animateDice(17,()=>{},poses=>samples.push(poses));
  assert(env.frame(3000));
  assert.notDeepEqual(samples[0],[M.restPose(0)],'The 3000ms scheduling delay must not consume the complete throw');
  assert(env.frames.size>0,'A visible throw must continue after its first delayed callback');
  assert(env.frame(3016));assert.notDeepEqual(samples[1],samples[0]);
 }finally{stop?.();env.restore();}
});

test('combat material survives a delayed first frame and is drawn on the next visible sample',async()=>{
 const env=fakeScene();let effect;
 try{
  const source=(await fs.readFile(new URL('src/effects.js',root),'utf8'))
   .replace("import { animateDice, THROW_DURATION } from './dice-motion.js';","const {animateDice}=globalThis.__rendererDelay;const THROW_DURATION=1280;")
   .replace("import { mountDiceSurface } from './dice-renderer.js';","const {mountDiceSurface}=globalThis.__rendererDelay;")
   .replace("'./visual-timeline.js'",JSON.stringify(visualModule));
  const F=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  effect=F.mountEffects({revision:4,phase:'combat',enemy:{shield:0,type:'combat'},lastRoll:{best:3,critical:true,follow:false,absorbed:0}},{busy:true,view:'game',event:'roll'},{effects:'full'},()=>{});
  assert(env.frame(3000));
  assert(env.frame(3016),'The first delayed frame must not release all particles and material buffers');
  assert(env.draws.images>0,'Cached flame/particle material must actually be submitted');
 }finally{effect?.stop();env.restore();}
});
