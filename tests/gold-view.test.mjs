import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=process.env.QA_GOLD_ROOT?pathToFileURL(process.env.QA_GOLD_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const V=await import(new URL('src/views.js',root));
const S=await import(new URL('src/storage.js',root));
const ui={screen:'game',view:'game',busy:false};
const clean=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
function room(type,held=E.GOLD_CAP,seed=7919){
 let s=E.newGame(seed);s.floor=140;s.player.level=100;s.player.gold=held;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';
 s=E.transition(s,{type:'enter'});assert(S.validateSave(s));return s;
}

test('gold-room headline forecasts the exact accepted transition at normal, partial and full capacity',()=>{
 for(const held of [0,E.GOLD_CAP-10,E.GOLD_CAP]){
  const before=room('gold',held),snapshot=structuredClone(before),after=E.transition(before,{type:'gold'}),gain=after.player.gold-held;
  const html=V.gameView(before,ui),headline=html.match(/<div class="gold-hoard">([\s\S]*?)<\/div>/)?.[1];
  assert(headline);assert.match(clean(headline),new RegExp(`\\+${gain} 可收金币`));
  assert.match(clean(html),/领取后余额/);assert.deepEqual(before,snapshot);
  if(held){assert.match(clean(html),/将超出上限/);assert.match(clean(html),/10,000,000,000/);}
 }
});

test('pending chests name credited coins and overflow without revealing their equipment',()=>{
 const s=room('chest',E.GOLD_CAP-10),snapshot=structuredClone(s),after=E.transition(s,{type:'open'}),html=V.gameView(s,ui);
 const preview=html.match(/<div class="gold-incoming[\s\S]*?<\/section>/)?.[0];assert(preview);
 assert.match(clean(preview),new RegExp(`金币可收 \\+${after.player.gold-s.player.gold}`));
 assert.match(preview,new RegExp(`data-gold-overflow="${s.chest.gold-(after.player.gold-s.player.gold)}"`));
 assert(!preview.includes(s.chest.item.name));assert.match(clean(preview),/装备照常领取/);assert.deepEqual(s,snapshot);
});

test('the completed loot headline uses the saved receipt rather than nominal gold',()=>{
 for(const held of [E.GOLD_CAP-10,E.GOLD_CAP]){
  const s=room('chest',held),after=E.transition(s,{type:'open'}),text=clean(V.gameView(after,ui));
  assert.match(text,new RegExp(`金币实收 \\+ ${after.player.gold-held}`));
  assert.match(text,/本次开箱入账/);assert.match(text,/上限截去/);
 }
});

test('legacy loot stays readable without claiming that nominal gold was actually received',()=>{
 const current=E.transition(room('chest',E.GOLD_CAP),{type:'open'});delete current.lootCreditedGold;
 assert(S.validateSave(current));const raw=S.encodeSave(current),restored=S.decodeSave(raw),html=V.gameView(restored,ui);
 const receipt=html.match(/<div class="gold-reward[\s\S]*?<\/div>/)?.[0];assert(receipt);
 assert.match(receipt,/data-gold-receipt="legacy"/);assert.match(clean(receipt),/本箱标称金币/);
 assert.match(clean(receipt),/此历史记录未记实收/);assert.doesNotMatch(clean(receipt),/已存入行囊|金币实收/);
 assert.equal(S.encodeSave(restored),raw,'rendering never upgrades or invents a historical receipt');
});

test('later legal salvage and save reload leave the previously displayed receipt unchanged',()=>{
 let s=room('chest',0);const spare=E.makeItem(s,'weapon',1);s.player.items.push(spare);
 s=E.transition(s,{type:'open'});const receipt=clean(V.gameView(s,ui)).match(/金币实收 \+ [\d,]+/)?.[0];assert(receipt);
 const after=E.transition(s,{type:'salvage',ids:[spare.id]});assert(after.player.gold>s.player.gold);
 const restored=S.decodeSave(S.encodeSave(after));assert(clean(V.gameView(restored,ui)).includes(receipt));
 assert.equal(restored.lootCreditedGold,s.lootCreditedGold);
});

test('full gold is visible in the HUD and the room remains traversable with no fictional gain',()=>{
 const s=room('gold'),action=V.primaryAction(s,ui),html=V.gameView(s,ui);
 assert.equal(action.type,'gold');assert.equal(action.label,'继续前行');assert.match(action.hint,/可收 0/);
 assert.match(html,/data-gold-capped="true"/);assert.match(clean(html),/金币 · 已达上限/);
 assert.notStrictEqual(E.transition(s,action),s);
});

test('full inventory takes priority over a capped-gold chest cue and keeps the reward pending',()=>{
 const s=room('chest');const exemplar=s.player.items[0];
 while(s.player.items.length<10000)s.player.items.push({...exemplar,id:`i${s.nextId++}`});
 assert(S.validateSave(s));assert.equal(V.primaryAction(s,ui).type,'inventory');
 assert.strictEqual(E.transition(s,{type:'open'}),s);
});

test('gold rendering retains exact large amounts rather than compacting away boundary differences',()=>{
 const s=room('chest',E.GOLD_CAP-10);s.chest.gold=100_000_000;
 const html=V.gameView(s,ui);assert.match(clean(html),/原额 100,000,000/);assert.match(clean(html),/将超出上限 99,999,990/);
 assert(!html.includes('NaN'));assert(S.validateSave(s));
});
