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
const report={scope:'Independent short correctness cross-check; no timing or simulated balance claim',sourceHashes:before,generatedPairs:0,newTagged:0,ruleCases:0,untaggedExactCases:0,codecCases:0,retryCases:0,invalidCases:0,coverage:[],examples:[]};
const seen=new Set(),fixtures={};
for(const mechanic of ['parity','sequence'])for(const seed of [1,2,3,7,42,7919,15838,31676]){
 const old=B.E.newGame(seed);old.floor=40;old.runId='independent-deep-review';old.phase='combat';old.fate=[3,4];old.route=[mechanic,'combat','rest','sequence','gold','boss'].map((type,i)=>({id:`f40r${i}`,type,done:false,quality:0}));
 const now=structuredClone(old);old.enemy=B.E.createEnemy(old,mechanic);now.enemy=A.E.createEnemy(now,mechanic);
 assert.equal(now.rng,old.rng);const restored=structuredClone(now.enemy);delete restored.deepVariantRules;restored.label=old.enemy.label;assert.deepEqual(restored,old.enemy);
 const tagged=now.enemy.variant===1;assert.equal(Object.hasOwn(now.enemy,'deepVariantRules'),tagged);report.generatedPairs++;report.newTagged+=tagged;seen.add(`${mechanic}/${now.enemy.variant}`);
 if(tagged&&!fixtures[mechanic])fixtures[mechanic]=now;
 old.reviewUnknown={nested:[null,{preserve:'甲乙'}]};old.enemy.reviewUnknown={rules:'opaque'};
 assert.equal(A.S.encodeSave(old),B.S.encodeSave(old));assert.deepEqual(A.S.decodeSave(B.S.encodeSave(old)),old);report.codecCases++;
 assert.deepEqual(A.S.decodeSave(A.S.encodeSave(now)),now);report.codecCases++;
 for(const initial of [old,now]){
  const dead=structuredClone(initial);dead.phase='dead';dead.player.hp=0;const retry=A.E.transition(dead,{type:'retry'});
  assert.equal(retry.rng,dead.rng);assert.equal(Object.hasOwn(retry.enemy,'deepVariantRules'),Object.hasOwn(dead.enemy,'deepVariantRules'));assert.equal(retry.enemy.deepVariantRules,dead.enemy.deepVariantRules);assert.equal(retry.enemy.label,dead.enemy.label);assert.equal(retry.enemy.turns,0);assert(A.S.validateSave(retry));report.retryCases++;
 }
}
assert.deepEqual([...seen].sort(),['parity/0','parity/1','sequence/0','sequence/1']);report.coverage=[...seen].sort();
const rolls=[[1],[2],[1,2],[1,1],[1,2,3],[2,2,4],[1,2,3,4],[1,1,2,3],[1,2,3,4,5,6],[2,2,4,4,6,6]];
function matches(requirement,values){const distinct=new Set(values).size,count=values.length,odd=values.filter(v=>v%2).length,best=Math.max(...values.map(v=>values.filter(x=>x===v).length));return ({oddAtLeast:()=>odd>=requirement.value,evenAtLeast:()=>count-odd>=requirement.value,sameAtLeast:()=>best>=requirement.value,distinctAtLeast:()=>distinct>=requirement.value,distinctAtMost:()=>distinct<=requirement.value,allDistinct:()=>distinct===count})[requirement.kind]();}
for(const mechanic of ['parity','sequence'])for(const turns of [0,1,99,100])for(const values of rolls){
 const e={...fixtures[mechanic].enemy,turns,hp:100003,maxHp:100003,shield:0,maxShield:20001},best=Math.max(...values.map(v=>values.filter(x=>x===v).length)),st={maxHp:10007};
 const tactics=A.T.encounterTactics(e,values.length),success=matches(tactics.lines[0].requirement,values),mod=A.C.combatModifiers(e,values,best,st),post=A.C.postRetaliation({...e,turns:turns+1},{values,best},st);
 assert.equal(mod.damageMultiplier,success?(mechanic==='parity'?1.35:1.4):1);
 assert.equal(post.enemyWard,mechanic==='sequence'&&!success?3001:0);
 if(mechanic==='sequence')assert.equal(matches(tactics.lines[1].requirement,values),!success);
 const untagged={...e};delete untagged.deepVariantRules;
 assert.deepEqual(A.C.combatModifiers(untagged,values,best,st),B.C.combatModifiers(untagged,values,best,st));
 assert.deepEqual(A.C.postRetaliation(untagged,{values,best},st),B.C.postRetaliation(untagged,{values,best},st));
 assert.deepEqual(A.T.encounterTactics(untagged,values.length),B.T.encounterTactics(untagged,values.length));
 report.ruleCases++;report.untaggedExactCases++;
 if(turns===0&&values.length===3)report.examples.push({mechanic,values,modernMultiplier:mod.damageMultiplier,oldMultiplier:B.C.combatModifiers(untagged,values,best,st).damageMultiplier,modernRebuild:post.enemyWard});
}
for(const mechanic of ['parity','sequence'])for(const patch of [{deepVariantRules:0},{deepVariantRules:2},{deepVariantRules:null},{deepVariantRules:'1'},{variant:0},{mechanic:'hush'},{roomType:'combat'},{combatRules:2}]){
 const invalid=structuredClone(fixtures[mechanic]);Object.assign(invalid.enemy,patch);assert.equal(A.S.validateSave(invalid),false);assert.throws(()=>A.S.encodeSave(invalid));report.invalidCases++;
}
assert.deepEqual(hashes(),before);report.status='PASS';writeFileSync(resolve(root,'qa/independent-deep-probe-round22.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
