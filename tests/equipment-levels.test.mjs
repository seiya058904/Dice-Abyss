import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG,CATALOG_BY_ID} from '../src/equipment-content.js';
import {itemValue,itemStats,makeItem,validEquipment,migrateEquipment,legacyItemValue,advanceEquipment,levelXpNeeded,fusionPreview,applyFusion,forgeCost,MAX_ITEM_LEVEL} from '../src/equipment.js';
const state=(seed=7919,level=70)=>({rng:seed,nextId:1,floor:100,roomIndex:0,route:[{quality:0}],phase:'fusion',loot:null,player:{level,gold:1e8,talents:{smith:0},items:[],equipped:{}}});
const item=(s,slot='weapon',rarity=3)=>{const i=makeItem(s,slot,rarity);s.player.items.push(i);return i;};

test('1536 equipment entries retain every original catalog id and add actual role-specific combinations',()=>{
 assert.equal(CATALOG_BY_ID.size,1536);
 for(const slot of ['weapon','armor','relic']){
  assert.equal(CATALOG[slot].length,512);
  for(let t=0;t<10;t++)for(let p=0;p<3;p++)for(let r=0;r<4;r++)assert(CATALOG_BY_ID.has(`${slot}-${t}-${p}-${r}`));
  const added=CATALOG[slot].filter(i=>i.id.startsWith('v4-'));assert.equal(added.length,192);assert(added.every(i=>Object.keys(i.effects).length>=2));
  for(const entry of CATALOG[slot]){const stats=itemStats({...entry,id:'i1',catalogId:entry.id,level:70,levelXp:0,depth:1,enhance:0});if(stats.luck!==undefined)assert(Number.isInteger(stats.luck),'displayed item luck is an exact integer contribution');}
 }
 const s=state(),weapon=item(s),armor=item(s,'armor'),relic=item(s,'relic');
 for(const i of [weapon,armor,relic]){i.level=70;i.levelXp=0;i.profile=0;}
 assert(itemStats(weapon).attack>itemStats(relic).attack*3);assert(itemStats(armor).hp>0);assert.equal(itemStats(armor).attack,undefined);
});

test('equipment power follows level, rarity, reinforcement and explicit progress while source depth has no effect',()=>{
 const s=state(),base=item(s);base.level=70;base.levelXp=0;
 const far={...base,depth:1000000};assert.deepEqual(itemStats(far),itemStats(base));assert.equal(itemValue(far),itemValue(base));
 assert(itemValue({...base,level:75})>itemValue(base));assert(itemValue({...base,levelXp:levelXpNeeded(70)-1})>itemValue(base));
 for(let rarity=0;rarity<3;rarity++){const low={...base,rarity,enhance:10},high={...base,rarity:rarity+1,enhance:0};assert(itemValue(high)>itemValue(low));}
 assert(!Object.hasOwn(base,'growth'));assert(validEquipment(base));
});

test('ordinary drops center on character level and special rewards modestly exceed that band without wear gates',()=>{
 const levels=[],bosses=[];
 for(let seed=1;seed<=300;seed++){
  const a=state(seed*7919),b=structuredClone(a),c=structuredClone(a);
  const normal=makeItem(a,'weapon',3,1),deep=makeItem(b,'weapon',3,1000000),boss=makeItem(c,'weapon',3,1,'boss');
  assert.equal(normal.level,deep.level);assert.deepEqual(normal,{...deep,depth:1});assert.equal(boss.level,normal.level+3);levels.push(normal.level);bosses.push(boss.level);
 }
 assert.equal(Math.min(...levels),68);assert.equal(Math.max(...levels),72);assert.equal(Math.max(...bosses),75);
});

test('bulk level progress agrees with sequential XP awards across the curve and high-level flat tail',()=>{
 const s=state();
 for(const start of [1,2,99,9998,9999,10000,50000]){
  const original={...item(s),level:start,levelXp:0};let manual={...original},xp=200000;
  while(xp>=levelXpNeeded(manual.level)){xp-=levelXpNeeded(manual.level);manual.level++;}manual.levelXp=xp;
  assert.deepEqual(advanceEquipment(original,200000),manual);assert.equal(original.level,start);
 }
 assert.throws(()=>advanceEquipment(item(s),Infinity));assert.throws(()=>advanceEquipment(item(s),-1));
});

test('representative old catalog and pre-catalog assets retain rounded value with growth removed and repeatable conversion',()=>{
 for(const slot of ['weapon','armor','relic'])for(const rarity of [0,1,2,3])for(const depth of [1,10,100,1000000])for(const growth of [0,100,500,10000])for(const enhance of [0,10,20]){
  const old={id:'i1',slot,rarity,depth,enhance,growth,name:'旧日资产',profile:1,theme:4,catalogId:`${slot}-4-1-${rarity}`,locked:true};
  const migrated=migrateEquipment(old);assert.equal(itemValue(migrated),legacyItemValue(old));assert(!Object.hasOwn(migrated,'growth'));assert.equal(migrated.enhance,enhance);assert.equal(migrated.locked,true);assert.equal(migrated.legacy,true);assert.deepEqual(migrateEquipment(migrated),migrated);
 }
 const old={id:'i1',slot:'armor',rarity:3,depth:100,enhance:20,growth:1000,name:'古甲'};assert.equal(itemValue(migrateEquipment(old)),legacyItemValue(old));
});

test('all dice faces award positive level XP, high faces are visible and three relic targets share exact atomic rewards',()=>{
 for(const face of [1,2,3,4,5,6]){
  const s=state(),targets=[item(s,'relic'),item(s,'relic'),item(s,'relic')],materials=[item(s,'relic',2),item(s,'relic',1)];targets[0].enhance=17;materials[0].enhance=20;
  const preview=fusionPreview(s,targets.map(i=>i.id),materials.map(i=>i.id));assert(preview);
  assert(preview.outcomes.every(o=>o.gains.every(x=>x>0)));assert(preview.outcomes[4].total>preview.outcomes[0].total*1.7);assert(preview.outcomes[5].total>preview.outcomes[0].total*2.4);
  const before=structuredClone(s),outcome=preview.outcomes[face-1];assert.strictEqual(applyFusion(s,preview,face),s);assert.equal(s.rng,before.rng);assert.equal(s.player.gold,before.player.gold-preview.cost);assert.equal(s.player.items.length,3);
  for(let i=0;i<3;i++){const after=s.player.items.find(t=>t.id===targets[i].id);assert.equal(after.enhance,targets[i].enhance);assert.equal(after.level,outcome.upgrades[i].after.level);assert.equal(after.levelXp,outcome.upgrades[i].after.levelXp);assert(!Object.hasOwn(after,'growth'));}
  const saved=structuredClone(s);assert.equal(applyFusion(s,preview,face),null);assert.deepEqual(s,saved);
 }
});

test('fusion protects equipped/current-loot materials absolutely and confirms locked, legendary or higher-tier consumption',()=>{
 const s=state(),target=item(s,'weapon',2),material=item(s,'weapon',3);s.player.equipped.weapon=material.id;
 assert.equal(fusionPreview(s,target.id,material.id,true),null);s.player.equipped={};assert.equal(fusionPreview(s,target.id,material.id),null);assert(fusionPreview(s,target.id,material.id,true));
 s.loot={item:material};assert.equal(fusionPreview(s,target.id,material.id,true),null);s.loot=null;material.rarity=2;material.catalogId='weapon-0-0-2';material.profile=0;material.theme=0;material.locked=true;assert.equal(fusionPreview(s,target.id,material.id),null);assert(fusionPreview(s,target.id,material.id,true));
 const preview=fusionPreview(s,target.id,material.id,true);s.player.gold=preview.cost-1;const before=structuredClone(s);assert.equal(applyFusion(s,preview,6),null);assert.deepEqual(s,before);
});

test('strict item schema rejects hidden growth, invalid progress, catalog spoofing and unsafe extremes',()=>{
 const s=state(),i=item(s);for(const change of [{growth:0},{level:0},{level:MAX_ITEM_LEVEL+1},{levelXp:-1},{levelXp:levelXpNeeded(i.level)},{level:NaN},{enhance:21},{legacy:'yes'},{catalogId:'missing'}])assert.equal(validEquipment({...i,...change}),false);
 assert.throws(()=>advanceEquipment({...i,level:MAX_ITEM_LEVEL,levelXp:0},1),/上限/);
 assert.throws(()=>migrateEquipment({...i,growth:100}),/混合/);
 assert.throws(()=>migrateEquipment({id:'i1',slot:'weapon',rarity:3,depth:Number.MAX_SAFE_INTEGER,enhance:20,growth:1e12,name:'超安全旧物'}),/安全/);
});

test('late forging and over-level fusion offer sustained gold investment with honest discounts and safe unaffordable quotes',()=>{
 const s=state(),target=item(s),material=item(s,'weapon',2);target.level=100;target.levelXp=0;target.enhance=9;
 assert.equal(forgeCost(s,target),Math.round((35+800+6*81)*1.75));
 assert(forgeCost(s,{...target,level:200})>forgeCost(s,target));assert(forgeCost(s,{...target,enhance:19})>forgeCost(s,target));
 const normal=forgeCost(s,target);s.player.talents.smith=5;s.route[0].quality=1;assert.equal(forgeCost(s,target),Math.round(normal*.75*.8));
 s.player.level=100;const equal=fusionPreview(s,target.id,material.id);target.level=200;const advanced=fusionPreview(s,target.id,material.id);
 assert.equal(equal.cost,Math.round((18+100*2.4)*1.75));assert.equal(advanced.levelMultiplier,2);assert(advanced.cost>equal.cost*3);
 target.level=MAX_ITEM_LEVEL;assert.equal(forgeCost(s,target),1e10+1);
});
