import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const source=resolve(process.argv[2]),output=resolve(process.argv[3]);
const root=pathToFileURL(source+'/');
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const V=await import(new URL('src/views.js',root));
const LIMIT=5_000_000;
const bytes=raw=>Buffer.byteLength(raw,'utf8');
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const fresh=seed=>{const s=E.newGame(seed);s.runId=`capacity-audit-${seed}`;return s;};
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes.push(k);map.set(k,v);}};};
function padded(s,size){
 s.auditPadding='';let length=size-bytes(S.encodeSave(s));assert(length>=0);
 for(let salt=0;salt<26;salt++)for(let n=0;n<3;n++){
  s.auditPadding='a'.repeat(Math.max(0,length-1))+(length?String.fromCharCode(65+salt):'');
  const raw=S.encodeSave(s),delta=size-bytes(raw);if(!delta)return raw;length+=delta;
 }
 throw Error('Could not form exact encoded boundary');
}
const report={source,scope:'Node-native rule/storage/view-markup reproduction; synthetic size and full-bag states; no browser or natural journey claim',cases:[]};
{
 const s=fresh(77613),raw=padded(s,LIMIT-100),store=memory();
 S.saveImportedGame(S.decodeSave(raw),raw,null,store);
 const before=S.loadSave(store).state,next=E.transition(before,{type:'fate'}),nextRaw=S.encodeSave(next),snap=new Map(store.map);
 store.writes.length=0;let message='';try{S.saveGame(next,before,store);}catch(e){message=e.message;}
 assert(message.includes('5 MB'));assert.deepEqual(store.map,snap);assert.deepEqual(store.writes,[]);
 assert.equal(S.encodeSave(S.loadSave(store).state),raw);
 report.cases.push({name:'near-limit accepted import then fate growth',beforeBytes:bytes(raw),afterBytes:bytes(nextRaw),growthBytes:bytes(nextRaw)-bytes(raw),failure:message,writes:store.writes,bothCopiesAndUnknownFieldsPreserved:true,rngPreserved:S.loadSave(store).state.rng===before.rng,revisionPreserved:S.loadSave(store).state.revision===before.revision,beforeSha256:digest(raw),capacity:S.measureSaveCapacity?.(before)??null});
}
{
 const s=fresh(441),item=E.makeItem(s,'weapon',0);s.player.items.push(item);const raw=padded(s,LIMIT),store=memory();
 S.saveGame(s,null,store);const before=S.loadSave(store).state,next=E.transition(before,{type:'salvage',ids:[item.id]});
 assert.notStrictEqual(next,before);const nextRaw=S.encodeSave(next);assert(bytes(nextRaw)<LIMIT);S.saveGame(next,before,store);
 assert.equal(S.encodeSave(S.loadSave(store).state),nextRaw);assert.equal(next.auditPadding,before.auditPadding);
 report.cases.push({name:'permitted explicit salvage can reduce an exact-limit save',beforeBytes:bytes(raw),afterBytes:bytes(nextRaw),reducedBytes:bytes(raw)-bytes(nextRaw),beforeItems:before.player.items.length,afterItems:next.player.items.length,unknownPaddingPreserved:true,fullRoundTripPreserved:true});
}
{
 const s=fresh(442),item=E.makeItem(s,'weapon',0);s.player.items.push(item);s.auditUnicode='界'.repeat(1_670_000);
 const raw=S.encodeSave(s),store=memory();assert(raw.length<LIMIT);assert(bytes(raw)>LIMIT);
 store.setItem(S.SAVE_KEY,raw);store.setItem(S.BACKUP_KEY,raw);store.writes.length=0;
 const before=S.loadSave(store).state,next=E.transition(before,{type:'salvage',ids:[item.id]}),nextRaw=S.encodeSave(next),snap=new Map(store.map);
 assert.notStrictEqual(next,before);assert(bytes(nextRaw)<bytes(raw));assert(bytes(nextRaw)>LIMIT);
 let message='';try{S.saveGame(next,before,store);}catch(e){message=e.message;}
 assert(message.includes('5 MB'));assert.deepEqual(store.map,snap);assert.deepEqual(store.writes,[]);assert.equal(S.encodeSave(S.loadSave(store).state),raw);
 report.cases.push({name:'historical readable oversized save may reject even a shrinking salvage',beforeBytes:bytes(raw),beforeCharacters:raw.length,afterBytes:bytes(nextRaw),reducedBytes:bytes(raw)-bytes(nextRaw),failure:message,writes:store.writes,completeExportPreserved:true,capacity:S.measureSaveCapacity?.(before)??null});
}
{
 let s=E.transition(fresh(713),{type:'fate'});s.route=s.route.map(room=>({...room,type:'merchant'}));s=E.transition(s,{type:'enter'});s.player.gold=1_000_000;
 while(s.player.items.length<10000)s.player.items.push(E.makeItem(s,undefined,0));assert(S.validateSave(s));
 const html=V.center(s,{view:'game'}),offers=s.shop.filter(o=>o.item);
 assert(offers.every(o=>!E.canAct(s,{type:'buy',id:o.id})));
 const statuses=[...html.matchAll(/<small class="offer-status"[^>]*>(.*?)<\/small>/g)].map(m=>m[1]);
 report.cases.push({name:'full bag with affordable merchant equipment',items:s.player.items.length,offers:offers.length,allBuysDisabled:true,visibleOfferStatuses:statuses,hasFullBagExplanation:/背包已满|背包.*上限|行囊已满/.test(html)});
}
{
 const s=fresh(909),html=V.center(s,{view:'inventory',inventorySlot:'weapon',inventoryRarity:'7'});
 assert(html.includes('暂无符合筛选的装备'));
 report.cases.push({name:'empty inventory slot and rarity intersection',items:s.player.items.length,filter:{slot:'weapon',rarity:7},empty:true,hasClearFiltersAction:/清除筛选|重置筛选|清空筛选|显示全部装备/.test(html),offeredExploration:html.includes('继续探索')});
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({source,output,cases:report.cases.length,rows:report.cases.map(({name,beforeBytes,afterBytes,hasFullBagExplanation,hasClearFiltersAction})=>({name,beforeBytes,afterBytes,hasFullBagExplanation,hasClearFiltersAction}))},null,2));
