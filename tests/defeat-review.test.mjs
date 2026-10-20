import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canAct,transition,equippedIds,stats,newGame} from '../src/engine.js';
import {TALENTS} from '../src/content.js';
import {decodeSave,encodeSave,validateSave} from '../src/storage.js';
import {defeatReview} from '../src/defeat-review.js';
import {defeatReviewView,center,primaryAction} from '../src/views.js';

// The original constrained-policy failure is kept intact. These tests inspect
// its post-hoc choices; they do not replace it with a successful natural run.
const raw=readFileSync(new URL('../docs/iteration/evidence/round13/natural-current-round13.json.seed-23757.incomplete-save.txt',import.meta.url),'utf8');
const terminal=()=>decodeSave(raw);

test('saved defeat review reports real remaining choices without changing the full state',()=>{
 const s=terminal(),before=encodeSave(s),review=defeatReview(s);
 assert.equal(s.phase,'dead');assert.equal(s.floor,30);assert.equal(s.counters.deaths,21);
 assert.deepEqual(review.available,{weapon:47,armor:47,relic:40});
 assert.equal(review.availableItems,134);assert.equal(review.talentPoints,0);assert.equal(review.canInvest,false);
 assert.equal(review.enemyName,'裂星守望');assert.equal(review.turns,18);
 assert.equal(review.enemyHp,172884);assert.equal(review.enemyMaxHp,582011);
 assert.deepEqual(review.lastRoll,{hpDamage:24547,retaliation:212});
 assert.equal(review.warning,s.enemy.warning);assert.equal(review.counterplay,s.enemy.counterplay);assert.equal(review.phaseNote,s.enemy.phaseNote);
 const html=defeatReviewView(s);
 assert.match(html,/134/);assert.match(html,/当前没有未用天赋点/);
 assert.match(html,/data-slot="armor" data-reset-rarity="true"/);
 assert.match(html,/data-slot="" data-reset-rarity="true"/);
 assert.equal(center(s,{view:'game'}),html);
 assert.equal(primaryAction(s,{view:'game'}).type,'retry');
 assert.equal(encodeSave(s),before);
});

test('locked alternatives remain wearable and unavailable talent nodes do not promise investment',()=>{
 const s=terminal(),ids=new Set(equippedIds(s));
 for(const item of s.player.items)if(!ids.has(item.id))item.locked=true;
 s.player.talentPoints=7;
 for(const [id,definition]of Object.entries(TALENTS))s.player.talents[id]=definition.cap;
 const review=defeatReview(s),html=defeatReviewView(s);
 assert.equal(review.availableItems,134);assert.equal(review.canInvest,false);
 assert.equal(s.player.items.filter(item=>canAct(s,{type:'equip',id:item.id})).length,134);
 assert.match(html,/当前可用节点已达上限或尚未解锁/);assert.doesNotMatch(html,/>投入天赋</);
});

test('empty inventory alternatives and missing historical roll records have truthful fallbacks',()=>{
 const s=terminal(),ids=new Set(equippedIds(s));
 s.player.items=s.player.items.filter(item=>ids.has(item.id));s.lastRoll=null;s.player.talentPoints=2;
 const review=defeatReview(s),html=defeatReviewView(s);
 assert.equal(review.availableItems,0);assert.equal(review.canInvest,true);assert.equal(review.lastRoll,null);
 assert.match(html,/暂时没有未装备的物品/);assert.match(html,/>投入天赋</);
 assert.doesNotMatch(html,/>调整防具</);assert.doesNotMatch(html,/>最后一掷</);
 assert.equal(defeatReview(newGame(7919)),null);assert.equal(defeatReviewView(newGame(7919)),'');
});

test('enemy descriptions are escaped and unknown saved fields survive a read-only review',()=>{
 const s=terminal();s.enemy.name='<img src=x onerror="alert(1)">';
 s.enemy.warning='<script>warning</script>';s.enemy.counterplay='"<counter>"';s.enemy.phaseNote="<phase '&'>";
 s.futureFields={keep:{nested:['<unknown>',17]}};const before=JSON.stringify(s),html=defeatReviewView(s);
 assert.doesNotMatch(html,/<img|<script>|<counter>|<phase/);
 assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;warning/);assert.match(html,/&lt;counter&gt;/);
 assert.equal(JSON.stringify(s),before);
});

test('unknown structured description fields are preserved without becoming visible object text',()=>{
 const s=terminal();s.enemy.warning={future:['keep',17]};s.enemy.counterplay=['future','instructions'];s.enemy.phaseNote={nested:{keep:true}};
 const before=encodeSave(s),review=defeatReview(s),html=defeatReviewView(s);
 assert(validateSave(s));
 assert.equal(review.warning,s.enemy.label);assert.equal(review.counterplay,'');assert.equal(review.phaseNote,'');
 assert.doesNotMatch(html,/\[object Object\]|future,instructions|<b>换相<\/b>|<b>应对<\/b>/);
 assert.match(html,/每三回合重筑最大生命 5% 的护盾/);
 assert.equal(encodeSave(s),before);assert.deepEqual(decodeSave(before),s);
});

test('death and current-boss retry permit gear changes but cannot open paid rooms',()=>{
 const s=terminal(),before=encodeSave(s),retry=transition(s,{type:'retry'});
 for(const state of [s,retry]){
  assert(canAct(state,{type:'equip',id:'i123'}));
  for(const action of [{type:'forge',id:'i142'},{type:'buy',id:'heal'},{type:'event-choice',id:'reset',confirmed:true},{type:'fuse',targets:['i127'],materials:['i123']},{type:'next'}]){
   assert.equal(!!canAct(state,action),false,JSON.stringify(action));assert.strictEqual(transition(state,action),state);
  }
 }
 assert.equal(retry.rng,s.rng);assert.equal(retry.player.gold,37464);assert.equal(retry.player.hp,stats(retry).maxHp);
 assert.deepEqual(retry.player.items,s.player.items);assert.deepEqual(retry.player.talents,s.player.talents);
 assert.equal(encodeSave(s),before);assert.doesNotMatch(defeatReviewView(s),/data-action="(?:forge|buy|fuse|event-choice)"/);
});

test('same natural terminal save retains the losing control and two legal single-armor recoveries',()=>{
 const original=terminal(),before=encodeSave(original),rows=[];
 for(const id of [null,'i123','i111']){
  let s=terminal();
  if(id){const next=transition(s,{type:'equip',id});assert.notStrictEqual(next,s);assert.equal(next.player.hp,0);assert.equal(next.rng,s.rng);s=next;}
  s=transition(s,{type:'retry'});assert.equal(s.rng,3380821009);assert.equal(s.player.gold,37464);
  let rolls=0;while(s.phase==='combat'&&rolls<256){s=transition(s,{type:'roll'});rolls++;}
  assert(validateSave(s));assert.deepEqual(decodeSave(encodeSave(s)),s);
  rows.push({id,rolls,phase:s.phase,deaths:s.counters.deaths,enemyHp:s.enemy.hp});
 }
 assert.deepEqual(rows,[{id:null,rolls:18,phase:'dead',deaths:22,enemyHp:247511},{id:'i123',rolls:29,phase:'chest',deaths:21,enemyHp:0},{id:'i111',rolls:23,phase:'chest',deaths:21,enemyHp:0}]);
 assert.equal(encodeSave(original),before);assert.equal(original.counters.deaths,21);assert.equal(original.floor,30);assert.equal(original.phase,'dead');
});
