// CPU geometry preparation and exact upload-data audit. No browser, GPU timing
// or frames-per-second claim is made by this script.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return at<0?[value,true]:[value.slice(0,at),value.slice(at+1)];}));
const currentSource=path.resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url)));
assert(typeof args['--baseline-source']==='string','--baseline-source=/absolute/immutable/input is required');
const baselineSource=path.resolve(args['--baseline-source']);
const output=path.resolve(args['--output']||'/tmp/dice-indexed-round13.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=values=>new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
const sourcePaths={baseline:baselineSource,current:currentSource};
const identity=async()=>Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async([label,root])=>[label,{
  version:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,
  files:await Promise.all(['src/dice-renderer.js','src/dice-motion.js'].map(async file=>{const bytes=await fs.readFile(path.join(root,file));return{file,bytes:bytes.length,sha256:hash(bytes)};})),
}])));
const sourceBefore=await identity();
const baseline=await import(pathToFileURL(path.join(baselineSource,'src/dice-renderer.js')));
const current=await import(pathToFileURL(path.join(currentSource,'src/dice-renderer.js')));
assert.equal(typeof current.indexedRoundedCubeMesh,'function','Current renderer must have the indexed preparation path');
const expand=({vertices,indices})=>{const array=new Float32Array(indices.length*9);for(let i=0;i<indices.length;i++)array.set(vertices.subarray(indices[i]*9,indices[i]*9+9),i*9);return array;};
const equivalence=[];
for(const steps of [1,2,4,8,12,24])for(const radius of [.001,.075,.125,.25,.5]){
  const before=baseline.roundedCubeMesh(steps,radius),mesh=current.indexedRoundedCubeMesh(steps,radius),expanded=expand(mesh),legacy=current.roundedCubeMesh(steps,radius);
  assert.deepEqual(raw(expanded),raw(before));assert.deepEqual(raw(legacy),raw(before));
  equivalence.push({steps,radius,triangles:mesh.indices.length/3,baselineBytes:before.byteLength,expandedSha256:hash(raw(expanded)),baselineSha256:hash(raw(before)),vertexCount:mesh.vertices.length/9,indexCount:mesh.indices.length,vertexBytes:mesh.vertices.byteLength,indexBytes:mesh.indices.byteLength,allFloatBitsEqual:true});
}
const q=(values,p)=>values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*p)]??null;
const summary=values=>({samples:values.length,p50:q(values,.5),p95:q(values,.95),p99:q(values,.99),max:Math.max(...values),min:Math.min(...values)});
const report={kind:'EXACT_GEOMETRY_AND_NODE_PREPARATION_ONLY',started:new Date().toISOString(),runtime:{node:process.version,platform:process.platform,arch:process.arch},scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore,equivalence,
  protocol:{warmupPairs:8,formalPairs:60,meshesPerSample:1,order:'Alternating baseline/current, current/baseline; every measured sample retained',quantile:'floor((n-1)*p)',scope:'Same default mesh construction per context initialization/recovery. Baseline constructs expanded attributes; current constructs compact attributes and indices. Hashes/expansion are outside timing. Timings include their allocation/GC and are not per-frame render times.'},warmups:[],samples:[],limitations:[
    'Static upload bytes are exact data sizes, not measured GPU residency; buffers and driver bookkeeping add overhead.',
    'Indexed vertices permit reuse, but actual vertex-shader invocations depend on the graphics driver. Index/triangle counts and all rendered attributes remain unchanged.',
    'This CPU microbenchmark does not measure WebGL completion, Canvas, DOM layout, compositing, browser callback tails or physical 4K60. The 4K long-frame risk remains open pending native paired evidence.',
  ],references:['https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawElements','https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Creating_3D_objects_using_WebGL','https://registry.khronos.org/webgl/specs/latest/1.0/']};
let sink=0;
const measure=label=>{const start=performance.now();const mesh=label==='baseline'?baseline.roundedCubeMesh():current.indexedRoundedCubeMesh();const elapsedMs=performance.now()-start;sink+=label==='baseline'?mesh.length:mesh.vertices.length+mesh.indices.length;return elapsedMs;};
for(const [section,pairs] of [['warmups',8],['samples',60]])for(let pair=1;pair<=pairs;pair++){
  const order=pair%2?['baseline','current']:['current','baseline'];
  for(const [position,label] of order.entries())report[section].push({pair,order,position:position+1,label,elapsedMs:measure(label)});
}
assert(sink>0);
report.preparationMs=Object.fromEntries(['baseline','current'].map(label=>[label,summary(report.samples.filter(row=>row.label===label).map(row=>row.elapsedMs))]));
const defaults=equivalence.find(row=>row.steps===12&&row.radius===.075);
report.defaultGeometry={triangles:defaults.triangles,beforeVertices:5184,uniqueVertices:defaults.vertexCount,indexCount:defaults.indexCount,beforeBytes:defaults.baselineBytes,currentBytes:defaults.vertexBytes+defaults.indexBytes,bytesSaved:defaults.baselineBytes-defaults.vertexBytes-defaults.indexBytes,byteReductionPercent:(1-(defaults.vertexBytes+defaults.indexBytes)/defaults.baselineBytes)*100,sourceFloatSha256:defaults.baselineSha256};
report.sourceAfter=await identity();assert.deepEqual(report.sourceAfter,report.sourceBefore,'Source geometry modules must not change during audit');
report.finished=new Date().toISOString();report.status='PASS_WITH_SCOPE_LIMITS';
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,status:report.status,equivalenceCases:equivalence.length,geometry:report.defaultGeometry,preparationMs:report.preparationMs},null,2));
