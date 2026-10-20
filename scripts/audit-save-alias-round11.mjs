import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute,dirname} from 'node:path';

// Read-only source audit. Writes only the explicitly named external report.
// Round12 keeps all four original cases and adds explicit open/closed gates.
// The default observes either result; use --expect open against the old ZIP and
// --expect closed against a version that claims to fix the ownership boundary.
const argv=process.argv.slice(2),options={};
const usage='Usage: node scripts/audit-save-alias-round11.mjs --source PROJECT_ROOT --output EXTERNAL_JSON [--expect open|closed|observe]';
for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!['--source','--output','--expect'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(options,key))throw Error(usage);options[key]=value;}
if(!options['--source']||!options['--output'])throw Error(usage);
const expectation=options['--expect']||'observe';if(!['open','closed','observe'].includes(expectation))throw Error(usage);
const source=resolve(options['--source']),output=resolve(options['--output']);
const inside=folder=>{const name=relative(folder,output);return !name||(!isAbsolute(name)&&name!=='..'&&!name.startsWith('..'+(process.platform==='win32'?'\\':'/')));};
if(inside(source)||inside(fileURLToPath(new URL('../',import.meta.url))))throw Error('Audit output must be outside the source and script projects.');
const E=await import(pathToFileURL(resolve(source,'src/engine.js')));
const S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const diff=(a,b,path='$',rows=[])=>{
  if(Object.is(a,b))return rows;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],path+'.'+key,rows);
  }else rows.push({path,uninterrupted:a,reloaded:b});
  return rows;
};
function room(type){
  const state=E.newGame(513741);state.runId='alias-reproduction-513741';state.player.gold=100000;
  state.fate=[3,4];state.phase='route';
  state.route=[type,'forge','combat','combat','gold','boss'].map((type,i)=>({id:`f1r${i}`,type,quality:0,done:false}));
  return E.transition(state,{type:'enter'});
}
const report={scope:'The four original Round11 cases: three constructed legal room routes at floor 1 and one naturally generated seed-2 route; all actions use runtime transitions. Exact saved state comparison; does not claim economic asset loss or incidence.',expectation,source,sourceHashes:Object.fromEntries(['src/engine.js','src/storage.js'].map(file=>[file,createHash('sha256').update(readFileSync(resolve(source,file))).digest('hex')])),cases:[]};
function branch(name,initial,action){
  assert(S.validateSave(initial));
  const beforeRaw=S.encodeSave(initial),reloaded=S.decodeSave(beforeRaw);
  assert.equal(S.encodeSave(reloaded),beforeRaw);
  const uninterrupted=E.transition(initial,action),afterReload=E.transition(reloaded,action);
  assert.notStrictEqual(uninterrupted,initial);assert(S.validateSave(uninterrupted));assert(S.validateSave(afterReload));
  assert.deepEqual(uninterrupted.player,afterReload.player);assert.equal(uninterrupted.rng,afterReload.rng);assert.equal(uninterrupted.revision,afterReload.revision);
  const owned=initial.player.items.find(item=>item.id===action.id),historical=[...initial.shop.filter(offer=>offer.item?.id===action.id).map(offer=>offer.item),...(initial.loot?.item?.id===action.id?[initial.loot.item]:[])];
  report.cases.push({name,action,beforeRawSha256:createHash('sha256').update(beforeRaw).digest('hex'),uninterruptedStateSha256:sha(uninterrupted),reloadedStateSha256:sha(afterReload),playerAssetsIdentical:true,rngIdentical:true,revisionIdentical:true,sharedInventoryReference:historical.some(item=>item===owned),differences:diff(uninterrupted,afterReload)});
}
const shop=room('merchant'),bought=E.transition(shop,{type:'buy',id:shop.shop[0].id});
assert.deepEqual(bought.shop[0].item,bought.player.items.at(-1));
branch('Lock purchased weapon',bought,{type:'lock',id:shop.shop[0].id});
const equipped=E.transition(bought,{type:'equip',id:shop.shop[0].id});
const atForge=E.transition(equipped,{type:'next'});assert.equal(atForge.phase,'forge');
branch('Forge purchased weapon after leaving shop',atForge,{type:'forge',id:shop.shop[0].id});
const loot=E.transition(room('chest'),{type:'open'});assert.equal(loot.phase,'loot');
assert.deepEqual(loot.loot.item,loot.player.items.at(-1));
branch('Lock newly claimed loot',loot,{type:'lock',id:loot.loot.item.id});
let natural=null;
for(let seed=1;seed<=50&&!natural;seed++){
  let state=E.newGame(seed);state.runId=`alias-natural-${seed}`;const actions=[];
  for(let step=0;step<300&&state.phase!=='dead';step++){
    if(['merchant','blackmarket'].includes(state.phase)){
      const offer=state.shop.find(offer=>offer.item?.slot==='weapon'&&E.canAct(state,{type:'buy',id:offer.id}));
      if(offer){
        const buy={type:'buy',id:offer.id};actions.push(buy);state=E.transition(state,buy);
        natural={seed,floor:state.floor,roomIndex:state.roomIndex,actions,price:offer.price,goldAfter:state.player.gold,itemId:offer.item.id};
        branch('Natural generated route: lock purchased weapon',state,{type:'lock',id:offer.item.id});break;
      }
    }
    const type=state.phase==='fate'?'fate':state.phase==='route'?'enter':state.phase==='combat'?'roll':state.phase==='chest'?'open':state.phase==='gold'?'gold':['cleared','complete'].includes(state.phase)?'descend':['loot','merchant','blackmarket','forge','fusion','altar','rest'].includes(state.phase)?'next':null;
    const action=type?{type}:state.phase==='event'?{type:'event-choice',id:'leave'}:null;
    if(!action||!E.canAct(state,action))break;
    actions.push(action);state=E.transition(state,action);assert(S.validateSave(state));
  }
}
assert(natural,'A normal generated route with affordable purchase should be reachable');
report.naturalReplay={...natural,runIdNormalization:'Only runId is fixed for reproducible transcripts; no gameplay, inventory, route, budget or RNG field is patched.'};
report.confirmed=report.cases.every(row=>row.differences.length>0);
report.closed=report.cases.every(row=>row.differences.length===0&&!row.sharedInventoryReference);
report.status=report.confirmed?'OPEN_P3_REPRODUCED':report.closed?'OWNERSHIP_FIXED':'PARTIAL_OR_UNEXPECTED';
report.expectationMet=expectation==='observe'||(expectation==='open'?report.confirmed:report.closed);
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=report.expectationMet?0:1;
