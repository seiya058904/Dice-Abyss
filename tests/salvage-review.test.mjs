import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeItem,transition,compareEquipment,itemValue,GOLD_CAP} from '../src/engine.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
import {encodeSave,decodeSave,validateSave} from '../src/storage.js';
import {createSalvageReview,salvageReviewQuote} from '../src/salvage-review.js';
import {salvageReviewRows,salvageReviewSummary} from '../src/views.js';

function fixture() {
 const s=newGame(711);s.player.level=10;
 const worn=s.player.items.find(item=>item.id===s.player.equipped.weapon);
 const candidate=makeItem(s,'weapon',1);s.player.items.push(candidate);
 for(const [item,id,level]of [[worn,'weapon-4-2-1',11],[candidate,'v4-weapon-3-3-1',10]]){
  const entry=CATALOG_BY_ID.get(id);Object.assign(item,{catalogId:id,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,level,levelXp:0,enhance:0});
 }
 candidate.extra={keep:['original',17]};assert(validateSave(s));return {s,worn,candidate};
}
test('a lower base score can be a damage upgrade and the review discloses that tradeoff',()=>{
 const {s,worn,candidate}=fixture(),before=encodeSave(s),review=createSalvageReview(s);
 assert(itemValue(candidate)<itemValue(worn));assert.equal(compareEquipment(s,candidate).delta,11);
 assert(review.items.includes(candidate));
 const html=salvageReviewRows(s,review.items,review.selected);
 assert.match(html,/基础伤害估值 \+11%/);assert.match(html,/穿盾需权衡/);assert.match(html,/4 点伤害/);
 assert.match(html,new RegExp(`data-salvage-select="${candidate.id}" checked`));
 assert.equal(encodeSave(s),before,'rendering changes no inventory, RNG or saved history');
});
test('excluding a candidate preserves its full data while the selected quote commits once',()=>{
 const {s,candidate}=fixture(),extra=makeItem(s,'weapon',0);extra.level=1;s.player.items.push(extra);
 const before=encodeSave(s),review=createSalvageReview(s);review.selected.delete(candidate.id);
 const quote=salvageReviewQuote(review,s);assert.deepEqual(quote.ids,[extra.id]);
 const after=transition(s,{type:'salvage',ids:quote.ids,allowOverflow:!!quote.overflow});
 assert.deepEqual(after.player.items.find(item=>item.id===candidate.id),candidate);
 assert.equal(after.player.gold,s.player.gold+quote.gold);assert.equal(after.rng,s.rng);
 assert.deepEqual(decodeSave(encodeSave(after)),after);assert.equal(encodeSave(s),before);
 assert.strictEqual(transition(after,{type:'salvage',ids:quote.ids}),after);
});
test('empty selections, overflow, unknown IDs and replaced snapshots cannot reuse a stale quote',()=>{
 const {s,candidate}=fixture();s.player.gold=GOLD_CAP-1;
 const review=createSalvageReview(s),full=salvageReviewQuote(review,s);
 assert.equal(full.gold,1);assert(full.overflow>0);assert.match(salvageReviewSummary(s,full,review.items.length),/溢出金币/);
 review.selected.clear();review.selected.add('i99999');
 const empty=salvageReviewQuote(review,s);assert.equal(empty.ids.length,0);assert.equal(empty.gold,0);assert.equal(empty.overflow,0);
 assert.match(salvageReviewSummary(s,empty,review.items.length),/请至少选择一件/);
 review.selected.add(candidate.id);
 assert.equal(salvageReviewQuote(review,structuredClone(s)),null);
 assert.equal(salvageReviewQuote(review,transition(s,{type:'lock',id:candidate.id})),null);
});
