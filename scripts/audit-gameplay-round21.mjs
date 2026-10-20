// Reproducible constructed audit; use: node scripts/audit-gameplay-round21.mjs SOURCE OUTPUT_JSON
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(process.argv[2]),out=resolve(process.argv[3]);
const load=path=>import(pathToFileURL(resolve(root,path)));
const [E,S,C,D,B]=await Promise.all(['src/engine.js','src/storage.js','src/encounters.js','src/deep-content.js','src/boon-readout.js'].map(load));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={kind:'Constructed deterministic gameplay audit. Not a natural journey or balance result.',sourceVersion:JSON.parse(readFileSync(resolve(root,'package.json'))).version,
 sourceHashes:Object.fromEntries(['src/engine.js','src/storage.js','src/encounters.js','src/deep-content.js','src/deep-rules.js','src/boon-readout.js'].map(file=>[file,hash(readFileSync(resolve(root,file)))]))};
function fixture(){
 let s=E.newGame(1);s.runId='qa-round21-first-eligible-critical';s.floor=80;s.player.level=11;s.player.talentPoints=3;s.player.xp=0;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f80r${i}`,type,done:false,quality:0}));s.phase='route';
 s=E.transition(s,{type:'enter'});Object.assign(s.enemy,{trait:'steady',hp:1e12,maxHp:1e12,shield:0,maxShield:0,attack:1,turns:0});delete s.enemy.mechanic;s.rng=7919;
 s.futureMetadata={retained:['audit',17]};assert(S.validateSave(s));return s;
}
let roundTrips=0;
function reload(s){const r=S.decodeSave(S.encodeSave(s));assert.deepEqual(r,s);roundTrips++;return r;}
function untilCritical(s){for(let i=0;i<100;i++){s=E.transition(s,{type:'roll'});if(s.lastRoll.critical)return reload(s);}assert.fail('The predeclared critical horizon did not yield a critical.');}
const snapshot=s=>({turn:s.enemy.turns,values:s.lastRoll?.values||null,critical:s.lastRoll?.critical||false,firstCritLuck:E.stats(s).firstCritLuck,nextLuck:s.nextLuck,
 firstCritUsed:s.enemy.firstCritUsed??null,rng:s.rng,readout:B.boonReadout(s),stateSha256:hash(S.encodeSave(s))});
const first=untilCritical(fixture());assert.equal(E.stats(first).firstCritLuck,0);assert(!first.enemy.firstCritUsed);assert.equal(first.nextLuck,0);
const invested=reload(E.transition(first,{type:'talent',id:'dawnCrit'}));assert.equal(invested.player.talents.dawnCrit,1);
const eligible=untilCritical(invested);assert(eligible.enemy.firstCritUsed);assert.equal(eligible.nextLuck,5);
const upgraded=reload(E.transition(eligible,{type:'talent',id:'dawnCrit'}));assert.equal(E.stats(upgraded).firstCritLuck,10);assert.equal(upgraded.nextLuck,5);
const later=untilCritical(upgraded);assert(later.enemy.firstCritUsed);assert.equal(later.nextLuck,0);
report.firstEligibleCrit={firstWithoutEffect:snapshot(first),afterLearning:snapshot(invested),firstWithEffect:snapshot(eligible),afterUpgrading:snapshot(upgraded),laterCritical:snapshot(later),roundTrips,
 conclusion:'Earlier criticals without the effect do not consume it; the first later eligible critical grants luck, and upgrading does not rearm the same battle.'};
const alt=C.EXTRA_ENEMIES.find(e=>e.mechanic==='bandit'&&e.variant===1);
report.bandit={name:alt.name,narrative:alt.note,label:alt.label,rewards:[1,2,3].map(turns=>({settledTurns:turns,...C.encounterReward({...alt,type:'combat',turns})})),
 conclusion:alt.note.includes('前三击')?'The alternate bandit has a two-roll triple-gold window; this input narrative incorrectly says three attacks.':'The alternate bandit has a two-roll triple-gold window; the current authored narrative says two attacks.'};
const multisets=[];
function collect(values,min,count){if(values.length===count){multisets.push(values);return;}for(let n=min;n<=6;n++)collect([...values,n],n,count);}
for(let count=1;count<=6;count++)collect([],1,count);
report.deepPairs=[];
for(const room of Object.values(D.DEEP_ROOMS).filter(r=>r.kind==='combat')){
 const pair=D.DEEP_ENEMIES.filter(e=>e.roomType===room.key);assert.equal(pair.length,2);
 let cases=0;
 for(const values of multisets)for(const turns of [0,1,2,6])for(const stage of [1,2]){
  const best=Math.max(...values.map(v=>values.filter(x=>x===v).length));
  const outcome=template=>{const enemy={...template,type:C.canonicalCombatType(room.key),combatRules:4,hp:7500,maxHp:10000,attack:500,shield:1000,maxShield:2000,turns,stage,wave:3};
   return {mod:C.combatModifiers(enemy,values,best,{maxHp:10000}),attack:C.extraEnemyAttack(enemy,500),post:C.postRetaliation({...enemy,turns:turns+1},{values,best},{maxHp:10000}),reward:C.encounterReward({...enemy,turns:turns+1})};};
  assert.deepEqual(outcome(pair[0]),outcome(pair[1]),`${room.key} variant behavior unexpectedly differs`);cases++;
 }
 report.deepPairs.push({mechanic:room.key,names:pair.map(e=>e.name),comparedCases:cases,identicalOutcome:true});
}
report.deepVariantRisk='Giving existing variant=1 saved enemies new behavior would rewrite pending combat semantics. Defer until newly-created enemies can be explicitly versioned while old saved enemies retain their prior rules, and stage/wave/retry/intent/label/reward validation is covered.';
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,firstCritTurns:[first.enemy.turns,eligible.enemy.turns,later.enemy.turns],roundTrips,deepPairs:report.deepPairs.length,deepRuleComparisons:report.deepPairs.reduce((n,row)=>n+row.comparedCases,0),bandit:report.bandit},null,2));
