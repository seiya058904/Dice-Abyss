import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeItem,stats} from '../src/engine.js';
import {itemStats,itemValue,MAX_ITEM_LEVEL,levelXpNeeded} from '../src/equipment.js';
import {encodeSave} from '../src/storage.js';
import {center} from '../src/views.js';
import {inventoryQuery,inventoryDefense,selectInventoryItems} from '../src/inventory-query.js';

// The uploaded v5.25.0 selector, retained as an independent behavioral oracle.
// Its comparator intentionally recalculates values. The production selector
// must preserve its order and references, not its redundant work.
function previousSelection(items,ui={}) {
  const query=inventoryQuery(ui.inventoryQuery).toLowerCase(),defense=inventoryDefense(ui.inventoryDefense);
  return items.filter(item=>(!ui.inventorySlot||item.slot===ui.inventorySlot)
    &&(ui.inventoryRarity==null||ui.inventoryRarity===''||item.rarity===Number(ui.inventoryRarity))
    &&(!query||item.name.toLowerCase().includes(query))
    &&(!defense||itemStats(item)[defense]>0))
    .toSorted((a,b)=>ui.inventorySort==='rarity'?b.rarity-a.rarity||itemValue(b)-itemValue(a)
      :ui.inventorySort==='level'?b.level-a.level||itemValue(b)-itemValue(a)
      :itemValue(b)-itemValue(a));
}
function fixture(count=180) {
  const state=newGame(26026);state.runId='round26-inventory-sort';state.floor=400;state.player.level=100;
  while(state.player.items.length<count)state.player.items.push(makeItem(state,undefined,state.nextId%8));
  state.player.hp=stats(state).maxHp;
  state.futureMetadata={nested:['雪 😀',null,{keep:true}],numberLooking:'9007199254740993'};
  return state;
}
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
function exact(items,ui={}) {
  const expected=previousSelection(items,ui),actual=selectInventoryItems(items,ui);
  assert.deepEqual(actual,expected);
  assert.notEqual(actual,items,'Selection owns its result array');
  for(let index=0;index<actual.length;index++)assert.equal(actual[index],expected[index],'Item references and complete tie order survive');
  return actual;
}

test('all three inventory sorts preserve the full filtered order and item references',()=>{
  const state=fixture(),before=encodeSave(state);
  for(const inventorySort of [undefined,'power','rarity','level','unknown'])
    for(const inventorySlot of ['', 'weapon','armor','relic'])
      for(const inventoryRarity of ['',0,'3',7,null])
        exact(state.player.items,{inventorySort,inventorySlot,inventoryRarity});
  assert.equal(encodeSave(state),before);
});

test('query, rarity and defensive filters keep their prior composition and normalization',()=>{
  const state=fixture(320),before=encodeSave(state);
  state.player.items[0].name='  MiXeD 雪与余火  ';
  for(const inventorySort of ['power','rarity','level'])
    for(const inventoryDefense of ['', 'regen','barrier','reduction','invalid'])
      for(const inventoryQuery of ['', '  mixed  ','之','不存在',undefined,17])
        exact(state.player.items,{inventorySort,inventoryDefense,inventoryQuery});
  state.player.items[0].name=JSON.parse(JSON.parse(before).payload).player.items[0].name;
  assert.equal(encodeSave(state),before);
});

test('equal values retain acquisition order without using names or item IDs as tie breakers',()=>{
  const original=fixture().player.items[0];
  const items=['i91','i2','i13','i4','i105','i6'].map((id,index)=>({...original,id,name:`Same ${5-index}`,level:40,levelXp:0,enhance:2}));
  for(const inventorySort of ['power','rarity','level'])assert.deepEqual(exact(items,{inventorySort}),items);
});

test('NaN comparator results and finite extreme values keep the uploaded sorting semantics',()=>{
  const original=fixture().player.items[0];
  const values=[3,NaN,99,MAX_ITEM_LEVEL,1,NaN,4];
  const items=values.map((level,index)=>({...original,id:`i${index+1}`,level,levelXp:0,enhance:index%3}));
  items.push({...original,id:'i99',level:MAX_ITEM_LEVEL-1,levelXp:levelXpNeeded(MAX_ITEM_LEVEL-1)-1,enhance:20});
  for(const inventorySort of ['power','rarity','level'])exact(items,{inventorySort});
});

test('empty and single-result selections never evaluate an unnecessary power key',()=>{
  const item={id:'i1',name:'Only item',slot:'weapon',rarity:0,get enhance(){assert.fail('No comparator means no power read');}};
  for(const inventorySort of ['power','rarity','level']){
    assert.deepEqual(exact([],{inventorySort}),[]);
    assert.deepEqual(exact([item],{inventorySort}),[item]);
    assert.deepEqual(exact([item],{inventorySort,inventorySlot:'armor'}),[]);
  }
});

test('unique rarity or level primary keys never request unused secondary power values',()=>{
  for(const inventorySort of ['rarity','level']){
    const items=[2,5,0,7,3,1,6,4].map((key,index)=>({id:`i${index+1}`,name:'Primary key only',slot:'weapon',
      rarity:inventorySort==='rarity'?key:0,level:inventorySort==='level'?key+1:1,
      get enhance(){assert.fail('Distinct primary keys do not need secondary power');}}));
    exact(items,{inventorySort});
  }
});

test('secondary power values are evaluated only for a tied group and are reused within that sort',()=>{
  const original=fixture().player.items[0];let reads=0;
  const items=[4,3,1,4,2].map((level,index)=>({...original,id:`i${index+1}`,level,
    get enhance(){assert.equal(level,4,'Unique primary key must not need power');reads++;return index;}}));
  const expected=previousSelection(items,{inventorySort:'level'});reads=0;
  const actual=selectInventoryItems(items,{inventorySort:'level'}),currentReads=reads;
  assert.deepEqual(actual,expected);assert.equal(currentReads,2);
});

test('every fresh call observes in-place equipment edits without retaining keys',()=>{
  const state=fixture(),ui={inventorySort:'power'},first=exact(state.player.items,ui);
  const candidate=state.player.items[0];candidate.level=MAX_ITEM_LEVEL;candidate.levelXp=0;candidate.enhance=20;
  const changed=exact(state.player.items,ui);assert.notDeepEqual(changed,first);assert.equal(changed[0],candidate);
  candidate.name='New name';candidate.rarity=1;candidate.level=1;candidate.levelXp=2;
  exact(state.player.items,{inventorySort:'rarity',inventoryQuery:'new'});
  state.player.items.reverse();exact(state.player.items,{inventorySort:'level'});
  state.player.items.splice(3,1);exact(state.player.items,ui);
});

test('legacy equipment, frozen input and caller-edited result arrays remain independent',()=>{
  const state=fixture(80);
  for(let index=3;index<13;index++){
    const item=state.player.items[index];item.legacy=true;delete item.catalogId;item.theme=index%10;
  }
  const before=encodeSave(state);freeze(state);
  for(const inventorySort of ['power','rarity','level']){
    const result=exact(state.player.items,{inventorySort});result.pop();result.reverse();
    exact(state.player.items,{inventorySort});
  }
  assert.equal(encodeSave(state),before);
});

test('complete rendered inventory pages and stored bytes remain equal to the uploaded selector',()=>{
  const state=fixture(),before=encodeSave(state);
  const criteria=[{}, {inventorySort:'rarity'}, {inventorySort:'level',inventorySlot:'armor'},
    {inventorySlot:'relic',inventoryRarity:'7'}, {inventoryDefense:'regen'},
    {inventoryQuery:'不存在',inventoryQueryDraft:'未提交 <草稿>'}];
  for(const choice of criteria)for(const inventoryPage of [0,1,99]){
    const ui={view:'inventory',...choice,inventoryPage};
    assert.equal(center(state,ui),center(state,ui,undefined,previousSelection(state.player.items,ui)));
  }
  assert.equal(encodeSave(state),before);
});

test('sorting a large inventory derives each needed power value at most once in one call',()=>{
  const state=fixture(10000);let reads=0;const perItem=new Map();
  const items=state.player.items.map(item=>({...item,get enhance(){reads++;perItem.set(item.id,(perItem.get(item.id)||0)+1);return item.enhance;}}));
  for(const inventorySort of ['power','rarity','level']){
    reads=0;const expected=previousSelection(items,{inventorySort}),oldReads=reads;
    reads=0;perItem.clear();const actual=selectInventoryItems(items,{inventorySort}),newReads=reads,counts=[...perItem.values()];
    assert.deepEqual(actual,expected);assert(newReads>0&&newReads<=items.length);assert(counts.every(count=>count===1));
    if(inventorySort==='power')assert.equal(newReads,items.length);
    assert(oldReads>newReads*5);
  }
});

test('power keys are never derived for rejected items when no defensive filter needs them',()=>{
  const state=fixture(80),items=state.player.items.map(item=>item.slot==='armor'?item:{...item,get enhance(){assert.fail('Filtered-out item was evaluated');}});
  for(const inventorySort of ['power','rarity','level'])exact(items,{inventorySort,inventorySlot:'armor'});
});
