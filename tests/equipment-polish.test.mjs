import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeItem} from '../src/engine.js';
import {safeFusionMaterialIds,fusionPreview,applyFusion,MAX_ITEM_LEVEL,levelXpNeeded} from '../src/equipment.js';

function inventory(seed=71){const s=newGame(seed);s.player.level=70;s.player.gold=1e10;s.floor=140;s.phase='fusion';s.loot=null;return s;}
const add=(s,slot,rarity)=>{const item=makeItem(s,slot,rarity);s.player.items.push(item);return item;};
const originalSelection=(s,targets)=>s.player.items.filter(item=>fusionPreview(s,targets,[item.id])).map(item=>item.id);

test('linear safe-material selection matches full previews for each slot, rarity, lock and pending loot',()=>{
 for(const slot of ['weapon','armor','relic'])for(const rarity of [0,1,2,3,4,7]){
  const s=inventory(71+rarity),target=add(s,slot,rarity);
  for(let i=0;i<64;i++){const item=add(s,['weapon','armor','relic'][i%3],i%8);item.locked=i%11===0;item.enhance=i%21;}
  const pending=add(s,slot,0);s.loot={item:pending};
  const before=structuredClone(s),actual=safeFusionMaterialIds(s,[target.id]);
  assert.deepEqual(actual,originalSelection(s,[target.id]),slot+' / '+rarity);assert.deepEqual(s,before);
  for(const id of actual){const item=s.player.items.find(item=>item.id===id);assert(!item.locked);assert(item.rarity<3);assert(item.rarity<=target.rarity);assert.notEqual(id,pending.id);}
 }
});

test('safe-material selection preserves three-relic XP sharing and highest-roll cap protection',()=>{
 const s=inventory(),targets=[add(s,'relic',2),add(s,'relic',3),add(s,'relic',4)],material=add(s,'relic',1);
 assert.deepEqual(safeFusionMaterialIds(s,targets.map(item=>item.id)),originalSelection(s,targets.map(item=>item.id)));
 targets[0].level=MAX_ITEM_LEVEL-1;targets[0].levelXp=levelXpNeeded(targets[0].level)-1;
 assert.deepEqual(safeFusionMaterialIds(s,targets.map(item=>item.id)),[]);assert.equal(fusionPreview(s,targets.map(item=>item.id),[material.id]),null);
 for(const ids of [[],['missing'],[targets[0].id,targets[0].id],[s.player.equipped.weapon,s.player.equipped.armor]])assert.deepEqual(safeFusionMaterialIds(s,ids),[]);
});

test('selecting 10,000 items excludes equipped, locked, treasured and pending loot without drawing RNG',()=>{
 const s=inventory(),target=add(s,'weapon',2),base=add(s,'weapon',0);base.locked=true;
 while(s.player.items.length<10000)s.player.items.push({...base,id:`i${s.nextId++}`,locked:false});
 const pending=s.player.items.at(-1);s.loot={item:pending};const rng=s.rng,nextId=s.nextId;
 const ids=safeFusionMaterialIds(s,[target.id]);assert.equal(ids.length,9994);
 assert(!ids.includes(target.id));assert(!ids.includes(base.id));assert(!ids.includes(pending.id));
 for(const equipped of Object.values(s.player.equipped))assert(!ids.includes(equipped));
 assert.equal(s.rng,rng);assert.equal(s.nextId,nextId);
 const preview=fusionPreview(s,[target.id],ids);assert(preview);assert(preview.cost<=s.player.gold);
 const targetEnhance=target.enhance;assert(applyFusion(s,preview,6));
 assert.equal(s.player.items.length,6);assert.equal(s.player.items.find(item=>item.id===target.id).enhance,targetEnhance);
 assert.equal(s.lastForge.consumed.length,9994);assert.equal(s.rng,rng);
 const after=structuredClone(s);assert.equal(applyFusion(s,preview,6),null);assert.deepEqual(s,after);
});

test('protected fusion requires the explicit boolean confirmation and rejected requests preserve assets',()=>{
 const s=inventory(),target=add(s,'weapon',2),material=add(s,'weapon',3);material.locked=true;
 const before=structuredClone(s);
 for(const confirmation of [false,undefined,null,'true','false',1,{},[]])assert.equal(fusionPreview(s,target.id,material.id,confirmation),null);
 assert.deepEqual(s,before);const preview=fusionPreview(s,target.id,material.id,true);assert(preview);
 s.player.equipped.weapon=material.id;const protectedState=structuredClone(s);
 assert.equal(applyFusion(s,preview,6),null);assert.deepEqual(s,protectedState);
});
