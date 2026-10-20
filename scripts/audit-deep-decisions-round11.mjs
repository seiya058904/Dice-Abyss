// Offline decision evidence. Never reads browser storage, contacts a network or
// edits a source file. Every gameplay mutation is a legal engine transition.
// node scripts/audit-deep-decisions-round11.mjs --source /path/to/project --output /tmp/decisions.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const source=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),output=resolve(arg('--output',''));
assert(process.argv.includes('--output'),'Pass an explicit output outside the source project.');
const rel=relative(source,output);assert(rel.startsWith('..'+sep)||isAbsolute(rel),'Output must be outside the source project.');
const seeds=arg('--seeds','7919,15838').split(',').map(Number),milestones=arg('--milestones','200,400').split(',').map(Number),windowBattles=Number(arg('--battles',6)),budgetFraction=Number(arg('--budget-fraction',.25));
assert(seeds.length&&seeds.every(n=>Number.isSafeInteger(n)&&n>0&&n<=0xffffffff));
assert(milestones.length&&milestones.every((n,i)=>Number.isSafeInteger(n)&&n>=80&&n<=400&&(!i||n>milestones[i-1])));
assert(Number.isSafeInteger(windowBattles)&&windowBattles>=2&&windowBattles<=12);assert(budgetFraction>0&&budgetFraction<=1);
const E=await import(pathToFileURL(resolve(source,'src/engine.js'))),S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const {TALENTS}=await import(pathToFileURL(resolve(source,'src/content.js'))),{eventChoices}=await import(pathToFileURL(resolve(source,'src/encounters.js')));
const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),stateHash=s=>digest({...s,runId:'normalized'});
const checkedFiles=['src/engine.js','src/equipment.js','src/encounters.js','src/deep-rules.js','src/deep-content.js','src/content.js','src/equipment-content.js','src/rarity.js','src/route-weights.js','src/storage.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(checkedFiles.map(async path=>[path,digest(await readFile(resolve(source,path),'utf8'))]))),sourceHashes=await hashes();
const priorities={balanced:['resonance','critical','vitality','high','guard','pair','recovery','six','slayer','sum','leech','smith','luck','attune'],resonance:['deepEcho','tripleBlade','chorusMend','resonance','pair','triple','quartet','choir','attune','echo','critical','vitality','guard','recovery','six','luck'],pursuit:['critical','pursuit','spark','keen','crush','opener','dawnCrit','critAegis','echo','resonance','high','vitality','guard','recovery','luck','attune'],bulwark:['emberGuard','phaseShelter','lastResolve','critAegis','guard','vitality','mercy','recovery','leech','critical','resonance','high','pair','luck','attune']};
let legalTransactions=0,roundTrips=0,comparisonChecks=0;
function act(s,action){assert(E.canAct(s,action),`Illegal ${JSON.stringify(action)} at ${s.floor}/${s.phase}`);const after=E.transition(s,action);assert.notStrictEqual(after,s);legalTransactions++;return after;}
function roundTrip(s){assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);roundTrips++;}
function allocate(s,build='balanced',focused=false){
 const keys=focused?[...priorities[build],'power']:[...priorities[build],...Object.keys(TALENTS).filter(k=>!['power','vitality'].includes(k)),'power'];
 for(const id of new Set(keys)){
  if((TALENTS[id].floor||1)>s.floor)continue;
  const limit=id==='vitality'?(build==='bulwark'?20:5):TALENTS[id].cap,count=Math.min(s.player.talentPoints,limit-E.talent(s,id));
  if(count>0){const before=s;s=act(s,{type:'talent',id,count});assert.equal(s.rng,before.rng);assert.equal(s.player.hp,before.player.hp);}
 }
 assert.equal(s.player.talentPoints,0,'Policy must invest all available points.');return s;
}
const comparisonViews=new WeakMap();
function compare(s,item,slot){
 let view=comparisonViews.get(s);if(!view){const equipped=new Set(E.equippedIds(s));view={...s,player:{...s.player,items:s.player.items.filter(i=>equipped.has(i.id))}};comparisonViews.set(s,view);}
 const result=E.compareEquipment(view,item,slot);if(comparisonChecks<128){assert.deepEqual(result,E.compareEquipment(s,item,slot));comparisonChecks++;}return result;
}
function autoEquip(s){
 for(const slot of ['weapon','armor','relic']){
  const candidates=s.player.items.filter(i=>i.slot===slot).map(item=>({item,delta:compare(s,item).delta})).toSorted((a,b)=>b.delta-a.delta);
  for(const {item}of candidates.slice(0,slot==='relic'?3:1))if(!E.equippedIds(s).includes(item.id)&&compare(s,item).delta>0)s=act(s,{type:'equip',id:item.id});
 }return s;
}
function materialPool(s,slot){
 const ids=new Set(E.equippedIds(s)),targets=s.player.items.filter(i=>ids.has(i.id)&&i.slot===slot).map(i=>i.id),min=Math.min(...s.player.items.filter(i=>targets.includes(i.id)).map(i=>i.rarity));
 return {targets,materials:s.player.items.filter(i=>i.slot===slot&&!ids.has(i.id)&&!i.locked&&i.id!==s.loot?.item?.id&&i.rarity<3&&i.rarity<=min)};
}
function serviceKind(s){return ['merchant','blackmarket'].includes(s.phase)?'purchase':['forge','fusion'].includes(s.phase)?s.phase:s.phase==='event'&&s.event.key==='memorywell'&&s.event.status==='pending'?'respec':null;}
function captureJourney(seed){
 let s=E.newGame(seed),signature='',steps=0;const maxFloor=milestones.at(-1),captured=new Map(),samples=[],starts=s.counters.rolls;
 while(!(s.phase==='cleared'&&s.floor>=maxFloor)&&steps++<maxFloor*800){
  s=allocate(s);const next=s.player.items.map(i=>`${i.id}:${i.level}:${i.levelXp}:${i.enhance}`).join('|')+'/'+s.player.level+'/'+Object.values(s.player.talents).join(',');
  if(next!==signature)s=autoEquip(s);signature=next;
  if(steps%113===0)roundTrip(s);
  const milestone=milestones.find(n=>s.floor<=n),lower=milestone?Math.max(50,(milestones[milestones.indexOf(milestone)-1]||0)+1):Infinity,kind=serviceKind(s);
  // Keep the LAST naturally reached instance before each checkpoint. No seed is
  // changed to obtain a preferred outcome; unavailable services stay explicit.
  if(kind&&s.floor>=lower)captured.set(`${milestone}/${kind}`,structuredClone(s));
  switch(s.phase){
   case 'fate':s=act(s,{type:'fate'});break;
   case 'route':s=act(s,{type:'enter'});break;
   case 'combat':s=act(s,{type:'roll'});break;
   case 'chest':s=act(s,{type:'open'});break;
   case 'loot':s=act(s,{type:'next'});break;
   case 'gold':s=act(s,{type:'gold'});break;
   case 'merchant':case 'blackmarket':for(const offer of s.shop.filter(o=>o.item).toSorted((a,b)=>b.item.rarity-a.item.rarity))if(compare(s,offer.item).delta>5&&E.canAct(s,{type:'buy',id:offer.id}))s=act(s,{type:'buy',id:offer.id});if(s.player.hp<E.stats(s).maxHp*.5&&E.canAct(s,{type:'buy',id:'heal'}))s=act(s,{type:'buy',id:'heal'});s=act(s,{type:'next'});break;
   case 'forge':{const item=s.player.items.find(i=>i.id===s.player.equipped.weapon);if(item.enhance<9&&s.player.gold>E.forgeCost(s,item)+80)s=act(s,{type:'forge',id:item.id});s=act(s,{type:'next'});break;}
   case 'fusion':for(const slot of ['weapon','armor','relic']){const pool=materialPool(s,slot),materials=pool.materials.map(i=>i.id),action={type:'fuse',targets:pool.targets,materials};if(E.canAct(s,action))s=act(s,action);}s=act(s,{type:'next'});break;
   case 'altar':s=act(s,{type:'bless'});s=act(s,{type:'next'});break;
   case 'rest':s=act(s,{type:'rest'});s=act(s,{type:'next'});break;
   case 'event':if(s.event.status==='resolved')s=act(s,{type:'next'});else{const choice=eventChoices(s).find(o=>!o.disabled&&o.id!=='leave');s=act(s,{type:'event-choice',id:choice?.id||'leave',confirmed:!!choice?.confirm});}break;
   case 'dead':assert(s.counters.deaths<=20,'Natural journey exceeded bounded retries.');s=act(s,{type:'retry'});break;
   case 'cleared':s=act(s,{type:'descend'});break;
   default:throw Error(s.phase);
  }
 }
 roundTrip(s);assert(s.phase==='cleared'&&s.floor===maxFloor,'Natural journey did not finish.');
 for(const milestone of milestones)for(const kind of ['purchase','forge','fusion','respec']){
  const opening=captured.get(`${milestone}/${kind}`);samples.push(opening?auditDecision(seed,milestone,kind,opening):{seed,milestone,kind,status:'NOT_REACHED',rows:[]});
 }
 return {seed,floors:s.floor,deaths:s.counters.deaths,rolls:s.counters.rolls-starts,finalStateSha256:stateHash(s),samples};
}
const statKeys=['attack','maxHp','defense','luck','crit','follow','reduction','dodge','regen','barrier','pairWard','criticalWard','lowWard','phaseWard','resolveGuard','firstCritLuck','echoRelic','tripleStrike','pierce'];
const summaryStats=s=>{const st=E.stats(s);return Object.fromEntries(statKeys.map(k=>[k,st[k]]));};
function afterWindow(input){
 let s=input,fight=null,steps=0,minHp=s.player.hp,combatRolls=0,taken=0;const fights=[];
 while(fights.length<windowBattles&&s.phase!=='dead'&&steps++<3000){
  // All branches use exactly the same continuation policy: retain gear, put new
  // points in power, collect rewards, use free rest, decline every paid service.
  if(s.player.talentPoints){const count=Math.min(s.player.talentPoints,TALENTS.power.cap-E.talent(s,'power'));if(count>0)s=act(s,{type:'talent',id:'power',count});}
  switch(s.phase){
   case 'combat':fight??={floor:s.floor,room:s.route[s.roomIndex].type,wave:s.enemy.wave||1,enemy:structuredClone(s.enemy),openingRng:s.rng,openingHp:s.player.hp,openingWard:s.ward||0,turns:0,damageTaken:0,totalDamage:0,minimumHp:s.player.hp};s=act(s,{type:'roll'});fight.turns++;combatRolls++;fight.damageTaken+=s.lastRoll.retaliation;taken+=s.lastRoll.retaliation;fight.totalDamage+=s.lastRoll.total;fight.minimumHp=Math.min(fight.minimumHp,s.player.hp);if(!fight.firstRoll)fight.firstRoll=Object.fromEntries(['values','best','critical','follow','main','total','echoDamage','absorbed','hpDamage','retaliation','wardGain','dodged','killed'].map(key=>[key,s.lastRoll[key]]));if(s.phase!=='combat'){fights.push({...fight,won:s.phase==='chest',endingHp:s.player.hp,endingRng:s.rng});fight=null;}break;
   case 'chest':s=act(s,{type:'open'});break;
   case 'loot':case 'merchant':case 'blackmarket':case 'forge':case 'fusion':case 'altar':s=act(s,{type:'next'});break;
   case 'rest':if(E.canAct(s,{type:'rest'}))s=act(s,{type:'rest'});s=act(s,{type:'next'});break;
   case 'event':s=s.event.status==='resolved'?act(s,{type:'next'}):act(s,{type:'event-choice',id:'leave'});break;
   case 'gold':s=act(s,{type:'gold'});break;
   case 'cleared':s=act(s,{type:'descend'});break;
   case 'fate':s=act(s,{type:'fate'});break;
   case 'route':s=act(s,{type:'enter'});break;
   default:throw Error(s.phase);
  }
  minHp=Math.min(minHp,s.player.hp);
 }
 roundTrip(s);assert(s.phase==='dead'||fights.length===windowBattles,'Battle window exceeded bounded steps.');
 return {completedBattles:fights.length,survived:s.phase!=='dead',phase:s.phase,combatRolls,damageTaken:taken,minimumHp:minHp,endingHp:s.player.hp,endingGold:s.player.gold,endingRng:s.rng,finalStateSha256:stateHash(s),fights};
}
function auditDecision(seed,milestone,kind,input){
 const original=stateHash(input),budget=Math.floor(input.player.gold*budgetFraction),rows=[],excluded=[];
 roundTrip(input);
 function branch(id,price,actions,metadata={},build=null){
  if(price>budget){excluded.push({id,price,reason:'above common spend ceiling'});return;}
  let s=S.decodeSave(S.encodeSave(input));roundTrips++;assert.deepEqual(s,input);
  for(const action of actions)s=act(s,action);
  if(build)s=allocate(s,build,true);
  const actualPaid=input.player.gold-s.player.gold;assert.equal(actualPaid,price);assert(actualPaid<=budget);
  if(kind==='respec')assert.deepEqual(s.player.items,input.player.items,'Respec cannot change equipment');
  const opening={gold:s.player.gold,hp:s.player.hp,ward:s.ward||0,stats:summaryStats(s),talents:s.player.talents,remainingPoints:s.player.talentPoints,rng:s.rng};
  const forgeFace=['forge','fusion'].includes(kind)&&id!=='keep-gold'?s.lastForge.value:null;
  const outcome=afterWindow(s);rows.push({id,paid:price,budgetLeft:budget-price,...metadata,forgeFace,opening,...outcome});
 }
 branch('keep-gold',0,kind==='respec'?[{type:'event-choice',id:'leave'}]:[]);
 if(kind==='purchase')for(const offer of input.shop.filter(o=>o.item&&!o.sold)){
  const action={type:'buy',id:offer.id};if(!E.canAct(input,action)){excluded.push({id:offer.id,price:offer.price,reason:'engine unavailable'});continue;}
  const slot=E.equipSlot(input,offer.item),comparison=E.compareEquipment(input,offer.item,slot);
  branch(`buy-${offer.item.slot}`,offer.price,[action,{type:'equip',id:offer.item.id,slot}],{slot,item:{id:offer.item.id,catalogId:offer.item.catalogId,name:offer.item.name,rarity:offer.item.rarity,level:offer.item.level},shownComparison:{label:comparison.label,delta:comparison.delta,conditional:comparison.conditional}});
 }
 if(kind==='forge')for(const [slot,id]of Object.entries(input.player.equipped)){
  if(!id)continue;const action={type:'forge',id},item=input.player.items.find(i=>i.id===id),price=E.forgeCost(input,item);
  if(E.canAct(input,action))branch(`forge-${slot}`,price,[action],{slot,item:{id,name:item.name,level:item.level,rarity:item.rarity,enhance:item.enhance}});else excluded.push({id:`forge-${slot}`,price,reason:'engine unavailable'});
 }
 if(kind==='fusion')for(const slot of ['weapon','armor','relic']){
  const pool=materialPool(input,slot);let materials=pool.materials.slice(0,8),quote=null;
  while(materials.length){quote=E.fusionPreview(input,pool.targets,materials.map(i=>i.id));if(quote&&quote.cost<=budget)break;materials.pop();}
  if(!materials.length||!quote){excluded.push({id:`fuse-${slot}`,reason:'no legal protected-safe bundle inside budget'});continue;}
  const ids=materials.map(i=>i.id);branch(`fuse-${slot}`,quote.cost,[{type:'fuse',targets:pool.targets,materials:ids}],{slot,targetIds:pool.targets,materialIds:ids,materialRarities:materials.map(i=>i.rarity),sacrificedSalvageGold:materials.reduce((n,i)=>n+Math.max(1,Math.floor(E.itemValue(i)*.15)),0)});
 }
 if(kind==='respec')for(const build of Object.keys(priorities)){
  const action={type:'event-choice',id:'reset',confirmed:true};if(E.canAct(input,action))branch(`reset-${build}`,input.event.costGold,[action],{build,allocation:'focused then all remaining points in power'},build);else excluded.push({id:`reset-${build}`,price:input.event.costGold,reason:'engine unavailable'});
 }
 assert.equal(stateHash(input),original,'Forks must never change the natural initial state.');
 const first=rows[0].fights[0];for(const row of rows){row.firstEnemyMatchesKeep=!!first&&digest(row.fights[0]?.enemy)===digest(first.enemy);row.firstCombatRngMatchesKeep=!!first&&row.fights[0]?.openingRng===first.openingRng;}
 const paidRows=rows.filter(row=>row.paid>0);if(['purchase','respec'].includes(kind))for(const row of paidRows){assert(row.firstEnemyMatchesKeep);assert(row.firstCombatRngMatchesKeep);}
 if(['forge','fusion'].includes(kind)&&paidRows.length>1)for(const row of paidRows.slice(1)){assert.equal(row.forgeFace,paidRows[0].forgeFace);assert.deepEqual(row.fights[0].enemy,paidRows[0].fights[0].enemy);assert.equal(row.fights[0].openingRng,paidRows[0].fights[0].openingRng);}
 // Preserve complete identity hashes, the opening roll and numeric outcomes,
 // without repeating long enemy lore in every branch of the shipped evidence.
 for(const row of rows)for(const fight of row.fights){const enemy=fight.enemy;fight.enemy={sha256:digest(enemy),...Object.fromEntries(['name','type','mechanic','trait','variant','hp','maxHp','attack','shield','maxShield','turns','wave','combatRules','stage'].filter(key=>enemy[key]!==undefined).map(key=>[key,enemy[key]]))};}
 return {seed,milestone,kind,status:'MEASURED',actualFloor:input.floor,roomIndex:input.roomIndex,phase:input.phase,openingStateSha256:original,initialGold:input.player.gold,spendCeiling:budget,initialHp:input.player.hp,initialStats:summaryStats(input),openingUnspentPoints:input.player.talentPoints,initialInventoryCount:input.player.items.length,rows,excluded};
}
const started=performance.now(),journeys=[];
for(const seed of seeds){const row=captureJourney(seed);journeys.push(row);console.log(JSON.stringify({seed,floors:row.floors,deaths:row.deaths,rolls:row.rolls,samples:row.samples.filter(x=>x.status==='MEASURED').length,branches:row.samples.reduce((n,x)=>n+x.rows.length,0)}));}
assert.deepEqual(await hashes(),sourceHashes,'Source files changed during the audit.');
const samples=journeys.flatMap(j=>j.samples),report={audit:'round11-deep-same-start-decisions',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,scriptSha256:digest(await readFile(fileURLToPath(import.meta.url),'utf8')),environment:{node:process.version,platform:process.platform,arch:process.arch},sourceHashes,sourceStable:true,seeds,milestones,windowBattles,budgetFraction,method:{capture:'Two natural floor-one journeys; retain the last reached purchase/forge/fusion/memorywell before each checkpoint, after complete available balanced allocation. Every capture records its actual floor. A missing encounter is NOT_REACHED, never synthesized.',budget:'Alternatives within EACH captured encounter begin with identical complete state and held gold. Each may spend at most the common fraction of that balance. Actual payments differ and unused budget stays in the player wallet. Different service captures are not same-state alternatives.',naturalPolicy:'Expected-improvement equipment/shop choices; conservative weapon forge below +9; all safe low-rarity fusion; first enabled adventurous event; complete balanced finite talent priorities then power.',continuation:'Exactly the next configured number of combat attempts, or first death. Keep chosen equipment; put newly earned points in power; open boxes; collect gold; use free rest; otherwise decline events and skip services. No further coins are spent.',fusion:'Up to first eight unlocked, unequipped, non-loot materials of rarity below legendary and no higher than any target; shorten bundle to fit the common spend ceiling. No protected/high-rarity consumption.',rng:'Buy/equip/reset do not draw RNG and all such branches assert equal first enemy and combat-opening RNG to keep-gold. Forge/fusion spend one real die; their paid branches assert the same face and first battle start, while keep-gold retains that RNG draw. Later kill timing, luck and routes may diverge; this is the full legal decision effect, not an isolated stat effect.',hash:'Only runId is normalized in state fingerprints. No gameplay, log, reward or XP field is removed. The script plus seeds, policy and capture rule reproduces each initial state without shipping large save dumps.'},validation:{legalTransactions,roundTrips,comparisonChecks,captured:samples.filter(x=>x.status==='MEASURED').length,notReached:samples.filter(x=>x.status==='NOT_REACHED').map(({seed,milestone,kind})=>({seed,milestone,kind})),branches:samples.reduce((n,x)=>n+x.rows.length,0),battleWindowsCompleted:samples.flatMap(x=>x.rows).filter(x=>x.completedBattles===windowBattles).length},journeys,durationSeconds:(performance.now()-started)/1000,limitations:['Fixed offline policies and two seeds are not human win rates or optimal choices.','A larger damage sum can merely mean more overkill; use turns, actual HP loss and death together.','The reported damageTaken is gross committed retaliation before subsequent healing, not opening HP minus ending HP.','New loot, level-up healing, later RNG and route effects remain part of the legal continuation; no outcome is attributed solely to one stat.','No balance, price, rarity, ID, save schema or production rule is changed by this script.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...report.validation,durationSeconds:report.durationSeconds}));
