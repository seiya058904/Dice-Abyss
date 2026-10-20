import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {effectCases,recordEffects} from '../scripts/audit-effects-layout-round14.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
test('effect setup reads its owning frame once and preserves all eight quality materials',async()=>{
 for(const definition of effectCases.slice(0,12)){
  const result=await recordEffects(root,definition,{width:3840,height:2160});
  assert.equal(result.geometryReads.filter(name=>name==='panel').length,definition.phase==='combat'?0:1);
  assert.equal(result.geometryReads.filter(name=>name==='canvas').length,1,'Retain the actual positioned canvas measurement');
  assert.equal(result.moves.filter(name=>name==='panel.prepend').length,0,'The production reward canvas is already first');
  const before=result.beforeFrames,fx=before.dimensions.dataset;
  assert(Number(fx.fxPixels)>0&&Number(fx.fxPixels)<=660000,'Retain the original 4K backing-store budget');
  assert.equal(result.geometryReads.length,before.geometryReads.length,'No per-frame geometry reads');
  if(definition.phase==='loot'){
   assert.equal(Number(fx.fxParticles),[30,58,86,132,132,132,132,132][definition.rarity]);
   assert.equal(Number(fx.fxRewardColumns),[3,5,7,9,9,9,9,9][definition.rarity]);
   assert.equal(Number(fx.fxRewardRims),definition.rarity>=3?4:0);
   assert.equal(fx.fxRewardMotif,['motes','sparks','facets','rays','seal','spiral','origin-star','eternal-orbits'][definition.rarity]);
  }
 }
});

test('reward canvases outside the first position are still moved and cancellation frees every scene buffer',async()=>{
 const definition=effectCases.find(c=>c.name==='loot-7');
 for(const firstChild of [true,false])for(const cancelAt of [0,150]){
  const r=await recordEffects(root,definition,{firstChild,cancelAt});
  assert.deepEqual(r.moves,firstChild?[]:['panel.prepend']);
  assert.equal(r.finalDataset.fxLifecycle,'cancelled');
  const materialIds=r.beforeFrames.materialDimensions.filter(c=>c.width>96||c.height>256).map(c=>c.id);
  assert(materialIds.length>0);
  assert(r.materialDimensionsAfterStop.filter(c=>materialIds.includes(c.id)).every(c=>c.width===1&&c.height===1));
 }
});

test('inactive, low, reduced and rolling branches never add effect layout measurements',async()=>{
 for(const definition of effectCases.slice(12)){
  const r=await recordEffects(root,definition);
  assert.deepEqual(r.geometryReads,[]);assert.deepEqual(r.moves,[]);assert.equal(r.commandCount,0);
  assert.deepEqual(r.remaining,{frames:0,timers:0,listeners:0});
 }
});
