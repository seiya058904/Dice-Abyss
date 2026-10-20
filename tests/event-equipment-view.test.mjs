import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {eventChoices} from '../src/encounters.js';
import {eventReferenceRoles} from '../src/event-references.js';
import {eventItemsView,eventChoiceCost,center,esc} from '../src/views.js';
import {eventFixture} from '../scripts/audit-event-context.mjs';

function fixture(key){
 for(let seed=1;seed<=300;seed++){
  const s=eventFixture({E,S},['silent_anvil','hollow_scale','relic_exchange'].includes(key)?'mystery':key,{seed,floor:140,rich:true});
  if(s.event.key===key)return s;
 }
 throw Error(`Missing seeded entry for ${key}`);
}
const submit=(s,id)=>E.transition(s,{type:'event-choice',id,confirmed:true});
const cases=[['exchange','salvage'],['exchange','relic'],['relic_exchange','accept'],['silent_anvil','accept'],['offering','accept'],['relicloom','accept']];

test('all equipment payments display the exact object actually consumed by the original transaction',()=>{
 for(const [key,id]of cases){
  const s=fixture(key),before=S.encodeSave(s),choice=eventChoices(s).find(o=>o.id===id);
  assert(choice&&!choice.disabled,`${key}/${id} is reachable through event entry`);
  const offer=s.player.items.find(item=>item.id===s.event.offerId),markup=eventItemsView(s,id,{review:true});
  assert(markup.includes(`data-event-item-id="${offer.id}"`));
  assert(markup.includes(`data-event-item-role="consume"`));
  assert(markup.includes(`Lv.${offer.level}`));assert(markup.includes(`+${offer.enhance}`));
  assert(markup.includes('等级进度'));assert(!markup.includes('data-action="compare-details"'),'review cannot open a second dialog over payment');
  const after=submit(s,id);
  assert(!after.player.items.some(item=>item.id===offer.id));
  assert.equal(after.player.items.length,s.player.items.length-1);
  assert.equal(S.encodeSave(s),before);assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
 }
});

test('blank, whitespace and HTML-like equipment names retain IDs, costs and full progress without altering the save',()=>{
 for(const [key,id]of cases)for(const name of ['', '   ', '<script>bad()</script>&"']){
  const s=fixture(key),offer=s.player.items.find(item=>item.id===s.event.offerId);
  offer.name=name;offer.levelXp=17;const raw=S.encodeSave(s);
  const choice=eventChoices(s).find(o=>o.id===id),cost=eventChoiceCost(s,choice),markup=eventItemsView(s,id,{review:true});
  assert(!choice.disabled);assert(cost.includes(`Lv.${offer.level}`));assert(cost.includes(`+${offer.enhance}`));
  assert(markup.includes('17 / '));assert(!markup.includes('<script>'));assert(markup.includes(name.trim()?esc(name):`（${offer.id}）`));
  assert(!cost.includes('已不存在'));assert(!markup.includes('登记的装备已不在背包'));
  assert(!submit(s,id).player.items.some(item=>item.id===offer.id));assert.equal(S.encodeSave(s),raw);
 }
});

test('equal material and target names never merge their identities or hide retained weapon data',()=>{
 const s=fixture('silent_anvil'),offer=s.player.items.find(i=>i.id===s.event.offerId),target=s.player.items.find(i=>i.id===s.event.targetId);
 offer.name=target.name='同名装备';offer.levelXp=19;target.levelXp=23;
 const markup=eventItemsView(s,'accept'),after=submit(s,'accept');
 assert.equal((markup.match(/data-event-item-id=/g)||[]).length,2);
 assert(markup.includes(`data-event-item-id="${offer.id}"`));assert(markup.includes(`data-event-item-id="${target.id}"`));
 assert(!after.player.items.some(i=>i.id===offer.id));const retained=after.player.items.find(i=>i.id===target.id);
 assert(retained);assert.equal(retained.levelXp,23);assert.equal(retained.level,target.level);assert.equal(retained.enhance,target.enhance+2);
});

test('upgrading a registered weapon after swapping and locking still shows the original retained target',()=>{
 for(const key of ['silent_anvil','hollow_scale']){
  let s=fixture(key);const id=s.event.targetId,newWeapon=E.makeItem(s,'weapon',1);s.player.items.push(newWeapon);
  s=E.transition(s,{type:'equip',id:newWeapon.id});s=E.transition(s,{type:'lock',id});
  const raw=S.encodeSave(s),markup=eventItemsView(s,'accept');
  assert(markup.includes(`data-event-item-role="retain" data-event-item-id="${id}"`));
  assert(!markup.includes(`data-event-item-id="${newWeapon.id}"`));assert(markup.includes('已锁定 · 升级后仍保留'));
  const before=s.player.items.find(i=>i.id===id),after=submit(s,'accept'),actual=after.player.items.find(i=>i.id===id);
  assert(actual.locked);assert.equal(actual[key==='silent_anvil'?'enhance':'level'],before[key==='silent_anvil'?'enhance':'level']+(key==='silent_anvil'?2:3));
  assert.deepEqual(after.player.items.find(i=>i.id===newWeapon.id),newWeapon);assert.equal(S.encodeSave(s),raw);
 }
});

test('protected or removed materials remain readable and cannot be silently replaced by another spare',()=>{
 for(const [key,id]of cases){
  const initial=fixture(key),offerId=initial.event.offerId;
  for(const action of [{type:'lock',id:offerId},{type:'salvage',ids:[offerId]}]){
   const s=E.transition(initial,action),raw=S.encodeSave(s),markup=eventItemsView(s,id);
   const choice=eventChoices(s).find(o=>o.id===id);
   // The original exchange removes its relic-only branch when that relic is
   // gone; all other unavailable payments remain visible but disabled.
   if(key==='exchange'&&id==='relic'&&action.type==='salvage')assert.equal(choice,undefined);
   else assert(choice?.disabled);
   assert.strictEqual(submit(s,id),s);
   if(action.type==='lock'){assert(markup.includes('已锁定'));assert(markup.includes('不可作为消耗材料'));}
   else{assert(markup.includes('登记的装备已不在背包'));assert(!markup.includes('data-event-item-role="consume" data-event-item-id='));}
   assert.deepEqual(S.decodeSave(raw),s);assert.equal(S.encodeSave(s),raw);
  }
 }
});

test('missing-at-entry, leave, unrelated choices and resolved history never fabricate equipment payments',()=>{
 const s=eventFixture({E,S},'offering',{spares:false}),html=eventItemsView(s);
 assert(html.includes('入场时未登记装备'));assert(!html.includes('data-event-item-id='));
 for(const id of ['leave','not-a-choice','__proto__']){
  assert.deepEqual(eventReferenceRoles(s,id),{usesOffer:false,usesTarget:false});assert.equal(eventItemsView(s,id),'');
 }
 const resolved=submit(s,'leave');assert.equal(eventItemsView(resolved),'');assert.equal(eventItemsView(E.newGame(17)),'');
 const prayer=fixture('prayer'),choice=eventChoices(prayer).find(o=>o.id==='luck');assert.equal(eventChoiceCost(prayer,choice),choice.cost);assert.equal(eventItemsView(prayer),'');
});

test('event surface offers attribute comparison while its confirmation carries the same equipment without nested actions',()=>{
 const s=fixture('silent_anvil'),raw=S.encodeSave(s),screen=center(s,{view:'game',busy:false});
 assert(screen.includes('aria-label="本次抉择的装备"'));assert(!screen.includes('class="event-atmosphere"'));
 assert(screen.includes('查看属性与比较'));assert(!eventItemsView(s,'accept',{review:true}).includes('data-action='));
 const option=eventChoices(s).find(o=>o.id==='accept');assert(screen.includes(esc(eventChoiceCost(s,option))));
 assert.equal(S.encodeSave(s),raw);
});
