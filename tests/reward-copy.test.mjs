import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,stats,makeItem,resolveRoll} from '../src/engine.js';
import {eventChoices,eventPresentation,ROOM_ADDITION_DETAILS} from '../src/encounters.js';
import {ROOM_DETAILS,RARITIES,BOSSES} from '../src/content.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

function room(type,seed=7919,floor=140){
 let s=newGame(seed);s.floor=floor;s.player.level=100;s.player.hp=stats(s).maxHp;s.player.gold=1e7;s.fate=[3,4];
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));s.roomIndex=0;s.phase='route';
 if(type==='exchange'||type==='mystery')s.player.items.push(makeItem(s,'relic',1));
 return transition(s,{type:'enter'});
}

test('deep event promises describe a minimum and settlement names the actual generated rarity',()=>{
 for(const [type,seed,id]of [['gambit',285084,'safe'],['exchange',15838,'relic']]){
  const s=room(type,seed),option=eventChoices(s).find(o=>o.id===id);assert(option);assert(option.reward.startsWith('至少'));
  const before=structuredClone(s),after=transition(s,{type:'event-choice',id,confirmed:true});
  assert.deepEqual(s,before);assert.equal(after.phase,'chest');assert.equal(after.chest.item.rarity,4,'retains the original witnessed mythic outcome');
  assert(after.event.outcome.includes(RARITIES[after.chest.item.rarity].name));assert(!after.event.outcome.includes(type==='gambit'?'稀有宝箱':'史诗遗物箱'));
  assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);
 }
});

test('random gambling outcomes name their actual reward through all depth bands',()=>{
 const seen=new Set();let refund=false,lowReward=false,highReward=false;
 for(const floor of [3,29,30,50,80,140,400])for(let seed=1;seed<=80;seed++){
  const s=room('gambit',seed*7919,floor),after=transition(s,{type:'event-choice',id:'roll',confirmed:true});
  if(after.phase==='chest'){
   assert(after.event.outcome.includes(RARITIES[after.chest.item.rarity].name));assert(after.chest.item.rarity>=(after.event.roll>=5?2:1));seen.add(after.chest.item.rarity);
   if(floor<30){assert.equal(after.chest.item.rarity,after.event.roll>=5?2:1);lowReward=true;}else if(after.chest.item.rarity>=4)highReward=true;
  }else{assert(after.event.roll<=2);assert.equal(after.player.gold,s.player.gold-s.event.costGold+Math.floor(s.event.costGold/2));refund=true;}
  assert(validateSave(after));
 }
 assert(refund&&lowReward&&highReward);assert(seen.has(1)&&seen.has(2)&&seen.has(4));
});

test('early guaranteed transactions remain exact while the codex separates deep eligibility',()=>{
 const s=room('gambit',285084,29),choice=eventChoices(s).find(o=>o.id==='safe');assert.equal(choice.reward,'稀有宝箱');
 const after=transition(s,{type:'event-choice',id:'safe',confirmed:true});assert.equal(after.chest.item.rarity,1);assert.equal(after.event.outcome,'保底交易完成 · 稀有宝箱等待开启。');
 const vault=room('vault',15838);assert.equal(vault.chest.item.rarity,4);assert(ROOM_DETAILS.vault.reward.includes('1–29层'));assert(ROOM_DETAILS.vault.reward.includes('30层起'));
 const trial=room('trial');trial.enemy.hp=1;trial.enemy.shield=0;resolveRoll(trial);assert.equal(trial.chest.item.rarity,4);assert(ROOM_DETAILS.trial.reward.includes('史诗保底'));
 assert(ROOM_DETAILS.hiddenboss.reward.includes('传说保底'));assert(ROOM_ADDITION_DETAILS.hiddenboss.reward.includes('传说保底'));
 let highHidden=false;
 for(let seed=1;seed<=80&&!highHidden;seed++){const hidden=room('hiddenboss',seed*7919);hidden.enemy.hp=1;hidden.enemy.shield=0;resolveRoll(hidden);assert(hidden.chest.item.rarity>=3);highHidden=hidden.chest.item.rarity>=4;}
 assert(highHidden,'the hidden-boss guarantee allows a real higher-tier outcome');
});

test('pending legacy mystery copy is corrected without rewriting the saved event or reward',()=>{
 for(const [key,text,expected]of [
  ['relic_exchange','廊中的刻印愿收下一件旧遗物，归还一只史诗遗物宝箱。','至少史诗'],
  ['star_seal','以当前生命唤醒隐秘首领。挑战会立刻开始；击败后必得传说宝箱。','传说保底'],
 ]){
  const s=room('mystery');s.event={...s.event,key,text};const before=structuredClone(s),p=eventPresentation(s);
  assert(p.body.includes(expected));assert.deepEqual(s,before,'presentation is pure');
  const roundTrip=decodeSave(encodeSave(s));assert.deepEqual(roundTrip,s);assert.equal(eventPresentation(roundTrip).body,p.body);
 }
});

test('shielded boss instructions allow the existing legal piercing counterplay',()=>{
 const boss=BOSSES.find(b=>b.name==='骸骨君王');assert(boss.warning.includes('穿盾'));assert(!boss.warning.includes('才能削减生命'));
 let witnessed=false;
 for(let seed=1;seed<=80&&!witnessed;seed++){
  const s=room('boss',seed*7919,30);Object.assign(s.enemy,boss,{hp:1e8,maxHp:1e8,shield:2e7,maxShield:2e7,attack:1,turns:0,stage:1});
  delete s.enemy.mechanic;s.player.talents.shatter=3;resolveRoll(s);
  if(s.lastRoll.values.includes(6)){assert(s.lastRoll.hpDamage>0);assert(s.enemy.shield>0);witnessed=true;}
 }
 assert(witnessed);
});
