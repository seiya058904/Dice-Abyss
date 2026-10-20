import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const baselineRoot=process.argv[2],currentRoot=process.argv[3];
if(!baselineRoot||!currentRoot)throw Error('Usage: node scripts/audit-storage-compatibility.mjs INPUT_ROOT CURRENT_ROOT [OUTPUT_JSON]');
const baselineFile=p=>pathToFileURL(resolve(baselineRoot,p));
const currentFile=p=>pathToFileURL(resolve(currentRoot,p));

const S=await import(currentFile('src/storage.js')),B=await import(baselineFile('src/storage.js')),E=await import(baselineFile('src/engine.js'));

const golden=JSON.parse(readFileSync(currentFile('tests/fixtures/v4-baseline.json'),'utf8'));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};
const envelope=state=>{const payload=JSON.stringify(state);let h=2166136261;for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,payload,checksum:(h>>>0).toString(16)});};
const results={kind:'independent synthetic counterexample review',passed:[],notTested:['real browser localStorage quotas','OS crash/power loss','real concurrent tabs']};

// Migration output remains byte-for-byte equivalent for the existing V4 corpus.
for(const fixture of golden.saves)assert.equal(S.encodeSave(S.decodeSave(fixture.raw)),B.encodeSave(B.decodeSave(fixture.raw)));
results.passed.push({check:'all existing V4 committed fixtures migrate identically',fixtures:golden.saves.length});

// A healthy original primary wins over a different old mirror.
{
 const store=memory(),primary=golden.saves[0].raw,mirror=golden.saves[1].raw;
 store.setItem(S.SAVE_KEY,primary);store.setItem(S.BACKUP_KEY,mirror);
 const before=S.loadSave(store).state,next=E.transition(before,{type:'lock',id:before.player.equipped.weapon});S.saveGame(next,before,store);
 assert.equal(store.getItem(S.V4_BACKUP_KEY),primary);assert.deepEqual(S.loadSave(store).state,next);
 results.passed.push({check:'healthy primary retains precedence over a different old mirror'});
}

// Recovery does not overwrite an original archive already claimed earlier.
{
 const store=memory(),first=golden.saves[0].raw,active=golden.saves[1].raw;
 store.setItem(S.V4_BACKUP_KEY,first);store.setItem(S.SAVE_KEY,'broken');store.setItem(S.BACKUP_KEY,active);
 const before=S.loadSave(store).state,next=E.transition(before,{type:'lock',id:before.player.equipped.weapon});S.saveGame(next,before,store);
 assert.equal(store.getItem(S.V4_BACKUP_KEY),first);assert.deepEqual(S.loadSave(store).state,next);
 results.passed.push({check:'first original archive remains immutable after later recovery'});
}

// An explicit replacement with no readable run still retains a checksummed
// original for manual salvage, instead of hiding an unmigratable old file.
{
 const store=memory(),invalid=JSON.parse(JSON.parse(golden.saves[0].raw).payload);invalid.player.gold=-1;
 const raw=envelope(invalid);store.setItem(S.SAVE_KEY,raw);store.setItem(S.BACKUP_KEY,raw);assert.equal(S.loadSave(store).state,null);
 const fresh=E.newGame(377);S.saveGame(fresh,null,store);assert.equal(S.readLegacyBackup(store),raw);assert.deepEqual(S.loadSave(store).state,fresh);
 results.passed.push({check:'explicit new run keeps an unreadable checksummed original available for manual rescue'});
}

// Full-snapshot conflict rejection still happens before any archive writes.
{
 const store=memory(),first=E.newGame(993),branch=structuredClone(first);branch.player.gold++;
 S.saveGame(first,null,store);const initial=new Map(store.map);
 assert.throws(()=>S.saveGame(E.transition(branch,{type:'fate'}),branch,store),/另一窗口/);assert.deepEqual(store.map,initial);
 results.passed.push({check:'same-run/same-revision branch still rejects without disk mutation'});
}

// The schema fix does not mutate live objects or change encoded format/keys.
{
 const before=E.newGame(197),raw=B.encodeSave(before),snapshot=structuredClone(before);
 assert(S.validateSave(before));assert.deepEqual(before,snapshot);assert.equal(S.encodeSave(before),raw);
 for(const key of ['SAVE_KEY','BACKUP_KEY','LEGACY_BACKUP_KEY','V4_BACKUP_KEY','SETTINGS_KEY'])assert.equal(S[key],B[key]);
 results.passed.push({check:'validator remains pure and save envelopes/keys remain unchanged'});
}

if(process.argv[4])writeFileSync(resolve(process.argv[4]),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
