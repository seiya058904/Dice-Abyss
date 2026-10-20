// Reviewer-owned, offline XP boundary audit. Uses independent arithmetic and
// real public transitions; no implementation preview is used as its oracle.
// Example:
// node scripts/qa-xp-round10-independent.mjs --baseline /tmp/input/Dice-Abyss --source . --output /tmp/independent-xp.json
// Baseline reproduction only:
// node scripts/qa-xp-round10-independent.mjs --source /tmp/input/Dice-Abyss --baseline-only --output /tmp/xp-before.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const XP_LIMIT=100_000_000,LEVEL_LIMIT=1_000_000,POINT_LIMIT=2_000_000;
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const actionId=key=>key==='starlibrary'?'study':key==='exchange'?'salvage':'accept';
const ui={screen:'game',view:'game',busy:false,forging:false};

export async function loadAuditModules(root){
 const module=file=>import(pathToFileURL(resolve(root,file)));
 const [E,C,S,V]=await Promise.all([module('src/engine.js'),module('src/encounters.js'),module('src/storage.js'),module('src/views.js')]);
 return {E,C,S,V};
}

// These are valid synthetic edge saves, not naturally reached level/cap claims.
// The memory archive is selected by the real mystery picker (seed 3), not by
// replacing its registered event after entering the room.
export function makeXpFixture({E,S},key,{level=100,xp=0,points=0,gold=1e10,costGold}={}){
 const type=key==='memory_archive'?'mystery':key;
 let s=E.newGame(key==='memory_archive'?3:7919);
 s.runId=`round10-independent-${key}`;s.floor=140;
 s.player.level=level;s.player.xp=xp;s.player.talentPoints=points;s.player.gold=gold;
 s.reviewMetadata={preserved:['unknown XP audit field',{number:17,text:'原额 <> & 😀'}]};
 s.player.reviewMetadata={preserved:true};
 if(key==='exchange')s.player.items.push(E.makeItem(s,'weapon',1));
 s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,index)=>({id:`f140r${index}`,type,done:false,quality:0}));
 assert(S.validateSave(s),'fixture route is an accepted input');
 s=E.transition(s,{type:'enter'});
 assert.equal(s.event?.key,key,'registered event comes from its native entrance');
 if(costGold!==undefined)s.event.costGold=costGold;
 assert(S.validateSave(s),'fixture event is an accepted input');
 return s;
}

export function xpNominal(key,level){
 return key==='starlibrary'?Math.min(1e6,100+level*10):Math.min(1e6,40+level*5);
}

// k upgrades cost the arithmetic sum 5*k^2 + (10*L+13)*k.
// This checks admission before conversion and avoids copying gainXp's loop.
export function xpOracle(input,rawXp){
 const p=input.player,creditedXp=Math.min(rawXp,XP_LIMIT-p.xp),pool=p.xp+creditedXp;
 const cost=k=>5*k*k+(10*p.level+13)*k;
 const linear=10*p.level+13;
 let gained=Math.min(LEVEL_LIMIT-p.level,Math.max(0,Math.floor((Math.sqrt(linear*linear+20*pool)-linear)/10)));
 // Floating-point rounding exactly at an integer threshold is corrected using
 // safe-integer comparisons, independently of how the product loops upgrades.
 while(gained>0&&cost(gained)>pool)gained--;
 while(gained<LEVEL_LIMIT-p.level&&cost(gained+1)<=pool)gained++;
 const talentCredit=Math.min(2*gained,POINT_LIMIT-p.talentPoints);
 return {rawXp,creditedXp,overflowXp:rawXp-creditedXp,beforeXp:p.xp,acceptedXp:pool,atCap:p.xp===XP_LIMIT,limited:creditedXp<rawXp,
  levelsGained:gained,afterLevel:p.level+gained,xpSpent:cost(gained),afterXp:pool-cost(gained),talentCredit,afterPoints:p.talentPoints+talentCredit};
}

export function experienceContract(oracle){
 return Object.fromEntries(['rawXp','creditedXp','overflowXp','beforeXp','acceptedXp','atCap','limited'].map(key=>[key,oracle[key]]));
}

function assertActualProgress(before,after,oracle){
 assert.equal(after.player.level,oracle.afterLevel,'level follows accumulated XP cost');
 assert.equal(after.player.xp,oracle.afterXp,'saved XP is the amount after conversion');
 assert.equal(after.player.talentPoints,oracle.afterPoints,'only available talent capacity is credited');
 assert.equal(after.player.xp+oracle.xpSpent-before.player.xp,oracle.creditedXp,'receipt is gross admitted XP, never net counter difference');
}

function withoutNarrative(state){
 const copy=structuredClone(state);delete copy.log;
 if(copy.event)delete copy.event.outcome;
 return copy;
}
function selected({C},s){return C.eventChoices(s).find(option=>option.id===actionId(s.event.key));}
function roundTrip({S},s){assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);}
function textNumbers(text){return text.replace(/[,，]/g,'');}
function receiptIn(text,oracle){
 return new RegExp(`经验(?:可)?计入\\s*${oracle.creditedXp}(?:\\D|$)`).test(textNumbers(text));
}

export function verifyXpFixture(modules,before,{checkText=true}={}){
 const {E,C,S,V}=modules,snapshot=JSON.stringify(before),key=before.event.key;
 const quote=selected(modules,before),oracle=xpOracle(before,xpNominal(key,before.player.level));
 assert(quote&&!quote.disabled,'same eligible paid/exchange choice remains available');
 const render=V.center(before,ui);assert(!/(?:NaN|Infinity)/.test(render));
 assert.equal(JSON.stringify(before),snapshot,'all preview and render reads are pure');
 if(checkText)assert.deepEqual(quote.experience,experienceContract(oracle),'ephemeral structured UI quote matches independent oracle');
 const action={type:'event-choice',id:actionId(key),confirmed:true};
 assert.strictEqual(E.transition(before,{...action,confirmed:false}),before,'an unconfirmed charge cannot commit');
 const after=E.transition(before,action);assert.notStrictEqual(after,before);assertActualProgress(before,after,oracle);
 assert.equal(JSON.stringify(before),snapshot,'transaction does not mutate caller state');
 assert.equal(after.rng,before.rng,'XP-only settlement never draws RNG');
 const paid=key==='exchange'?0:before.event.costGold;
 assert.equal(after.player.gold,key==='exchange'?Math.min(1e10,before.player.gold+before.event.costGold):before.player.gold-paid);
 assert.equal(after.player.items.length,before.player.items.length-(key==='exchange'?1:0));
 assert.deepEqual(after.player.equipped,before.player.equipped);
 assert.deepEqual(after.reviewMetadata,before.reviewMetadata);assert.deepEqual(after.player.reviewMetadata,before.player.reviewMetadata);
 assert.equal(Object.hasOwn(after.event,'experience'),Object.hasOwn(before.event,'experience'),'UI quote is not a new saved field');
 assert.strictEqual(E.transition(after,action),after,'resolved events cannot charge or credit twice');
 const left=E.transition(before,{type:'event-choice',id:'leave'});
 assert.deepEqual(left.player,before.player,'leave preserves every player asset');assert.equal(left.rng,before.rng);
 roundTrip(modules,before);roundTrip(modules,after);roundTrip(modules,left);
 const loaded=S.decodeSave(S.encodeSave(after));assert.equal(loaded.event.outcome,after.event.outcome);
 assert.equal(C.eventChoices(loaded).length,0,'restored resolved event has no replayable choice');
 assert(V.center(loaded,ui).includes(after.event.outcome.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')),'resolved receipt survives render/reload');
 const hasPendingReceipt=receiptIn(quote.reward,oracle),hasOutcomeReceipt=receiptIn(after.event.outcome,oracle),hasConfirmReceipt=receiptIn(quote.confirm||'',oracle);
 if(checkText&&oracle.limited){assert(hasPendingReceipt,'partial/zero receipt is shown before commit');assert(hasConfirmReceipt,'confirmation includes accepted XP');assert(hasOutcomeReceipt,'result records accepted XP');}
 for(const entry of after.log)assert(entry.text.length<=180,'all new log text fits the unchanged save limit');
 assert(after.event.outcome.length<=180,'new outcome fits unchanged event limit');
 return {before,after,oracle,quote,row:{key,level:before.player.level,xp:before.player.xp,points:before.player.talentPoints,costGold:before.event.costGold,...oracle,
  paid,goldDelta:after.player.gold-before.player.gold,xpCounterDelta:after.player.xp-before.player.xp,levelDelta:after.player.level-before.player.level,
  reward:quote.reward,confirmation:quote.confirm,outcome:after.event.outcome,hasPendingReceipt,hasConfirmReceipt,hasOutcomeReceipt,
  quotePresent:!!quote.experience,beforeSha256:digest(before),afterSha256:digest(after),validBefore:true,validAfter:true,roundTrips:4,purePreview:true,noReplay:true}};
}

export function verifyPointLogs(modules,key,points,{checkText=true}={}){
 const before=makeXpFixture(modules,key,{level:100,xp:1017,points});
 const result=verifyXpFixture(modules,before,{checkText}),logs=result.after.log.filter(entry=>entry.text.startsWith('升至 Lv.'));
 const entries=logs.toReversed();let remaining=POINT_LIMIT-points;
 for(const entry of entries){
  const accepted=Math.min(2,remaining);remaining-=accepted;
  if(checkText){
   const text=textNumbers(entry.text);
   assert(new RegExp(`(?:获得|计入)\\s*${accepted}\\s*天赋点`).test(text),`upgrade must disclose ${accepted} actual talent points: ${text}`);
   if(accepted<2)assert(/上限|未计入/.test(text),'a capped point receipt explains its capacity');
  }
 }
 return {key,points,levelsGained:result.oracle.levelsGained,actualPointCredit:result.oracle.talentCredit,logs:logs.map(entry=>entry.text),inputValid:true,outputValid:true};
}

export function makeCombatXpFixture({E,S},type,{level=1e6,xp=1e8,points=0}={}){
 let s=E.newGame(7919);s.runId=`round10-independent-combat-${type}`;s.floor=140;
 s.player.level=level;s.player.xp=xp;s.player.talentPoints=points;s.player.hp=E.stats(s).maxHp;
 s.fate=[3,4];s.phase='route';s.route=[type,'combat','rest','combat','gold','boss'].map((type,index)=>({id:`f140r${index}`,type,done:false,quality:0}));
 s=E.transition(s,{type:'enter'});
 // A valid imported near-death enemy guarantees that one native manual roll
 // reaches the XP entrance. Dice and reward generation remain unforced.
 s.enemy.hp=1;s.enemy.shield=0;s.log=[];
 assert(S.validateSave(s));return s;
}

export function verifyCombatXpFixture(modules,before,{checkText=true}={}){
 const {E,S}=modules,snapshot=JSON.stringify(before),factor=before.enemy.type==='boss'?2.5:before.enemy.type==='elite'?1.5:1;
 const rawXp=Math.round((15+E.depthPower(before.floor)*4)*factor),oracle=xpOracle(before,rawXp),after=E.transition(before,{type:'roll'});
 assert.equal(after.phase,'chest');assert(after.lastRoll.killed);assertActualProgress(before,after,oracle);assert.equal(JSON.stringify(before),snapshot);
 assert.equal(after.counters.kills,before.counters.kills+1);roundTrip(modules,before);roundTrip(modules,after);
 if(checkText&&oracle.limited)assert(after.log.some(entry=>receiptIn(entry.text,oracle)),'combat overflow receipt must survive the final kill/reward log');
 if(checkText&&before.player.talentPoints===POINT_LIMIT&&oracle.levelsGained>0)for(const entry of after.log.filter(entry=>entry.text.startsWith('升至 Lv.'))){assert(/(?:获得|计入)\s*0\s*天赋点/.test(textNumbers(entry.text)));assert(/上限|未计入/.test(entry.text));}
 const opened=E.transition(after,{type:'open'});assert.equal(opened.player.xp,after.player.xp);assert.equal(opened.player.level,after.player.level);assert.equal(opened.player.talentPoints,after.player.talentPoints);
 assert.strictEqual(E.transition(opened,{type:'open'}),opened);roundTrip(modules,opened);
 return {after,row:{type:before.enemy.type,level:before.player.level,xp:before.player.xp,points:before.player.talentPoints,...oracle,log:after.log,roll:after.lastRoll,rawStateSha256:digest(after),validBefore:true,validAfter:true,roundTrips:3,noXpFromOpening:true}};
}

export async function runIndependentXpAudit({source,baseline=source,baselineOnly=false}){
 const current=await loadAuditModules(source),old=await loadAuditModules(baseline);
 const files=['src/engine.js','src/encounters.js','src/deep-rules.js','src/storage.js','src/views.js','src/experience.js'];
 const hashes=async root=>Object.fromEntries(await Promise.all(files.map(async file=>{try{return [file,digest(await readFile(resolve(root,file),'utf8'))];}catch(error){if(error.code==='ENOENT'&&file==='src/experience.js')return [file,null];throw error;}})));
 const beforeHashes={baseline:await hashes(baseline),current:await hashes(source)},started=performance.now();
 const report={audit:'round10-independent-xp',baselineOnly,source,baseline,scriptSha256:digest(await readFile(fileURLToPath(import.meta.url))),
  environment:{node:process.version,platform:process.platform,arch:process.arch},method:'Independent synthetic legal boundary saves, native enter/event-choice transitions and a cumulative-level-cost oracle. No human-play or natural-incidence claim.',
  sourceHashes:beforeHashes,rows:[],combatRows:[],pointLogs:[],paymentBoundaries:[],storageFaults:[],failures:[],checks:{eventRows:0,combatRows:0,nonNarrativeStateComparisons:0,roundTrips:0,pointLogRows:0,paymentBoundaries:0,storageFaults:0}};
 const record=(name,fn)=>{try{fn();}catch(error){report.failures.push({name,message:error.message,stack:error.stack});}};
 const scenarios=[
  {name:'fresh',level:1,xp:0},{name:'cross-one-or-two-levels',level:100,xp:1017},
  {name:'imported-large-stored-XP-partial',level:100,xp:XP_LIMIT-10},{name:'imported-full-stored-XP',level:100,xp:XP_LIMIT},
  {name:'max-level-room-remains',level:LEVEL_LIMIT,xp:0},{name:'max-level-exact-credit',level:LEVEL_LIMIT,xp:XP_LIMIT-1e6},
  {name:'max-level-one-overflow',level:LEVEL_LIMIT,xp:XP_LIMIT-1e6+1},{name:'max-level-ten-room',level:LEVEL_LIMIT,xp:XP_LIMIT-10},
  {name:'max-level-one-room',level:LEVEL_LIMIT,xp:XP_LIMIT-1},{name:'max-level-no-room',level:LEVEL_LIMIT,xp:XP_LIMIT},
  {name:'last-level-transition',level:LEVEL_LIMIT-1,xp:18+(LEVEL_LIMIT-1)*10-1}
 ];
 for(const key of ['memory_archive','starlibrary','exchange'])for(const scenario of scenarios)for(const points of [0,POINT_LIMIT-1,POINT_LIMIT])record(`${key}/${scenario.name}/${points}`,()=>{
  const before=makeXpFixture(old,key,{...scenario,points});assert(current.S.validateSave(before));
  const result=verifyXpFixture(current,before,{checkText:!baselineOnly});
  const original=old.E.transition(before,{type:'event-choice',id:actionId(key),confirmed:true});
  assert.deepEqual(withoutNarrative(result.after),withoutNarrative(original),'all non-narrative state, including XP, points, RNG, price, HP, items and unknown fields, matches input version');
  assert.deepEqual(old.S.decodeSave(current.S.encodeSave(result.after)),result.after);
  assert.deepEqual(current.S.decodeSave(old.S.encodeSave(original)),original);
  report.rows.push({scenario:scenario.name,...result.row,baselineOutcome:original.event.outcome,baselineAfterSha256:digest(original),narrativeChanged:digest(result.after.log)!==digest(original.log)||result.after.event.outcome!==original.event.outcome});
  report.checks.eventRows++;report.checks.nonNarrativeStateComparisons++;report.checks.roundTrips+=result.row.roundTrips+2;
 });
 for(const key of ['memory_archive','starlibrary','exchange'])for(const points of [POINT_LIMIT-2,POINT_LIMIT-1,POINT_LIMIT])record(`point-log/${key}/${points}`,()=>{
  report.pointLogs.push(verifyPointLogs(current,key,points,{checkText:!baselineOnly}));report.checks.pointLogRows++;report.checks.roundTrips+=4;
 });
 for(const type of ['combat','elite','boss'])for(const config of [{level:LEVEL_LIMIT,xp:XP_LIMIT},{level:LEVEL_LIMIT,xp:XP_LIMIT-10},{level:LEVEL_LIMIT,xp:0},{level:100,xp:1017,points:POINT_LIMIT}])record(`combat/${type}/${config.level}/${config.xp}`,()=>{
  const before=makeCombatXpFixture(old,type,config),result=verifyCombatXpFixture(current,before,{checkText:!baselineOnly}),original=old.E.transition(before,{type:'roll'});
  assert.deepEqual(withoutNarrative(result.after),withoutNarrative(original),'combat results, XP, items, dice and RNG remain equal to the input version');
  report.combatRows.push({...result.row,baselineLog:original.log});report.checks.combatRows++;report.checks.nonNarrativeStateComparisons++;report.checks.roundTrips+=3;
 });
 // Imported V5 events may have a stored price different from today's formula.
 // Existing permission and exact registered charges must remain authoritative.
 for(const key of ['memory_archive','starlibrary'])for(const costGold of [0,1,1e8])for(const shortage of [false,true])record(`payment/${key}/${costGold}/${shortage}`,()=>{
  if(shortage&&costGold===0)return;
  const before=makeXpFixture(old,key,{level:LEVEL_LIMIT,xp:XP_LIMIT,costGold,gold:shortage?costGold-1:costGold});
  const action={type:'event-choice',id:actionId(key),confirmed:true},original=old.E.transition(before,action),after=current.E.transition(before,action),quote=selected(current,before);
  assert.equal(quote.disabled,shortage);assert.equal(after===before,shortage);assert.equal(original===before,shortage);
  assert.deepEqual(withoutNarrative(after),withoutNarrative(original));
  if(!shortage)assert.equal(after.player.gold,0,'exact registered amount is charged, including a zero-cost event');
  roundTrip(current,after);report.paymentBoundaries.push({key,costGold,shortage,allowed:!shortage,goldAfter:after.player.gold});report.checks.paymentBoundaries++;report.checks.roundTrips++;
 });
 // saveGame is the transaction boundary used after an engine result is created.
 // Tests retain both existing keys and their exact raw bytes on refused saves.
 for(const key of ['memory_archive','starlibrary'])for(const fault of ['primary-write','stale-expected','mirror-write'])record(`storage/${key}/${fault}`,()=>{
  const before=makeXpFixture(current,key,{level:LEVEL_LIMIT,xp:XP_LIMIT-10}),after=current.E.transition(before,{type:'event-choice',id:actionId(key),confirmed:true}),S=current.S;
  const raw=S.encodeSave(before),map=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),writes=[];
  const storage={getItem:k=>map.get(k)??null,setItem(k,v){writes.push(k);if((fault==='primary-write'&&k===S.SAVE_KEY)||(fault==='mirror-write'&&k===S.BACKUP_KEY))throw Error('independent injected write failure');map.set(k,v);},removeItem:k=>map.delete(k)};
  let expected=before;if(fault==='stale-expected'){expected=structuredClone(before);expected.reviewMetadata.preserved.push('stale hidden field');}
  let result,error;try{result=S.saveGame(after,expected,storage);}catch(caught){error=caught.message;}
  if(fault==='mirror-write'){
   assert(!error,'mirror failure is recoverable once primary commit succeeded');assert.equal(result.mirrored,false);assert(result.warning,'mirror failure remains visible');assert.deepEqual(S.decodeSave(map.get(S.SAVE_KEY)),after);assert.equal(map.get(S.BACKUP_KEY),raw);
  }else{assert(error,'unsafe commit must be refused with an error');assert.equal(map.get(S.SAVE_KEY),raw);assert.equal(map.get(S.BACKUP_KEY),raw);}
  assert.deepEqual(S.loadSave(storage).state,fault==='mirror-write'?after:before);
  report.storageFaults.push({key,fault,writes,error:error||null,primaryCommitted:fault==='mirror-write',originalMirrorPreserved:true});report.checks.storageFaults++;
 });
 const afterHashes={baseline:await hashes(baseline),current:await hashes(source)};
 assert.deepEqual(afterHashes,beforeHashes,'source must remain stable while this audit runs');
 report.sourceStable=true;report.durationSeconds=(performance.now()-started)/1000;report.status=report.failures.length?'FAIL':baselineOnly?'BASELINE_REPRODUCED':'PASS';
 report.limitations=['Synthetic extreme saves do not measure how often a player reaches caps.','Ephemeral option.experience is checked against independent arithmetic; it is never saved as a new state field.','Non-narrative A/B equality excludes only log and event.outcome. Those two text surfaces are separately checked for accepted amounts, point caps and unchanged validator length limits.','No browser, hardware, storage-quota, physical-power-loss or multiplayer concurrency claim is made.','A mirror write failure occurs after the authoritative primary commit and is reported as a recoverable condition, never as a rollback.'];
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--baseline-only'){options.baselineOnly=true;continue;}assert(['--source','--baseline','--output'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--'),'Use --source ROOT [--baseline ROOT | --baseline-only] --output EXTERNAL_JSON');options[key.slice(2)]=args[++i];}
 assert(options.output,'an explicit external evidence path is required');
 const source=await realpath(resolve(options.source||packageRoot)),baseline=await realpath(resolve(options.baseline||source)),output=resolve(options.output);
 const canonical=async path=>{try{return await realpath(path);}catch(error){if(error.code!=='ENOENT')throw error;const parent=dirname(path);assert.notEqual(parent,path);return resolve(await canonical(parent),relative(parent,path));}};
 const realOutput=await canonical(output);
 for(const root of [source,baseline,await realpath(packageRoot)])for(const candidate of [output,realOutput]){const name=relative(root,candidate);assert(name&&(isAbsolute(name)||name==='..'||name.startsWith('..'+sep)),'evidence must be written outside either project and the script package, including symlinks');}
 const report=await runIndependentXpAudit({source,baseline,baselineOnly:!!options.baselineOnly});
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,status:report.status,checks:report.checks,failures:report.failures.length,durationSeconds:report.durationSeconds}));
  if(report.failures.length){console.error(JSON.stringify(report.failures.map(failure=>({name:failure.name,message:failure.message.split('\n')[0]})),null,2));process.exitCode=1;}
}
