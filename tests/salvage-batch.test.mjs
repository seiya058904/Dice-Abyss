import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// The same regression can target the untouched input without copying its code.
const root=process.env.QA_SALVAGE_ROOT?pathToFileURL(process.env.QA_SALVAGE_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));

function fixture(count=1000,mixed=false){
 const s=E.newGame(27017);s.runId='round15-salvage-batch';s.floor=200;s.player.level=100;s.player.gold=1000000;
 while(s.player.items.length<count)s.player.items.push(E.makeItem(s,undefined,mixed?s.nextId%8:s.nextId%2));
 [s.player.equipped.relic,s.player.equipped.relic2,s.player.equipped.relic3]=s.player.items.filter(i=>i.slot==='relic').slice(0,3).map(i=>i.id);
 const equipped=new Set(E.equippedIds(s));
 for(const item of s.player.items){
  if(equipped.has(item.id))item.level=1000000;
  if(Number(item.id.slice(1))%41===0)item.locked=true;
  item.auditMetadata={label:'未知装备字段',nested:[{value:Number(item.id.slice(1))}]};
 }
 s.auditMetadata={nested:['完整快照',{keep:true}]};s.player.hp=E.stats(s).maxHp;
 assert(S.validateSave(s));return s;
}

test('large reviewed batches require a linear number of inventory ID reads',()=>{
 for(const count of [100,1000]){
  const s=fixture(count),ids=E.salvagePreview(s,undefined,false,true).items.map(i=>i.id).reverse();
  let reads=0;
  for(const item of s.player.items){const id=item.id;Object.defineProperty(item,'id',{enumerable:true,configurable:true,get(){reads++;return id;}});}
  const preview=E.salvagePreview(s,ids,false,true),observed=reads;
  assert(preview);assert.equal(preview.items.length,ids.length);
  assert(observed<=4*(count+ids.length),`${count} items / ${ids.length} selected performed ${observed} ID reads; reviewed batches must not rescan the bag for every selected ID`);
  assert.deepEqual(preview.items.map(i=>i.id),ids);
 }
});

test('batch quotes retain reviewed order and original references without changing any state',()=>{
 const s=fixture(),original=S.encodeSave(s),safe=E.salvagePreview(s,undefined,false,true),ids=safe.items.map(i=>i.id).reverse();
 const preview=E.salvagePreview(s,ids,false,true);
 assert.deepEqual(preview.items.map(i=>i.id),ids);
 for(let index=0;index<ids.length;index++)assert.strictEqual(preview.items[index],safe.items[safe.items.length-1-index]);
 assert.equal(preview.rawGold,safe.rawGold);assert.equal(preview.gold,safe.gold);assert.equal(preview.overflow,safe.overflow);
 assert.equal(S.encodeSave(s),original);
});

test('single and batch requests reject malformed IDs and every protected inventory owner',()=>{
 const s=fixture(100,true),safe=E.salvagePreview(s,undefined,false,true).items.map(i=>i.id),locked=s.player.items.find(i=>i.locked).id;
 const activeLoot=safe[0],lootItem=s.player.items.find(i=>i.id===activeLoot);
 s.loot={item:structuredClone(lootItem),gold:1,type:'combat',source:'本次战利品'};
 const original=S.encodeSave(s),badRequests=[[],null,'i1',{},[safe[1],safe[1]],['i999999'],[null],[undefined],[0],[true],[NaN],[{}],[[]],
  [safe[1],null],[safe[1],E.equippedIds(s)[0]],[safe[1],locked],[safe[1],activeLoot]];
 for(const ids of badRequests){
  assert.equal(E.salvagePreview(s,ids,true,true),null,JSON.stringify(ids));
  assert.strictEqual(E.transition(s,{type:'salvage',ids,allowProtected:true,allowOverflow:true}),s);
 }
 assert.equal(S.encodeSave(s),original);
});

test('rare protected equipment and capped gold still require their explicit confirmations',()=>{
 const s=fixture(100,true),equipped=new Set(E.equippedIds(s)),premium=s.player.items.find(i=>i.rarity>=3&&!i.locked&&!equipped.has(i.id)),safe=E.salvagePreview(s,undefined,false,true).items[0];
 const ids=[premium.id,safe.id];s.player.gold=E.GOLD_CAP-1;
 assert.equal(E.salvagePreview(s,ids,false,true),null);
 assert.equal(E.salvagePreview(s,ids,true,false),null);
 const preview=E.salvagePreview(s,ids,true,true);assert(preview);assert.equal(preview.gold,1);assert.equal(preview.overflow,preview.rawGold-1);
 const before=S.encodeSave(s),after=E.transition(s,{type:'salvage',ids,allowProtected:true,allowOverflow:true});
 assert.equal(after.player.gold,E.GOLD_CAP);assert.equal(after.player.items.length,s.player.items.length-2);
 assert.equal(after.rng,s.rng);assert.equal(after.revision,s.revision+1);assert.equal(S.encodeSave(s),before);
 assert(S.validateSave(after));assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
});

test('a full 10,000-item reviewed batch settles once, survives save/reload, and preserves all remaining data',()=>{
 const s=fixture(10000),before=S.encodeSave(s),preview=E.salvagePreview(s,undefined,false,true),ids=preview.items.map(i=>i.id).reverse(),removed=new Set(ids);
 assert(ids.length>9000);assert(Buffer.byteLength(before)<5000000);
 const after=E.transition(s,{type:'salvage',ids,allowOverflow:!!preview.overflow});
 assert.notStrictEqual(after,s);assert.equal(after.player.items.length,s.player.items.length-ids.length);
 assert.deepEqual(after.player.items,s.player.items.filter(i=>!removed.has(i.id)));
 assert.deepEqual(after.player.equipped,s.player.equipped);assert.deepEqual(after.auditMetadata,s.auditMetadata);
 assert.equal(after.player.gold,s.player.gold+preview.gold);assert.equal(after.player.hp,s.player.hp);
 assert.equal(after.rng,s.rng);assert.equal(after.nextId,s.nextId);assert.equal(after.revision,s.revision+1);
 assert.equal(S.encodeSave(s),before);assert(S.validateSave(after));
 const records=new Map([[S.SAVE_KEY,before],[S.BACKUP_KEY,before]]),storage={getItem:key=>records.get(key)??null,setItem:(key,raw)=>records.set(key,raw)};
 assert.deepEqual(S.saveGame(after,s,storage),{mirrored:true,warning:''});
 const loaded=S.loadSave(storage).state;assert.deepEqual(loaded,after);
 assert.equal(records.get(S.SAVE_KEY),S.encodeSave(after));assert.equal(records.get(S.SAVE_KEY),records.get(S.BACKUP_KEY));
 assert.strictEqual(E.transition(loaded,{type:'salvage',ids,allowOverflow:true}),loaded,'a replay cannot settle the removed batch twice');
 after.player.items[0].auditMetadata.nested[0].value=-1;
 assert.equal(S.encodeSave(s),before,'settled inventory keeps the engine detached-copy contract');
});

test('a malformed duplicate inventory entry cannot replace the first reviewed item',()=>{
 const s=fixture(100),safe=E.salvagePreview(s,undefined,false,true).items,first=safe[0];
 // Loader validation excludes this shape. The preview nevertheless retains
 // its historical first-match behavior instead of resolving the later entry.
 s.player.items.push({...first,locked:true});
 const preview=E.salvagePreview(s,[safe[1].id,first.id],false,true);
 assert(preview);assert.strictEqual(preview.items[1],first);
});
