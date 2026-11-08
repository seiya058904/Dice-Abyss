import test from 'node:test';
import assert from 'node:assert/strict';
import {talentBenefit} from '../src/talent-benefit.js';
import {stats,diceOdds,transition,combatCriticalChance,combatFollowChance} from '../src/engine.js';
import {ABILITY_DEFS,DEEP_TALENTS} from '../src/deep-content.js';
import {CATALOG} from '../src/equipment-content.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
import {talentInspectorView,comparison} from '../src/views.js';
import {talentFixture,healthFixture,fixtureItem} from './fixtures/decision-gains.mjs';

test('capped guidance explicitly previews zero effective gain without blocking investment',()=>{
 const s=talentFixture(),raw=encodeSave(s),benefit=talentBenefit(s,'attune');
 assert(validateSave(s));assert.equal(benefit.rows[0].before,.25);assert.equal(benefit.rows[0].after,.25);assert(benefit.unchanged&&benefit.limited);
 const html=talentInspectorView(s,{talentInspect:'attune'});assert.match(html,/当前构筑下无额外增益/);assert.match(html,/25% → 25%/);assert.match(html,/仍可投入/);
 assert.equal(encodeSave(s),raw);const next=transition(s,{type:'talent',id:'attune'});
 assert.equal(next.player.talentPoints,19);assert.deepEqual(diceOdds(s),diceOdds(next));assert.deepEqual(decodeSave(encodeSave(next)),next);
});
test('normal and partly capped quantities match actual committed odds and preserve all preview inputs',()=>{
 for(const mode of ['normal','partial','capped'])for(const count of [1,5,10,'max']){
  const s=talentFixture(mode),raw=encodeSave(s),q=talentBenefit(s,'attune',count),next=transition(s,{type:'talent',id:'attune',count});
  assert.equal(q.rows[0].before,diceOdds(s).echoChance);assert.equal(q.rows[0].after,diceOdds(next).echoChance);
  assert.equal(next.player.talentPoints,q.quote.remainingPoints);assert.equal(encodeSave(s),raw);assert.equal(s.rng,next.rng);assert.deepEqual(next.extra,s.extra);
  assert.equal(q.limited,mode!=='normal');assert.equal(q.unchanged,mode==='capped');
 }
 const s=talentFixture();s.player.equipped.relic2=null;s.player.equipped.relic3=null;
 assert(!talentBenefit(s,'attune').unchanged,'removing cap-producing gear restores useful investment');
});
test('critical and follow previews retain every distinct conditional probability and the original caps',()=>{
 const s=talentFixture('normal');s.player.talents.keen=2;s.player.talents.echo=2;s.player.talents.spark=2;
 for(const id of ['critical','keen','echo','spark']){
  const b=talentBenefit(s,id,5),next=transition(s,{type:'talent',id,count:5}),a=stats(s),z=stats(next);
  const originalCrit=(v,st,six)=>Math.min(.9,st.crit+st.critBonus+(six?v.player.talents.keen*.03:0));
  const originalFollow=(v,st,pair,crit)=>Math.min(.85,st.follow+st.followBonus+(pair?v.player.talents.echo*.03:0)+(pair&&crit?st.criticalFollow+v.player.talents.spark*.05:0));
  for(const row of b.rows){
   const isCrit=['crit','six-crit'].includes(row.key),six=row.key==='six-crit',pair=row.key!=='follow',critical=row.key==='critical-follow';
   assert.equal(row.before,isCrit?originalCrit(s,a,six):originalFollow(s,a,pair,critical));
   assert.equal(row.after,isCrit?originalCrit(next,z,six):originalFollow(next,z,pair,critical));
  }
 }
 const capped={crit:.75,critBonus:.6,follow:.6,followBonus:.6,criticalFollow:.5};
 assert.equal(combatCriticalChance(s,capped,true),.9);assert.equal(combatFollowChance(s,capped,true,true),.85);
});
test('deep talent previews use capped gear-plus-talent values and respect the current layer luck budget',()=>{
 for(const [id,t]of Object.entries(DEEP_TALENTS)){
  const s=talentFixture('normal');s.floor=140;
  const entry=CATALOG.relic.filter(e=>e.rarity===7).sort((a,b)=>(b.effects[t.effect]||0)-(a.effects[t.effect]||0))[0];
  for(const [i,slot]of ['relic','relic2','relic3'].entries()){const item=fixtureItem(entry.id,`i${i+5}`);s.player.items.push(item);s.player.equipped[slot]=item.id;}s.nextId=8;
  const raw=encodeSave(s),q=talentBenefit(s,id,'max'),next=transition(s,{type:'talent',id,count:'max'}),z=stats(next),row=q.rows[0];
  const expected=t.effect==='sixShatter'?Math.min(1,z.pierce+z.sixShatter):['echoRelic','tripleStrike'].includes(t.effect)?Math.min(1.4,z.echoRelic+z.tripleStrike):t.effect==='eliteLuck'?Math.min(20,Math.ceil(z.eliteLuck)):z[t.effect];
  assert.equal(row.after,expected,id);assert.equal(encodeSave(s),raw);assert(validateSave(next));
  if(!['sixShatter','echoRelic','tripleStrike'].includes(t.effect))assert(row.after<=ABILITY_DEFS[t.effect].cap);
 }
 const s=talentFixture('normal');s.floor=30;s.eventLuck=20;const q=talentBenefit(s,'hunterStar');assert(q.unchanged);assert.equal(q.rows[0].after,0);assert.match(q.note,/换层/);
});
test('luck soft growth preserves its gold benefit and omen is conditional on actual fate',()=>{
 const s=talentFixture();s.floor=140;
 for(const [i,slot]of ['relic','relic2','relic3'].entries()){const item=fixtureItem('v4-relic-0-3-7',`i${i+7}`);s.player.items.push(item);s.player.equipped[slot]=item.id;}s.nextId=10;
 s.eventLuck=20;const q=talentBenefit(s,'luck',5),next=transition(s,{type:'talent',id:'luck',count:5});
 assert(q.limited&&!q.unchanged);assert.equal(q.rows.find(r=>r.key==='gold').after,stats(next).goldBonus);assert(q.rows.find(r=>r.key==='gold').after>q.rows.find(r=>r.key==='gold').before);
 s.fate=[1,2];assert(talentBenefit(s,'omen').unchanged);assert.match(talentBenefit(s,'omen').note,/不是双同/);
 s.fate=[2,2];assert(!talentBenefit(s,'omen').unchanged);
});
test('health, rounding, unavailable nodes and comparison labels remain truthful',()=>{
 const s=healthFixture();s.player.talentPoints=3;const q=talentBenefit(s,'vitality'),next=transition(s,{type:'talent',id:'vitality'});
 assert.equal(q.rows[0].after,stats(next).maxHp);assert.equal(next.player.hp,s.player.hp);assert.match(q.note,/不会恢复/);
 assert.match(comparison(s,s.player.items[3]),/生命上限/);
 for(const id of ['missing','__proto__','shatter'])assert.equal(talentBenefit(s,id),null);
 s.player.talentPoints=0;assert.equal(talentBenefit(s,'attune'),null);
});
