import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=process.env.QA_GOLD_ROOT?pathToFileURL(process.env.QA_GOLD_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const C=await import(new URL('src/encounters.js',root));
const S=await import(new URL('src/storage.js',root));
function exchange(level,xp,gold=E.GOLD_CAP){
 let s=E.newGame(7919);s.runId='gold-xp-boundary';s.floor=140;s.player.level=level;s.player.xp=xp;s.player.gold=gold;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=['exchange','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';s.player.items.push(E.makeItem(s,'weapon',1));
 s=E.transition(s,{type:'enter'});assert(S.validateSave(s));return s;
}
const selected=s=>C.eventChoices(s).find(choice=>choice.id==='salvage');
const accept=s=>E.transition(s,{type:'event-choice',id:'salvage',confirmed:true});

test('fully capped gold and XP disclose two zero receipts before permanently consuming the offered item',()=>{
 const before=exchange(1e6,1e8),option=selected(before),after=accept(before);
 assert(!option.disabled);assert.equal(after.player.gold,before.player.gold);assert.equal(after.player.xp,before.player.xp);assert.equal(after.player.level,before.player.level);
 assert(option.reward.includes('经验可计入 0（原额 1000000，上限未计入 1000000）'));assert(option.confirm.includes('经验可计入 0'));
 assert(option.confirm.includes('两项入账均为 0'));assert(option.confirm.includes('仍会永久消耗'));
 assert(after.event.outcome.includes('经验计入 0（原额 1000000，上限未计入 1000000）'));assert(after.event.outcome.includes('两项入账均为 0'));assert(after.event.outcome.includes('已永久消耗'));
 assert(!after.player.items.some(item=>item.id===before.event.offerId));assert(S.validateSave(after));assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
});

test('partially full XP names admitted experience rather than claiming the full million',()=>{
 for(const gold of [0,E.GOLD_CAP]){
  const before=exchange(1e6,1e8-10,gold),option=selected(before),after=accept(before);
  assert.equal(after.player.xp-before.player.xp,10);assert.equal(after.player.level,1e6);
  assert(option.reward.includes('经验可计入 10（原额 1000000，上限未计入 999990）'));assert(option.confirm.includes('经验可计入 10'));
  assert(after.event.outcome.includes('经验计入 10（原额 1000000，上限未计入 999990）'));assert(S.validateSave(after));
 }
});

test('experience admitted before level-ups is not mistaken for the final XP counter difference',()=>{
 const before=exchange(100,E.xpNeeded(100)-1),after=accept(before),raw=540;
 assert.equal(after.player.level,101);assert.equal(after.player.xp,raw-1);assert.notEqual(after.player.xp-before.player.xp,raw);
 assert(selected(before).reward.includes('540 经验'));assert(after.event.outcome.includes('获得 540 经验'));
 assert(S.validateSave(after));assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
});

test('XP clipping is computed before conversion even when an imported large XP balance levels up',()=>{
 const before=exchange(100,1e8-10),after=accept(before);
 assert(after.player.level>100);assert(after.player.xp<before.player.xp,'stored XP is spent by existing level conversion');
 assert(selected(before).reward.includes('经验可计入 10（原额 540，上限未计入 530）'));assert(after.event.outcome.includes('经验计入 10（原额 540，上限未计入 530）'));
 assert(S.validateSave(after));
});

test('fully capped XP with room for gold keeps the valid gold receipt and explicit zero new XP',()=>{
 const before=exchange(1e6,1e8,0),after=accept(before),option=selected(before);
 assert.equal(after.player.gold-before.player.gold,before.event.costGold);assert.equal(after.player.xp,before.player.xp);
 assert(option.reward.includes(`金币可收 ${before.event.costGold}`));assert(option.reward.includes('经验可计入 0'));assert(!option.confirm.includes('两项入账均为 0'));
 assert(after.event.outcome.includes(`金币实收 ${before.event.costGold}`));assert(after.event.outcome.includes('经验计入 0'));assert(S.validateSave(after));
});
