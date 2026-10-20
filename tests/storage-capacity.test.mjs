import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,makeItem,transition} from '../src/engine.js';
import {encodeSave,decodeSave,loadSave,saveGame,measureSaveCapacity,SAVE_KEY,BACKUP_KEY} from '../src/storage.js';

const LIMIT=5_000_000;
const fresh=seed=>{const s=newGame(seed);s.runId=`capacity-test-${seed}`;return s;};
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,raw)=>{writes.push(key);map.set(key,raw);}};};
function atBytes(s,size){
 s.auditPadding='';let length=size-Buffer.byteLength(encodeSave(s),'utf8');assert(length>=0);
 // FNV's unpadded hexadecimal checksum can have a different digit count.
 for(let salt=0;salt<26;salt++)for(let attempt=0;attempt<3;attempt++){
  s.auditPadding='a'.repeat(Math.max(0,length-1))+(length?String.fromCharCode(65+salt):'');
  const raw=encodeSave(s),delta=size-Buffer.byteLength(raw,'utf8');
  if(delta===0)return raw;length+=delta;
 }
 throw Error('Could not construct exact-size fixture');
}
function freezeTree(value){
 if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}
 return value;
}

test('capacity inspection measures the entire exported envelope without changing frozen state or unknown metadata',()=>{
 const s=fresh(12001);s.auditExtra={name:'界😀',quotes:'"\\\n',deep:[{kept:'完整保留'}]};
 const before=encodeSave(s);freezeTree(s);const capacity=measureSaveCapacity(s);
 assert.equal(capacity.bytes,Buffer.byteLength(before,'utf8'));assert.equal(capacity.characters,before.length);
 assert(capacity.bytes>capacity.characters);assert.equal(capacity.limitBytes,LIMIT);assert.equal(capacity.limitCharacters,LIMIT);
 assert.equal(capacity.remainingBytes,LIMIT-capacity.bytes);assert.equal(capacity.remainingCharacters,LIMIT-before.length);
 assert.equal(capacity.excessBytes,0);assert.equal(capacity.excessCharacters,0);assert.equal(capacity.status,'ok');assert.equal(capacity.withinWriteLimit,true);
 assert.equal(encodeSave(s),before);assert.deepEqual(decodeSave(before).auditExtra,s.auditExtra);
});

test('near-limit advisory starts at 90 percent and does not change the actual write boundary',()=>{
 for(const [size,status] of [[4_499_999,'ok'],[4_500_000,'near-limit'],[4_999_999,'near-limit']]){
  const s=fresh(size),raw=atBytes(s,size),capacity=measureSaveCapacity(s);
  assert.equal(capacity.bytes,size);assert.equal(capacity.remainingBytes,LIMIT-size);assert.equal(capacity.status,status);assert.equal(capacity.withinWriteLimit,true);
  assert.equal(encodeSave(s),raw);
 }
});

test('exact-limit and one-byte-over diagnostics agree with real commit acceptance and preserve rejected copies',()=>{
 const at=fresh(12002),raw=atBytes(at,LIMIT),store=memory(),capacity=measureSaveCapacity(at);
 assert.equal(capacity.status,'at-limit');assert.equal(capacity.bytes,LIMIT);assert.equal(capacity.remainingBytes,0);assert.equal(capacity.withinWriteLimit,true);
 assert.deepEqual(saveGame(at,null,store),{mirrored:true,warning:''});assert.equal(store.getItem(SAVE_KEY),raw);
 const over=structuredClone(at);atBytes(over,LIMIT+1);const before=new Map(store.map),tooLarge=measureSaveCapacity(over);store.writes.length=0;
 assert.equal(tooLarge.status,'over-limit');assert.equal(tooLarge.excessBytes,1);assert.equal(tooLarge.remainingBytes,0);assert.equal(tooLarge.withinWriteLimit,false);
 assert.throws(()=>saveGame(over,at,store),/5 MB.*未保存.*未改动/);assert.deepEqual(store.writes,[]);assert.deepEqual(store.map,before);
});

test('a multibyte exact-limit export reports byte exhaustion separately from remaining UTF-16 code units',()=>{
 const s=fresh(12003);s.auditUnicode='界'.repeat(1_650_000);const raw=atBytes(s,LIMIT),capacity=measureSaveCapacity(s);
 assert.equal(capacity.bytes,LIMIT);assert.equal(capacity.characters,raw.length);assert(capacity.characters<LIMIT);
 assert.equal(capacity.remainingBytes,0);assert(capacity.remainingCharacters>0);assert.equal(capacity.excessCharacters,0);
 assert.equal(capacity.status,'at-limit');assert.equal(capacity.withinWriteLimit,true);assert.equal(encodeSave(decodeSave(raw)),raw);
});

test('historically readable CJK and non-BMP oversized saves remain fully measurable and exportable',()=>{
 for(const unicode of ['界'.repeat(1_670_000),'😀'.repeat(1_252_000)]){
  const s=fresh(12004);s.auditUnicode=unicode;const raw=encodeSave(s),restored=decodeSave(raw),capacity=measureSaveCapacity(restored);
  assert(raw.length<LIMIT);assert(Buffer.byteLength(raw,'utf8')>LIMIT);
  assert.equal(capacity.bytes,Buffer.byteLength(raw,'utf8'));assert.equal(capacity.status,'over-limit');assert.equal(capacity.withinWriteLimit,false);
  assert(capacity.excessBytes>0);assert.equal(capacity.excessCharacters,0);assert(capacity.remainingCharacters>0);
  assert.equal(restored.auditUnicode,unicode);assert.equal(encodeSave(restored),raw);
 }
});

test('direct valid state can report both byte and character overflow without trying to decode or persist it',()=>{
 const s=fresh(12005);s.auditPadding='x'.repeat(LIMIT);const raw=encodeSave(s),capacity=measureSaveCapacity(s);
 assert(raw.length>LIMIT);assert.equal(capacity.status,'over-limit');assert(capacity.excessCharacters>0);assert(capacity.excessBytes>0);
 assert.equal(capacity.remainingBytes,0);assert.equal(capacity.remainingCharacters,0);assert.equal(encodeSave(s),raw);
});

test('being within the file limit cannot bypass a browser primary quota failure or promise a durable write',()=>{
 const s=fresh(12006),store=memory();saveGame(s,null,store);const next=transition(s,{type:'lock',id:s.player.equipped.weapon}),before=new Map(store.map),attempts=[];
 assert.equal(measureSaveCapacity(next).withinWriteLimit,true);
 store.setItem=key=>{attempts.push(key);throw new DOMException('Synthetic capacity failure','QuotaExceededError');};
 assert.throws(()=>saveGame(next,s,store),/本次操作未生效.*存储空间与权限.*文件未满/);
 assert.deepEqual(attempts,[SAVE_KEY]);assert.deepEqual(store.map,before);assert.deepEqual(loadSave(store).state,s);
});

test('a shrinking salvage which remains above the file limit is rejected with complete export and copies intact',()=>{
 const s=fresh(12007),item=makeItem(s,'weapon',0);s.player.items.push(item);s.auditUnicode='界'.repeat(1_670_000);
 const raw=encodeSave(s),store=memory();store.setItem(SAVE_KEY,raw);store.setItem(BACKUP_KEY,raw);store.writes.length=0;
 const before=loadSave(store).state,next=transition(before,{type:'salvage',ids:[item.id]}),originalCapacity=measureSaveCapacity(before),nextCapacity=measureSaveCapacity(next),snapshot=new Map(store.map);
 assert.notStrictEqual(next,before);assert(nextCapacity.bytes<originalCapacity.bytes);assert.equal(nextCapacity.status,'over-limit');
 assert.throws(()=>saveGame(next,before,store),/未保存.*未改动.*导出完整备份.*回收物品后仍需通过保存校验/);
 assert.deepEqual(store.writes,[]);assert.deepEqual(store.map,snapshot);assert.equal(encodeSave(loadSave(store).state),raw);
});

test('a permitted explicit salvage can create room at the exact file limit while preserving every extra field',()=>{
 const s=fresh(12008),item=makeItem(s,'weapon',0);s.player.items.push(item);const raw=atBytes(s,LIMIT),store=memory();saveGame(s,null,store);
 const before=loadSave(store).state,next=transition(before,{type:'salvage',ids:[item.id]}),capacity=measureSaveCapacity(next);
 assert(capacity.bytes<LIMIT);assert.equal(capacity.withinWriteLimit,true);assert.equal(next.auditPadding,before.auditPadding);
 assert.deepEqual(saveGame(next,before,store),{mirrored:true,warning:''});assert.equal(encodeSave(loadSave(store).state),encodeSave(next));
 assert.notEqual(store.getItem(SAVE_KEY),raw);assert.equal(store.getItem(SAVE_KEY),store.getItem(BACKUP_KEY));
});
