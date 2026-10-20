import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';

const [baselineRoot,currentRoot,outputPath]=process.argv.slice(2);
if(!baselineRoot||!currentRoot||!outputPath)throw Error('Usage: node benchmark-storage-round04.mjs INPUT_ROOT CURRENT_ROOT OUTPUT_JSON');
const at=(root,file)=>pathToFileURL(resolve(root,file));
const B=await import(at(baselineRoot,'src/storage.js')),C=await import(at(currentRoot,'src/storage.js'));
const E=await import(at(baselineRoot,'src/engine.js'));
const memory=()=>{const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
const percentile=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {n:values.length,min:sorted[0],p50:percentile(sorted,.5),p95:percentile(sorted,.95),max:sorted.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length};};
const results={kind:'paired storage timing and exact-state differential',date:new Date().toISOString(),node:process.version,cpu:cpus()[0].model,baselineRoot:resolve(baselineRoot),currentRoot:resolve(currentRoot),pairsPerCell:20,warmupPairsPerCell:2,clock:'performance.now(), individual synchronous operation only',method:'Alternating B→C / C→B pairs, all measured samples retained. Baseline engine generates the same seeded valid fixture for both versions. Setup and postcondition assertions are excluded from timing. Shared host load remains uncontrolled; these are Node timings, not browser quota or hardware frame-rate measurements.',compatibility:[],cells:[]};
const golden=JSON.parse(readFileSync(at(baselineRoot,'tests/fixtures/v4-baseline.json'),'utf8'));
for(const row of golden.saves)assert.equal(C.encodeSave(C.decodeSave(row.raw)),B.encodeSave(B.decodeSave(row.raw)));
results.compatibility.push({check:'all V4 migration fixtures remain byte-identical',fixtures:golden.saves.length});
for(const key of ['SAVE_KEY','BACKUP_KEY','LEGACY_BACKUP_KEY','V4_BACKUP_KEY','SETTINGS_KEY'])assert.equal(C[key],B[key]);
results.compatibility.push({check:'all five persistent keys unchanged'});
const original=E.newGame(23837),copy=C.migrateSave(original);copy.player.items[0].name='only-the-copy';assert.notEqual(copy.player.items[0].name,original.player.items[0].name);
results.compatibility.push({check:'direct current-version migrateSave still returns a detached graph'});
for(const count of [100,1000,10000]){
 const state=E.newGame(27017);state.floor=200;state.player.level=100;state.player.gold=1000000;state.player.hp=E.stats(state).maxHp;
 while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
 assert(B.validateSave(state));assert(C.validateSave(state));
 const raw=B.encodeSave(state);assert.equal(C.encodeSave(state),raw);
 const next=E.transition(state,{type:'lock',id:state.player.equipped.weapon}),nextRaw=B.encodeSave(next);assert.equal(C.encodeSave(next),nextRaw);
 for(const operation of ['decodeSave','loadSave','saveGame']){
  const values={baseline:[],current:[]},order=[];
  for(let pair=-2;pair<20;pair++){
   const versions=pair%2===0?[['baseline',B],['current',C]]:[['current',C],['baseline',B]];
   if(pair>=0)order.push(versions.map(row=>row[0]).join('→'));
   for(const [label,S]of versions){
    const storage=memory();storage.setItem(S.SAVE_KEY,raw);storage.setItem(S.BACKUP_KEY,raw);
    const before=performance.now();
    const value=operation==='decodeSave'?S.decodeSave(raw):operation==='loadSave'?S.loadSave(storage):S.saveGame(next,state,storage);
    const elapsed=performance.now()-before;
    if(pair>=0)values[label].push(elapsed);
    if(operation==='decodeSave')assert.equal(JSON.stringify(value),JSON.stringify(state));
    else if(operation==='loadSave'){assert.equal(value.recovered,false);assert.equal(value.warning,'');assert.equal(JSON.stringify(value.state),JSON.stringify(state));}
    else{assert.deepEqual(value,{mirrored:true,warning:''});assert.equal(storage.getItem(S.SAVE_KEY),nextRaw);assert.equal(storage.getItem(S.BACKUP_KEY),nextRaw);}
   }
  }
  results.cells.push({items:count,operation,rawCharacters:raw.length,utf8Bytes:Buffer.byteLength(raw),order,samplesMs:values,baselineMs:summary(values.baseline),currentMs:summary(values.current)});
 }
}
writeFileSync(resolve(outputPath),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({output:resolve(outputPath),compatibility:results.compatibility,cells:results.cells.map(({items,operation,rawCharacters,utf8Bytes,baselineMs,currentMs})=>({items,operation,rawCharacters,utf8Bytes,baselineMs,currentMs}))},null,2));
