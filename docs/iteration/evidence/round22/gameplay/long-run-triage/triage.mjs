// Bounded diagnosis of original natural failure saves. No state-field injection,
// newGame/reseeding, runtime edits, strategy edits, or replacement natural runs.
// node triage.mjs --source CURRENT --baseline INPUT --evidence NATURAL_DIR --output REPORT.json
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const arg=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],`Pass ${name}`);return resolve(process.argv[i+1]);};
const source=arg('--source'),baseline=arg('--baseline'),evidence=arg('--evidence'),output=arg('--output'),outDir=dirname(output);
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const load=async root=>{
 const module=path=>import(pathToFileURL(resolve(root,path)));
 const [E,S,C,D]=await Promise.all(['src/engine.js','src/storage.js','src/content.js','src/deep-content.js'].map(module));return {E,S,C,D};
};
const [A,B]=await Promise.all([load(source),load(baseline)]),seeds=[7919,31676];
const tracked=['src/engine.js','src/storage.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/equipment.js','src/equipment-content.js','src/content.js','src/rarity.js','src/route-weights.js','scripts/simulate.mjs','scripts/strategy-round18.mjs'];
const sourceHashes=()=>Object.fromEntries(tracked.map(p=>[p,hash(readFileSync(resolve(source,p)))]));
const before=sourceHashes();mkdirSync(resolve(outDir,'inputs'),{recursive:true});
const naturalRaw=readFileSync(resolve(evidence,'report.json')),natural=JSON.parse(naturalRaw);
writeFileSync(resolve(outDir,'inputs/natural-report.json.gz'),gzipSync(naturalRaw));
const report={started:new Date().toISOString(),scope:'Two exact failed natural terminal states; bounded legal counterfactual continuations, never replacement 400-floor samples.',source,baseline,sourceHashes:before,scriptSha256:hash(readFileSync(fileURLToPath(import.meta.url))),naturalReportSha256:hash(naturalRaw),naturalSummary:natural.summary,inputs:[],inspection:[],branches:[],validation:{transitions:0,fullBaselineComparisons:0,exactCodecs:0},status:'RUNNING'};
const inputRawHashes=new Map(),states=new Map();
const statsFields=['attack','maxHp','defense','crit','follow','reduction','dodge','regen','barrier','pairWard','criticalWard','lowWard','resolveGuard','luck','echoChance'];
const publicStats=s=>{const st=A.E.stats(s);return Object.fromEntries(statsFields.map(k=>[k,st[k]||0]));};
const summary=s=>({phase:s.phase,floor:s.floor,roomIndex:s.roomIndex,rolls:s.counters.rolls,deaths:s.counters.deaths,hp:s.player.hp,ward:s.ward||0,enemyHp:s.enemy?.hp,enemyShield:s.enemy?.shield,enemyTurns:s.enemy?.turns,combatRules:s.enemy?.combatRules,rng:s.rng,gold:s.player.gold,equipped:s.player.equipped});
for(const seed of seeds){
 const map={};
 for(const tag of ['first-death','first-swap-before','first-swap-after','incomplete-terminal']){
  const name=`seed-${seed}-${tag}.save.json`,path=resolve(evidence,name),raw=readFileSync(path),s=A.S.decodeSave(raw.toString());
  assert.deepEqual(B.S.decodeSave(raw.toString()),s);assert.equal(A.D.deepVariantProfile(s.enemy),null);assert.equal(s.enemy.combatRules,4);
  writeFileSync(resolve(outDir,'inputs',name+'.gz'),gzipSync(raw));inputRawHashes.set(path,hash(raw));map[tag]=s;
  report.inputs.push({seed,tag,file:`inputs/${name}.gz`,rawSha256:hash(raw),stateSha256:hash(s),summary:summary(s),enemy:s.enemy,stats:publicStats(s)});
 }
 assert.deepEqual(map['first-death'],map['first-swap-before']);
 const swapAction={type:'equip',id:map['first-swap-after'].player.equipped.armor,slot:'armor'};
 assert(A.E.canAct(map['first-swap-before'],swapAction));
 assert.deepEqual(A.E.transition(map['first-swap-before'],swapAction),map['first-swap-after']);
 states.set(seed,map);
}

// Select only from public owned-item panels before running any combat branch.
// Selection receives no RNG/roll result. The largest shield granted on a pair
// is relevant for six dice and explicitly omitted by the original armor model.
function pairCandidates(s,slotKind){
 const rows=[],slots=slotKind==='armor'?['armor']:['relic','relic2','relic3'];
 for(const item of s.player.items.filter(i=>i.slot===slotKind))for(const slot of slots){
  const action={type:'equip',id:item.id,slot};if(!A.E.canAct(s,action))continue;
  const frozen=hash(s),view=A.E.transition(s,action);assert.equal(hash(s),frozen);assert.equal(view.rng,s.rng);assert.deepEqual(view.enemy,s.enemy);
  const stats=publicStats(view),pairWardPerQualifyingRoll=Math.round(stats.maxHp*stats.pairWard);
  rows.push({action,item:{id:item.id,name:item.name,level:item.level,rarity:item.rarity},stats,pairWardPerQualifyingRoll,expectedDamage:A.E.damageExpectation(view)});
 }
 rows.sort((a,b)=>b.pairWardPerQualifyingRoll-a.pairWardPerQualifyingRoll||b.expectedDamage-a.expectedDamage||b.stats.maxHp-a.stats.maxHp||b.stats.defense-a.stats.defense||a.item.id.localeCompare(b.item.id,'en')||a.action.slot.localeCompare(b.action.slot,'en'));
 return rows;
}
const plan={seeds,control:{attempts:6,maxRollsPerAttempt:80,actions:'Only original retry then roll; retain every loss and the advancing RNG.'},pairArmor:{attempts:3,maxRollsPerAttempt:80,actions:'One legal owned-armor equip, then retry/roll. Highest public maxHp*pairWard; ties by estimated damage, maxHp, defense, item ID.'},fallback:{attempts:3,maxRollsPerAttempt:80,onlyIf:'The armor-only branch does not defeat the current enemy.',actions:'The same chosen armor plus one existing relic maximizing public total pairWard amount; tie by expected damage and item ID. No future-roll selection.'},stop:'Each branch stops on the first actual chest or its predeclared attempt/roll budget. No equipment reset, RNG reset, or death-counter edit within a branch.',naturalClaim:'These are bounded counterfactual recovery branches from an original failure, not successful reruns of the frozen natural policy.',decisions:[]};
for(const seed of seeds){
 const s=states.get(seed)['incomplete-terminal'],armorRows=pairCandidates(s,'armor'),armor=armorRows[0];assert(armor&&armor.stats.pairWard>0);
 const withArmor=A.E.transition(s,armor.action),relicRows=pairCandidates(withArmor,'relic'),relic=relicRows[0];
 plan.decisions.push({seed,armor:armor.action,armorItem:armor.item,fallbackRelic:relic?.action,selectionBeforeCombat:true});
 const availableTalentIds=Object.keys(A.C.TALENTS).filter(id=>A.E.canAct(s,{type:'talent',id}));
 const serviceActions=[{type:'buy',id:'heal'},...s.shop.map(o=>({type:'buy',id:o.id})),...A.E.equippedIds(s).map(id=>({type:'forge',id})),{type:'fuse',targets:[s.player.equipped.weapon],materials:[s.player.items.find(i=>i.slot==='weapon'&&!A.E.equippedIds(s).includes(i.id)).id]},{type:'rest'},{type:'bless'},{type:'event-choice',id:'leave'},{type:'next'},{type:'descend'}];
 report.inspection.push({seed,terminal:summary(s),stats:publicStats(s),talentPoints:s.player.talentPoints,power:s.player.talents.power,availableTalentIds,inventoryCount:s.player.items.length,retryAvailable:A.E.canAct(s,{type:'retry'}),equipCandidates:s.player.items.filter(i=>A.E.canAct(s,{type:'equip',id:i.id})).length,services:serviceActions.map(action=>({action,allowed:A.E.canAct(s,action)})),chosenArmor:armor,armorCandidates:armorRows,conditionalFallbackRelic:relic,originalNaturalJourney:natural.journeys.find(j=>j.seed===seed)});
}
writeFileSync(resolve(outDir,'plan.json'),JSON.stringify(plan,null,2)+'\n');
report.planSha256=hash(readFileSync(resolve(outDir,'plan.json')));

function branch(seed,name,preActions,attemptLimit){
 let s=structuredClone(states.get(seed)['incomplete-terminal']);
 const initialSha=hash(s),records=[{kind:'initial',stateSha256:initialSha,envelope:A.S.encodeSave(s)}],attempts=[],actions=[];
 const apply=action=>{
  const inputSha=hash(s);assert(A.E.canAct(s,action));assert(B.E.canAct(s,action));
  const out=A.E.transition(s,action),old=B.E.transition(s,action);assert.notStrictEqual(out,s);assert.equal(hash(s),inputSha);assert.deepEqual(out,old);
  const raw=A.S.encodeSave(out);assert.equal(B.S.encodeSave(out),raw);assert.deepEqual(A.S.decodeSave(raw),out);assert.deepEqual(B.S.decodeSave(raw),out);
  report.validation.transitions++;report.validation.fullBaselineComparisons++;report.validation.exactCodecs++;
  actions.push(action);records.push({kind:'transition',action,inputStateSha256:inputSha,outputStateSha256:hash(out),baselineFullStateEqual:true,summary:summary(out),envelope:raw});s=out;
 };
 for(const action of preActions)apply(action);
 const preparedStats=publicStats(s),preparedExpectedDamage=A.E.damageExpectation(s);
 for(let attempt=1;attempt<=attemptLimit;attempt++){
  assert.equal(s.phase,'dead');const startRolls=s.counters.rolls,startDeaths=s.counters.deaths;apply({type:'retry'});
  const opening=summary(s),rolls=[];
  for(let i=0;i<80&&s.phase==='combat';i++){apply({type:'roll'});rolls.push({...summary(s),values:s.lastRoll.values,best:s.lastRoll.best,total:s.lastRoll.total,hpDamage:s.lastRoll.hpDamage,retaliation:s.lastRoll.retaliation,wardGain:s.lastRoll.wardGain,dodged:s.lastRoll.dodged,mechanics:s.lastRoll.mechanics});}
  attempts.push({attempt,opening,rolls,rollCount:s.counters.rolls-startRolls,additionalDeaths:s.counters.deaths-startDeaths,ending:summary(s),won:s.phase==='chest'});
  if(s.phase!=='dead')break;
 }
 const trace=records.map(record=>JSON.stringify(record)).join('\n')+'\n',file=`seed-${seed}-${name}.trace.jsonl.gz`,terminalFile=`seed-${seed}-${name}.terminal.save.json.gz`;
 writeFileSync(resolve(outDir,file),gzipSync(trace));writeFileSync(resolve(outDir,terminalFile),gzipSync(A.S.encodeSave(s)));
 const result={seed,name,preActions,preparedStats,preparedExpectedDamage,attemptLimit,initialStateSha256:initialSha,won:s.phase==='chest',attempts:attempts.length,additionalDeaths:s.counters.deaths-states.get(seed)['incomplete-terminal'].counters.deaths,additionalRolls:s.counters.rolls-states.get(seed)['incomplete-terminal'].counters.rolls,goldSpent:states.get(seed)['incomplete-terminal'].player.gold-s.player.gold,ending:summary(s),canOpenEarnedChest:A.E.canAct(s,{type:'open'}),actions,attemptOutcomes:attempts,evidence:{trace:file,traceRawSha256:hash(trace),traceGzipSha256:hash(readFileSync(resolve(outDir,file))),terminal:terminalFile,terminalStateSha256:hash(s)}};
 report.branches.push(result);writeFileSync(output+'.partial.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({seed,name,won:result.won,attempts:result.attempts,additionalDeaths:result.additionalDeaths,additionalRolls:result.additionalRolls,goldSpent:result.goldSpent,ending:result.ending}));
 return result;
}
for(const decision of plan.decisions){
 branch(decision.seed,'original-retry-control',[],plan.control.attempts);
 const armored=branch(decision.seed,'owned-pair-armor',[decision.armor],plan.pairArmor.attempts);
 if(!armored.won&&decision.fallbackRelic)branch(decision.seed,'owned-pair-armor-and-relic',[decision.armor,decision.fallbackRelic],plan.fallback.attempts);
}
for(const [path,sha]of inputRawHashes)assert.equal(hash(readFileSync(path)),sha,'An original natural snapshot changed.');
assert.equal(hash(readFileSync(resolve(evidence,'report.json'))),report.naturalReportSha256);
assert.deepEqual(sourceHashes(),before,'Frozen sources changed during diagnosis.');
report.sourceStable=true;report.originalEvidenceStable=true;report.finished=new Date().toISOString();
report.recovery=seeds.map(seed=>({seed,demonstrated:report.branches.some(b=>b.seed===seed&&b.won),winningBranches:report.branches.filter(b=>b.seed===seed&&b.won).map(b=>({name:b.name,actions:b.preActions,attempts:b.attempts,additionalRolls:b.additionalRolls,additionalDeaths:b.additionalDeaths,goldSpent:b.goldSpent,endingHp:b.ending.hp,trace:b.evidence.trace}))}));
report.status=report.recovery.every(r=>r.demonstrated)?'RECOVERY_DEMONSTRATED_FROM_BOTH_ORIGINAL_TERMINALS':'INCONCLUSIVE_BOUNDED_RECOVERY';
report.limitations=['Original 2/4 natural completion and both 21-death failures remain unchanged. Recovery branches do not replace their cohort outcomes.','An observed winning legal path disproves an irreversible softlock for that exact saved state; it does not establish human win rate or all-seed balance.','A failed bounded retry branch is not a proof that continued retries can never win.','All original inventory, unknown data, RNG and counters remain in every real transition; only lawful gameplay actions change state.','Services are checked at the terminal phase; prior missed shop/forge opportunities are not retroactively inserted.','No continuation past the current enemy or new 400-floor simulation is claimed.'];
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,status:report.status,recovery:report.recovery,validation:report.validation,sourceStable:report.sourceStable,originalEvidenceStable:report.originalEvidenceStable},null,2));
