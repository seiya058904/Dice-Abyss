import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {eventChoices} from '../src/encounters.js';
import {eventChoicePreview} from '../src/event-preview.js';
import {MAX_ITEM_LEVEL} from '../src/equipment.js';
import {CATALOG} from '../src/equipment-content.js';
import {eventFixture} from '../scripts/audit-event-context.mjs';

// Seeded, validator-accepted constructed room states. Real event entry and
// settlement are the oracle; these cases do not claim natural encounter rates.
const keys=['spring','prayer','hollow_scale','silent_anvil','echochamber','wardbank'];
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function fixture(key,{seed=17017,beforeEnter}={}){
 const mystery=['hollow_scale','silent_anvil'].includes(key);
 for(let offset=0;offset<300;offset++){
  const s=eventFixture({E,S},mystery?'mystery':key,{seed:seed+offset,floor:140,rich:true,beforeEnter});
  if(!mystery||s.event.key===key)return s;
 }
 throw Error(`Could not generate ${key}`);
}
const apply=(s,id,confirmed=true)=>E.transition(s,{type:'event-choice',id,confirmed});
const byKey=(quote,key)=>quote.rows.find(row=>row.key===key);
function actualValue(state,row){
 switch(row.key){
  case 'hp':return state.player.hp;
  case 'maxHp':return E.stats(state).maxHp;
  case 'ward':return state.ward||0;
  case 'gold':return state.player.gold;
  case 'eventLuck':return state.eventLuck||0;
  case 'eventPower':return (state.eventPower||0)/100;
  case 'luck':return E.stats(state).luck;
  case 'targetLevel':return state.player.items.find(item=>item.id===row.targetId).level;
  case 'targetLevelXp':return state.player.items.find(item=>item.id===row.targetId).levelXp;
  case 'targetEnhance':return state.player.items.find(item=>item.id===row.targetId).enhance;
  case 'inventoryCount':return state.player.items.length;
  case 'reservedWard':return state.v5Boons?.ward||0;
  case 'reservedEcho':return state.v5Boons?.echo||0;
  default:throw Error(`Unreviewed row ${row.key}`);
 }
}
function verify(s,id){
 assert(S.validateSave(s));const raw=S.encodeSave(s),quote=eventChoicePreview(s,id),option=eventChoices(s).find(o=>o.id===id);
 assert(quote);assert.equal(quote.key,s.event.key);assert.equal(quote.choiceId,id);assert.equal(quote.available,!option.disabled);
 const after=apply(s,id);
 if(option.disabled){assert.strictEqual(after,s);assert.deepEqual(quote.rows,[]);assert.equal(quote.reason,option.reason);}
 else{
  assert.notStrictEqual(after,s);assert(S.validateSave(after));assert.equal(quote.reason,'');assert(quote.rows.length);
  for(const row of quote.rows){assert.equal(row.before,actualValue(s,row),row.key);assert.equal(row.after,actualValue(after,row),row.key);assert.equal(row.delta,row.after-row.before);}
  assert.equal(after.rng,s.rng,'the selected deterministic event must not consume RNG');assert.equal(after.nextId,s.nextId);
  assert.strictEqual(apply(after,id),after,'choice can only commit once');assert.equal(eventChoicePreview(after,id),null);
  assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);
  if(option.confirm)assert.strictEqual(apply(s,id,false),s,'a preview cannot authorize a purchase');
 }
 assert.equal(S.encodeSave(s),raw,'preview and settlement both leave the original state untouched');return {quote,after};
}

test('spring previews exact current HP and ward, including zero healing and preserved larger shields',()=>{
 for(const hpMode of ['full','one','half'])for(const wardMode of ['zero','low','high'])for(const id of ['heal','ward']){
  const s=fixture('spring');s.player.hp=hpMode==='full'?E.stats(s).maxHp:hpMode==='one'?1:Math.floor(E.stats(s).maxHp/2);
  s.ward=wardMode==='zero'?0:wardMode==='low'?1:E.stats(s).maxHp*2;
  const {quote}=verify(s,id);assert.deepEqual(quote.rows.map(r=>r.key),['hp','ward']);
  if(hpMode==='full')assert.equal(byKey(quote,'hp').delta,0);
  if(wardMode==='high')assert.equal(byKey(quote,'ward').delta,0);
 }
});

test('spring uses engine floor rounding at fractional 10/35 percent boundaries and maximum health',()=>{
 for(let seed=1;seed<=31;seed++)for(const id of ['heal','ward']){
  const s=fixture('spring',{seed});s.player.hp=1;s.ward=0;verify(s,id);
 }
 const huge=fixture('spring',{beforeEnter:s=>{s.player.talents.vitality=1000000;for(const item of s.player.items){item.level=MAX_ITEM_LEVEL;item.levelXp=0;}s.player.hp=1;return s;}});
 assert.equal(E.stats(huge).maxHp,1e15);for(const id of ['heal','ward'])verify(huge,id);
});

test('prayer quotes stored HP and gold prices after armor swaps without repricing or guessing damage',()=>{
 const initial=fixture('prayer'),changed=E.transition(initial,{type:'equip',id:'i6'});
 assert.notStrictEqual(changed,initial);assert.notEqual(E.stats(changed).maxHp,E.stats(initial).maxHp);
 assert.equal(changed.event.costHp,initial.event.costHp);assert.equal(changed.event.costGold,initial.event.costGold);
 for(const s of [initial,changed])for(const id of ['luck','power']){
  const {quote}=verify(s,id);assert.equal(byKey(quote,id==='luck'?'gold':'hp').delta,-s.event[id==='luck'?'costGold':'costHp']);
 }
});

test('prayer caps temporary bonuses and distinguishes their contribution from effective luck',()=>{
 let distinctEffectiveGain=false;
 for(const luck of [0,8,15,19,20])for(const power of [0,15,29,30]){
  const s=fixture('prayer');s.eventLuck=luck;s.eventPower=power;s.nextLuck=24;s.player.talents.luck=5;
  const entry=CATALOG.relic.reduce((best,item)=>(item.effects?.luck||0)>(best.effects?.luck||0)?item:best);
  for(const slot of ['relic','relic2','relic3']){
   const item=E.makeItem(s,'relic',entry.rarity);Object.assign(item,{catalogId:entry.id,name:entry.name,profile:entry.profile,theme:entry.theme});s.player.items.push(item);s.player.equipped[slot]=item.id;
  }
  for(const id of ['luck','power'])verify(s,id);
  const q=eventChoicePreview(s,'luck');if(q.available){assert(byKey(q,'eventLuck').after<=20);assert(byKey(q,'luck').after<=200);assert(E.stats(s).rawLuck>100);if(byKey(q,'luck').delta!==byKey(q,'eventLuck').delta)distinctEffectiveGain=true;}
 }
 assert(distinctEffectiveGain,'effective lucky total must not be approximated by adding raw temporary points');
});

test('hollow scale previews permanent max HP and actual HP clipping for full and wounded players',()=>{
 for(const scars of [0,1,3,4])for(const hpMode of ['full','one','half']){
  const s=fixture('hollow_scale');s.player.pactScars=scars;const max=E.stats(s).maxHp;s.player.hp=hpMode==='full'?max:hpMode==='one'?1:Math.floor(max/2);
  const {quote}=verify(s,'accept');assert(byKey(quote,'maxHp').after<=byKey(quote,'maxHp').before);
  assert.equal(byKey(quote,'targetLevel').delta,3);assert(byKey(quote,'hp').delta<=0);
  if(hpMode==='full')assert(byKey(quote,'hp').delta<0);else assert.equal(byKey(quote,'hp').delta,0);
 }
});

test('hollow scale follows the original registered weapon after a swap and preserves its exact XP',()=>{
 const s=fixture('hollow_scale'),target=s.player.items.find(item=>item.id===s.event.targetId);target.levelXp=17;
 const spare=E.makeItem(s,'weapon',1);s.player.items.push(spare);s.player.hp=E.stats(s).maxHp;
 const changed=E.transition(s,{type:'equip',id:spare.id}),{quote,after}=verify(changed,'accept');
 assert.equal(byKey(quote,'targetLevel').targetId,target.id);assert.equal(after.player.items.find(item=>item.id===target.id).levelXp,17);
 assert.deepEqual(after.player.items.find(item=>item.id===spare.id),spare);
});

test('hollow scale respects item level cap, XP clearing at cap and rounded capped-health results',()=>{
 for(const remaining of [1,2,3]){
  const s=fixture('hollow_scale'),target=s.player.items.find(item=>item.id===s.event.targetId);target.level=MAX_ITEM_LEVEL-remaining;target.levelXp=17;
  s.player.talents.vitality=1000000;s.player.items.find(item=>item.id===s.player.equipped.armor).level=MAX_ITEM_LEVEL;s.player.hp=E.stats(s).maxHp;
  const {quote}=verify(s,'accept');assert.equal(byKey(quote,'targetLevel').after,MAX_ITEM_LEVEL);assert.equal(byKey(quote,'targetLevel').delta,remaining);
  assert.equal(byKey(quote,'targetLevelXp').after,0);assert.equal(byKey(quote,'maxHp').before,1e15);assert.equal(byKey(quote,'maxHp').after,1e15);
 }
});

test('silent anvil shows exactly one consumed old item and capped target enhancement without touching Lv/XP',()=>{
 for(const enhance of [0,17,18,19]){
  const s=fixture('silent_anvil'),target=s.player.items.find(item=>item.id===s.event.targetId);target.enhance=enhance;target.levelXp=17;
  const {quote,after}=verify(s,'accept');assert.equal(byKey(quote,'inventoryCount').delta,-1);assert.equal(byKey(quote,'targetEnhance').delta,Math.min(2,20-enhance));
  assert.equal(after.player.items.find(item=>item.id===target.id).level,target.level);assert.equal(after.player.items.find(item=>item.id===target.id).levelXp,target.levelXp);
 }
});

test('a contradictory imported anvil reference never promises an upgrade for the item being consumed',()=>{
 let s=fixture('silent_anvil');const target=s.player.items.find(item=>item.id===s.event.targetId);target.enhance=5;
 const replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);s=E.transition(s,{type:'equip',id:replacement.id});s.event.offerId=target.id;
 // Normal entry cannot reserve its equipped target as an old material. This
 // malformed-reference case only guards the new display against a false gain;
 // it deliberately does not enshrine the existing transaction's asset loss.
 const preview=eventChoicePreview(s,'accept');assert(preview===null||preview.available===false);
});

test('echo and ward purchases quote real stored prices and defer the reward until the next battle',()=>{
 for(const key of ['echochamber','wardbank'])for(const price of [0,17,100000000]){
  const s=fixture(key);s.event.costGold=price;s.player.gold=10000000000;s.ward=12345;delete s.v5Boons;
  const {quote,after}=verify(s,'accept');assert.equal(byKey(quote,'gold').delta,price?-price:0);assert.equal(after.ward,s.ward);
  assert.equal(byKey(quote,key==='wardbank'?'reservedWard':'reservedEcho').after,1);
  if(key==='wardbank'){assert.equal(byKey(quote,'ward'),undefined);assert.match(quote.notes.join(''),/当前护盾不变.*50%/);}
  const battle=E.transition(after,{type:'next'});assert.equal(battle.phase,'combat');assert.equal(battle.v5Boons[key==='wardbank'?'ward':'echo'],0);
  if(key==='echochamber')assert.equal(battle.enemy.openingEcho,.25);else assert(battle.ward>after.ward);
 }
});

test('unavailable purchases, lethal costs, missing targets and protection changes have no after-state and spend nothing',()=>{
 const variants=[];
 for(const key of ['prayer','echochamber','wardbank']){const s=fixture(key);s.player.gold=0;variants.push([s,key==='prayer'?'luck':'accept']);}
 for(const offset of [0,-1]){const s=fixture('prayer');s.player.hp=s.event.costHp+offset;variants.push([s,'power']);}
 for(const key of ['echochamber','wardbank']){const s=fixture(key);s.v5Boons[key==='wardbank'?'ward':'echo']=1;variants.push([s,'accept']);}
 const capped=fixture('hollow_scale');capped.player.pactScars=5;capped.player.hp=E.stats(capped).maxHp;variants.push([capped,'accept']);
 const gone=fixture('hollow_scale');gone.event.targetId=null;variants.push([gone,'accept']);
 const locked=fixture('silent_anvil');variants.push([E.transition(locked,{type:'lock',id:locked.event.offerId}),'accept']);
 const equipped=fixture('silent_anvil');variants.push([E.transition(equipped,{type:'equip',id:equipped.event.offerId}),'accept']);
 for(const [s,id]of variants){const {quote}=verify(s,id);assert.equal(quote.available,false);}
});

test('previews remain detached and byte-exact with frozen saves, unknown metadata and repeated reads',()=>{
 for(const key of keys){
  const s=fixture(key);s.auditMetadata={text:'完整字段 😀',nested:[{value:17}]};for(const item of s.player.items)item.extra={rows:[{keep:item.id}]};
  const raw=S.encodeSave(s);freeze(s);
  for(const option of eventChoices(s).filter(o=>o.id!=='leave')){
   const first=eventChoicePreview(s,option.id);assert(first);
   for(let i=0;i<4;i++)assert.deepEqual(eventChoicePreview(s,option.id),first);
   if(first.rows.length){first.rows[0].before=-1;assert.notEqual(eventChoicePreview(s,option.id).rows[0].before,-1);}
   verify(s,option.id);
  }
  assert.equal(S.encodeSave(s),raw);
 }
});

test('legacy migration snapshots remain unchanged and never receive an unrelated event preview',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/v4-baseline.json',import.meta.url),'utf8'));
 for(const {raw}of fixtures.saves){const s=S.decodeSave(raw),encoded=S.encodeSave(s);assert.equal(eventChoicePreview(s,'accept'),null);assert.equal(S.encodeSave(s),encoded);}
 assert.equal(eventChoicePreview(E.newGame(17),'heal'),null);
 for(const key of keys){const s=fixture(key);assert.equal(eventChoicePreview(s,'leave'),null);assert.equal(eventChoicePreview(s,'unknown'),null);}
 for(const key of ['gambit','wishingvault','abyssauction']){const s=fixture(key);for(const option of eventChoices(s))assert.equal(eventChoicePreview(s,option.id),null,'no random outcome or hidden reward quote');}
});

test('seeded loadouts and HP/ward/bonus boundaries agree with actual transactions across all supported choices',()=>{
 for(let seed=1;seed<=24;seed++)for(const key of keys){
  const s=fixture(key,{seed:seed*7919});s.player.pactScars=seed%5;s.eventLuck=seed%21;s.eventPower=seed%31;s.nextLuck=seed%25;
  s.player.hp=Math.max(1,Math.floor(E.stats(s).maxHp*(seed%9+1)/10));s.ward=seed%3?0:E.stats(s).maxHp*2;
  s.player.items.find(item=>item.id===s.player.equipped.weapon).enhance=seed%20;
  for(const option of eventChoices(s).filter(o=>o.id!=='leave'))verify(s,option.id);
 }
});
