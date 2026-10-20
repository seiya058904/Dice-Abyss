import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,stats,transition,canAct} from '../src/engine.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

function item(catalogId,id){
 const e=CATALOG_BY_ID.get(catalogId);assert(e);
 return {id,catalogId,slot:e.slot,rarity:e.rarity,profile:e.profile,theme:e.theme,name:e.name,level:80,levelXp:0,enhance:0,depth:140,locked:false};
}
function scene(){
 const s=newGame(7919);s.runId='synthetic-healing-settlement-regression';s.floor=140;s.player.level=80;s.fate=[3,4];
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({type,id:`f140r${i}`,quality:0,done:false}));s.roomIndex=0;s.phase='combat';
 s.player.items=[item('weapon-0-0-0','i1'),item('v5-armor-3-0-4','i2'),item('v5-relic-4-0-4','i3')];
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.nextId=4;s.player.hp=100;s.ward=0;s.rng=197975;
 s.enemy={name:'恢复结算构造对照',note:'Synthetic fixture, not a natural journey.',label:'隔离完整反击后的恢复条件',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1,turns:1,stage:1,combatRules:4};
 s.futureRecord={keep:{labels:['未知字段',17]}};s.player.items[1].futureItem={keep:[true,'old']};
 assert(validateSave(s));return s;
}
const active=['六点回生 · 已触发','合鸣归息 · 已触发'];
const inactive=['六点回生 · 未生效（本掷未存活）','合鸣归息 · 未生效（本掷未存活）'];
function rolled(s){
 const original=structuredClone(s);assert(canAct(s,{type:'roll'}));
 const next=transition(s,{type:'roll'});assert.notStrictEqual(next,s);assert.deepEqual(s,original);
 for(const value of [s,next])assert.deepEqual(decodeSave(encodeSave(value)),value);
 assert.deepEqual(next.futureRecord,s.futureRecord);assert.deepEqual(next.player.items[1].futureItem,s.player.items[1].futureItem);
 return next;
}

test('fatal retaliation records qualified healing as ineffective and leaves the hero dead',()=>{
 const s=scene();s.enemy.attack=1000000;const next=rolled(s),r=next.lastRoll;
 assert.deepEqual(r.values,[3,3,3,6,3,3]);assert.equal(next.phase,'dead');assert.equal(next.player.hp,0);assert.equal(r.killed,false);
 assert.deepEqual(r.mechanics,[...inactive,'共鸣与余光护盾 +240']);assert.equal(r.retaliation,999229);
 assert(!active.some(note=>r.mechanics.includes(note)));
});

test('surviving recovery keeps its original order and floors the combined amount only once',()=>{
 const s=scene(),st=stats(s),next=rolled(s),combined=Math.floor(st.maxHp*(st.sixthMend+st.resonanceMend));
 assert.equal(st.maxHp,9585);assert.equal(combined,383);assert.equal(Math.floor(st.maxHp*st.sixthMend)+Math.floor(st.maxHp*st.resonanceMend),382);
 assert.equal(next.player.hp,483);assert.equal(next.lastRoll.retaliation,0);assert.deepEqual(next.lastRoll.mechanics,[...active,'共鸣与余光护盾 +240']);
});

test('life drain after a shielded retaliation also blocks the survival-gated recovery',()=>{
 const s=scene();s.enemy.mechanic='cursed';s.player.hp=90;s.rng=506816;const next=rolled(s),r=next.lastRoll;
 assert.deepEqual(r.values,[1,5,1,1,2,1]);assert.equal(r.wardGain,240);assert(next.ward>0,'the immediate retaliation was shielded');
 assert.equal(next.player.hp,0);assert.equal(next.phase,'dead');assert.equal(r.retaliation,90);
 assert.deepEqual(r.mechanics,[inactive[1],'共鸣与余光护盾 +240','低点诅咒 · 流失 1% 最大生命']);
});

test('full health and a killing blow still satisfy survival without inventing extra healing',()=>{
 for(const kill of [false,true]){
  const s=scene();s.player.hp=stats(s).maxHp;if(kill)s.enemy.hp=1;
  const next=rolled(s);assert.equal(next.lastRoll.killed,kill);assert.equal(next.player.hp,stats(next).maxHp);
  assert(active.every(note=>next.lastRoll.mechanics.includes(note)));assert(!inactive.some(note=>next.lastRoll.mechanics.includes(note)));
  if(kill){assert.equal(next.phase,'chest');assert.equal(next.lastRoll.retaliation,0);}
 }
});

test('unmatched faces create no recovery record and each matching ability remains independent',()=>{
 for(const [rng,notes,hp]of [[63352,[],100],[7919,[active[0]],243],[506816,[active[1]],339]]){
  const s=scene();s.rng=rng;const next=rolled(s),healing=next.lastRoll.mechanics.filter(note=>note.startsWith('六点回生 ·')||note.startsWith('合鸣归息 ·'));
  assert.deepEqual(healing,notes);assert.equal(next.player.hp,hp);
 }
});

test('delayed notes stay between existing attack and guard notes, without leaking transient fields',()=>{
 const s=scene();s.player.talents.shatter=1;s.player.talents.lastResolve=1;s.enemy.turns=0;s.enemy.openingEcho=.25;
 const next=rolled(s),notes=next.lastRoll.mechanics;
 assert.deepEqual(notes.slice(0,5),['六刻破界 · 已触发',...active,'临界守望 · 已触发','蓄室回响 · 首掷追加主击 25%']);
 for(const field of ['recoveryKeys','recoveryIndex','recoveryNotes','abilityNoteStart']){
  assert(!Object.hasOwn(next,field));assert(!Object.hasOwn(next.lastRoll,field));
 }
});

test('an existing saved death record is retained until a new battle roll is committed',()=>{
 const s=scene();s.enemy.attack=1000000;const dead=rolled(s);
 dead.lastRoll.mechanics=dead.lastRoll.mechanics.map(note=>note===inactive[0]?active[0]:note===inactive[1]?active[1]:note);
 const old=structuredClone(dead.lastRoll),locked=transition(dead,{type:'lock',id:'i2'});
 assert.deepEqual(locked.lastRoll,old);assert.deepEqual(decodeSave(encodeSave(locked)).lastRoll,old);
 const retry=transition(locked,{type:'retry'});assert.equal(retry.lastRoll,null);assert.equal(retry.phase,'combat');
});
