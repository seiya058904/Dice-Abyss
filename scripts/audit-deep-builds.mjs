// Reproducible offline decision-policy audit. No private saves, synthetic player
// grants, forced dice, enemy tuning or claims about human-player win rates.
// Examples:
// node scripts/audit-deep-builds.mjs --policy legacy --floors 400 --seeds 7919,15838 --output /tmp/tails.json
// node scripts/audit-deep-builds.mjs --policy balanced --floors 400 --seeds 7919,15838 --output /tmp/ready.json
// node scripts/audit-deep-builds.mjs --policy luck --floors 200 --seeds 7919,15838 --output /tmp/luck.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const source=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..')));
const output=resolve(arg('--output','deep-build-audit.json')),policy=arg('--policy','legacy');
const floors=Number(arg('--floors',400)),seeds=arg('--seeds','7919,15838').split(',').map(Number);
assert(['legacy','balanced','luck','power'].includes(policy),'policy: legacy, balanced, luck or power');
assert(Number.isSafeInteger(floors)&&floors>=10&&floors<=1000,'10–1000 floors');
assert(seeds.length&&seeds.every(n=>Number.isSafeInteger(n)&&n>0&&n<=0xffffffff),'positive uint32 seeds');
const E=await import(pathToFileURL(resolve(source,'src/engine.js')));
const S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const {TALENTS,RARITIES}=await import(pathToFileURL(resolve(source,'src/content.js')));
const {loadCompactSimulator}=await import(pathToFileURL(resolve(source,'scripts/qa-combat-adventure.mjs')));
const simulator=await loadCompactSimulator(source,{verifyComparisons:512});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const files=['src/engine.js','src/encounters.js','src/deep-rules.js','src/equipment.js','scripts/simulate.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(resolve(source,p),'utf8'))])));
const distribution=values=>{if(!values.length)return null;const sorted=values.toSorted((a,b)=>a-b),at=q=>sorted[Math.floor((sorted.length-1)*q)];return {n:sorted.length,min:sorted[0],median:at(.5),p95:at(.95),max:sorted.at(-1),mean:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(3)};};
const priorities=build=>build==='power'?['power']:build==='luck'?['luck','attune','resonance','critical','vitality','high','pair','guard','recovery','omen','mercy','jackpot','spark',...Object.keys(TALENTS).filter(k=>!['power','vitality'].includes(k)),'power']:['resonance','critical','vitality','high','guard','pair','recovery','six','slayer','sum','leech','smith','luck','attune',...Object.keys(TALENTS).filter(k=>!['power','vitality'].includes(k)),'power'];
const rankCap=(key,build)=>key==='vitality'&&build!=='power'?5:TALENTS[key].cap;
function spendTalents(input,build='balanced',single=false){
 let s=input,points=0,actions=0;
 for(const id of [...new Set(priorities(build))]){
  if((TALENTS[id].floor||1)>s.floor)continue;
  let available=Math.min(s.player.talentPoints,rankCap(id,build)-E.talent(s,id));
  if(available<=0)continue;
  if(single)available=1;
  // Older input versions only know one-point actions. Use their exact legal
  // transition repeatedly; current versions can settle a bounded quantity.
  while(available>0){
   const count=E.talentPreview?available:1,before=s;
   s=E.transition(s,{type:'talent',id,...(E.talentPreview?{count}:{})});
   assert.notStrictEqual(s,before,'talent allocation must make progress');
   assert.equal(s.rng,before.rng,'talent choices cannot consume RNG');
   assert.equal(s.player.hp,before.player.hp,'talent choices cannot heal');
   available-=count;points+=count;actions++;
  }
  if(single||s.player.talentPoints===0)break;
 }
 return {s,points,actions};
}
function equipExpected(input){
 let s=input;
 for(const slot of ['weapon','armor','relic']){
  const ids=new Set(E.equippedIds(s)),view={...s,player:{...s.player,items:s.player.items.filter(item=>ids.has(item.id))}};
  const candidates=s.player.items.filter(item=>item.slot===slot).map(item=>({item,delta:E.compareEquipment(view,item).delta})).toSorted((a,b)=>b.delta-a.delta);
  for(const {item}of candidates.slice(0,slot==='relic'?3:1))if(!E.equippedIds(s).includes(item.id)&&E.compareEquipment(s,item).delta>0)s=E.transition(s,{type:'equip',id:item.id});
 }
 return s;
}
function replayFight(input,build){
 let s=structuredClone(input),signature='',turns=0,points=0,actions=0,total=0,absorbed=0,enemyHealing=0,retaliation=0;
 while(s.phase==='combat'&&turns<200){
  const invested=spendTalents(s,build==='power'?'power':'balanced',build==='single');s=invested.s;points+=invested.points;actions+=invested.actions;
  const next=s.player.items.map(i=>`${i.id}:${i.level}:${i.levelXp}:${i.enhance}`).join('|')+'/'+s.player.level+'/'+Object.values(s.player.talents).join(',');
  if(next!==signature)s=equipExpected(s);signature=next;
  const hp=s.enemy.hp;s=E.transition(s,{type:'roll'});turns++;
  total+=s.lastRoll.total;absorbed+=s.lastRoll.absorbed;retaliation+=s.lastRoll.retaliation;enemyHealing+=s.enemy.hp-hp+s.lastRoll.hpDamage;
 }
 assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);
 return {policy:build,turns,killed:s.phase==='chest',phase:s.phase,pointsInvested:points,talentActions:actions,totalDamage:total,absorbed,enemyHealing,retaliation,finalRng:s.rng,saveRoundTrip:true};
}
const started=performance.now(),rows=[];
for(const seed of seeds){
 let current=null,allocationActions=0,allocationPoints=0;const contexts=new Map(),respecs=new Map(),finished=new Map(),tails=[];
 const r=simulator.runAdventure(seed,{floors,build:policy==='luck'?'luck':'balanced',forecast:false,fusion:true,events:'adventurous',observe:s=>{
  const id=`${s.floor}/${s.roomIndex}/${s.route[s.roomIndex]?.wave||1}`;
  if(s.event?.key==='memorywell'&&s.event.status==='resolved'&&s.event.choice==='reset'&&!respecs.has(id))respecs.set(id,{floor:s.floor,unspentPoints:s.player.talentPoints,investedPoints:Object.values(s.player.talents).reduce((a,b)=>a+b,0)});
  if(policy!=='legacy'){
   const invested=spendTalents(s,policy);allocationActions+=invested.actions;allocationPoints+=invested.points;
   // The observer runs before the original simulator's decision. Replace this
   // same state with a real transition result, never invented field values.
   // Its comparison cache has not read this newly-entered state yet.
   if(invested.s!==s)Object.assign(s,invested.s);
  }
  if(s.phase==='combat'&&s.enemy.turns===0){
   current={id,state:structuredClone(s)};
   contexts.set(id,{floor:s.floor,roomIndex:s.roomIndex,wave:s.route[s.roomIndex]?.wave||1,roomType:s.route[s.roomIndex].type,name:s.enemy.name,unspentPoints:s.player.talentPoints,investedPoints:Object.values(s.player.talents).reduce((a,b)=>a+b,0),powerRank:E.talent(s,'power'),damageEstimate:Math.round(E.damageExpectation(s))});
  }
  if(s.phase==='chest'&&s.enemy&&current?.id===id&&!finished.has(id))finished.set(id,contexts.get(id));
  if(s.phase==='chest'&&s.enemy?.type==='boss'&&s.enemy.turns>=15&&current?.id===id&&!tails.some(t=>t.id===id)){
   tails.push({id,floor:s.floor,name:s.enemy.name,turns:s.enemy.turns,state:current.state});tails.sort((a,b)=>b.turns-a.turns);tails.splice(3);
  }
 }});
 assert(r.completed,`seed ${seed} did not complete ${floors} floors`);assert(S.validateSave(r.s));assert.deepEqual(S.decodeSave(S.encodeSave(r.s)),r.s);
 const equipped=new Set(E.equippedIds(r.s)),finishedContexts=[...finished.values()];
 assert.equal(finishedContexts.length,r.encounters.length,'every victory has one exact room/wave opening context');
 const contextualEncounters=r.encounters.map((e,index)=>({...e,opening:finishedContexts[index]}));
 const counterfactuals=policy==='legacy'?tails.map(t=>{
  const variants=['single','ready','power'].map(build=>replayFight(t.state,build));
  assert.equal(variants[0].turns,t.turns,'local replay must reproduce the original fight before counterfactuals');
  return {seed,floor:t.floor,name:t.name,openingRng:t.state.rng,openingStateSha256:hash({...t.state,runId:'date-normalized'}),openingUnspent:t.state.player.talentPoints,openingInvested:Object.values(t.state.player.talents).reduce((a,b)=>a+b,0),enemyHp:t.state.enemy.hp,enemyShield:t.state.enemy.shield,variants};
 }):[];
 const normalized=structuredClone(r.s);normalized.runId='date-normalized';
 const row={seed,policy,completed:r.completed,floors:r.s.floor,deaths:r.deaths,rolls:r.rolls,level:r.level,gold:r.s.player.gold,spending:r.spending,spent:r.spent,buys:r.buys,forges:r.forges,fusions:r.fusions,inventoryItems:r.s.player.items.length,spareRarities:RARITIES.map((tier,rarity)=>({rarity,name:tier.name,count:r.s.player.items.filter(i=>i.rarity===rarity&&!equipped.has(i.id)).length})),equipped:r.s.player.items.filter(i=>equipped.has(i.id)).map(i=>({id:i.id,slot:i.slot,rarity:i.rarity,level:i.level,levelXp:i.levelXp,enhance:i.enhance,forgeQuote:E.forgeCost(r.s,i)})),allocationActions,allocationPoints,finalTalentPoints:r.s.player.talentPoints,finalTalents:r.s.player.talents,respecs:[...respecs.values()],rounds:Object.fromEntries(['combat','elite','boss','trial'].map(type=>[type,distribution(r.encounters.filter(e=>e.type===type).map(e=>e.turns))])),lateBosses:distribution(r.encounters.filter(e=>e.type==='boss'&&e.floor>floors-50).map(e=>e.turns)),longest:contextualEncounters.toSorted((a,b)=>b.turns-a.turns).slice(0,8),milestones:Object.fromEntries([10,30,50,80,140,200,400].filter(n=>n<=floors).map(n=>[n,r.floorEnds.find(f=>f.floor===n)])),finalStateSha256:hash(normalized),encounterTraceSha256:hash(r.encounters),saveRoundTrip:true,counterfactuals};rows.push(row);
 console.log(JSON.stringify({seed,policy,floors,completed:row.completed,deaths:row.deaths,gold:row.gold,bossMax:row.rounds.boss?.max,lateBossMax:row.lateBosses?.max,seconds:(performance.now()-started)/1000}));
}
const finalHashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(resolve(source,p),'utf8'))])));assert.deepEqual(finalHashes,sourceHashes,'gameplay source changed during audit');
const report={method:'Fresh floor-1 journeys with actual engine transitions and the existing simulator\'s expected-upgrade/shop/fusion/adventurous policy. Legacy invests one talent point per decision; other policies finish their selected talent priority before proceeding. A compact equipment read view is verified against the full comparison. Counterfactuals restart a naturally reached battle at its exact original RNG, HP, equipment and enemy state; all subsequent investments and swaps are legal engine actions.',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,environment:{node:process.version,platform:process.platform,arch:process.arch},sourceHashes,sourceStable:true,policy,floors,seeds,adapter:simulator.QA_COMPARISON_AUDIT,rows,durationSeconds:(performance.now()-started)/1000,limitations:['Automated policies and two seeds do not estimate population win rates or human-play balance.','The existing economy policy upgrades only its weapon below +9, takes only expected equipment gains above 5%, and fuses unlocked non-equipped sub-legendary material; unused gold is not proof that all available spending lacks value.','Counterfactuals share the initial state and RNG but different luck, crit, survival or kill timing may change subsequent RNG consumption.','Fully allocating talents changes actual decision timing; comparisons describe policy sensitivity, not a numerical game-balance patch.','Damage expectation is a loadout estimate, not actual hit damage.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,durationSeconds:report.durationSeconds}));
