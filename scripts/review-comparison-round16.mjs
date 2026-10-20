// Read-only independent audit. Node >=20; no package installation required.
// Fixtures are regenerated in memory; input projects and saves are not modified.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const usage='Usage: node scripts/review-comparison-round16.mjs --baseline INPUT_PROJECT --current CURRENT_PROJECT --output OUTPUT_JSON';
const {values}=parseArgs({options:{baseline:{type:'string'},current:{type:'string'},output:{type:'string'},help:{type:'boolean'}},strict:true,allowPositionals:false});
if(values.help){console.log(usage);process.exit(0);}
for(const option of ['baseline','current','output'])if(!values[option])throw Error(`Missing --${option}. ${usage}`);
const baseline=resolve(values.baseline),current=resolve(values.current),output=resolve(values.output);
mkdirSync(dirname(output),{recursive:true});
const at=(root,file)=>pathToFileURL(resolve(root,file));
const B=await import(at(baseline,'src/equipment-comparison.js')),C=await import(at(current,'src/equipment-comparison.js'));
const BV=await import(at(baseline,'src/views.js')),CV=await import(at(current,'src/views.js'));
const E=await import(at(baseline,'src/engine.js')),S=await import(at(baseline,'src/storage.js'));
const {CATALOG_BY_ID}=await import(at(baseline,'src/equipment-content.js'));
const {DICE_LEVELS}=await import(at(baseline,'src/content.js'));
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);for(const y of Object.values(x))freeze(y);}return x;};
const hashes=()=>Object.fromEntries([['baseline',baseline],['current',current]].map(([k,r])=>[k,Object.fromEntries(['src/equipment-comparison.js','src/views.js','src/engine.js','src/equipment.js','src/storage.js','src/deep-rules.js','src/content.js'].map(f=>[f,hash(readFileSync(at(r,f),'utf8'))]))]));

// Exhaustive face enumeration determines reachability without copying the
// implementation's minimum-dice table. No sampled RNG or future roll lookup.
const reachability={};
for(let count=1;count<=6;count++){
 const result={sum18:false,pair:false,triple:false,distinct4:false,fourSame:false,twoLow:false,twoSix:false,echo:count>1};let combinations=0;
 const walk=values=>{if(values.length<count){for(let v=1;v<=6;v++)walk([...values,v]);return;}combinations++;const frequencies=Array(7).fill(0);for(const v of values)frequencies[v]++;const best=Math.max(...frequencies);result.sum18 ||= values.reduce((a,b)=>a+b,0)>=18;result.pair ||= best>=2;result.triple ||= best>=3;result.distinct4 ||= new Set(values).size>=4;result.fourSame ||= best>=4;result.twoLow ||= frequencies[1]+frequencies[2]>=2;result.twoSix ||= frequencies[6]>=2;};walk([]);reachability[count]={...result,combinations};
}
const featureByKey={sumBonus:'sum18',pairBonus:'pair',pairFollowChance:'pair',criticalFollowChance:'pair',criticalFollow:'pair',pairWard:'pair',tripleEcho:'triple',tripleStrike:'triple',echoRelic:'triple',distinctStrike:'distinct4',resonanceMend:'fourSame',lowWard:'twoLow',gildedSix:'twoSix',echoChance:'echo'};
const expectedUnavailable=(detail,count)=>[...new Set([...detail.rows,...detail.limits].map(r=>r.key))].filter(key=>featureByKey[key]&&!reachability[count][featureByKey[key]]).sort();
const item=(catalogId,id,level=8)=>{const d=CATALOG_BY_ID.get(catalogId);assert(d);return {id,catalogId,slot:d.slot,rarity:d.rarity,profile:d.profile,theme:d.theme,name:d.name,level,levelXp:0,enhance:0,depth:140,locked:false,auditUnknown:{nested:[id,{token:'unknown 😀 <markup>'}]}};};
function scene(level=1){const s=E.newGame(16603);s.runId='comparison-independent-round16';s.floor=140;s.player.level=level;s.fate=[3,4];s.phase='combat';s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,quality:0,done:false}));s.roomIndex=0;s.player.items=[item('weapon-0-0-0','i1'),item('armor-0-0-0','i2'),item('relic-0-0-0','i3'),item('relic-1-0-4','i4'),item('relic-5-0-7','i5')];s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:'i4',relic3:'i5'};s.nextId=6;s.player.hp=E.stats(s).maxHp;s.ward=123456;s.auditUnknown={keep:{notes:['complete',level]}};s.enemy={name:'Independent synthetic comparison',note:'Constructed verification, not natural success rate.',label:'stable',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1,turns:1,stage:2,combatRules:4};return s;}
const report={scope:'Independent comparison audit; actual equip transition is HP/ward oracle; face reachability exhaustive; no browser claims',at:new Date().toISOString(),node:process.version,baselineRoot:baseline,currentRoot:current,scriptSha256:hash(readFileSync(new URL(import.meta.url),'utf8')),hashes:hashes(),diceCombinations:Object.values(reachability).reduce((n,row)=>n+row.combinations,0),reachability,status:'RUNNING',rows:[],natural:[],unchangedScoringAndCards:true,unknownFieldsPreserved:true};
function check(s,candidate,slot,label,{view=true}={}){
 const raw=S.encodeSave(s),beforeScore=E.compareEquipment(s,candidate,slot),old=B.equipmentComparisonDetails(s,candidate,slot),details=C.equipmentComparisonDetails(s,candidate,slot);
 const {context,...preserved}=details;assert.deepEqual(preserved,old,label+' preserves all prior numerical conditions/limits/coverage');
 assert.deepEqual(C.equipmentComparisonHint(s,candidate,slot),B.equipmentComparisonHint(s,candidate,slot));assert.equal(CV.comparison(s,candidate,slot),BV.comparison(s,candidate,slot),'card markup and score unchanged');
 const owned=s.player.items.some(i=>i.id===candidate.id),working=owned?s:{...s,player:{...s.player,items:[...s.player.items,candidate]}};
 const equipped=E.transition(working,{type:'equip',id:candidate.id,slot});assert.notEqual(equipped,working,label+' actual equip must occur');
 const st=E.stats(s),after=E.stats(equipped);assert.deepEqual(context.before,{hp:s.player.hp,maxHp:st.maxHp,ward:s.ward||0});assert.deepEqual(context.after,{hp:equipped.player.hp,maxHp:after.maxHp,ward:equipped.ward||0});assert.equal(context.hpLost,s.player.hp-equipped.player.hp);assert.equal(context.dead,s.phase==='dead');
 const count=E.diceCount(s);assert.equal(context.count,count);const inaccessible=expectedUnavailable(old,count);assert.deepEqual(context.unreachable.map(x=>x.key).sort(),inaccessible,label+' exhaustive dice reachability');
 for(const row of context.unreachable){const minimum=[1,2,3,4,5,6].find(n=>reachability[n][featureByKey[row.key]]);assert.equal(row.requiredDice,minimum);assert.equal(row.unlockLevel,DICE_LEVELS[minimum-1]);assert(row.message.includes('战斗'));if(row.key==='echoChance')assert(row.message.includes('命运'));}
 if(view){const html=CV.equipmentComparisonView(s,candidate,slot);assert(html.includes(`data-comparison-dice-count="${count}"`));for(const key of inaccessible)assert(html.includes(`data-comparison-key="${key}" data-comparison-possible="false"`)||html.includes(`data-comparison-limit="${key}"`));assert.equal(html.includes('data-comparison-context>'),context.showVitals);if(context.hpLost>0)assert(html.includes('换回装备不会补回'));if(context.dead&&context.showVitals)assert(html.includes('换装不会复活'));if(context.showVitals)assert(html.includes('已获得的护盾保留'));assert(!html.includes('<markup>'));}
 assert.equal(S.encodeSave(s),raw,label+' full save unchanged');assert.deepEqual(E.compareEquipment(s,candidate,slot),beforeScore);assert.equal(s.rng,equipped.rng,label+' equip itself preserves RNG');
 report.rows.push({label,slot:details.slot,count,hp:[context.before.hp,context.after.hp],maxHp:[context.before.maxHp,context.after.maxHp],ward:context.after.ward,unreachable:inaccessible,previousFieldsExact:true,saveSha256:hash(raw),owned});return {context,details,equipped};
}
try{
 // Six native combat-dice counts; a deterministic cross-section of catalog
 // entries covers all actual trait kinds without changing their formulas.
 const entries=[...CATALOG_BY_ID.values()].filter(e=>e.profile===0&&[0,4,7].includes(e.rarity));
 for(const level of DICE_LEVELS)for(const entry of entries){
  const s=scene(level),candidate=item(entry.id,'i6',17);s.player.items.push(candidate);s.nextId=7;s.player.hp=Math.max(1,Math.floor(E.stats(s).maxHp*.27));
  freeze(s);check(s,candidate,entry.slot==='relic'?'relic2':undefined,`catalog/${level}/${entry.id}`,{view:false});
 }
 for(const hpState of ['full','wounded','dead'])for(const [oldLevel,newLevel]of [[1,100],[100,1],[100,100],[100,101],[1e13,1]]){
  const s=scene(11);s.player.items[1].level=oldLevel;const candidate=item('armor-0-0-0','i6',newLevel);s.player.items.push(candidate);s.nextId=7;s.player.hp=hpState==='dead'?0:hpState==='wounded'?7:E.stats(s).maxHp;if(hpState==='dead')s.phase='dead';s.ward=1e15;freeze(s);check(s,candidate,undefined,`HP/${hpState}/${oldLevel}->${newLevel}`);
 }
 // Pure previews must retain the compact-equipped inventory contract used by
 // cards, and each explicit relic slot must correspond to the real action.
 for(const slot of ['relic','relic2','relic3']){
  const s=scene(1),candidate=item('v5-relic-4-0-4','i6',1);s.nextId=7;freeze(s);freeze(candidate);check(s,candidate,slot,'unowned compact preview/'+slot);
 }
 // Regenerate every natural fixture through ordinary legal actions. No
 // external audit directory or pre-generated fixture is needed. Only runId
 // metadata is fixed for reproducible evidence; gameplay fields are untouched.
 const naturalTrace=[],step=(state,action)=>{
  assert(E.canAct(state,action),'natural action must be legal: '+JSON.stringify(action));
  const next=E.transition(state,action);assert.notEqual(next,state);assert(S.validateSave(next));
  naturalTrace.push({action,phase:next.phase,revision:next.revision,rng:next.rng,hp:next.player.hp,maxHp:E.stats(next).maxHp,ward:next.ward||0});return next;
 };
 let natural=E.newGame(3);natural.runId='natural-comparison-audit-seed3';
 for(const action of [{type:'fate'},{type:'enter'},{type:'roll'},{type:'roll'},{type:'open'}])natural=step(natural,action);
 assert.equal(natural.phase,'loot');assert.equal(natural.player.items[3].id,'i4');
 const candidate=natural.player.items.find(i=>i.id==='i4');check(freeze(natural),candidate,undefined,'natural seed3 loot');
 const combat=step(natural,{type:'next'});assert.equal(combat.phase,'combat');
 assert.equal(combat.player.hp,165);assert.equal(E.stats(combat).maxHp,165);assert.equal(combat.ward,4);
 const equipped=step(combat,{type:'equip',id:'i4'}),beforeClamp=step(equipped,{type:'roll'});
 assert.equal(equipped.player.hp,165);assert.equal(E.stats(equipped).maxHp,224);assert.equal(equipped.ward,4);
 assert.equal(beforeClamp.player.hp,173);assert.equal(beforeClamp.ward,3);
 for(const [name,s,candidateId]of [['combat',combat,'i4'],['before-clamp',beforeClamp,'i2']]){
  const candidate=s.player.items.find(i=>i.id===candidateId),result=check(freeze(s),candidate,undefined,'natural seed3 '+name);
  report.natural.push({name,...result.context,fullInputSha256:hash(S.encodeSave(s))});
 }
 const swapped=step(beforeClamp,{type:'equip',id:'i2'});assert.equal(swapped.player.hp,165);assert.equal(swapped.ward,3);
 report.naturalProvenance={seed:3,runIdMetadata:'normalized only; no gameplay field adjustment',source:'ordinary baseline-engine actions, all canAct and validateSave checks pass',trace:naturalTrace};
 // A naturally present low-dice row reaches the UI with all its old numeric
 // values intact; only the explicit combat-count explanation is new.
 assert(report.rows.some(row=>row.label==='natural seed3 loot'&&row.unreachable.length>0));
 for(const f of ['src/engine.js','src/equipment.js','src/storage.js','src/deep-rules.js','src/content.js'])assert.equal(report.hashes.baseline[f],report.hashes.current[f],f+' unchanged core');
 assert.deepEqual(hashes(),report.hashes,'source stable during review');assert.equal(hash(readFileSync(new URL(import.meta.url),'utf8')),report.scriptSha256,'script stable during review');report.sourceAndScriptStable=true;report.status='PASS';
}catch(e){report.status='FAIL';report.error={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;}
report.completedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,diceCombinations:report.diceCombinations,natural:report.natural,coreUnchanged:report.status==='PASS',error:report.error,output},null,2));
