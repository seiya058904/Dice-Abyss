import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

// DICE_RECOVERY_SOURCE=/path/to/input node --test-reporter=tap tests/inventory-announcements.test.mjs
// Actual app event handlers and rendered view strings execute unchanged. This
// verifies live-region content, not an external screen reader or native DOM QA.
const source=path.resolve(process.env.DICE_RECOVERY_SOURCE||fileURLToPath(new URL('../',import.meta.url)));
const E=await import(pathToFileURL(path.join(source,'src/engine.js')));
const {CATALOG_BY_ID}=await import(pathToFileURL(path.join(source,'src/equipment-content.js')));
const fields=['inventorySlot','inventoryRarity','inventoryDefense','inventoryQuery','inventoryQueryDraft','inventorySort','inventoryPage'];
const choices=f=>Object.fromEntries(fields.map(key=>[key,f.probe.ui[key]]));
const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
function renderedResult(f){
  const match=f.app.innerHTML.match(/<p\b[^>]*id="inventory-search-result"[^>]*>([\s\S]*?)<\/p>/);
  assert(match,'The actual inventory result paragraph must be rendered');
  return match[1].replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>entities[entity]);
}
function item(catalogId,id,name){
  const entry=CATALOG_BY_ID.get(catalogId);assert(entry);
  return {id,catalogId,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name,depth:1,level:1,levelXp:0,enhance:0,locked:false};
}
async function fixture(ui={}){
  const state=E.newGame(19031);
  state.player.items=[
    item('weapon-0-0-0','i1','初火刃'),
    item('armor-2-0-0','i2','普通身甲'),
    item('relic-0-0-0','i3','起行石'),
    item('armor-3-0-1','i4','归息 <Echo>'),
    item('armor-9-0-2','i5','远潮铠'),
    item('armor-0-0-0','i6','开幕甲'),
    item('armor-1-0-1','i7','岩盾甲'),
    item('v4-relic-5-0-1','i8','共潮 <Echo>'),
    item('weapon-0-0-1','i9','晨星 <Echo>'),
  ];
  state.nextId=10;state.player.hp=E.stats(state).maxHp;
  const f=await recoveryFixture(source,{state});
  Object.assign(f.probe.ui,{screen:'game',view:'inventory',inventorySlot:'',inventoryRarity:'',inventoryDefense:'',inventoryQuery:'',inventoryQueryDraft:'',inventorySort:'level',inventoryPage:0},ui);
  // The generic harness deliberately has no parsed DOM. Read textContent from
  // the fresh real view HTML on each query, rather than injecting expected text
  // or a cached pre-render count into the production announcement helper.
  const query=f.app.querySelector;f.resultReads=[];
  f.app.querySelector=selector=>selector==='.inventory-search-result'||selector==='#inventory-search-result'
    ? {get textContent(){const result=renderedResult(f);f.resultReads.push(result);return result;}}
    : query(selector);
  await f.click('inventory');
  assert(f.S.validateSave(f.probe.state));
  f.announcer.textContent='之前的操作通知';
  return f;
}
function noGameWrite(f){
  assert.equal(f.S.encodeSave(f.probe.state),f.original,'Whole state, including unknown nested metadata, is unchanged');
  assert.equal(f.map.get(f.S.SAVE_KEY),f.original);assert.equal(f.map.get(f.S.BACKUP_KEY),f.original);assert.deepEqual(f.writes,[]);
}
function freshAnnouncement(f,count){
  const result=renderedResult(f);
  assert.match(result,new RegExp(`(?:找到|当前) ${count} 件$`),'The independently declared fixture count is visible');
  assert.equal(f.announcer.textContent,result,'Announce the new rendered result, not the prior notice');
  assert.deepEqual(f.resultReads,[result],'One explicit filter action reads the fresh result once');
  assert.equal(f.probe.ui.inventoryPage,0);noGameWrite(f);
}
const change=(f,id,value)=>f.listeners.document.get('change')({target:{id,value}});
const submit=(f,value)=>f.listeners.document.get('submit')({target:{id:'inventory-search',querySelector:selector=>selector==='#inventory-query'?{value}:null},preventDefault(){}});

test('rarity change announces its current count while preserving unsubmitted name text',async()=>{
  const f=await fixture({inventoryQueryDraft:'尚未提交'});f.probe.ui.inventoryPage=3;
  await change(f,'inventory-rarity','1');
  freshAnnouncement(f,4);assert.equal(f.probe.ui.inventoryQuery,'');assert.equal(f.probe.ui.inventoryQueryDraft,'尚未提交');assert.equal(f.probe.ui.inventoryRarity,'1');
});

test('slot change announces all matching armor and leaves other filters intact',async()=>{
  const f=await fixture();f.probe.ui.inventoryPage=3;
  await f.click('filter',{slot:'armor'});
  freshAnnouncement(f,5);assert.equal(f.probe.ui.inventorySlot,'armor');assert.equal(f.probe.ui.inventoryRarity,'');assert.equal(f.probe.ui.inventoryDefense,'');
});

test('clear-name announces the surviving slot and rarity result without clearing those filters',async()=>{
  const f=await fixture({inventorySlot:'armor',inventoryRarity:'1',inventoryQuery:'不存在的旧名',inventoryQueryDraft:'尚未提交'});
  await f.click('inventory-query-clear');
  freshAnnouncement(f,2);assert.equal(f.probe.ui.inventoryQuery,'');assert.equal(f.probe.ui.inventoryQueryDraft,'');assert.equal(f.probe.ui.inventorySlot,'armor');assert.equal(f.probe.ui.inventoryRarity,'1');
});

test('clear-all announces the full bag and clears the new defense filter too',async()=>{
  const f=await fixture({inventorySlot:'armor',inventoryRarity:'1',inventoryDefense:'regen',inventoryQuery:'<Echo>',inventoryQueryDraft:'<Echo>'});
  await f.click('inventory-reset');
  freshAnnouncement(f,9);
  for(const key of ['inventorySlot','inventoryRarity','inventoryDefense','inventoryQuery','inventoryQueryDraft'])assert.equal(f.probe.ui[key],'');
  assert.equal(f.probe.ui.inventorySort,'level');
});

test('changing sort preserves selection scope and announces the current result once',async()=>{
  const f=await fixture({inventorySlot:'armor',inventoryRarity:'1'});
  await change(f,'inventory-sort','rarity');
  freshAnnouncement(f,2);assert.equal(f.probe.ui.inventorySort,'rarity');assert.equal(f.probe.ui.inventorySlot,'armor');assert.equal(f.probe.ui.inventoryRarity,'1');
});

for(const [key,count]of [['regen',2],['barrier',2],['reduction',1]])test(`${key} selection announces exactly its authored item-effect matches`,async()=>{
  const f=await fixture();
  await change(f,'inventory-defense',key);
  freshAnnouncement(f,count);assert.equal(f.probe.ui.inventoryDefense,key);
});

test('name submission announces literal visible angle brackets and the complete matching count',async()=>{
  const f=await fixture();
  submit(f,'  <Echo>  ');
  freshAnnouncement(f,3);assert.match(f.announcer.textContent,/名称含「<Echo>」/);assert(!f.announcer.textContent.includes('&lt;'));
  assert.equal(f.probe.ui.inventoryQuery,'<Echo>');assert.equal(f.probe.ui.inventoryQueryDraft,'<Echo>');
});

test('typing a new draft leaves the committed result and its prior announcement untouched',async()=>{
  const f=await fixture();submit(f,'<Echo>');
  const announcement=f.announcer.textContent,html=f.app.innerHTML,reads=f.resultReads.length;
  f.listeners.document.get('input')({target:{id:'inventory-query',value:'准备输入的草稿'}});
  assert.equal(f.probe.ui.inventoryQuery,'<Echo>');assert.equal(f.probe.ui.inventoryQueryDraft,'准备输入的草稿');
  assert.equal(f.announcer.textContent,announcement);assert.equal(f.app.innerHTML,html);assert.equal(f.resultReads.length,reads);noGameWrite(f);
});

test('comparison and ordinary navigation do not overwrite another operation notice or filters',async()=>{
  const f=await fixture({inventorySlot:'armor',inventoryDefense:'regen',inventoryQueryDraft:'保留草稿'}),before=choices(f),notice=f.announcer.textContent;
  await f.click('compare-details',{id:'i4'});assert(f.probe.dialog.open);await f.click('close-dialog');
  await f.click('game');await f.click('inventory');
  assert.equal(f.announcer.textContent,notice);assert.deepEqual(f.resultReads,[]);assert.deepEqual(choices(f),before);noGameWrite(f);
});

test('a constructed unsupported defense value returns to unrestricted results without writing game data',async()=>{
  const f=await fixture({inventoryDefense:'regen'});
  await change(f,'inventory-defense','constructor');
  freshAnnouncement(f,9);assert.equal(f.probe.ui.inventoryDefense,'');
});
