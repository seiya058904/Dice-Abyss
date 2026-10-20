import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../src/engine.js';
import {center} from '../src/views.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

const fixture=JSON.parse(await readFile(new URL('fixtures/round08-history-actions.json',import.meta.url),'utf8'));
const ui={view:'game',rolling:false,forging:false,busy:false};
const badgeText=s=>[...center(s,ui).matchAll(/<span class="(critical-tag|follow-tag)">([^<]+)<\/span>/g)].map(m=>m[2]);
const replay=()=>{let s=E.newGame(fixture.seed);for(const action of fixture.actions){assert(E.canAct(s,action));s=E.transition(s,action);}assert(validateSave(s));return s;};

test('a naturally reached roll records the exact factors that produced its committed damage',()=>{
 const s=replay(),r=s.lastRoll;
 assert.equal(s.floor,fixture.floor);assert.equal(s.roomIndex,fixture.roomIndex);
 assert.deepEqual(r.values,[5,6,4,5]);assert(r.critical&&r.follow);
 assert.equal(r.criticalMultiplier,1.8);assert.equal(r.followMultiplier,.35);
 assert.equal(r.main,764);assert.equal(r.extra,267);assert.equal(r.total,1031);
 assert.equal(r.extra,Math.round(r.main*r.followMultiplier));
 assert.deepEqual(badgeText(s),['暴击 ×1.8','连锁追击 +35%']);
 assert.match(center(s,ui),/第 1 掷结算/);assert.deepEqual(decodeSave(encodeSave(s)),s);
});

test('legal post-roll allocation cannot change the past critical or follow-up badges',()=>{
 const before=replay(),after=E.transition(E.transition(before,{type:'talent',id:'crush'}),{type:'talent',id:'pursuit'});
 assert.deepEqual(after.lastRoll,before.lastRoll);assert.equal(after.rng,before.rng);assert.deepEqual(after.enemy,before.enemy);
 assert.deepEqual(badgeText(after),badgeText(before));assert.deepEqual(decodeSave(encodeSave(after)),after);
 assert.equal(after.player.talents.crush,1);assert.equal(after.player.talents.pursuit,1);
});

test('legal post-roll equipment changes cannot recompute the previous factors',()=>{
 const before=replay(),candidate=before.player.items.find(i=>i.slot==='weapon'&&!E.equippedIds(before).includes(i.id));
 assert(candidate,'naturally acquired spare weapon is available');
 const after=E.transition(before,{type:'equip',id:candidate.id});assert.notStrictEqual(after,before);
 assert.deepEqual(after.lastRoll,before.lastRoll);assert.equal(after.rng,before.rng);assert.deepEqual(badgeText(after),badgeText(before));
 assert.deepEqual(decodeSave(encodeSave(after)),after);
});

test('new rolls use current factors while legacy results omit unknown ratios and preserve their real numbers',()=>{
 const legacy=replay();delete legacy.lastRoll.criticalMultiplier;delete legacy.lastRoll.followMultiplier;
 assert(validateSave(legacy));const restored=decodeSave(encodeSave(legacy));
 assert.deepEqual(badgeText(restored),['暴击','连锁追击']);assert.match(center(restored,ui),/主击 <b>764<\/b>/);assert.match(center(restored,ui),/追击 <b>\+267<\/b>/);
 const allocated=E.transition(E.transition(restored,{type:'talent',id:'crush'}),{type:'talent',id:'pursuit'});
 assert.deepEqual(badgeText(allocated),['暴击','连锁追击']);
 const next=E.transition(allocated,{type:'roll'}),r=next.lastRoll,st=E.stats(allocated);
 assert.equal(r.criticalMultiplier,r.critical?1.8+allocated.player.talents.crush*.1+st.critDamage:1);
 assert.equal(r.followMultiplier,r.follow?.35+allocated.player.talents.pursuit*.08+st.followDamage:0);
 assert.deepEqual(decodeSave(encodeSave(next)),next);
});

test('badge precision retains authored fractional factors without exposing invalid or moving values',()=>{
 const s=replay();s.lastRoll.criticalMultiplier=2.1792;s.lastRoll.followMultiplier=.4896;
 assert.deepEqual(badgeText(s),['暴击 ×2.1792','连锁追击 +48.96%']);
 for(const value of [undefined,null,'1.8',NaN,Infinity,-1,0]){
  s.lastRoll.criticalMultiplier=value;s.lastRoll.followMultiplier=value;
  assert.deepEqual(badgeText(s),['暴击','连锁追击']);
 }
 const html=center(s,{...ui,rolling:true,rollValues:[1,2,3,4]});assert(!html.includes('critical-tag'));assert(!html.includes('follow-tag'));assert(!html.includes('第 1 掷结算'));
});
