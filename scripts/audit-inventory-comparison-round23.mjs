// Source-to-source semantic audit; optional fixed CPU sampling is not browser
// latency. Keep output outside both trees and run timing without other jobs.
// node scripts/audit-inventory-comparison-round23.mjs --baseline-source=/old \
//   --current-source=/new --output=/tmp/fresh-round23-audit [--timing]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg.slice(2),true]:[arg.slice(2,i),arg.slice(i+1)];}));
assert(args['baseline-source']&&args['current-source']&&args.output,'Provide both source roots and a fresh external output directory');
const output=path.resolve(args.output),hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const variants=[];
for(const label of ['baseline','current']){
 const root=path.resolve(args[label+'-source']);assert(output!==root&&!output.startsWith(root+path.sep));
 const [E,S,V,C,Q,R]=await Promise.all(['engine','storage','views','equipment-content','equipment','release'].map(name=>import(pathToFileURL(path.join(root,'src',name+'.js')))));
 variants.push({label,root,E,S,V,C,Q,R});
}
const [baseline,current]=variants;assert.equal(typeof current.E.compareEquipmentBatch,'function');
await fs.mkdir(output,{recursive:true});await assert.rejects(fs.access(path.join(output,'report.json')),'Use a fresh output directory');
const sourceFiles=['src/engine.js','src/views.js','src/equipment.js','src/equipment-comparison.js','src/inventory-query.js','src/storage.js','src/content.js','src/deep-content.js','src/release.js'];
const identity=async()=>Object.fromEntries(await Promise.all(variants.map(async v=>[v.label,Object.fromEntries(await Promise.all(sourceFiles.map(async file=>{const bytes=await fs.readFile(path.join(v.root,file));return [file,{bytes:bytes.length,sha256:hash(bytes)}];})))])));
const report={status:'RUNNING',startedAt:new Date().toISOString(),scriptSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),sourceBefore:await identity(),semantics:{fixtures:[],comparisons:[],html:[],publicReads:[],numbers:[]},timing:null};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await save();

function fixture(api,{count=70,late=false,large=false,legacy=false}={}){
 const s=api.E.newGame(27017);s.runId=`round23-comparison-${count}-${late}-${large}-${legacy}`;s.floor=200;s.player.level=100;s.player.gold=1_000_000;
 while(s.player.items.length<count)s.player.items.push(api.E.makeItem(s,undefined,s.nextId%8));
 if(count>10){
  for(const slot of ['weapon','armor'])s.player.equipped[slot]=(late?s.player.items.findLast(item=>item.slot===slot):s.player.items.find(item=>item.slot===slot)).id;
  const relics=s.player.items.filter(item=>item.slot==='relic');
  s.player.equipped.relic2=relics.at(late?-2:1).id;s.player.equipped.relic3=relics.at(late?-1:2).id;
 }
 if(large)for(const item of s.player.items){item.level=api.Q.MAX_ITEM_LEVEL-1;item.levelXp=37;item.enhance=20;}
 if(legacy)for(const item of s.player.items.slice(0,7))item.legacy=true;
 s.player.talents.power=3;s.player.talents.critical=2;s.player.talents.resonance=3;s.player.talents.luck=4;s.player.talents.dawnCrit=3;
 s.eventLuck=8;s.nextLuck=15;s.player.hp=api.E.stats(s).maxHp;
 s.futureMetadata={unknown:['雪 😀',null,{keep:17}],preciseLooking:'9007199254740993',nested:{deepVariantRules:{doNotInterpret:true}}};
 assert(api.S.validateSave(s));return s;
}
function traced(input){
 const reads=[],proxies=new WeakMap();
 const wrap=(value,label)=>{
  if(!value||typeof value!=='object')return value;if(proxies.has(value))return proxies.get(value);
  const proxy=new Proxy(value,{
   get(target,key,receiver){reads.push(['get',label,String(key)]);return wrap(Reflect.get(target,key,receiver),label+'.'+String(key));},
   ownKeys(target){reads.push(['keys',label]);return Reflect.ownKeys(target);},
   getOwnPropertyDescriptor(target,key){reads.push(['descriptor',label,String(key)]);return Reflect.getOwnPropertyDescriptor(target,key);},
   has(target,key){reads.push(['has',label,String(key)]);return Reflect.has(target,key);},
  });proxies.set(value,proxy);return proxy;
 };
 return {value:wrap(input,'state'),reads};
}
const frozen=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(frozen);}return value;};
const compactState=(s,E)=>{const ids=new Set(E.equippedIds(s));return {...s,player:{...s.player,items:s.player.items.filter(item=>ids.has(item.id))}};};
const cardItems=(s,api)=>{const equipped=new Set(api.E.equippedIds(s));return s.player.items.toSorted((a,b)=>api.Q.itemValue(b)-api.Q.itemValue(a)).slice(0,60).filter(item=>!equipped.has(item.id));};
const batch=(api,s,items,slot)=>api.label==='current'?api.E.compareEquipmentBatch(s,items,slot):items.map(item=>api.E.compareEquipment(s,item,slot));
const states=[];
try{
 for(const options of [{count:3},{count:70},{count:240,late:true},{count:70,large:true},{count:70,legacy:true}]){
  const state=fixture(baseline,options);assert.deepEqual(fixture(current,options),state);const raw=baseline.S.encodeSave(state);assert.equal(current.S.encodeSave(state),raw);frozen(state);states.push(state);
  report.semantics.fixtures.push({options,sha256:hash(state),encodedSha256:hash(raw),items:state.player.items.length});
  const items=state.player.items.slice(0,70),subset=compactState(state,baseline.E);
  for(const slot of [undefined,'relic','relic2','relic3','unknown-slot'])for(const model of [state,subset]){
   const expected=batch(baseline,model,items,slot),actual=batch(current,model,items,slot);assert.deepEqual(actual,expected);
   report.semantics.comparisons.push({fixture:state.runId,slot:slot??null,model:model===state?'full':'equipped-only',count:items.length,sha256:hash(actual)});
  }
  for(const ui of [{view:'inventory'},{view:'inventory',inventorySort:'rarity'},{view:'inventory',inventorySort:'level',inventoryPage:1},{view:'inventory',inventorySlot:'weapon'},{view:'inventory',inventorySlot:'armor',inventoryDefense:'regen'},{view:'inventory',inventoryRarity:'7',inventoryDefense:'barrier'},{view:'inventory',inventoryQuery:'不存在',inventoryQueryDraft:'未提交 <草稿>'},{view:'inventory',inventoryQuery:'之',inventoryPage:999}]){
   const expected=baseline.V.center(state,ui),actual=current.V.center(state,ui);assert.equal(actual,expected,'The complete center HTML must remain identical');
   // A release-label change is declared and replaced with its exact new text;
   // every other byte of the complete game view remains in the comparison.
   const expectedGame=baseline.V.gameView(state,ui).replace(`VER ${baseline.R.RELEASE_STAMP}　 INFINITE ABYSS`,`VER ${current.R.RELEASE_STAMP}　 INFINITE ABYSS`),actualGame=current.V.gameView(state,ui);
   assert.equal(actualGame,expectedGame,'The complete game view must remain identical except its declared release label');
   report.semantics.html.push({fixture:state.runId,ui,centerBytes:Buffer.byteLength(actual),centerSha256:hash(actual),gameBytes:Buffer.byteLength(actualGame),gameSha256:hash(actualGame),exactCenter:true,exactGame:true});
  }
  assert.equal(current.S.encodeSave(state),raw);
 }
 const catalogState=states[1],catalogItems=[...baseline.C.CATALOG_BY_ID.values()].map(entry=>({id:'i99991',catalogId:entry.id,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,level:83,levelXp:31,enhance:4,depth:200}));
 const catalogExpected=batch(baseline,catalogState,catalogItems),catalogActual=batch(current,catalogState,catalogItems);assert.deepEqual(catalogActual,catalogExpected);
 report.semantics.comparisons.push({fixture:'every-authored-catalog-item',count:catalogItems.length,sha256:hash(catalogActual)});
 for(const slot of [undefined,'relic2']){
  const observations=variants.map(api=>{const state=traced(fixture(api)),candidate=state.value.player.items[11];state.reads.length=0;const value=api.E.compareEquipment(state.value,candidate,slot);return {value,reads:state.reads};});
  assert.deepEqual(observations[1],observations[0],'Existing public single comparison preserves complete Proxy visitation and output');
  report.semantics.publicReads.push({slot:slot??null,readCount:observations[0].reads.length,traceSha256:hash(observations[0].reads),outputSha256:hash(observations[0].value),identical:true});
 }
 // A changing getter is deliberately outside the new batch snapshot contract.
 // The original public comparison still repeats all its original reads.
 for(const key of ['level','critical']){
  const observations=variants.map(api=>{const state=fixture(api),target=key==='level'?state.player:state.player.talents;let reads=0;Object.defineProperty(target,key,{get(){return (key==='level'?100:2)+(reads++%2);},configurable:true});const value=api.E.compareEquipment(state,state.player.items[11]);return {value,reads};});
  assert.deepEqual(observations[1],observations[0]);report.semantics.publicReads.push({changingGetter:key,...observations[0],identical:true});
 }
 const mutable=fixture(baseline),candidates=mutable.player.items.slice(9,15);
 for(const change of [()=>{},()=>{mutable.player.equipped.weapon=mutable.player.items.findLast(item=>item.slot==='weapon').id;},()=>{mutable.player.equipped.relic2=null;},()=>{mutable.player.talents.power++;},()=>{mutable.nextLuck=21;},()=>{mutable.player.hp=1;},()=>{candidates[0].level+=3;},()=>{mutable.futureMetadata.unknown[2].keep++;}]){
  change();mutable.player.hp=Math.min(mutable.player.hp,baseline.E.stats(mutable).maxHp);const before=baseline.S.encodeSave(mutable);
  assert.deepEqual(batch(current,mutable,candidates),batch(baseline,mutable,candidates));assert.equal(current.V.center(mutable,{view:'inventory'}),baseline.V.center(mutable,{view:'inventory'}));assert.equal(current.S.encodeSave(mutable),before);
 }
 report.semantics.sameObjectSteps=8;
 for(const value of [undefined,null,false,true,'',0,-0,NaN,Infinity,-Infinity,1,-1,.00001,999_999_999,999_999_999.999,1e9,1e9+1,1_234_567_891,9_999_999_999,1e10,1e13,1e15,Number.MAX_SAFE_INTEGER,Number.MAX_VALUE,'1000000000','-1234567891','not-a-number',1_000_000_000n]){
  const expected=baseline.V.num(value),actual=current.V.num(value);assert.equal(actual,expected);report.semantics.numbers.push({input:String(value),kind:typeof value,output:actual});
  if(typeof value==='number')assert.equal(current.V.num(-value),baseline.V.num(-value));
 }
 await fs.writeFile(path.join(output,'semantic-fixtures.json.gz'),gzipSync(JSON.stringify(states)));await save();
 if(args.timing){
  const configs=[{count:70},{count:10000},{count:10000,large:true}],fixtures=configs.map(options=>fixture(baseline,options));
  for(let i=0;i<fixtures.length;i++)assert.deepEqual(fixtures[i],fixture(current,configs[i]));
  await fs.writeFile(path.join(output,'timing-fixtures.json.gz'),gzipSync(JSON.stringify(fixtures)));
  const schedule=[...Array.from({length:4},(_,pair)=>['baseline','current'].map(label=>({phase:'warmup',pair:pair+1,label}))),...Array.from({length:24},(_,pair)=>(pair%2?['current','baseline']:['baseline','current']).map(label=>({phase:'measured',pair:pair+1,label})))].flat();
  const cells=fixtures.flatMap((state,i)=>[
   {name:`comparisons-${configs[i].count}-${configs[i].large?'large-values':'ordinary'}`,state,run:api=>batch(api,compactState(state,api.E),cardItems(state,api))},
   {name:`complete-center-${configs[i].count}-${configs[i].large?'large-values':'ordinary'}`,state,run:api=>api.V.center(state,{view:'inventory',inventorySort:'power'})},
  ]);
  report.timing={protocol:{warmupPairs:4,measuredPairs:24,schedule,clock:'Node performance.now around only the named synchronous function; fixture generation, hashing and equality checks excluded',limits:'CPU components only, not DOM/layout/paint/native input/storage latency or GPU FPS. All fixed samples retained; no tail exclusion or adaptive reruns.'},runs:[],aggregate:{}};await save();
  const distribution=values=>{const sorted=values.toSorted((a,b)=>a-b),q=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];return {n:sorted.length,p50:q(.5),p95:q(.95),max:sorted.at(-1),min:sorted[0]};};
  for(const cell of cells){
   const expected=cell.run(baseline),expectedHash=hash(expected),stateHash=hash(cell.state);
   for(const entry of schedule){const api=variants.find(v=>v.label===entry.label),start=performance.now(),actual=cell.run(api),elapsedMs=performance.now()-start;assert.equal(hash(actual),expectedHash);assert.equal(hash(cell.state),stateHash);report.timing.runs.push({cell:cell.name,...entry,elapsedMs,outputSha256:expectedHash,stateSha256:stateHash});}
   const rows=report.timing.runs.filter(r=>r.cell===cell.name&&r.phase==='measured'),aggregate={};
   for(const label of ['baseline','current'])aggregate[label]=distribution(rows.filter(r=>r.label===label).map(r=>r.elapsedMs));
   const differences=Array.from({length:24},(_,pair)=>rows.find(r=>r.pair===pair+1&&r.label==='current').elapsedMs-rows.find(r=>r.pair===pair+1&&r.label==='baseline').elapsedMs);
   aggregate.pairedCurrentMinusBaseline={values:differences,distribution:distribution(differences)};report.timing.aggregate[cell.name]=aggregate;await save();
  }
 }
 report.sourceAfter=await identity();assert.deepEqual(report.sourceAfter,report.sourceBefore,'Runtime source must stay stable throughout this audit');report.status='PASS';
}catch(error){report.status='FAIL';report.failure={message:String(error),stack:error.stack};process.exitCode=1;}
report.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({status:report.status,comparisonBatches:report.semantics.comparisons.length,fullHtmlPairs:report.semantics.html.length*2,publicReadCases:report.semantics.publicReads.length,numberCases:report.semantics.numbers.length,timingCells:Object.keys(report.timing?.aggregate||{}).length,output}));
