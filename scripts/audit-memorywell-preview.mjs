import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadEventApi,eventFixture,contextFixtures} from './audit-event-context.mjs';

// Synthetic legal-state audit, not an incidence estimate or browser test.
// Every confirmed/declined action is compared with the complete original
// transaction when --baseline is supplied. Output must stay outside both roots.
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const checked=['src/engine.js','src/views.js','src/deep.css','src/encounters.js','src/deep-rules.js','src/equipment.js','src/deep-content.js'];
const hashes=async root=>Object.fromEntries(await Promise.all(checked.map(async file=>[file,sha(await readFile(resolve(root,file),'utf8'))])));

export async function loadMemorywellApi(root=packageRoot){
 const api=await loadEventApi(root);api.Q=await import(pathToFileURL(resolve(root,'src/equipment.js')));return api;
}
export function memorywellFixtures(api){
 const {E,S,Q}=api,rows=contextFixtures(api).filter(row=>row.name.startsWith('memorywell/'));
 const original=rows[0].state;
 const add=(name,update)=>{
  let s=structuredClone(original);s=update(s)||s;s.runId='memorywell-preview-'+name;
  assert(S.validateSave(s),`${name}: accepted input`);rows.push({name,state:s});
 };
 add('one-current-hp',s=>{s.player.hp=1;});
 add('unspent-points-and-shield',s=>{s.player.talentPoints=7;s.ward=100000;s.nextLuck=15;s.eventLuck=8;s.v5Boons={echo:1,ward:1};});
 add('armor-raised-after-entry',s=>E.transition(s,{type:'equip',id:'i6'}));
 add('armor-restored-after-entry',s=>E.transition(E.transition(s,{type:'equip',id:'i6'}),{type:'equip',id:'i2'}));
 add('talents-after-entry',s=>{s.player.talentPoints=7;return E.transition(s,{type:'talent',id:'vitality',count:5});});
 for(const count of [1,3,5])add(`permanent-scars-${count}`,s=>{s.player.pactScars=count;s.player.hp=E.stats(s).maxHp;});
 for(const cost of [0,17,100000000])add(`saved-price-${cost}`,s=>{s.event.costGold=cost;s.player.gold=10000000000;});
 add('unaffordable-by-one',s=>{s.player.gold=s.event.costGold-1;});
 add('exact-affordability',s=>{s.player.gold=s.event.costGold;});
 add('no-invested-talents',s=>{for(const key of Object.keys(s.player.talents))s.player.talents[key]=0;s.player.hp=E.stats(s).maxHp;});
 add('exact-refund-point-cap',s=>{s.player.talentPoints=1999995;});
 add('refund-point-cap-exceeded',s=>{s.player.talentPoints=2000000;});
 add('health-cap-and-large-numerals',s=>{
  for(const item of s.player.items){item.level=Q.MAX_ITEM_LEVEL;item.levelXp=0;}
  s.player.talents.vitality=1000000;s.player.hp=E.stats(s).maxHp;s.player.gold=10000000000;
 });
 const noVitality=eventFixture(api,'memorywell',{beforeEnter:s=>{
  s.player.gold=100000;s.player.talentPoints=37;return E.transition(s,{type:'talent',id:'power',count:30});
 }});noVitality.runId='memorywell-preview-power-only';rows.push({name:'only-non-hp-talents',state:noVitality});
 return rows;
}

export function runMemorywellAudit(api,baseline=null){
 const {E,S,V,C}=api;assert.equal(typeof E.memorywellPreview,'function','numeric well preview must exist');
 const counts={fixtures:0,readOnlyRenders:0,transactions:0,acceptedResets:0,declines:0,rejectedActions:0,exactNumericMatches:0,reallocations:0,baselineStateComparisons:0,saveRoundTrips:0};
 const observations=[],transcript=[];
 const record=(s,label)=>{
  assert(S.validateSave(s),`${label}: valid save`);const raw=S.encodeSave(s);assert.deepEqual(S.decodeSave(raw),s);counts.saveRoundTrips++;
  transcript.push({label,state:s});return sha(s);
 };
 const compare=(input,action,after,label)=>{
  if(!baseline)return;
  assert(baseline.S.validateSave(input),`${label}: baseline accepts original input`);
  const expected=baseline.E.transition(structuredClone(input),action);
  assert.deepEqual(after,expected,`${label}: full state differs from original transaction`);counts.baselineStateComparisons++;
 };
 for(const {name,state:s}of memorywellFixtures(api)){
  counts.fixtures++;const saved=S.encodeSave(s),initial=structuredClone(s),p=E.memorywellPreview(s);
  assert.equal(p.canReset,!!E.canAct(s,{type:'event-choice',id:'reset',confirmed:true}));
  assert.equal(p.costGold,s.event.costGold);assert.equal(p.goldShortfall,Math.max(0,s.event.costGold-s.player.gold));
  const fragment=V.memorywellPreviewView(s),room=V.center(s,{view:'game',busy:false});counts.readOnlyRenders+=2;
  assert(room.includes(fragment));assert(fragment.includes('data-memorywell-preview'));
  assert(!/\bNaN\b|\bundefined\b/.test(fragment));assert.deepEqual(s,initial);assert.equal(S.encodeSave(s),saved);
  const stateSha256=record(s,`${name}/input`),outcomes=[];
  for(const action of [{type:'event-choice',id:'reset'},{type:'event-choice',id:'reset',confirmed:true},{type:'event-choice',id:'leave'}]){
   const after=E.transition(s,action),label=`${name}/${action.id}/${!!action.confirmed}`;counts.transactions++;
   compare(s,action,after,label);const resultSha256=record(after,label),accepted=after!==s;
   outcomes.push({action,accepted,resultSha256});
   if(!accepted){counts.rejectedActions++;assert.deepEqual(after,s);continue;}
   assert.equal(after.rng,s.rng);assert.deepEqual(after.player.items,s.player.items);assert.deepEqual(after.player.equipped,s.player.equipped);assert.equal(after.ward,s.ward);
   assert.equal(after.event.costGold,s.event.costGold);assert.equal(E.memorywellPreview(after),null);assert.equal(V.memorywellPreviewView(after),'');
   assert.equal(C.eventPresentation(after).body,after.event.text);assert.equal(C.eventPresentation(after).outcome,after.event.outcome);
   if(action.id==='leave'){counts.declines++;assert.deepEqual(after.player,s.player);continue;}
   counts.acceptedResets++;
   assert.deepEqual(p.after,{hp:after.player.hp,maxHp:E.stats(after).maxHp,gold:after.player.gold,talentPoints:after.player.talentPoints});
   assert.equal(p.refundPoints,after.player.talentPoints-s.player.talentPoints);assert.equal(p.hpLost,s.player.hp-after.player.hp);counts.exactNumericMatches++;
   assert.strictEqual(E.transition(after,action),after,'resolved resets cannot settle twice');
   let restored=after;
   for(const [id,count]of Object.entries(s.player.talents).filter(([,rank])=>rank>0)){
    const allocation={type:'talent',id,count};assert(E.canAct(restored,allocation));const next=E.transition(restored,allocation);
    compare(restored,allocation,next,`${name}/restore-${id}`);assert.equal(next.player.hp,after.player.hp);assert.equal(next.rng,s.rng);restored=next;counts.reallocations++;
   }
   assert.deepEqual(restored.player.talents,s.player.talents);assert.equal(E.stats(restored).maxHp,E.stats(s).maxHp);record(restored,`${name}/restored`);
  }
  if(!p.canReset)assert.equal(p.after.gold,null,'a blocked preview must not advertise a negative or settled balance');
  assert.equal(S.encodeSave(s),saved);observations.push({name,stateSha256,preview:p,previewHtmlSha256:sha(fragment),outcomes});
 }
 return {counts,observations,transcriptSha256:sha(transcript),baselineCompared:!!baseline,baselinePreviewPresent:baseline?typeof baseline.E.memorywellPreview==='function':null};
}

async function main(){
 const arg=(key,fallback)=>{const at=process.argv.indexOf(key);return at<0?fallback:process.argv[at+1];};
 assert(process.argv.includes('--output'),'Pass --output outside the project.');
 const root=resolve(arg('--source',packageRoot)),other=arg('--baseline',null),baselineRoot=other?resolve(other):null,output=resolve(arg('--output',''));
 for(const source of [root,baselineRoot].filter(Boolean)){
  const rel=relative(source,output);assert(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel),'Audit output must stay outside the source roots.');
 }
 const sourceSha256=await hashes(root),api=await loadMemorywellApi(root),baseline=baselineRoot?await loadMemorywellApi(baselineRoot):null;
 const result=runMemorywellAudit(api,baseline);assert.deepEqual(await hashes(root),sourceSha256,'source changed during audit');
 const report={status:'PASS',audit:'round07-memorywell-preview',scope:'Synthetic validator-accepted snapshots and actual transactions. No natural-play incidence, browser or performance claims.',method:'Uses the saved pending cost and current equipment/talents. Every available numerical projection is compared against an actual confirmed reset; all current/reset/refusal states are round-tripped. Baseline comparison, when requested, checks complete transaction states without excluding fields.',source:root,baseline:baselineRoot,sourceSha256,...result};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,output,...result.counts,baselineCompared:result.baselineCompared,transcriptSha256:result.transcriptSha256}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
