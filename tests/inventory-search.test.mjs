import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {newGame,makeItem,itemValue,salvagePreview} from '../src/engine.js';
import {center} from '../src/views.js';
import {encodeSave,decodeSave} from '../src/storage.js';
import {inventoryQuery,selectInventoryItems} from '../src/inventory-query.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

function fixture() {
  const s=newGame(15151);s.floor=140;s.player.level=100;
  const names=['寒潮之刃','寒潮护甲','余火护甲','Echo <Blade>','echo [blade]'];
  for(let i=0;i<names.length;i++){
    const item=makeItem(s,i%2?'armor':'weapon',i%3,140);
    item.name=names[i];item.level=i+5;s.player.items.push(item);
  }
  return s;
}

test('literal name search combines with slot and rarity without changing inventory or RNG',()=>{
  const s=fixture(),before=encodeSave(s),ui={inventoryQuery:'  寒潮 ',inventorySlot:'armor',inventoryRarity:'1'};
  const selected=selectInventoryItems(s.player.items,ui);
  assert.deepEqual(selected.map(i=>i.name),['寒潮护甲']);
  assert.equal(selected[0],s.player.items[4]);
  assert.equal(encodeSave(s),before);assert.deepEqual(decodeSave(before),s);
  assert.equal(ui.inventoryQuery,'  寒潮 ');
});

test('search is case-insensitive literal text, not a regular expression or HTML',()=>{
  const s=fixture();
  assert.equal(selectInventoryItems(s.player.items,{inventoryQuery:'ECHO'}).length,2);
  assert.deepEqual(selectInventoryItems(s.player.items,{inventoryQuery:'[blade]'}).map(i=>i.name),['echo [blade]']);
  assert.equal(selectInventoryItems(s.player.items,{inventoryQuery:'.*'}).length,0);
  const html=center(s,{view:'inventory',inventoryQuery:'<Blade>',inventoryQueryDraft:'"><img src=x onerror=1>'});
  assert(html.includes('&lt;Blade&gt;'));
  assert(!html.includes('<img src=x'));assert(html.includes('&quot;&gt;&lt;img'));
});

test('empty search preserves original ordering for all sorts and equal-value ties',()=>{
  const s=fixture();s.player.items[4].level=s.player.items[5].level=17;
  s.player.items[4].rarity=s.player.items[5].rarity=1;
  s.player.items[4].enhance=s.player.items[5].enhance=0;
  for(const inventorySort of ['power','rarity','level']){
    const expected=s.player.items.toSorted((a,b)=>inventorySort==='rarity'?b.rarity-a.rarity||itemValue(b)-itemValue(a):inventorySort==='level'?b.level-a.level||itemValue(b)-itemValue(a):itemValue(b)-itemValue(a));
    assert.deepEqual(selectInventoryItems(s.player.items,{inventoryQuery:' \t ',inventorySort}),expected);
  }
  assert.equal(inventoryQuery(null),'');assert.equal(inventoryQuery({}),'');
});

test('search covers the complete ten-thousand-item bag before paging and never changes recycling scope',()=>{
  const s=newGame(15152);
  while(s.player.items.length<10000)s.player.items.push(makeItem(s,'weapon',0));
  s.player.items[9999].name='最后的远征';
  const before=encodeSave(s),quote=salvagePreview(s,undefined,false,true);
  const html=center(s,{view:'inventory',inventoryQuery:'最后的远征',inventoryPage:166});
  assert.equal((html.match(/<article class="item-card/g)||[]).length,1);
  assert(html.includes('第 1 / 1 页'));assert(html.includes('1–1 / 1 件'));
  assert(html.includes('全背包检查'));
  assert.deepEqual(salvagePreview(s,undefined,false,true),quote);
  assert.equal(encodeSave(s),before);
});

test('no matches expose a clear-all-filter recovery and an explicit search form',()=>{
  const html=center(fixture(),{view:'inventory',inventoryQuery:'不存在的名称'});
  assert(html.includes('id="inventory-search"'));assert(html.includes('role="search"'));
  assert(html.includes('for="inventory-query"'));assert(html.includes('type="submit"'));
  assert(html.includes('data-action="inventory-reset"'));assert(html.includes('暂无符合筛选的装备'));
});

test('dedicated preparation clears both searched and draft names but ordinary navigation retains them',async()=>{
  const f=await recoveryFixture(fileURLToPath(new URL('../',import.meta.url)));
  Object.assign(f.probe.ui,{view:'game',inventoryQuery:'寒潮',inventoryQueryDraft:'未提交',inventoryRarity:'7'});
  await f.click('inventory');
  assert.equal(f.probe.ui.inventoryQuery,'寒潮');assert.equal(f.probe.ui.inventoryQueryDraft,'未提交');
  await f.click('inventory',{slot:'armor',resetRarity:'true'});
  assert.equal(f.probe.ui.inventoryQuery,'');assert.equal(f.probe.ui.inventoryQueryDraft,'');
  assert.equal(f.probe.ui.inventorySlot,'armor');assert.equal(f.probe.ui.inventoryRarity,'');
  assert.deepEqual(f.writes,[]);assert.equal(f.S.encodeSave(f.probe.state),f.original);
});

test('clear-name retains other filters and clear-all resets all three without a save',async()=>{
  const f=await recoveryFixture(fileURLToPath(new URL('../',import.meta.url)));
  Object.assign(f.probe.ui,{view:'inventory',inventoryQuery:'寒潮',inventoryQueryDraft:'草稿',inventorySlot:'armor',inventoryRarity:'7',inventoryPage:4});
  await f.click('inventory-query-clear');
  assert.equal(f.probe.ui.inventoryQuery,'');assert.equal(f.probe.ui.inventorySlot,'armor');assert.equal(f.probe.ui.inventoryRarity,'7');assert.equal(f.probe.ui.inventoryPage,0);
  Object.assign(f.probe.ui,{inventoryQuery:'寒潮',inventoryQueryDraft:'寒潮'});
  await f.click('inventory-reset');
  for(const key of ['inventoryQuery','inventoryQueryDraft','inventorySlot','inventoryRarity'])assert.equal(f.probe.ui[key],'');
  assert.deepEqual(f.writes,[]);assert.equal(f.S.encodeSave(f.probe.state),f.original);
});
