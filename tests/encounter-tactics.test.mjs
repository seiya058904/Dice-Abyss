import test from 'node:test';
import assert from 'node:assert/strict';
import {encounterTactics} from '../src/encounter-tactics.js';
import {DEEP_ENEMIES,DEEP_BOSSES} from '../src/deep-content.js';
import {combatModifiers,postRetaliation,encounterReward} from '../src/encounters.js';
import {newGame,transition,stats,enemyAttack} from '../src/engine.js';
import {center} from '../src/views.js';

const mechanics=[...new Set([...DEEP_ENEMIES,...DEEP_BOSSES].map(e=>e.mechanic))];
const enemy=(mechanic,extra={})=>({name:'规则边界夹具',note:'合成规则上下文',label:'旧规则仍可展开',mechanic,trait:'steady',type:'combat',combatRules:4,maxHp:10007,hp:7501,maxShield:2000,shield:0,attack:10000,turns:0,stage:1,wave:1,...extra});
const multisets=count=>{
 const out=[];const visit=(values,min)=>{if(values.length===count){out.push(values);return;}for(let face=min;face<=6;face++)visit([...values,face],face);};visit([],1);return out;
};
const matches=(r,v)=>{
 const counts=Array.from({length:6},(_,i)=>v.filter(n=>n===i+1).length),sum=v.reduce((a,b)=>a+b,0),different=counts.filter(Boolean).length;
 switch(r.kind){
  case 'always':return true;
  case 'oddAtLeast':return v.filter(n=>n%2).length>=r.value;
  case 'evenAtLeast':return v.filter(n=>n%2===0).length>=r.value;
  case 'distinctAtLeast':return different>=r.value;
  case 'distinctAtMost':return different<=r.value;
  case 'sameAtLeast':return Math.max(...counts)>=r.value;
  case 'sumAtLeast':return sum>=r.value;
  case 'sumAtMost':return sum<=r.value;
  case 'allDistinct':return different===v.length;
  case 'hasFace':return v.includes(r.value);
  case 'lacksFace':return !v.includes(r.value);
  case 'highAtLeast':return v.filter(n=>n>=r.minFace).length>=r.value;
  default:throw Error('unknown public condition '+r.kind);
 }
};

test('turn guide covers the 16 current deep mechanics, while leaving dead and legacy encounters alone',()=>{
 assert.equal(mechanics.length,16);
 for(const mechanic of mechanics)assert(encounterTactics(enemy(mechanic),6),mechanic);
 for(const e of [null,enemy('unknown'),enemy('parity',{hp:0}),enemy('parity',{combatRules:2}),enemy('parity',{combatRules:1})])assert.equal(encounterTactics(e,6),null);
 for(const count of [0,7,1.5,NaN,'6'])assert.equal(encounterTactics(enemy('parity'),count),null);
});

test('parity uses a strict majority of the actual dice count and exposes the next turn without predicting faces',()=>{
 for(let count=1;count<=6;count++)for(const turns of [0,1,2,100]){
  const t=encounterTactics(enemy('parity',{turns}),count),row=t.lines[0];
  assert.equal(row.requirement.value,Math.floor(count/2)+1);
  assert.equal(row.requirement.kind,(turns+1)%2?'oddAtLeast':'evenAtLeast');
  assert(t.next.includes((turns+1)%2?'偶点':'奇点'));
  assert.equal(t.turn,turns+1);assert.equal(t.count,count);
  if(count%2===0){const tied=Array.from({length:count},(_,i)=>i%2?2:1);assert.equal(matches(row.requirement,tied),false);assert(t.note.includes('各半'));}
 }
});

test('laststand and onslaught report the actual current escalation rather than a generic future percentage',()=>{
 for(const turns of [0,1,2,3,5,6,200]){
  const e=enemy('laststand',{turns}),t=encounterTactics(e,6),factor=t.lines[0].effects.baseAttackMultiplier;
  assert.equal(enemyAttack(e),Math.round(e.attack*factor));assert(factor>=.75&&factor<=1.6);
  assert(t.next.includes(turns===0?'-25%':turns===1?'+12%':turns>=5?'+60%':`+${turns*12}%`));
 }
 for(const wave of [1,2,3]){
  const e=enemy('onslaught',{wave}),t=encounterTactics(e,6);assert.equal(t.wave,wave);
  assert.equal(enemyAttack(e),Math.round(e.attack*t.lines[0].effects.baseAttackMultiplier));
  assert.equal(t.lines[1].effects.attackMultiplier,.75);
 }
 assert(encounterTactics(enemy('onslaught',{wave:3}),6).lines[0].effect.includes('40%'));
});

test('the bounty countdown includes the imminent roll and preserves the epic floor after the window closes',()=>{
 for(const turns of [0,1,2,3,9]){
  const e=enemy('bounty',{turns,type:'elite'}),t=encounterTactics(e,6),reward=encounterReward({...e,turns:turns+1});
  assert.equal(t.remaining,Math.max(0,3-turns));assert.equal(t.lines[0].effects.goldMultiplier,reward.goldMultiplier);
  assert.equal(reward.minRarity,2);assert(t.note.includes('史诗保底'));
  assert.equal(t.lines[0].effects.damageMultiplier,turns<3?1.2:1);
  if(turns===2)assert(t.next.includes('最后一掷'));
 }
});

test('stage-specific weak points use the pre-roll stage, including an imported low-HP first-stage state',()=>{
 for(const mechanic of ['abyssking','boss_infinite'])for(const stage of [1,2])for(const hp of [7501,5004,1]){
  const t=encounterTactics(enemy(mechanic,{type:'boss',stage,hp}),6);assert.equal(t.stage,stage);
  assert(t.lines[0].condition.includes(stage===1?'第一阶段':'第二阶段'));
  if(stage===1)assert(t.note.includes('出手前阶段'));
 }
});

test('every published trigger and numeric effect agrees with the real rule for all 923 one-to-six-dice multisets',()=>{
 const st={maxHp:10007};let evaluated=0;
 for(const mechanic of mechanics)for(const turns of [0,1,2,6])for(const stage of [1,2])for(let count=1;count<=6;count++){
  const e=enemy(mechanic,{turns,stage,wave:3}),t=encounterTactics(e,count),sets=multisets(count),triggered=t.lines.map(()=>false);
  for(const values of sets){
   const best=Math.max(...values.map(v=>values.filter(n=>n===v).length)),mod=combatModifiers(e,values,best,st),post=postRetaliation({...e,turns:turns+1},{values,best},st);
   t.lines.forEach((row,index)=>{
    if(!matches(row.requirement,values))return;triggered[index]=true;
    for(const [key,value]of Object.entries(row.effects)){
     const label=`${mechanic}/${turns}/${stage}/${count}: ${values}, ${key}`;
     if(['damageMultiplier','attackMultiplier','shieldPierce'].includes(key))assert.equal(mod[key],value,label);
     else if(key==='wardFraction')assert.equal(mod.wardGain,Math.floor(st.maxHp*value),label);
     else if(key==='enemyWardFraction')assert.equal(post.enemyWard,Math.ceil(e.maxHp*value),label);
     else if(key==='enemyHealFraction')assert.equal(post.enemyHeal,Math.ceil(e.maxHp*value),label);
     else if(key==='preventsHeal')assert.equal(post.enemyHeal,0,label);
     else if(key==='preventsWard')assert.equal(post.enemyWard,0,label);
     else if(key==='goldMultiplier')assert.equal(encounterReward({...e,turns:turns+1}).goldMultiplier,value,label);
     else if(key==='baseAttackMultiplier')assert.equal(enemyAttack(e),Math.round(e.attack*value),label);
     else assert.fail('unknown exposed effect '+key);
     evaluated++;
    }
   });
  }
  t.lines.forEach((row,index)=>assert.equal(row.possible,triggered[index],`${mechanic} ${row.condition}: achievable with ${count} dice`));
 }
 assert(evaluated>100000);
});

test('rendering keeps the current guide compact, publishes next-turn text in the summary and marks impossible conditions',()=>{
 let s=newGame(22);s.floor=200;s=transition(s,{type:'fate'});s.route[0].type='combat';s=transition(s,{type:'enter'});
 Object.assign(s.enemy,enemy('parity'));s.player.hp=stats(s).maxHp;
 const ui={view:'game',rolling:false,forging:false,busy:false},before=structuredClone(s),html=center(s,ui);
 assert.match(html,/aria-label="当前一掷对策"/);assert.match(html,/data-tactic-turn="1"/);
 assert.match(html,/<summary><span>下一掷改为偶点占多数。<\/span>/);assert.match(html,/完整遭遇规则/);
 assert.match(html,/<details class="combat-rules">/);assert(!html.includes('<details class="combat-rules" open'));
 assert.deepEqual(s,before);
 s.enemy=enemy('boss_origin',{type:'boss'});const limited=center(s,ui);
 assert.match(limited,/data-tactic-possible="false"/);assert.match(limited,/当前仅 1 骰，无法达成此条件/);
 s.enemy=enemy('parity',{hp:0});assert(!center(s,ui).includes('class="combat-tactics"'));
});

test('the guide never reads RNG, mutates an encounter, or uses a random API',()=>{
 const previous=Math.random;Math.random=()=>{throw Error('A guide must not sample randomness');};
 try{for(const mechanic of mechanics){const e=Object.freeze(enemy(mechanic));const t=encounterTactics(new Proxy(e,{get(target,key){if(key==='rng')throw Error('RNG cannot be read');return target[key];}}),6);assert(t);assert.equal(e.turns,0);assert.equal(e.hp,7501);}}
 finally{Math.random=previous;}
});
