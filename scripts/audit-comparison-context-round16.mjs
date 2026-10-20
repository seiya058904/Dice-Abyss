// Reproduce the actual first-floor decision and compare complete transitions
// against an explicitly supplied, untouched input package. No browser or RNG
// interception is required. Synthetic catalog quotes are counted separately.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const args=process.argv.slice(2),options={};assert.equal(args.length%2,0,'Use --name value pairs.');
for(let i=0;i<args.length;i+=2){assert(['--baseline','--source','--output'].includes(args[i]),`Unknown option ${args[i]}`);assert(!Object.hasOwn(options,args[i]));options[args[i]]=args[i+1];}
assert(options['--baseline'],'Provide --baseline for the untouched input package.');
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(options['--source']||project),baseline=resolve(options['--baseline']);
const output=resolve(options['--output']||'/tmp/dice-abyss-comparison-context-round16.json'),outRelative=relative(project,output);
assert(outRelative.startsWith('..'+sep)||isAbsolute(outRelative),'Write audit output outside the project.');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const files=['src/engine.js','src/equipment.js','src/equipment-content.js','src/equipment-comparison.js','src/views.js','src/content.js','src/deep-content.js','src/deep-rules.js','src/storage.js'];
const hashes=async root=>Object.fromEntries(await Promise.all(files.map(async path=>[path,sha(await readFile(resolve(root,path)))])));
const imports=async root=>Object.fromEntries(await Promise.all(['engine','equipment-comparison','equipment-content','views','storage'].map(async name=>[name,await import(pathToFileURL(resolve(root,'src',name+'.js')))])));
const [A,B,baselineHashes,sourceHashes]=await Promise.all([imports(baseline),imports(source),hashes(baseline),hashes(source)]);
const transitions=[],quotes=[];let fullCodecRoundTrips=0,catalogComparisons=0;
const digest=state=>sha(JSON.stringify(state)),vitals=(runtime,s)=>({hp:s.player.hp,maxHp:runtime.engine.stats(s).maxHp,ward:s.ward||0});
function next(pair,action,label){
 const original=pair.map(state=>structuredClone(state));
 assert(A.engine.canAct(pair[0],action),label);assert(B.engine.canAct(pair[1],action),label);
 const result=[A.engine.transition(pair[0],action),B.engine.transition(pair[1],action)];
 assert.deepEqual(pair,original,`${label}: transition mutated an input`);assert.deepEqual(result[0],result[1],`${label}: complete cross-version state differs`);
 for(const runtime of [A,B])for(const state of result){assert(runtime.storage.validateSave(state),label);assert.deepEqual(runtime.storage.decodeSave(runtime.storage.encodeSave(state)),state);fullCodecRoundTrips++;}
 transitions.push({label,action,phase:result[1].phase,floor:result[1].floor,level:result[1].player.level,rng:result[1].rng,values:result[1].lastRoll?.values||null,player:vitals(B,result[1]),baselineStateSha256:digest(result[0]),currentStateSha256:digest(result[1])});
 return result;
}
const legacyDetails=detail=>{const {context,...legacy}=detail;return legacy;};
function quote(pair,itemId,label){
 const initial=pair.map(state=>structuredClone(state)),oldItem=pair[0].player.items.find(item=>item.id===itemId),newItem=pair[1].player.items.find(item=>item.id===itemId);
 assert(oldItem&&newItem,label);
 const before=A['equipment-comparison'].equipmentComparisonDetails(pair[0],oldItem),after=B['equipment-comparison'].equipmentComparisonDetails(pair[1],newItem);
 assert(after.context,'The current source must include the Round16 comparison context.');
 assert.deepEqual(legacyDetails(before),legacyDetails(after),`${label}: original detail fields changed`);
 assert.deepEqual(A.engine.compareEquipment(pair[0],oldItem),B.engine.compareEquipment(pair[1],newItem),`${label}: original equipment estimate changed`);
 assert.equal(A.views.comparison(pair[0],oldItem),B.views.comparison(pair[1],newItem),`${label}: compact inventory card changed`);
 const actuallyEquipped=B.engine.transition(pair[1],{type:'equip',id:itemId});
 assert.deepEqual(after.context.before,vitals(B,pair[1]));assert.deepEqual(after.context.after,vitals(B,actuallyEquipped));
 assert.deepEqual(pair,initial,`${label}: quoting mutated a complete state`);
 const result={label,itemId,catalogId:newItem.catalogId,baselineContextPresent:!!before.context,unchangedEstimate:B.engine.compareEquipment(pair[1],newItem),legacyDetails:legacyDetails(after),context:after.context};quotes.push(result);return result;
}

// The untouched input creates the ordinary seeded start. Both runtimes replay
// exactly that full initial state, including its actual runId. Nothing is
// normalized out of any subsequent complete-state comparison.
const initial=A.engine.newGame(3);let pair=[initial,structuredClone(initial)];
for(const type of ['fate','enter','roll','roll','open'])pair=next(pair,{type},'natural-prefix-'+type+'-'+transitions.length);
const loot=pair;assert.equal(loot[1].phase,'loot');assert.equal(loot[1].player.level,1);
const first=quote(loot,'i4','one-die-first-floor-loot');
assert.equal(first.unchangedEstimate.delta,82);assert.deepEqual(first.context.before,{hp:165,maxHp:165,ward:0});assert.deepEqual(first.context.after,{hp:165,maxHp:224,ward:0});
assert(first.context.unreachable.some(row=>row.key==='pairWard'&&row.requiredDice===2&&row.unlockLevel===2));
next(loot,{type:'equip',id:'i4'},'natural-loot-equip');
const entered=next(loot,{type:'next'},'natural-second-combat');quote(entered,'i4','mid-combat-existing-opening-ward');
const upgraded=next(entered,{type:'equip',id:'i4'},'natural-mid-combat-equip'),injured=next(upgraded,{type:'roll'},'natural-injured-after-regen');
const clamp=quote(injured,'i2','natural-eight-hp-clamp');assert.equal(clamp.context.hpLost,8);assert.deepEqual(clamp.context.after,{hp:165,maxHp:165,ward:3});
next(injured,{type:'equip',id:'i2'},'natural-clamp-equip');
let unlocked=entered;
for(let i=0;i<20&&unlocked[1].player.level===1&&unlocked[1].phase==='combat';i++)unlocked=next(unlocked,{type:'roll'},'natural-level-two-roll-'+i);
assert.equal(unlocked[1].player.level,2);const second=quote(unlocked,'i4','natural-two-dice-after-level-up');assert(!second.context.unreachable.some(row=>row.key==='pairWard'));

// Every catalog item is offered hypothetically against the same natural bag.
// These are read-only constructed quotes, not generated drops or natural runs.
const catalogDigest=createHash('sha256'),stateSnapshot=structuredClone(loot[1]);
for(const entry of B['equipment-content'].CATALOG_BY_ID.values()){
 const item={id:'i9999',catalogId:entry.id,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,name:entry.name,level:1,levelXp:0,enhance:0,depth:140,locked:false};
 const before=A['equipment-comparison'].equipmentComparisonDetails(loot[0],item),after=B['equipment-comparison'].equipmentComparisonDetails(loot[1],item);
 assert.deepEqual(legacyDetails(before),legacyDetails(after),entry.id);assert.deepEqual(A.engine.compareEquipment(loot[0],item),B.engine.compareEquipment(loot[1],item),entry.id);
 assert.equal(A.views.comparison(loot[0],item),B.views.comparison(loot[1],item),entry.id);
 assert(after.context);assert(Number.isSafeInteger(after.context.after.hp));assert.equal(after.context.after.ward,loot[1].ward||0);
 const owned=structuredClone(loot[1]);owned.player.items.push(item);owned.nextId=10000;
 const actual=B.engine.transition(owned,{type:'equip',id:item.id});assert.deepEqual(after.context.after,vitals(B,actual),entry.id);
 catalogDigest.update(JSON.stringify({catalogId:entry.id,legacy:legacyDetails(after),context:after.context})+'\n');catalogComparisons++;
}
assert.equal(catalogComparisons,1536);assert.deepEqual(loot[1],stateSnapshot);
assert.deepEqual(await hashes(baseline),baselineHashes,'The untouched baseline changed during this audit.');
assert.deepEqual(await hashes(source),sourceHashes,'Current source changed during this audit.');
const report={audit:'round16-current-equipment-window',status:'PASS',created:new Date().toISOString(),baseline,source,baselineHashes,sourceHashes,sourceStable:true,
 method:{natural:'Seed 3 was selected during initial inspection for a clear first-floor explanation example. One baseline-generated, unedited newGame state is replayed on both runtimes; complete states are compared recursively without omitting or normalizing any fields.',quotes:'The new immediate HP and ward quote is checked against an actual equip transition. All pre-existing detail fields, equipment estimates and compact card HTML are compared with the untouched input.',catalog:'1536 hypothetical candidate items are quoted against the same natural bag and checked against equip after providing ownership. These are synthetic boundary comparisons, not natural loot or win-rate samples.'},
 summary:{naturalSeed:3,pairedFullTransitions:transitions.length,fullCodecRoundTrips,catalogComparisons,catalogQuoteSha256:catalogDigest.digest('hex'),naturalQuotes:quotes.length},transitions,quotes,
 limitations:['This audit neither estimates win rates nor claims an optimal build. The level-two checkpoint is a continuation/branch of the same seed, not an independent journey.','Dice availability only rules out conditions impossible for the current number of combat dice. It does not predict faces, critical hits, enemy states or whether the player survives a retaliation.','Same-point guidance may still apply to multi-die fate/event rolls when the current combat has only one die.','Current ward is preserved by equip; future opening ward and healing still follow the existing combat rules.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
for(const [name,state]of [['loot',loot[1]],['combat',entered[1]],['before-clamp',injured[1]]])await writeFile(resolve(dirname(output),`natural-seed3-${name}.save.json`),JSON.stringify(state,null,2)+'\n');
console.log(JSON.stringify({output,status:report.status,summary:report.summary}));
