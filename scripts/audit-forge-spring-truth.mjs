// Exact state differential against the untouched input. Synthetic boundary scenes
// are intentionally separate from natural journey / player-experience evidence.
// node scripts/audit-forge-spring-truth.mjs --baseline /path/to/input --source . --output /tmp/forge-spring.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const arg=(key,fallback)=>{const index=process.argv.indexOf(key);return index<0?fallback:process.argv[index+1];};
const baseline=resolve(arg('--baseline','')),source=resolve(arg('--source','.')),output=resolve(arg('--output','forge-spring-audit.json'));
assert(arg('--baseline'),'an untouched baseline is required');assert.notEqual(baseline,source);
const B=await import(pathToFileURL(resolve(baseline,'src/engine.js'))),E=await import(pathToFileURL(resolve(source,'src/engine.js'))),C=await import(pathToFileURL(resolve(source,'src/encounters.js'))),S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex'),files=['src/engine.js','src/equipment.js','src/encounters.js','src/deep-rules.js'];
const hashes=async root=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(resolve(root,file),'utf8'))]))),beforeHashes={baseline:await hashes(baseline),source:await hashes(source)};
function scene(type,seed,floor){
 let s=B.newGame(seed);s.runId=`boundary-${seed}`;s.floor=floor;s.player.level=Math.ceil(floor/2)+3;s.player.gold=1000000;s.fate=[3,4];
 for(const slot of ['relic2','relic3']){const item=B.makeItem(s,'relic',floor>=140?7:floor>=80?6:floor>=30?4:2);s.player.items.push(item);s.player.equipped[slot]=item.id;}
 s.player.hp=Math.floor(B.stats(s).maxHp*.6);s.route=[type,'combat','rest','combat','gold',floor%5===0?'boss':'elite'].map((type,index)=>({id:`f${floor}r${index}`,type,done:false,quality:seed%2}));s.roomIndex=0;s.phase='route';return B.transition(s,{type:'enter'});
}
const summary={forgesAccepted:0,forgesRejectedAtCap:0,previewChecks:0,springChoices:0,springOutcomeChanges:0,pendingDisplayChecks:0,restAndBloodwellControls:0},facesBySlot=Object.fromEntries(['weapon','armor','relic','relic2','relic3'].map(slot=>[slot,new Set()]));
for(const floor of [1,30,80,140])for(let seed=1;seed<=24;seed++)for(const enhance of [0,18,19,20])for(const slot of Object.keys(facesBySlot)){
 const s=scene('forge',seed*7919,floor),id=s.player.equipped[slot];s.player.items.find(item=>item.id===id).enhance=enhance;s.player.talents.smith=seed%6;
 const snapshot=structuredClone(s),quote=E.forgePreview(s,id);assert.deepEqual(s,snapshot);assert.equal(quote.canForge,!!B.canAct(s,{type:'forge',id}));summary.previewChecks++;
 const previous=B.transition(s,{type:'forge',id}),current=E.transition(s,{type:'forge',id});assert.deepEqual(current,previous,'forge transition must be byte-for-byte equivalent as a structured save, including RNG and logs');assert.deepEqual(s,snapshot);
 if(enhance===20){assert.strictEqual(current,s);summary.forgesRejectedAtCap++;}else{
  summary.forgesAccepted++;const face=current.lastForge.value,after=current.player.items.find(item=>item.id===id);facesBySlot[slot].add(face);assert.deepEqual(E.itemStats(after),quote.outcomes[face-1].after.stats);assert.equal(after.enhance,quote.outcomes[face-1].after.enhance);assert.equal(current.player.hp,s.player.hp);assert.equal(current.player.gold,s.player.gold-quote.cost);
 }
 assert(S.validateSave(current));assert.deepEqual(S.decodeSave(S.encodeSave(current)),current);
}
for(const faces of Object.values(facesBySlot))assert.equal(faces.size,6);
for(const floor of [1,30,140])for(let seed=1;seed<=20;seed++)for(const shieldFraction of [0,.05,.2,.7,1.4])for(const choice of ['heal','ward','leave']){
 const s=scene('spring',seed*7919,floor);s.ward=Math.floor(B.stats(s).maxHp*shieldFraction);const snapshot=structuredClone(s),bytes=S.encodeSave(s),presentation=C.eventPresentation(s);assert.deepEqual(s,snapshot);assert.equal(S.encodeSave(s),bytes);assert(presentation.options.filter(option=>option.id!=='leave').every(option=>option.reward.includes('护盾补足至至少')));summary.pendingDisplayChecks++;
 const previous=B.transition(s,{type:'event-choice',id:choice}),current=E.transition(s,{type:'event-choice',id:choice});summary.springChoices++;
 assert(S.validateSave(current));assert.deepEqual(S.decodeSave(S.encodeSave(current)),current);
 if(choice!=='leave'){
  assert.notEqual(current.event.outcome,previous.event.outcome);assert.equal(current.log[0].text,current.event.outcome);assert.equal(previous.log[0].text,previous.event.outcome);summary.springOutcomeChanges++;
  const strip=state=>{const copy=structuredClone(state);copy.event.outcome='allowed spring outcome text';copy.log[0].text='allowed spring outcome text';return copy;};assert.deepEqual(strip(current),strip(previous),'only event.outcome and its own leading log text may change');
 }else assert.deepEqual(current,previous);
 assert.deepEqual(s,snapshot);
}
for(const type of ['rest','bloodwell'])for(let seed=1;seed<=24;seed++){
 const s=scene(type,seed*7919,140),action=type==='rest'?{type:'rest'}:{type:'event-choice',id:'accept',confirmed:true};
 assert(B.canAct(s,action));const current=E.transition(s,action);assert.deepEqual(current,B.transition(s,action),'rest and bloodwell must keep all behavior and text');assert(S.validateSave(current));summary.restAndBloodwellControls++;
}
assert.deepEqual({baseline:await hashes(baseline),source:await hashes(source)},beforeHashes);
const report={method:'Synthetic valid scenes across early and deep floors, 24 seeded forge rolls, five equipment slots, +0/+18/+19/+20, smith and rich-room prices, and spring shields below/above both floors. Current transitions are compared to the untouched baseline using the same complete input object. Forge comparison excludes no field. Spring comparison excludes exactly event.outcome and the matching leading log text for accepted choices; all persisted assets/RNG/revision and other strings remain equal.',summary,facesBySlot:Object.fromEntries(Object.entries(facesBySlot).map(([slot,faces])=>[slot,[...faces].sort()])),sourceHashes:beforeHashes,sourceStable:true,environment:{node:process.version,platform:process.platform,arch:process.arch},limits:['Synthetic boundary cases do not establish natural frequency, usability, economic balance, or player win rates.','Legacy resolved spring history is preserved by separate unit coverage; only pending choices and newly committed outcome wording are corrected.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...summary}));
