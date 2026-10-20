// Compare complete recorded Canvas programs. Only proven no-op writes to the
// three particle paint properties are removed; draw order, alpha, every path,
// coordinate, image, transform and all other state writes remain byte-exact.
// This is deterministic submission evidence, not a native timing benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {effectCases,recordEffects} from './audit-effects-layout-round14.mjs';

const properties=new Set(['set:fillStyle','set:strokeStyle','set:lineWidth']);
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function removeRedundantPaintWrites(commands){
 const states=new Map(),stacks=new Map(),result=[];
 for(const command of commands){
  const [target,method,value]=command;
  if(!states.has(target)){states.set(target,new Map());stacks.set(target,[]);}
  let state=states.get(target);
  if(method==='save')stacks.get(target).push(new Map(state));
  else if(method==='restore'){const saved=stacks.get(target).pop();if(saved){state=saved;states.set(target,state);}}
  if(properties.has(method)){
   if(state.has(method)&&state.get(method)===value)continue;
   state.set(method,value);
  }
  result.push(command);
 }
 return result;
}
export function particlePaintWrites(commands){return commands.filter(c=>c[0]==='canvas-0'&&properties.has(c[1])).length;}
export function primitivePaintSnapshots(commands){
 const states=new Map(),stacks=new Map(),result=[],primitives=new Set(['drawImage','stroke','fill','fillRect','strokeRect','clearRect']);
 for(const command of commands){
  const [target,method,value]=command;if(!target.startsWith('canvas-'))continue;
  if(!states.has(target)){states.set(target,{globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1});stacks.set(target,[]);}
  let state=states.get(target);
  if(method.startsWith('set:'))state[method.slice(4)]=value;
  else if(method==='save')stacks.get(target).push({...state});
  else if(method==='restore'){state=stacks.get(target).pop()||state;states.set(target,state);}
  else if(primitives.has(method))result.push({command,state:{...state}});
 }
 return result;
}
export function effectReceipt(result){
 return {commands:sha(removeRedundantPaintWrites(result.commands)),primitiveStates:sha(primitivePaintSnapshots(result.commands)),dimensions:result.beforeFrames.dimensions,materials:result.beforeFrames.materialDimensions,final:result.finalDataset,surface:result.surface,remaining:result.remaining,materialDimensionsAfterStop:result.materialDimensionsAfterStop};
}
export async function compareParticleStyles(baseline,current){
 const report={kind:'CANVAS_EQUIVALENT_EFFECTIVE_STATE_NOT_FPS',baseline:path.resolve(baseline),current:path.resolve(current),sourceHashes:{baseline:sha(await fs.readFile(path.join(baseline,'src/effects.js'),'utf8')),current:sha(await fs.readFile(path.join(current,'src/effects.js'),'utf8'))},normalization:'Only repeat fillStyle/strokeStyle/lineWidth assignments with an already equal value, respecting save/restore. No draw calls, other state, colors, coordinates or paths omitted.',cases:[],status:'RUNNING'};
 for(const [width,height]of [[390,844],[1366,768],[1920,1080],[3840,2160]])for(const definition of effectCases){
  const before=await recordEffects(baseline,definition,{width,height}),after=await recordEffects(current,definition,{width,height});
  assert.deepEqual(removeRedundantPaintWrites(after.commands),removeRedundantPaintWrites(before.commands),`${definition.name} ${width}: effective paint program must match the input`);
  assert.deepEqual(primitivePaintSnapshots(after.commands),primitivePaintSnapshots(before.commands),`${definition.name} ${width}: every primitive receives the complete original paint state`);
  assert.deepEqual(effectReceipt(after),effectReceipt(before));assert.deepEqual(after.geometryReads,before.geometryReads);assert.deepEqual(after.moves,before.moves);
  const baselineWrites=particlePaintWrites(before.commands),currentWrites=particlePaintWrites(after.commands);assert(currentWrites<=baselineWrites);
  report.cases.push({name:definition.name,width,height,baselineCommands:before.commandCount,currentCommands:after.commandCount,baselinePaintWrites:baselineWrites,currentPaintWrites:currentWrites,removedWrites:baselineWrites-currentWrites,exactEffectiveProgram:true,exactGeometry:true,exactLifecycle:true,referenceReceipt:effectReceipt(before)});
 }
 for(const cancelAt of [0,150]){
  const definition=effectCases.find(c=>c.name==='loot-7'),before=await recordEffects(baseline,definition,{cancelAt}),after=await recordEffects(current,definition,{cancelAt});
  assert.deepEqual(removeRedundantPaintWrites(after.commands),removeRedundantPaintWrites(before.commands));assert.deepEqual(effectReceipt(after),effectReceipt(before));
  report.cases.push({name:'loot-7-cancel',cancelAt,baselinePaintWrites:particlePaintWrites(before.commands),currentPaintWrites:particlePaintWrites(after.commands),exactEffectiveProgram:true,exactLifecycle:true});
 }
 report.status='PASS';report.summary={cases:report.cases.length,removedPaintWrites:report.cases.reduce((n,c)=>n+c.baselinePaintWrites-c.currentPaintWrites,0)};return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');assert(at>0,'Use --name=value');return[arg.slice(0,at),arg.slice(at+1)];}));assert(args['--baseline-source'],'The original baseline is required');
 const result=await compareParticleStyles(path.resolve(args['--baseline-source']),path.resolve(args['--source']||'.')),output=path.resolve(args['--output']||'/tmp/particle-style-round25.json');
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,status:result.status,summary:result.summary}));
}
