import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {newGame,makeItem,stats} from '../src/engine.js';
import {encodeSave,decodeSave} from '../src/storage.js';
import {center} from '../src/views.js';
import {selectInventoryItems} from '../src/inventory-query.js';
import {createInventoryPageSelection} from '../src/inventory-page.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

function fixture(count=180) {
  const state=newGame(25025);state.runId='round25-page-selection';state.floor=200;state.player.level=100;
  while(state.player.items.length<count)state.player.items.push(makeItem(state,undefined,state.nextId%8));
  state.player.hp=stats(state).maxHp;state.futureMetadata={nested:['雪 😀',null,{keep:true}]};
  return state;
}

test('consecutive page choices preserve the exact full filtered order and rendered cards',()=>{
  const state=fixture(10000),cache=createInventoryPageSelection(),before=encodeSave(state);
  for(const ui of [
    {view:'inventory'},
    {view:'inventory',inventorySort:'rarity',inventorySlot:'weapon'},
    {view:'inventory',inventorySort:'level',inventorySlot:'armor'},
    {view:'inventory',inventorySlot:'relic',inventoryRarity:'7'},
    {view:'inventory',inventoryDefense:'regen'},
    {view:'inventory',inventoryQuery:'不存在',inventoryQueryDraft:'未提交 <草稿>'},
  ]){
    const expected=selectInventoryItems(state.player.items,ui),selected=cache.read(state,ui);
    assert.deepEqual(selected,expected);
    for(const inventoryPage of [0,1,2,999,-1]){
      const page={...ui,inventoryPage},again=cache.read(state,page,{pageOnly:true});
      assert.equal(again,selected,'Only a consecutive page action reuses the selection');
      assert.equal(center(state,page,undefined,again),center(state,page),'Complete HTML remains equal for each page');
      for(let index=0;index<again.length;index++)assert.equal(again[index],expected[index]);
    }
  }
  assert.equal(encodeSave(state),before);assert.deepEqual(decodeSave(before),state);
});

test('page reuse removes repeated full-bag sorting work without altering tied order',()=>{
  const state=fixture(120),cache=createInventoryPageSelection(),ui={inventorySort:'power'};
  for(const item of state.player.items){item.level=100;item.levelXp=0;item.enhance=0;}
  let reads=0;
  for(const item of state.player.items)Object.defineProperty(item,'enhance',{enumerable:true,configurable:true,get(){reads++;return 0;}});
  const expected=selectInventoryItems(state.player.items,ui);reads=0;
  const first=cache.read(state,ui);assert(reads>0);assert.deepEqual(first,expected);
  reads=0;const next=cache.read(state,{...ui,inventoryPage:1},{pageOnly:true});
  assert.equal(reads,0);assert.equal(next,first);
  reads=0;cache.read(state,ui);assert(reads>0,'Even unchanged explicit filters select freshly');
});

test('every criterion and exact state, item-array or run replacement invalidates a page result',()=>{
  const state=fixture(),cache=createInventoryPageSelection();let ui={inventorySort:'power'};
  let previous=cache.read(state,ui);
  for(const change of [{inventorySlot:'weapon'},{inventoryRarity:'0'},{inventoryQuery:'之'},{inventoryDefense:'barrier'},{inventorySort:'level'}]){
    ui={...ui,...change};const selected=cache.read(state,ui,{pageOnly:true});
    assert.notEqual(selected,previous);assert.deepEqual(selected,selectInventoryItems(state.player.items,ui));previous=selected;
  }
  const replacement=structuredClone(state);assert.notEqual(cache.read(replacement,ui,{pageOnly:true}),previous);
  previous=cache.read(state,ui);state.player.items=[...state.player.items];
  assert.notEqual(cache.read(state,ui,{pageOnly:true}),previous);
  previous=cache.read(state,ui);state.runId='another-run';
  assert.notEqual(cache.read(state,ui,{pageOnly:true}),previous);
});

test('an explicit new read and ordinary complete views observe same-object edits',()=>{
  const state=fixture(),cache=createInventoryPageSelection(),ui={view:'inventory',inventorySort:'level'};
  const first=cache.read(state,ui),oldHtml=center(state,ui);
  state.player.items[0].level=999;state.player.items[0].locked=true;
  const selected=cache.read(state,ui);
  assert.notEqual(selected,first);assert.equal(selected[0],state.player.items[0]);
  assert.notEqual(center(state,ui),oldHtml);assert.equal(center(state,ui,undefined,selected),center(state,ui));
});

test('clearing the app-owned page result forces a fresh read even for matching state and criteria',()=>{
  const state=fixture(),cache=createInventoryPageSelection(),ui={inventorySort:'power'},first=cache.read(state,ui);
  cache.clear();const next=cache.read(state,ui,{pageOnly:true});
  assert.notEqual(next,first);assert.deepEqual(next,first);
});

async function appFixture() {
  const f=await recoveryFixture(fileURLToPath(new URL('../',import.meta.url)),{state:fixture()});
  let markup=f.app.innerHTML;const html=[],counts={full:0,local:0};
  Object.defineProperty(f.app,'innerHTML',{get:()=>markup,set:value=>{counts.full++;markup=value;}});
  const root={childNodes:[],classList:{contains:name=>name==='inventory-screen'},cloneNode(){return this;},isEqualNode:()=>true,querySelectorAll:()=>[]};
  f.app.querySelector=selector=>selector==='.inventory-screen'?root:null;
  const create=f.app.ownerDocument.createElement;
  f.app.ownerDocument.createElement=tag=>tag==='template'?{content:null,set innerHTML(value){counts.local++;html.push(value);this.content={firstElementChild:root,childElementCount:1};}}:create(tag);
  await f.click('inventory');return {...f,html,counts};
}

test('real app pages stay read-only and gameplay commits invalidate previous selections',async()=>{
  const f=await appFixture();
  await f.click('filter',{slot:'weapon'});await f.click('inventory-page',{page:'1'});await f.click('inventory-page',{page:'0'});
  assert.equal(f.counts.full,1);assert.equal(f.counts.local,3);assert.equal(f.S.encodeSave(f.probe.state),f.original);assert.deepEqual(f.writes,[]);
  assert.equal(f.html.at(-1),center(f.probe.state,f.probe.ui));
  const candidate=f.probe.state.player.items.find(item=>item.slot==='weapon'&&!item.locked);
  await f.click('lock',{id:candidate.id});assert.equal(f.counts.full,2);
  await f.click('inventory-page',{page:'1'});assert.equal(f.html.at(-1),center(f.probe.state,f.probe.ui));
  assert.equal(f.map.get(f.S.SAVE_KEY),f.map.get(f.S.BACKUP_KEY));assert.equal(f.writes.length,2);
});

test('real app view departure and full redraw discard prior page snapshots',async()=>{
  const f=await appFixture();await f.click('filter',{slot:'armor'});await f.click('inventory-page',{page:'1'});
  await f.click('game');await f.click('inventory');
  await f.click('inventory-page',{page:'1'});
  assert.equal(f.html.at(-1),center(f.probe.state,f.probe.ui));
  assert.equal(f.counts.full,3);assert.equal(f.counts.local,3);assert.deepEqual(f.writes,[]);
});
