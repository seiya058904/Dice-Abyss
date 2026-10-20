// Independent offline recovery review. Synthetic saved states only; no browser
// storage, network, runtime edits, real player data or server startup.
// node scripts/audit-save-recovery-round13.mjs --source . --baseline /path/to/input --output /tmp/recovery-review.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const usage='Pass --source PROJECT --baseline IMMUTABLE_INPUT --output EXTERNAL_JSON';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 const key=args[i],value=args[i+1];
 assert(['--source','--baseline','--output'].includes(key)&&value&&!value.startsWith('--')&&!Object.hasOwn(options,key),usage);
 options[key]=value;
}
assert(options['--source']&&options['--baseline']&&options['--output'],usage);
const source=resolve(options['--source']),baseline=resolve(options['--baseline']),output=resolve(options['--output']);
const scriptRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const root of [source,baseline,scriptRoot]){const name=relative(root,output);assert(name.startsWith('..'+sep)||isAbsolute(name),'Report must be outside all project directories.');}
const uri=(root,file)=>pathToFileURL(resolve(root,file));
const S=await import(uri(source,'src/storage.js')),B=await import(uri(baseline,'src/storage.js')),E=await import(uri(source,'src/engine.js'));
const {saveRecoveryView}=await import(uri(source,'src/save-recovery-view.js'));
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const files=['src/storage.js','src/app.js','src/save-recovery-view.js','src/save-recovery.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(resolve(source,file)))])));
const sourceHashes=await hashes();
const baselineStorageSha256=hash(await readFile(resolve(baseline,'src/storage.js')));
const memory=()=>{const map=new Map(),writes=[],reads=[];return {map,writes,reads,getItem(key){reads.push(key);return map.get(key)??null;},setItem(key,value){writes.push([key,value]);map.set(key,value);}};};
const state=E.newGame(99173);state.runId='independent-recovery-round13';
state.external={unicode:'旅途 🧭',nested:[{untouched:[1,2,3]}]};state.player.items[0].external={history:['one','two']};
const raw=S.encodeSave(state);assert.equal(raw,B.encodeSave(state));
const fixtures=JSON.parse(await readFile(resolve(baseline,'tests/fixtures/v4-baseline.json'),'utf8'));
const forms=[['absent',null],['empty',''],['invalid-json','broken'],['schema-4',fixtures.saves[0].raw],['schema-5',raw]],matrix=[];
for(const [primaryName,primary]of forms)for(const [mirrorName,mirror]of forms){
 const store=memory();if(primary!==null)store.map.set(S.SAVE_KEY,primary);if(mirror!==null)store.map.set(S.BACKUP_KEY,mirror);
 const original=new Map(store.map),snapshot=S.inspectSaveRecovery(store);
 assert.equal(store.writes.length,0);assert.deepEqual(store.reads,[S.SAVE_KEY,S.BACKUP_KEY]);assert.deepEqual(snapshot.raw,{primary,mirror});
 const before=JSON.stringify(state),view=saveRecoveryView(state,snapshot);
 assert.equal(JSON.stringify(state),before);assert(!view.includes('undefined'));assert(!view.includes('NaN'));assert.deepEqual(store.map,original);
 let restored=false;
 if(primary===null&&mirror===null){
  const result=S.restoreMissingSave(state,snapshot.raw,store);assert.equal(result.mirrored,true);
  assert.equal(store.map.get(S.SAVE_KEY),raw);assert.equal(store.map.get(S.BACKUP_KEY),raw);restored=true;
 }else{
  assert.throws(()=>S.restoreMissingSave(state,{primary:null,mirror:null},store),/已发生变化/);
  assert.equal(store.writes.length,0);assert.deepEqual(store.map,original);
 }
 if(snapshot.status==='available')assert.deepEqual(snapshot.state,B.loadSave({getItem:key=>key===S.SAVE_KEY?primary:key===S.BACKUP_KEY?mirror:null}).state);
 matrix.push({primary:primaryName,mirror:mirrorName,status:snapshot.status,restored,writeCount:store.writes.length,viewSha256:hash(view)});
}
// Equal decoded state, revision and checksum do not make different raw strings
// identical. The read decision must remain bound to both reviewed originals.
const spaced=raw+' \n';assert.deepEqual(S.decodeSave(spaced),state);
assert.equal(S.sameSaveRecords({primary:raw,mirror:raw},{primary:spaced,mirror:raw}),false);
// A candidate's decoded graph cannot alias the retained page or the disk text.
const store=memory();store.map.set(S.SAVE_KEY,raw);store.map.set(S.BACKUP_KEY,raw);
const candidate=S.inspectSaveRecovery(store);candidate.state.external.nested[0].untouched.push(99);
assert.deepEqual(S.decodeSave(store.map.get(S.SAVE_KEY)),state);assert.deepEqual(state.external.nested[0].untouched,[1,2,3]);
const archive=memory();archive.map.set(S.LEGACY_BACKUP_KEY,'unreadable archive');
assert.throws(()=>S.restoreMissingSave(state,{primary:null,mirror:null},archive),/升级前归档/);
assert.equal(archive.writes.length,0);assert.equal(archive.map.get(S.LEGACY_BACKUP_KEY),'unreadable archive');
const inaccessible={getItem(){throw Error('unavailable');},setItem(){throw Error('must not write');}};
assert.equal(S.inspectSaveRecovery(inaccessible).status,'unreadable');
assert.throws(()=>S.restoreMissingSave(state,{primary:null,mirror:null},inaccessible),/未写入/);
assert.deepEqual(await hashes(),sourceHashes,'Runtime source changed during review.');
assert.equal(hash(await readFile(resolve(baseline,'src/storage.js'))),baselineStorageSha256);
const report={
 audit:'independent recovery raw-state matrix and source review',status:'PASS',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,
 baselineVersion:JSON.parse(await readFile(resolve(baseline,'package.json'),'utf8')).version,
 sourceHashes,baselineStorageSha256,scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),environment:{node:process.version,platform:process.platform,arch:process.arch},
 matrix,matrixCases:matrix.length,additionalGroups:4,synthetic:true,
 scope:'Complete raw-record matrix, unknown-field retention, migration/load precedence and source ownership. Runtime comparisons use the actual immutable input storage module.',
 additionalChecks:['Equal decoded payload with different whitespace remains a different raw snapshot.','Decoded candidate mutation does not alias the retained page state or original stored strings.','Corrupt immutable pre-levels archive rejects recovery before primary/mirror writes.','Storage read access failure reports unreadable and restoration writes nothing.'],
 limitations:['These are synthetic in-memory storage records, not real cross-tab browser events, OS failure or physical storage quotas.','Real focus, downloaded files, presentation cancellation and confirmation races have a separate browser/harness protocol.','The app holds the existing Web Lock for recovery. Cooperating tabs use that lock; raw comparisons are not a universal atomic transaction against external writers that ignore it.'],
};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,status:report.status,matrixCases:matrix.length,additionalGroups:report.additionalGroups,sourceHashes}));
