import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,stats,diceCount,compareEquipment,equippedIds} from '../src/engine.js';
import {equipmentComparisonDetails} from '../src/equipment-comparison.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
import {equipmentComparisonView,comparison} from '../src/views.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

const naturalLoot=()=>{
 let s=newGame(3);
 for(const type of ['fate','enter','roll','roll','open'])s=transition(s,{type});
 assert.equal(s.phase,'loot');assert.equal(s.player.level,1);assert(validateSave(s));return s;
};
const candidate=s=>s.player.items.find(item=>item.id==='i4');
const vitalState=s=>({hp:s.player.hp,maxHp:stats(s).maxHp,ward:s.ward||0});
function actualQuote(s,item,slot){
 const snapshot=encodeSave(s),detail=equipmentComparisonDetails(s,item,slot),equipped=transition(s,{type:'equip',id:item.id,slot});
 assert.deepEqual(detail.context.before,vitalState(s));assert.deepEqual(detail.context.after,vitalState(equipped));
 assert.equal(detail.context.hpLost,s.player.hp-equipped.player.hp);assert.equal(encodeSave(s),snapshot);
 assert.deepEqual(decodeSave(encodeSave(equipped)),equipped);return {detail,equipped};
}
function item(catalogId,id){
 const entry=CATALOG_BY_ID.get(catalogId);assert(entry,catalogId);
 return {id,catalogId,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,level:1,levelXp:0,enhance:0,depth:140,locked:false};
}
function scene(oldId,nextId,level=1){
 const s=newGame(31),old=item(oldId,'i1'),other=item(nextId,'i4');
 s.floor=140;s.player.level=level;s.fate=[3,4];s.phase='combat';
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,index)=>({type,id:`f140r${index}`,quality:0,done:false}));
 s.player.items=[item('weapon-0-0-0','i1'),item('armor-0-0-0','i2'),item('relic-0-0-0','i3')];
 const index=s.player.items.findIndex(entry=>entry.slot===old.slot);old.id=s.player.items[index].id;s.player.items[index]=old;s.player.items.push(other);s.nextId=5;
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.player.hp=stats(s).maxHp;s.ward=0;
 s.enemy={name:'骰数边界构造场景',note:'Synthetic boundary fixture, not a natural journey.',label:'只验证可达条件',type:'combat',trait:'steady',hp:1e8,maxHp:1e8,shield:0,maxShield:0,attack:1,turns:0,stage:1,combatRules:4};
 assert(validateSave(s));return s;
}

test('the natural first-floor decision exposes an unreachable pair shield while preserving its original estimate',()=>{
 const s=naturalLoot(),item=candidate(s),detail=equipmentComparisonDetails(s,item);
 assert.equal(diceCount(s),1);assert.equal(compareEquipment(s,item).delta,82);
 const row=detail.rows.find(row=>row.key==='pairWard');assert.equal(row.before,.04);assert.equal(row.after,0);assert.equal(row.trigger,'双同及以上');assert.equal(row.coverage,'omitted');
 assert.deepEqual(detail.context.unreachable.map(row=>[row.key,row.requiredDice,row.unlockLevel]),[['pairWard',2,2]]);
 const html=equipmentComparisonView(s,item);assert.match(html,/data-comparison-dice-count="1"/);assert.match(html,/data-comparison-key="pairWard" data-comparison-possible="false"/);
 assert.match(html,/当前仅 1 颗战斗骰，战斗中无法触发/);assert.match(html,/第 2 颗骰在 Lv\.2 解锁/);
 assert(!comparison(s,item).includes('data-comparison-context'),'compact inventory comparison keeps its existing path');
});

test('the same natural pair shield becomes reachable after an actual level-two unlock',()=>{
 let s=transition(naturalLoot(),{type:'next'});
 for(let i=0;i<20&&s.player.level===1&&s.phase==='combat';i++)s=transition(s,{type:'roll'});
 assert.equal(s.player.level,2);assert.equal(diceCount(s),2);
 const detail=equipmentComparisonDetails(s,candidate(s));assert(detail.rows.some(row=>row.key==='pairWard'));assert(!detail.context.unreachable.some(row=>row.key==='pairWard'));
 assert.match(equipmentComparisonView(s,candidate(s)),/data-comparison-key="pairWard" data-comparison-possible="true"/);
});

test('natural armor swaps raise capacity without healing and keep already-issued opening ward',()=>{
 const s=transition(naturalLoot(),{type:'next'}),{detail,equipped}=actualQuote(s,candidate(s));
 assert.deepEqual(detail.context.before,{hp:165,maxHp:165,ward:4});assert.deepEqual(detail.context.after,{hp:165,maxHp:224,ward:4});
 assert.equal(stats(s).barrier,.025);assert.equal(stats(equipped).barrier,0);
 const html=equipmentComparisonView(s,candidate(s));assert.match(html,/生命上限提高，当前生命不会随之恢复/);assert.match(html,/换装不重新发放开战护盾，已获得的护盾保留/);
});

test('an actual injured battle state previews the exact HP clamp and does not recreate restored opening ward',()=>{
 const entered=transition(naturalLoot(),{type:'next'}),upgraded=transition(entered,{type:'equip',id:'i4'}),s=transition(upgraded,{type:'roll'}),old=s.player.items.find(item=>item.id==='i2');
 assert.deepEqual(vitalState(s),{hp:173,maxHp:224,ward:3});
 const {detail}=actualQuote(s,old);assert.deepEqual(detail.context.after,{hp:165,maxHp:165,ward:3});assert.equal(detail.context.hpLost,8);
 assert.match(equipmentComparisonView(s,old),/超出新上限的 8 点当前生命会被裁减；换回装备不会补回/);
});

test('lowering capacity below an unfilled maximum leaves current HP alone when it still fits',()=>{
 const source=naturalLoot(),s=transition(source,{type:'equip',id:'i4'}),old=s.player.items.find(item=>item.id==='i2');
 const {detail}=actualQuote(s,old);assert.equal(detail.context.before.maxHp,224);assert.equal(detail.context.after.maxHp,165);assert.equal(detail.context.hpLost,0);
 assert.match(equipmentComparisonView(s,old),/当前生命未超出新上限，本次不会裁减/);
});

test('a defeated comparison keeps zero HP and describes recovery as a separate retry action',()=>{
 const s=transition(naturalLoot(),{type:'next'});s.phase='dead';s.player.hp=0;s.ward=37;
 assert(validateSave(s));const {detail,equipped}=actualQuote(s,candidate(s));
 assert(detail.context.dead);assert.deepEqual(detail.context.after,{hp:0,maxHp:224,ward:37});assert.equal(equipped.phase,'dead');
 const retry=transition(equipped,{type:'retry'});assert.equal(retry.player.hp,stats(retry).maxHp);assert.equal(retry.player.hp,224);
 assert.match(equipmentComparisonView(s,candidate(s)),/换装不会复活；重燃时才按当时构筑恢复全部生命/);
});

test('all supported two-, three- and four-dice conditions unlock at the real character levels',()=>{
 const cases=[
  ['pairBonus','relic-0-0-0','relic-3-0-0',1,2,2],
  ['sumBonus','weapon-0-0-0','weapon-9-0-0',2,3,3],
  ['criticalFollowChance','weapon-0-0-0','weapon-8-0-0',1,2,2],
  ['echoChance','relic-0-0-0','relic-1-0-0',1,2,2],
  ['pairWard','armor-0-0-0','armor-4-0-0',1,2,2],
  ['lowWard','armor-0-0-0','v5-armor-1-0-4',1,2,2],
  ['tripleEcho','weapon-0-0-0','v5-weapon-1-0-4',2,3,3],
  ['distinctStrike','weapon-0-0-0','v5-weapon-4-0-4',3,5,4],
  ['resonanceMend','relic-0-0-0','v5-relic-4-0-4',3,5,4],
  ['gildedSix','relic-0-0-0','v5-relic-3-0-4',1,2,2],
 ];
 for(const [key,oldId,newId,beforeLevel,unlockedLevel,requiredDice]of cases){
  const s=scene(oldId,newId,beforeLevel),before=equipmentComparisonDetails(s,candidate(s)),blocked=before.context.unreachable.find(row=>row.key===key);
  assert(before.rows.some(row=>row.key===key),key);assert(blocked,key);assert.equal(blocked.requiredDice,requiredDice);assert.equal(blocked.unlockLevel,unlockedLevel);
  s.player.level=unlockedLevel;s.player.hp=Math.min(s.player.hp,stats(s).maxHp);
  const after=equipmentComparisonDetails(s,candidate(s));assert.equal(after.context.count,requiredDice);assert(!after.context.unreachable.some(row=>row.key===key),key);
 }
 const pairFollow=scene('weapon-0-0-0','weapon-0-2-0');pairFollow.player.talents.echo=1;
 assert(equipmentComparisonDetails(pairFollow,candidate(pairFollow)).context.unreachable.some(row=>row.key==='pairFollowChance'));
 pairFollow.player.level=2;assert(!equipmentComparisonDetails(pairFollow,candidate(pairFollow)).context.unreachable.some(row=>row.key==='pairFollowChance'));
});

test('a single combat die does not imply that same-point guidance is disabled for multi-die fate rolls',()=>{
 const s=scene('relic-0-0-0','relic-1-0-0'),detail=equipmentComparisonDetails(s,candidate(s));
 const echo=detail.context.unreachable.find(row=>row.key==='echoChance');assert(echo);assert.match(echo.message,/战斗中无法触发/);assert.match(echo.message,/命运等多骰场景仍可引导同点/);
});

test('a condition hidden by its stacking cap still reports an unmet dice requirement',()=>{
 const s=scene('v5-relic-4-0-4','v5-relic-4-0-7',3);
 s.player.items.push(item('v5-relic-4-0-7','i5'),item('v5-relic-4-0-7','i6'));s.player.equipped.relic2='i5';s.player.equipped.relic3='i6';s.nextId=7;
 const detail=equipmentComparisonDetails(s,candidate(s));assert(!detail.rows.some(row=>row.key==='resonanceMend'));assert(detail.limits.some(row=>row.key==='resonanceMend'));
 assert(detail.context.unreachable.some(row=>row.key==='resonanceMend'&&row.requiredDice===4&&row.unlockLevel===5));
 assert.match(equipmentComparisonView(s,candidate(s)),/data-comparison-limit="resonanceMend"[^<]*当前仅 3 颗战斗骰/);
});

test('already-equipped and unowned shop items yield the same immediate quote as the actual legal equip order',()=>{
 const s=naturalLoot(),current=s.player.items.find(item=>item.id===s.player.equipped.armor),same=actualQuote(s,current);
 assert.deepEqual(same.detail.context.before,same.detail.context.after);
 // Construct a valid merchant order around the natural item; it is a boundary
 // check of buy-then-equip, not a claim that seed 3 generated this shop.
 const merchant=structuredClone(s),offer=candidate(merchant);merchant.player.items=merchant.player.items.filter(item=>item.id!==offer.id);merchant.phase='merchant';merchant.enemy=null;merchant.lastRoll=null;merchant.loot=null;
 delete merchant.lootCreditedGold;merchant.nextId=7;
 merchant.route[merchant.roomIndex].type='merchant';merchant.shop=[{...item('weapon-0-0-0','i5'),depth:1},offer,{...item('relic-0-0-0','i6'),depth:1}].map(item=>({id:item.id,item,price:1,sold:false}));merchant.shop.push({id:'heal',price:1,sold:false});
 assert(validateSave(merchant));const quote=equipmentComparisonDetails(merchant,offer),bought=transition(merchant,{type:'buy',id:offer.id}),equipped=transition(bought,{type:'equip',id:offer.id});
 assert.equal(bought.player.equipped.armor,merchant.player.equipped.armor);assert.deepEqual(quote.context.after,vitalState(equipped));assert(!merchant.player.items.some(item=>item.id===offer.id));
});

test('detail rendering preserves unknown state and gives identical results with compact equipped inventories',()=>{
 const s=naturalLoot(),item=candidate(s);s.futureFields={retain:['opaque',17]};s.player.items[0].futureItem={nested:['retained']};
 const snapshot=encodeSave(s),detail=equipmentComparisonDetails(s,item),equipped=new Set(equippedIds(s)),compact={...s,player:{...s.player,items:s.player.items.filter(item=>equipped.has(item.id))}};
 assert.deepEqual(detail,equipmentComparisonDetails(compact,item));
 const random=Math.random;Math.random=()=>{throw Error('Comparison must not sample randomness');};
 try{equipmentComparisonView(s,item);equipmentComparisonDetails(s,item);}finally{Math.random=random;}
 assert.equal(encodeSave(s),snapshot);assert.deepEqual(decodeSave(snapshot),s);
});
