// Offline natural-state audit. Every gameplay change uses the real engine.
// No browser storage, generated saves, enemy edits, network, or source writes.
// node scripts/audit-natural-multiseed-round13.mjs --source . --output /tmp/natural-round13.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const source=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..')));
assert(process.argv.includes('--output'),'Pass an explicit report path outside the project.');
const output=resolve(arg('--output','')),rel=relative(source,output);
assert(rel.startsWith('..'+sep)||isAbsolute(rel),'The report must be outside the runtime project.');
const seeds=arg('--seeds','7919,15838,23757,31676').split(',').map(Number);
assert(seeds.length&&new Set(seeds).size===seeds.length&&seeds.every(n=>Number.isSafeInteger(n)&&n>0&&n<=0xffffffff));
const checkpoints=[200,400],minCaptureFloor=140,windowBattles=12,maxCapturesPerStratum=3;
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const fingerprint=s=>hash({...s,runId:'date-normalized'});
const E=await import(pathToFileURL(resolve(source,'src/engine.js')));
const S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const C=await import(pathToFileURL(resolve(source,'src/content.js')));
const R=await import(pathToFileURL(resolve(source,'src/rarity.js')));
const D=await import(pathToFileURL(resolve(source,'src/equipment-comparison.js')));
const {loadCompactSimulator}=await import(pathToFileURL(resolve(source,'scripts/qa-combat-adventure.mjs')));
const simulator=await loadCompactSimulator(source,{verifyComparisons:256});
const coreFiles=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/route-weights.js','src/content.js','src/storage.js','src/equipment-comparison.js','scripts/simulate.mjs','scripts/qa-combat-adventure.mjs'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(coreFiles.map(async file=>[file,hash(await readFile(resolve(source,file)))])));
const beforeHashes=await sourceHashes(),started=performance.now();
let fullRoundTrips=0,branchTransactions=0,allocationActions=0,allocationPoints=0,comparisonReads=0,routeChecks=0,chestGateChecks=0,rollChecks=0;
const committed=createHash('sha256');
function checked(s){assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);fullRoundTrips++;}
function act(s,action){assert(E.canAct(s,action),`${s.floor}/${s.phase}: ${JSON.stringify(action)}`);const next=E.transition(s,action);assert.notStrictEqual(next,s);branchTransactions++;committed.update(fingerprint(next));return next;}
function power(s,branch=false){
 const count=Math.min(s.player.talentPoints,C.TALENTS.power.cap-E.talent(s,'power'));
 if(count<=0)return s;
 const next=branch?act(s,{type:'talent',id:'power',count}):E.transition(s,{type:'talent',id:'power',count});
 assert.notStrictEqual(next,s);assert.equal(next.rng,s.rng);assert.equal(next.player.hp,s.player.hp);
 assert.equal(next.player.talentPoints,s.player.talentPoints-count);assert.equal(next.player.talents.power,s.player.talents.power+count);
 if(!branch){allocationActions++;allocationPoints+=count;}
 return next;
}
const rollSummary=r=>Object.fromEntries(['values','best','critical','follow','main','extra','echoDamage','total','absorbed','hpDamage','retaliation','killed','phaseChanged','wardGain','dodged'].map(key=>[key,r[key]]));
function continueWindow(input){
 let s=input,fight=null,steps=0,rolls=0,damageTaken=0,minimumHp=s.player.hp,retaliatingRolls=0;
 const fights=[];
 while(fights.length<windowBattles&&s.phase!=='dead'&&steps++<6000){
  s=power(s,true);
  switch(s.phase){
   case 'combat':
    fight??={floor:s.floor,room:s.route[s.roomIndex].type,startTurns:s.enemy.turns,openingRng:s.rng,enemySha256:hash(s.enemy),openingHp:s.player.hp,turns:0,damageTaken:0};
    s=act(s,{type:'roll'});rolls++;damageTaken+=s.lastRoll.retaliation;retaliatingRolls+=Number(s.lastRoll.retaliation>0);fight.turns++;fight.damageTaken+=s.lastRoll.retaliation;fight.firstRoll??=rollSummary(s.lastRoll);
    if(s.phase!=='combat'){fights.push({...fight,phase:s.phase,endingHp:s.player.hp,endingRng:s.rng});fight=null;}
    break;
   case 'chest':s=act(s,{type:'open'});break;
   case 'loot':case 'merchant':case 'blackmarket':case 'forge':case 'fusion':case 'altar':s=act(s,{type:'next'});break;
   case 'rest':if(E.canAct(s,{type:'rest'}))s=act(s,{type:'rest'});s=act(s,{type:'next'});break;
   case 'event':s=s.event.status==='resolved'?act(s,{type:'next'}):act(s,{type:'event-choice',id:'leave'});break;
   case 'gold':s=act(s,{type:'gold'});break;
   case 'cleared':s=act(s,{type:'descend'});break;
   case 'fate':s=act(s,{type:'fate'});break;
   case 'route':s=act(s,{type:'enter'});break;
   default:throw Error(`Unexpected ${s.phase}`);
  }
  minimumHp=Math.min(minimumHp,s.player.hp);
 }
 checked(s);assert(s.phase==='dead'||fights.length===windowBattles);
 return {completedBattles:fights.length,survived:s.phase!=='dead',rolls,damageTaken,retaliatingRolls,minimumHp,endingHp:s.player.hp,endingGold:s.player.gold,endingRng:s.rng,finalStateSha256:fingerprint(s),fights};
}
function decision(s){
 checked(s);const openingStateSha256=fingerprint(s),ids=new Set(E.equippedIds(s));
 const view={...s,player:{...s.player,items:s.player.items.filter(i=>ids.has(i.id))}},alternatives=[],unavailableSlots=[];
 for(const slot of ['weapon','armor','relic']){
  const candidates=s.player.items.filter(item=>item.slot===slot&&!ids.has(item.id)).map(item=>({item,score:E.compareEquipment(view,item)})).filter(({score})=>score.delta>=-30&&score.delta<=30).toSorted((a,b)=>b.score.delta-a.score.delta||a.item.id.localeCompare(b.item.id,'en'));
  if(candidates.length)alternatives.push({...candidates[0],candidateCount:candidates.length});else unavailableSlots.push(slot);
 }
 const rows=[{id:'keep-loadout',spent:0,swapHpLoss:0,...continueWindow(structuredClone(s))}];
 for(const {item,score,candidateCount}of alternatives){
  assert.deepEqual(score,E.compareEquipment(s,item));const raw=JSON.stringify(s),detail=D.equipmentComparisonDetails(view,item),hint=D.equipmentComparisonHint(view,item);
  assert.equal(JSON.stringify(s),raw);comparisonReads++;
  const next=act(s,{type:'equip',id:item.id,slot:score.slot});assert.equal(next.rng,s.rng);assert.deepEqual(next.enemy,s.enemy);assert.equal(next.player.gold,s.player.gold);
  rows.push({id:`equip-${score.slot}`,candidateCount,item:Object.fromEntries(['id','catalogId','slot','level','enhance','rarity'].map(key=>[key,item[key]])),score,detail,hint,spent:0,swapHpLoss:s.player.hp-next.player.hp,...continueWindow(next)});
 }
 const first=rows[0].fights[0];for(const row of rows){assert.equal(row.fights[0].openingRng,first.openingRng);assert.equal(row.fights[0].enemySha256,first.enemySha256);}
 assert.equal(fingerprint(s),openingStateSha256);
 return {floor:s.floor,roomIndex:s.roomIndex,room:s.route[s.roomIndex].type,turnsBeforeBranch:s.enemy.turns,openingHp:s.player.hp,maxHp:E.stats(s).maxHp,priorRetaliation:s.lastRoll.retaliation,openingStateSha256,unavailableSlots,rows};
}
const summarizeAttempts=attempts=>({battles:attempts.length,rolls:attempts.reduce((sum,f)=>sum+f.turns,0),battlesWithRetaliation:attempts.filter(f=>f.damageTaken>0).length,grossRetaliationDamage:attempts.reduce((sum,f)=>sum+f.damageTaken,0),battlesEndingBelowOpeningHp:attempts.filter(f=>f.endHp<f.startHp).length,netBattleEndingHpLoss:attempts.reduce((sum,f)=>sum+Math.max(0,f.startHp-f.endHp),0),deaths:attempts.filter(f=>!f.killed).length});
const journeys=[];
for(const seed of seeds){
 const captured=new Map(checkpoints.map(n=>[n,[]])),qualifiedCounts=Object.fromEntries(checkpoints.map(n=>[n,0])),seenCaptures=new Set(),routes=new Set(),chests=new Set(),observedRolls=new Set(),ends=new Map(),roomTypeCounts={},gateFirstFloor=Array(8).fill(null),qualities=Array(8).fill(0);
 const run=simulator.runAdventure(seed,{floors:400,shop:false,fusion:false,talents:false,events:'safe',forecast:false,observe:s=>{
  const allocated=power(s);if(allocated!==s)Object.assign(s,allocated);
  assert(Number.isSafeInteger(s.player.gold)&&s.player.gold>=0&&s.player.gold<=E.GOLD_CAP);
  const equipped=Object.values(s.player.equipped).filter(Boolean);assert(equipped.length>=3&&equipped.length<=5&&new Set(equipped).size===equipped.length);
  assert(s.phase==='fate'?s.route.length===0:s.route.length===6);
  if(s.route.length&&!routes.has(s.floor)){
   routes.add(s.floor);routeChecks++;assert.equal(s.route.length,6);assert.deepEqual(s.route.map(r=>r.id),Array.from({length:6},(_,i)=>`f${s.floor}r${i}`));
   for(const room of s.route){assert(Object.hasOwn(C.ROOM_NAMES,room.type));roomTypeCounts[room.type]=(roomTypeCounts[room.type]||0)+1;}
  }
  if(s.phase==='chest'&&!chests.has(s.chest.item.id)){
   chests.add(s.chest.item.id);chestGateChecks++;const r=s.chest.item.rarity;assert(r>=0&&r<8&&r<=R.highestRarity(s.floor));qualities[r]++;gateFirstFloor[r]??=s.floor;
  }
  if(s.lastRoll&&!observedRolls.has(s.counters.rolls)){
   observedRolls.add(s.counters.rolls);rollChecks++;assert(s.lastRoll.values.length>=1&&s.lastRoll.values.length<=6);assert(s.lastRoll.values.every(v=>Number.isSafeInteger(v)&&v>=1&&v<=6));
  }
  if(s.phase==='cleared'&&!ends.has(s.floor)){
   ends.set(s.floor,{floor:s.floor,gold:s.player.gold,hp:s.player.hp,maxHp:E.stats(s).maxHp,level:s.player.level,rolls:s.counters.rolls,deaths:s.counters.deaths,inventory:s.player.items.length,talentPoints:s.player.talentPoints,powerRank:E.talent(s,'power'),stateSha256:fingerprint(s)});
   if(s.floor%25===0)checked(s);
  }
  if(s.floor>=minCaptureFloor&&s.phase==='combat'&&s.lastRoll?.retaliation>0&&s.player.hp<E.stats(s).maxHp*.99){
   const id=`${s.floor}/${s.roomIndex}/${s.enemy.turns}`;
   if(!seenCaptures.has(id)){
    seenCaptures.add(id);const stratum=checkpoints.find(n=>s.floor<=n);qualifiedCounts[stratum]++;const list=captured.get(stratum);list.push(structuredClone(s));
    // Predeclared first and latest two qualifying states, never selected by a
    // future dice sequence or a preferred survival result.
    if(list.length>maxCapturesPerStratum)list.splice(1,1);
   }
  }
 }});
 checked(run.s);assert(run.completed,`Natural fixed policy did not reach floor 400: seed ${seed}`);assert.equal(run.spent,0);assert.equal(run.deaths,run.s.counters.deaths);
 assert.equal(routes.size,400);assert.equal(ends.size,400);assert.deepEqual(run.rarities,qualities);
 const strata=checkpoints.map((checkpoint,i)=>{
  const lower=i?checkpoints[i-1]+1:1,attempts=run.attempts.filter(f=>f.floor>=lower&&f.floor<=checkpoint);
  return {checkpoint,range:[lower,checkpoint],checkpointState:ends.get(checkpoint),...summarizeAttempts(attempts),qualifyingNaturalStates:qualifiedCounts[checkpoint],capturedNaturalStates:captured.get(checkpoint).length,decisions:captured.get(checkpoint).map(decision)};
 });
 const row={seed,floors:400,completed:run.completed,deaths:run.deaths,rolls:run.rolls,level:run.level,gold:run.s.player.gold,spending:run.spending,finalStateSha256:fingerprint(run.s),encounterTraceSha256:hash(run.attempts),floorCheckpointTraceSha256:hash([...ends.values()]),...summarizeAttempts(run.attempts),qualities,firstNaturalChestFloorByQuality:gateFirstFloor,roomTypeCounts,strata};
 journeys.push(row);console.log(JSON.stringify({seed,floors:400,rolls:row.rolls,deaths:row.deaths,battlesWithRetaliation:row.battlesWithRetaliation,grossRetaliationDamage:row.grossRetaliationDamage,qualified:qualifiedCounts,captures:strata.reduce((sum,x)=>sum+x.capturedNaturalStates,0),branches:strata.flatMap(x=>x.decisions).reduce((sum,x)=>sum+x.rows.length,0)}));
}
assert.deepEqual(await sourceHashes(),beforeHashes,'Audited source changed during execution.');
assert.equal(C.RARITIES.length,8);assert.deepEqual(R.RARITY_FLOORS,[1,1,1,1,30,50,80,140]);assert.equal(E.VERSION,5);
const decisions=journeys.flatMap(j=>j.strata.flatMap(s=>s.decisions)),branches=decisions.flatMap(d=>d.rows);
const report={audit:'round13-natural-multiseed-conditional-decisions',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),sourceHashes:beforeHashes,sourceStable:true,environment:{node:process.version,platform:process.platform,arch:process.arch},parameters:{seeds,checkpoints,minCaptureFloor,windowBattles,maxCapturesPerStratum},method:{journeys:'Four independently seeded journeys from newGame through floor 400; checkpoint 200 is a prefix of that same seed, never another independent journey.',policy:'Safe events, expected-score automatic equipment choice, no shop/forge/fusion purchases; all naturally earned talent points legally allocated to power. Product rolls remain manual; the audit policy is offline.',capture:'Active naturally reached combat at floor >=140, previously settled retaliation >0, settled HP strictly below 99% of current maximum. Per seed and 1-200 / 201-400 stratum retain the first and most recent two states; absent states remain absent.',branches:'Keep current loadout, or highest original estimated improvement inside [-30,+30] in each available weapon/armor/relic slot; tie by item ID. No future outcome is used to pick gear. Each free equip preserves first enemy and opening RNG. Continue 12 completed battle attempts or first death, retain chosen gear, invest new points in power, claim rewards and free rest, decline events and paid services.',stateHashes:'SHA256 of JSON.stringify({...state,runId:"date-normalized"}); every other state field is retained. Full encode/decode round trips use exact unnormalized deep equality.',copyScope:'Conditional details and hints are retained exactly; they are explanatory UI values, not survival or actual-damage forecasts.'},rules:{saveSchema:5,roomCount:6,maxDice:6,equipmentSlots:C.EQUIP_SLOTS,currency:'gold',goldCap:E.GOLD_CAP,rarities:C.RARITIES.map((r,i)=>({index:i,name:r.name,floor:R.RARITY_FLOORS[i]})),talentDefinitions:Object.keys(C.TALENTS).length,equipmentCatalogEntries:C.CATALOG.length},validation:{fullRoundTrips,branchTransactions,allocationActions,allocationPoints,comparisonReads,routeChecks,chestGateChecks,rollChecks,adapter:simulator.QA_COMPARISON_AUDIT,completeBranchStatesSha256:committed.digest('hex')},summary:{naturalJourneys:journeys.length,naturalFloorTotal:journeys.length*400,naturalRolls:journeys.reduce((sum,j)=>sum+j.rolls,0),naturalDeaths:journeys.reduce((sum,j)=>sum+j.deaths,0),naturalBattles:journeys.reduce((sum,j)=>sum+j.battles,0),naturalRetaliatingBattles:journeys.reduce((sum,j)=>sum+j.battlesWithRetaliation,0),naturalGrossRetaliationDamage:journeys.reduce((sum,j)=>sum+j.grossRetaliationDamage,0),capturedNaturalStates:decisions.length,freeDecisionBranches:branches.length,branchCompletedBattles:branches.reduce((sum,b)=>sum+b.completedBattles,0),branchRolls:branches.reduce((sum,b)=>sum+b.rolls,0),branchRetaliatingRolls:branches.reduce((sum,b)=>sum+b.retaliatingRolls,0),branchGrossRetaliationDamage:branches.reduce((sum,b)=>sum+b.damageTaken,0),branchDeaths:branches.filter(b=>!b.survived).length},journeys,durationSeconds:(performance.now()-started)/1000,limitations:['Fixed seeds and deliberately constrained offline policy are not representative human win rates or proof of optimal build balance.','Gross retaliation is recorded before healing in the same legal turn; net battle-ending HP loss and below-full-HP capture are distinct measures. Neither is a count of retaliations.','A captured opening battle may already be in progress; the window is 12 completed attempts, not 12 fresh battles. Branches from a seed may overlap and are not independent random samples.','Instantaneous HP clipping after equipment replacement is reported separately as swapHpLoss; later minima can include it.','No paid choice is made in this audit. A free swap outcome cannot establish shop, forge, fusion or respec value.','The complete original inventory remains in every gameplay transition; only comparison read views use the previously audited compact adapter.','No synthetic damage/HP/enemy/room/RNG fields or retry manipulation produce the natural captures. Zero deaths does not by itself identify a bug.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,summary:report.summary,validation:report.validation,durationSeconds:report.durationSeconds}));
