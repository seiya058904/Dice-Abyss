// Conditional item recommendation calibration with the shipped combat resolver.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {newGame,makeItem,createEnemy,stats,resolveRoll,compareEquipment} from '../src/engine.js';
import {CATALOG} from '../src/content.js';
const rows=[],samples=256,turns=4;
function state(){
 const s=newGame(104729);s.floor=140;s.player.level=80;s.fate=[3,4];s.route=[{id:'f140r0',type:'boss',quality:0,done:false}];s.roomIndex=0;s.phase='combat';s.player.items=[];
 for(const slot of ['weapon','armor','relic']){const i=makeItem(s,slot,3);i.level=80;i.enhance=5;s.player.items.push(i);s.player.equipped[slot]=i.id;}
 s.player.talents.resonance=5;s.player.talents.high=5;s.player.talents.critical=5;s.player.talents.pair=5;
 s.enemy=createEnemy(s,'boss');Object.assign(s.enemy,{trait:'steady',hp:1e12,maxHp:1e12,shield:0,maxShield:1e12,attack:50,stage:2,turns:0});delete s.enemy.mechanic;s.ward=0;s.player.hp=stats(s).maxHp;return s;
}
function score(s,scenario){let sum=0;for(let n=1;n<=samples;n++){
 const b=structuredClone(s);b.rng=n*7919>>>0;b.enemy.type=scenario==='plain'?'combat':'boss';if(scenario==='shield')b.enemy.shield=1e11;if(scenario==='execution')b.enemy.hp=2e11;
 for(let t=0;t<turns;t++){resolveRoll(b);assert.equal(b.phase,'combat');assert(b.player.hp>0);sum+=b.lastRoll.hpDamage;}
 }return sum/(samples*turns);}
for(const slot of ['weapon','relic'])for(const investment of ['same-level','old-high-investment']){
 const base=state(),old=base.player.items.find(i=>i.id===base.player.equipped[slot]);if(investment==='old-high-investment'){old.level=120;old.enhance=20;}
 for(const scenario of ['plain','shield','execution']){
  const baseline=score(base,scenario);
  for(const entry of CATALOG[slot].filter(e=>e.ability&&e.rarity===4&&e.id.includes('-0-4'))){
   const candidate={...makeItem(base,slot,4),catalogId:entry.id,name:entry.name,profile:entry.profile,theme:entry.theme,level:80,enhance:5};
   const next=structuredClone(base);next.player.items.push(candidate);next.player.equipped[slot]=candidate.id;
   const prediction=compareEquipment(base,candidate,slot),measured=score(next,scenario),actualPercent=(measured/Math.max(1,baseline)-1)*100;
   rows.push({ability:entry.ability,slot,investment,scenario,samples,turns,prediction:prediction.delta,grade:prediction.grade,conditional:prediction.conditional,explicitShieldWarning:prediction.shieldTradeoff,actualPercent:+actualPercent.toFixed(2),baselineMean:+baseline.toFixed(2),candidateMean:+measured.toFixed(2),directionConflict:prediction.delta>=8&&actualPercent<=-5});
  }
 }
}
const conflicts=rows.filter(r=>r.directionConflict),report={method:'Constructed Lv.80 builds, legendary baseline vs mythic ability equipment; either comparable +5/Lv.80 investment or older legendary Lv.120/+20. 256 actual seeded four-roll combats for each loadout in three fixed enemy scenarios. Measures enemy HP damage, not healing, economy, or broad survival. Conditional score remains a heuristic, never a universal recommendation.',samplesPerLoadout:samples,turns,comparisons:rows.length,directionConflicts:conflicts.length,unwarnedConflicts:conflicts.filter(r=>!r.explicitShieldWarning).length,rows};
fs.writeFileSync(process.argv[2]||'comparison-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({comparisons:rows.length,directionConflicts:conflicts}));
