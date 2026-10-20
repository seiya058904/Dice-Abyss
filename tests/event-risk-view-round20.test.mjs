import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// An explicit alternate source supports an honest pre-feature comparison.
const root=process.env.DICE_RISK_SOURCE;
const source=file=>root?pathToFileURL(path.join(root,file)):new URL('../'+file,import.meta.url);
const E=await import(source('src/engine.js')),S=await import(source('src/storage.js'));
const V=await import(source('src/views.js'));
const {eventFixture}=await import(source('scripts/audit-event-context.mjs'));
function fixture(key='gambit',floor=1){
 const s=eventFixture({E,S},key,{floor,rich:true});
 s.player.gold=303;s.event.costGold=101;s.eventLuck=0;s.nextLuck=0;
 assert(S.validateSave(s));assert.equal(E.diceOdds(s).luck,0);return s;
}

test('both paid dice events expose outcome probabilities on the pending room',()=>{
 for(const [key,floor]of [['gambit',1],['wishingvault',140]]){
  const s=fixture(key,floor),before=S.encodeSave(s),html=V.center(s,{view:'game'});
  assert.match(html,new RegExp(`data-event-risk="${key}"`));
  assert.match(html,/<table/);assert.match(html,/<th scope="col">/);
  assert.match(html,/当前幸运下的概率/);assert.doesNotMatch(html,/class="event-atmosphere"/);
  assert.equal(S.encodeSave(s),before,'reading the entire room changes no saved field');
 }
});

test('odd payment shows the actual integer refund and net cost before confirmation',()=>{
 assert.equal(typeof V.eventRiskView,'function');
 const html=V.eventRiskView(fixture(),'roll',{review:true});
 assert.match(html,/33\.33%/);assert.match(html,/返还 50/);assert.match(html,/净支出 51/);
 assert.match(html,/252/);assert.match(html,/202/);
 assert.match(html,/宝箱金币在开箱时另行结算/);
});

test('a guaranteed gambit purchase has its own cost, balance, and exact early rarity',()=>{
 assert.equal(typeof V.eventRiskView,'function');
 const html=V.eventRiskView(fixture(),'safe',{review:true});
 assert.match(html,/100(?:\.00)?%/);assert.match(html,/202/);assert.match(html,/101/);
 assert.match(html,/稀有宝箱/);assert.doesNotMatch(html,/返还 50/);
});

test('two independent wishing dice show all three sum groups and no combat echo assumption',()=>{
 assert.equal(typeof V.eventRiskView,'function');
 const html=V.eventRiskView(fixture('wishingvault',140),'roll');
 for(const value of ['27.78%','55.56%','16.67%'])assert(html.includes(value),value);
 assert.match(html,/同点引导不参与/);assert.match(html,/两颗/);
});

test('unaffordable choices explain the shortfall without fabricated negative balances',()=>{
 assert.equal(typeof V.eventRiskView,'function');
 const s=fixture();s.player.gold=50;const html=V.eventRiskView(s,'roll');
 assert.match(html,/金币不足 · 还差 51 金币/);
 const payment=html.match(/<p class="event-risk-payment">([\s\S]*?)<\/p>/);
 const outcomes=html.match(/<table class="event-risk-table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
 assert(payment);assert(outcomes);
 assert.doesNotMatch(payment[1].replace(/<[^>]*>/g,''),/支付后/,'an unavailable payment has no projected post-payment balance');
 assert.doesNotMatch(outcomes[1].replace(/<[^>]*>/g,''),/余额|净支出/,'unaffordable outcomes do not claim a completed payment or balance across HTML tags');
 assert.match(html,/33\.33%/,'odds remain readable even when payment is unavailable');
});

test('complete reward distribution labels conditional rates and unreached rarity gates',()=>{
 assert.equal(typeof V.eventRiskView,'function');
 const html=V.eventRiskView(fixture(),'roll');
 assert.match(html,/<details/);assert.match(html,/<summary[^>]*>/);
 assert.match(html,/达到对应点数后/);assert.match(html,/30 层解锁/);assert.match(html,/140 层解锁/);
 assert.match(html,/0%/);assert.match(html,/永恒/);
});

test('resolved or unrelated rooms never show a fresh purchasable risk preview',()=>{
 assert.equal(typeof V.eventRiskView,'function');
 const s=fixture(),after=E.transition(s,{type:'event-choice',id:'leave'});
 assert.equal(V.eventRiskView(after),'');
 assert.doesNotMatch(V.center(after,{view:'game'}),/data-event-risk=/);
 assert.equal(V.eventRiskView(E.newGame(1)),'');
});

test('per-choice budget summaries remain read-only and distinguish risk from guarantee',()=>{
 assert.equal(typeof V.eventRiskChoiceSummary,'function');
 const s=fixture(),before=S.encodeSave(s);
 assert.match(V.eventRiskChoiceSummary(s,'roll'),/51.*101/);
 assert.match(V.eventRiskChoiceSummary(s,'safe'),/101/);
 assert.equal(V.eventRiskChoiceSummary(s,'leave'),'');
 assert.equal(S.encodeSave(s),before);
});

test('the saved two-dice wish animation is described as two dice, not one',()=>{
 const s=fixture('wishingvault',140);let after;
 for(let rng=1;rng<1000;rng++){
  const candidate=E.transition({...s,rng},{type:'event-choice',id:'roll',confirmed:true});
  if(candidate.phase==='event'&&candidate.event.rolls?.length===2){after=candidate;break;}
 }
 assert(after);assert(S.validateSave(after));
 const html=V.center(after,{view:'game',rolling:true});
 assert.match(html,/投下这两颗命运骰/);assert.doesNotMatch(html,/投下这一颗命运骰/);
});
