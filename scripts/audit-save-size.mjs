import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

// One accepted fixture and action against any source root, with no browser or
// project writes. Run both roots with the same script and compare the reports.
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const usage='Usage: node scripts/audit-save-size.mjs --source PROJECT_ROOT --output EXTERNAL_JSON';
const args=process.argv.slice(2),options={};
if(args.includes('--help')){console.log(usage);process.exit(0);}
for(let index=0;index<args.length;index+=2){
 const flag=args[index],value=args[index+1];
 if(!['--source','--output'].includes(flag)||!value||value.startsWith('--')||Object.hasOwn(options,flag))throw Error(usage);
 options[flag]=value;
}
if(!options['--output']||!options['--source'])throw Error(usage);
const root=resolve(options['--source']),output=resolve(options['--output']);
const inside=(folder,file)=>{const name=relative(folder,file);return !name||(!isAbsolute(name)&&name!=='..'&&!name.startsWith('..'+(process.platform==='win32'?'\\':'/')));};
if(inside(root,output)||inside(packageRoot,output))throw Error('Output must be outside the audited and script package directories.');
const at=file=>pathToFileURL(resolve(root,file));
const E=await import(at('src/engine.js')),S=await import(at('src/storage.js'));
const LIMIT=5_000_000;
const fingerprint=raw=>createHash('sha256').update(raw).digest('hex');
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);writes.push(key);}};};
const fixed=seed=>{const s=E.newGame(seed);s.runId=`size-audit-${seed}`;return s;};
function pad(state,bytes,encode=S.encodeSave){
 state.auditPadding='';let raw=encode(state),length=bytes-Buffer.byteLength(raw);
 if(length<0)throw Error('Fixture already exceeds target size');
 for(let salt=0;salt<26;salt++)for(let attempt=0;attempt<3;attempt++){
  state.auditPadding='a'.repeat(Math.max(0,length-1))+(length?String.fromCharCode(65+salt):'');
  raw=encode(state);const delta=bytes-Buffer.byteLength(raw);
  if(!delta)return raw;
  length+=delta;
 }
 throw Error('Could not construct exact-size fixture');
}
function envelope(state){const payload=JSON.stringify(state);let hash=2166136261;for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(hash>>>0).toString(16),payload});}
function attempt(fn){try{return {result:fn(),error:null};}catch(error){return {result:null,error:error.message};}}
const report={root,scope:'Synthetic accepted extension-field fixtures and in-memory storage; not natural-player incidence or actual browser quota/power-loss evidence.',limitBytes:LIMIT,checks:[],notTested:['real localStorage quota','physical power loss','actual browser file selection']};

{
 const candidate=fixed(77613),raw=pad(candidate,LIMIT-100),storage=memory(),old=fixed(87);S.saveGame(old,null,storage);
 const imported=attempt(()=>S.saveImportedGame(S.decodeSave(raw),raw,old,storage));
 if(imported.error)throw Error('The initially importable fixture must succeed: '+imported.error);
 const before=S.loadSave(storage).state,next=E.transition(before,{type:'fate'}),nextRaw=S.encodeSave(next),copies=new Map(storage.map);storage.writes.length=0;
 const commit=attempt(()=>S.saveGame(next,before,storage)),loaded=S.loadSave(storage),preserved=[...copies].every(([key,value])=>storage.getItem(key)===value)&&storage.map.size===copies.size;
 report.checks.push({name:'near-limit accepted import followed by fate',inputCharacters:raw.length,inputBytes:Buffer.byteLength(raw),inputSha256:fingerprint(raw),inputValid:S.validateSave(candidate),initialImport:imported,action:'fate',nextCharacters:nextRaw.length,nextBytes:Buffer.byteLength(nextRaw),nextSha256:fingerprint(nextRaw),nextValid:S.validateSave(next),commit,writes:[...storage.writes],bothCopiesPreserved:preserved,reloadPresent:!!loaded.state,reloadError:loaded.error||null,rngPreserved:loaded.state?.rng===before.rng,revisionPreserved:loaded.state?.revision===before.revision,pass:!!commit.error&&preserved&&storage.writes.length===0&&!!loaded.state});
}
{
 const candidate=fixed(13);candidate.auditUnicode='界'.repeat(1_670_000);const raw=S.encodeSave(candidate),storage=memory(),old=fixed(87);S.saveGame(old,null,storage);const snapshot=new Map(storage.map);storage.writes.length=0;
 const rescue=attempt(()=>S.encodeSave(S.decodeSave(raw))===raw),commit=attempt(()=>S.saveGame(candidate,old,storage)),preserved=[...snapshot].every(([key,value])=>storage.getItem(key)===value);
 report.checks.push({name:'readable older multibyte rescue with oversized new write',characters:raw.length,utf8Bytes:Buffer.byteLength(raw),rescueRoundtrip:rescue.result===true,commit,writes:[...storage.writes],bothCopiesPreserved:preserved,pass:rescue.result===true&&!!commit.error&&preserved&&storage.writes.length===0});
}
{
 const legacy=JSON.parse(JSON.parse(JSON.parse(await readFile(at('tests/fixtures/v4-baseline.json'),'utf8')).saves[0].raw).payload),raw=pad(legacy,LIMIT,envelope),candidate=S.decodeSave(raw),storage=memory(),old=fixed(87);S.saveGame(old,null,storage);const snapshot=new Map(storage.map);storage.writes.length=0;
 const commit=attempt(()=>S.saveImportedGame(candidate,raw,old,storage)),preserved=[...snapshot].every(([key,value])=>storage.getItem(key)===value)&&snapshot.size===storage.map.size;
 report.checks.push({name:'migration growth checked before immutable archive writes',inputBytes:Buffer.byteLength(raw),migratedBytes:Buffer.byteLength(S.encodeSave(candidate)),commit,writes:[...storage.writes],allStoragePreserved:preserved,pass:!!commit.error&&preserved&&storage.writes.length===0});
}
{
 const candidate=fixed(113);candidate.log=[];for(const item of candidate.player.items)item.name=`audit-${item.id}`;const raw=pad(candidate,LIMIT),storage=memory(),commit=attempt(()=>S.saveGame(candidate,null,storage)),loaded=S.loadSave(storage);
 const roundtrip=!!loaded.state&&S.encodeSave(loaded.state)===raw;
 report.checks.push({name:'exact inclusive ASCII byte and character boundary',characters:raw.length,utf8Bytes:Buffer.byteLength(raw),commit,reloadRoundtrip:roundtrip,pass:!commit.error&&roundtrip&&raw.length===LIMIT&&Buffer.byteLength(raw)===LIMIT});
}
report.status=report.checks.every(row=>row.pass)?'PASS':'FAIL';
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:1;
