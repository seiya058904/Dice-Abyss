import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';

// Read-only module inputs and isolated in-memory stores. This script neither
// opens a browser nor contacts a server or touches a player's localStorage.
// Decoder-only parsed V5 Set reuse. The standalone/public validator remains exact.
// Retain output from every attempt; this is CPU component evidence, not native latency.
// --verify-only retains the full differential and parse counts without timing.
const [baselineRoot,currentRoot,outputPath,...flags]=process.argv.slice(2);
if(!baselineRoot||!currentRoot||!outputPath||flags.some(flag=>flag!=='--verify-only'))throw Error('Usage: node benchmark-storage-inventory-round21.mjs BASELINE_ROOT CURRENT_ROOT OUTPUT_JSON [--verify-only]');
const verifyOnly=flags.includes('--verify-only'),at=(root,file)=>pathToFileURL(resolve(root,file));
const B=await import(at(baselineRoot,'src/storage.js')),C=await import(at(currentRoot,'src/storage.js'));
const E=await import(at(baselineRoot,'src/engine.js'));
const BV=await import(at(baselineRoot,'src/views.js')),CV=await import(at(currentRoot,'src/views.js'));
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceHashes=()=>Object.fromEntries([['baseline',baselineRoot],['current',currentRoot]].map(([name,root])=>[name,Object.fromEntries(['src/storage.js','src/engine.js','src/views.js','src/boon-readout.js','src/release.js'].map(file=>[file,sha(readFileSync(at(root,file),'utf8'))]))]));
const initialHashes=sourceHashes(),scriptHash=sha(readFileSync(new URL(import.meta.url),'utf8'));
const golden=JSON.parse(readFileSync(at(baselineRoot,'tests/fixtures/v4-baseline.json'),'utf8'));
function envelope(state){
 const payload=JSON.stringify(state);let h=2166136261;
 for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(h>>>0).toString(16),payload});
}
function legacy(version){
 const state=JSON.parse(JSON.parse(golden.saves[0].raw).payload);
 if(version<4){state.version=version;state.player.hp=1;for(const item of state.player.items){delete item.level;delete item.levelXp;item.growth=0;}}
 state.auditMetadata={keep:'legacy 😀',nested:[{value:7}]};return envelope(state);
}
function fixture(count=32,position="first"){
 const state=E.newGame(27017);state.runId='storage-reuse-27017';
 state.floor=200;state.player.level=100;state.player.gold=1000000;state.player.hp=E.stats(state).maxHp;
 while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
 const weapon=state.player.items.filter(item=>item.slot==='weapon'),armor=state.player.items.filter(item=>item.slot==='armor'),relic=state.player.items.filter(item=>item.slot==='relic');
 state.player.equipped={weapon:(position==='last'?weapon.at(-1):weapon[0]).id,armor:(position==='last'?armor.at(-1):armor[0]).id,relic:(position==='last'?relic.at(-1):relic[0]).id,relic2:(position==='last'?relic.at(-2):relic[1]).id,relic3:(position==='last'?relic.at(-3):relic[2]).id};
 state.player.hp=E.stats(state).maxHp;
 state.auditMetadata={keep:'未知扩展字段 😀 界',nested:[{value:7}],decoy:'{"version":2,"format":"dice-abyss"}'};
 assert(B.validateSave(state));assert(C.validateSave(state));return state;
}
const base=fixture(),baseRaw=B.encodeSave(base),oldRaws=Object.fromEntries([1,2,3,4].map(v=>[v,legacy(v)]));
const next=E.transition(base,{type:'lock',id:'i7'});
const invalidOld=JSON.parse(JSON.parse(oldRaws[4]).payload);invalidOld.nextId=3;const invalidOldRaw=envelope(invalidOld);
const noncanonical=JSON.parse(baseRaw),noncanonicalRaw=JSON.stringify({payload:noncanonical.payload,ignored:'version 2',checksum:noncanonical.checksum,version:5,format:'dice-abyss'},null,2);
const sameRevisionBranch=structuredClone(base);sameRevisionBranch.auditMetadata.nested[0].value++;
const invalidNext=structuredClone(next);invalidNext.nextId=3;
const snapshotCase=(name,main=baseRaw,mirror=main,options={})=>({name,main,mirror,expected:options.expected===null?null:options.explicitReplace?undefined:options.expected??B.decodeSave(mirror===baseRaw&&main!==baseRaw?mirror:main),next:options.next??next,...options});
const scenarios=[
 snapshotCase('ordinary V5 primary'),snapshotCase('noncanonical V5 primary',noncanonicalRaw),
 snapshotCase('recovered V5 mirror','corrupt primary',baseRaw),
 snapshotCase('recovered V5 mirror behind invalid V4 primary',invalidOldRaw,baseRaw),
 snapshotCase('mismatched mirror warning',baseRaw,'stale mirror', {expected:base}),
 snapshotCase('new run with no active save',null,null,{expected:null,next:base}),
 snapshotCase('null identical snapshot',baseRaw,baseRaw,{expected:null,next:base}),
 snapshotCase('null branch conflict',baseRaw,baseRaw,{expected:null,next:sameRevisionBranch}),
 snapshotCase('explicit replacement',baseRaw,baseRaw,{explicitReplace:true,next:sameRevisionBranch}),
 snapshotCase('unknown-field conflict',baseRaw,baseRaw,{expected:sameRevisionBranch}),
 snapshotCase('invalid candidate validation',baseRaw,baseRaw,{next:invalidNext}),
 snapshotCase('corrupt immutable legacy archive',baseRaw,baseRaw,{archives:{[B.LEGACY_BACKUP_KEY]:'corrupt archive'}}),
 snapshotCase('unused corrupt V4 archive is unchanged',baseRaw,baseRaw,{archives:{[B.V4_BACKUP_KEY]:'corrupt V4 archive'}}),
 snapshotCase('existing originals remain immutable',baseRaw,baseRaw,{archives:{[B.LEGACY_BACKUP_KEY]:oldRaws[2],[B.V4_BACKUP_KEY]:oldRaws[4]}}),
 snapshotCase('main read throws and mirror recovers',baseRaw,baseRaw,{failRead:{key:B.SAVE_KEY,at:1}}),
 snapshotCase('mirror health read throws',baseRaw,baseRaw,{failRead:{key:B.BACKUP_KEY,at:1}}),
 snapshotCase('first source reread throws',baseRaw,baseRaw,{failRead:{key:B.SAVE_KEY,at:2}}),
 snapshotCase('second source reread throws',baseRaw,baseRaw,{failRead:{key:B.SAVE_KEY,at:3}}),
 snapshotCase('legacy archive read throws',baseRaw,baseRaw,{failRead:{key:B.LEGACY_BACKUP_KEY,at:1}}),
 snapshotCase('source changes before pre-V5 probe',baseRaw,baseRaw,{changeRead:{key:B.SAVE_KEY,at:2,raw:oldRaws[4]}}),
 snapshotCase('source changes before legacy probe',baseRaw,baseRaw,{changeRead:{key:B.SAVE_KEY,at:3,raw:oldRaws[2]}}),
 snapshotCase('main write fails',baseRaw,baseRaw,{failWrite:B.SAVE_KEY}),
 snapshotCase('mirror write fails',baseRaw,baseRaw,{failWrite:B.BACKUP_KEY}),
 snapshotCase('unreadable legacy rescue',invalidOldRaw,'corrupt mirror',{explicitReplace:true,next:base}),
 snapshotCase('current-schema import',baseRaw,baseRaw,{importRaw:B.encodeSave(sameRevisionBranch),next:sameRevisionBranch}),
 snapshotCase('mismatched imported raw',baseRaw,baseRaw,{importRaw:baseRaw,next:sameRevisionBranch}),
 snapshotCase('stale import expected',baseRaw,baseRaw,{importRaw:B.encodeSave(next),expected:sameRevisionBranch}),
];
for(const version of [1,2,3,4]){
 const raw=oldRaws[version],expected=B.decodeSave(raw),legacyNext=E.transition(expected,{type:'lock',id:expected.player.equipped.weapon});
 scenarios.push(snapshotCase(`V${version} migration primary`,raw,raw,{expected,next:legacyNext}));
 scenarios.push(snapshotCase(`V${version} migration mirror`,'corrupt primary',raw,{expected,next:legacyNext}));
 scenarios.push(snapshotCase(`V${version} import replaces V5`,baseRaw,baseRaw,{importRaw:raw,next:expected}));
}
for(const failWrite of [B.LEGACY_BACKUP_KEY,B.V4_BACKUP_KEY,B.SAVE_KEY,B.BACKUP_KEY]){
 const raw=oldRaws[2],expected=B.decodeSave(raw),legacyNext=E.transition(expected,{type:'lock',id:expected.player.equipped.weapon});
 scenarios.push(snapshotCase('legacy failure at '+failWrite,raw,raw,{expected,next:legacyNext,failWrite}));
}

// Full-state fallback probes: accepted but noncanonical JSON spellings.
function payloadEnvelope(payload){
 let h=2166136261;for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);
 return JSON.stringify({format:'dice-abyss',version:5,checksum:(h>>>0).toString(16),payload});
}
const basePayload=JSON.stringify(base);
for(const [name,payload] of [
 ['whitespace payload',JSON.stringify(base,null,2)],
 ['escaped Unicode payload',basePayload.replaceAll('界','\\u754c').replaceAll('😀','\\ud83d\\ude00')],
 ['noncanonical integer spellings',basePayload.replace('"revision":0','"revision":0.0').replace('"floor":200','"floor":2e2')],
 ['duplicate top-level unknown keys',basePayload.slice(0,-1)+',"auditDuplicate":1,"auditDuplicate":2}'],
 ['integer-like keys in noncanonical order',basePayload.slice(0,-1)+',"auditNumbers":{"10":"ten","2":"two","01":"one"}}'],
 ['unknown negative zero',basePayload.slice(0,-1)+',"auditNegativeZero":-0}'],
 ['escaped slash and key',basePayload.slice(0,-1)+',"auditSlash":"a\\/b","audit\\u0055nicodeKey":true}'],
 ['unknown nested proto/toJSON strings',basePayload.slice(0,-1)+',"auditPrototype":{"__proto__":{"x":7},"toJSON":"ordinary text","constructor":"ordinary text"}}']
]){
 const raw=payloadEnvelope(payload),expected=B.decodeSave(raw),after=E.transition(expected,{type:'lock',id:'i7'});
 scenarios.push(snapshotCase(name,raw,raw,{expected,next:after}));
 scenarios.push(snapshotCase(name+' identical-null',raw,raw,{expected:null,next:expected}));
 scenarios.push(snapshotCase(name+' import',baseRaw,baseRaw,{importRaw:raw,next:expected}));
 const branch=structuredClone(expected);branch.auditMetadata.nested[0].value++;
 scenarios.push(snapshotCase(name+' unknown-field conflict',raw,raw,{expected:branch,next:after}));
}
const fixtureSpecs=[...[32,1000,10000].flatMap(count=>['first','last'].map(position=>({name:`${count} items, equipped ${position}`,count,position}))),
 ...[['ASCII','a'],['Chinese','界']].map(([label,ch])=>({name:'4.95MB '+label+' unknown metadata',count:32,position:'first',pad:true,ch}))];
function padFixture(state,ch){
 state.auditPadding='';const bytes=Buffer.byteLength(ch),available=4950000-Buffer.byteLength(B.encodeSave(state));
 // Leave an ASCII suffix, preserving whole Unicode code points. Vary its
 // content as well as length because the unpadded checksum has 1–8 hex digits.
 const core=ch.repeat(Math.floor((available-32)/bytes));state.auditPadding=core;
 const missing=4950000-Buffer.byteLength(B.encodeSave(state));
 for(let delta=-8;delta<=8;delta++)for(const tail of '0123456789abcdef'){
  state.auditPadding=core+'x'.repeat(Math.max(0,missing+delta-1))+tail;
  if(Buffer.byteLength(B.encodeSave(state))===4950000)return;
 }
 throw Error('Unable to produce the preregistered exact 4.95MB fixture');
}

function execute(S,spec){
 const map=new Map(Object.entries(spec.archives??{})),events=[],reads=new Map();
 if(spec.main!==null)map.set(S.SAVE_KEY,spec.main);if(spec.mirror!==null)map.set(S.BACKUP_KEY,spec.mirror);
 const store={getItem(key){const n=(reads.get(key)??0)+1;reads.set(key,n);
  if(spec.changeRead?.key===key&&spec.changeRead.at===n)map.set(key,spec.changeRead.raw);
  if(spec.failRead?.key===key&&spec.failRead.at===n){events.push(['get-error',key]);throw Error('synthetic read failure');}
  const value=map.get(key)??null;events.push(['get',key,value]);return value;
 },setItem(key,value){events.push(['set',key,value]);if(spec.failWrite===key)throw Error('synthetic write failure');map.set(key,value);}};
 const state=structuredClone(spec.next),expected=spec.expected===undefined?undefined:structuredClone(spec.expected),before=JSON.stringify({state,expected});
 let outcome;try{outcome={result:spec.importRaw===undefined?S.saveGame(state,expected,store):S.saveImportedGame(state,spec.importRaw,expected,store)};}
 catch(error){outcome={error:{name:error.name,message:error.message}};}
 assert.equal(JSON.stringify({state,expected}),before,'save paths cannot mutate caller snapshots');
 const transactionEvents=events.slice(),persisted=[...map].sort(([a],[b])=>a.localeCompare(b)),loaded=S.loadSave(store);
 return {outcome,events:transactionEvents,persisted,loaded,callerUnchanged:true};
}
function parseProfile(S,state,raw,after){
 const parse=JSON.parse,stringify=JSON.stringify,encode=TextEncoder.prototype.encode,OriginalSet=globalThis.Set,calls=[],serializations=[];let encodes=0,inventorySets=0;
 const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),writes=[],store={getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);map.set(key,value);}};
 try{globalThis.Set=class extends OriginalSet{constructor(values){super(values);if(Array.isArray(values)&&values.length===state.player.items.length&&values.every(value=>typeof value==='string'&&/^i\d+$/.test(value)))inventorySets++;}};JSON.parse=function(...args){calls.push(args[0]);return Reflect.apply(parse,this,args);};JSON.stringify=function(...args){serializations.push(args[0]);return Reflect.apply(stringify,this,args);};TextEncoder.prototype.encode=function(...args){encodes++;return Reflect.apply(encode,this,args);};S.saveGame(after,state,store);}
 finally{JSON.parse=parse;JSON.stringify=stringify;TextEncoder.prototype.encode=encode;globalThis.Set=OriginalSet;}
 assert.deepEqual(S.loadSave(store).state,after);assert.equal(map.get(S.SAVE_KEY),S.encodeSave(after));assert.equal(map.get(S.SAVE_KEY),map.get(S.BACKUP_KEY));
 return {activeEnvelopeParses:calls.filter(rawInput=>rawInput===raw).length,totalParses:calls.length,fullSerializations:serializations.length,utf8Encodes:encodes,inventorySets,writeKeys:writes.map(([key])=>key)};
}
const summary=values=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,min:s[0],median:(s[(s.length-1)>>1]+s[s.length>>1])/2,p90:s[Math.ceil(s.length*.9)-1],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1),mean:s.reduce((a,b)=>a+b,0)/s.length};};
const report={kind:'Round21 decoder-only parsed V5 inventory ID Set reuse differential and paired Node CPU timing',createdAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,baselineRoot:resolve(baselineRoot),currentRoot:resolve(currentRoot),sourceHashes:initialHashes,scriptSha256:scriptHash,verifyOnly,status:'RUNNING',differential:[],parseProfiles:[],timing:{status:verifyOnly?'NOT_RUN':'RUNNING',pairsPerCell:24,warmupPairsPerCell:4,method:'Alternating baseline→current and current→baseline pairs; identical base-engine seed 27017 and complete unknown metadata. Time only synchronous saveGame with plain Map storage. Setup, transition and exact postcondition assertions are outside the interval. Every formal sample retained. No JSON instrumentation runs inside timing. Parent coordinated no competing agent browser or heavy Node jobs during this fixed run; outside shared-host load remains uncontrolled. This is not native browser, click latency or physical disk measurement.',cells:[]},render:{status:verifyOnly?'NOT_RUN':'RUNNING',pairsPerCell:24,warmupPairsPerCell:4,method:'Alternating AB/BA pure gameView string generation; same live-combat state with zero nextLuck, eventLuck and firstCritLuck. Setup, validation, state immutability, output hash checks and timing summaries are outside the interval. This excludes DOM insertion, layout, paint, input, browser and GPU cost.',cells:[]}};
try{
 for(const spec of scenarios){const baseline=execute(B,spec),current=execute(C,spec);assert.deepEqual(current,baseline,spec.name);report.differential.push({name:spec.name,exactlyEqual:true,resultSha256:sha(current),writeKeys:current.events.filter(([op])=>op==='set').map(([,key])=>key),outcome:current.outcome,callerUnchanged:current.callerUnchanged});}
 for(const spec of fixtureSpecs){
  const count=spec.count,state=fixture(count,spec.position);if(spec.pad)padFixture(state,spec.ch);const raw=B.encodeSave(state),after=E.transition(state,{type:'lock',id:'i7'}),afterRaw=B.encodeSave(after);
  assert.equal(C.encodeSave(state),raw);assert.equal(C.encodeSave(after),afterRaw);
  const profile={name:spec.name,items:count,rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:sha(raw),afterSha256:sha(afterRaw),baseline:parseProfile(B,state,raw,after),current:parseProfile(C,state,raw,after)};
  assert.equal(profile.current.activeEnvelopeParses,1);assert.equal(profile.current.totalParses,2);
  assert.equal(profile.baseline.inventorySets,4);assert.equal(profile.current.inventorySets,3);
  assert.equal(profile.current.fullSerializations,profile.baseline.fullSerializations);assert.equal(profile.current.utf8Encodes,profile.baseline.utf8Encodes);assert.deepEqual(profile.current.writeKeys,profile.baseline.writeKeys);
  report.parseProfiles.push(profile);
  if(verifyOnly)continue;
  const values={baseline:[],current:[]},decode={baseline:[],current:[]},order=[];
  for(let pair=-4;pair<24;pair++){
   const variants=pair%2===0?[['baseline',B],['current',C]]:[['current',C],['baseline',B]];
   if(pair>=0)order.push(variants.map(([name])=>name));
   for(const [name,S]of variants){const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),store={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
    const start=performance.now(),result=S.saveGame(after,state,store),elapsed=performance.now()-start;
    if(pair>=0)values[name].push(elapsed);
    assert.deepEqual(result,{mirrored:true,warning:''});assert.equal(map.get(S.SAVE_KEY),afterRaw);assert.equal(map.get(S.BACKUP_KEY),afterRaw);
   }
  }
  for(let pair=-4;pair<24;pair++)for(const [name,S]of (pair%2===0?[['baseline',B],['current',C]]:[['current',C],['baseline',B]])){
   const start=performance.now(),decoded=S.decodeSave(raw),elapsed=performance.now()-start;assert.deepEqual(decoded,state);
   if(pair>=0)decode[name].push(elapsed);
  }
  const pairedDifferences=values.current.map((v,i)=>v-values.baseline[i]);
  report.timing.cells.push({name:spec.name,items:count,position:spec.position,order,decodeSamplesMs:decode,decodeSummaryMs:{baseline:summary(decode.baseline),current:summary(decode.current)},samplesMs:values,baselineMs:summary(values.baseline),currentMs:summary(values.current),pairedCurrentMinusBaselineMs:pairedDifferences,pairedDifferenceSummaryMs:summary(pairedDifferences)});
 }

 if(!verifyOnly)for(const count of [32,10000]){
  let state=E.newGame(27017);state.runId='render-storage-audit';const starters=state.player.items.slice();
  while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
  if(count===10000)state.player.items=[...state.player.items.slice(3),...starters];
  state.floor=200;state.player.level=100;state.player.hp=E.stats(state).maxHp;state.fate=[3,4];state.phase='route';
  state.route=['combat','combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));
  state=E.transition(state,{type:'enter'});assert.equal(state.phase,'combat');assert.equal(state.nextLuck||0,0);assert.equal(state.eventLuck||0,0);assert.equal(E.stats(state).firstCritLuck,0);assert(B.validateSave(state));assert(C.validateSave(state));
  const ui={view:'game',busy:false},before=JSON.stringify(state),values={baseline:[],current:[]},html={baseline:BV.gameView(state,ui),current:CV.gameView(state,ui)},order=[];
  for(let pair=-4;pair<24;pair++){
   const variants=pair%2===0?[['baseline',BV],['current',CV]]:[['current',CV],['baseline',BV]];if(pair>=0)order.push(variants.map(([name])=>name));
   for(const [name,V]of variants){const start=performance.now(),value=V.gameView(state,ui),elapsed=performance.now()-start;if(pair>=0)values[name].push(elapsed);assert.equal(value,html[name]);assert.equal(JSON.stringify(state),before);}
  }
  report.render.cells.push({name:count===32?'normal combat, 32 items, equipped first':'normal combat, 10000 items, equipped last',items:count,equippedIndices:Object.values(state.player.equipped).filter(Boolean).map(id=>state.player.items.findIndex(item=>item.id===id)),rawSha256:sha(before),firstCritLuck:E.stats(state).firstCritLuck,nextLuck:state.nextLuck||0,eventLuck:state.eventLuck||0,order,html:Object.fromEntries(Object.entries(html).map(([name,value])=>[name,{characters:value.length,sha256:sha(value)}])),samplesMs:values,baselineMs:summary(values.baseline),currentMs:summary(values.current),pairedDifferenceSummaryMs:summary(values.current.map((v,i)=>v-values.baseline[i])),stateUnchanged:true});
 }
 assert.deepEqual(sourceHashes(),initialHashes,'source changed during the run');assert.equal(sha(readFileSync(new URL(import.meta.url),'utf8')),scriptHash,'script changed during the run');
 report.sourceAndScriptStable=true;report.status='PASS';if(!verifyOnly){report.timing.status='MEASURED_WITH_LIMITATIONS';report.render.status='MEASURED_WITH_LIMITATIONS';}
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message};process.exitCode=1;}
report.completedAt=new Date().toISOString();writeFileSync(resolve(outputPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,differentialRows:report.differential.length,parseProfiles:report.parseProfiles,timingStatus:report.timing.status,timing:report.timing.cells.map(({name,items,baselineMs,currentMs,pairedDifferenceSummaryMs})=>({name,items,baselineMs,currentMs,pairedDifferenceSummaryMs})),render:report.render.cells.map(({name,baselineMs,currentMs,pairedDifferenceSummaryMs})=>({name,baselineMs,currentMs,pairedDifferenceSummaryMs})),error:report.error,output:resolve(outputPath)},null,2));
