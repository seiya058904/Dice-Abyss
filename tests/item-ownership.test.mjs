import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Point these unchanged cases at the input ZIP to reproduce the ownership bug.
const root=process.env.QA_ITEM_OWNERSHIP_ROOT?pathToFileURL(process.env.QA_ITEM_OWNERSHIP_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const C=await import(new URL('src/encounters.js',root));
const owned=(state,id)=>state.player.items.find(item=>item.id===id);
const snapshot=value=>structuredClone(value);

function room(type,seed=513741){
 const state=E.newGame(seed);state.runId=`ownership-${type}-${seed}`;state.player.gold=100000;
 state.fate=[3,4];state.phase='route';
 state.route=[type,'forge','fusion','combat','gold','boss'].map((type,i)=>({id:`f1r${i}`,type,quality:0,done:false}));
 const entered=E.transition(state,{type:'enter'});assert(S.validateSave(entered));return entered;
}
function continuation(before,action){
 const raw=S.encodeSave(before),reloaded=S.decodeSave(raw),uninterrupted=E.transition(before,action),afterReload=E.transition(reloaded,action);
 assert.notStrictEqual(uninterrupted,before,'the selected action must commit');
 assert.equal(S.encodeSave(before),raw,'transition must leave its caller unchanged');
 assert(S.validateSave(uninterrupted));assert(S.validateSave(afterReload));
 assert.deepEqual(uninterrupted.player,afterReload.player,'complete player assets');
 assert.equal(uninterrupted.rng,afterReload.rng);assert.equal(uninterrupted.revision,afterReload.revision);
 assert.deepEqual(uninterrupted,afterReload,'all saved fields must continue identically across a JSON reload');
 assert.equal(S.encodeSave(uninterrupted),S.encodeSave(afterReload),'complete save envelopes');
 return uninterrupted;
}
function buy(type='merchant'){
 const before=room(type),offer=before.shop[0],after=E.transition(before,{type:'buy',id:offer.id});
 assert.notStrictEqual(after,before);return {before,offer,after};
}

for(const type of ['merchant','blackmarket'])test(`${type}: locking a purchased item preserves the sold snapshot and full reload continuation`,()=>{
 const {before,offer,after}=buy(type),record=snapshot(after.shop[0]);
 const locked=continuation(after,{type:'lock',id:offer.id});
 assert.equal(owned(locked,offer.id).locked,true);assert.deepEqual(locked.shop[0],record);
 assert.equal(locked.player.gold,before.player.gold-offer.price);
 const unlocked=continuation(locked,{type:'lock',id:offer.id});
 assert.equal(owned(unlocked,offer.id).locked,false);assert.deepEqual(unlocked.shop[0],record);
});

test('a bought and equipped weapon can be forged after leaving the shop without rewriting its purchase record',()=>{
 const {after,offer}=buy(),record=snapshot(after.shop[0]);
 let state=E.transition(after,{type:'equip',id:offer.id});state=E.transition(state,{type:'next'});
 assert.equal(state.phase,'forge');const before=owned(state,offer.id),cost=E.forgeCost(state,before);
 const forged=continuation(state,{type:'forge',id:offer.id});
 assert(owned(forged,offer.id).enhance>before.enhance);assert.deepEqual(forged.shop[0],record);
 assert.equal(forged.player.gold,state.player.gold-cost);assert.equal(forged.revision,state.revision+1);
});

for(const type of ['chest','vault'])test(`${type}: claim history stays unchanged after locking and equipping its inventory item`,()=>{
 const pending=room(type),reward=snapshot(pending.chest),gold=pending.player.gold;
 let state=E.transition(pending,{type:'open'});const id=reward.item.id;
 assert.deepEqual(state.loot,reward);assert.equal(state.player.gold,gold+reward.gold);
 assert.equal(state.counters.chests,pending.counters.chests+1);assert.equal(state.rng,pending.rng);
 state=continuation(state,{type:'lock',id});assert.equal(owned(state,id).locked,true);assert.deepEqual(state.loot,reward);
 state=continuation(state,{type:'equip',id});assert(Object.values(state.player.equipped).includes(id));assert.deepEqual(state.loot,reward);
 state=continuation(state,{type:'lock',id});assert.equal(owned(state,id).locked,false);assert.deepEqual(state.loot,reward);
 assert.strictEqual(E.transition(state,{type:'open'}),state,'claimed loot cannot be granted a second time');
});

test('an event-generated pending reward uses the same detached claim ownership',()=>{
 const event=room('gambit'),choice=C.eventChoices(event).find(option=>option.id==='safe');assert(choice&&!choice.disabled);
 const pending=E.transition(event,{type:'event-choice',id:'safe',confirmed:true});assert.equal(pending.phase,'chest');
 const reward=snapshot(pending.chest),resolvedEvent=snapshot(pending.event),state=E.transition(pending,{type:'open'});
 const locked=continuation(state,{type:'lock',id:reward.item.id});
 assert.deepEqual(locked.loot,reward);assert.deepEqual(locked.event,resolvedEvent);
 assert.equal(owned(locked,reward.item.id).locked,true);assert.strictEqual(E.transition(locked,{type:'open'}),locked);
});

test('purchase copies every unknown item field deeply while retaining unrelated complete save data',()=>{
 const before=room('merchant'),offer=before.shop[0];
 before.round12Unknown={text:'完整未知状态 😀',rows:[{key:'top',value:7}]};
 offer.round12Unknown={source:'已售记录扩展',rows:[1,2]};
 offer.item.round12Unknown={text:'装备未知字段',rows:[{value:11}],empty:null};
 const raw=S.encodeSave(before),after=E.transition(before,{type:'buy',id:offer.id}),item=owned(after,offer.id);
 assert.equal(S.encodeSave(before),raw);assert.deepEqual(item,offer.item);
 assert.deepEqual(after.round12Unknown,before.round12Unknown);assert.deepEqual(after.shop[0].round12Unknown,offer.round12Unknown);
 assert.notStrictEqual(item,after.shop[0].item);assert.notStrictEqual(item.round12Unknown,after.shop[0].item.round12Unknown);
 assert.notStrictEqual(item.round12Unknown.rows[0],after.shop[0].item.round12Unknown.rows[0]);
 assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
 const saved=snapshot(after.shop[0].item);item.round12Unknown.rows[0].value=99;
 assert.deepEqual(after.shop[0].item,saved,'a nested owned extension cannot rewrite historical metadata');
});

test('claim keeps unknown reward metadata and copies every nested item extension without rerolling',()=>{
 const pending=room('chest');pending.chest.round12Unknown={source:'待领奖励',rows:[{value:5}]};
 pending.chest.item.round12Unknown={rows:[{value:'完整'}],extra:{kept:true}};
 pending.round12Unknown={counter:3};const before=snapshot(pending),raw=S.encodeSave(pending);
 const after=E.transition(pending,{type:'open'}),item=owned(after,before.chest.item.id);
 assert.equal(S.encodeSave(pending),raw);assert.deepEqual(after.loot,before.chest);
 assert.deepEqual(item,before.chest.item);assert.notStrictEqual(item,after.loot.item);
 assert.notStrictEqual(item.round12Unknown.rows[0],after.loot.item.round12Unknown.rows[0]);
 assert.deepEqual(after.round12Unknown,before.round12Unknown);assert.equal(after.nextId,before.nextId);assert.equal(after.rng,before.rng);
 assert.equal(after.version,5);assert.equal(after.revision,before.revision+1);assert.equal(after.chest,null);
 assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
});

test('an unrelated inventory action does not change a committed but unopened reward',()=>{
 const pending=room('chest');pending.chest.round12Unknown={keep:['待领取',17]};
 const expected=snapshot(pending.chest),raw=S.encodeSave(pending);
 const after=continuation(pending,{type:'lock',id:pending.player.equipped.weapon});
 assert.equal(S.encodeSave(pending),raw);assert.deepEqual(after.chest,expected);
 assert.equal(after.loot,null);assert.equal(after.rng,pending.rng);assert.equal(after.nextId,pending.nextId);
});

test('inventory-cap rejections retain the exact pending chest and unsold offer without spending or revision changes',()=>{
 for(const type of ['chest','merchant']){
  const state=room(type);while(state.player.items.length<10000)state.player.items.push(E.makeItem(state,'weapon',0));
  const action=type==='chest'?{type:'open'}:{type:'buy',id:state.shop[0].id},before=S.encodeSave(state);
  assert.equal(E.canAct(state,action),false);assert.strictEqual(E.transition(state,action),state);
  assert.equal(S.encodeSave(state),before);
 }
});

test('already-saved distinct item history stays byte-exact rather than being reconciled from inventory',()=>{
 const {after,offer}=buy(),state=S.decodeSave(S.encodeSave(after)),item=owned(state,offer.id);
 item.locked=true;item.enhance=7;item.round12Unknown={which:'inventory'};
 state.shop[0].item.round12Unknown={which:'saved historical record'};
 const history=snapshot(state.shop[0]),raw=S.encodeSave(state),loaded=S.decodeSave(raw);
 assert.equal(S.encodeSave(loaded),raw);const next=continuation(loaded,{type:'lock',id:offer.id});
 assert.equal(owned(next,offer.id).enhance,7);assert.equal(owned(next,offer.id).locked,false);
 assert.deepEqual(next.shop[0],history);assert.equal(next.version,5);
});

test('full expected-save conflicts still include unknown historical item fields',()=>{
 const {after,offer}=buy();after.shop[0].item.round12Unknown={keep:'完整并发比较'};
 const raw=S.encodeSave(after),map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),writes=[];
 const store={getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};
 const expected=S.decodeSave(raw),candidate=E.transition(expected,{type:'lock',id:offer.id});
 expected.shop[0].item.round12Unknown.keep='same revision, different snapshot';
 assert.throws(()=>S.saveGame(candidate,expected,store),/另一窗口/);assert.deepEqual(writes,[]);
 assert.equal(map.get(S.SAVE_KEY),raw);assert.equal(map.get(S.BACKUP_KEY),raw);
 const validExpected=S.decodeSave(raw),validCandidate=continuation(validExpected,{type:'lock',id:offer.id});
 assert.deepEqual(S.saveGame(validCandidate,validExpected,store),{mirrored:true,warning:''});
 assert.deepEqual(S.loadSave(store).state,validCandidate);assert.deepEqual(writes,[S.SAVE_KEY,S.BACKUP_KEY]);
});

test('the packaged V4 snapshots retain their complete historical records when migrated and acted on',()=>{
 const golden=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8'));
 for(const fixture of golden.saves){
  const old=JSON.parse(JSON.parse(fixture.raw).payload),state=S.decodeSave(fixture.raw);assert(state);
  for(const key of ['shop','chest','loot','enemy'])assert.deepEqual(state[key],old[key]);
  const next=continuation(state,{type:'lock',id:state.player.equipped.weapon});
  for(const key of ['shop','chest','loot','enemy'])assert.deepEqual(next[key],state[key]);
  assert.equal(next.version,5);assert.equal(next.rng,state.rng);
 }
});

test('the natural seed-2 floor-3 purchase continues exactly after reload without any gameplay fixture patch',()=>{
 let state=E.newGame(2);state.runId='ownership-natural-2';let found=false;
 for(let step=0;step<300&&state.phase!=='dead';step++){
  if(['merchant','blackmarket'].includes(state.phase)){
   const offer=state.shop.find(offer=>offer.item?.slot==='weapon'&&E.canAct(state,{type:'buy',id:offer.id}));
   if(offer){
    assert.equal(state.floor,3);assert.equal(state.roomIndex,2);assert.equal(offer.id,'i14');assert.equal(offer.price,232);
    const before=state;state=E.transition(state,{type:'buy',id:offer.id});assert.equal(state.player.gold,before.player.gold-offer.price);
    const history=snapshot(state.shop);state=continuation(state,{type:'lock',id:offer.item.id});assert.deepEqual(state.shop,history);found=true;break;
   }
  }
  const type=state.phase==='fate'?'fate':state.phase==='route'?'enter':state.phase==='combat'?'roll':state.phase==='chest'?'open':state.phase==='gold'?'gold':['cleared','complete'].includes(state.phase)?'descend':['loot','merchant','blackmarket','forge','fusion','altar','rest'].includes(state.phase)?'next':null;
  const action=type?{type}:state.phase==='event'?{type:'event-choice',id:'leave'}:null;
  assert(action&&E.canAct(state,action),'normal generated route remains actionable');state=E.transition(state,action);assert(S.validateSave(state));
 }
 assert(found,'the unchanged natural seed must reach the audited purchase');
});
