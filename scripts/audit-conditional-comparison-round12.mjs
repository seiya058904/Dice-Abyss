// Exact rule-copy audit plus a separately labelled natural decision sample.
// No network, save grants, enemy edits in the natural sample, or rule changes.
// node scripts/audit-conditional-comparison-round12.mjs --source . --baseline /path/to/input --output /tmp/conditional.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const source=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),baseline=arg('--baseline',null),output=resolve(arg('--output',''));
assert(process.argv.includes('--output'),'Pass an explicit report path outside the project.');
const rel=relative(source,output);assert(rel.startsWith('..'+sep)||isAbsolute(rel),'Keep the report outside the runtime project.');
const seed=7919,floors=400,windowBattles=12,samples=256;
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const fingerprint=s=>hash({...s,runId:'date-normalized'});
const coreFiles=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/content.js','src/storage.js','scripts/simulate.mjs'];
async function load(root){
 const base=pathToFileURL(resolve(root)+'/'),E=await import(new URL('src/engine.js',base)),S=await import(new URL('src/storage.js',base)),C=await import(new URL('src/equipment-content.js',base)),{TALENTS}=await import(new URL('src/content.js',base)),{loadCompactSimulator}=await import(new URL('scripts/qa-combat-adventure.mjs',base));
 let display=null;try{await access(resolve(root,'src/equipment-comparison.js'));display=await import(new URL('src/equipment-comparison.js',base));}catch{}
 const sourceHashes=Object.fromEntries(await Promise.all(coreFiles.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 return {root:resolve(root),E,S,C,TALENTS,display,sourceHashes,simulator:await loadCompactSimulator(root,{verifyComparisons:128})};
}
function catalogItem(api,catalogId,id,level=80){const e=api.C.CATALOG_BY_ID.get(catalogId);assert(e,catalogId);return {id,catalogId,slot:e.slot,rarity:e.rarity,profile:e.profile,theme:e.theme,name:e.name,level,levelXp:0,enhance:0,depth:140,locked:false};}
function constructed(api,oldId,nextId,nextLevel=80){
 const {E,S}=api,s=E.newGame(seed);s.runId='constructed-round12-comparison';s.floor=140;s.player.level=80;s.fate=[3,4];s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({type,id:`f140r${i}`,quality:0,done:false}));s.roomIndex=0;s.phase='combat';
 s.player.items=[catalogItem(api,'weapon-0-0-0','i1'),catalogItem(api,'armor-0-0-0','i2'),catalogItem(api,'relic-0-0-0','i3')];const slot=api.C.CATALOG_BY_ID.get(oldId).slot,index=s.player.items.findIndex(i=>i.slot===slot);s.player.items[index]=catalogItem(api,oldId,s.player.items[index].id);s.player.items.push(catalogItem(api,nextId,'i4',nextLevel));s.nextId=5;
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.player.hp=E.stats(s).maxHp;s.ward=0;s.enemy={name:'条件比较构造对照',note:'Synthetic; not naturally reached.',label:'轻反击；隔离伤害条件',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1,turns:0,stage:2,combatRules:4};assert(S.validateSave(s));return s;
}
const summaryRoll=r=>Object.fromEntries(['values','best','critical','follow','criticalMultiplier','followMultiplier','main','extra','echoDamage','total','absorbed','hpDamage','retaliation','killed','phaseChanged','wardGain'].map(key=>[key,r[key]]));
function runConstructed(api){
 const {E,S,display}=api,rows=[],complete=createHash('sha256');let transactions=0;
 function act(s,action){assert(E.canAct(s,action));const next=E.transition(s,action);assert.notStrictEqual(next,s);complete.update(fingerprint(next));transactions++;return next;}
 function record(id,s,candidate,extra={}){const saved=JSON.stringify(s),score=E.compareEquipment(s,candidate,candidate.slot);const detail=display?.equipmentComparisonDetails(s,candidate,candidate.slot),hint=display?.equipmentComparisonHint(s,candidate,candidate.slot);assert.equal(JSON.stringify(s),saved);return {id,...extra,score,detail,hint};}
 {
  const s=constructed(api,'weapon-6-0-7','weapon-0-0-7',84),candidate=s.player.items[3],r=record('first-hit-score-omission',s,candidate,{classification:'confirmed display scope problem; fixed synthetic loadout comparison'});r.contexts=[];
  for(const turns of [0,1]){let before=0,after=0;const traces=[];
   for(let n=1;n<=samples;n++){const a=structuredClone(s);a.rng=n*7919>>>0;a.enemy.turns=turns;const b=act(a,{type:'equip',id:candidate.id});assert.equal(a.rng,b.rng);const aa=act(a,{type:'roll'}),bb=act(b,{type:'roll'});assert.deepEqual(aa.lastRoll.values,bb.lastRoll.values);assert.equal(aa.lastRoll.critical,bb.lastRoll.critical);assert.equal(aa.lastRoll.follow,bb.lastRoll.follow);assert(!aa.lastRoll.killed&&!bb.lastRoll.killed);assert.equal(aa.rng,bb.rng);before+=aa.lastRoll.total;after+=bb.lastRoll.total;traces.push({rng:n*7919>>>0,before:summaryRoll(aa.lastRoll),after:summaryRoll(bb.lastRoll)});}
   r.contexts.push({turnsBeforeRoll:turns,samples,meanBefore:before/samples,meanAfter:after/samples,actualDeltaPercent:100*(after/before-1),traceSha256:hash(traces)});
  }
  assert.equal(r.score.delta,9);assert(r.contexts[0].actualDeltaPercent<-10);assert(r.contexts[1].actualDeltaPercent>0);rows.push(r);
 }
 {
  const s=constructed(api,'v5-weapon-0-0-4','weapon-4-0-4',88),candidate=s.player.items[3];s.enemy.maxShield=s.enemy.shield=1e12;s.enemy.turns=1;const r=record('conditional-penetration-tradeoff',s,candidate,{classification:'base penetration alone does not cover a conditional loss'});r.cases=[];
  for(const hasSix of [false,true])for(let n=1;n<=200;n++){
   const a=structuredClone(s);a.rng=n*7919>>>0;const p=structuredClone(a);if(E.drawDice(p,E.diceCount(p)).values.includes(6)!==hasSix)continue;const aa=act(a,{type:'roll'}),bb=act(act(a,{type:'equip',id:candidate.id}),{type:'roll'});assert.deepEqual(aa.lastRoll.values,bb.lastRoll.values);assert.equal(r.score.shieldTradeoff,false);if(hasSix)assert(bb.lastRoll.total>aa.lastRoll.total&&bb.lastRoll.hpDamage<aa.lastRoll.hpDamage);r.cases.push({hasSix,rng:a.rng,before:summaryRoll(aa.lastRoll),after:summaryRoll(bb.lastRoll)});break;
  }
  assert.equal(r.cases.length,2);rows.push(r);
 }
 {
  const s=constructed(api,'relic-5-0-4','relic-5-0-7',80);s.player.items.push(catalogItem(api,'relic-5-0-7','i5'));s.player.equipped.relic2='i5';s.nextId=6;s.player.talents.fortune=3;const candidate=s.player.items[3],r=record('actual-gold-cap',s,candidate,{classification:'effective sixty-percent equipment gold cap, independent of unchanged fortune talent'}),a=structuredClone(s),b=act(s,{type:'equip',id:candidate.id,slot:'relic'});
  const one=E.createChest(a,'combat','金币上限对照'),two=E.createChest(b,'combat','金币上限对照');assert.deepEqual(one,two);r.beforeGoldBonus=E.stats(s).goldBonus;r.afterGoldBonus=E.stats(b).goldBonus;r.generatedGold=one.gold;assert.equal(r.beforeGoldBonus,.6);assert.equal(r.afterGoldBonus,.6);if(display){assert(!r.detail.rows.some(row=>row.key==='goldBonus'));assert(r.detail.limits.some(row=>row.key==='goldBonus'&&row.cap===.6));}rows.push(r);
 }
 for(const r of rows)assert(!/NaN|Infinity/.test(JSON.stringify(r)));
 return {method:'Constructed valid schema-5 fixtures: legal equip/roll actions. Large enemy HP and light retaliation isolate output and are never labelled natural progress. No fixture outcome estimates human win rates.',samplesPerFirstHitContext:samples,rows,transactions,completeCommittedStatesSha256:complete.digest('hex')};
}
function runNatural(api){
 const {E,S,TALENTS,simulator,display}=api,captures=[],captureIds=new Set(),complete=createHash('sha256');let allocationActions=0,allocationPoints=0,roundTrips=0,branchTransactions=0,readChecks=0;
 const checked=s=>{assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);roundTrips++;};
 const run=simulator.runAdventure(seed,{floors,shop:false,fusion:false,talents:false,events:'safe',forecast:false,observe:s=>{
  if(s.player.talentPoints){const count=Math.min(s.player.talentPoints,TALENTS.power.cap-E.talent(s,'power'));if(count>0){const next=E.transition(s,{type:'talent',id:'power',count});assert.notStrictEqual(next,s);assert.equal(next.rng,s.rng);assert.equal(next.player.hp,s.player.hp);Object.assign(s,next);allocationActions++;allocationPoints+=count;}}
  const id=`${s.floor}/${s.roomIndex}/${s.enemy?.turns}`;
  if(s.floor>=140&&s.phase==='combat'&&s.player.hp<E.stats(s).maxHp*.99&&s.lastRoll?.retaliation>0&&!captureIds.has(id)){captureIds.add(id);captures.push(structuredClone(s));if(captures.length>15)captures.splice(1,1);}
 }});
 checked(run.s);assert(run.completed,'The fixed natural policy must finish 400 floors.');
 function act(s,action){assert(E.canAct(s,action),`${s.floor}/${s.phase}: ${JSON.stringify(action)}`);const next=E.transition(s,action);assert.notStrictEqual(next,s);branchTransactions++;complete.update(fingerprint(next));return next;}
 function window(input){let s=input,rolls=0,taken=0,minimumHp=s.player.hp,steps=0;const fights=[];let fight=null;
  while(fights.length<windowBattles&&s.phase!=='dead'&&steps++<6000){
   if(s.player.talentPoints){const count=Math.min(s.player.talentPoints,TALENTS.power.cap-E.talent(s,'power'));if(count>0)s=act(s,{type:'talent',id:'power',count});}
   switch(s.phase){
    case 'combat':fight??={floor:s.floor,room:s.route[s.roomIndex].type,startTurns:s.enemy.turns,openingRng:s.rng,enemySha256:hash(s.enemy),openingHp:s.player.hp,turns:0,damageTaken:0};s=act(s,{type:'roll'});rolls++;taken+=s.lastRoll.retaliation;fight.turns++;fight.damageTaken+=s.lastRoll.retaliation;fight.firstRoll??=summaryRoll(s.lastRoll);if(s.phase!=='combat'){fights.push({...fight,phase:s.phase,endingHp:s.player.hp,endingRng:s.rng});fight=null;}break;
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
  checked(s);assert(s.phase==='dead'||fights.length===windowBattles);return {completedBattles:fights.length,survived:s.phase!=='dead',rolls,damageTaken:taken,minimumHp,endingHp:s.player.hp,endingGold:s.player.gold,endingRng:s.rng,finalStateSha256:fingerprint(s),fights};
 }
 const decisions=[];
 for(const s of captures){checked(s);const original=fingerprint(s),ids=new Set(E.equippedIds(s)),view={...s,player:{...s.player,items:s.player.items.filter(i=>ids.has(i.id))}},alternatives=[];
  for(const slot of ['weapon','armor','relic']){
   const candidates=s.player.items.filter(item=>item.slot===slot&&!ids.has(item.id)).map(item=>({item,score:E.compareEquipment(view,item)})).filter(({score})=>score.delta>=-30&&score.delta<=30).toSorted((a,b)=>b.score.delta-a.score.delta||a.item.id.localeCompare(b.item.id,'en'));
   // Nearest score in each slot is predeclared; no preferred dice or survival
   // result is used to select an alternative from the natural inventory.
   if(candidates.length)alternatives.push({...candidates[0],candidateCount:candidates.length});
  }
  const rows=[{id:'keep-loadout',spent:0,swapHpLoss:0,...window(structuredClone(s))}];
  for(const {item,score,candidateCount}of alternatives){assert.deepEqual(score,E.compareEquipment(s,item));const snapshot=JSON.stringify(s),detail=display?.equipmentComparisonDetails(view,item),hint=display?.equipmentComparisonHint(view,item);assert.equal(JSON.stringify(s),snapshot);readChecks++;
   const next=act(s,{type:'equip',id:item.id,slot:score.slot});assert.equal(next.rng,s.rng);assert.deepEqual(next.enemy,s.enemy);
   rows.push({id:`equip-${score.slot}`,item:{id:item.id,catalogId:item.catalogId,level:item.level,enhance:item.enhance,rarity:item.rarity},score,detail,hint,candidateCount,spent:0,swapHpLoss:s.player.hp-next.player.hp,...window(next)});
  }
  const first=rows[0].fights[0];for(const row of rows){assert.equal(row.fights[0].openingRng,first.openingRng);assert.equal(row.fights[0].enemySha256,first.enemySha256);}assert.equal(fingerprint(s),original);
  decisions.push({floor:s.floor,roomIndex:s.roomIndex,room:s.route[s.roomIndex].type,turnsBeforeBranch:s.enemy.turns,openingHp:s.player.hp,maxHp:E.stats(s).maxHp,priorRetaliation:s.lastRoll.retaliation,openingStateSha256:original,rows});
 }
 // A fixed adjacent natural encounter demonstrates why a single RNG outcome
 // is not proof that a mean estimate is wrong, even when its sign differs.
 let adjacent=run.s;for(const type of ['descend','fate','enter'])adjacent=act(adjacent,{type});checked(adjacent);
 const fixedItem=adjacent.player.items.find(item=>item.id==='i1800'),singleRoll=(()=>{
  if(!fixedItem)return {status:'ITEM_NOT_PRESENT'};
  const before=act(adjacent,{type:'roll'}),after=act(act(adjacent,{type:'equip',id:fixedItem.id}),{type:'roll'}),score=E.compareEquipment(adjacent,fixedItem);
  return {classification:'single-roll conditional outcome; NOT an estimator-error count',floor:adjacent.floor,room:adjacent.route[adjacent.roomIndex].type,openingStateSha256:fingerprint(adjacent),openingRng:adjacent.rng,candidate:{id:fixedItem.id,catalogId:fixedItem.catalogId,level:fixedItem.level},score,detail:display?.equipmentComparisonDetails(adjacent,fixedItem),before:summaryRoll(before.lastRoll),after:summaryRoll(after.lastRoll),actualDeltaPercent:100*(after.lastRoll.total/before.lastRoll.total-1)};
 })();
 return {method:'Natural new-game seed 7919 through floor 400. No spending on shops, forge or fusion; all earned points are legally allocated to power. Existing expected-score gear policy and safe events remain. Capture naturally reached active battles at floor >=140 with recorded retaliation and post-settlement HP <99%; retain first and last fourteen. No health/enemy/room/RNG field is invented.',seed,floors,completed:run.completed,deaths:run.deaths,rolls:run.rolls,level:run.level,gold:run.s.player.gold,spending:run.spending,finalStateSha256:fingerprint(run.s),encounterTraceSha256:hash(run.attempts),retaliatingBattles:run.attempts.filter(f=>f.damageTaken>0).length,retaliatingBattlesAtLeast80:run.attempts.filter(f=>f.floor>=80&&f.damageTaken>0).length,totalRetaliation:run.attempts.reduce((sum,f)=>sum+f.damageTaken,0),capturedActiveStates:captures.length,allocationActions,allocationPoints,roundTrips,readChecks,branchTransactions,completeCommittedStatesSha256:complete.digest('hex'),windowBattles,decisions,singleRoll,adapter:simulator.QA_COMPARISON_AUDIT,limitations:['Gross retaliation can be fully restored later in the same roll; it is not the same as net lost HP.','This fixed self-selected policy and its small losses still do not establish general survival pressure or human win rates.','Each branch is free; no conclusion about paid upgrade value follows. Lower max HP can clip current HP immediately; swapHpLoss is separate from battle damage.','Continuation retains the selected loadout, invests new points in power, claims rewards and uses free rest; it declines events and further paid services.','The first battle may already be partly played. A window counts twelve completed combat attempts, or the first death. Later RNG, loot, leveling and healing may diverge because of legal choices.']};
}
function gameplayOnly(report){
 const walk=value=>Array.isArray(value)?value.map(walk):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['detail','hint','adapter'].includes(key)).map(([key,child])=>[key,walk(child)])):value;
 return walk({constructed:report.constructed,natural:report.natural});
}
async function run(root){const started=performance.now(),api=await load(root);const constructed=runConstructed(api),natural=runNatural(api),finalHashes=Object.fromEntries(await Promise.all(coreFiles.map(async path=>[path,hash(await readFile(resolve(root,path)))])));assert.deepEqual(finalHashes,api.sourceHashes,'Core source changed during audit.');return {sourceVersion:JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version,sourceHashes:api.sourceHashes,constructed,natural,durationSeconds:(performance.now()-started)/1000};}
const previous=baseline?await run(resolve(baseline)):null;if(previous)console.log(JSON.stringify({version:previous.sourceVersion,stage:'baseline-complete',captured:previous.natural.capturedActiveStates,seconds:previous.durationSeconds}));
const current=await run(source);let comparison=null;
if(previous){const a=gameplayOnly(previous),b=gameplayOnly(current);assert.deepEqual(b,a,'Gameplay outcomes differ; inspect complete report before attributing any change to display.');comparison={equal:true,baselineSha256:hash(a),currentSha256:hash(b),completeConstructedStatesEqual:previous.constructed.completeCommittedStatesSha256===current.constructed.completeCommittedStatesSha256,completeNaturalStatesEqual:previous.natural.completeCommittedStatesSha256===current.natural.completeCommittedStatesSha256};}
const report={audit:'round12-conditional-equipment-comparison',scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),environment:{node:process.version,platform:process.platform,arch:process.arch},baseline:previous,current,comparison,scope:'The original estimate and every combat/economy rule remain unchanged. New UI hints identify omitted terms; on-demand details show actual whole-build conditional changes and effective caps. Constructed cases and natural journeys are strictly separated.'};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,comparison,constructedCases:current.constructed.rows.length,naturalCaptures:current.natural.capturedActiveStates,naturalBranches:current.natural.decisions.reduce((sum,d)=>sum+d.rows.length,0),seconds:current.durationSeconds}));
