import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [baselineRoot,currentRoot,outputFolder]=process.argv.slice(2);
if(!baselineRoot||!currentRoot||!outputFolder)throw Error('Usage: node reproduce-storage-round04.mjs INPUT_ROOT CURRENT_ROOT OUTPUT_FOLDER');
const at=(root,file)=>pathToFileURL(resolve(root,file)),folder=resolve(outputFolder);
mkdirSync(folder,{recursive:true});
const B=await import(at(baselineRoot,'src/storage.js')),C=await import(at(currentRoot,'src/storage.js')),E=await import(at(baselineRoot,'src/engine.js'));
const BV=await import(at(baselineRoot,'src/views.js')),CV=await import(at(currentRoot,'src/views.js'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};};
const errorOf=fn=>{try{fn();return null;}catch(error){return error.message;}};
function envelope(state){const payload=JSON.stringify(state);let hash=2166136261;for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);return JSON.stringify({format:'dice-abyss',version:state.version,payload,checksum:(hash>>>0).toString(16)});}
function shop(type){let state=E.newGame(78349);state.runId='synthetic-heal-shape-round04';state.player.gold=100000;state.floor=200;state.player.level=50;state.player.hp=E.stats(state).maxHp-10;state.fate=[3,4];state.phase='route';state.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));return E.transition(state,{type:'enter'});}
const prior=JSON.parse(readFileSync(at(baselineRoot,'tests/fixtures/v4-baseline.json'),'utf8')).saves[0].raw;
const results={date:new Date().toISOString(),scope:'Synthetic fields on engine-created merchant and blackmarket offers; no user saves or natural corruption incidence claim.',baselineStorageSha256:sha(readFileSync(at(baselineRoot,'src/storage.js'))),currentStorageSha256:sha(readFileSync(at(currentRoot,'src/storage.js'))),cases:[]};
for(const type of ['merchant','blackmarket'])for(const complete of [false,true]){
 const valid=shop(type),bad=structuredClone(valid),stock=bad.shop[0].item;bad.shop.find(offer=>offer.id==='heal').item=complete?structuredClone(stock):{id:stock.id};
 const raw=envelope(bad),caseName=`${type}-${complete?'complete':'partial'}-heal-item`;
 const row={case:caseName,rawCharacters:raw.length,rawSha256:sha(raw),versions:{}};
 writeFileSync(resolve(folder,caseName+'.json'),raw+'\n');
 for(const [version,S,V]of [['baseline',B,BV],['current',C,CV]]){
  const storage=memory();storage.setItem(S.SAVE_KEY,prior);storage.setItem(S.BACKUP_KEY,prior);const expected=S.loadSave(storage).state,oldRaw=S.encodeSave(expected);storage.writes.length=0;
  const importError=errorOf(()=>S.saveImportedGame(bad,raw,expected,storage)),active=S.loadSave(storage).state;
  const renderError=errorOf(()=>V.center(active,{view:'game',busy:false}));
  row.versions[version]={acceptedByValidator:S.validateSave(bad),decodeError:errorOf(()=>S.decodeSave(raw)),importError,activeRunPreserved:S.encodeSave(active)===oldRaw,activeRunId:active.runId,writes:[...storage.writes],renderError};
  if(version==='current'){assert(importError);assert.equal(S.validateSave(bad),false);assert.equal(S.encodeSave(active),oldRaw);assert.deepEqual(storage.writes,[]);assert.equal(renderError,null);}
  else{assert.equal(importError,null);assert.equal(S.validateSave(bad),true);if(!complete)assert(renderError);}
 }
 results.cases.push(row);
 if(!complete)writeFileSync(resolve(folder,`${type}-valid.json`),B.encodeSave(valid)+'\n');
}
writeFileSync(resolve(folder,'results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
