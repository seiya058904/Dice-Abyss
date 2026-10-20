import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const source=path.resolve(process.argv[2]||'/workspace/scratch/2e03d78caae4/baseline/Dice-Abyss');
const output=path.resolve(process.argv[3]||'/workspace/scratch/2e03d78caae4/qa-r15/gameplay/candidates.json');
const E=await import(pathToFileURL(path.join(source,'src/engine.js')));
const S=await import(pathToFileURL(path.join(source,'src/storage.js')));
const D=await import(pathToFileURL(path.join(source,'src/equipment-comparison.js')));
const C=await import(pathToFileURL(path.join(source,'src/equipment-content.js')));
function item(catalogId,id,level=80){
 const d=C.CATALOG_BY_ID.get(catalogId);assert(d,catalogId);
 return {id,catalogId,slot:d.slot,rarity:d.rarity,profile:d.profile,theme:d.theme,name:d.name,level,levelXp:0,enhance:0,depth:140,locked:false};
}
function fixture(){
 const s=E.newGame(7919);s.runId='round15-synthetic-heal-copy';s.floor=140;s.player.level=80;s.fate=[3,4];
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({type,id:`f140r${i}`,quality:0,done:false}));
 s.roomIndex=0;s.phase='combat';s.player.items=[item('weapon-0-0-0','i1'),item('v5-armor-3-0-4','i2'),item('v5-relic-4-0-4','i3')];
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.nextId=4;s.player.hp=100;s.ward=0;
 s.enemy={name:'文案因果构造对照',note:'Synthetic fixture; not a natural journey.',label:'隔离致死与存活结算',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1000000,turns:1,stage:1,combatRules:4};
 assert(S.validateSave(s));return s;
}
let lethal,surviving,start;
for(let seed=1;seed<=1000;seed++){
 const candidate=fixture();candidate.rng=seed*7919>>>0;
 const next=E.transition(candidate,{type:'roll'});
 if(next.lastRoll.values.includes(6)&&next.lastRoll.best>=4){start=candidate;lethal=next;break;}
}
assert(start);const benign=structuredClone(start);benign.enemy.attack=1;
surviving=E.transition(benign,{type:'roll'});
for(const s of [start,lethal,benign,surviving])assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);
assert.equal(lethal.phase,'dead');assert.equal(lethal.player.hp,0);assert(!lethal.lastRoll.killed);
assert.deepEqual(lethal.lastRoll.values,surviving.lastRoll.values);
assert.equal(lethal.rng,surviving.rng);
assert(surviving.player.hp>benign.player.hp);
const labels=['六点回生 · 已触发','合鸣归息 · 已触发'];
assert(labels.every(text=>lethal.lastRoll.mechanics.includes(text)));
assert(labels.every(text=>surviving.lastRoll.mechanics.includes(text)));

const injured=fixture();injured.player.items=[item('weapon-0-0-0','i1'),item('armor-1-0-0','i2',80),item('relic-0-0-0','i3'),item('armor-0-0-0','i4',300)];injured.nextId=5;
injured.player.hp=30;const score=D.equipmentComparisonDetails(injured,injured.player.items[3]);
const swapped=E.transition(injured,{type:'equip',id:'i4'});assert.equal(swapped.player.hp,30);assert.equal(swapped.ward,0);assert(swapped.player.items[3]);
const comparison={score:E.compareEquipment(injured,injured.player.items[3]),detail:score,before:{hp:injured.player.hp,maxHp:E.stats(injured).maxHp,ward:injured.ward},after:{hp:swapped.player.hp,maxHp:E.stats(swapped).maxHp,ward:swapped.ward},note:'The score is an acknowledged heuristic, not a confirmed gameplay bug. It contains no current-HP or immediate-ward comparison.'};

const lowDice=fixture();lowDice.player.level=1;lowDice.player.items=[item('weapon-0-0-0','i1'),item('armor-0-0-0','i2'),item('relic-0-0-0','i3'),item('relic-3-0-0','i4')];lowDice.nextId=5;
const lowDiceDetails=D.equipmentComparisonDetails(lowDice,lowDice.player.items[3],'relic');
assert.equal(E.diceCount(lowDice),1);assert(lowDiceDetails.rows.some(row=>row.key==='pairBonus'&&row.after>row.before));
const availability={diceCount:E.diceCount(lowDice),details:lowDiceDetails,note:'A comparison lists increased pair benefit but no current dice-count feasibility. This constructed valid state is an explanatory opportunity, not claimed natural evidence or a rule error.'};

await mkdir(path.dirname(output),{recursive:true});
const report={source,scope:'Read-only source audit; explicitly synthetic fixtures only',confirmedCopyDefect:{start:{hp:start.player.hp,maxHp:E.stats(start).maxHp,sixthMend:E.stats(start).sixthMend,resonanceMend:E.stats(start).resonanceMend,rng:start.rng},lethal:{hp:lethal.player.hp,phase:lethal.phase,roll:lethal.lastRoll},surviving:{hp:surviving.player.hp,phase:surviving.phase,roll:surviving.lastRoll},observed:'The two survival-gated healing abilities are recorded as triggered despite fatal retaliation. Both notes are created before survival is known.'},comparison,availability};
await writeFile(output,JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(path.dirname(output),'heal-copy-lethal-start.save.txt'),S.encodeSave(start)+'\n');
await writeFile(path.join(path.dirname(output),'heal-copy-lethal-end.save.txt'),S.encodeSave(lethal)+'\n');
console.log(JSON.stringify({output,confirmed:report.confirmedCopyDefect,comparison,availability},null,2));
