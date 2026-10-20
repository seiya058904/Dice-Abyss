// Portable author A/B audit for the Round10 XP-capacity changes.
// Inputs are explicit; reports must stay outside both supplied projects.
// This script imports the projects without changing their runtime source.
import assert from 'node:assert/strict';
import {writeFile,readFile,readdir,realpath,lstat,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve,relative,dirname,basename,isAbsolute,sep} from 'node:path';

const usage=`Usage:
  node audit-xp-core-round10.mjs --baseline <baseline-project> --current <current-project> --output <external-report.json>

All three paths are required and may be absolute or relative to the calling
working directory. --source is an alias for --current. The two projects must
be distinct, and the output must be outside both project trees. No packages
are installed and no runtime files or tests are changed.
`;
const aliases=new Map([['--baseline','baseline'],['--current','current'],['--source','current'],['--output','output']]);
const options={};
for(let i=2;i<process.argv.length;i++){
 const flag=process.argv[i];
 if(flag==='--help'||flag==='-h'){process.stdout.write(usage);process.exit(0);}
 const name=aliases.get(flag),value=process.argv[++i];
 if(!name||!value||value.startsWith('--'))throw Error(`Invalid or missing argument for ${flag}.\n${usage}`);
 if(Object.hasOwn(options,name))throw Error(`Duplicate ${name} input.\n${usage}`);
 options[name]=value;
}
for(const name of ['baseline','current','output'])if(!options[name])throw Error(`Missing explicit ${name} path.\n${usage}`);
const basePath=await realpath(resolve(options.baseline)),candidatePath=await realpath(resolve(options.current));
assert.notEqual(basePath,candidatePath,'Baseline and current must be distinct project directories.');
const within=(root,path)=>{const rel=relative(root,path);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));};
// Resolve any existing parent symlinks before enforcing the external-report
// contract; missing output directories may be created after this check.
async function canonicalOutput(file){
 const absolute=resolve(file);let parent=dirname(absolute);const tail=[basename(absolute)];
 while(true){
  try{return resolve(await realpath(parent),...tail);}
  catch(error){if(error.code!=='ENOENT')throw error;const upper=dirname(parent);if(upper===parent)throw error;tail.unshift(basename(parent));parent=upper;}
 }
}
const out=await canonicalOutput(options.output);
assert(!within(basePath,out)&&!within(candidatePath,out),'Write the report outside both supplied project directories.');
try{assert(!(await lstat(out)).isSymbolicLink(),'The external report path must not be a symbolic link.');}
catch(error){if(error.code!=='ENOENT')throw error;}
const sha=value=>createHash('sha256').update(value).digest('hex');
async function sourceFingerprint(root){
 const files=['package.json',...(await readdir(resolve(root,'src'))).filter(name=>name.endsWith('.js')).sort().map(name=>'src/'+name)],result={};
 for(const file of files)result[file]=sha(await readFile(resolve(root,file)));
 return result;
}
const frozenBaseline=await sourceFingerprint(basePath),frozenCurrent=await sourceFingerprint(candidatePath);
const moduleAt=(root,file)=>import(pathToFileURL(resolve(root,file)).href);
const B=await moduleAt(basePath,'src/engine.js'),E=await moduleAt(candidatePath,'src/engine.js'),BC=await moduleAt(basePath,'src/encounters.js'),C=await moduleAt(candidatePath,'src/encounters.js'),BS=await moduleAt(basePath,'src/storage.js'),S=await moduleAt(candidatePath,'src/storage.js');
const combatXp={combat:174,trial:174,elite:260,boss:434};
const choiceId=key=>key==='starlibrary'?'study':key==='exchange'?'salvage':'accept';
function beforeState(key,level,xp,talentPoints){
 let s=B.newGame(3);s.runId='round10-core-A-B';s.floor=140;s.player.level=level;s.player.xp=xp;s.player.gold=1e10;s.player.talentPoints=talentPoints;s.player.hp=B.stats(s).maxHp;s.fate=[3,4];
 if(key==='exchange')s.player.items.push(B.makeItem(s,'weapon',1));
 const type=key==='memory_archive'?'mystery':key;s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));s.phase='route';s=B.transition(s,{type:'enter'});
 if(combatXp[key]){s.enemy.hp=1;s.enemy.shield=0;}else assert.equal(s.event.key,key);
 s.experience={rawXp:'preserved-custom-root'};s.player.experience={creditedXp:'preserved-custom-player'};if(s.event)s.event.experience={rawXp:'preserved-custom-event'};
 assert(BS.validateSave(s));assert(S.validateSave(s));assert.deepEqual(BS.decodeSave(BS.encodeSave(s)),s);assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);return s;
}
const records=[];
function check(key,level,xp,talentPoints){
 const before=beforeState(key,level,xp,talentPoints),unchanged=structuredClone(before),action=combatXp[key]?{type:'roll'}:{type:'event-choice',id:choiceId(key),confirmed:true};
 const rawXp=combatXp[key]||Math.min(1e6,key==='starlibrary'?100+level*10:40+level*5),accepted=Math.min(rawXp,1e8-xp),overflow=rawXp-accepted;
 const baseline=B.transition(before,action),current=E.transition(before,action);assert.deepEqual(before,unchanged);assert(BS.validateSave(baseline));assert(S.validateSave(current));assert.deepEqual(BS.decodeSave(BS.encodeSave(baseline)),baseline);assert.deepEqual(S.decodeSave(S.encodeSave(current)),current);
 const levels=current.player.level-level,spent=5*levels*levels+(10*level+13)*levels;assert.equal(current.player.xp+spent-xp,accepted);
 const normalizeOutcome=(row,baselineRow)=>{
  const result=structuredClone(row),oldOutcome=baselineRow.event?.outcome,newOutcome=row.event?.outcome;
  if(['memory_archive','starlibrary'].includes(key)&&overflow){
   if(row===current){assert(newOutcome.includes(`经验计入 ${accepted}（原额 ${rawXp}，上限未计入 ${overflow}）`));if(!accepted)assert(newOutcome.includes(`已支付 ${before.event.costGold} 金币`));}
   result.event.outcome=oldOutcome;result.log=result.log.map(o=>o.text===newOutcome?{...o,text:oldOutcome}:o);
  }
  return result;
 };
 const old=normalizeOutcome(baseline,baseline),now=normalizeOutcome(current,baseline);
 let addedReceipt=0;
 now.log=now.log.filter(o=>{
  if(o.text.startsWith('战斗奖励 · ')){
   assert(combatXp[key]&&overflow);assert.equal(o.text,`战斗奖励 · 经验计入 ${accepted}（原额 ${rawXp}，上限未计入 ${overflow}）。`);assert.equal(o.tone,'gold');addedReceipt++;return false;
  }
  return true;
 }).map(o=>{
  if(o.text.includes('（上限未计入 ')&&o.text.startsWith('升至 Lv.')){
   const parts=o.text.match(/获得 ([01]) 天赋点（上限未计入 ([12])）/);assert(parts);assert.equal(Number(parts[1])+Number(parts[2]),2);assert(current.player.talentPoints===2e6);
   return {...o,text:o.text.replace(/获得 [01] 天赋点（上限未计入 [12]）/,'获得 2 天赋点')};
  }
  return o;
 });
 assert.equal(addedReceipt,combatXp[key]&&overflow?1:0);assert.equal(current.log.length,Math.min(6,baseline.log.length+addedReceipt));
 assert.deepEqual(now.log,old.log.slice(0,now.log.length));assert.equal(now.log.length,Math.min(6-addedReceipt,old.log.length));
 // Log edits were verified above; their explicitly displaced oldest line is
 // the original six-entry truncation. All remaining state fields match exactly.
 old.log=now.log;assert.deepEqual(now,old);
 if(!combatXp[key]){
  const beforeChoices=BC.eventChoices(before),nowChoices=C.eventChoices(before);
  assert.deepEqual(nowChoices.map(o=>[o.id,o.disabled,o.reason,o.cost,!!o.confirm]),beforeChoices.map(o=>[o.id,o.disabled,o.reason,o.cost,!!o.confirm]));
  const metadata=nowChoices.find(o=>o.id===choiceId(key)).experience;assert.equal(metadata.creditedXp,accepted);assert.equal(metadata.rawXp,rawXp);assert.equal(metadata.acceptedXp,xp+accepted);
 }
 const sameRaw=JSON.stringify(baseline)===JSON.stringify(current);
 if(!overflow&&talentPoints===0)assert(sameRaw,'ordinary valid outcomes must remain byte-equivalent');
 records.push({key,levelBefore:level,xpBefore:xp,talentPointsBefore:talentPoints,rawXp,acceptedXp:accepted,overflowXp:overflow,levelAfter:current.player.level,xpAfter:current.player.xp,talentPointsAfter:current.player.talentPoints,sourceRng:before.rng,settledRng:current.rng,rawStateIdentical:sameRaw,verifiedLogInsertion:addedReceipt,allOtherFieldsIdentical:true});
}
for(const key of ['memory_archive','starlibrary','exchange','combat'])for(const level of [1,100,10000,999999,1000000])for(const xp of [0,B.xpNeeded(level)-1,1e8-10,1e8])for(const points of [0,1999999,2000000])check(key,level,xp,points);
for(const key of ['trial','elite','boss'])for(const xp of [0,1e8-10,1e8])check(key,1e6,xp,0);
const sourceHashes={};for(const file of ['src/engine.js','src/encounters.js','src/deep-rules.js','src/experience.js','tests/round10-xp-core.test.mjs'])sourceHashes[file]=sha(await readFile(resolve(candidatePath,file)));
assert.deepEqual(await sourceFingerprint(basePath),frozenBaseline,'Baseline source changed during the audit.');
assert.deepEqual(await sourceFingerprint(candidatePath),frozenCurrent,'Current source changed during the audit.');
const report={date:new Date().toISOString(),kind:'Portable author A/B with separately loaded baseline/current modules; same immutable valid synthetic inputs; exact state comparison with explicitly verified presentation-only normalization',baseline:basePath,current:candidatePath,output:out,actions:records.length,validBeforeAndAfter:true,roundTrips:records.length*4,rawStateIdentical:records.filter(r=>r.rawStateIdentical).length,allowedDifference:'Only verified capped paid-event outcome text, actual talent-point-cap log wording, and one explicit capped-combat XP log with existing six-entry truncation; all other state fields exactly equal',sourceHashes,sourceStability:{baseline:{unchanged:true,files:frozenBaseline},current:{unchanged:true,files:frozenCurrent}},scriptSha256:sha(await readFile(new URL(import.meta.url))),records};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({actions:report.actions,roundTrips:report.roundTrips,rawStateIdentical:report.rawStateIdentical,allOtherFieldsIdentical:true,baselineSourceUnchanged:true,currentSourceUnchanged:true,output:out})+'\n');
