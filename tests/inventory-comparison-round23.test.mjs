import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import {encodeSave} from '../src/storage.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
import {MAX_ITEM_LEVEL,levelXpNeeded} from '../src/equipment.js';
import {center,num} from '../src/views.js';

function fixture(){
 const s=E.newGame(23023);s.runId='round23-comparison';s.floor=200;s.player.level=100;s.player.gold=1_000_000;
 for(let i=0;i<67;i++)s.player.items.push(E.makeItem(s,['weapon','armor','relic'][i%3],i%8));
 s.player.talents.power=3;s.player.talents.critical=2;s.player.talents.resonance=3;s.player.talents.luck=4;
 s.player.equipped.relic2=s.player.items[5].id;s.player.equipped.relic3=s.player.items[8].id;
 s.player.hp=E.stats(s).maxHp;
 s.futureMetadata={nested:['雪 😀',null,{keep:17}],numberLooking:'9007199254740993'};
 return s;
}
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const individual=(s,items,slot)=>items.map(item=>E.compareEquipment(s,item,slot));

test('synchronous equipment batches exactly match individual comparisons across slots, rarities and extremes',()=>{
 assert.equal(typeof E.compareEquipmentBatch,'function');
 const s=fixture(),items=[...s.player.items];
 for(const entry of [...CATALOG_BY_ID.values()].filter((_,i)=>i%47===0))items.push({id:'i99991',catalogId:entry.id,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,depth:200,level:83,levelXp:31,enhance:4});
 items.push({...s.player.items[0],id:'i99992',legacy:true,level:MAX_ITEM_LEVEL,levelXp:0,enhance:20});
 items.push({...s.player.items[1],id:'i99993',level:MAX_ITEM_LEVEL-1,levelXp:levelXpNeeded(MAX_ITEM_LEVEL-1)-1});
 const before=encodeSave(s);
 for(const slot of [undefined,'relic','relic2','relic3','not-a-slot'])assert.deepEqual(E.compareEquipmentBatch(s,items,slot),individual(s,items,slot));
 assert.equal(encodeSave(s),before);
});

test('relic batches preserve first empty slots, weakest full slots and stable equal-power ties',()=>{
 const s=fixture(),candidate=s.player.items[11],slots=['relic','relic2','relic3'];
 for(const filled of [1,2,3]){
  for(let i=1;i<3;i++)s.player.equipped[slots[i]]=i<filled?s.player.items[5+i*3].id:null;
  const expected=E.compareEquipment(s,candidate),actual=E.compareEquipmentBatch(s,[candidate])[0];
  assert.deepEqual(actual,expected);if(filled<3)assert.equal(actual.slot,slots[filled]);
 }
 const original=s.player.items.find(item=>item.id===s.player.equipped.relic);
 for(const slot of slots.slice(1)){
  const item=s.player.items.find(item=>item.id===s.player.equipped[slot]);
  Object.assign(item,{...original,id:item.id});
 }
 assert.equal(E.compareEquipmentBatch(s,[candidate])[0].slot,'relic');
 for(const slot of slots)assert.equal(E.compareEquipmentBatch(s,[candidate],slot)[0].slot,slot);
});

test('each new batch and complete inventory render observe same-object changes without retained state',()=>{
 const s=fixture(),items=s.player.items.slice(9,15),ui={view:'inventory',inventorySort:'level',inventoryPage:0};
 const changes=[()=>{},()=>{s.player.equipped.weapon=items[0].id;},()=>{items[0].level+=100;},()=>{s.player.talents.power++;},()=>{s.nextLuck=17;},()=>{s.player.hp=1;},()=>{s.player.equipped.relic2=null;},()=>{s.futureMetadata.nested[2].keep++;}];
 let first;
 for(const change of changes){
  change();const before=encodeSave(s),expected=individual(s,items);
  assert.deepEqual(E.compareEquipmentBatch(s,items),expected);
  const html=center(s,ui);assert(html.includes('class="inventory-list"'));assert.equal(encodeSave(s),before);
  first??=expected;
 }
 assert.notDeepEqual(E.compareEquipmentBatch(s,items),first);
});

test('frozen states, repeated candidates and caller-edited result rows cannot share mutable comparison output',()=>{
 const s=freeze(fixture()),candidate=s.player.items[6],items=freeze([candidate,candidate]),before=encodeSave(s);
 const actual=E.compareEquipmentBatch(s,items),expected=individual(s,items);
 assert.deepEqual(actual,expected);assert.notEqual(actual[0],actual[1]);assert.notEqual(actual[0].core,actual[1].core);
 assert(actual[0].core.length);assert.notEqual(actual[0].core[0],actual[1].core[0]);
 actual[0].core[0].before=-123;actual[0].grade='Caller annotation';
 assert.deepEqual(actual[1],expected[1]);assert.deepEqual(E.compareEquipmentBatch(s,items),expected);assert.equal(encodeSave(s),before);
});

test('batch preparation is local, lazy for damage, and cannot be supplied through public comparison arguments',()=>{
 assert.deepEqual(E.compareEquipmentBatch(new Proxy({},{get(){assert.fail('empty batches need no state');}}),[]),[]);
 const s=fixture(),armors=s.player.items.filter(item=>item.slot==='armor').slice(0,4);
 Object.defineProperty(s.player.talents,'power',{get(){assert.fail('armor-only comparisons must not calculate damage expectation');},configurable:true});
 assert.deepEqual(E.compareEquipmentBatch(s,armors),individual(s,armors));
 const plain=fixture(),candidate=plain.player.items[6],expected=E.compareEquipment(plain,candidate);
 const forged={before:{attack:0,maxHp:0},damage:0,trust:true};
 assert.deepEqual(E.compareEquipment(plain,candidate,undefined,forged),expected);
 assert.deepEqual(E.compareEquipmentBatch(plain,[candidate],undefined,forged),[expected]);
});

test('a batch removes repeated baseline stat reads while each candidate still computes its own changed build',()=>{
 const s=fixture(),items=s.player.items.slice(9,21);let criticalReads=0;
 Object.defineProperty(s.player.talents,'critical',{get(){criticalReads++;return 2;},configurable:true});
 const expected=individual(s,items),singleReads=criticalReads;criticalReads=0;
 const actual=E.compareEquipmentBatch(s,items),batchReads=criticalReads;
 assert.deepEqual(actual,expected);assert.equal(singleReads,items.length*4);assert.equal(batchReads,(items.length+1)*2);
});

test('compact number formatting exactly preserves locale, threshold, rounding and existing Number coercions',()=>{
 const previous=n=>Math.abs(Number(n||0))>=1e9?Number(n||0).toLocaleString('zh-CN',{notation:'compact',maximumFractionDigits:2}):Number(n||0).toLocaleString('en-US');
 for(const value of [undefined,null,false,true,'',0,-0,NaN,Infinity,-Infinity,1,-1,.00001,.99999,1000,999_999_999,999_999_999.999,1e9,1e9+1,1_234_567_891,9_999_999_999,1e10,1e13,1e15,Number.MAX_SAFE_INTEGER,Number.MAX_VALUE,'1000000000','-1234567891','not-a-number',1_000_000_000n]){
  assert.equal(num(value),previous(value),String(value));
  if(typeof value==='number')assert.equal(num(-value),previous(-value),`negative ${value}`);
 }
 for(const key of ['valueOf',Symbol.toPrimitive]){
  const coercions=formatter=>{let reads=0;const value={[key](){return ++reads===1?1e9:2e9;}};return {value:formatter(value),reads};};
  assert.deepEqual(coercions(num),coercions(previous));
 }
 assert.throws(()=>num(Symbol('not numeric')),TypeError);
});
