// Read-only A/B replay on synthetic states, never on private player saves.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const baseRoot=path.resolve(process.argv[2]||'baseline/Dice-Abyss');
const afterRoot=path.resolve(process.argv[3]||'project');
const B=await import(pathToFileURL(path.join(baseRoot,'src/engine.js')));
const A=await import(pathToFileURL(path.join(afterRoot,'src/engine.js')));
const sourceFloors={combat:1,elite:1,trial:3,boss:5,armored:2,duel:8,gauntlet:6,guardian:12,hiddenboss:15,bounty:80,abyssking:100,archiveguard:140};
const started=performance.now();
let samples=0,earlySamples=0,bountySamples=0,correctedLevels=0,unchangedRewards=0,probabilityContexts=0;
const correctedExamples=[];
for(const floor of [1,5,10,29,30,49,50,79,80,139,140,200,400])for(const level of [1,11,100,1000000]){
 for(const [type,minFloor] of Object.entries(sourceFloors)){
  if(floor<minFloor)continue;
  let s=B.newGame(1);s.floor=floor;s.player.level=level;s.player.xp=0;s.player.hp=B.stats(s).maxHp;
  s.fate=[3,4];s.phase='route';s.roomIndex=0;
  s.route=[type,'combat','rest','combat','gold',floor%5===0?'boss':'elite'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));
  s=B.transition(s,{type:'enter'});s.enemy.hp=1;s.enemy.shield=0;
  for(let seed=1;seed<=40;seed++){
   s.rng=seed*7919;const before=B.transition(s,{type:'roll'}),after=A.transition(s,{type:'roll'});
   assert.equal(after.rng,before.rng,'RNG consumption changed');assert.equal(after.nextId,before.nextId,'item allocation count changed');
   assert.equal(after.chest.item.rarity,before.chest.item.rarity,'rarity changed');assert.equal(after.chest.gold,before.chest.gold,'gold changed');
   const levelDelta=after.chest.item.level-before.chest.item.level;
   if(levelDelta){
    assert.equal(type,'bounty');assert.equal(before.chest.item.rarity,2);assert.equal(levelDelta,1);
    correctedLevels++;if(correctedExamples.length<6)correctedExamples.push({floor,initialLevel:level,postVictoryLevel:after.player.level,rng:s.rng,before:before.chest.item.level,after:after.chest.item.level});
   }else unchangedRewards++;
   const normalized=structuredClone(after);normalized.chest.item.level=before.chest.item.level;
   assert.deepEqual(normalized,before,'something other than the corrected bounty item level changed');
   samples++;if(floor<30)earlySamples++;if(type==='bounty')bountySamples++;
  }
 }
 for(const fate of [[1,1],[3,4],[6,6]])for(const source of ['combat','elite','trial','boss','hiddenboss','vault','merchant','blackmarket','auction']){
  const s=B.newGame(7919);s.floor=floor;s.fate=fate;s.player.level=level;
  assert.deepEqual(A.dropOdds(s,source),B.dropOdds(s,source));probabilityContexts++;
 }
}
console.log(JSON.stringify({syntheticFixtures:true,input:baseRoot,output:afterRoot,samples,earlySamples,bountySamples,correctedLevels,unchangedRewards,probabilityContexts,
 rngEqual:true,itemAllocationCountEqual:true,raritiesEqual:true,goldEqual:true,otherStateFieldsEqual:true,correctedExamples,durationMs:+(performance.now()-started).toFixed(1)},null,2));
