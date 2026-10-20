import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,stats,makeItem} from '../src/engine.js';
import {fusionCostSummary,fusionPreview} from '../src/equipment.js';
import {createFusionController} from '../src/fusion-controller.js';
import {fusionView,esc,num,icon,itemSummary} from '../src/views.js';

// Direct controller/renderer integration. Registration-only event targets do
// not emulate layout, focus or drag; those remain real browser QA cases.
function harness(t,count=40){
 let state=newGame(20261017);state.floor=140;state.player.level=70;state.player.gold=1e10;state.player.hp=stats(state).maxHp;
 state=transition(state,{type:'fate'});state.route[0].type='fusion';state=transition(state,{type:'enter'});
 const target=state.player.items.find(item=>item.id===state.player.equipped.weapon);target.level=70;target.levelXp=0;
 while(state.player.items.length<count){const item=makeItem(state,'weapon',state.player.items.length%8);item.level=64+state.player.items.length%17;state.player.items.push(item);}
 const noop=()=>{},app={addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[]};
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={addEventListener:noop};globalThis.window={addEventListener:noop};
 const ui={screen:'game',view:'game',busy:false,fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:[],fusionSort:'power',fusionPage:0};
 let controller,lastModel,html='',renders=0;
 controller=createFusionController({app,ui,getState:()=>state,isCommitting:()=>false,render:options=>{
  lastModel=controller.reconcile(state,!!options.fusionOnly);html=fusionView(state,ui,lastModel);renders++;
 },act:noop,notify:noop,confirmDialog:noop,reviewItems:noop,dialog:{open:false},tooltipHTML:noop,esc,num,icon,itemSummary});
 t.after(()=>{controller.reset();globalThis.document=previousDocument;globalThis.window=previousWindow;});
 return {ui,controller,target,get state(){return state;},setState:next=>{state=next;},get model(){return lastModel;},get html(){return html;},get renders(){return renders;},click:(action,id,extra={},shiftKey=false)=>controller.handleClick({shiftKey},{dataset:{action,id,...extra}})};
}

test('10,000-item controller clicks avoid duplicate view models and unused cancellation plans',async t=>{
 const h=harness(t,10000),s=h.state,materials=s.player.items.filter(item=>item.slot==='weapon'&&item.id!==h.target.id).map(item=>item.id),before=JSON.stringify(s);
 let counts=null;const items=s.player.items;
 s.player.items=new Proxy(items,{get(array,key,receiver){if(counts&&key==='map')counts.maps++;return Reflect.get(array,key,receiver);}});
 const originalSort=Array.prototype.sort;
 Array.prototype.sort=function(...args){if(counts&&this.length>=5000)counts.sorts++;return originalSort.apply(this,args);};
 t.after(()=>{Array.prototype.sort=originalSort;});
 for(const [action,selected,maps,sorts,remaining]of [
  ['fusion-item',[],3,1,1],['fusion-item',materials,3,1,9996],
  ['fusion-all',[],5,3,9997],['fusion-all',materials,2,1,0],
 ]){
  h.ui.fusionMaterials=[...selected];counts={maps:0,sorts:0};await h.click(action,materials[2]);const measured=counts;counts=null;
  assert(measured.maps<=maps,`${action}: avoid rebuilding the inventory lookup (${measured.maps} > ${maps})`);
  assert(measured.sorts<=sorts,`${action}: avoid sorting an unused full pool (${measured.sorts} > ${sorts})`);
  assert.equal(h.model.materialIds.length,remaining);assert.equal((h.html.match(/data-fusion-item=/g)||[]).length,24);
 }
 assert.equal(h.renders,4);assert.equal(JSON.stringify(s),before);
});

test('fresh partial renders retain legal materials while tracking in-place equipment, filters and new-run identities',async t=>{
 const h=harness(t),s=h.state,materials=s.player.items.filter(item=>item.slot==='weapon'&&item.id!==h.target.id),chosen=materials[0],replacement=materials[1];
 await h.click('fusion-item',chosen.id);assert.deepEqual(h.model.materialIds,[chosen.id]);assert(h.model.preview);
 await h.click('fusion-target',replacement.id,{index:'0'});assert.deepEqual(h.model.materialIds,[chosen.id]);assert.deepEqual(h.model.targetIds,[replacement.id]);
 s.player.equipped.weapon=chosen.id;s.player.gold=0;
 const newest=makeItem(s,'weapon',7);newest.level=88;s.player.items.push(newest);
 h.controller.handleInput({target:{id:'fusion-sort',value:'newest'}});
 assert.equal(h.model.filtered[0].id,newest.id);assert.deepEqual(h.model.materialIds,[]);assert.equal(h.model.preview,null);
 await h.click('fusion-item',newest.id);assert.deepEqual(h.model.materialIds,[newest.id]);assert.equal(h.model.preview.cost,fusionPreview(s,[replacement.id],[newest.id],true).cost);
 const fresh=newGame(20261018);fresh.phase='fusion';h.setState(fresh);h.controller.reset();h.controller.reconcile(fresh);
 assert.deepEqual(h.ui.fusionTargets,[]);assert.deepEqual(h.ui.fusionMaterials,[]);assert.equal(fresh.player.items[0].id,h.target.id,'new runs can reuse an equipment ID without reusing a selection');
});

test('batch placement, force-all, cancellation and undo preserve exact current budget and protected choices',async t=>{
 const h=harness(t,18),s=h.state,materials=s.player.items.filter(item=>item.slot==='weapon'&&item.id!==h.target.id),locked=materials[0];locked.locked=true;
 const before=JSON.stringify(s),cost=fusionCostSummary(s,[h.target],2).cost;s.player.gold=cost;
 await h.click('fusion-all');assert.equal(h.ui.fusionMaterials.length,2);assert(h.ui.fusionNotice.budgetLimited);assert(!h.ui.fusionMaterials.includes(locked.id));assert.equal(h.model.preview.cost,cost);
 await h.click('fusion-force-all');assert.equal(h.ui.fusionMaterials.length,materials.length-1);assert(h.model.preview.cost>s.player.gold);assert(!h.ui.fusionMaterials.includes(locked.id));
 await h.click('fusion-item',locked.id);assert(h.model.preview.protectedItems.some(item=>item.id===locked.id),'manual locked material still requires protection confirmation');
 await h.click('fusion-all');assert.deepEqual(h.ui.fusionMaterials,[]);assert.equal(h.model.preview,null);
 await h.click('fusion-undo');assert.equal(h.ui.fusionMaterials.length,materials.length);assert(h.ui.fusionMaterials.includes(locked.id));assert(h.model.preview.protectedItems.some(item=>item.id===locked.id));
 s.player.gold=1e10;assert.equal(JSON.stringify(s),before);
});
