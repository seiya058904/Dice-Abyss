import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [baselineRoot,currentRoot,outputPath]=process.argv.slice(2);
if(!baselineRoot||!currentRoot||!outputPath)throw Error('Usage: node audit-storage-parsed-round21.mjs BASELINE_ROOT CURRENT_ROOT OUTPUT_JSON');
const at=(root,file)=>pathToFileURL(resolve(root,file));
const E=await import(at(baselineRoot,'src/engine.js')),B=await import(at(baselineRoot,'src/storage.js')),C=await import(at(currentRoot,'src/storage.js'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(){
 const s=E.newGame(27017);s.runId='validator-compatibility';
 while(s.player.items.length<32)s.player.items.push(E.makeItem(s,undefined,s.nextId%8));
 s.auditMetadata={unknown:'界 😀',nested:[{value:7}],constructor:'plain',toJSON:'plain'};return s;
}
function auction(){
 let s=fixture();s.floor=200;s.player.level=50;s.player.gold=100000;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';
 s.route=['abyssauction','combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));
 return E.transition(s,{type:'enter'});
}
function frozen(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(frozen);}return value;}
const cases=[
 ['plain',s=>s],['frozen',s=>frozen(s)],
 ['null-prototype talent map',s=>{s.player.talents=Object.assign(Object.create(null),s.player.talents);return s;}],
 ['null-prototype unknown metadata',s=>{s.auditMetadata=Object.assign(Object.create(null),s.auditMetadata);return s;}],
 ['inherited stable item ID',s=>{const item=s.player.items[31],id=item.id;delete item.id;Object.setPrototypeOf(item,{id});return s;}],
 ['inherited equipped slot',s=>{const id=s.player.equipped.weapon;delete s.player.equipped.weapon;Object.setPrototypeOf(s.player.equipped,{weapon:id});return s;}],
 ['one sparse inventory entry',s=>{delete s.player.items[31];return s;}],
 ['two sparse inventory entries',s=>{delete s.player.items[30];delete s.player.items[31];return s;}],
 ['explicit null inventory entry',s=>{s.player.items[31]=null;return s;}],
 ['not an inventory array',s=>{s.player.items={0:s.player.items[0],length:32};return s;}],
 ['duplicate ID',s=>{s.player.items[31].id=s.player.items[0].id;return s;}],
 ['future ID',s=>{s.player.items[31].id=`i${s.nextId}`;return s;}],
 ['numeric ID',s=>{s.player.items[31].id=7;return s;}],
 ['empty ID',s=>{s.player.items[31].id='';return s;}],
 ['invalid equipment slot',s=>{s.player.equipped.weapon=s.player.equipped.armor;return s;}],
 ['missing equipped weapon',s=>{s.player.equipped.weapon='i9999';return s;}],
 ['duplicate equipped relic',s=>{s.player.equipped.relic2=s.player.equipped.relic;return s;}],
 ['unknown own equipped key',s=>{Object.defineProperty(s.player.equipped,'__proto__',{value:'i7',enumerable:true});return s;}],
 ['array talent map',s=>{s.player.talents=[];return s;}],
 ['array unknown metadata',s=>{s.auditMetadata=['unknown',{value:7}];return s;}],
 ['string object ID',s=>{s.player.items[31].id=new String(s.player.items[31].id);return s;}],
 ['unknown raw JSON number',s=>{s.auditMetadata=JSON.rawJSON('9007199254740993');return s;}],
 ['unknown raw JSON string',s=>{s.auditMetadata=JSON.rawJSON('"\\u754c"');return s;}],
 ['unknown proxy key order',s=>{s.auditMetadata=new Proxy({'1':'one','2':'two'},{ownKeys:()=>['2','1']});return s;}],
 ['stable ID getter', (s,events)=>{const item=s.player.items[31],id=item.id;Object.defineProperty(item,'id',{enumerable:true,get(){events.push('last.id');return id;}});return s;}],
 ['stable slot getter',(s,events)=>{const item=s.player.items[31],slot=item.slot;Object.defineProperty(item,'slot',{enumerable:true,get(){events.push('last.slot');return slot;}});return s;}],
 ['item property proxy',(s,events)=>{s.player.items[31]=new Proxy(s.player.items[31],{get(t,k,r){events.push(`item.${String(k)}`);return Reflect.get(t,k,r);}});return s;}],
 ['inventory property proxy',(s,events)=>{s.player.items=new Proxy(s.player.items,{get(t,k,r){events.push(`items.${String(k)}`);return Reflect.get(t,k,r);},has(t,k){events.push(`has.${String(k)}`);return Reflect.has(t,k);}});return s;}],
 ['player property proxy',(s,events)=>{s.player=new Proxy(s.player,{get(t,k,r){events.push(`player.${String(k)}`);return Reflect.get(t,k,r);}});return s;}],
];
for(const towardReward of [true,false])cases.push([`changing ID getter ${towardReward?'into':'away from'} pending auction reward`,(_s,events)=>{
 const s=auction(),item=s.player.items[31],ownedId=item.id,rewardId=s.event.reward.item.id;let reads=0;
 Object.defineProperty(item,'id',{enumerable:true,get(){reads++;const id=(reads<4)!==towardReward?rewardId:ownedId;events.push(['id',reads,id]);return id;}});return s;
}]);

function customMappedArray(mode,events){
 const s=auction(),rewardId=s.event.reward.item.id;let calls=0;
 const wrap=(ids,pass)=>{
  if(mode==='custom iterable')return new Proxy({*[Symbol.iterator](){for(let i=0;i<ids.length;i++)yield pass===2&&i===31?rewardId:ids[i];}},{get(t,k,r){events.push(`map${pass}.${String(k)}`);return Reflect.get(t,k,r);}});
  let reads=0;
  return new Proxy(ids,{get(t,k,r){events.push(`map${pass}.${String(k)}`);if(k==='31'&&(pass===2||++reads>1))return rewardId;return Reflect.get(t,k,r);}});
 };
 if(mode==='array species proxy'){
  class CustomItems extends Array{static get [Symbol.species](){return function(n){return wrap(new Array(n),++calls);};}}
  Object.setPrototypeOf(s.player.items,CustomItems.prototype);
 }else{
  s.player.items.map=function(callback,...args){return wrap(Array.prototype.map.call(this,callback,...args),++calls);};
 }
 return s;
}
for(const mode of ['custom iterable','map result proxy','array species proxy'])cases.push([mode,(_s,events)=>customMappedArray(mode,events)]);
const report={kind:'Full validation/encoding result and property-visitation compatibility',at:new Date().toISOString(),node:process.version,baselineRoot:resolve(baselineRoot),currentRoot:resolve(currentRoot),sourceHashes:{baseline:sha(readFileSync(at(baselineRoot,'src/storage.js'),'utf8')),current:sha(readFileSync(at(currentRoot,'src/storage.js'),'utf8'))},scriptSha256:sha(readFileSync(new URL(import.meta.url),'utf8')),cases:[],fullExpectedCounterexamples:[]};
for(const [name,make]of cases)for(const operation of ['validateSave','encodeSave']){
 const run=S=>{const events=[],state=make(fixture(),events);let outcome;try{outcome={result:S[operation](state)};}catch(error){outcome={error:{name:error.name,message:error.message}};}return{outcome,events};};
 const baseline=run(B),candidate=run(C);assert.deepEqual(candidate,baseline,`${name}: ${operation}`);
 report.cases.push({name,operation,equal:true,propertyEvents:baseline.events.length,propertyTrace:baseline.events,outcome:operation==='encodeSave'&&baseline.outcome.result?{rawBytes:Buffer.byteLength(baseline.outcome.result),sha256:sha(baseline.outcome.result)}:baseline.outcome,evidenceSha256:sha(baseline)});
}
for(const kind of ['raw-number-spelling','raw-large-integer','proxy-key-order']){
 const expected=fixture();expected.auditMetadata=kind==='raw-number-spelling'?JSON.rawJSON('1.0'):kind==='raw-large-integer'?JSON.rawJSON('9007199254740993'):new Proxy({'1':'one','2':'two'},{ownKeys:()=>['2','1']});
 const raw=B.encodeSave(expected),before=B.decodeSave(raw),next=E.transition(before,{type:'lock',id:before.player.equipped.weapon});
 const run=S=>{const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),writes=[],storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);map.set(key,value);}};let outcome;try{outcome={result:S.saveGame(next,expected,storage)};}catch(error){outcome={error:{name:error.name,message:error.message}};}return{outcome,writes,persisted:[...map]};};
 const baseline=run(B),candidate=run(C);assert.deepEqual(candidate,baseline,kind);assert(baseline.outcome.error);assert.deepEqual(baseline.writes,[]);
 report.fullExpectedCounterexamples.push({kind,equal:true,outcome:baseline.outcome,writes:[],evidenceSha256:sha(baseline)});
}
report.status='PASS';report.completedAt=new Date().toISOString();writeFileSync(resolve(outputPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,validationOrEncodingCases:report.cases.length,fullExpectedCounterexamples:report.fullExpectedCounterexamples.length,propertyEventCases:report.cases.filter(x=>x.propertyEvents).length,output:resolve(outputPath)},null,2));
