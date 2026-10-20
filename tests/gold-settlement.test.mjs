import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// Run these same assertions against the immutable input to preserve the
// original failing behavior: QA_GOLD_ROOT=/path/to/input node --test ...
const root=process.env.QA_GOLD_ROOT?pathToFileURL(process.env.QA_GOLD_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const C=await import(new URL('src/encounters.js',root));
const S=await import(new URL('src/storage.js',root));
const cap=E.GOLD_CAP;
function room(type,held=cap,seed=7919){
 let s=E.newGame(seed);s.runId=`gold-test-${type}-${seed}`;s.floor=140;s.player.level=100;s.player.gold=held;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';
 if(['exchange','relicloom'].includes(type))s.player.items.push(E.makeItem(s,'relic',1));
 s=E.transition(s,{type:'enter'});assert(S.validateSave(s));return s;
}
const texts=s=>s.log.map(entry=>entry.text).join('\n');
const accept=(s,id)=>E.transition(s,{type:'event-choice',id,confirmed:true});

test('gold rooms report actual 10 or 0 rather than their 958 nominal reward at the cap',()=>{
 for(const [held,credited]of [[cap-10,10],[cap,0]]){
  const before=room('gold',held),copy=structuredClone(before),after=E.transition(before,{type:'gold'});
  assert.equal(after.player.gold-held,credited);assert.equal(after.player.gold,cap);assert.deepEqual(before,copy);
  assert.match(texts(after),new RegExp(`黄金房 · 金币实收 ${credited}（原额 958，上限截去 ${958-credited}）`));
  assert(!texts(after).includes('黄金房 · 获得 958 金币'));assert(S.validateSave(after));
 }
});

test('fate doubles retain their RNG and report only the credited bonus when capped',()=>{
 let natural;
 for(let seed=1;seed<=80;seed++){
  const s=E.newGame(seed),after=E.transition(s,{type:'fate'});if(after.fate[0]===after.fate[1]){natural=s;break;}
 }
 assert(natural);
 for(const [held,credited]of [[cap-10,10],[cap,0]]){
  const before=structuredClone(natural);before.player.gold=held;
  const after=E.transition(before,{type:'fate'}),unclipped=E.transition(natural,{type:'fate'});
  assert.equal(after.player.gold-held,credited);assert.deepEqual(after.fate,unclipped.fate);assert.deepEqual(after.route,unclipped.route);assert.equal(after.rng,unclipped.rng);
  assert.match(texts(after),new RegExp(`命运双同 · 金币实收 ${credited}（原额 25，上限截去 ${25-credited}）`));
 }
});

test('opening a chest keeps the nominal reward and persists its exact credited amount',()=>{
 for(const held of [0,cap-10,cap]){
  const before=room('chest',held),raw=before.chest.gold,expected=Math.min(raw,cap-held),snapshot=structuredClone(before);
  before.chest.receiptAudit={preserved:['unknown metadata',17]};snapshot.chest.receiptAudit=structuredClone(before.chest.receiptAudit);
  before.chest.creditedGold={external:'opaque collision'};snapshot.chest.creditedGold=structuredClone(before.chest.creditedGold);
  const after=E.transition(before,{type:'open'});
  assert.equal(after.loot.gold,raw);assert.equal(after.lootCreditedGold,expected);assert.equal(after.player.gold-held,expected);
  assert.deepEqual(after.loot,before.chest);assert.deepEqual(before,snapshot);assert.equal(after.rng,before.rng);
  assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);assert.strictEqual(E.transition(after,{type:'open'}),after);
 }
});

test('a saved chest receipt survives later legal inventory transactions without being recomputed',()=>{
 let state=room('chest',0);const oldSpare=E.makeItem(state,'weapon',1);state.player.items.push(oldSpare);
 state=E.transition(state,{type:'open'});const recorded=state.lootCreditedGold,nominal=state.loot.gold,before=state.player.gold;
 state=E.transition(state,{type:'salvage',ids:[oldSpare.id]});
 assert(state.player.gold>before);assert.equal(state.lootCreditedGold,recorded);assert.equal(recorded,nominal);
 const restored=S.decodeSave(S.encodeSave(state));assert.equal(restored.lootCreditedGold,recorded);assert.equal(restored.loot.gold,nominal);
});

test('the separate receipt follows every original loot lifetime including imported event reward paths',()=>{
 const restored=E.transition(room('chest',0),{type:'open'}),recorded=restored.lootCreditedGold;
 const next=E.transition(restored,{type:'next'});assert.equal(next.loot,null);assert(!Object.hasOwn(next,'lootCreditedGold'));assert(S.validateSave(next));
 const waveStart=room('gauntlet',0);Object.assign(waveStart.route[0],{waves:2,wave:1,waveType:'combat'});waveStart.enemy.hp=1;waveStart.enemy.shield=0;assert(S.validateSave(waveStart));
 const wave=E.transition(E.transition(waveStart,{type:'roll'}),{type:'open'});assert.equal(wave.phase,'loot');assert(S.validateSave(wave));
 const nextWave=E.transition(wave,{type:'next'});assert.equal(nextWave.phase,'combat');assert.equal(nextWave.loot,null);assert(!Object.hasOwn(nextWave,'lootCreditedGold'));assert(S.validateSave(nextWave));
 const final=structuredClone(restored);final.roomIndex=final.route.length-1;for(let i=0;i<final.roomIndex;i++)final.route[i].done=true;assert(S.validateSave(final));
 const cleared=E.transition(final,{type:'next'});assert.equal(cleared.phase,'cleared');assert.equal(cleared.lootCreditedGold,recorded);assert.deepEqual(cleared.loot,final.loot);
 const descended=E.transition(cleared,{type:'descend'});assert.equal(descended.loot,null);assert(!Object.hasOwn(descended,'lootCreditedGold'));assert(S.validateSave(descended));
 // Validator-accepted imported event states can retain an older loot. Every
 // original event path that clears it must also clear the separate receipt.
 for(const [key,id]of [['gambit','roll'],['wishingvault','roll'],['bloodwell','accept'],['relicloom','accept'],['abyssauction','accept']]){
  let pair;
  for(let seed=1;seed<=80;seed++){
   const pending=room(key,cap,seed),historical=E.createChest(pending,'chest','historical import');pending.player.items.push(historical.item);pending.loot=historical;pending.lootCreditedGold=0;
   assert(S.validateSave(pending));const action={type:'event-choice',id,confirmed:true};
   if(!E.canAct(pending,action))continue;
   const after=E.transition(pending,action);if(after.phase==='chest'){pair={pending,after};break;}
  }
  assert(pair,`${key} must exercise its original reward-chest path`);assert.equal(pair.after.loot,null);assert(!Object.hasOwn(pair.after,'lootCreditedGold'));assert(S.validateSave(pair.after));
  assert.deepEqual(S.decodeSave(S.encodeSave(pair.after)),pair.after);
 }
});

test('exchange choices and confirmation disclose capped gold while keeping XP and explicit item consumption',()=>{
 for(const [held,credited]of [[cap-10,10],[cap,0]]){
  const before=room('exchange',held),option=C.eventChoices(before).find(o=>o.id==='salvage'),snapshot=structuredClone(before);
  assert(option&&!option.disabled);assert.equal(before.event.costGold,835);
  const receipt=`金币实收 ${credited}（原额 835，上限截去 ${835-credited}）`;
  const quoted=receipt.replace('金币实收','金币可收');
  assert(option.reward.includes(quoted));assert(option.reward.includes('540 经验'));assert(option.confirm.includes(quoted));assert(option.confirm.includes('540 经验'));assert(option.confirm.includes('永久消耗'));
  assert.strictEqual(E.transition(before,{type:'event-choice',id:'salvage'}),before);
  const after=accept(before,'salvage');assert.equal(after.player.gold-held,credited);assert.equal(after.player.xp-before.player.xp,540);
  assert(!after.player.items.some(item=>item.id===before.event.offerId));assert.deepEqual(after.player.equipped,before.player.equipped);assert.equal(after.rng,before.rng);
  assert(after.event.outcome.includes(receipt));assert(after.event.outcome.includes('540'));assert.deepEqual(before,snapshot);assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
  assert.strictEqual(accept(after,'salvage'),after);
 }
});

test('a pending exchange recomputes capacity read-only after an unrelated legal salvage',()=>{
 const before=room('exchange',cap-835),extra=E.makeItem(before,'weapon',1);before.player.items.push(extra);
 const offered=before.event.offerId,originalCost=before.event.costGold,initial=C.eventChoices(before).find(o=>o.id==='salvage');
 assert.equal(initial.reward,'835 金币与 540 经验');
 const state=E.transition(before,{type:'salvage',ids:[extra.id],allowOverflow:true}),snapshot=structuredClone(state),option=C.eventChoices(state).find(o=>o.id==='salvage');
 assert.equal(state.event.offerId,offered);assert.equal(state.event.costGold,originalCost);assert(!option.disabled);
 const expected=Math.min(originalCost,cap-state.player.gold);assert(expected<originalCost,'the legal prior salvage must actually reduce room for this exchange');assert(option.reward.includes(`金币可收 ${expected}`));assert.deepEqual(state,snapshot);
 assert.equal(accept(state,'salvage').player.gold-state.player.gold,expected);
});

test('refunds at full gold are gross receipts after payment, not positive net windfalls',()=>{
 for(const type of ['gambit','wishingvault']){
  let pair;
  for(let seed=1;seed<=80;seed++){
   const before=room(type,cap,seed),after=accept(before,'roll');if(after.phase==='event'){pair={before,after};break;}
  }
  assert(pair,`${type} low-roll fixture must be reached`);const {before,after}=pair,paid=before.event.costGold,refund=Math.floor(paid/2);
  assert.equal(after.player.gold,cap-paid+refund);assert.equal(after.player.gold-before.player.gold+paid,refund);assert(after.player.gold<cap);
  assert(!texts(after).includes('金币已达持有上限'));assert.equal(after.event.status,'resolved');assert.strictEqual(accept(after,'roll'),after);assert(S.validateSave(after));
 }
});

test('salvage continues to require explicit overflow acceptance and reports actual receipt plus loss',()=>{
 const state=room('rest',cap),item=E.makeItem(state,'weapon',1);state.player.items.push(item);
 assert.equal(E.salvagePreview(state,[item.id]),null);assert.strictEqual(E.transition(state,{type:'salvage',ids:[item.id]}),state);
 const preview=E.salvagePreview(state,[item.id],false,true),after=E.transition(state,{type:'salvage',ids:[item.id],allowOverflow:true});
 assert.equal(after.player.gold,cap);assert(!after.player.items.some(i=>i.id===item.id));assert.equal(preview.gold,0);
 assert.match(texts(after),new RegExp(`金币实收 0（原额 ${preview.rawGold}，上限截去 ${preview.overflow}）`));
});

test('ordinary gains preserve their original messages and the 80 gold starting balance',()=>{
 const initial=E.newGame(7919);assert.equal(initial.player.gold,80);assert.equal(E.VERSION,5);assert.equal(cap,1e10);
 const roomState=room('gold',0),after=E.transition(roomState,{type:'gold'});assert(texts(after).includes('黄金房 · 获得 958 金币。'));
 const exchange=room('exchange',0),option=C.eventChoices(exchange).find(o=>o.id==='salvage');assert.equal(option.reward,'835 金币与 540 经验');assert.equal(accept(exchange,'salvage').event.outcome,'旧装已置换为金币与经验。');
});

test('maximum legal item names and reward amounts keep capped receipt logs inside save limits',()=>{
 const chest=room('chest',cap-1);chest.chest.item.name='界'.repeat(64);chest.chest.gold=1e8;
 assert(S.validateSave(chest));const opened=E.transition(chest,{type:'open'});
 assert.equal(opened.lootCreditedGold,1);assert.equal(opened.loot.gold,1e8);assert(opened.log.every(entry=>entry.text.length<=180));
 assert(S.validateSave(opened));assert.deepEqual(S.decodeSave(S.encodeSave(opened)),opened);
 const exchange=room('exchange',cap-1);exchange.event.costGold=1e8;exchange.player.items.find(item=>item.id===exchange.event.offerId).name='界'.repeat(64);
 assert(S.validateSave(exchange));const result=accept(exchange,'salvage');
 assert.equal(result.player.gold,cap);assert(result.event.outcome.length<=180);assert(result.log.every(entry=>entry.text.length<=180));assert(S.validateSave(result));assert.deepEqual(S.decodeSave(S.encodeSave(result)),result);
});
