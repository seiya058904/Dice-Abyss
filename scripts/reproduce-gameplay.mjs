// Synthetic engine fixtures. Does not read or write a player's save.
// Run: node scripts/reproduce-gameplay.mjs [project-root]
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'.');
const E=await import(pathToFileURL(path.join(root,'src/engine.js')));
const V=await import(pathToFileURL(path.join(root,'src/views.js')));
const {validateSave}=await import(pathToFileURL(path.join(root,'src/storage.js')));

function scene(type,seed=1,floor=80,level=100){
 let s=E.newGame(seed);s.floor=floor;s.player.level=level;s.player.xp=0;s.player.hp=E.stats(s).maxHp;s.player.gold=1e8;
 s.fate=[3,4];s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));
 s.roomIndex=0;s.phase='route';s=E.transition(s,{type:'enter'});return s;
}

const danger=scene('disruptor',19,80,11);
danger.player.equipped={weapon:null,armor:null,relic:null,relic2:null,relic3:null};
danger.player.hp=100;danger.ward=0;
Object.assign(danger.enemy,{variant:0,mechanic:'disruptor',type:'combat',hp:1e9,maxHp:1e9,shield:0,maxShield:0,attack:100,trait:'steady',turns:0,label:'出现 1 且无 6：反击 +25%'});
const intent=E.enemyIntent(danger),markup=V.center(danger,{view:'game',busy:false});
const warnings=markup.match(/若[^<]{1,35}/g)||[];
let fatalRoll=null;
for(let seed=1;seed<=200&&!fatalRoll;seed++){
 const s=structuredClone(danger);s.rng=seed*7919;const t=E.transition(s,{type:'roll'});
 if(t.phase==='dead')fatalRoll={rng:s.rng,values:t.lastRoll.values,damage:t.lastRoll.retaliation,enemyHp:t.enemy.hp,enemyMaxHp:t.enemy.maxHp,enemyType:t.enemy.type};
}
assert(fatalRoll,'must reproduce lethal low-face modifier on a non-boss');

const bountySamples=[];
for(const rng of [110866,118785,158380]){
 const s=scene('bounty');s.enemy.hp=1;s.enemy.shield=0;s.rng=rng;
 const t=E.transition(s,{type:'roll'});assert.equal(t.phase,'chest');assert(t.chest.item.rarity>=2);
 bountySamples.push({rng,playerLevel:t.player.level,itemLevel:t.chest.item.level,rarity:t.chest.item.rarity,expectedEliteBand:[t.player.level-1,t.player.level+3],validSave:validateSave(t)});
}

const eventSamples=[];
for(const [type,rng] of [['bloodwell',23757],['bloodwell',71271],['wishingvault',31676]]){
 const s=scene(type,rng,140);s.rng=rng;
 const t=E.transition(s,{type:'event-choice',id:type==='wishingvault'?'roll':'accept',confirmed:true});assert.equal(t.phase,'chest');
 eventSamples.push({type,rng,playerLevel:t.player.level,itemLevel:t.chest.item.level,rarity:t.chest.item.rarity,commonEventBand:[t.player.level+3,t.player.level+7],validSave:validateSave(t)});
}

console.log(JSON.stringify({root,syntheticFixtures:true,
 G01:{status:warnings.some(x=>x.includes('半血阶段'))?'CONFIRMED':'NOT_REPRODUCED',intent:{min:intent.minDamage,max:intent.maxDamage},warnings,fatalRoll},
 G02:{status:bountySamples.some(x=>x.itemLevel<x.expectedEliteBand[0])?'CONFIRMED':'NOT_REPRODUCED',samples:bountySamples},
 G03:{status:'DESIGN_INCONSISTENCY_REQUIRES_DECISION',samples:eventSamples}
},null,2));
