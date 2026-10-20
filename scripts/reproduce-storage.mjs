import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const root=pathToFileURL(resolve(process.argv[2]||'.')+'/');
const E=await import(new URL('src/engine.js',root));
const S=await import(new URL('src/storage.js',root));
const V=await import(new URL('src/views.js',root));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};
function envelope(state){const payload=JSON.stringify(state);let h=2166136261;for(let i=0;i<payload.length;i++)h=Math.imul(h^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,checksum:(h>>>0).toString(16),payload});}
function room(type,seed=741){let s=E.newGame(seed);s.floor=200;s.player.level=50;s.player.gold=100000;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));return E.transition(s,{type:'enter'});}
const errorOf=fn=>{try{fn();return null;}catch(error){return error.message;}};
const results={project:root.href,node:process.version,kind:'synthetic fault-injection, no user saves',findings:[]};

// A valid old mirror is the active recovered run. The main has a correct
// envelope checksum but an invalid payload, simulating content corruption.
{
 const fixture=JSON.parse(readFileSync(new URL('tests/fixtures/v4-baseline.json',root),'utf8')).saves[0];
 const invalid=JSON.parse(JSON.parse(fixture.raw).payload);invalid.nextId=3;
 const invalidRaw=envelope(invalid),store=memory();store.setItem(S.SAVE_KEY,invalidRaw);store.setItem(S.BACKUP_KEY,fixture.raw);
 const loaded=S.loadSave(store);assert(loaded.recovered);assert(loaded.state);assert.throws(()=>S.decodeSave(invalidRaw));
 const next=E.transition(loaded.state,{type:'lock',id:loaded.state.player.equipped.weapon});
 S.saveGame(next,loaded.state,store);
 const archive=S.readLegacyBackup(store);
 results.findings.push({id:'SAVE-ARCHIVE-01',activeRecovered:true,invalidPrimaryAcceptedAsArchive:archive===invalidRaw,validOriginalArchivePreserved:archive===fixture.raw,archiveDecodeError:errorOf(()=>S.decodeSave(archive)),activeSaveValid:!!S.loadSave(store).state});
}

// A malformed import must never replace a good run if its required content
// cannot render or execute. Start from actual engine-generated events.
{
 const malformed=room('abyssauction');assert(S.validateSave(malformed));delete malformed.event.reward;
 const active=E.newGame(18),store=memory();S.saveGame(active,null,store);
 const raw=envelope(malformed),accepted=S.validateSave(malformed),importError=errorOf(()=>S.saveImportedGame(malformed,raw,active,store));
 results.findings.push({id:'SAVE-SCHEMA-01',mutation:'delete pending abyssauction.event.reward',accepted,importError,previousRunOverwritten:S.loadSave(store).state?.runId!==active.runId,renderError:errorOf(()=>V.center(malformed,{view:'game',busy:false}))});
}
{
 let malformed=room('oathgate');malformed=E.transition(malformed,{type:'event-choice',id:'accept',confirmed:true});assert(S.validateSave(malformed));malformed.enemy=null;
 const active=E.newGame(19),store=memory();S.saveGame(active,null,store);
 const raw=envelope(malformed),accepted=S.validateSave(malformed),importError=errorOf(()=>S.saveImportedGame(malformed,raw,active,store));
 results.findings.push({id:'SAVE-SCHEMA-02',mutation:'null enemy in active event-triggered combat',accepted,importError,previousRunOverwritten:S.loadSave(store).state?.runId!==active.runId,renderError:errorOf(()=>V.center(malformed,{view:'game',busy:false})),rollError:errorOf(()=>E.transition(malformed,{type:'roll'}))});
}

// Capacity and byte size are measured on generated inventory, not inferred.
{
 const s=E.newGame(713);while(s.player.items.length<10000)s.player.items.push(E.makeItem(s,undefined,0));
 const start=performance.now(),raw=S.encodeSave(s),encodedMs=performance.now()-start;
 const t=performance.now(),decoded=S.decodeSave(raw),decodedMs=performance.now()-t;
 assert.equal(decoded.player.items.length,10000);
 results.capacity={items:10000,rawCharacters:raw.length,utf8Bytes:Buffer.byteLength(raw),twoCopiesUtf16CodeUnitBytes:raw.length*4,encodedMs,decodedMs,roundtrip:true};
}
const text=JSON.stringify(results,null,2);console.log(text);
if(process.argv[3])writeFileSync(process.argv[3],text+'\n');
