import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd(),baseline=resolve(root,'../../baseline/Dice-Abyss');
const paths=['src/deep-content.js','src/deep-rules.js','src/engine.js','src/encounters.js','src/encounter-tactics.js','src/storage.js'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
const before=hashes(),load=async r=>Object.fromEntries(await Promise.all([['E','engine'],['S','storage'],['D','deep-content'],['C','encounters'],['T','encounter-tactics']].map(async([key,name])=>[key,await import(pathToFileURL(resolve(r,'src',name+'.js')))])));
const [B,A]=await Promise.all([load(baseline),load(root)]);
const report={scope:'Independent re-review of combatRules 5 repair; no performance or natural balance claim',sourceHashes:before,generationPairs:0,newRules5:0,oldMetadataCases:0,oldCompleteTransitions:0,oldExactEnvelopes:0,newCodecRetryCases:0,ruleGuidanceCases:0,invalidNewSchemaCases:0,examples:[],coverage:[]};
function initial(mechanic,seed){
 const s=B.E.newGame(seed);s.floor=40;s.runId='independent-old-metadata-recheck';s.player.level=20;s.player.hp=B.E.stats(s).maxHp;s.phase='combat';s.fate=[3,4];s.route=[mechanic,'combat','rest','sequence','gold','boss'].map((type,i)=>({id:`f40r${i}`,type,done:false,quality:0}));return s;
}
const seen=new Set(),modern={},legacy={};
for(const mechanic of ['parity','sequence'])for(const seed of [1,2,3,7,42,7919,15838,31676]){
 const old=initial(mechanic,seed),now=structuredClone(old);old.enemy=B.E.createEnemy(old,mechanic);now.enemy=A.E.createEnemy(now,mechanic);
 assert.equal(now.rng,old.rng);const normalized=structuredClone(now.enemy);normalized.combatRules=4;normalized.label=old.enemy.label;assert.deepEqual(normalized,old.enemy);
 const changed=now.enemy.variant===1;assert.equal(now.enemy.combatRules,changed?5:4);assert(!Object.hasOwn(now.enemy,'deepVariantRules'));
 assert.equal(A.S.validateSave(now),true);assert.deepEqual(A.S.decodeSave(A.S.encodeSave(now)),now);
 if(changed){assert.equal(B.S.validateSave(now),false);report.newRules5++;modern[mechanic]??=now;legacy[mechanic]??=old;}
 report.generationPairs++;seen.add(`${mechanic}/${now.enemy.variant}`);
 const dead=structuredClone(now);dead.phase='dead';dead.player.hp=0;const retried=A.E.transition(dead,{type:'retry'});
 assert.equal(retried.enemy.combatRules,now.enemy.combatRules);assert.equal(retried.rng,dead.rng);assert.equal(retried.enemy.label,now.enemy.label);assert.equal(retried.enemy.turns,0);assert(!Object.hasOwn(retried.enemy,'deepVariantRules'));assert.deepEqual(A.S.decodeSave(A.S.encodeSave(retried)),retried);report.newCodecRetryCases++;
}
assert.deepEqual([...seen].sort(),['parity/0','parity/1','sequence/0','sequence/1']);report.coverage=[...seen].sort();
for(const mechanic of ['parity','sequence'])for(const rules of [undefined,2,4])for(const value of [null,0,1,2,'1',true,{},[],{note:'opaque legacy field',nested:[1,2,3]}]){
 const s=structuredClone(legacy[mechanic]);if(rules===undefined)delete s.enemy.combatRules;else s.enemy.combatRules=rules;
 Object.assign(s.enemy,{maxHp:100003,hp:100003,shield:0,maxShield:20001,attack:9,deepVariantRules:value});s.reviewUnknown={keep:['完整状态',value]};
 assert(B.S.validateSave(s));assert(A.S.validateSave(s));assert.equal(A.D.deepVariantProfile(s.enemy),null);
 const raw=B.S.encodeSave(s);assert.equal(A.S.encodeSave(s),raw);assert.deepEqual(A.S.decodeSave(raw),s);assert.deepEqual(A.S.migrateSave(s),s);report.oldMetadataCases++;report.oldExactEnvelopes++;
 for(const [beforeState,action] of [[s,{type:'roll'}],[s,{type:'lock',id:'i1'}],[{...structuredClone(s),phase:'dead',player:{...structuredClone(s.player),hp:0}},{type:'retry'}]]){
  const original=structuredClone(beforeState),a=B.E.transition(beforeState,action),b=A.E.transition(beforeState,action);assert.deepEqual(beforeState,original);assert.notEqual(a,beforeState);assert.deepEqual(b,a);assert.equal(A.S.encodeSave(b),B.S.encodeSave(a));assert.deepEqual(A.S.decodeSave(A.S.encodeSave(b)),b);report.oldCompleteTransitions++;report.oldExactEnvelopes++;
 }
}
const rolls=[[1],[2],[1,2],[1,1],[1,2,3],[2,2,4],[1,2,3,4],[1,1,2,3],[1,2,3,4,5,6],[2,2,4,4,6,6]];
function matches(r,values){const different=new Set(values).size,n=values.length,odd=values.filter(v=>v%2).length,best=Math.max(...values.map(v=>values.filter(x=>x===v).length));return ({oddAtLeast:()=>odd>=r.value,evenAtLeast:()=>n-odd>=r.value,sameAtLeast:()=>best>=r.value,distinctAtLeast:()=>different>=r.value,allDistinct:()=>different===n})[r.kind]();}
for(const mechanic of ['parity','sequence'])for(const turns of [0,1,99,100])for(const values of rolls){
 const e={...modern[mechanic].enemy,turns,hp:100003,maxHp:100003,shield:0,maxShield:20001},best=Math.max(...values.map(v=>values.filter(x=>x===v).length)),st={maxHp:10007},tactics=A.T.encounterTactics(e,values.length),success=matches(tactics.lines[0].requirement,values);
 const mod=A.C.combatModifiers(e,values,best,st),post=A.C.postRetaliation({...e,turns:turns+1},{values,best},st);
 assert.equal(mod.damageMultiplier,success?(mechanic==='parity'?1.35:1.4):1);assert.equal(post.enemyWard,mechanic==='sequence'&&!success?3001:0);if(mechanic==='sequence')assert.equal(matches(tactics.lines[1].requirement,values),!success);report.ruleGuidanceCases++;
 if(turns===0&&values.length===3)report.examples.push({mechanic,values,multiplier:mod.damageMultiplier,rebuild:post.enemyWard});
}
for(const mechanic of ['parity','sequence'])for(const patch of [{combatRules:6},{combatRules:'5'},{combatRules:null},{variant:0},{roomType:'combat'},{mechanic:'hush'}]){
 const bad=structuredClone(modern[mechanic]);Object.assign(bad.enemy,patch);assert.equal(A.S.validateSave(bad),false);assert.throws(()=>A.S.encodeSave(bad));report.invalidNewSchemaCases++;
}
assert.deepEqual(hashes(),before);report.status='PASS_NO_REMAINING_BLOCKER_IN_REVIEWED_SCOPE';writeFileSync(resolve(root,'qa/independent-deep-fixed-probe-round22.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
