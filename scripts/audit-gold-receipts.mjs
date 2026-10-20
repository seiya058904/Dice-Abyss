// Offline Round09 author evidence. Synthetic cap cases and provenance-backed
// natural replays are reported separately; neither establishes cap frequency.
// node scripts/audit-gold-receipts.mjs --baseline /input --output /tmp/gold.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const arg=(key,fallback)=>{const index=process.argv.indexOf(key);return index<0?fallback:process.argv[index+1];};
const ownRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(arg('--source',ownRoot));
assert(process.argv.includes('--baseline')&&process.argv.includes('--output'),'Pass explicit baseline and output paths.');
const baseline=resolve(arg('--baseline','')),output=resolve(arg('--output',''));
for(const root of [source,baseline]){const path=relative(root,output);assert(path==='..'||path.startsWith('..'+sep)||isAbsolute(path),'Write audit output outside both projects.');}
const moduleAt=(root,file)=>import(pathToFileURL(resolve(root,file)));
const [E,B,S,BS,C,BC,G]=await Promise.all([
 moduleAt(source,'src/engine.js'),moduleAt(baseline,'src/engine.js'),moduleAt(source,'src/storage.js'),moduleAt(baseline,'src/storage.js'),
 moduleAt(source,'src/encounters.js'),moduleAt(baseline,'src/encounters.js'),moduleAt(source,'src/gold.js'),
]);
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const files=['src/engine.js','src/gold.js','src/encounters.js','src/deep-rules.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/rarity.js','src/route-weights.js','src/content.js','src/storage.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,digest(await readFile(resolve(source,file)))])));
const sourceHashes=await hashes(),cap=B.GOLD_CAP,counters={legalActions:0,fullStateComparisons:0,saveRoundTrips:0,readOnlyChoices:0,receipts:0,overflowReceipts:0};
const sourceCounts={},examples=[],trace=createHash('sha256');
const settledText=r=>`金币实收 ${r.credited}${r.overflow?`（原额 ${r.rawGold}，上限截去 ${r.overflow}）`:''}`;
function context(initial,origin){return {current:structuredClone(initial),prior:structuredClone(initial),origin,receipts:new Map(),textPairs:new Set(),goldMax:initial.player.gold,capObserved:initial.player.gold===cap,actions:0};}
function textPair(ctx,oldText,newText){ctx.textPairs.add(JSON.stringify([oldText,newText]));}
function fullCompare(ctx){
 const current=structuredClone(ctx.current),prior=ctx.prior;
 if(Object.hasOwn(current,'lootCreditedGold')&&!Object.hasOwn(prior,'lootCreditedGold')){
  assert(current.loot,'a receipt may only survive with its original loot');
  const known=ctx.receipts.get(current.loot.item.id);assert(known,'every extra historical receipt must come from a previously observed open action');
  assert.equal(current.lootCreditedGold,known.credited);assert.equal(current.loot.gold,known.rawGold);delete current.lootCreditedGold;
 }
 assert.equal(current.log.length,prior.log.length,'no new log slots may displace unrelated history');
 for(let i=0;i<current.log.length;i++)if(current.log[i].text!==prior.log[i].text){
  assert(ctx.textPairs.has(JSON.stringify([prior.log[i].text,current.log[i].text])),`unexpected log difference: ${current.log[i].text}`);current.log[i].text=prior.log[i].text;
 }
 if(current.event?.outcome!==prior.event?.outcome){assert(ctx.textPairs.has(JSON.stringify([prior.event?.outcome,current.event?.outcome])),'unexpected event history difference');current.event.outcome=prior.event.outcome;}
 assert.deepEqual(current,prior,'all other complete state fields, including unknown metadata, must remain equal');counters.fullStateComparisons++;
 assert(S.validateSave(ctx.current));assert(BS.validateSave(prior));assert.deepEqual(S.decodeSave(S.encodeSave(ctx.current)),ctx.current);assert.deepEqual(BS.decodeSave(BS.encodeSave(prior)),prior);counters.saveRoundTrips+=2;
 trace.update(JSON.stringify(current)+'\n');
}
function receiptFor(before,after,action){
 let kind=null,rawGold=0,paid=0;
 if(action.type==='gold'){kind='gold-room';rawGold=Math.round(65+B.depthPower(before.floor)*22)+(before.fate[0]+before.fate[1])*3;}
 if(action.type==='open'){kind='chest';rawGold=before.chest.gold;}
 if(action.type==='fate'&&after.fate[0]===after.fate[1]){kind='fate-doubles';rawGold=Math.round(20+B.depthPower(before.floor)*5);}
 if(action.type==='salvage'){kind='inventory-salvage';rawGold=B.salvagePreview(before,action.ids,action.allowProtected,action.allowOverflow).rawGold;}
 if(action.type==='event-choice'&&action.id==='salvage'&&before.event.key==='exchange'){kind='exchange';rawGold=before.event.costGold;}
 if(action.type==='event-choice'&&action.id==='roll'){
  const key=before.event.key,refund=key==='gambit'?after.event.roll<=2:key==='wishingvault'?after.event.rolls.reduce((a,b)=>a+b,0)<=5:false;
  if(refund){kind=key+'-refund';paid=before.event.costGold;rawGold=Math.floor(paid/2);}
 }
 if(!kind)return null;
 const credited=Math.min(rawGold,cap-(before.player.gold-paid));return {kind,rawGold,credited,overflow:rawGold-credited,paid,before:before.player.gold,after:before.player.gold-paid+credited};
}
function step(ctx,action){
 const before=ctx.current,prior=ctx.prior,snapshot=structuredClone(before),oldSnapshot=structuredClone(prior);
 assert(E.canAct(before,action));assert(B.canAct(prior,action));
 const expected=B.transition(prior,action),current=E.transition(before,action),receipt=receiptFor(prior,expected,action);
 assert.deepEqual(before,snapshot);assert.deepEqual(prior,oldSnapshot);
 if(receipt){
  assert.equal(current.player.gold,receipt.after);assert.equal(current.player.gold-before.player.gold+receipt.paid,receipt.credited);assert.equal(receipt.credited+receipt.overflow,receipt.rawGold);
  counters.receipts++;sourceCounts[receipt.kind]=(sourceCounts[receipt.kind]||0)+1;
  if(action.type==='open'){assert.deepEqual(current.loot,before.chest,'claim must preserve the original pending reward object');assert.deepEqual(G.goldReceipt(current.loot,current.lootCreditedGold),{rawGold:receipt.rawGold,credited:receipt.credited,overflow:receipt.overflow});ctx.receipts.set(before.chest.item.id,receipt);}
  if(receipt.overflow){
   counters.overflowReceipts++;const summary=settledText(receipt);
   if(receipt.kind==='gold-room')textPair(ctx,`黄金房 · 获得 ${receipt.rawGold} 金币。`,`黄金房 · ${summary}。`);
   if(receipt.kind==='fate-doubles')textPair(ctx,`命运双同 · 额外获得 ${receipt.rawGold} 金币。`,`命运双同 · ${summary}。`);
   if(receipt.kind==='chest'){const old=expected.log.find(entry=>entry.text.startsWith('获得'+before.chest.item.name+' · '));assert(old);textPair(ctx,old.text,`${old.text} · ${summary}`);}
   if(receipt.kind==='inventory-salvage'){const count=B.salvagePreview(prior,action.ids,action.allowProtected,action.allowOverflow).items.length;textPair(ctx,`回收 ${count} 件装备 · 获得 ${receipt.credited} 金币`,`回收 ${count} 件装备 · ${summary}`);}
   assert(!receipt.kind.endsWith('-refund'),'a legitimate refund may not overflow the capacity created by payment');
  }
  if(receipt.kind==='exchange'){
   const rawXp=Math.min(1e6,40+before.player.level*5),creditedXp=Math.min(rawXp,1e8-before.player.xp),overflowXp=rawXp-creditedXp;
   if(receipt.overflow||overflowXp){
    const xpText=overflowXp?`经验计入 ${creditedXp}（原额 ${rawXp}，上限未计入 ${overflowXp}）`:`获得 ${rawXp} 经验`;
    textPair(ctx,'旧装已置换为金币与经验。',`旧装已置换 · ${settledText(receipt)}；${xpText}。${receipt.credited===0&&creditedXp===0?'两项入账均为 0，旧装已永久消耗。':''}`);
   }
  }
  if(examples.length<60&&(!examples.some(row=>row.kind===receipt.kind&&row.credited===receipt.credited&&row.overflow===receipt.overflow)||receipt.overflow))examples.push({origin:ctx.origin,floor:before.floor,roomIndex:before.roomIndex,action,...receipt,rngBefore:before.rng,rngAfter:current.rng});
 }
 ctx.current=current;ctx.prior=expected;ctx.goldMax=Math.max(ctx.goldMax,current.player.gold);ctx.capObserved||=current.player.gold===cap;ctx.actions++;counters.legalActions++;fullCompare(ctx);return current;
}
function room(type,held,seed=7919,floor=140){
 let s=B.newGame(seed);s.runId=`gold-audit-${type}-${floor}-${seed}`;s.floor=floor;s.player.level=100;s.player.gold=held;s.player.hp=B.stats(s).maxHp;s.fate=[3,4];
 s.auditGoldBoundary={retained:['unknown field',17]};s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));s.phase='route';
 if(type==='exchange')s.player.items.push(B.makeItem(s,'relic',1));
 s=B.transition(s,{type:'enter'});assert(BS.validateSave(s));return s;
}
const syntheticStart=counters.legalActions;
for(const floor of [1,29,30,50,80,140,200,400])for(const held of [0,cap-10,cap])for(const type of ['gold','chest','vault','exchange']){
 const initial=room(type,held,7919,floor),ctx=context(initial,'synthetic validated cap boundary');fullCompare(ctx);
 if(type==='exchange'){
  const snapshot=structuredClone(ctx.current),options=C.eventChoices(ctx.current),old=BC.eventChoices(ctx.prior);counters.readOnlyChoices++;
  assert.deepEqual(ctx.current,snapshot);assert.equal(options.length,old.length);
  for(let i=0;i<options.length;i++)for(const key of ['id','disabled','cost','reason','destructive'])assert.deepEqual(options[i][key],old[i][key]);
  step(ctx,{type:'event-choice',id:'salvage',confirmed:true});
 }else step(ctx,{type:type==='gold'?'gold':'open'});
}
for(const held of [0,cap-10,cap]){
 let fate;
 for(let seed=1;seed<=80;seed++){const state=B.newGame(seed);state.runId=`fate-cap-${seed}`;state.player.gold=held;const after=B.transition(state,{type:'fate'});if(after.fate[0]===after.fate[1]){fate=state;break;}}
 assert(fate);step(context(fate,'synthetic gold edit before otherwise natural first fate'),{type:'fate'});
 const state=room('rest',held),item=B.makeItem(state,'weapon',1);state.player.items.push(item);step(context(state,'synthetic validated inventory boundary'),{type:'salvage',ids:[item.id],allowOverflow:true});
}
// XP admission is checked before the existing level-conversion loop. These
// accepted import boundaries deliberately include stored XP above one level.
for(const [level,xp]of [[1e6,1e8],[1e6,1e8-10],[100,B.xpNeeded(100)-1],[100,1e8-10]])for(const held of [0,cap-10,cap]){
 const state=room('exchange',held);state.player.level=level;state.player.xp=xp;state.player.hp=B.stats(state).maxHp;assert(BS.validateSave(state));
 step(context(state,'synthetic XP admission boundary before level conversion'),{type:'event-choice',id:'salvage',confirmed:true});
}
for(const type of ['gambit','wishingvault'])for(const held of [100000,cap-10,cap]){
 let found;
 for(let seed=1;seed<=80;seed++){const state=room(type,held,seed),after=B.transition(state,{type:'event-choice',id:'roll',confirmed:true});if(after.phase==='event'){found=state;break;}}
 assert(found);step(context(found,'synthetic refund boundary; actual unforced low roll'),{type:'event-choice',id:'roll',confirmed:true});
}
// Real combat reward generation still uses the original encounter and RNG.
// HP/shield are explicitly edited here to focus the synthetic case on payout.
for(const type of [...BC.COMBAT_ROOMS]){
 const state=room(type,cap-10);state.enemy.hp=1;state.enemy.shield=0;
 const ctx=context(state,'synthetic combat with one HP and zero shield');step(ctx,{type:'roll'});assert.equal(ctx.current.phase,'chest');step(ctx,{type:'open'});
}
const syntheticActions=counters.legalActions-syntheticStart;

const fixture=JSON.parse(await readFile(resolve(baseline,'tests/fixtures/round08-history-actions.json'),'utf8'));
const naturalInitial=B.newGame(fixture.seed);naturalInitial.runId=`natural-gold-${fixture.seed}`;
const natural=context(naturalInitial,'replay of shipped floor-one natural action path');fullCompare(natural);
for(const action of fixture.actions)step(natural,action);
assert.equal(natural.current.floor,3);assert.equal(natural.capObserved,false);

const snapshotPath='docs/iteration/evidence/round07/memorywell-natural-7919-f159.save.json',raw=await readFile(resolve(baseline,snapshotPath),'utf8'),initial=BS.decodeSave(raw);
const deep=context(initial,'continuation of shipped naturally reached floor159 snapshot');fullCompare(deep);
while(!(deep.current.phase==='cleared'&&deep.current.floor>=201)&&deep.actions<5000){
 const state=deep.current;let action;
 switch(state.phase){
  case 'combat':action={type:'roll'};break;
  case 'chest':action={type:'open'};break;
  case 'gold':action={type:'gold'};break;
  case 'fate':action={type:'fate'};break;
  case 'route':action={type:'enter'};break;
  case 'cleared':action={type:'descend'};break;
  case 'dead':action={type:'retry'};break;
  case 'event':action=state.event.status==='pending'?{type:'event-choice',id:'leave'}:{type:'next'};break;
  case 'rest':action={type:state.roomUsed?'next':'rest'};break;
  case 'altar':action={type:state.roomUsed?'next':'bless'};break;
  case 'loot':case 'merchant':case 'blackmarket':case 'forge':case 'fusion':action={type:'next'};break;
  default:throw Error('Unexpected phase '+state.phase);
 }
 step(deep,action);
}
assert.equal(deep.current.floor,201);assert.equal(deep.current.phase,'cleared');assert.equal(deep.capObserved,false);
assert.deepEqual(await hashes(),sourceHashes,'Source changed during the audit');
const report={audit:'round09-gold-receipts',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,baselineVersion:JSON.parse(await readFile(resolve(baseline,'package.json'),'utf8')).version,sourceHashes,sourceStable:true,scriptSha256:digest(await readFile(fileURLToPath(import.meta.url))),counters,sourceCounts,synthetic:{actions:syntheticActions,floors:[1,29,30,50,80,140,200,400],balanceContexts:[0,cap-10,cap],allCombatRewardTypes:[...BC.COMBAT_ROOMS],method:'Validator-accepted constructed states. Combat HP is deliberately one and shield zero; floor/level/gold/route edits are synthetic, not natural progression. Refund dice use the unforced seed outcome.'},naturalReplay:{seed:fixture.seed,actions:natural.actions,endFloor:natural.current.floor,goldMax:natural.goldMax,capObserved:natural.capObserved,method:'Re-execution of an existing 65-action naturally generated path; this does not add an independent player sample.'},deepContinuation:{sourceFile:snapshotPath,rawSha256:digest(raw),startFloor:initial.floor,endFloor:deep.current.floor,actions:deep.actions,rolls:deep.current.counters.rolls-initial.counters.rolls,extraDeaths:deep.current.counters.deaths-initial.counters.deaths,goldStart:initial.player.gold,goldEnd:deep.current.player.gold,goldMax:deep.goldMax,capObserved:deep.capObserved,method:'No asset, RNG, equipment or talent edits. Legal roll/open/next, free rest/altar and descend; optional events/services declined. Continues the existing natural snapshot, not a new floor-one sample.'},fullStatePolicy:{optionalPath:'state.lootCreditedGold only, matched against the observed open delta every time it survives; reward objects stay identical',text:'Only exact, independently constructed old/new pairs for capped receipts; log slots, tone and unrelated text remain compared',allOtherFieldsCompared:true,unknownMetadataRetained:true},fullSemanticTraceSha256:trace.digest('hex'),examples,limitations:['No naturally reached gold cap was observed. Synthetic cap actions prove the feedback defect and fix, not its incidence in ordinary play.','The natural path and deep snapshot are replays of prior evidence; they do not count as independent new player journeys.','No balance, probability, price, RNG or gold cap changes are permitted by the full-state comparisons.','Node evidence establishes exact settlement and history consistency; browser rendering, actual accessibility and hardware performance require separate tests.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
await writeFile(output.replace(/\.json$/,'')+'.natural-f201.save.json',S.encodeSave(deep.current));
console.log(JSON.stringify({output,counters,sourceCounts,syntheticActions,naturalReplay:report.naturalReplay,deepContinuation:report.deepContinuation,sourceStable:true},null,2));
