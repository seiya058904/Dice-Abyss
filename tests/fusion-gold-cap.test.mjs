import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, transition, stats, makeItem, fusionPreview, canAct, salvagePreview, GOLD_CAP } from '../src/engine.js';
import { validateSave, encodeSave, decodeSave } from '../src/storage.js';
import { fusionView, esc, num, icon, itemSummary } from '../src/views.js';
import { createFusionController } from '../src/fusion-controller.js';

// Save-valid constructed boundaries, not evidence that an unaided player
// naturally reaches the cap. The DOM harness registers events only.
function fixture(targetLevel=1_000_000, count=1) {
  let state=newGame(9009);state.floor=140;state.player.level=100;state.player.gold=GOLD_CAP;
  state=transition(state,{type:'fate'});state.route[0].type='fusion';state=transition(state,{type:'enter'});
  const target=state.player.items.find(item=>item.id===state.player.equipped.weapon);
  target.level=targetLevel;target.levelXp=0;
  const materials=[];
  for(let index=0;index<count;index++){const item=makeItem(state,'weapon',0,140);state.player.items.push(item);materials.push(item);}
  state.player.hp=stats(state).maxHp;
  assert(validateSave(state));assert.deepEqual(decodeSave(encodeSave(state)),state);
  const ui={screen:'game',view:'game',busy:false,fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:materials.map(item=>item.id)};
  return {state,target,materials,ui};
}
const visible=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const submitTag=html=>html.match(/<button[^>]*data-action="fusion-preview"[^>]*>/)?.[0]||'';
function harness(t,seed=fixture()) {
  let state=seed.state,confirmation=null;
  const notifications=[],actions=[],noop=()=>{};
  const app={addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[]};
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  globalThis.document={addEventListener:noop};globalThis.window={addEventListener:noop};
  const controller=createFusionController({app,ui:seed.ui,getState:()=>state,isCommitting:()=>false,render:noop,
    act:async action=>{actions.push(action);state=transition(state,action);},notify:text=>notifications.push(text),
    confirmDialog:(title,body,label,callback)=>{confirmation={title,body,label,callback};},
    reviewItems:noop,dialog:{open:false},tooltipHTML:noop,esc,num,icon,itemSummary});
  t.after(()=>{controller.reset();globalThis.document=previousDocument;globalThis.window=previousWindow;});
  return {...seed,controller,notifications,actions,get state(){return state;},setState:next=>{state=next;},
    get confirmation(){return confirmation;},click:(action,id)=>controller.handleClick({shiftKey:false},{dataset:{action,id}})};
}

test('single-material over-cap fusion names the real limit and cannot offer a one-gold top-up',()=>{
  const {state,target,materials,ui}=fixture(),before=JSON.stringify(state),selection=JSON.stringify(ui);
  const quote=fusionPreview(state,[target.id],[materials[0].id]);assert.equal(quote.cost,GOLD_CAP+1);
  const html=fusionView(state,ui),text=visible(html);
  assert.match(text,/单件材料费用超过金币持有上限/);assert.match(text,/更换目标后再试/);
  assert.match(text,/10,000,000,000/);assert.match(text,/熔炼后余额 无法结算/);
  assert.doesNotMatch(text,/还差 1 金币|余额 -1|减少材料|10,000,000,001/);
  assert.match(submitTag(html),/\sdisabled(?:\s|>)/);
  assert.equal(canAct(state,{type:'fuse',targets:[target.id],materials:[materials[0].id]}),false);
  assert.strictEqual(transition(state,{type:'fuse',targets:[target.id],materials:[materials[0].id]}),state);
  assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify(ui),selection);
});

test('a bulk-only cap warning retains a payable smaller selection and its original exact settlement',()=>{
  const {state,target,materials,ui}=fixture(500_000,2);
  const full=fusionPreview(state,[target.id],materials.map(item=>item.id));assert.equal(full.cost,GOLD_CAP+1);
  const html=fusionView(state,ui);assert.match(visible(html),/减少材料或更换目标后再试/);assert.match(submitTag(html),/\sdisabled(?:\s|>)/);
  const one=fusionPreview(state,[target.id],[materials[0].id]);assert(one.cost<GOLD_CAP);
  const reducedHtml=fusionView(state,{...ui,fusionMaterials:[materials[0].id]});
  assert.doesNotMatch(visible(reducedHtml),/费用超过金币持有上限/);assert.doesNotMatch(submitTag(reducedHtml),/\sdisabled(?:\s|>)/);
  const before=JSON.stringify(state),after=transition(state,{type:'fuse',targets:[target.id],materials:[materials[0].id]});
  assert.notStrictEqual(after,state);assert.equal(after.player.gold,state.player.gold-one.cost);
  assert.deepEqual(after.lastForge.consumed,[materials[0].id]);assert(after.player.items.some(item=>item.id===materials[1].id));
  assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);assert.equal(JSON.stringify(state),before);
});

test('ordinary insufficient funds still offer budget adjustment and never promise a negative settled balance',()=>{
  const {state,ui}=fixture(100);state.player.gold=0;
  const html=fusionView(state,ui),text=visible(html);
  assert.match(text,/还差 [\d,]+ 金币/);assert.match(text,/按预算调整材料/);assert.match(text,/熔炼后余额 无法结算/);
  assert.doesNotMatch(text,/超过金币持有上限|余额 -/);assert.doesNotMatch(submitTag(html),/\sdisabled(?:\s|>)/);
});

test('direct over-cap submit leaves the selection, RNG, gold and inventory intact',async t=>{
  const h=harness(t),before=JSON.stringify(h.state),selection=[...h.ui.fusionMaterials];
  await h.click('fusion-preview');
  assert.match(h.notifications.at(-1)||'',/单件材料费用超过金币持有上限/);
  assert.deepEqual(h.ui.fusionMaterials,selection);assert.equal(JSON.stringify(h.state),before);
  assert.deepEqual(h.actions,[]);assert.equal(h.confirmation,null);
});

test('bulk planning and forced placement explain an unpayable target without a false one-gold deficit',async t=>{
  const h=harness(t);h.ui.fusionMaterials=[];
  const before=JSON.stringify(h.state);
  await h.click('fusion-all');
  assert.deepEqual(h.ui.fusionMaterials,[]);assert.match(h.ui.fusionNotice.text,/单件材料费用超过金币持有上限/);
  assert.doesNotMatch(h.ui.fusionNotice.text,/回收旧装|当前金币不足一件/);
  await h.click('fusion-force-all');
  assert.deepEqual(h.ui.fusionMaterials,[h.materials[0].id]);assert.match(h.ui.fusionNotice.text,/费用超过金币持有上限/);
  assert.doesNotMatch(h.ui.fusionNotice.text,/还差 1 金币/);assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.actions,[]);
});

test('fusion recycling confirms projected credited gold and overflow before the unchanged destructive action',async t=>{
  const seed=fixture(100),h=harness(t,seed),original=structuredClone(seed.state),item=seed.materials[0];
  h.ui.fusionMaterials=[];
  for(const gap of [100000,10,0]) {
    const state=structuredClone(original);state.player.gold=GOLD_CAP-gap;h.setState(state);
    const before=JSON.stringify(state),quote=salvagePreview(state,[item.id],true,true);
    await h.click('fusion-salvage',item.id);
    assert.equal(JSON.stringify(h.state),before,'opening confirmation must not mutate the save');
    assert.match(visible(h.confirmation.body),new RegExp(`预计实收 ${quote.gold.toLocaleString('en-US')} 金币`));
    if(quote.overflow)assert.match(visible(h.confirmation.body),new RegExp(`${quote.overflow.toLocaleString('en-US')} 溢出金币`));
    await h.confirmation.callback();
    assert.equal(h.state.player.gold-state.player.gold,quote.gold);assert.equal(h.state.player.items.length,state.player.items.length-1);
    assert.equal(h.actions.at(-1).allowOverflow,!!quote.overflow);assert.equal(h.actions.at(-1).allowProtected,false);
    assert(validateSave(h.state));assert.deepEqual(decodeSave(encodeSave(h.state)),h.state);
  }
});
