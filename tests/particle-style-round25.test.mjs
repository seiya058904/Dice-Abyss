import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {effectCases,recordEffects} from '../scripts/audit-effects-layout-round14.mjs';
import {effectReceipt,particlePaintWrites,primitivePaintSnapshots,removeRedundantPaintWrites} from '../scripts/audit-particle-style-round25.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),reference=JSON.parse(await fs.readFile(new URL('./fixtures/particle-style-round25-reference.json',import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const baselineBytes=gunzipSync(await fs.readFile(new URL('../docs/iteration/evidence/round25/baseline/runtime/original/src/effects.js.gz',import.meta.url)));
assert.equal(sha(baselineBytes),reference.effectsSha256,'Compare against the original input, never a rewritten candidate');
assert.equal(sha(await fs.readFile(new URL('./fixtures/visual-timeline-v526.mjs',import.meta.url))),'0f1eee275b206951bec0b9317561e6669c8ba2e24f7829c0c6bd6c3e2b3a9f10','The immutable reference timeline must still match the input runtime');
const baselineSource=baselineBytes.toString('utf8');

for(const width of [390,1366,1920,3840])test(`particle palettes preserve the input paint program and complete primitive state at ${width}px`,async()=>{
 for(const expected of reference.cases.filter(row=>row.width===width)){
  const definition=effectCases.find(row=>row.name===expected.name);assert(definition);
  // Node 22 and 24 differ in the final bits of some numeric Canvas arguments.
  // Preserve the historical hashes, but compare both complete programs within
  // this runtime, with no rounding, tolerance or discarded paint arguments.
  const baseline=await recordEffects(root,definition,{width:expected.width,height:expected.height,effectSource:baselineSource,timelinePath:fileURLToPath(new URL('./fixtures/visual-timeline-v526.mjs',import.meta.url))});
  const result=await recordEffects(root,definition,{width:expected.width,height:expected.height});
  assert.deepEqual(removeRedundantPaintWrites(result.commands),removeRedundantPaintWrites(baseline.commands),`${expected.name}: every effective Canvas argument matches the immutable input`);
  assert.deepEqual(primitivePaintSnapshots(result.commands),primitivePaintSnapshots(baseline.commands),`${expected.name}: every primitive retains its complete paint state`);
  assert.deepEqual(effectReceipt(result),effectReceipt(baseline),`${expected.name}: immutable-input geometry and lifecycle`);
  assert.equal(particlePaintWrites(baseline.commands),expected.baselinePaintWrites,'Retain the recorded input workload');
  const writes=particlePaintWrites(result.commands);assert(writes<=expected.baselinePaintWrites);
  if(!definition.idle&&!definition.rolling&&!definition.reduced&&definition.effects!=='low')assert(writes<expected.baselinePaintWrites,`${expected.name}: remove real redundant paint submissions`);
 }
});

test('paint-write oracle respects saved state and retains a real color change',()=>{
 const commands=[['canvas-0','set:fillStyle','red'],['canvas-0','save'],['canvas-0','set:fillStyle','blue'],['canvas-0','set:fillStyle','blue'],['canvas-0','fillRect',0,0,1,1],['canvas-0','restore'],['canvas-0','set:fillStyle','blue'],['canvas-0','fillRect',1,1,1,1],['canvas-0','set:fillStyle','blue']];
 const expected=commands.filter((_,index)=>index!==3&&index!==8);
 assert.deepEqual(removeRedundantPaintWrites(commands),expected);
 assert.deepEqual(primitivePaintSnapshots(commands),primitivePaintSnapshots(expected));
 assert.equal(removeRedundantPaintWrites(commands).filter(row=>row[1]==='set:fillStyle'&&row[2]==='blue').length,2,'restore requires a new blue assignment');
 const emptyRestore=[['canvas-0','set:fillStyle','red'],['canvas-0','restore'],['canvas-0','restore'],['canvas-0','set:fillStyle','red'],['canvas-0','fillRect',0,0,1,1]];
 const emptyExpected=emptyRestore.filter((_,index)=>index!==3);
 assert.deepEqual(removeRedundantPaintWrites(emptyRestore),emptyExpected,'Canvas restore with an empty stack leaves the current paint state intact');
 assert.deepEqual(primitivePaintSnapshots(emptyRestore),primitivePaintSnapshots(emptyExpected));
 assert.equal(primitivePaintSnapshots(emptyRestore)[0].state.fillStyle,'red');
});

test('primitive oracle detects alpha, palette, stroke width and draw order differences',()=>{
 const commands=[['canvas-0','set:fillStyle','red'],['canvas-0','set:strokeStyle','blue'],['canvas-0','set:lineWidth',.7],['canvas-0','set:globalAlpha',.5],['canvas-0','fillRect',1,2,3,4],['canvas-0','strokeRect',5,6,7,8]],original=primitivePaintSnapshots(commands);
 for(const [index,value]of [[0,'green'],[1,'white'],[2,1.4],[3,1]]){
  const changed=structuredClone(commands);changed[index][2]=value;assert.notDeepEqual(primitivePaintSnapshots(changed),original);
 }
 const reordered=structuredClone(commands);[reordered[4],reordered[5]]=[reordered[5],reordered[4]];assert.notDeepEqual(primitivePaintSnapshots(reordered),original);
});
