import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,diceCount,drawDice} from '../src/engine.js';
import {DICE_LEVELS} from '../src/content.js';
import {talentReadiness} from '../src/talent-readiness.js';
import {talentInspectorView,center} from '../src/views.js';
import {encodeSave,decodeSave} from '../src/storage.js';

test('dice unlock boundaries explain every covered condition without blocking investment',()=>{
 const groups={2:['resonance','pair','echo','spark','emberGuard','gildedFaces'],3:['sum','triple','jackpot','deepEcho','tripleBlade'],4:['quartet','chorusMend','diversity'],5:['choir']};
 for(const [required,ids]of Object.entries(groups))for(const id of ids){
  const s=newGame(712);s.floor=100;s.player.talentPoints=2;s.player.level=DICE_LEVELS[required-1]-1;
  const before=encodeSave(s),r=talentReadiness(s,id);assert.equal(r.available,false);assert.equal(r.required,Number(required));
  assert.match(r.message,/当前战斗中无法触发/);assert(r.message.includes(`Lv.${DICE_LEVELS[required-1]}`));
  assert.match(talentInspectorView(s,{},id),/当前战斗中无法触发/);
  const invested=transition(s,{type:'talent',id});assert.equal(invested.player.talentPoints,1);assert.equal(invested.player.talents[id],1);
  assert.equal(encodeSave(s),before);assert.deepEqual(decodeSave(encodeSave(invested)),invested);
  s.player.level=DICE_LEVELS[required-1];assert.equal(talentReadiness(s,id).available,true);
  assert.match(talentReadiness(s,id).message,/仍需掷出对应点数/);
 }
});
test('the two-dice sum example is explicit and unrelated or noncombat effects are not falsely gated',()=>{
 const s=newGame(712);s.player.level=2;s.player.talentPoints=2;
 const before=encodeSave(s),html=center(s,{view:'talents',talentInspect:'sum'});
 assert.equal(diceCount(s),2);assert.match(html,/当前最多 12 点，需要总点数至少 18/);
 assert.match(html,/第 3 颗骰在 Lv.3 解锁/);assert.match(html,/data-talent-preview="sum" data-talent-ready="false"/);
 for(const id of ['attune','omen','high','power','__proto__','missing'])assert.equal(talentReadiness(s,id),null);
 assert.equal(encodeSave(s),before);
});
test('sum readiness agrees with actual paired combat, including the first reachable roll',()=>{
 let s=newGame(713);s=transition(transition(s,{type:'fate'}),{type:'enter'});
 s.enemy.hp=s.enemy.maxHp=1000000;s.enemy.shield=0;s.player.talentPoints=2;
 for(const level of [1,2,3]){
  s.player.level=level;
  const invested=transition(s,{type:'talent',id:'sum'});
  let reached=false;
  for(let seed=1;seed<100000;seed+=97){
   s.rng=seed;invested.rng=seed;
   const values=drawDice(structuredClone(s),diceCount(s)).values,sum=values.reduce((a,b)=>a+b,0);
   if(level<3&&seed>4000)break;
   if(level===3&&sum<18)continue;
   const normal=transition(s,{type:'roll'}),boosted=transition(invested,{type:'roll'});
   assert.deepEqual(normal.lastRoll.values,boosted.lastRoll.values);
   if(sum<18)assert.equal(normal.lastRoll.total,boosted.lastRoll.total);
   else {assert(boosted.lastRoll.total>normal.lastRoll.total);reached=true;break;}
  }
  assert.equal(reached,talentReadiness(s,'sum').available);
 }
});
