import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {center,esc,itemSummary,goldNum} from '../src/views.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

const source=fileURLToPath(new URL('../',import.meta.url));
function fixture(count=183){
 const s=E.newGame(24041);s.runId='round24-on-demand-reclaim';s.floor=200;s.player.level=100;
 while(s.player.items.length<count)s.player.items.push(E.makeItem(s,'weapon',0));
 for(const item of s.player.items)item.level=E.equippedIds(s).includes(item.id)?1000:4;
 s.player.items.at(-1).level=1;s.player.hp=E.stats(s).maxHp;
 s.qaDemand={keep:['原样保留',{unknown:true}]};assert(S.validateSave(s));return s;
}
const reclaimButton=html=>{
 const buttons=html.match(/<button\b[^>]*\bdata-action="salvage-preview"[^>]*>[\s\S]*?<\/button>/g)||[];
 assert.equal(buttons.length,1);return buttons[0];
};
function untouched(f){
 assert.equal(S.encodeSave(f.probe.state),f.original);
 assert.equal(f.map.get(S.SAVE_KEY),f.original);assert.equal(f.map.get(S.BACKUP_KEY),f.original);
 assert.deepEqual(f.writes,[]);
}

test('browsing pages and empty filters does not inspect off-page recycling eligibility',()=>{
 const s=fixture(),before=S.encodeSave(s),unseen=s.player.items.at(-1);let eligibilityReads=0;
 Object.defineProperty(unseen,'locked',{enumerable:true,configurable:true,get(){eligibilityReads++;return false;}});
 for(const ui of [{view:'inventory'},{view:'inventory',inventoryPage:1},{view:'inventory',inventoryQuery:'不存在的名称'},{view:'inventory',inventorySlot:'armor'}]){
  eligibilityReads=0;
  const html=center(s,ui),button=reclaimButton(html);
  assert.equal(eligibilityReads,0,'An unrelated off-page item is not inspected for a full-bag recycling quote during browsing');
  assert.match(button,/>检查可回收旧装<\/button>$/);assert(!/\sdisabled(?:\s|>)/.test(button));
  assert.match(button,/先查看物品与金币，确认后回收/);
 }
 eligibilityReads=0;const preview=E.salvagePreview(s,undefined,false,true);
 assert(preview?.items.includes(unseen));assert(eligibilityReads>0,'The same item really is inspected by an explicit full-bag quote');
 assert.equal(S.encodeSave(s),before);
});

test('explicit checking reviews the complete bag even while the visible search is empty',async()=>{
 const f=await recoveryFixture(source,{state:fixture()});
 Object.assign(f.probe.ui,{screen:'game',view:'inventory',inventoryQuery:'不存在的名称',inventoryQueryDraft:'不存在的名称',inventoryRarity:'7'});
 await f.click('inventory');assert.match(f.app.innerHTML,/暂无符合筛选的装备/);
 const quote=E.salvagePreview(f.probe.state,undefined,false,true);assert(quote.items.length>50);
 await f.click('salvage-preview');assert(f.probe.dialog.open);assert.equal(typeof f.probe.pending,'function');
 const html=f.probe.dialog.innerHTML;
 assert(html.includes(`以下 ${quote.items.length.toLocaleString('en-US')} 件普通 / 稀有旧装`));
 assert(html.includes(`预计实收 ${goldNum(quote.gold)} 金币`));
 for(const item of quote.items.slice(0,50))assert(html.includes(esc(itemSummary(item))));
 assert.match(html,/确认回收/);untouched(f);
});

test('canceling an explicit recycling review makes no game or storage change',async()=>{
 const f=await recoveryFixture(source,{state:fixture(70)});
 await f.click('inventory');await f.click('salvage-preview');assert(f.probe.dialog.open);
 await f.click('close-dialog');assert(!f.probe.dialog.open);assert.equal(f.probe.pending,null);untouched(f);
});

test('the reviewed batch still requires confirmation and commits the unchanged engine result',async()=>{
 const f=await recoveryFixture(source,{state:fixture(70)}),quote=E.salvagePreview(f.probe.state,undefined,false,true);
 const expected=E.transition(f.probe.state,{type:'salvage',ids:quote.items.map(item=>item.id),allowOverflow:!!quote.overflow});
 await f.click('inventory');await f.click('salvage-preview');untouched(f);
 await f.click('confirm');
 assert.equal(S.encodeSave(f.probe.state),S.encodeSave(expected));
 assert.equal(f.map.get(S.SAVE_KEY),S.encodeSave(expected));assert.equal(f.map.get(S.BACKUP_KEY),S.encodeSave(expected));
 assert.deepEqual(f.writes.map(([key])=>key),[S.SAVE_KEY,S.BACKUP_KEY]);assert(f.lockTasks.length>0);
 assert.equal(f.probe.state.rng,f.initial.rng);assert.deepEqual(f.probe.state.qaDemand,f.initial.qaDemand);
});

test('an empty safe batch remains checkable and provides an explicit live-region explanation',async()=>{
 const f=await recoveryFixture(source);assert.equal(E.salvagePreview(f.probe.state,undefined,false,true),null);
 await f.click('inventory');assert(!/\sdisabled(?:\s|>)/.test(reclaimButton(f.app.innerHTML)));
 await f.click('salvage-preview');
 assert(!f.probe.dialog.open);assert.equal(f.probe.pending,null);
 assert.match(f.announcer.textContent,/当前没有可提交的安全回收批次/);
 assert.match(f.announcer.textContent,/可能没有符合条件的旧装，或批次总额超出安全范围/);
 assert.match(f.app.innerHTML,/已装备、锁定和本次战利品会保留/);untouched(f);
});

test('a valid large-value bag reports an unavailable batch without claiming eligible items do not exist',async()=>{
 const s=E.newGame(24042);s.floor=200;s.player.level=100;
 const weapon=E.makeItem(s,'weapon',1);weapon.level=1e13;weapon.enhance=20;s.player.items.push(weapon);s.player.equipped.weapon=weapon.id;
 const candidates=[];
 for(let i=0;i<1000;i++){
  const item=E.makeItem(s,'weapon',1);item.level=1e13-1;item.enhance=20;s.player.items.push(item);candidates.push(item);
 }
 s.player.hp=E.stats(s).maxHp;assert(S.validateSave(s));
 assert(candidates.every(item=>E.itemValue(item)<E.itemValue(weapon)));
 assert(!Number.isSafeInteger(candidates.reduce((sum,item)=>sum+Math.max(1,Math.floor(E.itemValue(item)*.15)),0)));
 assert.equal(E.salvagePreview(s,undefined,false,true),null);
 assert(E.salvagePreview(s,[candidates[0].id],false,true),'A single eligible item can still be explicitly reviewed');
 const f=await recoveryFixture(source,{state:s});await f.click('inventory');await f.click('salvage-preview');
 assert(!f.probe.dialog.open);assert.equal(f.probe.pending,null);
 assert.match(f.announcer.textContent,/当前没有可提交的安全回收批次/);
 assert.match(f.announcer.textContent,/批次总额超出安全范围/);
 assert(!f.announcer.textContent.includes('当前没有符合安全回收条件的旧装'));untouched(f);
});

test('checking again after a lock uses current eligibility and retains every protected item',async()=>{
 const s=fixture(70),premium=E.makeItem(s,'weapon',7);s.player.items.push(premium);
 const protectedLoot=s.player.items[4];s.loot={item:structuredClone(protectedLoot),gold:1,type:'combat',source:'本次战利品'};
 const f=await recoveryFixture(source,{state:s});
 await f.click('inventory');const oldQuote=E.salvagePreview(f.probe.state,undefined,false,true),locked=oldQuote.items[0];
 await f.click('salvage-preview');await f.click('close-dialog');
 await f.click('lock',{id:locked.id});
 const quote=E.salvagePreview(f.probe.state,undefined,false,true),ids=quote.items.map(item=>item.id);
 assert(!ids.includes(locked.id));assert(!ids.includes(premium.id));assert(!ids.includes(protectedLoot.id));
 for(const id of E.equippedIds(f.probe.state))assert(!ids.includes(id));
 assert.equal(quote.items.length,oldQuote.items.length-1);
 await f.click('salvage-preview');
 assert(f.probe.dialog.innerHTML.includes(`以下 ${quote.items.length.toLocaleString('en-US')} 件普通 / 稀有旧装`));
 const expected=E.transition(f.probe.state,{type:'salvage',ids,allowOverflow:!!quote.overflow});
 await f.click('confirm');assert.equal(S.encodeSave(f.probe.state),S.encodeSave(expected));
 for(const id of [locked.id,premium.id,protectedLoot.id,...E.equippedIds(f.probe.state)])assert(f.probe.state.player.items.some(item=>item.id===id));
});

test('gold overflow is disclosed in the explicit review and cannot be accepted by checking alone',async()=>{
 const s=fixture(70);s.player.gold=E.GOLD_CAP;
 const f=await recoveryFixture(source,{state:s}),quote=E.salvagePreview(f.probe.state,undefined,false,true);
 assert.equal(quote.gold,0);assert(quote.overflow>0);
 await f.click('inventory');await f.click('salvage-preview');
 assert(f.probe.dialog.innerHTML.includes(`明确确认后放弃 ${goldNum(quote.overflow)} 溢出金币`));
 untouched(f);
 const expected=E.transition(f.probe.state,{type:'salvage',ids:quote.items.map(item=>item.id),allowOverflow:true});
 await f.click('confirm');assert.equal(S.encodeSave(f.probe.state),S.encodeSave(expected));assert.equal(f.probe.state.player.gold,E.GOLD_CAP);
});
