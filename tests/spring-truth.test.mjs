import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,stats} from '../src/engine.js';
import {eventChoices,eventPresentation} from '../src/encounters.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

function spring(seed=7919,floor=140){
 let s=newGame(seed);s.floor=floor;s.fate=[3,4];s.player.level=70;s.player.xp=0;s.player.gold=10000;s.player.hp=Math.floor(stats(s).maxHp*.2);
 s.route=['spring','combat','rest','combat','gold','boss'].map((type,index)=>({id:`f${floor}r${index}`,type,done:false,quality:0}));s.phase='route';s.roomIndex=0;return transition(s,{type:'enter'});
}

test('spring healing and ward options explicitly top up a floor while preserving stronger shields',()=>{
 for(const seed of [7919,15838])for(const choice of ['heal','ward'])for(const shieldFraction of [0,.05,.2,.7,1.4]){
  const s=spring(seed),maxHp=stats(s).maxHp,fraction=choice==='heal'?.1:.35;s.ward=Math.floor(maxHp*shieldFraction);const snapshot=structuredClone(s),option=eventChoices(s).find(option=>option.id===choice);
  assert.match(option.reward,/护盾补足至至少/);assert.match(option.detail,/已有更高护盾会保留，不额外增加/);assert.deepEqual(s,snapshot,'preview must not mutate the pending event or RNG');
  const after=transition(s,{type:'event-choice',id:choice});assert.equal(after.ward,Math.max(s.ward,Math.floor(maxHp*fraction)));assert.equal(after.player.hp,choice==='heal'?maxHp:Math.min(maxHp,s.player.hp+Math.floor(maxHp*.35)));
  assert.match(after.event.outcome,/护盾补足至至少/);assert.match(after.event.outcome,/原有更高护盾保留/);assert.equal(after.rng,s.rng);assert.equal(after.player.gold,s.player.gold);assert.equal(after.revision,s.revision+1);
  assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);assert.strictEqual(transition(after,{type:'event-choice',id:choice}),after);
 }
});

test('legacy pending spring display stays read-only and resolved history is not rewritten',()=>{
 const s=spring();s.event.text='选择治疗或储备护盾，也可以不取泉水。';s.ward=stats(s).maxHp;const bytes=encodeSave(s),loaded=decodeSave(bytes),snapshot=structuredClone(loaded);
 const display=eventPresentation(loaded);assert(display.options.filter(option=>option.id!=='leave').every(option=>option.reward.includes('补足至至少')));assert.deepEqual(loaded,snapshot);assert.equal(encodeSave(loaded),bytes);
 const resolved=transition(loaded,{type:'event-choice',id:'heal'});resolved.event.outcome='生命已恢复，获得最大生命 10% 护盾。';const historical=encodeSave(resolved),history=decodeSave(historical);
 assert.equal(eventPresentation(history).outcome,'生命已恢复，获得最大生命 10% 护盾。');assert.equal(encodeSave(history),historical);
});

test('declining a spring retains player assets, shield and random state',()=>{
 const s=spring();s.ward=777;const before=structuredClone(s),after=transition(s,{type:'event-choice',id:'leave'});
 assert.deepEqual(after.player,before.player);assert.equal(after.ward,before.ward);assert.equal(after.rng,before.rng);assert.equal(after.event.status,'resolved');assert.equal(after.event.choice,'leave');assert(validateSave(after));
});
