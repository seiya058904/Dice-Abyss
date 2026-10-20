import test from 'node:test';
import assert from 'node:assert/strict';
import {encounterTactics} from '../src/encounter-tactics.js';
import {EXTRA_BOSSES,combatModifiers,extraEnemyAttack,postRetaliation} from '../src/encounters.js';
import {newGame,transition,enemyAttack,stats,diceCount} from '../src/engine.js';
import {center} from '../src/views.js';

const mechanics=EXTRA_BOSSES.map(boss=>boss.mechanic);
const enemy=(mechanic,extra={})=>({...EXTRA_BOSSES.find(boss=>boss.mechanic===mechanic),mechanic,
 type:'boss',combatRules:4,maxHp:10007,hp:7501,maxShield:2000,shield:1400,attack:10000,turns:0,stage:1,...extra});
const multisets=count=>{
 const result=[];
 const visit=(values,min)=>{
  if(values.length===count){result.push(values);return;}
  for(let face=min;face<=6;face++)visit([...values,face],face);
 };
 visit([],1);return result;
};
const setsByCount=Array.from({length:6},(_,index)=>multisets(index+1));
// Evaluate public conditions independently, then compare every channel with the
// authoritative combat, attack and post-retaliation helpers. No guide code is
// used as the expected game rule, and simultaneous effects are not exclusive.
function matches(requirement,values){
 const counts=Array(7).fill(0);for(const face of values)counts[face]++;
 switch(requirement.kind){
  case 'always':return true;
  case 'hasFace':return counts[requirement.value]>0;
  case 'lacksFace':return counts[requirement.value]===0;
  case 'sameAtLeast':return Math.max(...counts)>=requirement.value;
  case 'allDistinct':return counts.filter(Boolean).length===values.length;
  case 'sumAtLeast':return values.reduce((sum,face)=>sum+face,0)>=requirement.value;
  case 'sumAtMost':return values.reduce((sum,face)=>sum+face,0)<=requirement.value;
  case 'highAtLeast':return values.filter(face=>face>=requirement.minFace).length>=requirement.value;
  default:assert.fail('Unknown public condition '+requirement.kind);
 }
}

test('all six established bosses have current-roll guides without widening legacy or invalid-input handling',()=>{
 assert.deepEqual(mechanics,['boss_sixseal','boss_choir','boss_tide','boss_cinder','boss_hourglass','boss_collector']);
 for(const mechanic of mechanics)for(const stage of [1,2])for(const count of [1,6]){
  const guide=encounterTactics(enemy(mechanic,{stage}),count);
  assert.equal(guide.mechanic,mechanic);assert.equal(guide.stage,stage);
  assert.equal(guide.count,count);assert.equal(guide.turn,1);assert(guide.next);
 }
 for(const mechanic of mechanics){
  for(const count of [0,7,1.5,NaN,'3'])assert.equal(encounterTactics(enemy(mechanic),count),null);
  for(const patch of [{hp:0},{hp:-1},{combatRules:1},{combatRules:2}])assert.equal(encounterTactics(enemy(mechanic,patch),3),null);
 }
 assert.equal(encounterTactics(null,3),null);assert.equal(encounterTactics(enemy('unknown'),3),null);
});

test('cyclic bosses describe the imminent roll and the following parity, including stage amplification',()=>{
 for(const turns of [0,1,2,3,4,9,100])for(const stage of [1,2]){
  const imminent=turns+1,even=imminent%2===0;
  for(const mechanic of ['boss_cinder','boss_hourglass']){
   const e=enemy(mechanic,{turns,stage}),guide=encounterTactics(e,6);
   const factor=mechanic==='boss_cinder'?(even?1.3:1):(even?1:1.25);
   assert.equal(guide.turn,imminent);
   assert.equal(guide.lines[0].effects.baseAttackMultiplier,factor);
   assert.equal(extraEnemyAttack(e,10000),Math.round(10000*factor));
   assert.equal(enemyAttack(e),extraEnemyAttack(e,e.attack*(stage===2?1.15:1)));
   assert(guide.next.includes(even?'奇数回合':'偶数回合'));
   const following=encounterTactics({...e,turns:turns+1},6);
   assert.equal(following.turn,imminent+1);
   assert.notEqual(following.lines[0].effects.baseAttackMultiplier,factor);
   if(mechanic==='boss_hourglass')assert.equal(guide.lines[0].effects.damageMultiplier,even?1.25:1);
  }
 }
});

test('six, doubles, three 4-to-6 faces, and the inclusive 13 boundary remain distinct requirements',()=>{
 const sixseal=encounterTactics(enemy('boss_sixseal'),2);
 assert(matches(sixseal.lines[0].requirement,[1,6]));assert(!matches(sixseal.lines[0].requirement,[5,5]));
 assert.deepEqual(sixseal.lines[0].effects,{damageMultiplier:1.25,attackMultiplier:1});
 assert(matches(sixseal.lines[1].requirement,[5,5]));assert.equal(sixseal.lines[1].effects.attackMultiplier,1.15);
 const choir=encounterTactics(enemy('boss_choir'),2);
 assert(matches(choir.lines[0].requirement,[1,1]));assert(matches(choir.lines[1].requirement,[1,2]));
 assert.equal(encounterTactics(enemy('boss_choir'),1).lines[0].possible,false);
 const cinder=encounterTactics(enemy('boss_cinder'),3).lines[1];
 assert.equal(cinder.requirement.minFace,4);assert(matches(cinder.requirement,[4,4,4]));
 assert(!matches(cinder.requirement,[3,5,6]));assert.equal(cinder.effects.shieldPierce,.5);
 const collector=encounterTactics(enemy('boss_collector'),3);
 assert(matches(collector.lines[0].requirement,[1,6,6]));assert(!matches(collector.lines[0].requirement,[2,6,6]));
 assert(!matches(collector.lines[1].requirement,[1,6,6]));assert(matches(collector.lines[1].requirement,[2,6,6]));
 assert.equal(encounterTactics(enemy('boss_collector'),2).lines[1].possible,false);
});

test('tide heals only after an even surviving counter and states the rounded percentage and missing-health cap',()=>{
 const st={maxHp:10007};
 for(const turns of [0,1,2,3,6,7])for(const hp of [10007,10006,9707,9706,5004,1]){
  const e=enemy('boss_tide',{turns,hp}),guide=encounterTactics(e,3),even=(turns+1)%2===0;
  const low=[6,6,5],threshold=[6,6,6];
  const lowPost=postRetaliation({...e,turns:turns+1},{values:low,best:2},st);
  assert.equal(lowPost.enemyHeal,even?Math.min(e.maxHp-e.hp,Math.ceil(e.maxHp*.03)):0);
  assert.equal(postRetaliation({...e,turns:turns+1},{values:threshold,best:3},st).enemyHeal,0);
  assert(guide.note.includes('反击结算时的缺失生命'));
  if(hp===e.maxHp)assert(guide.note.includes('当前敌方满血'));
  if(even){
   assert.equal(guide.lines[0].requirement.value,18);assert.equal(guide.lines[1].requirement.value,17);
   assert(guide.lines[1].effect.includes('3% 向上取整'));assert(guide.lines[1].effect.includes('受缺失生命限制'));assert.equal(guide.lines[1].effects.enemyHealFraction,.03);
   assert(guide.next.includes('不触发归潮回血'));
  }else{
   assert.equal(guide.lines.length,1);assert.equal(guide.lines[0].effects.preventsHeal,true);
   assert(guide.next.includes('偶数回合'));assert(guide.next.includes('3% 向上取整'));assert(guide.next.includes('受缺失生命限制'));
  }
 }
 for(const count of [1,2])assert.equal(encounterTactics(enemy('boss_tide',{turns:1}),count).lines[0].possible,false);
 assert.equal(encounterTactics(enemy('boss_tide',{turns:1}),3).lines[0].possible,true);
 assert.equal(postRetaliation(enemy('boss_tide',{turns:2,hp:0}),{values:[1],best:1},st).enemyHeal,0);
 const rounded=enemy('boss_tide',{maxHp:1001,hp:1,turns:2});
 assert.equal(postRetaliation(rounded,{values:[1],best:1},st).enemyHeal,31);
 assert(31>rounded.maxHp*.03,'The integer heal is not bounded by exactly three percent');
 for(const turns of [0,1]){
  const guide=encounterTactics({...rounded,turns},3);
  assert(guide.note.includes('3% 向上取整'));
  assert(![...guide.lines.map(row=>row.effect),guide.note,guide.next].join(' ').includes('最多 3%'));
 }
});

test('collector low-sum amplification and triple ward both remain active on the same roll',()=>{
 const e=enemy('boss_collector'),st={maxHp:10007},guide=encounterTactics(e,3);
 for(const values of [[1,1,1],[3,3,3],[4,4,4]]){
  const active=guide.lines.filter(row=>matches(row.requirement,values));
  assert.equal(active.length,2);
  assert(active.some(row=>row.effects.attackMultiplier===1.2));
  assert(active.some(row=>row.effects.wardFraction===.08));
  const result=combatModifiers(e,values,3,st);
  assert.equal(result.attackMultiplier,1.2);assert.equal(result.wardGain,800);
 }
 const high=combatModifiers(e,[5,5,5],3,st);
 assert.equal(high.attackMultiplier,1);assert.equal(high.wardGain,800);
 assert(guide.note.includes('可同时触发'));
});

test('all 923 one-to-six-dice multisets reproduce every exposed effect across six bosses, turns, phases and health caps',()=>{
 assert.deepEqual(setsByCount.map(sets=>sets.length),[6,21,56,126,252,462]);
 assert.equal(setsByCount.reduce((sum,sets)=>sum+sets.length,0),923);
 const st={maxHp:10007};let scenarios=0;
 for(const mechanic of mechanics)for(const turns of [0,1,2,3,4,7])for(const stage of [1,2])for(const hp of [10007,10006,9707,5004,1])for(let count=1;count<=6;count++){
  const e=enemy(mechanic,{turns,stage,hp}),guide=encounterTactics(e,count),possible=guide.lines.map(()=>false);
  for(const values of setsByCount[count-1]){
   const best=Math.max(...values.map(face=>values.filter(value=>value===face).length));
   const mod=combatModifiers(e,values,best,st),post=postRetaliation({...e,turns:turns+1},{values,best},st);
   const published={damageMultiplier:1,attackMultiplier:1,shieldPierce:0,wardGain:0,baseAttack:10000,enemyHeal:0};
   guide.lines.forEach((row,index)=>{
    if(!matches(row.requirement,values))return;possible[index]=true;
    for(const [key,value]of Object.entries(row.effects)){
     if(['damageMultiplier','attackMultiplier','shieldPierce'].includes(key)){
      assert.equal(mod[key],value);published[key]=value;
     }else if(key==='wardFraction'){
      published.wardGain=Math.floor(st.maxHp*value);assert.equal(mod.wardGain,published.wardGain);
     }else if(key==='baseAttackMultiplier'){
      published.baseAttack=Math.round(10000*value);assert.equal(extraEnemyAttack(e,10000),published.baseAttack);
     }else if(key==='enemyHealFraction'){
      published.enemyHeal=Math.min(e.maxHp-e.hp,Math.ceil(e.maxHp*value));assert.equal(post.enemyHeal,published.enemyHeal);
     }else if(key==='preventsHeal'){
      assert.equal(value,true);assert.equal(post.enemyHeal,0);
     }else assert.fail('Unknown published numeric effect '+key);
    }
   });
   assert.deepEqual(published,{damageMultiplier:mod.damageMultiplier,attackMultiplier:mod.attackMultiplier,
    shieldPierce:mod.shieldPierce,wardGain:mod.wardGain,baseAttack:extraEnemyAttack(e,10000),enemyHeal:post.enemyHeal},
    `${mechanic}/${turns}/${stage}/${hp}: ${values}`);
   scenarios++;
  }
  guide.lines.forEach((row,index)=>assert.equal(row.possible,possible[index],`${mechanic}: ${row.condition} with ${count} dice`));
 }
 assert.equal(scenarios,332280);
});

test('the existing combat view renders all six guides, next-roll text, stages and impossible dice conditions',()=>{
 let s=newGame(22);s.floor=50;s=transition(s,{type:'fate'});s.route[0].type='boss';s=transition(s,{type:'enter'});
 const ui={view:'game',rolling:false,forging:false,busy:false};
 assert.equal(diceCount(s),1);
 for(const mechanic of mechanics){
  s.enemy=enemy(mechanic,{turns:1,stage:2});s.player.hp=stats(s).maxHp;
  const before=structuredClone(s),html=center(s,ui),guide=encounterTactics(s.enemy,1);
  assert.match(html,/aria-label="当前一掷对策"/);assert(html.includes(`data-tactic="${mechanic}"`));
  assert.match(html,/data-tactic-turn="2"/);assert.match(html,/第 2 掷 · 1 骰 · 阶段 2 \/ 2/);
  assert(html.includes(guide.next));assert.match(html,/<details class="combat-rules">/);
  assert(!html.includes('<details class="combat-rules" open'));
  if(['boss_choir','boss_tide','boss_cinder','boss_collector'].includes(mechanic)){
   assert.match(html,/data-tactic-possible="false"/);assert.match(html,/当前仅 1 骰，无法达成此条件/);
  }
  assert.deepEqual(s,before);
 }
});

test('all six guides are deterministic, read-only and independent of RNG or any random API',()=>{
 const priorRandom=Math.random;Math.random=()=>{throw Error('Turn guidance cannot sample randomness');};
 try{
  for(const mechanic of mechanics)for(const turns of [0,1,2]){
   const e=Object.freeze(enemy(mechanic,{turns}));
   const protectedEnemy=new Proxy(e,{get(target,key){if(key==='rng')throw Error('Turn guidance cannot read RNG');return target[key];}});
   for(let count=1;count<=6;count++)assert.deepEqual(encounterTactics(protectedEnemy,count),encounterTactics(protectedEnemy,count));
   assert.equal(e.turns,turns);assert.equal(e.hp,7501);assert.equal(e.shield,1400);
  }
 }finally{Math.random=priorRandom;}
});
