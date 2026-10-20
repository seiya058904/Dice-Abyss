import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
const root=process.cwd(),base=resolve(root,'../../baseline/Dice-Abyss');
const load=async r=>Object.fromEntries(await Promise.all([['E','engine'],['S','storage'],['C','encounters']].map(async([key,name])=>[key,await import(pathToFileURL(resolve(r,'src',name+'.js')))])));
const [B,A]=await Promise.all([load(base),load(root)]),report={scope:'Previously accepted public save with colliding unknown enemy metadata',status:'BLOCKER_REPRODUCED',cases:[]};
for(const mechanic of ['parity','sequence']){
 let s;
 for(let seed=1;seed<=32;seed++){
  s=B.E.newGame(seed);s.floor=40;s.runId='old-valid-unknown-field-collision';s.phase='combat';s.fate=[3,4];s.route=[mechanic,'combat','rest','sequence','gold','boss'].map((type,i)=>({id:`f40r${i}`,type,done:false,quality:0}));s.enemy=B.E.createEnemy(s,mechanic);
  if(s.enemy.variant===1)break;
 }
 assert.equal(s.enemy.variant,1);
 for(const unknownValue of [1,{note:'opaque legacy field'}]){
  const old=structuredClone(s);old.enemy.deepVariantRules=unknownValue;
  assert.equal(B.S.validateSave(old),true);const raw=B.S.encodeSave(old);assert.deepEqual(B.S.decodeSave(raw),old);
  const accepted=A.S.validateSave(old),row={mechanic,combatRules:old.enemy.combatRules,oldUnknownValue:unknownValue,baselineValid:true,currentValid:accepted};
  if(unknownValue===1){
   assert.equal(accepted,true);assert.deepEqual(A.S.decodeSave(raw),old);
   const values=[2,2,4];row.values=values;row.baselineMultiplier=B.C.combatModifiers(old.enemy,values,2,{maxHp:1000}).damageMultiplier;row.currentMultiplier=A.C.combatModifiers(old.enemy,values,2,{maxHp:1000}).damageMultiplier;
   assert.notEqual(row.currentMultiplier,row.baselineMultiplier);row.problem='Same old bytes silently activate a different pending rule';
  }else{
   assert.equal(accepted,false);assert.throws(()=>A.S.decodeSave(raw));row.problem='Previously accepted opaque metadata makes the old save unreadable';
  }
  report.cases.push(row);
 }
}
writeFileSync(resolve(root,'qa/independent-deep-tag-collision-round22.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
