// Node-only author evidence for Round08. Public actions replay an existing
// natural path and a provenance-backed deep snapshot; this is not player AI.
// Example: node scripts/audit-combat-readout.mjs --baseline /path/to/input --output /tmp/readout.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const arg=(key,fallback)=>{const index=process.argv.indexOf(key);return index<0?fallback:process.argv[index+1];};
const ownRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(arg('--source',ownRoot));
assert(process.argv.includes('--baseline')&&process.argv.includes('--output'),'Pass an explicit baseline directory and an output outside both source projects.');
const baseline=resolve(arg('--baseline','')),output=resolve(arg('--output',''));
for(const root of [source,baseline]){const rel=relative(root,output);assert(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel),'Evidence must be outside the source projects.');}
const readModule=(root,file)=>import(pathToFileURL(resolve(root,file)));
const [E,B,S,BS,V,BV,T]=await Promise.all([
 readModule(source,'src/engine.js'),readModule(baseline,'src/engine.js'),readModule(source,'src/storage.js'),readModule(baseline,'src/storage.js'),
 readModule(source,'src/views.js'),readModule(baseline,'src/views.js'),readModule(source,'src/encounter-tactics.js'),
]);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const files=['src/engine.js','src/views.js','src/encounter-tactics.js','src/deep-rules.js','src/encounters.js','src/deep-content.js','src/equipment.js','src/storage.js','src/deep.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,digest(await readFile(resolve(source,file),'utf8'))])));
const sourceHashes=await hashes(),ui={view:'game',busy:false,rolling:false,forging:false};
const projection=s=>{const next=structuredClone(s);if(next.lastRoll){delete next.lastRoll.criticalMultiplier;delete next.lastRoll.followMultiplier;}return next;};
const badges=(views,s)=>[...views.center(s,ui).matchAll(/<span class="(critical-tag|follow-tag)">([^<]+)<\/span>/g)].map(m=>m[2]);
const counters={legalActions:0,completeStateComparisons:0,saveRoundTrips:0,readOnlyGuides:0,historyBadgeAssertions:0};
const trace=createHash('sha256'),guideExamples=new Map();
function compare(current,prior){
 assert.deepEqual(projection(current),projection(prior),'Only the two declared optional lastRoll fields may differ');counters.completeStateComparisons++;
 assert(S.validateSave(current));assert(BS.validateSave(prior));
 assert.deepEqual(S.decodeSave(S.encodeSave(current)),current);assert.deepEqual(BS.decodeSave(BS.encodeSave(prior)),prior);counters.saveRoundTrips+=2;
 trace.update(JSON.stringify(projection(current))+'\n');
}
function step(pair,action){
 const [current,prior]=pair;assert(E.canAct(current,action));assert(B.canAct(prior,action));
 const next=E.transition(current,action),old=B.transition(prior,action);counters.legalActions++;
 compare(next,old);
 if(action.type==='roll'){
  const st=E.stats(current),r=next.lastRoll;
  assert.equal(r.criticalMultiplier,r.critical?1.8+E.talent(current,'crush')*.1+st.critDamage:1);
  assert.equal(r.followMultiplier,r.follow?.35+E.talent(current,'pursuit')*.08+st.followDamage:0);
  if(r.follow)assert.equal(r.extra,Math.min(Number.MAX_SAFE_INTEGER-r.main,Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.round(r.main*r.followMultiplier)))));
 }
 return [next,old];
}
function inspectGuide(s,origin){
 if(s.phase!=='combat'||s.player.hp<=0)return;
 const before=digest(s),guide=T.encounterTactics(s.enemy,E.diceCount(s));assert.equal(digest(s),before);counters.readOnlyGuides++;
 if(!guide||guideExamples.has(guide.mechanic))return;
 const html=V.center(s,ui);assert.equal(digest(s),before);
 assert(html.includes(`data-tactic="${guide.mechanic}"`));assert(html.includes(`data-tactic-turn="${s.enemy.turns+1}"`));
 if(guide.next)assert(html.includes(`<span>${V.esc(guide.next)}</span>`));
 guideExamples.set(guide.mechanic,{origin,floor:s.floor,roomIndex:s.roomIndex,runId:s.runId,revision:s.revision,rng:s.rng,enemy:s.enemy,guide,openingStateSha256:before});
}

const fixture=JSON.parse(await readFile(resolve(source,'tests/fixtures/round08-history-actions.json'),'utf8'));
const initial=B.newGame(fixture.seed);initial.runId=`readout-natural-${fixture.seed}`;
let natural=[structuredClone(initial),structuredClone(initial)];compare(...natural);
for(const action of fixture.actions){inspectGuide(natural[0],'natural path from newGame, replay of the original 65 actions');natural=step(natural,action);}
const originalCurrent=structuredClone(natural[0]),originalPrior=structuredClone(natural[1]);
assert.deepEqual(originalCurrent.lastRoll.values,[5,6,4,5]);assert.equal(originalCurrent.lastRoll.total,1031);
const beforeBadges=badges(V,natural[0]),baselineBefore=badges(BV,natural[1]);
natural=step(natural,{type:'talent',id:'crush'});natural=step(natural,{type:'talent',id:'pursuit'});
assert.deepEqual(natural[0].lastRoll,originalCurrent.lastRoll);assert.equal(natural[0].rng,originalCurrent.rng);
assert.deepEqual(badges(V,natural[0]),beforeBadges);assert.notDeepEqual(badges(BV,natural[1]),baselineBefore);counters.historyBadgeAssertions+=2;
const spare=natural[0].player.items.find(item=>item.slot==='weapon'&&!E.equippedIds(natural[0]).includes(item.id));assert(spare);
natural=step(natural,{type:'equip',id:spare.id});assert.deepEqual(badges(V,natural[0]),beforeBadges);counters.historyBadgeAssertions++;
const reloaded=S.decodeSave(S.encodeSave(natural[0]));assert.deepEqual(badges(V,reloaded),beforeBadges);counters.historyBadgeAssertions++;
const legacy=projection(originalCurrent),legacyAfter=E.transition(E.transition(legacy,{type:'talent',id:'crush'}),{type:'talent',id:'pursuit'});
assert.deepEqual(badges(V,legacy),['暴击','连锁追击']);assert.deepEqual(badges(V,legacyAfter),['暴击','连锁追击']);counters.historyBadgeAssertions+=2;

// This is a continuation of a shipped old natural snapshot, not an additional
// independent floor-one journey. Do not grant assets, reallocate or reset RNG.
const snapshotFile='docs/iteration/evidence/round07/memorywell-natural-7919-f159.save.json';
const raw=await readFile(resolve(baseline,snapshotFile),'utf8'),snapshot=BS.decodeSave(raw);assert(snapshot);
let deep=[structuredClone(snapshot),structuredClone(snapshot)],deepSteps=0,deepRolls=0;
compare(...deep);
while(!(deep[0].phase==='cleared'&&deep[0].floor>=165)&&deepSteps<1000){
 const s=deep[0];inspectGuide(s,'continuation of the shipped seed7919 / balanced / conservative floor159 natural snapshot');
 let action;
 switch(s.phase){
  case 'combat':action={type:'roll'};deepRolls++;break;
  case 'chest':action={type:'open'};break;
  case 'fate':action={type:'fate'};break;
  case 'route':action={type:'enter'};break;
  case 'gold':action={type:'gold'};break;
  case 'event':action=s.event.status==='pending'?{type:'event-choice',id:'leave'}:{type:'next'};break;
  case 'rest':action={type:s.roomUsed?'next':'rest'};break;
  case 'altar':action={type:s.roomUsed?'next':'bless'};break;
  case 'cleared':action={type:'descend'};break;
  case 'dead':action={type:'retry'};break;
  case 'loot':case 'merchant':case 'blackmarket':case 'forge':case 'fusion':action={type:'next'};break;
  default:throw Error('unexpected phase '+s.phase);
 }
 deep=step(deep,action);deepSteps++;
}
assert(deep[0].phase==='cleared'&&deep[0].floor===165,'bounded continuation must finish');
assert(guideExamples.size>0,'deep examples must be naturally encountered in the continuation');
assert.deepEqual(await hashes(),sourceHashes,'Source changed while this audit ran');

const report={audit:'round08-combat-readout',sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,baselineVersion:JSON.parse(await readFile(resolve(baseline,'package.json'),'utf8')).version,scriptSha256:digest(await readFile(fileURLToPath(import.meta.url),'utf8')),sourceHashes,sourceStable:true,counters,semanticProjection:{omittedPaths:['lastRoll.criticalMultiplier','lastRoll.followMultiplier'],allOtherFieldsCompared:true,unknownFieldsRetained:true},naturalHistory:{seed:fixture.seed,actionsToOriginalState:fixture.actions.length,floor:originalCurrent.floor,roomIndex:originalCurrent.roomIndex,originalCurrentHp:originalCurrent.player.hp,roll:originalCurrent.lastRoll,baselineBefore,baselineAfter:badges(BV,natural[1]),currentBefore:beforeBadges,currentAfter:badges(V,natural[0]),legacyBefore:badges(V,legacy),legacyAfter:badges(V,legacyAfter),legalPostRollActions:['talent crush','talent pursuit','equip naturally owned spare weapon'],rngPreserved:true,lastRollPreserved:true,method:fixture.provenance},deepContinuation:{sourceFile:snapshotFile,sourceRawSha256:digest(raw),startFloor:snapshot.floor,endFloor:deep[0].floor,actions:deepSteps,rolls:deepRolls,extraDeaths:deep[0].counters.deaths-snapshot.counters.deaths,completed:true,newGameJourneysAdded:0,policy:'Preserve imported equipment/talents/RNG. Roll manually through legal transitions, open rewards, skip shops/forge/fusion, refuse optional events, take free rest/altar, descend, retry on death. This is a provenance-backed fixture continuation, not the original full policy replay.'},guideExamples:[...guideExamples.values()],completeSemanticTraceSha256:trace.digest('hex'),limitations:['One original 65-action natural path is replayed in two versions; two executions are not two independent player samples.','The floor159–165 continuation reuses an existing natural snapshot and deliberately fixed choices; it does not measure population encounter frequency or optimal decisions.','The 923 dice-multiset exhaustive tactic oracle is in the new unit tests and is reported separately, not counted again here.','Only the two declared historical factor fields are excluded from full-state equality; no RNG, item, combat, reward, gold or unknown metadata difference is allowed.','This Node audit establishes rule and history consistency, not native browser layout, hardware performance or human long-play comprehension.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
await writeFile(output.replace(/\.json$/,'')+'.natural-current.save.json',S.encodeSave(originalCurrent));
console.log(JSON.stringify({output,...counters,deepActions:deepSteps,deepMechanics:[...guideExamples.keys()],allSemanticStatesEqual:true,sourceStable:true},null,2));
