import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {newGame,stats,salvagePreview} from '../src/engine.js';
import {itemStats,itemValue,migrateEquipment,validEquipment} from '../src/equipment.js';
import {CATALOG,CATALOG_BY_ID,AFFINITIES} from '../src/equipment-content.js';
import {encodeSave,decodeSave,validateSave} from '../src/storage.js';
import {center} from '../src/views.js';
import * as query from '../src/inventory-query.js';

const keys=['regen','barrier','reduction'];
const ids=items=>items.map(item=>item.id);
const ordered=(items,sort)=>items.toSorted((a,b)=>sort==='rarity'?b.rarity-a.rarity||itemValue(b)-itemValue(a):sort==='level'?b.level-a.level||itemValue(b)-itemValue(a):itemValue(b)-itemValue(a));
function item(catalogId,id,overrides={}) {
  const entry=CATALOG_BY_ID.get(catalogId);assert(entry,catalogId);
  return {id,catalogId,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,depth:140,level:40,levelXp:0,enhance:0,locked:false,...overrides};
}
function scene(extra=[]) {
  const s=newGame(19019);s.runId='constructed-inventory-defense-regression';s.floor=140;s.player.level=100;
  s.player.items=[item('weapon-0-0-0','i1'),item('armor-2-0-0','i2'),item('relic-0-0-0','i3'),...extra];
  s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};
  s.nextId=Math.max(...s.player.items.map(item=>Number(item.id.slice(1))))+1;
  s.player.hp=stats(s).maxHp;s.qaDefense={preserve:{unknown:['雪',null,17]}};
  assert(validateSave(s));return s;
}
function card(html,id) {
  const found=[...html.matchAll(/<article class="item-card\b[\s\S]*?<\/article>/g)].find(match=>match[0].includes(`data-action="lock" data-id="${id}"`));
  assert(found,`rendered item ${id}`);return found[0];
}

test('defense selector has three exact effect IDs with explicit player labels',()=>{
  assert.equal(typeof query.inventoryDefense,'function','new selector normalizer is required');
  assert.deepEqual(query.INVENTORY_DEFENSE_FILTERS,[{key:'regen',label:'存活恢复'},{key:'barrier',label:'开战护盾'},{key:'reduction',label:'基础减伤'}]);
  for(const value of keys)assert.equal(query.inventoryDefense(value),value);
  for(const value of [undefined,null,false,0,[],{},'',' regen','regen ','REGEN','defense','healBonus','__proto__','constructor','toString'])assert.equal(query.inventoryDefense(value),'');
});

test('every authored item matches its actual positive base effect across all three selectors',()=>{
  const entries=Object.values(CATALOG).flat(),items=entries.map((entry,index)=>Object.freeze(item(entry.id,`i${index+1}`)));
  Object.freeze(items);assert.equal(entries.length,1536);
  for(const inventoryDefense of keys){
    // The oracle reads authored effects directly, independently of itemStats and the selector.
    const expected=ordered(items.filter((_,index)=>(entries[index].effects[inventoryDefense]||0)>0),'power');
    const selected=query.selectInventoryItems(items,{inventoryDefense});
    assert.deepEqual(ids(selected),ids(expected),inventoryDefense);
    assert(selected.every(candidate=>items.includes(candidate)),'selection keeps original item references');
  }
});

test('recovery, opening ward and base reduction do not absorb differently triggered effects',()=>{
  const items=[
    ['armor-3-0-3','i4'],['armor-5-0-3','i5'],['v5-armor-3-0-4','i6'],['v5-relic-4-0-4','i7'],
    ['armor-0-0-3','i8'],['armor-4-0-3','i9'],['v5-armor-0-0-4','i10'],['v5-armor-1-0-4','i11'],
    ['v5-armor-2-0-4','i12'],['armor-1-0-3','i13'],['v5-armor-4-0-4','i14'],['armor-2-0-3','i15'],
    ['v4-relic-5-0-3','i16'],
  ].map(([catalogId,id])=>item(catalogId,id));
  const expected={regen:['i4'],barrier:['i8','i11','i16'],reduction:['i10','i13']};
  for(const inventoryDefense of keys)assert.deepEqual(ids(query.selectInventoryItems(items,{inventoryDefense})).sort(),expected[inventoryDefense].toSorted(),inventoryDefense);
  // Deep armor can carry a conditional effect and an independent base effect together.
  assert(itemStats(items.find(item=>item.id==='i10')).criticalWard>0);
  assert(itemStats(items.find(item=>item.id==='i11')).lowWard>0);
});

test('migrated legacy items use preserved affinity semantics even with modern names and catalog IDs',()=>{
  const legacy=keys.map((_,index)=>{
    const current=item(['armor-3-0-3','armor-0-0-3','armor-1-0-3'][index],`i${index+4}`,{name:'存活恢复 开战护盾 基础减伤'});
    const {level,levelXp,...old}=current;
    const migrated=migrateEquipment({...old,growth:12});
    assert(migrated.legacy&&validEquipment(migrated));
    assert(itemStats(migrated)[AFFINITIES[migrated.theme].key]>0);
    return migrated;
  });
  const noCatalog={...legacy[0],id:'i7',theme:9};delete noCatalog.catalogId;
  assert(validEquipment(noCatalog));assert(itemStats(noCatalog).healBonus>0);legacy.push(noCatalog);
  const s=scene(legacy),before=encodeSave(s);
  assert.equal(query.selectInventoryItems(legacy,{inventoryQuery:'恢复'}).length,4,'the original literal-name query remains available');
  for(const inventoryDefense of keys)assert.deepEqual(query.selectInventoryItems(legacy,{inventoryDefense}),[],inventoryDefense);
  assert.equal(encodeSave(s),before);assert.deepEqual(decodeSave(before),s);
});

test('effect selection intersects slot, rarity zero and literal names without making recommendations',()=>{
  const items=[
    item('armor-0-0-0','i4',{name:'Echo <[Guard]>'}),
    item('armor-0-0-0','i5',{name:'Other'}),
    item('armor-0-0-1','i6',{name:'Echo <[Guard]>'}),
    item('v4-relic-5-0-0','i7',{name:'Echo <[Guard]>'}),
    item('armor-3-0-0','i8',{name:'Echo <[Guard]>'}),
  ];
  const ui={inventoryDefense:'barrier',inventorySlot:'armor',inventoryRarity:'0',inventoryQuery:'  ECHO <[GUARD]>  ',inventorySort:'power'},before=structuredClone(ui);
  assert.deepEqual(ids(query.selectInventoryItems(items,ui)),['i4']);
  assert.deepEqual(ids(query.selectInventoryItems(items,{...ui,inventorySlot:'relic'})),['i7']);
  assert.deepEqual(ids(query.selectInventoryItems(items,{...ui,inventorySlot:'',inventoryRarity:''})).sort(),['i4','i6','i7']);
  assert.deepEqual(query.selectInventoryItems(items,{...ui,inventoryQuery:'.*'}),[]);
  assert.deepEqual(ui,before);
});

test('selected effects preserve all existing sort orders and stable equal-value ties',()=>{
  const items=[
    item('armor-3-0-1','i4',{level:20}),item('armor-0-0-7','i5',{level:90}),
    item('armor-3-0-1','i6',{level:20}),item('armor-3-0-2','i7',{level:15}),
    item('armor-9-0-0','i8',{level:100}),
  ];
  for(const inventorySort of ['power','rarity','level']){
    const expected=ordered(items.filter(item=>['i4','i6','i7','i8'].includes(item.id)),inventorySort);
    const selected=query.selectInventoryItems(items,{inventoryDefense:'regen',inventorySort});
    assert.deepEqual(ids(selected),ids(expected),inventorySort);
    assert(selected.indexOf(items[0])<selected.indexOf(items[2]),'equal values retain input order');
  }
});

test('absent or invalid defense conditions retain the entire existing selection contract',()=>{
  const items=[item('armor-3-0-0','i4'),item('armor-0-0-1','i5'),item('weapon-0-0-0','i6')];
  for(const inventoryDefense of [undefined,null,'','regen ','healBonus','__proto__'])for(const inventorySort of ['power','rarity','level']){
    assert.deepEqual(query.selectInventoryItems(items,{inventoryDefense,inventorySort}),ordered(items,inventorySort));
  }
  assert.deepEqual(query.selectInventoryItems(items,{inventoryDefense:'bad',inventorySlot:'weapon'}),[items[2]]);
});

test('default selection never reads effects and active filters reject cheap mismatches before itemStats',()=>{
  const candidate=item('armor-3-0-0','i4',{name:'guard'});
  Object.defineProperty(candidate,'catalogId',{get(){throw Error('effect lookup must be skipped');},enumerable:true});
  for(const inventoryDefense of [undefined,'','invalid'])assert.deepEqual(query.selectInventoryItems([candidate],{inventoryDefense}),[candidate]);
  for(const mismatch of [{inventorySlot:'weapon'},{inventoryRarity:'7'},{inventoryQuery:'not present'}]){
    assert.deepEqual(query.selectInventoryItems([candidate],{inventoryDefense:'regen',...mismatch}),[]);
  }
});

test('query, rendering and comparisons preserve the full state and safety-recycling scope',()=>{
  const s=scene([item('armor-3-0-0','i4',{level:1}),item('armor-0-0-0','i5',{level:2}),item('armor-1-0-3','i6',{locked:true})]);
  const before=encodeSave(s),references=[...s.player.items],salvage=salvagePreview(s,undefined,false,true),plain=center(s,{view:'inventory'});
  assert(salvage?.items.length,'the safety-scope control contains a real recyclable batch');
  for(const inventoryDefense of keys){
    const ui={view:'inventory',inventoryDefense},selected=query.selectInventoryItems(s.player.items,ui),html=center(s,ui);
    for(const candidate of selected)assert.equal(card(html,candidate.id),card(plain,candidate.id),'filtering cannot rewrite item comparison cards');
    assert.deepEqual(salvagePreview(s,undefined,false,true),salvage);
    assert.equal(encodeSave(s),before,'view state must not spend RNG, revise, equip or rewrite unknown fields');
    assert(s.player.items.every((candidate,index)=>candidate===references[index]));
  }
});

test('the tenth-thousand item is filtered before page clamping and remains the real owned object',()=>{
  const extras=Array.from({length:9997},(_,index)=>item(index===9996?'armor-3-0-0':'armor-2-0-0',`i${index+4}`,{level:1,name:'同名防具'}));
  const s=scene(extras),before=encodeSave(s),ui={view:'inventory',inventorySlot:'armor',inventoryDefense:'regen',inventoryPage:166};
  const selected=query.selectInventoryItems(s.player.items,ui);
  assert.equal(selected.length,1);assert.equal(selected[0],s.player.items[9999]);assert.equal(selected[0].id,'i10000');
  const html=center(s,ui);
  assert.equal((html.match(/<article class="item-card/g)||[]).length,1);
  assert(html.includes('第 1 / 1 页'));assert(html.includes('1–1 / 1 件'));assert(html.includes('全背包检查'));
  assert.equal(encodeSave(s),before);assert.equal(ui.inventoryPage,166,'selection and view must not mutate their caller');
});

test('the retained first natural defeat exposes 14 recovery, 11 opening-ward and 12 reduction armors',async()=>{
  const raw=await fs.readFile(new URL('../docs/iteration/evidence/round18/strategy/original-seed-23757-first-death.save.json',import.meta.url),'utf8');
  const s=decodeSave(raw),before=encodeSave(s),armor=s.player.items.filter(item=>item.slot==='armor');
  assert.equal(s.floor,30);assert.equal(s.phase,'dead');assert.equal(s.player.items.length,139);assert.equal(armor.length,48);
  for(const inventoryQuery of ['恢复','防御','护盾'])assert.equal(query.selectInventoryItems(s.player.items,{inventorySlot:'armor',inventoryQuery}).length,0,'name-only search retains its declared contract');
  const expected={regen:14,barrier:11,reduction:12};
  for(const inventoryDefense of keys){
    const selected=query.selectInventoryItems(s.player.items,{inventorySlot:'armor',inventoryDefense});
    assert.equal(selected.length,expected[inventoryDefense],inventoryDefense);
  }
  const recovery=query.selectInventoryItems(s.player.items,{inventorySlot:'armor',inventoryDefense:'regen'});
  assert(recovery.some(item=>item.id==='i123'),'the already-recorded manual-comparison candidate is reachable');
  assert.equal(query.selectInventoryItems(s.player.items,{inventoryDefense:'barrier'}).length,13,'two owned relics also have an opening ward');
  assert.equal(encodeSave(s),before);assert.equal(s.player.hp,0);assert.equal(s.player.equipped.armor,'i127');
});
