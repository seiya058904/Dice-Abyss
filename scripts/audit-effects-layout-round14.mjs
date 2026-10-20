// Deterministic command-equivalence audit. This is not a browser/FPS benchmark.
// --baseline-source must point to the actual read-only input, never a rewritten
// copy of the current implementation. All original Canvas arguments are checked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
let importSerial=0;
export const effectCases=[
 {name:'chest-charge',phase:'chest',event:'open'},
 ...Array.from({length:8},(_,rarity)=>({name:`loot-${rarity}`,phase:'loot',event:'open',rarity})),
 {name:'combat-normal',phase:'combat',event:'roll',best:1,critical:false},
 {name:'combat-resonance',phase:'combat',event:'roll',best:3,critical:true,follow:true},
 {name:'combat-boss-finish',phase:'combat',event:'roll',best:3,critical:true,follow:true,killed:true,phaseChanged:true,absorbed:120},
 {name:'low',phase:'loot',event:'open',rarity:7,effects:'low'},
 {name:'reduced',phase:'loot',event:'open',rarity:7,reduced:true},
 {name:'rolling',phase:'combat',event:'roll',rolling:true},
 {name:'idle',phase:'loot',event:'open',rarity:7,idle:true},
];

export async function recordEffects(sourceRoot,definition,{width=1920,height=1080,firstChild=true,cancelAt=null}={}){
 const globals=['document','Path2D','requestAnimationFrame','cancelAnimationFrame','matchMedia','innerWidth','innerHeight','devicePixelRatio','performance','setTimeout','clearTimeout','__round14Effects'];
 const original=Object.fromEntries(globals.map(key=>[key,globalThis[key]]));
 const commands=[],geometryReads=[],moves=[],canvases=[],paths=[],frames=new Map(),timers=new Map(),listeners=new Set(),surface=[];
 let serial=0,clock=100;
 const scale=width/1920,rect=(left,top,w,h)=>({left,top,width:w,height:h,right:left+w,bottom:top+h,x:left,y:top});
 const panelRect=rect(310*scale,90*scale,Math.max(330,1300*scale),Math.max(720,900*scale));
 const stageRect=rect(panelRect.left+20,panelRect.top+170*scale,panelRect.width-40,Math.max(300,560*scale));
 const rowRect=rect(stageRect.left+15,stageRect.top+100*scale,stageRect.width-30,Math.max(50,165*scale));
 const damageRect=rect(stageRect.left+15,stageRect.top+stageRect.height-75*scale,stageRect.width-30,70*scale);
 const chestRect=rect(panelRect.left+panelRect.width*.3,panelRect.top+190*scale,panelRect.width*.4,Math.max(110,220*scale));
 const cardRect=rect(panelRect.left+30,panelRect.top+Math.max(430,500*scale),panelRect.width*.64,Math.max(160,250*scale));
 const normal=value=>value?.__auditId?value.__auditId:Array.isArray(value)?value.map(normal):value;
 const makeContext=canvas=>{
  const stack=[],state={globalAlpha:1,globalCompositeOperation:'source-over'};
  return new Proxy(state,{
   get(target,key){
    if(key==='canvas')return canvas;
    if(key in target)return target[key];
    if(key==='createLinearGradient'||key==='createRadialGradient')return(...args)=>{
     const gradient={__auditId:`gradient-${++serial}`,addColorStop(...stops){commands.push([gradient.__auditId,'addColorStop',...stops]);}};
     commands.push([canvas.__auditId,key,...args,gradient.__auditId]);return gradient;
    };
    return(...args)=>{
     commands.push([canvas.__auditId,key,...args.map(normal)]);
     if(key==='save')stack.push({...target});
     if(key==='restore'){const restored=stack.pop();for(const property of Object.keys(target))delete target[property];Object.assign(target,restored);}
    };
   },
   set(target,key,value){commands.push([canvas.__auditId,`set:${String(key)}`,normal(value)]);target[key]=value;return true;},
  });
 };
 const makeCanvas=()=>{
  const canvas={__auditId:`canvas-${canvases.length}`,width:300,height:150,style:{},dataset:{}};
  canvas.context=makeContext(canvas);canvas.getContext=()=>canvas.context;canvases.push(canvas);return canvas;
 };
 const canvas=makeCanvas();
 const measured=(name,bounds)=>({getBoundingClientRect(){geometryReads.push(name);return {...bounds};}});
 const dice=Array.from({length:6},(_,i)=>({...measured(`die-${i}`,rect(rowRect.left+(i+.2)*rowRect.width/6,rowRect.top,Math.max(32,rowRect.width/8),Math.max(32,rowRect.width/8))),classList:{contains:key=>definition.best>=2?key==='resonant':false}}));
 const stage={...measured('stage',stageRect),style:{},clientLeft:1,clientTop:1,append(node){moves.push('stage.append');node.parentElement=stage;},querySelector:selector=>selector==='.cube-row'?measured('row',rowRect):selector==='.damage-result'?measured('damage',damageRect):null,querySelectorAll:()=>dice};
 const panel={...measured('panel',panelRect),clientLeft:1,clientTop:1,firstChild:firstChild?canvas:{},prepend(node){moves.push('panel.prepend');node.parentElement=panel;this.firstChild=node;}};
 canvas.parentElement=panel;
 canvas.getBoundingClientRect=()=>{
  geometryReads.push('canvas');const css=Object.fromEntries((canvas.style.cssText||'').split(';').map(declaration=>declaration.split(':').map(x=>x.trim())));
  const frame=canvas.parentElement===stage?stageRect:panelRect;
  return rect(frame.left+1+(parseFloat(css.left)||0),frame.top+1+(parseFloat(css.top)||0),parseFloat(css.width)||300,parseFloat(css.height)||150);
 };
 class AuditPath{
  constructor(){this.__auditId=`path-${paths.length}`;paths.push(this);commands.push([this.__auditId,'new']);}
 }
 for(const method of ['moveTo','lineTo','closePath','quadraticCurveTo','bezierCurveTo'])AuditPath.prototype[method]=function(...args){commands.push([this.__auditId,method,...args]);};
 globalThis.document={visibilityState:'visible',querySelector:selector=>selector==='.scene-fx'?canvas:selector==='.combat-stage'?stage:selector==='.chest-art'?measured('chest',chestRect):selector==='.chest-art svg'?measured('chest-svg',rect(chestRect.left,chestRect.top,chestRect.width,chestRect.height)):selector==='.loot-reveal .item-card'?measured('card',cardRect):null,createElement:()=>makeCanvas(),addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)};
 globalThis.performance={now:()=>clock};
 globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,due:clock+ms});return serial;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.matchMedia=()=>({matches:!!definition.reduced});globalThis.innerWidth=width;globalThis.innerHeight=height;globalThis.devicePixelRatio=1;globalThis.Path2D=AuditPath;
 globalThis.__round14Effects={mountDiceSurface:()=>{surface.push('mount');return{draw:()=>surface.push('draw'),stop:()=>surface.push('stop')};},animateDice:()=>{surface.push('animate');return()=>surface.push('stop-dice');}};
 let presentation;
 try{
  const effectSource=await fs.readFile(path.join(sourceRoot,'src/effects.js'),'utf8');
  const executable=effectSource
   .replace("import { animateDice, THROW_DURATION } from './dice-motion.js';","const {animateDice}=globalThis.__round14Effects;const THROW_DURATION=1280;")
   .replace("import { mountDiceSurface } from './dice-renderer.js';","const {mountDiceSurface}=globalThis.__round14Effects;")
   .replace("'./visual-timeline.js'",JSON.stringify(pathToFileURL(path.join(sourceRoot,'src/visual-timeline.js')).href));
  const module=await import(`data:text/javascript;base64,${Buffer.from(executable+`\n// audit-isolation-${++importSerial}`).toString('base64')}`);
  const state={revision:415,rng:99817,phase:definition.phase,enemy:{type:definition.killed?'boss':'combat',shield:0},lastRoll:{best:definition.best??1,critical:definition.critical??false,follow:definition.follow??false,killed:definition.killed??false,phaseChanged:definition.phaseChanged??false,absorbed:definition.absorbed??0},loot:{item:{rarity:definition.rarity??0}}};
  const before=structuredClone(state);
  presentation=module.mountEffects(state,{view:'game',busy:!definition.idle,event:definition.event,rolling:!!definition.rolling},{effects:definition.effects||'full'},()=>{});
  const beforeFrames={geometryReads:[...geometryReads],moves:[...moves],dimensions:{width:canvas.width,height:canvas.height,style:canvas.style.cssText??null,dataset:{...canvas.dataset}},materialDimensions:canvases.slice(1).map(c=>({id:c.__auditId,width:c.width,height:c.height}))};
  for(const elapsed of [0,16,34,67,150,300,650,900,1400,2000]){
   if(cancelAt!==null&&elapsed>=cancelAt){presentation.stop();break;}
   clock=100+elapsed;for(const [id,fn]of [...frames]){frames.delete(id);fn(clock);}
  }
  presentation.stop();presentation.stop();assert.deepEqual(state,before,'Effects cannot mutate saved state or RNG');
  const result={definition:definition.name,viewport:{width,height},firstChild,cancelAt,commands,commandCount:commands.length,commandSha256:sha(commands),geometryReads,moves,beforeFrames,finalDataset:{...canvas.dataset},surface,remaining:{frames:frames.size,timers:timers.size,listeners:listeners.size},materialDimensionsAfterStop:canvases.slice(1).map(c=>({id:c.__auditId,width:c.width,height:c.height}))};
  assert.deepEqual(result.remaining,{frames:0,timers:0,listeners:0},'Stop must release the scene lifetime');
  return result;
 }finally{presentation?.stop();for(const key of globals){if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}}
}

export async function compareEffectsSources(baselineRoot,currentRoot){
 const report={kind:'DETERMINISTIC_CANVAS_COMMAND_EQUIVALENCE_NOT_BROWSER_TIMING',baseline:path.resolve(baselineRoot),current:path.resolve(currentRoot),sourceHashes:{baseline:sha(await fs.readFile(path.join(baselineRoot,'src/effects.js'),'utf8')),current:sha(await fs.readFile(path.join(currentRoot,'src/effects.js'),'utf8'))},cases:[],status:'RUNNING'};
 for(const [width,height]of [[390,844],[1920,1080],[3840,2160]])for(const definition of effectCases){
  const b=await recordEffects(baselineRoot,definition,{width,height}),a=await recordEffects(currentRoot,definition,{width,height});
  assert.deepEqual(a.commands,b.commands,`${definition.name} ${width}: every Canvas argument must match the actual input`);
  assert.deepEqual(a.beforeFrames.dimensions,b.beforeFrames.dimensions);assert.deepEqual(a.beforeFrames.materialDimensions,b.beforeFrames.materialDimensions);assert.deepEqual(a.finalDataset,b.finalDataset);assert.deepEqual(a.surface,b.surface);assert.deepEqual(a.materialDimensionsAfterStop,b.materialDimensionsAfterStop);
  const inactive=definition.idle||definition.effects==='low'||definition.reduced||definition.rolling;
  assert.equal(b.geometryReads.length-a.geometryReads.length,inactive?0:definition.phase==='combat'?2:1);
  assert.equal(b.moves.length-a.moves.length,!inactive&&definition.phase!=='combat'?1:0);
  report.cases.push({name:definition.name,viewport:{width,height},commands:a.commandCount,commandSha256:a.commandSha256,exactCanvasCommands:true,exactCanvasDimensions:true,exactMaterialDimensions:true,exactLifecycle:true,baselineGeometryReads:b.geometryReads,currentGeometryReads:a.geometryReads,baselineMoves:b.moves,currentMoves:a.moves,canvas:a.beforeFrames.dimensions,materialPixels:Number(a.beforeFrames.dimensions.dataset.fxMaterialPixels)||0});
 }
 for(const firstChild of [true,false])for(const cancelAt of [0,150]){
  const definition=effectCases.find(c=>c.name==='loot-7'),b=await recordEffects(baselineRoot,definition,{firstChild,cancelAt}),a=await recordEffects(currentRoot,definition,{firstChild,cancelAt});
  assert.deepEqual(a.commands,b.commands);assert.deepEqual(a.beforeFrames.dimensions,b.beforeFrames.dimensions);assert.deepEqual(a.materialDimensionsAfterStop,b.materialDimensionsAfterStop);assert.deepEqual(a.finalDataset,b.finalDataset);
  assert.equal(a.moves.length,firstChild?0:1);report.cases.push({name:'loot-7-cancel',firstChild,cancelAt,commands:a.commandCount,commandSha256:a.commandSha256,exactCanvasCommands:true,exactLifecycle:true,baselineGeometryReads:b.geometryReads,currentGeometryReads:a.geometryReads,baselineMoves:b.moves,currentMoves:a.moves});
 }
 report.status='PASS';report.summary={cases:report.cases.length,exactCanvasCommands:report.cases.filter(c=>c.exactCanvasCommands).length,readSavings:report.cases.reduce((n,c)=>n+c.baselineGeometryReads.length-c.currentGeometryReads.length,0),moveSavings:report.cases.reduce((n,c)=>n+c.baselineMoves.length-c.currentMoves.length,0)};
 return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const options=Object.fromEntries(process.argv.slice(2).map(v=>{const p=v.indexOf('=');return[v.slice(0,p),v.slice(p+1)];}));
 assert(options['--baseline-source'],'An actual read-only --baseline-source is required');
 const report=await compareEffectsSources(path.resolve(options['--baseline-source']),path.resolve(options['--source']||'.'));
 const file=path.resolve(options['--output']||'/tmp/dice-effects-layout-round14.json');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,status:report.status,summary:report.summary}));
}
