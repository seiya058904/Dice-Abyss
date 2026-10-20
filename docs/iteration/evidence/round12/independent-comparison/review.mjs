import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../../../../../',import.meta.url)));
const out=resolve(process.argv[3]||resolve(tmpdir(),'dice-abyss-independent-comparison-review.json'));
assert(out!==fileURLToPath(new URL('./current-review.json',import.meta.url)),'Write replays to a separate report; preserve the recorded review evidence');
const uri=file=>pathToFileURL(resolve(root,file)).href;
const E=await import(uri('src/engine.js')),S=await import(uri('src/storage.js')),Q=await import(uri('src/equipment.js')),C=await import(uri('src/encounters.js')),D=await import(uri('src/deep-rules.js')),H=await import(uri('src/equipment-comparison.js')),V=await import(uri('src/views.js'));
const {CATALOG_BY_ID}=await import(uri('src/equipment-content.js'));
const initialFile=new URL('./initial-equipment-comparison.js',import.meta.url),initialText=readFileSync(initialFile,'utf8');
// Resolve only module imports so the exact captured initial implementation can
// execute outside the package. Its expressions and condition text are intact.
const frozenSource=initialText.replace(/from '\.\/([^']+)'/g,(_,file)=>`from '${uri('src/'+file)}'`);
const I=await import('data:text/javascript;base64,'+Buffer.from(frozenSource).toString('base64'));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const report={scope:'Independent read-only formula/trigger review. Synthetic valid catalog-backed states; no natural-incidence, balance or hardware claim.',source:root,hashes:Object.fromEntries(['src/equipment-comparison.js','src/views.js','src/engine.js','src/deep-rules.js','src/encounters.js'].map(file=>[file,sha(readFileSync(resolve(root,file)))])),initialComparisonSha256:sha(initialText),captureNote:'The first source read found the 100-percent gold diagnostic and unscoped six-point total; the captured file was saved after the author corrected both. Captured-module results therefore verify fixes, rather than reproducing those earlier source observations.',harnessCorrection:'The first independent probe omitted an explicit relic replacement slot in two tests. Empty relic slots correctly caused the engine to add an item instead of removing the previous relic; corrected fixtures now pass slot relic to both the comparator and actual equip. The initial failed probe is retained separately and is not a product defect.',checks:[],findings:[],failures:[]};
const near=(a,b,label)=>assert(Math.abs(a-b)<1e-9,`${label}: ${a} vs ${b}`);
const row=(detail,key)=>detail.rows.find(value=>value.key===key);
function item(catalogId,id){const e=CATALOG_BY_ID.get(catalogId);assert(e,catalogId);return {id,catalogId,slot:e.slot,rarity:e.rarity,profile:e.profile,theme:e.theme,name:e.name,depth:140,level:80,levelXp:0,enhance:0,locked:false};}
function scene(oldId,newId){
 const s=E.newGame(71357);s.runId='independent-comparison-review';s.floor=140;s.player.level=80;s.player.gold=100000;s.fate=[3,4];s.phase='combat';
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({type,id:`f140r${i}`,quality:0,done:false}));
 s.player.items=[item('weapon-0-0-0','i1'),item('armor-0-0-0','i2'),item('relic-0-0-0','i3')];
 const entry=CATALOG_BY_ID.get(oldId),index=s.player.items.findIndex(x=>x.slot===entry.slot);s.player.items[index]=item(oldId,s.player.items[index].id);s.player.items.push(item(newId,'i4'));
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.nextId=5;s.player.hp=E.stats(s).maxHp;s.ward=0;
 s.enemy={name:'独立条件审计',note:'构造合法状态',label:'隔离触发',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1,turns:0,stage:2,combatRules:4};
 s.unknownReview={text:'完整保留 😀',nested:[{value:23}]};assert(S.validateSave(s));return s;
}
const requested=s=>s.player.items[3].slot==='relic'?'relic':undefined;
const next=s=>E.transition(s,{type:'equip',id:'i4',slot:requested(s)});
const inspect=s=>H.equipmentComparisonDetails(s,s.player.items[3],requested(s));
const check=(name,run)=>{try{const result=run();report.checks.push({name,status:'PASS',...result});}catch(error){report.failures.push({name,error:error.message,stack:error.stack});}};

check('actual RNG thresholds agree with the shown critical and follow chances',()=>{
 const s=scene('relic-7-0-7','relic-8-0-7');s.player.talents.keen=3;s.player.talents.echo=3;s.player.talents.spark=3;
 const details=inspect(s),rows=Object.fromEntries(details.rows.map(r=>[r.key,r]));let rolls=0;
 for(const side of ['before','after'])for(let seed=1;seed<=192;seed++){
  const start=side==='before'?structuredClone(s):next(s);start.rng=(seed*7919)>>>0;
  const probe=structuredClone(start),{values}=E.drawDice(probe,E.diceCount(probe)),best=Math.max(...values.map(v=>values.filter(x=>x===v).length));
  const critThreshold=rows[values.includes(6)?'sixCriticalChance':'criticalChance'][side],critical=E.random(probe)<critThreshold;
  const followKey=best>=2?(critical?'criticalFollowChance':'pairFollowChance'):'followChance',follow=E.random(probe)<rows[followKey][side];
  const actual=E.transition(start,{type:'roll'});assert.deepEqual(actual.lastRoll.values,values);assert.equal(actual.lastRoll.critical,critical);assert.equal(actual.lastRoll.follow,follow);rolls++;
 }
 return {realRolls:rolls,thresholdRows:['criticalChance','sixCriticalChance','followChance','pairFollowChance','criticalFollowChance']};
});

check('90-percent critical and 85-percent conditional-follow cap messages match actual random thresholds',()=>{
 let criticalRolls=0,cappedFollowRolls=0;
 for(const family of ['critical','follow']){
  const old=family==='critical'?'relic-7-0-7':'relic-2-0-7',candidate=family==='critical'?'relic-7-1-7':'relic-2-2-7';
  const s=scene(old,candidate);s.player.items.push(item(old,'i5'),item(old,'i6'));s.player.equipped.relic2='i5';s.player.equipped.relic3='i6';s.nextId=7;
  Object.assign(s.player.talents,{critical:5,keen:5,echo:5,spark:5});
  const details=inspect(s),key=family==='critical'?'criticalChance':'criticalFollowChance',limit=details.limits.find(row=>row.key===key);assert(limit,key+' limit');
  near(limit.cap,family==='critical'?.9:.85,key+' cap');
  for(const side of [s,next(s)])for(let seed=1;seed<=96;seed++){
   const start=structuredClone(side);start.rng=seed*7919;const probe=structuredClone(start),{values}=E.drawDice(probe,E.diceCount(probe));
   const criticalDraw=E.random(probe),followDraw=E.random(probe),actual=E.transition(start,{type:'roll'});
   assert.deepEqual(actual.lastRoll.values,values);
   if(family==='critical'){assert.equal(actual.lastRoll.critical,criticalDraw<limit.cap);criticalRolls++;}
   else if(actual.lastRoll.best>=2&&actual.lastRoll.critical){assert.equal(actual.lastRoll.follow,followDraw<limit.cap);cappedFollowRolls++;}
  }
 }
 assert(cappedFollowRolls>0);return {criticalRolls,cappedFollowRolls};
});

check('deep opening, execution, distinct-face and triple-echo boundary conditions match actual ability resolution',()=>{
 const specs=[
  ['v5-weapon-3-0-4','openingStrike','damage',[4,4,4,4,4,4],3,(s,on)=>s.enemy.turns=on?0:1],
  ['v5-weapon-2-0-4','execution','damage',[4,4,4,4,4,4],3,(s,on)=>{s.enemy.type='boss';s.enemy.hp=s.enemy.maxHp*(on?.35:.3501);}],
  ['v5-weapon-4-0-4','distinctStrike','damage',null,null,null],
  ['v5-weapon-1-0-4','tripleEcho','echo',null,null,null],
 ];let variants=0;
 for(const [catalogId,key,output,values,best,configure]of specs){
  const s=scene(catalogId,'weapon-0-0-4'),detail=inspect(s),value=row(detail,key);assert(value,key);
  for(const on of [false,true]){
   const start=structuredClone(s);if(configure)configure(start,on);
   const faces=key==='distinctStrike'?(on?[1,2,3,4,4,4]:[1,2,3,3,3,3]):key==='tripleEcho'?(on?[2,2,2,3,4,5]:[2,2,3,3,4,5]):values;
   const largest=key==='distinctStrike'||key==='tripleEcho'?Math.max(...faces.map(v=>faces.filter(x=>x===v).length)):best;
   const before=D.abilityRoll(start,E.stats(start),faces,largest,false),afterState=next(start),after=D.abilityRoll(afterState,E.stats(afterState),faces,largest,false);
   near(before[output]-after[output],on?value.before-value.after:0,key+' active='+on);variants++;
  }
 }
 return {triggerVariants:variants};
});

check('max-HP shield and healing coefficients follow actual defense and survival triggers',()=>{
 let variants=0;
 for(const [catalogId,key]of [['v5-armor-0-0-4','criticalWard'],['v5-armor-1-0-4','lowWard']]){
  const s=scene(catalogId,'armor-0-0-4'),detail=inspect(s),r=row(detail,key),st=E.stats(s);assert(r);assert.equal(r.unit,'maxHp');
  for(const active of [false,true]){
   const faces=key==='lowWard'?(active?[1,2,3,4,5,6]:[1,3,3,4,5,6]):[3,3,3,4,5,6],critical=key==='criticalWard'&&active;
   const actual=D.abilityDefense(s,st,faces,critical);assert.equal(actual[key],active);assert.equal(actual.ward,active?Math.floor(st.maxHp*r.before):0);variants++;
  }
 }
 for(const [catalogId,key]of [['v5-armor-3-0-4','sixthMend'],['v5-relic-4-0-4','resonanceMend']]){
  const slot=CATALOG_BY_ID.get(catalogId).slot,s=scene(catalogId,`${slot}-0-0-4`),r=row(inspect(s),key),st=E.stats(s);assert(r&&r.unit==='maxHp');
  for(const active of [false,true]){
   const faces=key==='sixthMend'?(active?[1,2,3,4,5,6]:[1,2,3,4,5,5]):active?[2,2,2,2,4,5]:[2,2,2,3,4,5],best=Math.max(...faces.map(v=>faces.filter(x=>x===v).length));
   const actual=D.abilityRoll(s,st,faces,best,false);assert.equal(actual.heal,active?Math.floor(st.maxHp*r.before):0);variants++;
  }
 }
 const s=scene('v5-armor-2-0-4','armor-0-0-4'),r=row(inspect(s),'phaseWard');s.enemy.type='boss';s.enemy.stage=1;s.enemy.hp=s.enemy.maxHp/2+1;
 const actual=E.transition(s,{type:'roll'});assert(actual.lastRoll.phaseChanged);assert.equal(actual.lastRoll.wardGain,Math.round(E.stats(s).maxHp*r.before));variants++;
 const dying=scene('v5-armor-3-0-4','armor-0-0-4');dying.player.hp=1;dying.enemy.attack=1e12;let fatal=null;
 for(let seed=1;seed<100;seed++){const start=structuredClone(dying);start.rng=seed*7919;const after=E.transition(start,{type:'roll'});if(after.lastRoll.values.includes(6)){fatal=after;break;}}
 assert(fatal);assert(fatal.lastRoll.mechanics.some(text=>text.startsWith('六点回生 ·')));assert.equal(fatal.phase,'dead');assert.equal(fatal.player.hp,0);
 return {triggerVariants:variants,fatalCounterDoesNotRevive:true};
});

check('the effective base gold cap is 60 percent and a capped catalog upgrade cannot grow a real chest',()=>{
 const s=scene('relic-5-0-4','relic-5-0-7');s.player.items.push(item('relic-5-0-7','i5'),item('relic-5-0-7','i6'));s.player.equipped.relic2='i5';s.player.equipped.relic3='i6';s.nextId=7;
 const after=next(s),a=E.stats(s),b=E.stats(after);near(a.goldBonus,.6,'before gold cap');near(b.goldBonus,.6,'after gold cap');
 const beforeChest=E.createChest(structuredClone(s),'combat','独立金币封顶审计'),afterChest=E.createChest(structuredClone(after),'combat','独立金币封顶审计');assert.deepEqual(beforeChest,afterChest);
 const initial=I.equipmentComparisonDetails(s,s.player.items[3],requested(s)),current=inspect(s),fixed=current.limits.find(r=>r.key==='goldBonus'&&Math.abs(r.cap-.6)<1e-10);
 report.findings.push({key:'gold-cap',severity:'P3',capturedVersionStillReproduces:!initial.limits.some(r=>r.key==='goldBonus'),capturedLimits:initial.limits,currentLimits:current.limits,actualBaseGoldBefore:a.goldBonus,actualBaseGoldAfter:b.goldBonus,actualBothChestGold:beforeChest.gold,resolved:!!fixed});
 assert(fixed,'the currently displayed cap should match the real 60-percent cap');return {actualBaseCap:.6,actualBothChestGold:beforeChest.gold};
});

check('gilded-six gold applies to the generated killing chest only when at least two sixes occur',()=>{
 const s=scene('v5-relic-3-0-4','relic-0-0-4'),r=row(inspect(s),'gildedSix');assert(r&&r.coverage==='omitted');s.enemy.hp=1;const results=[];
 for(const triggered of [false,true]){
  let found=false;
  for(let seed=1;seed<1000;seed++){
   const start=structuredClone(s);start.rng=seed*7919;const probe=structuredClone(start),{values}=E.drawDice(probe,E.diceCount(probe));E.random(probe);E.random(probe);
   if((values.filter(v=>v===6).length>=2)!==triggered)continue;
   // This level-80 fixture cannot level up from one ordinary kill. Build the
   // same base chest using the real RNG after dice/crit/follow and the actual
   // first-kill counter, then compare the shown conditional coefficient.
   probe.counters.kills++;const ordinary=E.createChest(probe,'combat',s.enemy.name),actual=E.transition(start,{type:'roll'});
   assert(actual.lastRoll.killed);assert.equal(actual.player.level,start.player.level);assert.equal(actual.rng,probe.rng);
   const expected=Math.min(1e8,Math.round(ordinary.gold*(1+(triggered?r.before:0))));assert.equal(actual.chest.gold,expected);
   results.push({triggered,values,ordinaryChestGold:ordinary.gold,actualPendingChestGold:actual.chest.gold,shownCoefficient:r.before});found=true;break;
  }
  assert(found,'both gilded-six branches must execute');
 }
 return {actualBranches:results};
});

check('the displayed six-point coefficient excludes encounter penetration and must say so',()=>{
 const s=scene('v5-weapon-0-0-4','weapon-4-0-4');s.enemy.mechanic='armored';s.enemy.variant=1;s.enemy.shield=s.enemy.maxShield=1e12;
 const r=row(inspect(s),'sixPierce'),initial=row(I.equipmentComparisonDetails(s,s.player.items[3],requested(s)),'sixPierce');
 const st=E.stats(s),values=[6,2,3,4,5,6],best=2,encounter=C.combatModifiers(s.enemy,values,best,st),ability=D.abilityRoll(s,st,values,best,false),total=Math.min(1,st.pierce+encounter.shieldPierce+ability.pierce);
 near(r.before,.155,'equipment/talent contribution');near(total,.755,'actual armored encounter penetration');
 let real=null;
 for(let seed=1;seed<100;seed++){
  const start=structuredClone(s);start.rng=seed*7919;const after=E.transition(start,{type:'roll'});if(!after.lastRoll.values.includes(6))continue;
  real=after.lastRoll;assert(Math.abs((1-real.absorbed/real.total)-total)<1/real.total+1e-12);break;
 }
 assert(real,'real roll must exercise a six');
 const scoped=/构筑|装备|天赋/.test(r.label)||/遭遇/.test(r.trigger);
 report.findings.push({key:'six-pierce-scope',severity:'P3 wording',capturedVersionStillReproduces:!(/构筑|装备|天赋/.test(initial.label)||/遭遇/.test(initial.trigger)),capturedLabel:initial.label,capturedTrigger:initial.trigger,currentLabel:r.label,currentTrigger:r.trigger,displayedBuildCoefficient:r.before,actualArmoredCoefficient:total,realRoll:real,resolved:scoped});
 return {scopeClear:scoped,displayedBuildCoefficient:r.before,actualArmoredCoefficient:total};
});

check('first-critical luck triggers once and preserves its committed next-roll lifetime across equipment changes',()=>{
 const s=scene('v5-relic-1-0-4','relic-0-0-4'),details=inspect(s),r=row(details,'firstCritLuck');assert(r);
 let first=null;
 for(let seed=1;seed<1000;seed++){
  const start=structuredClone(s);start.rng=seed*7919;const rolled=E.transition(start,{type:'roll'});if(!rolled.lastRoll.critical)continue;first=rolled;break;
 }
 assert(first);assert.equal(first.nextLuck,r.before);assert.equal(first.enemy.firstCritUsed,true);
 const changed=E.transition(first,{type:'equip',id:'i4',slot:'relic'});assert.equal(changed.nextLuck,first.nextLuck,'equipping away must not delete an already committed boon');
 const subsequent=E.transition(changed,{type:'roll'});assert.equal(subsequent.nextLuck,0);assert(!subsequent.lastRoll.mechanics.some(text=>text.startsWith('启明星 ·')));
 const used=structuredClone(s);used.enemy.firstCritUsed=true;let usedCritical=null;
 for(let seed=1;seed<1000;seed++){used.rng=seed*7919;const rolled=E.transition(used,{type:'roll'});if(rolled.lastRoll.critical){usedCritical=rolled;break;}}
 assert(usedCritical);assert.equal(usedCritical.nextLuck,0);
 return {buffAtFirstCritical:first.nextLuck,consumedAfterSubsequentCombatRoll:true,noRetriggerWhenAlreadyUsed:true,currentLabel:r.label,currentTrigger:r.trigger};
});

check('victory luck uses the actual remaining layer allowance and excludes ordinary and trial kills',()=>{
 const s=scene('v5-relic-2-0-4','v5-relic-2-0-7');s.eventLuck=19;
 let kills=0;
 for(const type of ['combat','trial','elite','boss'])for(const equipped of [false,true]){
  const start=equipped?next(s):structuredClone(s);start.enemy.type=type;start.enemy.hp=1;start.enemy.stage=2;start.enemy.maxShield=start.enemy.shield=0;
  const after=E.transition(start,{type:'roll'});assert(after.lastRoll.killed);assert.equal(after.eventLuck,['elite','boss'].includes(type)?20:19);kills++;
 }
 const details=inspect(s);assert(!row(details,'eliteLuck'),'both capped-to-one effects must not claim an increment');
 return {realKillCases:kills,remainingLayerLuck:1,bothItemVariantsGain:1};
});

check('the detail renderer and card downgrades are pure and explicitly keep omitted conditions outside the score',()=>{
 const s=scene('weapon-6-0-7','weapon-0-0-7'),candidate=s.player.items[3],before=S.encodeSave(s),hint=H.equipmentComparisonHint(s,candidate),detail=H.equipmentComparisonDetails(s,candidate,requested(s)),card=V.comparison(s,candidate),view=V.equipmentComparisonView(s,candidate);
 assert(hint.hasOmitted);assert(row(detail,'firstBonus')?.coverage==='omitted');assert(card.includes('条件需权衡'));assert(card.includes('基础伤害估值'));assert(view.includes('未计入估值'));assert(view.includes('不能将各行百分比直接相加'));assert.equal(S.encodeSave(s),before);
 return {cardDowngradedForOmittedFirstHit:true,completeStateUnchanged:true};
});

report.summary={checksPassed:report.checks.length,failures:report.failures.length,reviewFindings:report.findings.length,correctedFindingsVerified:report.findings.filter(r=>r.resolved).length};
report.status=report.failures.length?'FAIL':'PASS';writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,summary:report.summary,failures:report.failures.map(x=>({name:x.name,error:x.error})),output:out},null,2));process.exitCode=report.failures.length?1:0;
