import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';

// Read-only module inputs and isolated in-memory stores. This script neither
// opens a browser nor contacts a server or touches a player's localStorage.
// --verify-only retains the full differential and parse counts without timing.
const [baselineRoot,currentRoot,outputPath,...flags]=process.argv.slice(2);
if(!baselineRoot||!currentRoot||!outputPath||flags.some(flag=>flag!=='--verify-only'))throw Error('Usage: node benchmark-storage-reuse.mjs INPUT_ROOT CURRENT_ROOT OUTPUT_JSON [--verify-only]');
const verifyOnly=flags.includes('--verify-only'),at=(root,file)=>pathToFileURL(resolve(root,file));
const B=await import(at(baselineRoot,'src/storage.js')),C=await import(at(currentRoot,'src/storage.js'));
const E=await import(at(baselineRoot,'src/engine.js'));
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceHashes=()=>Object.fromEntries([['baseline',baselineRoot],['current',currentRoot]].map(([name,root])=>[name,Object.fromEntries(['src/storage.js','src/engine.js'].map(file=>[file,sha(readFileSync(at(root,file),'utf8'))]))]));
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
function fixture(count=32){
 const state=E.newGame(27017);state.runId='storage-reuse-27017';
 state.floor=200;state.player.level=100;state.player.gold=1000000;state.player.hp=E.stats(state).maxHp;
 while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
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
 const parse=JSON.parse,stringify=JSON.stringify,encode=TextEncoder.prototype.encode,calls=[],serializations=[];let encodes=0;
 const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),writes=[],store={getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);map.set(key,value);}};
 try{JSON.parse=function(...args){calls.push(args[0]);return Reflect.apply(parse,this,args);};JSON.stringify=function(...args){serializations.push(args[0]);return Reflect.apply(stringify,this,args);};TextEncoder.prototype.encode=function(...args){encodes++;return Reflect.apply(encode,this,args);};S.saveGame(after,state,store);}
 finally{JSON.parse=parse;JSON.stringify=stringify;TextEncoder.prototype.encode=encode;}
 assert.deepEqual(S.loadSave(store).state,after);assert.equal(map.get(S.SAVE_KEY),S.encodeSave(after));assert.equal(map.get(S.SAVE_KEY),map.get(S.BACKUP_KEY));
 return {activeEnvelopeParses:calls.filter(rawInput=>rawInput===raw).length,totalParses:calls.length,fullSerializations:serializations.length,utf8Encodes:encodes,writeKeys:writes.map(([key])=>key)};
}
const summary=values=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,min:s[0],median:(s[(s.length-1)>>1]+s[s.length>>1])/2,p90:s[Math.ceil(s.length*.9)-1],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1),mean:s.reduce((a,b)=>a+b,0)/s.length};};
const report={kind:'Round07 storage read reuse differential and paired Node timing',createdAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,baselineRoot:resolve(baselineRoot),currentRoot:resolve(currentRoot),sourceHashes:initialHashes,scriptSha256:scriptHash,verifyOnly,status:'RUNNING',differential:[],parseProfiles:[],timing:{status:verifyOnly?'NOT_RUN':'RUNNING',pairsPerCell:12,warmupPairsPerCell:2,method:'Alternating baseline→current and current→baseline pairs; identical base-engine seed 27017 and complete unknown metadata. Time only synchronous saveGame with plain Map storage. Setup, transition and exact postcondition assertions are outside the interval. Every formal sample retained. No JSON instrumentation runs inside timing. Shared-host CPU load is uncontrolled. This is not native browser, click latency or physical disk measurement.',cells:[]}};
try{
 for(const spec of scenarios){const baseline=execute(B,spec),current=execute(C,spec);assert.deepEqual(current,baseline,spec.name);report.differential.push({name:spec.name,exactlyEqual:true,resultSha256:sha(current),writeKeys:current.events.filter(([op])=>op==='set').map(([,key])=>key),outcome:current.outcome,callerUnchanged:current.callerUnchanged});}
 for(const count of [100,1000,10000]){
  const state=fixture(count),raw=B.encodeSave(state),after=E.transition(state,{type:'lock',id:'i7'}),afterRaw=B.encodeSave(after);
  assert.equal(C.encodeSave(state),raw);assert.equal(C.encodeSave(after),afterRaw);
  const profile={items:count,rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:sha(raw),afterSha256:sha(afterRaw),baseline:parseProfile(B,state,raw,after),current:parseProfile(C,state,raw,after)};
  assert.equal(profile.current.activeEnvelopeParses,1);assert.equal(profile.current.totalParses,2);
  assert.equal(profile.current.fullSerializations,profile.baseline.fullSerializations);assert.equal(profile.current.utf8Encodes,profile.baseline.utf8Encodes);assert.deepEqual(profile.current.writeKeys,profile.baseline.writeKeys);
  report.parseProfiles.push(profile);
  if(verifyOnly)continue;
  const values={baseline:[],current:[]},order=[];
  for(let pair=-2;pair<12;pair++){
   const variants=pair%2===0?[['baseline',B],['current',C]]:[['current',C],['baseline',B]];
   if(pair>=0)order.push(variants.map(([name])=>name));
   for(const [name,S]of variants){const map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),store={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
    const start=performance.now(),result=S.saveGame(after,state,store),elapsed=performance.now()-start;
    if(pair>=0)values[name].push(elapsed);
    assert.deepEqual(result,{mirrored:true,warning:''});assert.equal(map.get(S.SAVE_KEY),afterRaw);assert.equal(map.get(S.BACKUP_KEY),afterRaw);
   }
  }
  const pairedDifferences=values.current.map((v,i)=>v-values.baseline[i]);
  report.timing.cells.push({items:count,order,samplesMs:values,baselineMs:summary(values.baseline),currentMs:summary(values.current),pairedCurrentMinusBaselineMs:pairedDifferences,pairedDifferenceSummaryMs:summary(pairedDifferences)});
 }
 assert.deepEqual(sourceHashes(),initialHashes,'source changed during the run');assert.equal(sha(readFileSync(new URL(import.meta.url),'utf8')),scriptHash,'script changed during the run');
 report.sourceAndScriptStable=true;report.status='PASS';if(!verifyOnly)report.timing.status='MEASURED_WITH_LIMITATIONS';
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message};process.exitCode=1;}
report.completedAt=new Date().toISOString();writeFileSync(resolve(outputPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,differentialRows:report.differential.length,parseProfiles:report.parseProfiles,timingStatus:report.timing.status,timing:report.timing.cells.map(({items,baselineMs,currentMs,pairedDifferenceSummaryMs})=>({items,baselineMs,currentMs,pairedDifferenceSummaryMs})),error:report.error,output:resolve(outputPath)},null,2));
