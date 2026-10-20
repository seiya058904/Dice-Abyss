import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,stats,canAct} from '../src/engine.js';
import {CATALOG_BY_ID} from '../src/equipment-content.js';
import {center,gameView,settingsView,comparison,equipmentComparisonView} from '../src/views.js';
import {encodeSave,decodeSave,measureSaveCapacity,validateSave} from '../src/storage.js';
import {saveCapacityView} from '../src/save-capacity-view.js';

const ui={view:'game',busy:false};
function gear(catalogId,id,level=80){const e=CATALOG_BY_ID.get(catalogId);return {id,catalogId,slot:e.slot,rarity:e.rarity,profile:e.profile,theme:e.theme,name:e.name,level,levelXp:0,enhance:0,depth:140,locked:false};}
function build(){const s=newGame(12012);s.floor=140;s.player.level=80;s.player.items=[gear('weapon-6-0-7','i1'),gear('armor-0-0-0','i2'),gear('relic-0-0-0','i3'),gear('weapon-0-0-7','i4',84)];s.nextId=5;s.player.hp=stats(s).maxHp;assert(validateSave(s));return s;}
function merchant(type='merchant'){let s=newGame(121);s.fate=[2,3];s.route=[type,'combat','rest','combat','gold','elite'].map((type,i)=>({id:`f1r${i}`,type,quality:0,done:false}));s.phase='route';s.player.gold=100000;s=transition(s,{type:'enter'});return s;}

test('a first-hit tradeoff cannot be presented as an unqualified upgrade on equipment cards',()=>{
 const s=build(),before=encodeSave(s),candidate=s.player.items[3],html=comparison(s,candidate);
 assert(html.includes('条件需权衡'));assert(html.includes('基础伤害估值 +9%'));assert(html.includes('首击词条未计入'));
 assert(!html.includes('估算提升'));assert.equal(encodeSave(s),before);
 const detail=equipmentComparisonView(s,candidate);assert(detail.includes('data-comparison-key="firstBonus"'));assert(detail.includes('每场首次掷骰'));assert(detail.includes('24%<span>→</span>0%'));assert(detail.includes('未计入估值'));
});

test('comparison details escape player-visible names and preserve inventory, RNG and revision',()=>{
 const s=build(),candidate=s.player.items[3];candidate.name='<img src=x onerror=alert(1)>';const before=encodeSave(s);
 const html=equipmentComparisonView(s,candidate);assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert(!html.includes('<img src=x'));assert.equal(encodeSave(s),before);
});

test('reward cards use the current owned item while the received snapshot stays unchanged',()=>{
 let s=newGame(913);s=transition(s,{type:'fate'});s=transition(s,{type:'enter'});s.enemy.hp=1;s.enemy.shield=0;s=transition(s,{type:'roll'});s=transition(s,{type:'open'});
 const id=s.loot.item.id;s=transition(s,{type:'lock',id});assert.equal(s.loot.item.locked,false);assert.equal(s.player.items.find(i=>i.id===id).locked,true);
 for(const state of [s,decodeSave(encodeSave(s))]){const html=gameView(state,ui);assert.equal((html.match(new RegExp(`data-id="${id}" aria-pressed="true"`,'g'))||[]).length,2,'center and comparison rail agree on current lock');}
 s=transition(decodeSave(encodeSave(s)),{type:'lock',id});assert.equal(s.loot.item.locked,false);assert.equal((gameView(s,ui).match(new RegExp(`data-id="${id}" aria-pressed="false"`,'g'))||[]).length,2);
});

test('full merchant and black market explain the same inventory restriction enforced by canAct',()=>{
 for(const type of ['merchant','blackmarket']){const s=merchant(type),template=s.player.items[0];while(s.player.items.length<10000)s.player.items.push({...template,id:`i${s.nextId++}`});
  assert(validateSave(s));const offers=s.shop.filter(o=>o.item);assert(offers.length>0);assert(offers.every(o=>!canAct(s,{type:'buy',id:o.id})));
  const html=center(s,ui);assert(html.includes('背包已满（10,000 件）'));assert(html.includes('data-action="inventory"'));assert.equal((html.match(/背包容量已满，请先整理闲置装备/g)||[]).length,offers.length);assert(!html.includes('购买后在背包装备'));
 }
});

test('sold items stay labeled as historical purchases after the owned object changes',()=>{
 let s=merchant();const offer=s.shop.find(o=>o.item);s=transition(s,{type:'buy',id:offer.id});s=transition(s,{type:'lock',id:offer.item.id});
 const html=center(s,ui);assert(html.includes('购入时属性 · 当前状态见背包'));assert.equal(s.shop.find(o=>o.id===offer.id).item.locked,false);
});

test('empty filtered inventory offers clearing both filters without claiming the bag is empty',()=>{
 const s=newGame(1212),html=center(s,{...ui,view:'inventory',inventorySlot:'weapon',inventoryRarity:'7',inventorySort:'level'});
 assert(html.includes('暂无符合筛选的装备'));assert(html.includes('data-action="inventory-reset"'));assert(html.includes('清除筛选'));assert(!html.includes('背包暂时为空'));
});

test('settings capacity check is explicit, disabled without a readable save, and does not imply browser quota',()=>{
 const preferences={sound:false,effects:'low',scale:1};
 for(const [hasSave,rawOnly,enabled]of [[false,false,false],[true,true,false],[true,false,true]]){const html=settingsView(preferences,hasSave,false,rawOnly);const control=html.match(/<button[^>]*data-action="save-capacity"[^>]*>/)?.[0];assert(control);assert.equal(!control.includes('disabled'),enabled);assert(html.includes('id="save-capacity-result"'));}
 const s=newGame(123),raw=encodeSave(s),html=saveCapacityView(measureSaveCapacity(s));assert(html.includes('data-capacity-status="ok"'));assert(html.includes('不是浏览器剩余空间'));assert(html.includes('5,000,000'));assert.equal(encodeSave(s),raw);
});

test('capacity messages distinguish exact exhaustion from oversized historical data without promising a successful cleanup',()=>{
 const base={bytes:5000000,limitBytes:5000000,remainingBytes:0,excessBytes:0,status:'at-limit'};
 const exact=saveCapacityView(base),over=saveCapacityView({...base,bytes:5000321,excessBytes:321,status:'over-limit'});
 assert(exact.includes('已没有增长余量'));assert(exact.includes('仍须通过保存校验'));assert(over.includes('超出 321 字节'));assert(over.includes('不会自动删除'));assert(over.includes('回到上限以内时才能提交'));
});
