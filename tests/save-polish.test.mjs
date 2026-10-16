import test from 'node:test';
import assert from 'node:assert/strict';
import {stats,transition} from '../src/engine.js';
import {decodeSave,encodeSave,migrateSave,validateSave} from '../src/storage.js';
import {itemValue,legacyItemValue} from '../src/equipment.js';

function oldSnapshot(version=2,rolled=false){
 const items=['weapon','armor','relic'].map((slot,i)=>({id:`i${i+1}`,slot,rarity:2,depth:20,enhance:10,growth:100,locked:false,catalogId:`${slot}-0-0-2`,profile:0,theme:0,name:`旧版${slot}`}));
 if(version===1)for(const item of items)for(const key of ['catalogId','theme','profile','growth','locked'])delete item[key];
 return {version,runId:`old-save-fixture-${version}-${rolled}`,revision:8,rng:4958585,nextId:4,floor:10,phase:'combat',roomIndex:0,fate:[3,3],
  route:['boss','chest','forge','merchant','combat','boss'].map((type,i)=>({id:`f10r${i}`,type,quality:0,done:false})),
  enemy:{name:'旧版已提交首领',note:'保留旧战斗。',label:'半血增强反击',trait:'rage',type:'boss',hp:1000000-(rolled?123:0),maxHp:1000000,attack:1,shield:0,maxShield:0,turns:rolled?1:0},
  chest:null,loot:null,shop:[],lastForge:null,lastRoll:rolled?{values:[4,5],best:1,critical:false,follow:false,main:123,extra:0,total:123,absorbed:0,hpDamage:123,retaliation:0,killed:false}:null,
  log:[],completed:false,counters:{rolls:rolled?1:0,kills:0,chests:0,deaths:0,highestDamage:rolled?123:0,bosses:0},
  player:{level:1000,xp:0,hp:200,gold:600,talentPoints:0,talents:{high:3,resonance:2,critical:1},items,equipped:{weapon:'i1',armor:'i2',relic:'i3',...(version===1?{}:{relic2:null,relic3:null})}}};
}
function boss(rules=2){
 const s=migrateSave(oldSnapshot());s.player.hp=stats(s).maxHp;
 Object.assign(s.enemy,{hp:100,maxHp:100,attack:1,shield:0,maxShield:12,trait:'rage',combatRules:rules,stage:1});
 return s;
}
function oldEnvelope(state){
 const payload=JSON.stringify(state);let hash=2166136261;
 for(let index=0;index<payload.length;index++)hash=Math.imul(hash^payload.charCodeAt(index),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,payload,checksum:(hash>>>0).toString(16)});
}

test('actual old V1, V2 and V3 equipment migrates while committed combat snapshots keep enemy, dice and RNG',()=>{
 for(const version of [1,2,3])for(const rolled of [false,true]){
  const original=oldSnapshot(version,rolled);
  const expected=migrateSave(original),restored=decodeSave(oldEnvelope(original));
  assert.deepEqual(restored,expected);assert.deepEqual(restored.enemy,original.enemy);
  original.player.items.forEach((item,i)=>{assert.equal(restored.player.items[i].id,item.id);assert.equal(itemValue(restored.player.items[i]),legacyItemValue(item));assert.equal(restored.player.items[i].legacy,true);});
  assert.deepEqual(restored.lastRoll,original.lastRoll);assert.equal(restored.rng,original.rng);
  assert.equal(restored.enemy.combatRules,undefined);assert.equal(restored.enemy.stage,undefined);
  assert.deepEqual(decodeSave(encodeSave(restored)),restored);
 }
});

test('new enemy and roll fields accept only their narrow optional types and numeric bounds',()=>{
 const entered=boss(),rolled=transition(entered,{type:'roll'});
 for(const [target,key,values] of [
  ['enemy','combatRules',[null,0,1,3,'2',true,{},NaN,Infinity]],
  ['enemy','stage',[null,0,3,1.5,'1',true,{},NaN,Infinity]],
  ['lastRoll','phaseChanged',[null,0,1,'false',{},[]]],
  ['lastRoll','guarded',[null,-1,.5,'0',true,{},NaN,Infinity,Number.MAX_SAFE_INTEGER+1]],
 ])for(const value of values){
  const bad=structuredClone(rolled);bad[target][key]=value;
  assert.equal(validateSave(bad),false,`${key} rejects ${String(value)}`);
  assert.throws(()=>encodeSave(bad),/存档状态不完整/);
 }
 for(const stage of [1,2])for(const phaseChanged of [true,false])for(const guarded of [0,Number.MAX_SAFE_INTEGER]){
  const accepted=structuredClone(rolled);accepted.enemy.stage=stage;accepted.lastRoll.phaseChanged=phaseChanged;accepted.lastRoll.guarded=guarded;
  assert(validateSave(accepted));assert.deepEqual(decodeSave(encodeSave(accepted)),accepted);
 }
});

test('a saved phase transition continues identically and retry saves the reset stage',()=>{
 const before=boss(),crossed=transition(before,{type:'roll'});
 assert.equal(crossed.enemy.stage,2);assert.equal(crossed.lastRoll.phaseChanged,true);assert(crossed.lastRoll.guarded>0);
 const restored=decodeSave(encodeSave(crossed));assert.deepEqual(restored,crossed);
 assert.deepEqual(transition(restored,{type:'roll'}),transition(crossed,{type:'roll'}));
 const dying=structuredClone(crossed);dying.player.hp=1;dying.player.level=1;dying.enemy.hp=dying.enemy.maxHp=100000;dying.enemy.attack=100000;
 const dead=transition(dying,{type:'roll'});assert.equal(dead.phase,'dead');
 const retried=transition(decodeSave(encodeSave(dead)),{type:'retry'});
 assert.equal(retried.enemy.stage,1);assert.equal(retried.enemy.turns,0);assert.equal(retried.lastRoll,null);
 assert.deepEqual(decodeSave(encodeSave(retried)),retried);
});

test('new rules4 allow a sufficiently strong killing blow without adding the old half-health hard gate',()=>{
 const s=boss(4),after=transition(s,{type:'roll'});
 assert.equal(after.phase,'chest');assert.equal(after.enemy.hp,0);assert.equal(after.lastRoll.guarded,0);assert.equal(after.lastRoll.retaliation,0);
 assert.deepEqual(decodeSave(encodeSave(after)),after);
});
