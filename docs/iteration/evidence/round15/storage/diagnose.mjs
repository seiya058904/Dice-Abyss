import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(process.argv[2]||'baseline/Dice-Abyss'),out=resolve(process.argv[3]||'qa-r15/storage/diagnosis.json');
const verifyOnly=process.argv.includes('--verify-only');
const at=file=>pathToFileURL(resolve(root,file));
const E=await import(at('src/engine.js')),S=await import(at('src/storage.js')),C=await import(at('src/content.js')),G=await import(at('src/gold.js'));
const source=readFileSync(at('src/engine.js'),'utf8'),sha=x=>createHash('sha256').update(x).digest('hex');
const fullSave=x=>JSON.stringify(x),memory=raw=>{const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]);return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
// Isolated experiment derived from the input source. No runtime file is edited.
const salvageSource=source.slice(source.indexOf('export function salvagePreview('),source.indexOf('export function newGame(')).replace(/^export /,'');
const candidateSource=salvageSource.replace('items=ids.map(id=>s.player.items.find(item=>item.id===id));','const inventory=new Map();for(const item of s.player.items)if(!inventory.has(item.id))inventory.set(item.id,item);\n  items=ids.map(id=>inventory.get(id));');
assert.notEqual(candidateSource,salvageSource);
const candidate=new Function('equippedIds','EQUIP_SLOTS','itemValue','SLOTS','goldPreview',candidateSource+'\nreturn salvagePreview;')(E.equippedIds,C.EQUIP_SLOTS,E.itemValue,C.SLOTS,G.goldPreview);
function fixture(count,mixed=false){
 const s=E.newGame(27017);s.runId='round15-storage-audit';s.floor=200;s.player.level=100;s.player.gold=1000000;
 while(s.player.items.length<count)s.player.items.push(E.makeItem(s,undefined,mixed?s.nextId%8:s.nextId%2));
 const relics=s.player.items.filter(i=>i.slot==='relic').slice(0,3);[s.player.equipped.relic,s.player.equipped.relic2,s.player.equipped.relic3]=relics.map(i=>i.id);
 for(const i of s.player.items){if(E.equippedIds(s).includes(i.id))i.level=1000000;if(Number(i.id.slice(1))%41===0)i.locked=true;i.auditMetadata={nested:['kept',Number(i.id.slice(1))]};}
 s.auditMetadata={unknown:['界','😀',{preserved:true}],counter:0};s.player.hp=E.stats(s).maxHp;
 assert(S.validateSave(s));return s;
}
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
function timed(fn,repeats=3){if(verifyOnly)return {samplesMs:[],medianMs:null,result:fn()};const samples=[];let result;for(let i=0;i<repeats;i++){const start=performance.now();result=fn();samples.push(performance.now()-start);}return {samplesMs:samples,medianMs:median(samples),result};}
const report={kind:'Round15 read-only storage and explicit salvage diagnosis',createdAt:new Date().toISOString(),root,node:process.version,verifyOnly,sourceHash:sha(source),candidateHash:sha(candidateSource),method:'Deterministic synthetic valid states from baseline engine. Memory-only persistence, no browser/network/player save. Native timing is a small Node observation, not interaction latency. Separate instrumented counts are not included in timings. verify-only mode records no timing.',salvage:[],snapshot:[],semantic:[]};
for(const [count,mixed] of [[100,false],[1000,false],[10000,true],[10000,false]]){
 const s=fixture(count,mixed),before=fullSave(s),preview=E.salvagePreview(s,undefined,false,true),ids=preview.items.map(i=>i.id).reverse();
 assert(ids.length);
 const ordinary=timed(()=>E.salvagePreview(s,ids,false,true));
 const indexed=timed(()=>candidate(s,ids,false,true));
 assert.deepEqual(indexed.result,ordinary.result);assert.equal(fullSave(s),before);
 const nativeFind=s.player.items.find;let searches=0,visits=0;
 Object.defineProperty(s.player.items,'find',{configurable:true,value(predicate,thisArg){searches++;return Reflect.apply(nativeFind,this,[(...args)=>{visits++;return Reflect.apply(predicate,thisArg,args);}]);}});
 const counted=E.salvagePreview(s,ids,false,true);delete s.player.items.find;assert.deepEqual(counted,ordinary.result);
 const oldTransition=timed(()=>E.transition(s,{type:'salvage',ids,allowOverflow:!!preview.overflow}),1);
 assert(S.validateSave(oldTransition.result));assert.equal(fullSave(s),before);
 report.salvage.push({items:count,mixed,selected:ids.length,rawUtf8Bytes:Buffer.byteLength(S.encodeSave(s)),findCalls:searches,inventoryVisitsPerPreview:visits,visitsInTransition:visits*2,baseline:{samplesMs:ordinary.samplesMs,medianMs:ordinary.medianMs},indexed:{samplesMs:indexed.samplesMs,medianMs:indexed.medianMs},baselineTransitionMs:oldTransition.samplesMs[0],exactOutputEqual:true,originalUnchanged:true});
}
const small=fixture(100),safe=E.salvagePreview(small,undefined,false,true).items.map(i=>i.id),locked=small.player.items.find(i=>i.locked).id;
for(const [name,ids,protectedFlag,overflowFlag,mutation] of [
 ['implicit safe batch',undefined,false,true],['empty IDs',[],false,true],['duplicate ID',[safe[0],safe[0]],false,true],['missing ID',['i999999'],false,true],['equipped',[small.player.equipped.weapon],true,true],['locked',[locked],true,true],['requested order',[safe[3],safe[0],safe[2]],false,true],['gold overflow rejected',[safe[0]],false,false,s=>s.player.gold=E.GOLD_CAP],['gold overflow confirmed',[safe[0]],false,true,s=>s.player.gold=E.GOLD_CAP],['active loot',[safe[0]],true,true,s=>s.loot={item:structuredClone(s.player.items.find(i=>i.id===safe[0]))}],['same ID invalid inventory uses first instance',[safe[0]],false,true,s=>s.player.items.push({...s.player.items.find(i=>i.id===safe[0]),locked:true})]
]){
 const s=structuredClone(small);mutation?.(s);const before=fullSave(s),b=E.salvagePreview(s,ids,protectedFlag,overflowFlag),c=candidate(s,ids,protectedFlag,overflowFlag);assert.deepEqual(c,b,name);assert.equal(fullSave(s),before);report.semantic.push({name,exactOutputEqual:true,originalUnchanged:true});
}
for(const count of [100,1000,10000]){
 const s=fixture(count,true),raw=S.encodeSave(s),envelope=JSON.parse(raw),decoded=S.decodeSave(raw),next=E.transition(s,{type:'lock',id:s.player.equipped.weapon}),store=memory(raw),stringify=JSON.stringify,calls=[];
 try{JSON.stringify=function(value,...args){calls.push({isState:!!value?.player?.items,items:value?.player?.items?.length??null});return Reflect.apply(stringify,this,[value,...args]);};S.saveGame(next,s,store);}finally{JSON.stringify=stringify;}
 assert.deepEqual(S.loadSave(store).state,next);
 const existing=timed(()=>JSON.stringify(decoded)===JSON.stringify(s),5),fast=timed(()=>{const expected=JSON.stringify(s);return envelope.payload===expected||JSON.stringify(decoded)===expected;},5);
 assert.equal(existing.result,true);assert.equal(fast.result,true);
 const save=timed(()=>S.saveGame(next,s,memory(raw)),3);
 report.snapshot.push({items:count,rawUtf8Bytes:Buffer.byteLength(raw),rawCharacters:raw.length,fullStateStringifications:calls.filter(c=>c.isState).length,totalStringifications:calls.length,existingCompare:{samplesMs:existing.samplesMs,medianMs:existing.medianMs},payloadFirstCompare:{samplesMs:fast.samplesMs,medianMs:fast.medianMs},saveMs:save.samplesMs,ordinaryFastPathEquivalent:true});
}
assert.equal(sha(readFileSync(at('src/engine.js'),'utf8')),report.sourceHash);report.sourceUnchanged=true;report.completedAt=new Date().toISOString();writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,salvage:report.salvage,snapshot:report.snapshot,semanticCases:report.semantic.length},null,2));
