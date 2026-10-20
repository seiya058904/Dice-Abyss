import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,canAct,talentPreview,stats} from '../src/engine.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

function ready(points=20){
 const s=newGame(2157919);s.floor=200;s.player.talentPoints=points;s.player.hp=20;return s;
}

test('legacy talent clicks still invest exactly one point with the original result text',()=>{
 const s=ready(),before=structuredClone(s),result=transition(s,{type:'talent',id:'power'});
 assert.deepEqual(s,before);assert.equal(result.player.talents.power,1);assert.equal(result.player.talentPoints,19);
 assert.equal(result.log[0].text,'无尽锋刃升至 1 级。');assert.equal(result.revision,s.revision+1);assert.equal(result.rng,s.rng);
});

test('batch allocation matches repeated legal single investments without healing or changing RNG',()=>{
 for(const id of ['power','vitality','critical','shatter'])for(const count of [1,5,10,'max']){
  const s=ready(17),before=structuredClone(s),preview=talentPreview(s,id,count);assert(preview);
  assert.deepEqual(s,before,'preview is pure');
  const batch=transition(s,{type:'talent',id,count});let repeated=s;
  for(let n=0;n<preview.count;n++)repeated=transition(repeated,{type:'talent',id});
  assert.deepEqual(batch.player,repeated.player);assert.deepEqual(stats(batch),stats(repeated));
  assert.equal(batch.player.hp,s.player.hp,'added capacity does not provide free healing');
  assert.equal(batch.rng,s.rng);assert.equal(batch.revision,s.revision+1);assert.equal(repeated.revision,s.revision+preview.count);
  assert.equal(batch.player.talents[id],preview.afterRank);assert.equal(batch.player.talentPoints,preview.remainingPoints);
  const normalized=structuredClone(batch);normalized.player=structuredClone(s.player);normalized.log=structuredClone(s.log);normalized.revision=s.revision;
  assert.deepEqual(normalized,s,'only the purchased talent, available points, log and revision change');
  assert(validateSave(batch));assert.deepEqual(decodeSave(encodeSave(batch)),batch);
 }
});

test('quantities respect available points, per-node caps and deep-floor unlocks',()=>{
 let s=ready(3),p=talentPreview(s,'power',10);assert.equal(p.count,3);assert(p.capped);assert.equal(transition(s,{type:'talent',id:'power',count:10}).player.talentPoints,0);
 s=ready(17);s.player.talents.critical=4;p=talentPreview(s,'critical',10);assert.equal(p.count,1);assert.equal(p.afterRank,5);assert.equal(p.remainingPoints,16);
 s.player.talents.critical=5;assert.equal(talentPreview(s,'critical','max'),null);assert.strictEqual(transition(s,{type:'talent',id:'critical',count:'max'}),s);
 s=ready(17);s.floor=29;assert(!canAct(s,{type:'talent',id:'shatter',count:'max'}));assert.strictEqual(transition(s,{type:'talent',id:'shatter',count:'max'}),s);
 s.floor=30;assert.equal(talentPreview(s,'shatter','max').count,3);
});

test('invalid quantity requests and unknown nodes cannot consume assets',()=>{
 const s=ready();
 for(const count of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,null,true,'5','all',{},[]]){
  const snapshot=structuredClone(s),action={type:'talent',id:'power',count};
  assert.equal(talentPreview(s,'power',count),null);assert(!canAct(s,action));assert.strictEqual(transition(s,action),s);assert.deepEqual(s,snapshot);
 }
 for(const id of ['missing','__proto__',null]){assert.equal(talentPreview(s,id,'max'),null);assert.strictEqual(transition(s,{type:'talent',id,count:'max'}),s);}
 s.player.talentPoints=0;assert.equal(talentPreview(s,'power','max'),null);
});

test('maximum-node purchases are bounded, atomic and preserve dead-state HP',()=>{
 let s=ready(2000000);s.player.talents.power=999997;s.phase='route';s.fate=[3,4];
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));s.roomIndex=0;
 s=transition(s,{type:'enter'});
 // Construct a lethal encounter, then enter the actual engine's death state.
 s.enemy.hp=s.enemy.maxHp=5e14;s.enemy.attack=1000000;s=transition(s,{type:'roll'});
 assert.equal(s.phase,'dead');assert.equal(s.player.hp,0);assert(validateSave(s));
 const preview=talentPreview(s,'power','max');assert.equal(preview.count,3);assert.equal(preview.afterRank,1000000);
 const after=transition(s,{type:'talent',id:'power',count:'max'});
 assert.equal(after.player.talentPoints,1999997);assert.equal(after.player.hp,0);assert.equal(after.phase,'dead');assert.equal(after.rng,s.rng);assert.equal(after.revision,s.revision+1);
 assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);
 assert.strictEqual(transition(after,{type:'talent',id:'power',count:'max'}),after);
});
