import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {eventChoices,eventPresentation} from '../src/encounters.js';
import {center,memorywellPreviewView} from '../src/views.js';
import {MAX_ITEM_LEVEL} from '../src/equipment.js';
import {eventFixture} from '../scripts/audit-event-context.mjs';

// Synthetic, validator-accepted event states; all reset/allocation actions below
// are the real engine transactions. These are not natural-play incidence data.
function well({hp=null,vitality=5,points=7,gold=100000,scars=0,change}={}){
 return eventFixture({E,S},'memorywell',{beforeEnter:s=>{
  s.player.gold=gold;s.player.pactScars=scars;s.player.talentPoints=vitality+points;
  if(vitality)s=E.transition(s,{type:'talent',id:'vitality',count:vitality});
  if(change)s=change(s)||s;
  s.player.hp=hp??E.stats(s).maxHp;return s;
 }});
}
const reset=s=>E.transition(s,{type:'event-choice',id:'reset',confirmed:true});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function verifyProjection(s){
 const before=S.encodeSave(s),p=E.memorywellPreview(s),choice=eventChoices(s).find(o=>o.id==='reset');
 assert(p);assert.equal(p.canReset,!choice.disabled);assert.equal(p.costGold,s.event.costGold);
 assert.equal(S.encodeSave(s),before);assert(S.validateSave(s));assert.deepEqual(S.decodeSave(before),s);
 const after=reset(s);
 if(p.canReset){
  assert.notStrictEqual(after,s);assert(S.validateSave(after));
  assert.deepEqual(p.after,{hp:after.player.hp,maxHp:E.stats(after).maxHp,gold:after.player.gold,talentPoints:after.player.talentPoints});
  assert.equal(p.hpLost,s.player.hp-after.player.hp);assert.equal(p.refundPoints,after.player.talentPoints-s.player.talentPoints);
  assert.equal(after.rng,s.rng);assert.deepEqual(after.player.items,s.player.items);assert.deepEqual(after.player.equipped,s.player.equipped);
  assert.equal(after.ward,s.ward);assert.equal(after.event.costGold,s.event.costGold);assert.strictEqual(reset(after),after);
  assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
 }else{assert.strictEqual(after,s);assert.equal(p.after.gold,null);assert.equal(p.reason,choice.reason);}
 assert.equal(S.encodeSave(s),before);return p;
}

test('memorywell preview shows the exact full-health clip, recorded price and refunded plus unspent points',()=>{
 const s=well(),p=verifyProjection(s);
 assert.deepEqual(p,{canReset:true,reason:'',costGold:310,goldShortfall:0,refundPoints:5,hpLost:117,
  before:{hp:584,maxHp:584,gold:100000,talentPoints:7},after:{hp:467,maxHp:467,gold:99690,talentPoints:12}});
 assert.strictEqual(E.transition(s,{type:'event-choice',id:'reset'}),s,'preview never supplies confirmation');
});

test('wounded and exactly-at-new-cap life remain unchanged and are never described as a loss',()=>{
 for(const hp of [1,100,467]){
  const s=well({hp}),p=verifyProjection(s),html=memorywellPreviewView(s);
  assert.equal(p.after.hp,hp);assert.equal(p.hpLost,0);assert.equal(p.after.maxHp,467);
  assert.match(html,/当前生命保留/);assert(!html.includes('memorywell-loss'));
  assert.match(html,/重置与重新加点都不会恢复当前生命/);
 }
});

test('clearing other talents without vitality refunds points without inventing a life reduction',()=>{
 const s=well({vitality:0,points:37,change:s=>E.transition(s,{type:'talent',id:'power',count:30})});
 const p=verifyProjection(s);assert.equal(p.refundPoints,30);assert.equal(p.before.talentPoints,7);assert.equal(p.after.talentPoints,37);
 assert.equal(p.before.maxHp,p.after.maxHp);assert.equal(p.before.hp,p.after.hp);assert.equal(p.hpLost,0);
});

test('preview stays read-only with a deeply frozen state, repeated rendering and existing boons',()=>{
 const s=well();s.ward=100000;s.v5Boons={echo:1,ward:1};s.nextLuck=15;s.eventLuck=8;
 assert(S.validateSave(s));const bytes=S.encodeSave(s);freeze(s);
 const expected=E.memorywellPreview(s),html=memorywellPreviewView(s);
 for(let i=0;i<3;i++){assert.deepEqual(E.memorywellPreview(s),expected);assert.equal(memorywellPreviewView(s),html);center(s,{view:'game',busy:false});}
 assert.equal(S.encodeSave(s),bytes);verifyProjection(s);
});

test('pending-well armor swaps update both life limits while preserving the original quote and current HP',()=>{
 const low=well(),high=E.transition(low,{type:'equip',id:'i6'}),back=E.transition(high,{type:'equip',id:'i2'});
 assert.notStrictEqual(high,low);assert.equal(high.player.hp,low.player.hp);assert.equal(high.event.costGold,low.event.costGold);
 const a=verifyProjection(low),b=verifyProjection(high),c=verifyProjection(back);
 assert(b.before.maxHp>a.before.maxHp);assert(b.after.maxHp>a.after.maxHp);assert.equal(b.hpLost,0);assert.equal(b.after.hp,584);
 assert.deepEqual(c,a);assert.equal(high.event.costGold,310);
});

test('points invested after entering the well are reflected without healing or repricing it',()=>{
 const original=well(),changed=E.transition(original,{type:'talent',id:'vitality',count:5});
 assert.equal(changed.player.hp,original.player.hp);assert.equal(changed.event.costGold,original.event.costGold);
 const before=verifyProjection(original),after=verifyProjection(changed);
 assert.equal(after.refundPoints,before.refundPoints+5);assert.equal(after.before.talentPoints,before.before.talentPoints-5);
 assert.equal(after.after.talentPoints,before.after.talentPoints);assert(after.before.maxHp>before.before.maxHp);
 assert.equal(after.after.hp,before.after.hp);assert.equal(after.after.maxHp,before.after.maxHp);
});

test('permanent scars and non-round equipment values use the real stats rounding and health cap',()=>{
 for(const scars of [1,3,5]){
  const s=well({scars}),p=verifyProjection(s);assert(p.after.maxHp<467);assert(p.hpLost>0);
  assert.equal(p.before.maxHp,E.stats(s).maxHp);
 }
 const huge=well({vitality:1000000,points:0,change:s=>{
  for(const item of s.player.items){item.level=MAX_ITEM_LEVEL;item.levelXp=0;}
 }}),p=verifyProjection(huge);
 assert.equal(p.before.maxHp,1e15);assert(p.after.maxHp>1e9);assert(p.after.maxHp<=1e15);
});

test('legacy pending prices are quoted exactly, including free and capped-price valid records',()=>{
 for(const price of [0,17,100000000]){
  const s=well({gold:10000000000});s.event.costGold=price;
  const loaded=S.decodeSave(S.encodeSave(s)),p=verifyProjection(loaded);
  assert.equal(p.costGold,price);assert.equal(p.after.gold,10000000000-price);
  assert(memorywellPreviewView(loaded).includes(`支付 ${price.toLocaleString('en-US')} 金币`));
 }
});

test('unaffordable, empty and over-cap offers remain disabled and never show a fictitious settled balance',()=>{
 const poor=well({gold:309}),empty=well({vitality:0}),over=well({vitality:8});over.player.talentPoints=2000000;
 for(const s of [poor,empty,over]){
  const p=verifyProjection(s),html=memorywellPreviewView(s);assert.equal(p.canReset,false);assert.equal(p.after.gold,null);
  assert.match(html,/当前无法重置/);assert.match(html,/无法提交/);assert.strictEqual(reset(s),s);
  assert.match(html,/以下仅为清空天赋后的数值对照，当前无法提交/);assert.match(html,/清空天赋后的理论数值/);
  assert(!html.includes('memorywell-refund'));assert(!html.includes('memorywell-loss'));assert(!html.includes('重置后'));
  const left=E.transition(s,{type:'event-choice',id:'leave'});assert.notStrictEqual(left,s);assert.deepEqual(left.player,s.player);assert.equal(left.rng,s.rng);
 }
 assert.equal(E.memorywellPreview(poor).goldShortfall,1);assert.match(memorywellPreviewView(poor),/还差 1 金币/);
 assert.equal(E.memorywellPreview(over).after.talentPoints,2000008);assert.match(memorywellPreviewView(over),/2,000,008/);
});

test('the exact unspent-point cap can be reached, and reallocation never restores clipped life',()=>{
 const s=well();s.player.talentPoints=1999995;const p=verifyProjection(s);assert.equal(p.after.talentPoints,2000000);assert(p.canReset);
 const paid=reset(s),restored=E.transition(paid,{type:'talent',id:'vitality',count:5});
 assert.equal(E.stats(restored).maxHp,p.before.maxHp);assert.equal(restored.player.hp,p.after.hp);assert.equal(restored.player.gold,p.after.gold);
 assert.equal(restored.rng,s.rng);assert(S.validateSave(restored));
});

test('the room and confirmation fragment expose all four exact values without compact-number rounding',()=>{
 const s=well({gold:10000000000,vitality:1000000,points:0,change:s=>{
  for(const item of s.player.items){item.level=MAX_ITEM_LEVEL;item.levelXp=0;}
 }}),p=verifyProjection(s),html=memorywellPreviewView(s),room=center(s,{view:'game',busy:false});
 for(const key of ['hp','maxHp','talentPoints','gold']){
  assert(html.includes(`data-memorywell-row="${key}"`));assert(html.includes(p.before[key].toLocaleString('en-US')));assert(html.includes(p.after[key].toLocaleString('en-US')));
 }
 assert(!/NaN|undefined/.test(html));assert(room.includes(html));assert(!room.includes('class="event-atmosphere"'));
 assert.match(html,/重置前/);assert.match(html,/重置后/);assert.match(html,/data-can-reset="true"/);
});

test('resolved history, other events and non-event phases never receive a new reset preview',()=>{
 const pending=well();
 for(const s of [reset(pending),E.transition(pending,{type:'event-choice',id:'leave'})]){
  const bytes=S.encodeSave(s),event=eventPresentation(s),html=center(s,{view:'game',busy:false});
  assert.equal(E.memorywellPreview(s),null);assert.equal(memorywellPreviewView(s),'');assert(!html.includes('data-memorywell-preview'));
  assert.equal(event.body,s.event.text);assert.equal(event.outcome,s.event.outcome);assert.deepEqual(event.options,[]);assert.equal(S.encodeSave(s),bytes);
 }
 for(const s of [E.newGame(7919),eventFixture({E,S},'bloodwell'),{...pending,phase:'route'},null]){
  assert.equal(E.memorywellPreview(s),null);assert.equal(memorywellPreviewView(s),'');
 }
});
