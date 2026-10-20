import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceEquipment,fusionCostSummary,fusionMaterialXp,fusionPreview,levelXpNeeded,makeItem,MAX_ITEM_LEVEL} from '../src/equipment.js';
import {FUSION_PAGE_SIZE,fusionSelectionModel,fusionWorkbenchModel,normalizeFusionSelection,planFusionMaterials} from '../src/fusion-workbench.js';

const state=(level=12)=>({rng:7919,nextId:1,floor:100,roomIndex:0,route:[{quality:0}],phase:'fusion',loot:null,player:{level,gold:1e10,talents:{smith:0},items:[],equipped:{}}});
function add(s,{slot='weapon',rarity=0,level=s.player.level,enhance=0,locked=false,name}={}){
 const item=makeItem(s,slot,rarity);Object.assign(item,{level,levelXp:0,enhance,locked});if(name)item.name=name;s.player.items.push(item);return item;
}

test('workbench bulk scope excludes explicit keep rules and includes higher-quality protected materials',()=>{
 const s=state(),target=add(s),equipped=add(s),loot=add(s),locked=add(s,{locked:true}),legendary=add(s,{rarity:3}),higher=add(s,{rarity:2}),armor=add(s,{slot:'armor'});
 s.player.equipped.weapon=equipped.id;s.loot={item:loot};
 const before=structuredClone(s),plan=planFusionMaterials(s,[target.id]);
 assert.deepEqual(new Set(plan.ids),new Set([legendary.id,higher.id]));assert.equal(plan.eligibleCount,2);assert.equal(plan.selectedCount,2);
 assert.deepEqual(plan.excluded,{equipped:1,loot:1,locked:1,invalid:0,targets:1});
 assert.equal(plan.preview.protectedItems.length,2);assert.equal(fusionPreview(s,[target.id],plan.ids),null);
 assert.deepEqual(s,before);
 const explicit=planFusionMaterials(s,[target.id],[locked.id,locked.id,legendary.id,'missing',armor.id],{includeLocked:true});
 assert.deepEqual(new Set(explicit.ids),new Set([locked.id,legendary.id]));assert.equal(explicit.excluded.locked,0);assert.equal(explicit.excluded.invalid,2);
});

test('budget keeps the most XP per gold and preserves both quote rounding steps at exact boundaries',()=>{
 const s=state(1),target=add(s),a=add(s),b=add(s,{rarity:1}),c=add(s,{rarity:7});
 assert.equal(fusionCostSummary(s,[target],1).cost,20);assert.equal(fusionCostSummary(s,[target],2).cost,41);assert.equal(fusionCostSummary(s,[target],3).cost,61);
 s.player.gold=40;const limited=planFusionMaterials(s,[target.id]);
 assert.deepEqual(limited.ids,[c.id]);assert.equal(limited.cost,20);assert(limited.budgetLimited);assert(!limited.safetyLimited);
 s.player.gold=41;const exact=planFusionMaterials(s,[target.id]);
 assert.deepEqual(exact.ids,[c.id,b.id]);assert.equal(exact.cost,41);assert.equal(exact.eligibleCount,3);
 s.player.gold=61;const full=planFusionMaterials(s,[target.id]);assert.equal(full.selectedCount,3);assert(!full.budgetLimited);
 assert(full.preview.materials.every((item,index,items)=>index===0||fusionMaterialXp(items[index-1])>=fusionMaterialXp(item)));
 s.player.gold=0;const empty=planFusionMaterials(s,[target.id]);assert.equal(empty.selectedCount,0);assert.equal(empty.cost,0);assert(empty.budgetLimited);assert.equal(empty.preview,null);
 const all=planFusionMaterials(s,[target.id],undefined,{budget:false});assert.deepEqual(new Set(all.ids),new Set([a.id,b.id,c.id]));assert.equal(all.cost,61);assert(!all.budgetLimited);
});

test('over-level and fractional three-relic costs match the engine at the last affordable piece',()=>{
 const s=state(1),target=add(s,{level:2,rarity:1});for(let i=0;i<3;i++)add(s);
 assert.equal(fusionCostSummary(s,[target],1).cost,32);assert.equal(fusionCostSummary(s,[target],2).cost,63);
 s.player.gold=63;const plan=planFusionMaterials(s,[target.id]);assert.equal(plan.selectedCount,2);assert.equal(plan.cost,63);assert.equal(plan.preview.cost,63);
 const r=state(2),targets=[add(r,{slot:'relic',level:1}),add(r,{slot:'relic',level:2,rarity:1}),add(r,{slot:'relic',level:4,rarity:3})];for(let i=0;i<4;i++)add(r,{slot:'relic'});
 assert.equal(fusionCostSummary(r,targets,1).cost,33);assert.equal(fusionCostSummary(r,targets,3).cost,98);
 r.player.gold=98;const multi=planFusionMaterials(r,targets.map(item=>item.id));assert.equal(multi.selectedCount,3);assert.equal(multi.cost,98);
 assert(multi.preview.outcomes.every(outcome=>outcome.gains.reduce((sum,gain)=>sum+gain,0)===outcome.total));
});

test('budget never treats the capped impossible quote as affordable, while place-all remains a quote',()=>{
 const s=state(1),target=add(s,{level:MAX_ITEM_LEVEL-10000}),material=add(s);
 assert.equal(fusionCostSummary(s,[target],1).cost,1e10+1);
 const limited=planFusionMaterials(s,[target.id]);assert.equal(limited.selectedCount,0);assert(limited.budgetLimited);
 const all=planFusionMaterials(s,[target.id],undefined,{budget:false});assert.deepEqual(all.ids,[material.id]);assert.equal(all.cost,1e10+1);assert(all.preview);
});

test('normalization retains legal selected materials through target changes without mutating filters or pagination',()=>{
 const s=state(),oldTarget=add(s),nextTarget=add(s),kept=add(s,{locked:true}),equipped=add(s),loot=add(s),wrongSlot=add(s,{slot:'armor'});
 s.player.equipped.weapon=equipped.id;s.loot={item:loot};
 const ui={fusionSlot:'weapon',fusionTargets:[nextTarget.id],fusionMaterials:[kept.id,nextTarget.id,kept.id,equipped.id,loot.id,wrongSlot.id,'missing'],fusionPage:7,fusionSearch:'旧',fusionSort:'level',fusionRarity:'low'};
 const before=structuredClone(ui),world=structuredClone(s),normalized=normalizeFusionSelection(s,ui);
 assert.deepEqual(normalized,{targetIds:[nextTarget.id],materialIds:[kept.id]});assert.deepEqual(ui,before);assert.deepEqual(s,world);
 assert(!normalized.materialIds.includes(oldTarget.id),'a replaced target is not silently added as a material');
 assert.deepEqual(normalizeFusionSelection(s,{...ui,fusionTargets:[]}),{targetIds:[],materialIds:[]});
 const relics=Array.from({length:4},()=>add(s,{slot:'relic'}));
 assert.deepEqual(normalizeFusionSelection(s,{fusionSlot:'relic',fusionTargets:relics.map(item=>item.id)}).targetIds,relics.slice(0,3).map(item=>item.id));
 assert.equal(planFusionMaterials(s,relics.map(item=>item.id)).selectedCount,0);
 assert.equal(planFusionMaterials(s,[oldTarget.id,nextTarget.id]).selectedCount,0);
 assert.equal(planFusionMaterials(s,[oldTarget.id,oldTarget.id]).selectedCount,0);
});

test('model keeps equipment identities in one searchable pool and defaults to latest acquisition first',()=>{
 const s=state(),first=add(s,{level:7,rarity:0,name:'Old Echo'}),target=add(s,{level:12,rarity:1,name:'New Echo'}),locked=add(s,{level:15,rarity:0,locked:true,name:'Other Blade'}),legendary=add(s,{level:20,rarity:3,name:'Last Echo'});
 s.player.equipped.weapon=first.id;s.loot={item:locked};
 const ui={fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:[legendary.id]},model=fusionWorkbenchModel(s,ui);
 assert.deepEqual(model.candidates,[first,target,locked,legendary]);assert.deepEqual(model.filtered,[legendary,locked,target,first]);assert.equal(model.inventory.get(locked.id),locked);
 assert(model.equipped.has(first.id));assert(model.targetSet.has(target.id));assert(model.materialSet.has(legendary.id));assert(model.preview);
 const search=fusionWorkbenchModel(s,{...ui,fusionSearch:'eChO',fusionRarity:'low',fusionMinLevel:'8',fusionMaxLevel:'16'});
 assert.deepEqual(search.filtered,[target]);assert.equal(search.total,1);
 assert.deepEqual(fusionWorkbenchModel(s,{...ui,fusionRarity:0}).filtered,[locked,first]);
 assert.deepEqual(fusionWorkbenchModel(s,{...ui,fusionSearch:'not present'}).pageItems,[]);
 assert.equal(fusionWorkbenchModel(s,{...ui,fusionSearch:'not present'}).pages,1);
 for(const sort of ['power','level','rarity','enhance','depth','newest'])assert.equal(fusionWorkbenchModel(s,{...ui,fusionSort:sort}).total,4);
});

test('model clamps only its returned page and always limits cards to the current 24-item page',()=>{
 const s=state();for(let index=0;index<73;index++)add(s,{name:`Weapon ${index}`});
 const ui={fusionSlot:'weapon',fusionPage:1},before=structuredClone(ui),model=fusionWorkbenchModel(s,ui);
 assert.equal(model.pages,4);assert.equal(model.page,1);assert.equal(model.pageItems.length,FUSION_PAGE_SIZE);
 assert.deepEqual(model.pageItems,s.player.items.toReversed().slice(24,48));assert.deepEqual(ui,before);
 const far={...ui,fusionPage:999};assert.equal(fusionWorkbenchModel(s,far).page,3);assert.equal(fusionWorkbenchModel(s,far).pageItems.length,1);assert.equal(far.fusionPage,999);
 assert.equal(fusionWorkbenchModel(s,{...ui,fusionPage:-5}).page,0);
});

test('controller model omits only the preview and reflects in-place state and selection changes',()=>{
 const s=state(),target=add(s),locked=add(s,{locked:true}),legendary=add(s,{rarity:3});
 for(let index=0;index<30;index++)add(s,{level:index+1});
 const ui={fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:[locked.id,legendary.id],fusionPage:1,fusionSort:'power'};
 const compare=()=>{
  const before=structuredClone(s),beforeUi=structuredClone(ui);
  const full=fusionWorkbenchModel(s,ui),light=fusionWorkbenchModel(s,ui,false);
  assert.deepEqual(light,{...full,preview:null});
  const identities=fusionSelectionModel(s,ui);
  for(const [key,value]of Object.entries(identities))assert.deepEqual(value,full[key],`selection-only ${key} stays current`);
  assert.deepEqual(fusionWorkbenchModel(s,ui,true),full);
  assert.deepEqual(full.preview,fusionPreview(s,full.targetIds,full.materialIds,true));
  assert.deepEqual(s,before);assert.deepEqual(ui,beforeUi);
  return light;
 };
 assert.deepEqual(compare().materialIds,[locked.id,legendary.id]);
 // UI updates and inventory changes may reuse their original objects. No
 // identity-based cache may leave removed, newly equipped or new items stale.
 s.player.items.splice(s.player.items.indexOf(legendary),1);
 s.player.equipped.weapon=locked.id;s.player.gold=0;
 const newest=add(s,{rarity:7,level:30});ui.fusionMaterials.push(newest.id);
 ui.fusionSort='newest';ui.fusionPage=0;ui.fusionRarity='';
 const next=compare();
 assert.deepEqual(next.materialIds,[newest.id]);assert.equal(next.inventory.has(legendary.id),false);
 assert.equal(next.filtered[0],newest);assert(next.equipped.has(locked.id));
});

test('placing a batch without unused preview keeps exact quotes, selection and safety at all budget boundaries',()=>{
 for(const slot of ['weapon','relic'])for(const nearLimit of [false,true]){
  const s=state(1),targets=Array.from({length:slot==='relic'?3:1},(_,index)=>add(s,{slot,level:nearLimit&&index===0?MAX_ITEM_LEVEL-1:index+1,rarity:index}));
  if(nearLimit)targets[0].levelXp=levelXpNeeded(targets[0].level)-300;
  for(let index=0;index<18;index++)add(s,{slot,rarity:index%8,level:1+index%5,enhance:index%21,locked:index%7===0});
  const targetIds=targets.map(item=>item.id),candidateIds=s.player.items.map(item=>item.id),original=structuredClone(s);
  for(const gold of [0,19,20,40,41,61,200,1e10])for(const budget of [false,true])for(const includeLocked of [false,true]){
   s.player.gold=gold;
   const complete=planFusionMaterials(s,targetIds,candidateIds,{budget,includeLocked});
   const placement=planFusionMaterials(s,targetIds,candidateIds,{budget,includeLocked,includePreview:false});
   assert.deepEqual(placement,{...complete,preview:null},`${slot}, near limit ${nearLimit}, gold ${gold}, budget ${budget}, locked ${includeLocked}`);
   if(placement.ids.length)assert.deepEqual(fusionPreview(s,targetIds,placement.ids,true),complete.preview);
  }
  s.player.gold=original.player.gold;assert.deepEqual(s,original,'neither planning path changes inventory, currency or RNG');
 }
});

test('batch safety considers aggregate highest-roll XP, skips oversized materials and can still use smaller ones',()=>{
 const s=state(1),target=add(s,{level:MAX_ITEM_LEVEL-1});target.levelXp=levelXpNeeded(target.level)-500;
 const big=add(s,{rarity:3}),small=Array.from({length:3},()=>add(s));
 assert(fusionPreview(s,[target.id],[small[0].id],true));assert.equal(fusionPreview(s,[target.id],small.map(item=>item.id),true),null);
 const before=structuredClone(s),plan=planFusionMaterials(s,[target.id],undefined,{budget:false});
 assert.equal(plan.eligibleCount,4);assert.equal(plan.selectedCount,2);assert(plan.safetyLimited);assert(!plan.ids.includes(big.id));assert(plan.preview);assert.deepEqual(s,before);
 assert(plan.preview.outcomes.every(outcome=>outcome.upgrades[0].after.level<=MAX_ITEM_LEVEL));
});

test('three-relic safety uses the engine remainder order at the exact last experience point',()=>{
 const s=state(1),near=add(s,{slot:'relic',level:MAX_ITEM_LEVEL-1}),a=add(s,{slot:'relic'}),b=add(s,{slot:'relic'}),material=add(s,{slot:'relic'});
 near.levelXp=levelXpNeeded(near.level)-81;
 const first=planFusionMaterials(s,[near.id,a.id,b.id],[material.id],{budget:false});assert(first.safetyLimited);assert.equal(first.selectedCount,0);
 const last=planFusionMaterials(s,[a.id,b.id,near.id],[material.id],{budget:false});assert.equal(last.selectedCount,1);assert.deepEqual(last.preview.outcomes[5].gains,[82,82,81]);
 const after=advanceEquipment(near,last.preview.outcomes[5].gains[2]);assert.equal(after.level,MAX_ITEM_LEVEL);assert.equal(after.levelXp,0);
});

test('10,000-item planning has bounded full-inventory scans and model construction still exposes only one page',()=>{
 const s=state(12),target=add(s),template=add(s);
 while(s.player.items.length<10000)s.player.items.push({...template,id:`i${s.nextId++}`});
 let scans=0;s.player.items=new Proxy(s.player.items,{get(array,key,receiver){if(key==='map'||key==='filter')scans++;return Reflect.get(array,key,receiver);}});
 const rng=s.rng,nextId=s.nextId,plan=planFusionMaterials(s,[target.id]);assert.equal(plan.selectedCount,9999);assert.equal(plan.preview.materials.length,9999);
 const model=fusionWorkbenchModel(s,{fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:plan.ids,fusionPage:100,fusionSort:'power'});
 assert.equal(model.pageItems.length,24);assert.equal(model.total,10000);assert.equal(model.page,100);assert.equal(model.materialIds.length,9999);
 assert(scans<=6,`expected a bounded number of full inventory scans, received ${scans}`);assert.equal(s.rng,rng);assert.equal(s.nextId,nextId);assert.equal(s.player.items.length,10000);
});
