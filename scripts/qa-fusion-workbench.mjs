// Independent baseline/current differential audit of the existing fusion rules.
// This does not test rendered scrolling, dragging, animation or real user saves.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const baseline=arg('--baseline',null),source=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),output=arg('--output',null);
if(!baseline)throw Error('Use --baseline /absolute/path/to/unchanged/input [--source /path/to/current] [--output /path/to/report.json].');
const original=resolve(baseline),load=async root=>({
 E:await import(pathToFileURL(resolve(root,'src/engine.js'))),
 Q:await import(pathToFileURL(resolve(root,'src/equipment.js'))),
 S:await import(pathToFileURL(resolve(root,'src/storage.js'))),
});
const A=await load(original),B=await load(source),W=await import(pathToFileURL(resolve(source,'src/fusion-workbench.js')));
let originalWorkbench;try{originalWorkbench=await import(pathToFileURL(resolve(original,'src/fusion-workbench.js')));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const start=performance.now(),report={method:'Construct valid fusion-room fixtures with the unmodified input generator, then compare full preview objects, canAct decisions, transaction states and save round-trips against current code. When the input has a workbench planner, compare its complete outputs across budget and protection options too. Both sides receive identical input snapshots and dice RNG. No altered adventure policy or natural-balance claims.',environment:{node:process.version,platform:process.platform,arch:process.arch},fixtureStates:0,previewCases:0,transactionCases:0,planTransactions:0,planComparisons:0,placementComparisons:0,rejectionCases:0,committedFaces:[],allPassed:false};
const faces=new Set();
function add(s,slot,rarity,level){const item=A.E.makeItem(s,slot,rarity);item.level=level;item.levelXp=0;s.player.items.push(item);return item;}
function checkPreview(s,targets,materials,allowProtected){
 const before=JSON.stringify(s),a=A.Q.fusionPreview(s,targets,materials,allowProtected),b=B.Q.fusionPreview(s,targets,materials,allowProtected);
 assert.deepEqual(b,a,'preview changed');assert.equal(JSON.stringify(s),before,'preview mutated state');report.previewCases++;return a;
}
function checkAction(s,action){
 const before=JSON.stringify(s);assert.deepEqual(B.E.canAct(s,action),A.E.canAct(s,action));
 const a=A.E.transition(s,action),b=B.E.transition(s,action);assert.deepEqual(b,a,'transaction changed');assert.equal(JSON.stringify(s),before,'transaction mutated input');
 assert(A.S.validateSave(a));assert(B.S.validateSave(b));assert.deepEqual(B.S.decodeSave(B.S.encodeSave(b)),a);report.transactionCases++;
 if(a===s){assert.strictEqual(b,s);report.rejectionCases++;}else faces.add(a.lastForge.value);
}
function checkPlan(s,targets,options={}){
 const before=JSON.stringify(s),current=W.planFusionMaterials(s,targets,undefined,options);
 if(originalWorkbench){assert.deepEqual(current,originalWorkbench.planFusionMaterials(s,targets,undefined,options),'planner changed selection, safety or quote');report.planComparisons++;}
 const placement=W.planFusionMaterials(s,targets,undefined,{...options,includePreview:false});
 assert.deepEqual(placement,{...current,preview:null},'omitting an unused preview changed batch placement');report.placementComparisons++;
 assert.equal(JSON.stringify(s),before,'bulk plan mutated state');return current;
}
for(const slot of ['weapon','armor','relic'])for(const targetCount of slot==='relic'?[1,3]:[1])for(let rarity=0;rarity<8;rarity++)for(const level of [1,12,100,10001,A.Q.MAX_ITEM_LEVEL-5]){
 let s=A.E.newGame((report.fixtureStates+1)*7919);s.floor=200;s.player.level=Math.min(1000000,level);s.player.gold=1e10;s.player.hp=A.E.stats(s).maxHp;
 s=A.E.transition(s,{type:'fate'});s.route[0].type='fusion';s=A.E.transition(s,{type:'enter'});
 const targets=Array.from({length:targetCount},(_,i)=>{const item=add(s,slot,(rarity+i)%8,level);item.enhance=(rarity+i*7)%21;return item.id;});
 const materials=Array.from({length:9},(_,i)=>{const item=add(s,slot,i%8,[1,12,99,10000][i%4]);item.enhance=i*2;return item.id;});
 assert(A.S.validateSave(s));assert(B.S.validateSave(s));report.fixtureStates++;
 for(const count of [1,3,9])for(const permission of [false,true,'yes'])checkPreview(s,targets,materials.slice(0,count),permission);
 for(const permission of [false,true])checkAction(s,{type:'fuse',targets,materials,allowProtected:permission});
 const plan=checkPlan(s,targets);
 checkPlan(s,targets,{budget:false});checkPlan(s,targets,{includeLocked:true});
 const one=A.Q.fusionCostSummary(s,targets.map(id=>s.player.items.find(item=>item.id===id)),1).cost;
 for(const gold of new Set([0,Math.max(0,one-1),Math.min(1e10,one),Math.min(1e10,one+1)])){
  const budgetState=structuredClone(s);budgetState.player.gold=gold;checkPlan(budgetState,targets);
 }
 if(plan.ids.length){assert(plan.preview.cost<=s.player.gold);checkAction(s,{type:'fuse',targets,materials:plan.ids,allowProtected:plan.preview.protectedItems.length>0});report.planTransactions++;}
 for(const kind of ['locked','equipped','loot','duplicate','overlap','missing','wrong-slot']){
  const state=structuredClone(s),ids=[materials[0]],item=state.player.items.find(i=>i.id===materials[0]);
  if(kind==='locked')item.locked=true;
  if(kind==='equipped'){state.player.equipped[slot]=item.id;state.player.hp=Math.min(state.player.hp,A.E.stats(state).maxHp);}
  if(kind==='loot')state.loot={item,gold:0,type:'combat',source:'Differential current reward fixture'};
  if(kind==='duplicate')ids.push(ids[0]);
  if(kind==='overlap')ids[0]=targets[0];
  if(kind==='missing')ids[0]='i99999999';
  if(kind==='wrong-slot')ids[0]=state.player.items.find(i=>i.slot!==slot).id;
  for(const permission of [false,true]){checkPreview(state,targets,ids,permission);checkAction(state,{type:'fuse',targets,materials:ids,allowProtected:permission});}
 }
}
report.committedFaces=[...faces].sort();report.durationSeconds=+((performance.now()-start)/1000).toFixed(3);
const hashes=async root=>Object.fromEntries((await Promise.all(['src/engine.js','src/equipment.js','src/storage.js','src/fusion-workbench.js'].map(async path=>{
 try{return [path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')];}catch(error){if(path==='src/fusion-workbench.js'&&error.code==='ENOENT')return null;throw error;}
}))).filter(Boolean));
report.sourceHashes={baseline:await hashes(original),current:await hashes(source)};report.allPassed=true;
if(output){await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
