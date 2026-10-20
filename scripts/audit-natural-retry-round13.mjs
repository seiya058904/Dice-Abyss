// Post-hoc diagnosis of the unchanged Round13 seed-23757 policy failure.
// This replay/continuation is NOT another independent natural sample. Input
// must be the exact naturally produced incomplete codec save, not a fixture.
// node scripts/audit-natural-retry-round13.mjs --source . --input /tmp/natural.json.seed-23757.incomplete-save.txt --output /tmp/retry.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--source','--input','--output'].includes(args[i])&&args[i+1]);options[args[i]]=args[i+1];}
assert(options['--source']&&options['--input']&&options['--output']);
const source=resolve(options['--source']),input=resolve(options['--input']),output=resolve(options['--output']);
for(const file of [input,output]){const r=relative(source,file);assert(r.startsWith('..'+sep)||isAbsolute(r),'Evidence belongs outside the project.');}
const uri=file=>pathToFileURL(resolve(source,file)),hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex'),fingerprint=s=>hash({...s,runId:'date-normalized'});
const E=await import(uri('src/engine.js')),S=await import(uri('src/storage.js')),C=await import(uri('src/content.js')),{eventChoices}=await import(uri('src/encounters.js'));
const {loadCompactSimulator}=await import(uri('scripts/qa-combat-adventure.mjs')),simulator=await loadCompactSimulator(source,{verifyComparisons:256});
const checkedFiles=['src/engine.js','src/equipment.js','src/encounters.js','src/deep-rules.js','src/deep-content.js','src/content.js','src/equipment-content.js','src/rarity.js','src/route-weights.js','src/storage.js','scripts/simulate.mjs','scripts/qa-combat-adventure.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(checkedFiles.map(async file=>[file,hash(await readFile(resolve(source,file)))]))),sourceHashes=await hashes();
const inputRaw=await readFile(input,'utf8'),terminal=S.decodeSave(inputRaw),seed=23757;
assert.equal(terminal.floor,30);assert.equal(terminal.phase,'dead');assert.equal(terminal.counters.deaths,21);
const tail=[],seen=new Set();let previous=null;
const replay=simulator.runAdventure(seed,{floors:400,shop:false,fusion:false,talents:false,events:'safe',forecast:false,observe:s=>{
 const count=Math.min(s.player.talentPoints,C.TALENTS.power.cap-E.talent(s,'power'));
 if(count){const next=E.transition(s,{type:'talent',id:'power',count});assert.equal(next.rng,s.rng);assert.equal(next.player.hp,s.player.hp);Object.assign(s,next);}
 if(s.lastRoll&&!seen.has(s.counters.rolls)){
  seen.add(s.counters.rolls);const r=s.lastRoll,key=`${s.floor}/${s.roomIndex}/${s.enemy.wave||1}`,prior=previous?.key===key?previous:null;
  tail.push({roll:s.counters.rolls,floor:s.floor,roomIndex:s.roomIndex,enemyTurns:s.enemy.turns,enemyStage:s.enemy.stage,enemyHp:s.enemy.hp,enemyShield:s.enemy.shield,playerHp:s.player.hp,playerWard:s.ward||0,phase:s.phase,observedEnemyHpRecovery:prior?s.enemy.hp-(prior.hp-r.hpDamage):null,observedEnemyShieldAddition:prior?s.enemy.shield-(prior.shield-r.absorbed):null,...r});if(tail.length>64)tail.shift();
 }
 previous=s.phase==='combat'?{key:`${s.floor}/${s.roomIndex}/${s.enemy.wave||1}`,hp:s.enemy.hp,shield:s.enemy.shield}:null;
}});
assert.equal(fingerprint(replay.s),fingerprint(terminal),'Replay must reproduce the recorded natural terminal state exactly except runId.');
assert.deepEqual(S.decodeSave(S.encodeSave(replay.s)),replay.s);
const exactTerminal=JSON.stringify(terminal),terminalChoices={retry:E.canAct(terminal,{type:'retry'}),roll:E.canAct(terminal,{type:'roll'}),unspentTalentIds:Object.keys(C.TALENTS).filter(id=>E.canAct(terminal,{type:'talent',id})),unequippedItems:terminal.player.items.filter(i=>!E.equippedIds(terminal).includes(i.id)).length,paidServicesAvailable:false};
let transactions=0,spent=0;const spending={shop:0,forge:0,fusion:0,event:0},actions=[];
function act(s,action){assert(E.canAct(s,action),`${s.floor}/${s.phase}: ${JSON.stringify(action)}`);const next=E.transition(s,action);assert.notStrictEqual(next,s);transactions++;if(actions.length<30)actions.push(action);return next;}
const priorities=['resonance','critical','vitality','high','guard','pair','recovery','six','slayer','sum','leech','smith','luck','attune',...Object.keys(C.TALENTS).filter(k=>!['power','vitality'].includes(k)),'power'];
function balanced(s){for(const id of new Set(priorities)){if((C.TALENTS[id].floor||1)>s.floor)continue;const count=Math.min(s.player.talentPoints,(id==='vitality'?5:C.TALENTS[id].cap)-E.talent(s,id));if(count>0)s=act(s,{type:'talent',id,count});}assert.equal(s.player.talentPoints,0);return s;}
const views=new WeakMap();function compare(s,item){let view=views.get(s);if(!view){const ids=new Set(E.equippedIds(s));view={...s,player:{...s.player,items:s.player.items.filter(i=>ids.has(i.id))}};views.set(s,view);}return E.compareEquipment(view,item);}
function autoEquip(s){for(const slot of ['weapon','armor','relic']){const candidates=s.player.items.filter(i=>i.slot===slot).map(item=>({item,delta:compare(s,item).delta})).toSorted((a,b)=>b.delta-a.delta);for(const {item}of candidates.slice(0,slot==='relic'?3:1))if(!E.equippedIds(s).includes(item.id)&&compare(s,item).delta>0)s=act(s,{type:'equip',id:item.id});}return s;}
let s=act(S.decodeSave(S.encodeSave(terminal)),{type:'retry'}),steps=0,signature='',fight=null;const fights=[],continuationTail=[];
const retryOpening={floor:s.floor,phase:s.phase,rng:s.rng,hp:s.player.hp,enemy:structuredClone(s.enemy),stateSha256:fingerprint(s)};
while(s.phase!=='dead'&&fights.length<12&&steps++<6000){
 s=balanced(s);const next=s.player.items.map(i=>`${i.id}:${i.level}:${i.levelXp}:${i.enhance}`).join('|')+'/'+s.player.level+'/'+Object.values(s.player.talents).join(',');if(next!==signature)s=autoEquip(s);signature=next;
 const openingGold=s.player.gold,phase=s.phase;
 switch(phase){
  case 'combat':fight??={floor:s.floor,room:s.route[s.roomIndex].type,enemy:structuredClone(s.enemy),openingRng:s.rng,openingHp:s.player.hp,turns:0,retaliation:0};s=act(s,{type:'roll'});fight.turns++;fight.retaliation+=s.lastRoll.retaliation;continuationTail.push({turn:s.enemy.turns,enemyHp:s.enemy.hp,enemyShield:s.enemy.shield,stage:s.enemy.stage,playerHp:s.player.hp,ward:s.ward||0,...s.lastRoll});if(continuationTail.length>64)continuationTail.shift();if(s.phase!=='combat'){fights.push({...fight,killed:s.lastRoll.killed,endingHp:s.player.hp,endingRng:s.rng});fight=null;}break;
  case 'fate':s=act(s,{type:'fate'});break;
  case 'route':s=act(s,{type:'enter'});break;
  case 'chest':s=act(s,{type:'open'});break;
  case 'loot':s=act(s,{type:'next'});break;
  case 'gold':s=act(s,{type:'gold'});break;
  case 'merchant':case 'blackmarket':for(const offer of s.shop.filter(o=>o.item).toSorted((a,b)=>b.item.rarity-a.item.rarity))if(compare(s,offer.item).delta>5&&E.canAct(s,{type:'buy',id:offer.id}))s=act(s,{type:'buy',id:offer.id});if(s.player.hp<E.stats(s).maxHp*.5&&E.canAct(s,{type:'buy',id:'heal'}))s=act(s,{type:'buy',id:'heal'});s=act(s,{type:'next'});break;
  case 'forge':{const item=s.player.items.find(i=>i.id===s.player.equipped.weapon);if(item.enhance<9&&s.player.gold>E.forgeCost(s,item)+80)s=act(s,{type:'forge',id:item.id});s=act(s,{type:'next'});break;}
  case 'fusion':for(const slot of ['weapon','armor','relic']){const ids=new Set(E.equippedIds(s)),targets=s.player.items.filter(i=>ids.has(i.id)&&i.slot===slot).map(i=>i.id),min=Math.min(...s.player.items.filter(i=>targets.includes(i.id)).map(i=>i.rarity)),materials=s.player.items.filter(i=>i.slot===slot&&!ids.has(i.id)&&!i.locked&&i.id!==s.loot?.item?.id&&i.rarity<3&&i.rarity<=min).map(i=>i.id),action={type:'fuse',targets,materials};if(E.canAct(s,action))s=act(s,action);}s=act(s,{type:'next'});break;
  case 'altar':s=act(s,{type:'bless'});s=act(s,{type:'next'});break;
  case 'rest':s=act(s,{type:'rest'});s=act(s,{type:'next'});break;
  case 'event':if(s.event.status==='resolved')s=act(s,{type:'next'});else{const choice=eventChoices(s).find(o=>!o.disabled&&o.id!=='leave');s=act(s,{type:'event-choice',id:choice?.id||'leave',confirmed:!!choice?.confirm});}break;
  case 'cleared':s=act(s,{type:'descend'});break;
  default:throw Error(phase);
 }
 const paid=Math.max(0,openingGold-s.player.gold);spent+=paid;if(['merchant','blackmarket'].includes(phase))spending.shop+=paid;else if(Object.hasOwn(spending,phase))spending[phase]+=paid;
}
assert.equal(JSON.stringify(terminal),exactTerminal);assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);assert.deepEqual(await hashes(),sourceHashes);
const replaySummary={completed:replay.completed,finishReason:'DEATH_RETRY_LIMIT',floor:replay.s.floor,phase:replay.s.phase,completedFloors:29,checkpoint200:false,checkpoint400:false,rolls:replay.rolls,deaths:replay.deaths,attempts:replay.attempts.length,wonBattles:replay.encounters.length,finalStateSha256:fingerprint(replay.s),encounterTraceSha256:hash(replay.attempts)};
const report={audit:'round13-post-hoc-natural-failure-replay-and-one-normal-retry',seed,sourceHashes,sourceStable:true,scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),environment:{node:process.version,platform:process.platform,arch:process.arch},inputSha256:hash(inputRaw),method:{classification:'Post-hoc diagnosis only. The original fixed-sample result remains 21 deaths / 29 completed floors / neither 200 nor 400 reached. This exact replay is not another independent journey.',replay:'Same unchanged original simulator with 400-floor target, 160000 decision budget and >20-death stop; shops/forge/fusion off, safe events, expected-score equipment, all earned points legally allocated to power.',continuation:'Start from the complete natural dead terminal save; exactly one legal retry, then the pre-existing balanced/normal-spending journey policy for at most 12 finished combat attempts, first further death or 6000 decisions. Existing spent talent points are not reassigned. No enemy, HP, RNG, gold, item or route field is edited.',tail:'The last 64 actual rolls are retained, including death attempts. Recovery/addition is derived from adjacent observed enemy HP/shield and the settled roll fields. A retry has no preceding comparison.'},replay:replaySummary,terminal:{enemy:terminal.enemy,room:terminal.route[terminal.roomIndex],player:{hp:terminal.player.hp,gold:terminal.player.gold,level:terminal.player.level,talentPoints:terminal.player.talentPoints,talents:terminal.player.talents,inventory:terminal.player.items.length,equipped:terminal.player.items.filter(i=>E.equippedIds(terminal).includes(i.id)),stats:E.stats(terminal)},legalChoices:terminalChoices},naturalAttempts:replay.attempts,naturalLast64Rolls:tail,continuation:{retryOpening,finishReason:fights.length===12?'COMPLETED':s.phase==='dead'?'FIRST_FURTHER_DEATH':'DECISION_BUDGET_EXHAUSTED',floor:s.floor,phase:s.phase,newDeaths:s.counters.deaths-terminal.counters.deaths,rolls:s.counters.rolls-terminal.counters.rolls,completedBattles:fights.length,transactions,spent,spending,endingGold:s.player.gold,endingHp:s.player.hp,remainingTalentPoints:s.player.talentPoints,enemy:s.enemy,finalStateSha256:fingerprint(s),first30Actions:actions,fights,unfinishedBattle:fight,last64Rolls:continuationTail},limits:['A failed constrained policy is not proof of an engine-level continuation lock. The game legally supports retry and equipment changes; paid rooms cannot be opened from dead/combat.','The independent paid/balanced floor-one journeys for the same seed follow different earlier choices and RNG histories, so their success is not a same-state rescue result.','One post-hoc retry neither establishes an optimal rescue build nor changes the main fixed four-seed completion count.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,replay:report.replay,terminalEnemy:terminal.enemy.name,continuation:{...report.continuation,first30Actions:undefined,fights:undefined,last64Rolls:undefined,enemy:undefined,retryOpening:undefined}}));
