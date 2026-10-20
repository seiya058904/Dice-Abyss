// Post-hoc, complete single-item option audit from a retained natural defeat.
// Every unequipped item and every relic replacement slot is retained, including
// losses. This is not a new natural journey or a search over full combinations.
// node scripts/audit-defeat-options-round14.mjs --source . --input /tmp/natural.json.seed-23757.incomplete-save.txt --output /tmp/defeat-options.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--source','--input','--output'].includes(args[i])&&args[i+1]);options[args[i]]=args[i+1];}
assert(options['--source']&&options['--input']&&options['--output']);
const source=resolve(options['--source']),input=resolve(options['--input']),output=resolve(options['--output']);
const outputRelative=relative(source,output);assert(outputRelative.startsWith('..'+sep)||isAbsolute(outputRelative),'Write audit output outside the project.');
const uri=file=>pathToFileURL(resolve(source,file));
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const E=await import(uri('src/engine.js')),S=await import(uri('src/storage.js')),C=await import(uri('src/content.js')),D=await import(uri('src/equipment-comparison.js'));
const checkedFiles=['src/engine.js','src/equipment.js','src/encounters.js','src/deep-rules.js','src/deep-content.js','src/content.js','src/equipment-content.js','src/rarity.js','src/route-weights.js','src/storage.js','src/equipment-comparison.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(checkedFiles.map(async file=>[file,hash(await readFile(resolve(source,file)))])));
const beforeHashes=await sourceHashes(),inputRaw=await readFile(input,'utf8'),terminal=S.decodeSave(inputRaw),original=JSON.stringify(terminal);
assert.equal(terminal.floor,30);assert.equal(terminal.phase,'dead');assert.equal(terminal.counters.deaths,21);assert.equal(terminal.player.talents.power,84);
assert.equal(terminal.player.talentPoints,0);assert.equal(terminal.player.gold,37464);assert(S.validateSave(terminal));
assert.deepEqual(S.decodeSave(S.encodeSave(terminal)),terminal);
const ids=new Set(E.equippedIds(terminal));
const alternatives=terminal.player.items.filter(item=>!ids.has(item.id)).toSorted((a,b)=>a.id.localeCompare(b.id,'en'));
assert.equal(alternatives.length,134);
const choices=[{id:'keep-loadout',item:null,slot:null},...alternatives.flatMap(item=>(item.slot==='relic'?['relic','relic2','relic3']:[item.slot]).map(slot=>({id:`${slot}-${item.id}`,item,slot})))];
assert.equal(choices.length,215);
const terminalLegal={retry:E.canAct(terminal,{type:'retry'}),unequipped:alternatives.length,allAlternativesWearable:alternatives.every(item=>E.canAct(terminal,{type:'equip',id:item.id})),talents:Object.keys(C.TALENTS).filter(id=>E.canAct(terminal,{type:'talent',id})),paidServices:{forge:!!E.canAct(terminal,{type:'forge',id:terminal.player.equipped.weapon}),buy:!!E.canAct(terminal,{type:'buy',id:'heal'}),reset:!!E.canAct(terminal,{type:'event-choice',id:'reset',confirmed:true}),fusion:false}};
const maxRolls=256,rows=[],focus=new Set(['keep-loadout','armor-i123','armor-i111']);
let openingEnemy=null,transactions=0,totalRolls=0;
for(const choice of choices){
 let s=S.decodeSave(S.encodeSave(terminal));const actions=[],trace=[];
 const act=action=>{assert(E.canAct(s,action),`${choice.id}: ${JSON.stringify(action)}`);const next=E.transition(s,action);assert.notStrictEqual(next,s);actions.push(action);transactions++;s=next;};
 const score=choice.item?E.compareEquipment(s,choice.item,choice.slot):null;
 const detail=choice.item?D.equipmentComparisonDetails(s,choice.item,choice.slot):null;
 const hint=choice.item?D.equipmentComparisonHint(s,choice.item,choice.slot):null;
 if(choice.item){act({type:'equip',id:choice.item.id,slot:choice.slot});assert.equal(s.player.hp,0);assert.equal(s.rng,terminal.rng);assert.equal(s.player.gold,terminal.player.gold);assert.deepEqual(s.player.items,terminal.player.items);assert.deepEqual(s.player.talents,terminal.player.talents);assert.deepEqual(s.enemy,terminal.enemy);}
 act({type:'retry'});assert.equal(s.rng,terminal.rng);assert.equal(s.player.gold,terminal.player.gold);assert.equal(s.player.hp,E.stats(s).maxHp);
 openingEnemy??=structuredClone(s.enemy);assert.deepEqual(s.enemy,openingEnemy);
 const opening={rng:s.rng,hp:s.player.hp,ward:s.ward,gold:s.player.gold,stats:E.stats(s),equipped:s.player.items.filter(item=>E.equippedIds(s).includes(item.id)),talents:structuredClone(s.player.talents),stateSha256:hash(s)};
 while(s.phase==='combat'&&trace.length<maxRolls){
  const before={rng:s.rng,hp:s.player.hp,ward:s.ward,gold:s.player.gold,enemy:structuredClone(s.enemy)};
  act({type:'roll'});totalRolls++;
  trace.push({before,roll:structuredClone(s.lastRoll),after:{rng:s.rng,hp:s.player.hp,ward:s.ward,gold:s.player.gold,phase:s.phase,level:s.player.level,talentPoints:s.player.talentPoints,enemy:structuredClone(s.enemy)}});
 }
 assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);assert.equal(s.player.gold,terminal.player.gold);
 const finishReason=s.phase==='chest'?'ENEMY_DEFEATED':s.phase==='dead'?'FIRST_FURTHER_DEATH':'ROLL_BUDGET_EXHAUSTED';
 rows.push({id:choice.id,item:choice.item,slot:choice.slot,score,detail,hint,opening,finishReason,rolls:trace.length,spent:0,newDeaths:s.counters.deaths-terminal.counters.deaths,ending:{rng:s.rng,hp:s.player.hp,ward:s.ward,gold:s.player.gold,level:s.player.level,talentPoints:s.player.talentPoints,phase:s.phase,enemy:structuredClone(s.enemy),chest:structuredClone(s.chest),stateSha256:hash(s)},actions,trace,...(focus.has(choice.id)?{completeEndingState:s}:{})});
}
assert.equal(JSON.stringify(terminal),original);assert.deepEqual(await sourceHashes(),beforeHashes);
const report={audit:'round14-post-hoc-all-single-item-defeat-options',source,sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,sourceHashes:beforeHashes,sourceStable:true,scriptSha256:hash(await readFile(fileURLToPath(import.meta.url))),inputSha256:hash(inputRaw),terminal,terminalLegal,openingEnemy,
 method:{classification:'Post-hoc branches from the exact retained natural seed-23757 dead terminal. The main constrained-policy journey remains 21 deaths, 29 cleared floors and neither checkpoint 200 nor 400 reached.',selection:'Keep-loadout control plus every one of the 134 unequipped items. All 40 relic items are independently tested in each of the three existing replacement slots. All 215 choices are retained in item-ID then slot order, without selection by future outcomes.',actions:'Equip exactly one owned item while dead, then one legal retry and manual-equivalent roll actions until the enemy falls, the player next dies or 256 rolls are reached. No shopping, forging, fusion, respec, post-retry auto-equipping, alternate RNG or injected HP occurs.',comparison:'Original score, full condition details and full card hint are retained unchanged for every tested replacement. They explain the UI and are not used as a survival predictor.',completeStateScope:'The common complete input plus all complete action and full roll traces permit deterministic reconstruction of every branch. The initial keep-loadout/i123/i111 diagnosis additionally retains full ending states. No natural-journey failure is replaced by those illustrative branches.',independence:'Branches share one original defeat and are not independent random samples. Every branch starts with the same saved RNG and same reset enemy; gear can legally change later RNG consumption through dodge, luck and same-face guidance. Victory ends at the generated chest, before claiming or advancing.'},
 summary:{branches:rows.length,freeEquips:choices.length-1,uniqueAlternativeItems:alternatives.length,rolls:totalRolls,transactions,wins:rows.filter(row=>row.finishReason==='ENEMY_DEFEATED').length,deaths:rows.filter(row=>row.finishReason==='FIRST_FURTHER_DEATH').length,budgetExhaustions:rows.filter(row=>row.finishReason==='ROLL_BUDGET_EXHAUSTED').length,spent:0,bySlot:Object.fromEntries(['weapon','armor','relic','relic2','relic3'].map(slot=>{const r=rows.filter(row=>row.slot===slot);return [slot,{branches:r.length,wins:r.filter(row=>row.finishReason==='ENEMY_DEFEATED').length,deaths:r.filter(row=>row.finishReason==='FIRST_FURTHER_DEATH').length,budgetExhaustions:r.filter(row=>row.finishReason==='ROLL_BUDGET_EXHAUSTED').length}];}))},rows,
 limitations:['This finite single-item branch set does not establish an optimal full loadout or a general win rate.','The two illustrative defensive alternatives were noticed during an earlier exploratory read of this terminal inventory; the full exhaustive branch matrix prevents those successes from hiding the other observed outcomes.','UI navigation and accessibility require separate browser checks; engine legality alone is not proof of a reachable control.','The bound is 256 rolls per single retry; budget exhaustion is retained if it occurs and is not relabeled as a win or a product lock.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,summary:report.summary,focus:rows.filter(row=>focus.has(row.id)).map(row=>({id:row.id,finishReason:row.finishReason,rolls:row.rolls,openingHp:row.opening.hp,endingHp:row.ending.hp,endingEnemyHp:row.ending.enemy.hp,score:row.score}))}));
process.exitCode=report.summary.budgetExhaustions?2:0;
