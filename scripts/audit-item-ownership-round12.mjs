import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

// Read-only current-source ownership gate. An optional old ZIP root also proves
// that full gameplay state differs only at the documented historical records.
const usage='Usage: node scripts/audit-item-ownership-round12.mjs --source PROJECT_ROOT --output EXTERNAL_JSON [--baseline OLD_PROJECT_ROOT]';
const options={},args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--source','--output','--baseline'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(options,key))throw Error(usage);options[key]=value;}
if(!options['--source']||!options['--output'])throw Error(usage);
const source=resolve(options['--source']),baseline=resolve(options['--baseline']||source),output=resolve(options['--output']),scriptRoot=fileURLToPath(new URL('../',import.meta.url));
const inside=folder=>{const name=relative(folder,output);return !name||(!isAbsolute(name)&&name!=='..'&&!name.startsWith('..'+(process.platform==='win32'?'\\':'/')));};
if([source,baseline,scriptRoot].some(inside))throw Error('Audit output must be outside the source, baseline and script projects.');
const modules=async root=>({E:await import(pathToFileURL(resolve(root,'src/engine.js'))),S:await import(pathToFileURL(resolve(root,'src/storage.js')))});
const A=await modules(baseline),B=await modules(source),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileHashes=root=>Object.fromEntries(['src/engine.js','src/storage.js','src/equipment.js','src/encounters.js'].map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
const diff=(a,b,path='$',rows=[])=>{if(Object.is(a,b))return rows;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],path+'.'+key,rows);}else rows.push({path,baseline:a,current:b});return rows;};
const allowedHistory=/^\$\.(?:shop\.[0-2]\.item|loot\.item)\.(?:locked|enhance)$/;
const report={source,baseline,baselineComparison:baseline!==source,sourceHashes:fileHashes(source),baselineHashes:fileHashes(baseline),scope:'Synthetic legal merchant, blackmarket, chest, vault and gambit routes plus the original naturally generated seed-2 route. Every committed action compares complete current state with a JSON-reloaded continuation. Optional cross-version comparison retains all differing leaves and permits only historical item locked/enhance leaves. No natural-player incidence or physical storage claim.',scenarios:[],snapshots:[],failures:[]};

function pair(label,build){
 const a=build(A.E),b=build(B.E);assert.deepEqual(a,b,label+' starts from equal complete state');
 return {label,a,b,actions:[],commits:0,historyDifferences:0};
}
function room(E,type){
 const s=E.newGame(513741);s.runId=`ownership-audit-${type}`;s.player.gold=100000;s.fate=[3,4];s.phase='route';
 s.route=[type,'forge','fusion','combat','gold','boss'].map((type,i)=>({id:`f1r${i}`,type,done:false,quality:0}));
 const entered=E.transition(s,{type:'enter'});entered.round12Unknown={text:'完整扩展 😀',nested:[{value:23}]};
 const item=entered.chest?.item||entered.shop[0]?.item;
 if(item)item.round12Unknown={text:'装备扩展',nested:[{value:17}],nullable:null};
 if(entered.chest)entered.chest.round12Unknown={source:'待领奖励',nested:[{value:31}]};
 if(entered.shop[0])entered.shop[0].round12Unknown={source:'待购记录',nested:[{value:19}]};
 return entered;
}
function step(trace,action){
 const {a,b}=trace,label=`${trace.label}/${trace.actions.length}/${action.type}`;
 const rawBefore=B.S.encodeSave(b),reloaded=B.S.decodeSave(rawBefore);assert.equal(B.S.encodeSave(reloaded),rawBefore,label+' complete roundtrip');
 const actionAllowed=!!B.E.canAct(b,action);assert.equal(!!A.E.canAct(a,action),actionAllowed,label+' action availability');
 const nextA=A.E.transition(a,action),nextB=B.E.transition(b,action),afterReload=B.E.transition(reloaded,action);
 assert.equal(B.S.encodeSave(b),rawBefore,label+' caller unchanged');
 assert(A.S.validateSave(nextA)&&B.S.validateSave(nextB)&&B.S.validateSave(afterReload),label+' valid states');
 assert.deepEqual(nextB,afterReload,label+' complete saved-state continuation');
 assert.equal(B.S.encodeSave(nextB),B.S.encodeSave(afterReload),label+' complete saved envelopes');
 assert.deepEqual(nextA.player,nextB.player,label+' complete player assets');
 for(const key of ['rng','revision','nextId','version'])assert.equal(nextA[key],nextB[key],label+' '+key);
 assert.deepEqual(nextA.log,nextB.log,label+' logs');
 const differences=diff(nextA,nextB);assert(differences.every(row=>allowedHistory.test(row.path)),label+' only expected historical leaves may differ');
 for(const offer of nextB.shop)if(offer.sold&&offer.item){const item=nextB.player.items.find(item=>item.id===offer.item.id);if(item)assert.notStrictEqual(offer.item,item,label+' detached purchase');}
 if(nextB.loot){const item=nextB.player.items.find(item=>item.id===nextB.loot.item.id);if(item)assert.notStrictEqual(nextB.loot.item,item,label+' detached claim');}
 report.snapshots.push({scenario:trace.label,index:trace.actions.length,action,committed:actionAllowed,baselineStateSha256:sha(nextA),currentStateSha256:sha(nextB),reloadedCurrentStateSha256:sha(afterReload),differences});
 trace.actions.push(action);trace.commits+=Number(actionAllowed);trace.historyDifferences+=differences.length;trace.a=nextA;trace.b=nextB;
 return nextB;
}
function finish(trace,extra={}){report.scenarios.push({name:trace.label,actions:trace.actions,commits:trace.commits,historyDifferences:trace.historyDifferences,finalPlayerSha256:sha(trace.b.player),finalRng:trace.b.rng,finalRevision:trace.b.revision,...extra});}
function capture(name,run){try{run();}catch(error){report.failures.push({name,message:error.message,stack:error.stack});}}

for(const type of ['merchant','blackmarket'])capture(type,()=>{
 const trace=pair(type,E=>room(E,type)),id=trace.b.shop[0].id,material=trace.b.player.equipped.weapon;
 const historical=structuredClone(trace.b.shop[0]);historical.sold=true;
 for(const action of [{type:'buy',id},{type:'lock',id},{type:'equip',id},{type:'next'},{type:'forge',id},{type:'next'},{type:'fuse',targets:[id],materials:[material]},{type:'lock',id}]){step(trace,action);assert.deepEqual(trace.b.shop[0],historical);}
 assert.equal(trace.commits,8);assert(!trace.b.player.items.some(item=>item.id===material));finish(trace);
});
for(const type of ['chest','vault'])capture(type,()=>{
 const trace=pair(type,E=>room(E,type)),reward=structuredClone(trace.b.chest),id=reward.item.id;
 for(const action of [{type:'open'},{type:'lock',id},{type:'equip',id},{type:'lock',id}]){step(trace,action);assert.deepEqual(trace.b.loot,reward);}
 const before=trace.b;step(trace,{type:'open'});assert.strictEqual(trace.b,before,'repeat claim rejected');
 step(trace,{type:'next'});assert.equal(trace.b.loot,null);assert.equal(trace.b.chest,null);finish(trace);
});
capture('gambit reward',()=>{
 const trace=pair('gambit reward',E=>room(E,'gambit'));step(trace,{type:'event-choice',id:'safe',confirmed:true});
 assert.equal(trace.b.phase,'chest');const reward=structuredClone(trace.b.chest),id=reward.item.id,event=structuredClone(trace.b.event);
 for(const action of [{type:'open'},{type:'lock',id},{type:'equip',id}]){step(trace,action);assert.deepEqual(trace.b.loot,reward);assert.deepEqual(trace.b.event,event);}
 finish(trace);
});
capture('natural seed 2',()=>{
 const trace=pair('natural seed 2',E=>{const s=E.newGame(2);s.runId='alias-natural-2';return s;});let found=false;
 for(let i=0;i<300&&trace.b.phase!=='dead';i++){
  const s=trace.b;
  if(['merchant','blackmarket'].includes(s.phase)){
   const offer=s.shop.find(offer=>offer.item?.slot==='weapon'&&B.E.canAct(s,{type:'buy',id:offer.id}));
   if(offer){assert.equal(s.floor,3);assert.equal(s.roomIndex,2);assert.equal(offer.id,'i14');assert.equal(offer.price,232);step(trace,{type:'buy',id:offer.id});step(trace,{type:'lock',id:offer.id});finish(trace,{seed:2,floor:s.floor,roomIndex:s.roomIndex,price:offer.price,runIdNormalization:'Only runId is fixed; no route, HP, budget, inventory or RNG fields are patched.'});found=true;break;}
  }
  const type=s.phase==='fate'?'fate':s.phase==='route'?'enter':s.phase==='combat'?'roll':s.phase==='chest'?'open':s.phase==='gold'?'gold':['cleared','complete'].includes(s.phase)?'descend':['loot','merchant','blackmarket','forge','fusion','altar','rest'].includes(s.phase)?'next':null;
  const action=type?{type}:s.phase==='event'?{type:'event-choice',id:'leave'}:null;assert(action&&B.E.canAct(s,action));step(trace,action);
 }
 assert(found,'seed 2 should reach the original natural purchase');
});
report.summary={scenarios:report.scenarios.length,actions:report.snapshots.length,committedActions:report.snapshots.filter(row=>row.committed).length,completeCurrentReloadMatches:report.snapshots.filter(row=>row.currentStateSha256===row.reloadedCurrentStateSha256).length,completeBaselineMatches:report.snapshots.filter(row=>row.baselineStateSha256===row.currentStateSha256).length,historyDifferenceLeaves:report.snapshots.reduce((sum,row)=>sum+row.differences.length,0),failureCount:report.failures.length};
report.status=report.failures.length?'FAIL':'PASS';mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,summary:report.summary,output},null,2));process.exitCode=report.failures.length?1:0;
