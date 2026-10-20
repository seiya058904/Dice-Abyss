import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadEventApi,eventFixture,contextFixtures,runEventAudit} from '../scripts/audit-event-context.mjs';

// Use the same tests against the immutable input for precise old-copy failures:
// QA_EVENT_ROOT=/path/to/input node --test tests/event-context.test.mjs
const api=await loadEventApi(process.env.QA_EVENT_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const {E,S,C}=api,fixtures=new Map(contextFixtures(api).map(row=>[row.name,row.state]));
const at=name=>structuredClone(fixtures.get(name));
const accept=s=>C.eventChoices(s).find(o=>o.id==='accept');
const submit=s=>E.transition(s,{type:'event-choice',id:'accept',confirmed:true});

for(const [type,noun]of [['offering','旧物'],['relicloom','旧遗物']])test(`${type} keeps the reserved name after locking and never substitutes another safe item`,()=>{
  const pending=at(`${type}/entry`),locked=E.transition(pending,{type:'lock',id:pending.event.offerId});
  assert.equal(pending.event.offerId,'i4');assert.equal(locked.rng,pending.rng);assert.equal(locked.event.offerId,'i4');
  assert.equal(locked.player.items.find(i=>i.id==='i5').locked,false);assert(!Object.values(locked.player.equipped).includes('i5'));
  assert(accept(locked).disabled);assert.strictEqual(submit(locked),locked,'protected object is never consumed');
  const restored=E.transition(locked,{type:'lock',id:'i4'});assert.equal(accept(restored).disabled,false);assert.equal(restored.rng,locked.rng);
  const result=submit(restored);assert.equal(result.event.offerId,'i4');assert(!result.player.items.some(i=>i.id==='i4'));assert(result.player.items.some(i=>i.id==='i5'));
  assert.strictEqual(submit(result),result,'cannot pay or claim the same event twice');
  assert.equal(accept(locked).cost,pending.player.items.find(i=>i.id==='i4').name);
  assert.match(accept(locked).reason,new RegExp(`本次登记的${noun}已锁定`));assert(!accept(locked).reason.includes('上限'));
  assert.match(accept(restored).detail,/入场时登记/);
});

test('reserved material reasons distinguish missing, absent, equipped, loot and rarity protection',()=>{
  for(const type of ['offering','relicloom'])for(const [kind,pattern]of [['removed',/本次登记的.*已不存在/],['none-at-entry',/入场时未登记/],['equipped',/本次登记的.*已装备/],['loot-protected',/当前战利品.*受保护/],['protected-rarity',/传说及以上品质.*受保护/]]){
    const s=at(`${type}/${kind}`),snapshot=S.encodeSave(s),o=accept(s);assert(o.disabled);assert.strictEqual(submit(s),s);
    assert.equal(S.encodeSave(s),snapshot);assert(S.validateSave(s));assert.deepEqual(S.decodeSave(snapshot),s);assert.match(o.reason,pattern,`${type}/${kind}`);
  }
});

test('an existing unnamed reserved item keeps an explicit ID instead of being called missing',()=>{
  for(const type of ['offering','relicloom']){
    const s=at(`${type}/empty-name`),locked=at(`${type}/empty-name-locked`),bytes=S.encodeSave(s),item=s.player.items.find(i=>i.id===s.event.offerId);
    assert(item);assert.equal(item.name,'');assert(S.validateSave(s));assert.deepEqual(S.decodeSave(bytes),s);
    assert.equal(accept(s).disabled,false);assert(accept(locked).disabled);assert.strictEqual(submit(locked),locked);
    assert.strictEqual(E.transition(s,{type:'event-choice',id:'accept'}),s,'empty-name item still requires explicit confirmation');
    const paid=submit(s);assert.equal(paid.event.offerId,item.id);assert(!paid.player.items.some(i=>i.id===item.id));assert(paid.player.items.some(i=>i.id==='i5'));
    assert.equal(S.encodeSave(s),bytes);assert.deepEqual(S.decodeSave(S.encodeSave(paid)),paid);assert.strictEqual(submit(paid),paid);
    for(const state of [s,locked]){assert.equal(accept(state).cost,`未命名旧物（${item.id}）`);assert(!accept(state).cost.includes('不存在'));assert(api.V.center(state,{view:'game',busy:false}).includes(`未命名旧物（${item.id}）`));}
    assert.match(accept(locked).reason,/已锁定/);assert.equal(accept(s).reason,'');
  }
});

test('offering separates the shared gift count from the unallocated-point safety cap',()=>{
  const shared=at('offering/shared-cap'),points=at('offering/point-cap'),both=at('offering/both-caps'),locked=at('offering/locked-and-cap');
  for(const s of [shared,points,both,locked]){assert(accept(s).disabled);assert.strictEqual(submit(s),s);assert(C.eventChoices(s).some(o=>o.id==='leave'&&!o.disabled));}
  assert.match(accept(shared).reason,/与星海书库共用.*20 次/);assert(!accept(shared).reason.includes('未分配天赋点'));
  assert.match(accept(points).reason,/未分配天赋点.*2,000,000/);assert(!accept(points).reason.includes('20 次'));
  assert.match(accept(both).reason,/20 次/);assert.match(accept(both).reason,/2,000,000/);
  assert.match(accept(locked).reason,/已锁定/);assert.match(accept(locked).reason,/20 次/);
});

test('bloodwell displays its entry snapshot charge through larger and smaller armor swaps',()=>{
  const low=at('bloodwell/entry'),higher=at('bloodwell/larger-armor-after-entry'),lower=at('bloodwell/smaller-armor-after-entry');
  assert.equal(E.stats(low).maxHp,467);assert.equal(E.stats(higher).maxHp,1529);assert.equal(E.stats(lower).maxHp,467);
  assert.equal(low.event.costHp,93);assert.equal(higher.event.costHp,93);assert.equal(lower.event.costHp,305);
  for(const s of [low,higher,lower]){
    const bytes=S.encodeSave(s),p=C.eventPresentation(s),after=submit(s);
    assert.equal(s.player.hp,467,'armor swaps do not heal');assert.equal(after.player.hp,s.player.hp-s.event.costHp);assert.equal(after.event.costHp,s.event.costHp);
    assert.equal(accept(s).cost,`${s.event.costHp} 当前生命`);assert.equal(S.encodeSave(s),bytes);assert.deepEqual(S.decodeSave(bytes),s);
    assert.match(p.body,/入井时最大生命/);assert(p.body.includes(`本次需 ${s.event.costHp} 当前生命`));assert.match(p.body,/换装不重算/);assert.match(accept(s).detail,/入井时/);
  }
});

test('bloodwell keeps exact saved charges, refuses lethal payment and can safely leave at the boundary',()=>{
  for(const name of ['cannot-pay','would-be-lethal']){
    const s=at(`bloodwell/${name}`),saved=S.encodeSave(s);assert(accept(s).disabled);assert.strictEqual(submit(s),s);assert.equal(S.encodeSave(s),saved);
    const left=E.transition(s,{type:'event-choice',id:'leave'});assert.deepEqual(left.player,s.player);assert.equal(left.rng,s.rng);assert.equal(left.event.costHp,93);
  }
  const justEnough=at('bloodwell/one-hp-survives'),paid=submit(justEnough);assert.equal(justEnough.player.hp,94);assert.equal(paid.player.hp,1);assert.equal(paid.phase,'chest');assert(paid.chest.item.rarity>=3);
  // A validator-accepted old pending record is authoritative even when its
  // charge is not inferable from the currently equipped armor.
  const legacy=at('bloodwell/larger-armor-after-entry');legacy.event.costHp=17;legacy.player.hp=18;
  const loaded=S.decodeSave(S.encodeSave(legacy)),before=structuredClone(loaded),p=C.eventPresentation(loaded);
  assert.deepEqual(loaded,before);assert.equal(submit(loaded).player.hp,1);assert.equal(accept(loaded).cost,'17 当前生命');assert.match(p.body,/本次需 17 当前生命/);
});

test('resolved offering and bloodwell text, outcomes and save bytes remain historical records',()=>{
  for(const type of ['offering','bloodwell'])for(const choice of ['leave','accept']){
    const s=at(`${type}/resolved-${choice}`),bytes=S.encodeSave(s),p=C.eventPresentation(s);
    assert.equal(p.body,s.event.text);assert.equal(p.outcome,s.event.outcome);assert.deepEqual(p.options,[]);assert.deepEqual(C.eventChoices(s),[]);
    assert.equal(S.encodeSave(s),bytes);assert.deepEqual(S.decodeSave(bytes),s);assert.strictEqual(submit(s),s);
  }
});

test('memorywell explains HP clipping at reset and restoring vitality never heals the lost HP',()=>{
  for(const name of ['full-hp','below-new-cap','at-new-cap']){
    const s=at(`memorywell/${name}`),saved=S.encodeSave(s),option=C.eventChoices(s).find(o=>o.id==='reset'),initialStats=E.stats(s);
    assert.equal(initialStats.maxHp,584);assert.equal(s.player.talents.vitality,5);assert.equal(option.disabled,false);
    assert.strictEqual(E.transition(s,{type:'event-choice',id:'reset'}),s);
    const reset=E.transition(s,{type:'event-choice',id:'reset',confirmed:true});assert.equal(E.stats(reset).maxHp,467);
    assert.equal(reset.player.hp,name==='full-hp'?467:s.player.hp);assert.equal(reset.player.gold,s.player.gold-s.event.costGold);assert.equal(reset.player.talentPoints,5);assert.equal(reset.rng,s.rng);
    const restore=E.transition(reset,{type:'talent',id:'vitality',count:5});assert.equal(E.stats(restore).maxHp,584);assert.equal(restore.player.hp,reset.player.hp);assert.deepEqual(restore.player.talents,s.player.talents);assert.deepEqual(restore.player.items,s.player.items);
    assert.deepEqual(S.decodeSave(S.encodeSave(restore)),restore);assert.equal(S.encodeSave(s),saved);
    assert.match(option.detail,/超出新生命上限的当前生命会被裁减/);assert.match(option.detail,/重新加点不会补回/);
    assert.equal(C.eventPresentation(reset).body,s.event.text,'resolved historical text stays intact');
  }
});

test('all 22 existing event keys retain legal choices, explicit payment, once-only claims and save closure',()=>{
  const result=runEventAudit(api);assert.equal(result.counts.eventKeys,22);assert.equal(result.counts.choiceIds,49);
  assert.equal(result.counts.contextSnapshots,37);assert.equal(result.counts.claims,15);assert(result.counts.unconfirmedRejections>0);assert(result.counts.rejections>0);
  assert.deepEqual(result.eventKeys,[...C.EVENT_KEYS].sort());
});
