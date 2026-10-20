import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {eventFixture} from './audit-event-context.mjs';

// Pure Node HTML generation only. Every timed state and output is checked
// outside the interval; no browser, localStorage, cache or RNG instrumentation.
const [baselineRoot,preReuseRoot,currentRoot,outputPath,...flags]=process.argv.slice(2);
if(!baselineRoot||!preReuseRoot||!currentRoot||!outputPath||flags.some(flag=>flag!=='--verify-only'))throw Error('Usage: node audit-view-reuse-round21.mjs BASELINE_ROOT PRE_REUSE_ROOT CURRENT_ROOT OUTPUT_JSON [--verify-only]');
const verifyOnly=flags.includes('--verify-only'),at=(root,file)=>pathToFileURL(resolve(root,file));
const B=await import(at(baselineRoot,'src/views.js')),P=await import(at(preReuseRoot,'src/views.js')),C=await import(at(currentRoot,'src/views.js'));
const E=await import(at(baselineRoot,'src/engine.js')),S=await import(at(currentRoot,'src/storage.js')),Content=await import(at(baselineRoot,'src/content.js'));
const PB=await import(at(preReuseRoot,'src/boon-readout.js')),CB=await import(at(currentRoot,'src/boon-readout.js'));
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceHashes=()=>Object.fromEntries([['baseline',baselineRoot],['preReuse',preReuseRoot],['current',currentRoot]].map(([name,root])=>[name,Object.fromEntries(['src/views.js','src/boon-readout.js','src/engine.js','src/storage.js','src/release.js'].map(file=>[file,sha(readFileSync(at(root,file),'utf8'))]))]));
const hashes=sourceHashes(),scriptHash=sha(readFileSync(new URL(import.meta.url),'utf8'));
const summary=values=>{const s=[...values].sort((a,b)=>a-b);return{n:s.length,min:s[0],median:(s[(s.length-1)>>1]+s[s.length>>1])/2,p90:s[Math.ceil(s.length*.9)-1],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1),mean:s.reduce((a,b)=>a+b,0)/s.length};};
const scene=(type='combat')=>eventFixture({E,S},type,{seed:27017,floor:200,rich:true});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const uiGame={view:'game',busy:false,rolling:false,forging:false};
const report={kind:'Round21 per-render stats and benefit model reuse; exact pre-reuse HTML differential and fixed three-way Node CPU timing',createdAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,baselineRoot:resolve(baselineRoot),preReuseRoot:resolve(preReuseRoot),currentRoot:resolve(currentRoot),sourceHashes:hashes,scriptSha256:scriptHash,verifyOnly,status:'RUNNING',differential:[],crossCall:[],timing:{status:verifyOnly?'NOT_RUN':'RUNNING',samplesPerVariantPerCell:24,warmupTriplesPerCell:6,method:'All six baseline/preReuse/current permutations repeated four times per cell after one full warmup cycle. The two exact seed27017 combat fixtures match the earlier zero-benefit32-item and10000-item late-equip cells. Time only complete gameView HTML generation. Setup, state/RNG checks, full output equality and hashes are outside intervals. Parent coordinates no competing agent browser or heavy Node jobs; other shared-host load remains uncontrolled. No DOM/layout/paint/native input/GPU measurement.',cells:[]}};
function compare(name,state,ui=uiGame){
 const before=JSON.stringify({state,ui}),outputs={};
 for(const key of ['gameView','center','routeRail','boonReadoutView','equipmentRail','footer']){
  const previous=key==='equipmentRail'?P[key](state):P[key](state,ui),current=key==='equipmentRail'?C[key](state):C[key](state,ui);assert.equal(current,previous,`${name}: ${key}`);outputs[key]={characters:current.length,sha256:sha(current)};
 }
 const previous=PB.boonReadout(state),current=CB.boonReadout(state);assert.deepEqual(current,previous,`${name}: benefit model`);assert.deepEqual(CB.boonReadout(state,E.stats(state)),previous,`${name}: supplied stats`);
 assert.equal(JSON.stringify({state,ui}),before,`${name}: render state/UI/RNG immutable`);
 report.differential.push({name,phase:state.phase,view:ui.view||'game',validSave:S.validateSave(state),stateSha256:sha(state),outputs,benefitModelSha256:sha(current),exactlyEqual:true,stateUiAndRngUnchanged:true});
 return outputs.gameView.sha256;
}
function renderFixture(count){
 let state=E.newGame(27017);state.runId='render-storage-audit';const starters=state.player.items.slice();
 while(state.player.items.length<count)state.player.items.push(E.makeItem(state,undefined,state.nextId%8));
 if(count===10000)state.player.items=[...state.player.items.slice(3),...starters];
 state.floor=200;state.player.level=100;state.player.hp=E.stats(state).maxHp;state.fate=[3,4];state.phase='route';
 state.route=['combat','combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));
 state=E.transition(state,{type:'enter'});assert.equal(state.phase,'combat');assert.equal(state.nextLuck||0,0);assert.equal(state.eventLuck||0,0);assert.equal(E.stats(state).firstCritLuck,0);assert(S.validateSave(state));return state;
}
try{
 compare('new fate',E.newGame(27017));
 compare('route selected',E.transition(E.newGame(27017),{type:'fate'}));
 for(const type of Object.keys(Content.ROOM_NAMES))compare(`room/${type}`,scene(type));
 const live=scene(),all=structuredClone(live);Object.assign(all,{nextLuck:15,eventLuck:8,eventPower:15,blessing:2,v5Boons:{echo:1,ward:1}});all.player.talents.dawnCrit=3;all.enemy.openingEcho=.25;
 const variants=[['no benefits',live],['all benefits',all]];
 for(const flag of [undefined,false,true]){const s=structuredClone(all);if(flag===undefined)delete s.enemy.firstCritUsed;else s.enemy.firstCritUsed=flag;variants.push([`firstCritUsed ${String(flag)}`,s]);}
 const dead=structuredClone(all);dead.phase='dead';dead.player.hp=0;variants.push(['dead',dead]);
 const cleared=structuredClone(all);cleared.phase='cleared';cleared.roomIndex=5;cleared.route.forEach(r=>r.done=true);variants.push(['cleared',cleared]);
 const complete=structuredClone(cleared);complete.phase='complete';complete.completed=true;variants.push(['complete',complete]);
 const oneHit=structuredClone(all);oneHit.enemy.hp=1;oneHit.enemy.shield=0;const chest=E.transition(oneHit,{type:'roll'});assert.equal(chest.phase,'chest');variants.push(['chest after actual roll',chest]);
 const loot=E.transition(chest,{type:'open'});assert.equal(loot.phase,'loot');variants.push(['loot after actual claim',loot]);
 variants.push(['impact with committed dead enemy',{...chest,phase:'combat'}]);
 const forge=scene('forge');variants.push(['forge after actual commit',E.transition(forge,{type:'forge',id:forge.player.equipped.weapon})]);
 variants.push(['fusion workbench',scene('fusion')],['resolved gambit',E.transition(scene('gambit'),{type:'event-choice',id:'roll',confirmed:true})]);
 for(const [name,s]of variants)for(const [uiName,ui]of [['ready',uiGame],['rolling',{...uiGame,busy:true,rolling:true,rollValues:[6,6,6,6,6,6]}],['impact',{...uiGame,busy:true}],['details',{...uiGame,boonDetails:true,saveError:'测试 <存档> & warning'}]])compare(`${name}/${uiName}`,s,ui);
 for(const [name,s]of [['combat',all],['fusion',scene('fusion')],['event',scene('wardbank')],['loot',loot],['dead',dead]])for(const ui of [{...uiGame,view:'inventory',inventoryPage:50,inventorySlot:'relic',inventoryDefense:'regen'},{...uiGame,view:'talents',talentGroup:'critical',talentCount:5},{...uiGame,view:'codex',codexSource:'boss',codexCategory:'event'}])compare(`${name}/${ui.view}`,s,ui);
 compare('frozen all benefits',freeze(structuredClone(all)),freeze({...uiGame,boonDetails:true}));
 const mutable=scene(),armor=E.makeItem(mutable,'armor',7);mutable.player.items.push(armor);const steps=[];
 steps.push(compare('same object/before equip',mutable));
 mutable.player.equipped.armor=armor.id;mutable.player.talents.dawnCrit=3;mutable.player.hp=Math.min(mutable.player.hp,E.stats(mutable).maxHp);steps.push(compare('same object/equip and talent',mutable));
 mutable.enemy.firstCritUsed=true;steps.push(compare('same object/spent',mutable));
 mutable.player.equipped.armor='i2';mutable.player.talents.dawnCrit=0;mutable.player.hp=Math.min(mutable.player.hp,E.stats(mutable).maxHp);steps.push(compare('same object/remove effect',mutable));
 assert.equal(new Set(steps).size,3);assert.equal(steps[3],steps[0]);report.crossCall.push({kind:'Same-object equipment/talent/spent-trigger mutation between renders',hashes:steps,exactPreReuseMatchEveryCall:true,restoringEquipmentAndTalentRestoresOriginalHTML:true});
 const next=E.transition(all,{type:'roll'}),before=JSON.stringify(all);C.gameView(all,uiGame);C.gameView(all,{...uiGame,busy:true,rolling:true});assert.equal(JSON.stringify(all),before);assert.deepEqual(E.transition(all,{type:'roll'}),next);report.nextCombatAndRngExactlyUnchanged=true;
 for(const count of [32,10000]){
  const state=renderFixture(count);compare(`large boundary/${count}`,state);
  if(verifyOnly)continue;
  const before=JSON.stringify(state),values={baseline:[],preReuse:[],current:[]},modules={baseline:B,preReuse:P,current:C},html=Object.fromEntries(Object.entries(modules).map(([key,V])=>[key,V.gameView(state,uiGame)]));assert.equal(html.current,html.preReuse);
  const permutations=[['baseline','preReuse','current'],['baseline','current','preReuse'],['preReuse','baseline','current'],['preReuse','current','baseline'],['current','baseline','preReuse'],['current','preReuse','baseline']],order=[];
  for(let triple=-6;triple<24;triple++){
   const variants=permutations[(triple+6)%6];if(triple>=0)order.push(variants);
   for(const name of variants){const start=performance.now(),value=modules[name].gameView(state,uiGame),elapsed=performance.now()-start;if(triple>=0)values[name].push(elapsed);assert.equal(value,html[name]);assert.equal(JSON.stringify(state),before);}
  }
  report.timing.cells.push({name:count===32?'normal combat, 32 items, equipped first':'normal combat, 10000 items, equipped last',items:count,equippedIndices:Object.values(state.player.equipped).filter(Boolean).map(id=>state.player.items.findIndex(item=>item.id===id)),stateSha256:sha(before),order,html:Object.fromEntries(Object.entries(html).map(([key,value])=>[key,{characters:value.length,sha256:sha(value)}])),samplesMs:values,summaryMs:Object.fromEntries(Object.entries(values).map(([key,samples])=>[key,summary(samples)])),pairedCurrentMinusPreReuseMs:values.current.map((n,i)=>n-values.preReuse[i]),pairedCurrentMinusBaselineMs:values.current.map((n,i)=>n-values.baseline[i]),pairedSummaryMs:{currentMinusPreReuse:summary(values.current.map((n,i)=>n-values.preReuse[i])),currentMinusBaseline:summary(values.current.map((n,i)=>n-values.baseline[i]))},preReuseAndCurrentHTMLExactlyEqual:true,stateAndRngUnchanged:true});
 }
 assert.deepEqual(sourceHashes(),hashes,'source changed during audit');assert.equal(sha(readFileSync(new URL(import.meta.url),'utf8')),scriptHash,'script changed during audit');report.sourceAndScriptStable=true;report.status='PASS';if(!verifyOnly)report.timing.status='MEASURED_WITH_LIMITATIONS';
}catch(error){report.status='FAIL';report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
report.completedAt=new Date().toISOString();writeFileSync(resolve(outputPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,differentialCases:report.differential.length,completeHTMLComparisons:report.differential.length*6,sourceAndScriptStable:report.sourceAndScriptStable,timing:report.timing.cells.map(({name,summaryMs,pairedSummaryMs})=>({name,summaryMs,pairedSummaryMs})),error:report.error,output:resolve(outputPath)},null,2));
