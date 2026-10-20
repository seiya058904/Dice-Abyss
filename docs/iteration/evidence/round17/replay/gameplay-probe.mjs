import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||'baseline/Dice-Abyss');
const out=resolve(process.argv[3]||'audit/gameplay17');
const E=await import(pathToFileURL(resolve(root,'src/engine.js')));
const C=await import(pathToFileURL(resolve(root,'src/encounters.js')));
const V=await import(pathToFileURL(resolve(root,'src/views.js')));
const S=await import(pathToFileURL(resolve(root,'src/storage.js')));
const {loadCompactSimulator}=await import(pathToFileURL(resolve(root,'scripts/qa-combat-adventure.mjs')));
const {encounterTactics}=await import(pathToFileURL(resolve(root,'src/encounter-tactics.js')));
const simulator=await loadCompactSimulator(root,{verifyComparisons:256});
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const sourceFiles=['src/engine.js','src/encounters.js','src/deep-rules.js','src/route-weights.js','src/views.js','src/encounter-tactics.js'];
const beforeHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(resolve(root,p)))])));
await mkdir(out,{recursive:true});
const examples={},events=[],seen=new Set(),trace=[];
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const snapshot=(key,s,extra={})=>{
 if(examples[key])return;
 const state=structuredClone(s);assert(S.validateSave(state));
 assert.deepEqual(S.decodeSave(S.encodeSave(state)),state);
 examples[key]={floor:s.floor,phase:s.phase,level:s.player.level,room:s.route[s.roomIndex]?.type,revision:s.revision,stateSha256:sha(state),...extra};
 trace.push({key,state});
 console.log(JSON.stringify({found:key,floor:s.floor,phase:s.phase}));
};
const result=simulator.runAdventure(7919,{floors:200,build:'luck',forecast:false,fusion:true,events:'adventurous',observe:s=>{
 const key=`${s.floor}:${s.roomIndex}:${s.event?.key}:${s.event?.status}`;
 if(s.phase==='event'&&s.event?.status==='pending'&&!seen.has(key)){
  seen.add(key);const options=C.eventChoices(s);
  events.push({floor:s.floor,key:s.event.key,hp:s.player.hp,maxHp:E.stats(s).maxHp,luck:E.stats(s).luck,rawLuck:E.stats(s).rawLuck,options:options.map(o=>({id:o.id,cost:o.cost,reward:o.reward,disabled:o.disabled}))});
  if(['prayer','traveler_lantern'].includes(s.event.key)){
   const choice=options.find(o=>['luck','accept'].includes(o.id)&&!o.disabled);
   if(choice){const after=E.transition(s,{type:'event-choice',id:choice.id,confirmed:true});
    if(E.stats(after).luck-E.stats(s).luck!==after.eventLuck-s.eventLuck)snapshot('paid-luck-effective-delta',s,{option:choice,before:{rawLuck:E.stats(s).rawLuck,effectiveLuck:E.stats(s).luck},after:{rawLuck:E.stats(after).rawLuck,effectiveLuck:E.stats(after).luck},actualPayment:s.player.gold-after.player.gold});
   }
  }
  if(['gambit','wishingvault','hollow_scale'].includes(s.event.key))snapshot(`pending-${s.event.key}`,s,{options});
 }
 if(s.v5Boons?.echo||s.v5Boons?.ward){
  const rail=V.routeRail(s),baselineOnly={...s,v5Boons:{echo:0,ward:0}};
  assert.equal(rail,V.routeRail(baselineOnly));
  snapshot(s.v5Boons.echo?'reserved-echo-invisible-in-exploration':'reserved-ward-invisible-in-exploration',s,{v5Boons:s.v5Boons,explorationText:text(rail)});
 }
 if(s.phase==='combat'&&s.enemy.openingEcho){
  const ui={busy:false,rolling:false,forging:false,tab:'game'},visible=V.center(s,ui);
  const without={...s,enemy:{...s.enemy,openingEcho:0}};
  snapshot('opening-echo-invisible-before-roll',s,{openingEcho:s.enemy.openingEcho,centerEqualWithoutOpeningEcho:visible===V.center(without,ui),centerText:text(visible)});
 }
 if((s.eventLuck||s.eventPower||s.blessing||s.nextLuck)&&s.phase==='combat'){
  const rail=V.routeRail(s),cleared={...s,eventLuck:0,eventPower:0,blessing:0,nextLuck:0};
  assert.equal(rail,V.routeRail(cleared));
  snapshot('active-bonuses-invisible-in-exploration',s,{bonuses:{eventLuck:s.eventLuck,eventPower:s.eventPower,blessing:s.blessing,nextLuck:s.nextLuck},explorationText:text(rail)});
 }
 if(s.phase==='combat'&&['boss_sixseal','boss_choir','boss_tide','boss_cinder','boss_hourglass','boss_collector'].includes(s.enemy.mechanic)){
  assert.equal(encounterTactics(s.enemy,E.diceCount(s)),null);
  snapshot('ordinary-boss-no-tactics',s,{enemy:s.enemy.name,mechanic:s.enemy.mechanic,label:s.enemy.label,count:E.diceCount(s)});
 }
}});
const afterHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(resolve(root,p)))])));
assert.deepEqual(afterHashes,beforeHashes);
const report={method:'Fresh newGame(7919), unmodified shipped adventurous luck strategy through 200 floors, with complete real engine transitions. Read-only hypothetical branches are explicitly recorded; observed path was never changed. No natural win-rate claim.',source:root,sourceVersion:JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version,sourceHashes:beforeHashes,sourceUnchanged:true,journey:{completed:result.completed,floor:result.s.floor,deaths:result.deaths,rolls:result.rolls},examples,events,adapter:simulator.QA_COMPARISON_AUDIT};
await writeFile(resolve(out,'gameplay-evidence.json'),JSON.stringify(report,null,2));
for(const {key,state}of trace)await writeFile(resolve(out,`${key}.save.json`),S.encodeSave(state));
console.log(JSON.stringify({completed:result.completed,floor:result.s.floor,deaths:result.deaths,rolls:result.rolls,examples:Object.keys(examples),eventCount:events.length}));
