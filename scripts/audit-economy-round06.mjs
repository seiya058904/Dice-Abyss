// Offline policy evidence only. All progress, equipment changes and purchases use
// legal engine transitions from a fresh floor-one game. Never consumes user saves.
// Round06 extends the preserved spending-policy audit with explicit pursuit priority,
// gross-payment reconciliation and legal same-start paid-respec comparisons.
// Example: node scripts/audit-economy-round06.mjs --floors 200 --seeds 7919,15838,23757 --builds balanced,resonance,pursuit,bulwark --policies conservative,duplicate-materials --output /tmp/economy.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const arg=(key,fallback)=>{const index=process.argv.indexOf(key);return index<0?fallback:process.argv[index+1];};
const source=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),output=resolve(arg('--output',''));
assert(process.argv.includes('--output'),'Pass an explicit output outside the source project.');
const relativeOutput=relative(source,output);
assert(relativeOutput==='..'||relativeOutput.startsWith('..'+sep)||isAbsolute(relativeOutput),'Audit evidence must be written outside the source project.');
const floors=Number(arg('--floors',200)),seeds=arg('--seeds','7919,15838').split(',').map(Number),policies=arg('--policies','conservative,forge-all,duplicate-materials').split(','),builds=arg('--builds','balanced').split(',');
assert(Number.isSafeInteger(floors)&&floors>=10&&floors<=400);assert(seeds.length&&seeds.every(seed=>Number.isSafeInteger(seed)&&seed>0&&seed<=0xffffffff));
assert(policies.length&&policies.every(policy=>['conservative','forge-all','duplicate-materials'].includes(policy)));assert(builds.length&&builds.every(build=>['balanced','resonance','pursuit','bulwark','luck'].includes(build)));
const E=await import(pathToFileURL(resolve(source,'src/engine.js'))),S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const {TALENTS,RARITIES}=await import(pathToFileURL(resolve(source,'src/content.js'))),{ABILITY_DEFS}=await import(pathToFileURL(resolve(source,'src/deep-content.js'))),{eventChoices}=await import(pathToFileURL(resolve(source,'src/encounters.js'))),{fusionMaterialXp}=await import(pathToFileURL(resolve(source,'src/equipment.js')));
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex'),distribution=values=>{if(!values.length)return null;const sorted=values.toSorted((a,b)=>a-b),at=q=>sorted[Math.floor((sorted.length-1)*q)];return {n:sorted.length,min:sorted[0],median:at(.5),p95:at(.95),max:sorted.at(-1),mean:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(4)};};
const checkedFiles=['src/engine.js','src/encounters.js','src/equipment.js','src/deep-rules.js','src/equipment-content.js','src/deep-content.js','src/rarity.js','src/route-weights.js','src/content.js','scripts/simulate.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(checkedFiles.map(async file=>[file,digest(await readFile(resolve(source,file),'utf8'))]))),sourceHashes=await hashes();
const priorities={
 balanced:['resonance','critical','vitality','high','guard','pair','recovery','six','slayer','sum','leech','smith','luck','attune'],
 luck:['luck','attune','resonance','critical','vitality','high','pair','guard','recovery','omen','mercy','jackpot','spark'],
 resonance:['deepEcho','tripleBlade','chorusMend','resonance','pair','triple','quartet','choir','attune','echo','critical','vitality','guard','recovery','six','luck'],
 pursuit:['critical','pursuit','spark','keen','crush','opener','dawnCrit','critAegis','echo','resonance','high','vitality','guard','recovery','luck','attune'],
 bulwark:['emberGuard','phaseShelter','lastResolve','critAegis','guard','vitality','mercy','recovery','leech','critical','resonance','high','pair','luck','attune'],
};
let verifiedComparisons=0,comparisonCalls=0;const comparisonViews=new WeakMap();
function compare(s,item,slot){
 let view=comparisonViews.get(s);if(!view){const ids=new Set(E.equippedIds(s));view={...s,player:{...s.player,items:s.player.items.filter(item=>ids.has(item.id))}};comparisonViews.set(s,view);}const result=E.compareEquipment(view,item,slot);comparisonCalls++;
 if(verifiedComparisons<512){assert.deepEqual(result,E.compareEquipment(s,item,slot));verifiedComparisons++;}return result;
}
function allocate(input,build,mode='complete'){
 let s=input;
 for(const id of new Set([...priorities[build],...(mode==='complete'?Object.keys(TALENTS).filter(key=>!['power','vitality'].includes(key)):[]),'power'])){
  const cap=id==='vitality'?(build==='bulwark'?20:5):TALENTS[id].cap,count=Math.min(s.player.talentPoints,cap-E.talent(s,id));if(count<=0||(TALENTS[id].floor||1)>s.floor)continue;
  while(count>0&&s.player.talentPoints&&E.talent(s,id)<cap){const n=E.talentPreview?Math.min(s.player.talentPoints,cap-E.talent(s,id)):1,before=s;s=E.transition(s,{type:'talent',id,...(E.talentPreview?{count:n}:{})});assert.notStrictEqual(s,before);assert.equal(s.rng,before.rng);assert.equal(s.player.hp,before.player.hp);}
  if(!s.player.talentPoints)break;
 }
 return s;
}
function equip(input){
 let s=input;
 for(const slot of ['weapon','armor','relic']){
  const candidates=s.player.items.filter(item=>item.slot===slot).map(item=>({item,delta:compare(s,item).delta})).toSorted((a,b)=>b.delta-a.delta);
  for(const {item}of candidates.slice(0,slot==='relic'?3:1))if(!E.equippedIds(s).includes(item.id)&&compare(s,item).delta>0)s=E.transition(s,{type:'equip',id:item.id});
 }
 return s;
}
function materialPool(s,slot,protectedDuplicates=false){
 const equipped=new Set(E.equippedIds(s)),targets=s.player.items.filter(item=>equipped.has(item.id)&&item.slot===slot).map(item=>item.id),minimum=Math.min(...s.player.items.filter(item=>targets.includes(item.id)).map(item=>item.rarity)),bestByCatalog=new Map();
 for(const item of s.player.items){const old=bestByCatalog.get(item.catalogId);if(!old||E.itemValue(item)>E.itemValue(old)||(E.itemValue(item)===E.itemValue(old)&&equipped.has(item.id)))bestByCatalog.set(item.catalogId,item);}
 const materials=s.player.items.filter(item=>{
  if(item.slot!==slot||equipped.has(item.id)||item.locked||item.id===s.loot?.item?.id||item.rarity>minimum)return false;
  if(item.rarity<3)return true;
  const best=bestByCatalog.get(item.catalogId);return protectedDuplicates&&best&&best.id!==item.id&&E.itemValue(best)>=E.itemValue(item);
 });
 return {targets,materials};
}
function forgeCounterfactual(s){
 const initialHash=digest({...s,runId:'normalized'}),rows=[];let firstEnemy=null,firstRng=null,face=null;
 for(const [slot,id]of Object.entries(s.player.equipped)){
  if(!id||!E.canAct(s,{type:'forge',id}))continue;
  const before=E.stats(s),item=s.player.items.find(item=>item.id===id),cost=E.forgeCost(s,item);let branch=E.transition(s,{type:'forge',id}),after=E.stats(branch);
  if(face!==null)assert.equal(branch.lastForge.value,face);face=branch.lastForge.value;
  branch=E.transition(branch,{type:'next'});assert.equal(branch.phase,'combat','service is followed by the third battle');
  if(firstEnemy){assert.deepEqual(branch.enemy,firstEnemy);assert.equal(branch.rng,firstRng);}else{firstEnemy=structuredClone(branch.enemy);firstRng=branch.rng;}
  let turns=0,totalDamage=0,taken=0,firstDamage=null;
  while(branch.phase==='combat'&&turns<100){branch=E.transition(branch,{type:'roll'});turns++;totalDamage+=branch.lastRoll.total;taken+=branch.lastRoll.retaliation;firstDamage??=branch.lastRoll.total;}
  assert(S.validateSave(branch));rows.push({slot,id,cost,forgeFace:face,beforeEnhance:item.enhance,afterEnhance:branch.player.items.find(item=>item.id===id).enhance,playerAttackBefore:before.attack,playerAttackAfter:after.attack,maxHpBefore:before.maxHp,maxHpAfter:after.maxHp,defenseBefore:before.defense,defenseAfter:after.defense,startingHp:s.player.hp,turns,firstDamage,totalDamage,damageTaken:taken,killed:branch.phase==='chest'});
 }
 assert.equal(digest({...s,runId:'normalized'}),initialHash);return {floor:s.floor,openingStateSha256:initialHash,enemy:firstEnemy?.name,enemyHp:firstEnemy?.maxHp,sharedCombatOpeningRng:firstRng,rows,method:'Same naturally reached forge state. Each branch legally forges exactly one equipped item, then enters the same next battle. All branches observe the same forge face and identical enemy and opening combat RNG; only the selected slot and cost differ. Roll-only replay stops at victory/death/100 rolls. Later RNG can diverge if damage changes kill timing.'};
}
function fusionOpportunity(s){
 const rows=[];
 for(const slot of ['weapon','armor','relic']){
  const pool=materialPool(s,slot,true),high=pool.materials.filter(item=>item.rarity>=3),low=pool.materials.filter(item=>item.rarity<3);if(!high.length)continue;
  for(const [kind,materials]of [['safe-low',low],['duplicate-high',high],['combined',pool.materials]]){
   if(!materials.length)continue;const preview=E.fusionPreview(s,pool.targets,materials.map(item=>item.id),kind!=='safe-low');if(!preview)continue;
   rows.push({slot,kind,targets:pool.targets,materials:materials.length,rarities:RARITIES.map((rarity,index)=>({name:rarity.name,count:materials.filter(item=>item.rarity===index).length})).filter(row=>row.count),cost:preview.cost,affordable:s.player.gold>=preview.cost,rawMaterialXp:materials.reduce((total,item)=>total+fusionMaterialXp(item),0),outcomes:preview.outcomes.map(outcome=>({face:outcome.value,totalXp:outcome.total,levels:outcome.upgrades.map(upgrade=>upgrade.levels),itemStats:outcome.upgrades.map(upgrade=>({before:upgrade.before.stats,after:upgrade.after.stats}))})),sacrificedSalvageGold:materials.reduce((total,item)=>total+Math.max(1,Math.floor(E.itemValue(item)*.15)),0),preservation:'Every consumed legendary-or-higher item has an equal-or-better item with the same catalog ID retained. Locked/equipped/current-loot items and the strongest representative of each high-rarity catalog ID are excluded.'});
  }
 }
 return rows.length?{floor:s.floor,openingStateSha256:digest({...s,runId:'normalized'}),gold:s.player.gold,rows}:null;
}
function run(seed,policy,build){
 let s=E.newGame(seed),steps=0,signature='',fight=null;const spending={shop:0,forge:0,fusion:0,event:0},forgeSlots={weapon:0,armor:0,relic:0,relic2:0,relic3:0},forgeGold={...forgeSlots},materialsByRarity=Array(8).fill(0),triggers=Object.fromEntries(Object.keys(ABILITY_DEFS).map(key=>[key,0]));
 const fights=[],milestones=[],forgeExamples=[],fusionExamples=[],respecExamples=[];
 const cash={initialGold:s.player.gold,grossPaid:0,grossReceipts:0,netDecreases:0,netIncreases:0,byAction:{},byEvent:{}};let fusions=0,forges=0,buys=0,totalXpFused=0,sharedGiftDecisions=0;
 const apply=action=>{assert(E.canAct(s,action),`rejected policy action ${JSON.stringify(action)} in ${s.phase}`);const before=s,quotedPayment=paymentQuote(s,action);s=E.transition(s,action);assert.notStrictEqual(s,before);recordPayment(cash,before,s,action,quotedPayment);return before;};
 const stable=()=>{assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);};
 while(!(s.phase==='cleared'&&s.floor>=floors)&&steps++<floors*800){
  s=allocate(s,build);
  const nextSignature=s.player.items.map(item=>`${item.id}:${item.level}:${item.levelXp}:${item.enhance}`).join('|')+'/'+s.player.level+'/'+Object.values(s.player.talents).join(',');
  if(nextSignature!==signature)s=equip(s);signature=nextSignature;
  if(steps%113===0)stable();
  switch(s.phase){
   case 'fate':apply({type:'fate'});break;
   case 'route':apply({type:'enter'});break;
   case 'combat':{
    fight??={floor:s.floor,name:s.enemy.name,type:s.enemy.type,mechanic:s.enemy.mechanic||null,turns:0,damageTaken:0,totalDamage:0,openingHp:s.player.hp,maxHp:E.stats(s).maxHp,unspent:s.player.talentPoints};
    const before=s,st=E.stats(s);apply({type:'roll'});fight.turns++;fight.damageTaken+=s.lastRoll.retaliation;fight.totalDamage+=s.lastRoll.total;
    for(const [key,definition]of Object.entries(ABILITY_DEFS))if(s.lastRoll.mechanics.some(note=>note.startsWith(definition.name+' · 已触发')))triggers[key]++;
    // These four are resolved outside abilityRoll's uniform "已触发" log path.
    // Read the actual committed face/phase/result and untouched pre-roll state.
    if(st.phaseWard>0&&s.lastRoll.phaseChanged)triggers.phaseWard++;
    if(st.firstCritLuck>0&&s.lastRoll.critical&&!before.enemy.firstCritUsed)triggers.firstCritLuck++;
    if(st.eliteLuck>0&&s.lastRoll.killed&&['elite','boss'].includes(before.enemy.type))triggers.eliteLuck++;
    if(st.gildedSix>0&&s.lastRoll.killed&&s.lastRoll.values.filter(value=>value===6).length>=2)triggers.gildedSix++;
    if(s.phase!=='combat'){fight.killed=s.phase==='chest';fights.push(fight);fight=null;}break;
   }
   case 'chest':apply({type:'open'});break;
   case 'loot':apply({type:'next'});break;
   case 'gold':apply({type:'gold'});break;
   case 'merchant':case 'blackmarket':{
    const gold=s.player.gold;for(const offer of s.shop.filter(offer=>offer.item).toSorted((a,b)=>b.item.rarity-a.item.rarity))if(compare(s,offer.item).delta>5&&E.canAct(s,{type:'buy',id:offer.id})){apply({type:'buy',id:offer.id});buys++;}
    if(s.player.hp<E.stats(s).maxHp*.5&&E.canAct(s,{type:'buy',id:'heal'}))apply({type:'buy',id:'heal'});spending.shop+=gold-s.player.gold;apply({type:'next'});break;
   }
   case 'forge':{
    if(policy==='conservative'&&build==='balanced'&&[10,50,140].some(floor=>s.floor>=floor&&!forgeExamples.some(example=>example.threshold===floor))){const threshold=[10,50,140].filter(floor=>s.floor>=floor&&!forgeExamples.some(example=>example.threshold===floor))[0];forgeExamples.push({threshold,...forgeCounterfactual(s)});}
    const gold=s.player.gold,reserve=Math.max(80,Math.floor(gold*.2));let presses=0;
    while(presses<100){
     const candidates=Object.entries(s.player.equipped).filter(([,id])=>id).map(([slot,id])=>({slot,item:s.player.items.find(item=>item.id===id)})).filter(({slot,item})=>policy==='conservative'?slot==='weapon'&&item.enhance<9&&s.player.gold>E.forgeCost(s,item)+80:item.enhance<20&&s.player.gold-E.forgeCost(s,item)>=reserve).toSorted((a,b)=>a.item.enhance-b.item.enhance||E.forgeCost(s,a.item)-E.forgeCost(s,b.item));
     if(!candidates.length)break;const {slot,item}=candidates[0],cost=E.forgeCost(s,item);apply({type:'forge',id:item.id});forgeSlots[slot]++;forgeGold[slot]+=cost;forges++;presses++;
     if(policy==='conservative')break;
    }
    spending.forge+=gold-s.player.gold;apply({type:'next'});break;
   }
   case 'fusion':{
    if(policy==='conservative'&&build==='balanced'&&s.floor>=80&&fusionExamples.length<2){const example=fusionOpportunity(s);if(example)fusionExamples.push(example);}
    const gold=s.player.gold,reserve=policy==='conservative'?0:Math.max(80,Math.floor(gold*.2));
    for(const slot of ['weapon','armor','relic']){
     const {targets,materials}=materialPool(s,slot,policy==='duplicate-materials');let selected=materials,preview=E.fusionPreview(s,targets,selected.map(item=>item.id),policy==='duplicate-materials');
     if(policy!=='conservative')while(preview&&s.player.gold-preview.cost<reserve&&selected.length){selected=selected.slice(0,-1);preview=E.fusionPreview(s,targets,selected.map(item=>item.id),policy==='duplicate-materials');}
     if(preview&&s.player.gold>=preview.cost){for(const item of selected)materialsByRarity[item.rarity]++;apply({type:'fuse',targets,materials:selected.map(item=>item.id),allowProtected:policy==='duplicate-materials'});totalXpFused+=s.lastForge.gain;fusions++;}
    }
    spending.fusion+=gold-s.player.gold;apply({type:'next'});break;
   }
   case 'altar':apply({type:'bless'});apply({type:'next'});break;
   case 'rest':apply({type:'rest'});apply({type:'next'});break;
   case 'event':{
    if(s.event.status==='resolved'){apply({type:'next'});break;}
    if(policy==='conservative'&&build==='balanced'&&s.event.key==='memorywell'&&E.canAct(s,{type:'event-choice',id:'reset',confirmed:true})){
     const threshold=[80,140,200].find(n=>s.floor>=n&&!respecExamples.some(row=>row.threshold===n));
     if(threshold!==undefined)respecExamples.push({threshold,...respecCounterfactual(s)});
    }
    const choices=eventChoices(s).filter(choice=>!choice.disabled),choice=choices.find(choice=>choice.id!=='leave'),gold=s.player.gold,key=s.event.key;apply({type:'event-choice',id:choice?.id||'leave',confirmed:!!choice?.confirm});spending.event+=Math.max(0,gold-s.player.gold);if(['offering','starlibrary'].includes(key)&&s.event.choice!=='leave')sharedGiftDecisions++;break;
   }
   case 'dead':if(s.counters.deaths>20)return finish();apply({type:'retry'});break;
   case 'cleared':checkpoint();apply({type:'descend'});break;
   default:throw Error(`unknown phase ${s.phase}`);
  }
 }
 checkpoint();return finish();
 function checkpoint(){if([10,30,50,80,100,140,200,300,400].includes(s.floor)&&!milestones.some(row=>row.floor===s.floor)){const st=E.stats(s);milestones.push({floor:s.floor,gold:s.player.gold,level:s.player.level,attack:st.attack,maxHp:st.maxHp,defense:st.defense,luck:st.luck,unspentTalentPoints:s.player.talentPoints,spentTalentPoints:Object.values(s.player.talents).reduce((a,b)=>a+b,0),spending:{...spending}});}}
 function finish(){
  stable();
  assert.equal(cash.initialGold+cash.grossReceipts-cash.grossPaid,s.player.gold,'gross cash ledger must reconcile');
  assert.equal(cash.initialGold+cash.netIncreases-cash.netDecreases,s.player.gold,'net cash ledger must reconcile');
  assert.equal(Object.values(spending).reduce((a,b)=>a+b,0),cash.netDecreases,'legacy net spending must agree with transaction ledger');
  const equipped=new Set(E.equippedIds(s)),bosses=fights.filter(fight=>fight.type==='boss');
  return {seed,policy,build,allocationMode:'complete',cashLedger:{...cash,finalGold:s.player.gold,reconciled:true},floors:s.floor,completed:s.phase==='cleared'&&s.floor>=floors,phase:s.phase,deaths:s.counters.deaths,rolls:s.counters.rolls,level:s.player.level,gold:s.player.gold,spending,spent:Object.values(spending).reduce((a,b)=>a+b,0),forges,forgeSlots,forgeGold,buys,fusions,totalXpFused,consumedMaterialRarities:RARITIES.map((rarity,index)=>({name:rarity.name,count:materialsByRarity[index]})),spareRarities:RARITIES.map((rarity,index)=>({name:rarity.name,count:s.player.items.filter(item=>!equipped.has(item.id)&&item.rarity===index).length})),inventoryCount:s.player.items.length,equipped:s.player.items.filter(item=>equipped.has(item.id)).map(item=>({id:item.id,slot:item.slot,catalogId:item.catalogId,rarity:RARITIES[item.rarity].name,level:item.level,levelXp:item.levelXp,enhance:item.enhance,stats:E.itemStats(item)})),talentPoints:s.player.talentPoints,talents:s.player.talents,abilityTriggers:triggers,bossRounds:distribution(bosses.map(fight=>fight.turns)),lateBossRounds:distribution(bosses.filter(fight=>fight.floor>floors-50).map(fight=>fight.turns)),bossDamageTaken:distribution(bosses.map(fight=>fight.damageTaken)),lateBossDamageTaken:distribution(bosses.filter(fight=>fight.floor>floors-50).map(fight=>fight.damageTaken)),longest:fights.toSorted((a,b)=>b.turns-a.turns).slice(0,5),milestones,forgeExamples,fusionExamples,respecExamples,encounterTraceSha256:digest(fights),finalStateSha256:digest({...s,runId:'normalized'}),saveRoundTrip:true,sharedGiftDecisions};
 }
}

// Quotes mirror the already-read transaction's actual structured fields. They are
// independent of UI text and do not draw RNG, mutate a state or grant resources.
function paymentQuote(s,action){
 if(action.type==='buy')return s.shop.find(offer=>offer.id===action.id).price;
 if(action.type==='forge')return E.forgeCost(s,s.player.items.find(item=>item.id===action.id));
 if(action.type==='fuse')return E.fusionPreview(s,action.targets,action.materials,action.allowProtected).cost;
 if(action.type!=='event-choice'||action.id==='leave')return 0;
 const e=s.event;
 if(e.key==='prayer')return action.id==='luck'?e.costGold:0;
 if(e.key==='gambit')return e.costGold*(action.id==='safe'?2:1);
 if(e.key==='thread_of_dawn')return e.costGold*3;
 if(e.key==='starlibrary')return action.id==='insight'?Math.min(1e8,e.costGold*3):e.costGold;
 return ['traveler_lantern','memory_archive','echochamber','wardbank','abyssauction','wishingvault','memorywell'].includes(e.key)?e.costGold:0;
}
function recordPayment(ledger,before,after,action,paid){
 const delta=after.player.gold-before.player.gold,receipts=delta+paid;
 assert(Number.isSafeInteger(paid)&&paid>=0,'payment quote must be a nonnegative integer');
 assert(Number.isSafeInteger(receipts)&&receipts>=0,'unclassified debit or invalid gross receipt');
 const entry={actions:1,grossPaid:paid,grossReceipts:receipts,netDecreases:Math.max(0,-delta),netIncreases:Math.max(0,delta)};
 for(const key of ['grossPaid','grossReceipts','netDecreases','netIncreases'])ledger[key]+=entry[key];
 const add=(bag,key)=>{bag[key]??={actions:0,grossPaid:0,grossReceipts:0,netDecreases:0,netIncreases:0};for(const field of Object.keys(entry))bag[key][field]+=entry[field];};
 add(ledger.byAction,action.type);
 if(action.type==='event-choice')add(ledger.byEvent,`${before.event.key}/${action.id}`);
}
function respecCounterfactual(input){
 const openingHash=digest({...input,runId:'normalized'}),rows=[];
 const variants=[{id:'keep-current',build:'balanced',mode:'keep'},...['balanced','resonance','pursuit','bulwark','luck'].map(build=>({id:`complete-${build}`,build,mode:'complete'})),...['resonance','pursuit','bulwark'].map(build=>({id:`focused-${build}`,build,mode:'focused'}))];
 let enemy=null,rng=null,commonPaidHp=null;
 for(const variant of variants){
  const action={type:'event-choice',id:variant.mode==='keep'?'leave':'reset',confirmed:true};
  assert(E.canAct(input,action));
  let s=E.transition(input,action);
  assert.equal(s.rng,input.rng,'reset/leave must not consume RNG');
  assert.deepEqual(s.player.items,input.player.items,'reset/leave must preserve all gear');
  assert.deepEqual(s.player.equipped,input.player.equipped,'reset/leave must preserve equipped slots');
  const cost=input.player.gold-s.player.gold;
  if(variant.mode!=='keep'){
   assert.equal(cost,input.event.costGold);
   const hp=s.player.hp;s=allocate(s,variant.build,variant.mode);assert.equal(s.player.hp,hp,'allocation cannot heal');
   assert.equal(s.player.talentPoints,0,'all refunded points must be invested');
   if(commonPaidHp===null)commonPaidHp=s.player.hp;else assert.equal(s.player.hp,commonPaidHp,'paid variants have equal current HP');
  }else assert.equal(cost,0);
  const allocatedTalents=structuredClone(s.player.talents),openingStats=E.stats(s),invested=Object.values(allocatedTalents).reduce((a,b)=>a+b,0),currentHp=s.player.hp,unspent=s.player.talentPoints;
  s=E.transition(s,{type:'next'});assert.equal(s.phase,'combat','reachable next room must be a battle');
  if(enemy===null){enemy=structuredClone(s.enemy);rng=s.rng;}else{assert.deepEqual(s.enemy,enemy,'all variants must face the same enemy');assert.equal(s.rng,rng,'all variants must start combat at the same RNG');}
  const initialWard=s.ward||0;let turns=0,damageTaken=0,totalDamage=0,minimumHp=s.player.hp,firstRoll=null;
  while(s.phase==='combat'&&turns<100){
   s=E.transition(s,{type:'roll'});turns++;damageTaken+=s.lastRoll.retaliation;totalDamage+=s.lastRoll.total;minimumHp=Math.min(minimumHp,s.player.hp);firstRoll??=structuredClone(s.lastRoll);
  }
  assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);
  rows.push({...variant,cost,currentHp,initialWard,invested,unspent,talents:allocatedTalents,stats:openingStats,turns,damageTaken,totalDamage,minimumHp,killed:s.phase==='chest',phase:s.phase,firstRoll,finalRng:s.rng,finalStateSha256:digest({...s,runId:'normalized'}),saveRoundTrip:true});
 }
 assert.equal(digest({...input,runId:'normalized'}),openingHash,'counterfactual cannot mutate the natural run');
 return {floor:input.floor,roomIndex:input.roomIndex,openingStateSha256:openingHash,gold:input.player.gold,cost:input.event.costGold,openingCurrentHp:input.player.hp,refundable:Object.values(input.player.talents).reduce((a,b)=>a+b,0),sharedEnemy:enemy,sharedCombatOpeningRng:rng,rows,method:'Natural pending memorywell state. All paid branches legally reset at the same quoted cost, fully allocate their chosen policy and use unchanged equipment. The keep-current branch safely leaves at zero cost. All reach the identical next enemy and combat-opening RNG; roll-only replay is bounded to 100 turns. Paid reset can clip current HP; later combat outcomes can consume different RNG.'};
}

const started=performance.now(),rows=[];
for(const build of builds)for(const policy of policies)for(const seed of seeds){const before=performance.now(),row=run(seed,policy,build);rows.push(row);console.log(JSON.stringify({seed,policy,build,completed:row.completed,floors:row.floors,deaths:row.deaths,gold:row.gold,spent:row.spent,forges:row.forges,fusions:row.fusions,highMaterials:row.consumedMaterialRarities.slice(3).reduce((total,row)=>total+row.count,0),bossMax:row.bossRounds?.max,durationSeconds:(performance.now()-before)/1000}));}
assert.deepEqual(await hashes(),sourceHashes,'source changed while the audit was running');
const report={audit:'round06-economy',scriptSha256:digest(await readFile(fileURLToPath(import.meta.url),'utf8')),talentPriorities:priorities,legacyMetricNotes:{sharedGiftDecisions:'Inherited count of chosen offering/starlibrary actions, including starlibrary study. It is not the number of permanent offering points. The exact chosen event counts are separated in cashLedger.byEvent.'},talentMethod:'Natural journeys fully fill all currently available finite priorities, then invest the remaining points in power. The priority labels describe ordering, not mutually exclusive trees. Same-start respec branches additionally expose focused templates which omit unrelated finite nodes; every point is still legally allocated.',cashMethod:'Gross paid is computed from the legal action quote before its engine transaction. Gross receipts equal the committed gold change plus that payment. This captures immediate half-price refunds separately from net decreases and reconciles to final gold. No unobserved gold flows are inferred.',method:'Fresh natural journeys. Every build finishes its explicit available talent priorities before progressing, including after paid respec; no points or items are granted. Item changes use the same current expected-upgrade estimate, not a claim of optimal item choice. Default conservative spending follows the earlier weapon-below-9/safe-material behavior. Forge-all raises all five equipped slots toward +20, retaining at least 20% of gold held on room entry (minimum80). Duplicate-materials adds explicit protected fusion only for weaker duplicate catalog IDs, retaining their strongest representative. All events take the first enabled adventurous choice.',abilityTriggerMethod:'Counts the actual uniform abilityRoll trigger notes, plus phaseWard/firstCritLuck/eliteLuck/gildedSix conditions from each untouched pre-roll state and committed roll result. A fulfilled condition can hit a cap or be unnecessary in a one-shot battle; these are activation counts, not incremental realized utility.',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,environment:{node:process.version,platform:process.platform,arch:process.arch},sourceHashes,sourceStable:true,comparisonAdapter:{verified:verifiedComparisons,calls:comparisonCalls},floors,seeds,policies,builds,rows,durationSeconds:(performance.now()-started)/1000,limitations:['This is policy sensitivity, not a player win-rate estimate, optimal strategy or a balance patch.','Different spending consumes different real dice; later RNG, routes, drops, events and talent histories may diverge. Whole-run differences are not attributed to one isolated stat.','Only forge counterfactuals explicitly assert equal enemy and combat-opening RNG; later kill timing may still change random consumption.','The expected-upgrade chooser omits some conditional interactions and survival value on relics; duplicate retention is an intentionally conservative collection preference.','The legacy spending columns remain net decreases. The separate cash ledger records gross payments and refunds; those two columns must not be added together.','Same-start respec branches deliberately hold gear fixed and compare only the next reachable battle. They use equal initial RNG, but luck, crit, healing, kill timing and later random consumption can still differ.',
'Fully learned finite trees cause priority builds to converge at sufficient point totals; that is a limit of this audit policy, not proof that players must choose the same build.',
'No price, enemy statistic, equipment identity, drop probability, RNG algorithm or production automation was changed.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,journeys:rows.length,completed:rows.filter(row=>row.completed).length,totalFloors:rows.reduce((total,row)=>total+row.floors,0),durationSeconds:report.durationSeconds}));

// Preserve partial evidence while making an unfinished bounded audit fail its CLI gate.
if(rows.some(row=>!row.completed))process.exitCode=1;
