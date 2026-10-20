import test from 'node:test';
import assert from 'node:assert/strict';
import {encounterTactics} from '../src/encounter-tactics.js';
import {combatModifiers,encounterReward} from '../src/encounters.js';
import {newGame,transition,stats} from '../src/engine.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
import {center} from '../src/views.js';

const enemy=(variant,turns=0)=>({name:variant?'截路金匪':'拾金掠夺者',note:'夺金窗口校验夹具',label:'已有遭遇规则',trait:'steady',type:'combat',mechanic:'bandit',variant,combatRules:4,turns,hp:9000,maxHp:10000,attack:1,shield:0,maxShield:0,stage:1});
const multisets=count=>{const out=[];const visit=(v,min)=>{if(v.length===count){out.push(v);return;}for(let n=min;n<=6;n++)visit([...v,n],n);};visit([],1);return out;};

test('bandit guide counts the imminent roll in the actual two- and three-roll reward windows',()=>{
 for(const variant of [0,1])for(const turns of [0,1,2,3,4,100])for(let count=1;count<=6;count++){
  const e=enemy(variant,turns),t=encounterTactics(e,count);
  assert(t,'live current-rules bandit has a guide');
  assert.equal(t.turn,turns+1);assert.equal(t.remaining,Math.max(0,(variant?2:3)-turns));
  assert.equal(t.lines.length,2,'damage and reward deadlines are separate rows');
  assert.equal(t.lines[0].effects.damageMultiplier,turns<2?(variant?1.15:1.25):1);
  assert.equal(t.lines[1].effects.goldMultiplier,encounterReward({...e,turns:turns+1}).goldMultiplier);
 }
});

test('the third roll of the first bandit retains double gold after opening damage has ended',()=>{
 const t=encounterTactics(enemy(0,2),1);
 assert(t);assert.equal(t.lines[0].effects.damageMultiplier,1);assert.equal(t.lines[1].effects.goldMultiplier,2);
 assert.match(t.lines[0].condition,/已结束/);assert.match(t.next,/最后一掷/);
 assert.match(t.note,/前三掷/);assert.match(t.note,/前两掷/);
});

test('the second roll is the last triple-gold chance and an expired window keeps a chest',()=>{
 const last=encounterTactics(enemy(1,1),6),expired=encounterTactics(enemy(1,2),6);
 assert(last);assert(expired);assert.match(last.next,/最后一掷/);
 assert.equal(last.lines[0].effects.damageMultiplier,1.15);assert.equal(last.lines[1].effects.goldMultiplier,3);
 assert.equal(expired.remaining,0);assert.equal(expired.lines[1].effects.goldMultiplier,1);
 assert.match(expired.lines[1].effect,/仍有宝箱/);assert.match(expired.next,/正常战利品/);
});

test('published bandit effects match real modifiers and rewards for every one-to-six-dice multiset',()=>{
 let checked=0;
 for(const variant of [0,1])for(const turns of [0,1,2,3,30])for(let count=1;count<=6;count++){
  const e=enemy(variant,turns),t=encounterTactics(e,count);assert(t);
  for(const values of multisets(count)){
   const best=Math.max(...values.map(v=>values.filter(n=>n===v).length));
   assert.equal(t.lines[0].effects.damageMultiplier,combatModifiers(e,values,best,{maxHp:1000}).damageMultiplier);
   assert.equal(t.lines[1].effects.goldMultiplier,encounterReward({...e,turns:turns+1}).goldMultiplier);
   checked++;
  }
 }
 assert.equal(checked,9230);
});

test('bandit guide leaves dead, legacy-rules and unsupported dice counts alone',()=>{
 for(const patch of [{hp:0},{combatRules:2},{combatRules:undefined}])assert.equal(encounterTactics({...enemy(1),...patch},6),null);
 for(const count of [0,7,1.5,NaN,'6'])assert.equal(encounterTactics(enemy(0),count),null);
});

test('rendered bandit guide survives a full codec round-trip without changing the state or RNG',()=>{
 for(const variant of [0,1])for(const turns of [0,1,2,3]){
  let s=newGame(21021);s.floor=2;s=transition(s,{type:'fate'});s.route[0].type='bandit';s=transition(s,{type:'enter'});
  Object.assign(s.enemy,enemy(variant,turns));s.player.hp=stats(s).maxHp;assert(validateSave(s));
  const before=structuredClone(s),restored=decodeSave(encodeSave(s)),ui={view:'game',busy:false,rolling:false};
  const html=center(restored,ui);assert.match(html,/data-tactic="bandit"/);assert.match(html,new RegExp(`data-tactic-turn="${turns+1}"`));
  assert.match(html,/完整遭遇规则/);assert.equal(html,center(s,ui));assert.deepEqual(s,before);assert.deepEqual(restored,before);
 }
});

test('bandit guide uses only the public enemy state and never samples randomness',()=>{
 const original=Math.random;Math.random=()=>{throw Error('No forecast is permitted');};
 try{for(const variant of [0,1]){
  const e=Object.freeze(enemy(variant,1));
  const guarded=new Proxy(e,{get(target,key){if(key==='rng')throw Error('No RNG access is permitted');return target[key];}});
  assert(encounterTactics(guarded,6));assert.equal(e.turns,1);
 }}finally{Math.random=original;}
});

test('an old saved bandit note is corrected at presentation without rewriting its raw history',()=>{
 let s=newGame(21021);s.floor=2;s=transition(s,{type:'fate'});s.route[0].type='bandit';s=transition(s,{type:'enter'});
 Object.assign(s.enemy,enemy(1));
 const old='趁旅者停顿清点财物，前三击是夺回它的机会。';s.enemy.note=old;
 const raw=encodeSave(s),before=structuredClone(s),html=center(s,{view:'game',busy:false,rolling:false});
 assert(!html.includes(old));assert.match(html,/前两击是夺回它的机会/);
 assert.deepEqual(s,before);assert.equal(encodeSave(s),raw);assert.equal(decodeSave(raw).enemy.note,old);
 s.enemy.note='自定义注记：前三击 <script>不可执行</script>';
 const custom=center(s,{view:'game',busy:false,rolling:false});
 assert.match(custom,/自定义注记：前三击/);assert(!custom.includes('<script>不可执行</script>'));
 assert(custom.includes('&lt;script&gt;不可执行&lt;/script&gt;'));
});
