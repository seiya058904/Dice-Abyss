import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,stats,transition,compareEquipment,equippedIds,drawDice,diceCount,createChest} from '../src/engine.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
import {equipmentComparisonDetails,equipmentComparisonHint} from '../src/equipment-comparison.js';

function item(catalogId,id,level=80){
 const e=CATALOG_BY_ID.get(catalogId);assert(e,catalogId);
 return {id,catalogId,slot:e.slot,rarity:e.rarity,profile:e.profile,theme:e.theme,name:e.name,level,levelXp:0,enhance:0,depth:140,locked:false};
}
function scene(oldId='weapon-6-0-7',nextId='weapon-0-0-7',nextLevel=84){
 const s=newGame(7919);s.runId='constructed-comparison-regression';s.floor=140;s.player.level=80;s.fate=[3,4];s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({type,id:`f140r${i}`,quality:0,done:false}));s.roomIndex=0;s.phase='combat';
 s.player.items=[item('weapon-0-0-0','i1'),item('armor-0-0-0','i2'),item('relic-0-0-0','i3')];
 const entry=CATALOG_BY_ID.get(oldId),index=s.player.items.findIndex(i=>i.slot===entry.slot);s.player.items[index]=item(oldId,s.player.items[index].id);s.player.items.push(item(nextId,'i4',nextLevel));s.nextId=5;
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.player.hp=stats(s).maxHp;s.ward=0;
 s.enemy={name:'条件比较构造对照',note:'Synthetic fixture, not a natural journey.',label:'轻反击；隔离条件伤害',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1,turns:0,stage:2,combatRules:4};
 assert(validateSave(s));return s;
}
const row=(details,key)=>{const r=details.rows.find(r=>r.key===key);assert(r,key);return r;};
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} ≈ ${b}`);

test('first-hit omission is reproduced with actual paired rolls and explained as a changed condition',()=>{
 const s=scene(),candidate=s.player.items[3],snapshot=encodeSave(s),score=compareEquipment(s,candidate),hint=equipmentComparisonHint(s,candidate),details=equipmentComparisonDetails(s,candidate);
 assert.equal(score.delta,9);assert.equal(score.grade,'估算提升');assert(hint.hasOmitted);assert(hint.note.includes('首击'));
 const first=row(details,'firstBonus');assert.equal(first.before,.24);assert.equal(first.after,0);assert.equal(first.coverage,'omitted');assert.equal(first.trigger,'每场首次掷骰');
 assert.deepEqual(details.rows.map(r=>r.key),['fourBonus','firstBonus']);
 let openingBefore=0,openingAfter=0,laterBefore=0,laterAfter=0;
 for(let seed=1;seed<=256;seed++)for(const turns of [0,1]){
  const a=decodeSave(snapshot);a.rng=seed*7919>>>0;a.enemy.turns=turns;const b=transition(a,{type:'equip',id:candidate.id});
  assert.equal(a.rng,b.rng);const aa=transition(a,{type:'roll'}),bb=transition(b,{type:'roll'});
  assert.deepEqual(aa.lastRoll.values,bb.lastRoll.values);assert.equal(aa.lastRoll.critical,bb.lastRoll.critical);assert.equal(aa.lastRoll.follow,bb.lastRoll.follow);
  assert(!aa.lastRoll.killed&&!bb.lastRoll.killed);assert.equal(aa.rng,bb.rng);
  if(turns===0){openingBefore+=aa.lastRoll.total;openingAfter+=bb.lastRoll.total;}else{laterBefore+=aa.lastRoll.total;laterAfter+=bb.lastRoll.total;}
 }
 assert.equal(openingBefore/256,144820.78125);assert.equal(openingAfter/256,127023.1015625);assert(openingAfter<openingBefore*.9);assert(laterAfter>laterBefore);
 assert.equal(encodeSave(s),snapshot,'comparison must not consume RNG or mutate state');
});

test('the detail lists current talent-plus-equipment contributions without mixing two first-hit rules',()=>{
 const s=scene('weapon-6-0-7','weapon-9-0-7',80);s.player.talents.opener=2;s.player.talents.sum=3;s.player.talents.firstFire=3;
 const details=equipmentComparisonDetails(s,s.player.items[3]);near(row(details,'firstBonus').before,.54);near(row(details,'firstBonus').after,.3);near(row(details,'sumBonus').before,.3);near(row(details,'sumBonus').after,.5);
 assert(!details.rows.some(r=>r.key==='openingStrike'),'unchanged deep first-hit ability adds no row');
});

test('conditional penetration loss is visible even when the existing base-penetration warning is false',()=>{
 const s=scene('v5-weapon-0-0-4','weapon-4-0-4',88),candidate=s.player.items[3],score=compareEquipment(s,candidate),details=equipmentComparisonDetails(s,candidate);
 assert.equal(score.shieldTradeoff,false);assert(row(details,'pierce').after>row(details,'pierce').before);assert(row(details,'sixPierce').after<row(details,'sixPierce').before);
 near(row(details,'sixPierce').before,.155);near(row(details,'sixPierce').after,.125);assert(equipmentComparisonHint(s,candidate).hasOmitted);
 s.enemy.maxShield=s.enemy.shield=1e12;s.enemy.turns=1;
 for(let seed=1;seed<100;seed++){
  const a=structuredClone(s);a.rng=seed*7919>>>0;const probe=structuredClone(a);if(!drawDice(probe,diceCount(probe)).values.includes(6))continue;
  const b=transition(a,{type:'equip',id:candidate.id}),aa=transition(a,{type:'roll'}),bb=transition(b,{type:'roll'});
  assert.deepEqual(aa.lastRoll.values,bb.lastRoll.values);assert(bb.lastRoll.total>aa.lastRoll.total);assert(bb.lastRoll.hpDamage<aa.lastRoll.hpDamage);return;
 }
 assert.fail('must exercise the visible six-point trigger');
});

test('deep damage, shields, survival and economy traits retain their exact trigger and effective value',()=>{
 const execution=scene('v5-weapon-2-0-4','weapon-0-0-4',80),ex=row(equipmentComparisonDetails(execution,execution.player.items[3]),'execution');near(ex.before,.18);assert.equal(ex.after,0);assert.equal(ex.coverage,'approximate');
 for(const type of ['combat','boss']){
  const start=structuredClone(execution);start.enemy.type=type;start.enemy.hp=start.enemy.maxHp*.35;
  assert.equal(transition(start,{type:'roll'}).lastRoll.mechanics.some(s=>s.startsWith('弑王印 ·')),type==='boss');
 }
 const guard=scene('v5-armor-4-0-4','armor-0-0-4',80),protection=row(equipmentComparisonDetails(guard,guard.player.items[3]),'resolveGuard');near(protection.before,.1);assert.equal(protection.after,0);assert.equal(protection.unit,'reduction');assert.equal(protection.coverage,'omitted');assert(protection.trigger.includes('低于35%'));
 const heal=scene('v5-relic-4-0-4','relic-0-0-4',80),recovery=row(equipmentComparisonDetails(heal,heal.player.items[3],'relic'),'resonanceMend');near(recovery.before,.025);assert.equal(recovery.after,0);assert.equal(recovery.unit,'maxHp');assert(recovery.trigger.includes('仍存活'));
 const economy=scene('relic-5-0-7','relic-1-0-7',80);economy.player.talents.fortune=3;const gold=row(equipmentComparisonDetails(economy,economy.player.items[3],'relic'),'goldBonus');near(gold.before,.7);near(gold.after,.3);assert.equal(gold.coverage,'omitted');assert(gold.trigger.includes('不改已生成奖励'));
});

test('actual critical caps suppress false gain rows and explain the added item contribution',()=>{
 const s=scene('relic-7-0-7','relic-7-1-7',80);s.player.items.push(item('relic-7-0-7','i5'),item('relic-7-0-7','i6'));s.player.equipped.relic2='i5';s.player.equipped.relic3='i6';s.nextId=7;s.player.talents.critical=5;s.player.talents.keen=5;
 const before=structuredClone(s),details=equipmentComparisonDetails(s,s.player.items[3],'relic');
 assert(!details.rows.some(r=>['criticalChance','sixCriticalChance'].includes(r.key)));assert(details.limits.some(r=>r.key==='criticalChance'&&r.value===.9&&r.cap===.9));assert.deepEqual(s,before);
});

test('deep stacking and the layer-luck cap report effective limits without inventing useful gains',()=>{
 const s=scene('v5-relic-1-0-4','v5-relic-1-0-7',80);s.player.talents.dawnCrit=3;
 const a=equipmentComparisonDetails(s,s.player.items[3],'relic');assert(row(a,'firstCritLuck').after<=24);
 s.player.items.push(item('v5-relic-1-0-7','i5'));s.player.equipped.relic2='i5';s.nextId=6;
 const b=equipmentComparisonDetails(s,s.player.items[3],'relic');assert(!b.rows.some(r=>r.key==='firstCritLuck'));assert(b.limits.some(r=>r.key==='firstCritLuck'&&r.value===24));
 const layer=scene('v5-relic-2-0-4','v5-relic-2-0-7',80);layer.eventLuck=20;
 const capped=equipmentComparisonDetails(layer,layer.player.items[3],'relic');assert(!capped.rows.some(r=>r.key==='eliteLuck'));assert(capped.limits.some(r=>r.key==='eventLuck'&&r.value===20));
});

test('requested relic slots produce distinct real comparisons and compact inventories remain identical',()=>{
 const s=scene('relic-5-0-7','relic-1-0-7',80);s.player.items.push(item('relic-0-0-7','i5'),item('relic-3-0-7','i6'));s.player.equipped.relic2='i5';s.player.equipped.relic3='i6';s.nextId=7;s.futureFields={retain:{nested:['unknown',17]}};
 const snapshot=structuredClone(s),candidate=s.player.items[3],ids=new Set(equippedIds(s)),compact={...s,player:{...s.player,items:s.player.items.filter(i=>ids.has(i.id))}};
 for(const slot of ['relic','relic2','relic3']){
  const details=equipmentComparisonDetails(s,candidate,slot);assert.equal(details.slot,slot);assert.deepEqual(details,equipmentComparisonDetails(compact,candidate,slot));assert.deepEqual(equipmentComparisonHint(s,candidate,slot),equipmentComparisonHint(compact,candidate,slot));
 }
 assert(equipmentComparisonDetails(s,candidate,'relic').rows.some(r=>r.key==='goldBonus'));assert(!equipmentComparisonDetails(s,candidate,'relic2').rows.some(r=>r.key==='goldBonus'));assert.deepEqual(s,snapshot);
});

test('gold equipment uses the effective sixty-percent cap and keeps already generated rewards intact',()=>{
 const s=scene('relic-5-0-4','relic-5-0-7',80);s.player.items.push(item('relic-5-0-7','i5'));s.player.equipped.relic2='i5';s.nextId=6;s.player.talents.fortune=3;
 const candidate=s.player.items[3],details=equipmentComparisonDetails(s,candidate,'relic'),a=structuredClone(s),b=transition(s,{type:'equip',id:candidate.id,slot:'relic'});
 assert.equal(stats(a).goldBonus,.6);assert.equal(stats(b).goldBonus,.6);assert(!details.rows.some(row=>row.key==='goldBonus'));assert(details.limits.some(row=>row.key==='goldBonus'&&row.cap===.6));
 const first=createChest(a,'combat','上限对照'),second=createChest(b,'combat','上限对照');assert.deepEqual(first,second);
 s.chest=first;const snapshot=structuredClone(first);equipmentComparisonDetails(s,candidate,'relic');assert.deepEqual(s.chest,snapshot);
});

test('identical traits do not create rows and every authored item yields finite unique detail values',()=>{
 const s=scene(),old=s.player.items[0],same={...old,id:'i99',level:old.level+1};assert.deepEqual(equipmentComparisonDetails(s,same).rows,[]);assert.deepEqual(equipmentComparisonDetails(s,same).limits,[]);assert(!equipmentComparisonHint(s,same).hasOmitted);
 const snapshot=structuredClone(s);let count=0;
 for(const e of CATALOG_BY_ID.values()){
  const candidate=item(e.id,'i9999'),details=equipmentComparisonDetails(s,candidate);
  assert.equal(new Set(details.rows.map(r=>r.key)).size,details.rows.length);for(const row of details.rows){assert(Number.isFinite(row.before)&&Number.isFinite(row.after));assert.notEqual(row.before,row.after);assert(['percent','maxHp','reduction','multiplier','integer'].includes(row.unit));assert(['included','approximate','omitted'].includes(row.coverage));}count++;
 }
 assert.equal(count,1536);assert.deepEqual(s,snapshot);
});
