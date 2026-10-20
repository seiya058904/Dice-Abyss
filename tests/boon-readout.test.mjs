import test from 'node:test';
import assert from 'node:assert/strict';
import {boonReadout} from '../src/boon-readout.js';
import * as E from '../src/engine.js';
import {CATALOG} from '../src/content.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';

const rows=s=>boonReadout(s).groups.flatMap(group=>group.entries);
const row=(s,key)=>rows(s).find(entry=>entry.key===key);
const reload=s=>{assert(validateSave(s),`valid ${s.phase}`);const restored=decodeSave(encodeSave(s));assert.deepEqual(restored,s);assert.deepEqual(boonReadout(restored),boonReadout(s));return restored;};
function scene(type='combat',seed=7919,floor=80){
 let s=E.newGame(seed);s.floor=floor;s.player.level=30;s.player.gold=1e6;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';
 s.route=[type,'combat','forge','combat','gold',floor%5===0?'boss':'elite'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));
 return reload(E.transition(s,{type:'enter'}));
}
const freeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);for(const v of Object.values(o))freeze(v);}return o;};
function harmlessEnemy(s){s.enemy.hp=s.enemy.maxHp=1e9;s.enemy.attack=1;s.enemy.shield=s.enemy.maxShield=0;s.enemy.trait='steady';delete s.enemy.mechanic;s.ward=0;return s;}
function firstCritVictory(s){
 // Construct a one-hit enemy, then obtain the boon from real combat settlement.
 s.enemy.hp=1;s.enemy.shield=0;s.player.talents.dawnCrit=3;
 for(let seed=1;seed<=1000;seed++){
  const before=structuredClone(s);before.rng=seed;const after=E.transition(before,{type:'roll'});
  if(after.lastRoll.critical&&after.lastRoll.killed){assert.equal(after.nextLuck,15);return reload(after);}
 }
 assert.fail('No deterministic first-crit fixture');
}

test('zero or absent optional boons return no empty groups, and existing ward stays in the health readout',()=>{
 const s=E.newGame(1);s.ward=500;
 assert.deepEqual(boonReadout(s),{groups:[],empty:true});
 for(const key of ['blessing','eventPower','eventLuck','nextLuck','v5Boons'])delete s[key];
 assert.deepEqual(boonReadout(s),{groups:[],empty:true});reload(s);
});

test('floor damage separates the altar additive contribution from the prayer multiplier',()=>{
 const s=scene();s.blessing=6;s.eventPower=15;
 assert.equal(row(s,'blessing').value,'+30%');assert.match(row(s,'blessing').detail,/加法增伤项/);
 assert.equal(row(s,'eventPower').value,'伤害 ×1.15');assert.match(row(s,'eventPower').detail,/追击与回响沿用该主击/);
 assert.equal(boonReadout(s).groups.length,1);
 s.blessing=100;s.eventPower=30;assert.equal(row(s,'blessing').value,'+500%');assert.equal(row(s,'eventPower').value,'伤害 ×1.30');reload(s);
});

test('raw temporary luck is distinguished from the actual rounded whole-build luck',()=>{
 const s=scene('combat',7919,200);const definition=CATALOG.relic.find(i=>i.id==='v4-relic-0-3-7');assert(definition);
 for(const slot of ['relic','relic2','relic3']){
  const item=E.makeItem(s,'relic',7);Object.assign(item,{catalogId:definition.id,name:definition.name,profile:definition.profile,theme:definition.theme});s.player.items.push(item);s.player.equipped[slot]=item.id;
 }
 s.player.talents.luck=5;s.eventLuck=8;s.nextLuck=15;
 const st=E.stats(s);assert.equal(st.rawLuck,142);assert.equal(st.luck,132);
 for(const key of ['eventLuck','nextLuck'])assert.match(row(s,key).detail,/当前总幸运投入 142 → 有效幸运 132/);
 assert.equal(row(s,'eventLuck').value,'原始幸运 +8');assert.equal(row(s,'nextLuck').value,'原始幸运 +15');reload(s);
});

test('rendered data is wholly read-only, detached and identical after a full codec round trip',()=>{
 const s=scene();s.eventLuck=8;s.eventPower=15;s.nextLuck=24;s.blessing=2;s.v5Boons={echo:1,ward:1};
 s.futureMetadata={nested:['retained',{counter:7}]};s.player.futureField={mode:'keep'};s.player.items[0].futureDetail={list:[1,2,3]};
 const before=encodeSave(s),odds=E.diceOdds(s),rng=s.rng,revision=s.revision;
 freeze(s);const readout=boonReadout(s);readout.groups[0].entries[0].detail='caller may format detached data';
 assert.equal(encodeSave(s),before);assert.deepEqual(E.diceOdds(s),odds);assert.equal(s.rng,rng);assert.equal(s.revision,revision);reload(s);
 for(const group of boonReadout(s).groups){assert(group.entries.length);for(const item of group.entries)assert(Object.values(item).every(value=>typeof value==='string'&&value.length));}
});

test('readout inspection cannot alter the next complete transaction or its RNG',()=>{
 const s=harmlessEnemy(scene());s.nextLuck=15;s.eventLuck=8;s.eventPower=15;s.blessing=4;s.enemy.openingEcho=.25;
 const expected=E.transition(s,{type:'roll'}),before=encodeSave(s);
 for(let i=0;i<10;i++)boonReadout(s);
 const actual=E.transition(s,{type:'roll'});assert.deepEqual(actual,expected);assert.equal(encodeSave(s),before);reload(actual);
});

test('temporary luck stays visible through an actual chest claim, reload and the next room, then is consumed by combat',()=>{
 let s=firstCritVictory(scene('combat'));assert.equal(s.phase,'chest');assert(row(s,'nextLuck'));const pending=structuredClone(s.chest);
 s=reload(E.transition(s,{type:'open'}));assert.equal(s.phase,'loot');assert.deepEqual(s.loot,pending);assert(row(s,'nextLuck'));
 s=reload(E.transition(s,{type:'next'}));assert.equal(s.phase,'combat');assert(row(s,'nextLuck'));
 s=harmlessEnemy(s);s.enemy.firstCritUsed=true;const expectedLuck=E.diceOdds(s).luck;
 s=reload(E.transition(s,{type:'roll'}));assert.equal(s.lastRoll.luck,expectedLuck);assert.equal(s.nextLuck,0);assert.equal(row(s,'nextLuck'),undefined);
});

test('multi-wave room transitions preserve pending luck without inventing a second opening echo',()=>{
 let s=scene('duel');s.route[0].waves=2;s.route[0].wave=1;s.route[0].waveType='elite';s.enemy.openingEcho=.25;
 assert(row(s,'openingEcho'));s=firstCritVictory(s);assert.equal(s.phase,'chest');assert.equal(row(s,'openingEcho'),undefined);
 s=reload(E.transition(E.transition(s,{type:'open'}),{type:'next'}));assert.equal(s.route[0].wave,2);assert(row(s,'nextLuck'));assert.equal(row(s,'openingEcho'),undefined);
 s=harmlessEnemy(s);s.enemy.firstCritUsed=true;s=reload(E.transition(s,{type:'roll'}));assert.equal(row(s,'nextLuck'),undefined);
});

test('forge and event dice use pending luck while leaving its lifetime intact',()=>{
 let forge=scene('forge');forge.nextLuck=15;const cost=E.forgeCost(forge,forge.player.items.find(i=>i.id===forge.player.equipped.weapon));
 const before=forge.player.gold;forge=reload(E.transition(forge,{type:'forge',id:forge.player.equipped.weapon}));assert.equal(before-forge.player.gold,cost);assert.equal(forge.nextLuck,15);assert(row(forge,'nextLuck'));
 let event=scene('gambit');event.nextLuck=15;event=reload(E.transition(event,{type:'event-choice',id:'roll',confirmed:true}));assert.equal(event.nextLuck,15);assert(row(event,'nextLuck'));
 const detail=row(event,'nextLuck').detail;assert.match(detail,/事件、锻造与融合掷骰/);assert.match(detail,/新生成宝箱/);assert.match(detail,/不改变已生成的奖励/);
});

test('paid echo moves from reserve to the immediate opening, is consumed once, and is never shown as a second reserve',()=>{
 let s=scene('echochamber');const gold=s.player.gold,cost=s.event.costGold;
 s=reload(E.transition(s,{type:'event-choice',id:'accept',confirmed:true}));assert.equal(gold-s.player.gold,cost);assert(row(s,'echo'));assert.equal(row(s,'openingEcho'),undefined);
 s=reload(E.transition(s,{type:'next'}));assert.equal(s.phase,'combat');assert.equal(row(s,'echo'),undefined);assert(row(s,'openingEcho'));assert.equal(s.enemy.openingEcho,.25);
 s=harmlessEnemy(s);s=reload(E.transition(s,{type:'roll'}));assert.equal(s.enemy.openingEcho,0);assert.equal(row(s,'openingEcho'),undefined);assert(s.lastRoll.mechanics.some(note=>note.startsWith('蓄室回响')));
});

test('paid ward is labeled as pending, uses max HP at combat entry, then leaves the ordinary ward to the health readout',()=>{
 let s=scene('wardbank');s=E.transition(s,{type:'event-choice',id:'accept',confirmed:true});assert(row(s,'ward'));assert.match(row(s,'ward').detail,/开战时的生命上限/);assert.match(row(s,'ward').detail,/当前尚未获得/);
 const priorWard=s.ward||0;s.player.talentPoints=1;s=E.transition(s,{type:'talent',id:'vitality'});const st=E.stats(s);
 s=reload(E.transition(s,{type:'next'}));assert.equal(s.v5Boons.ward,0);assert.equal(s.ward,Math.round(priorWard+st.maxHp*(st.barrier+.5)));assert.equal(row(s,'ward'),undefined);
});

test('an event-started two-wave battle consumes reserves at its real combat entry',()=>{
 let s=scene('oathgate');s.v5Boons={echo:1,ward:1};assert(row(s,'echo'));assert(row(s,'ward'));
 s=reload(E.transition(s,{type:'event-choice',id:'accept',confirmed:true}));assert.equal(s.phase,'combat');assert.deepEqual(s.v5Boons,{echo:0,ward:0});assert.equal(row(s,'echo'),undefined);assert.equal(row(s,'ward'),undefined);assert(row(s,'openingEcho'));assert.equal(s.route[0].waves,2);
});

test('floor departure clears all floor and next-roll entries while retaining unconsumed reserves',()=>{
 let s=scene();s.phase='cleared';s.roomIndex=5;s.route.forEach(r=>r.done=true);s.blessing=3;s.eventPower=15;s.eventLuck=8;s.nextLuck=15;s.v5Boons={echo:1,ward:1};
 assert.equal(row(s,'nextLuck').when,'下楼时清除');s=reload(E.transition(s,{type:'descend'}));assert.equal(s.phase,'fate');
 assert.deepEqual(rows(s).map(r=>r.key),['echo','ward']);assert.match(row(s,'echo').when,/可跨楼层保留/);assert.match(row(s,'ward').when,/可跨楼层保留/);
 s=E.transition(E.transition(s,{type:'fate'}),{type:'enter'});assert.equal(s.phase,'combat');assert.deepEqual(s.v5Boons,{echo:0,ward:0});assert(row(s,'openingEcho'));reload(s);
});

test('retry retains floor gains, clears pending combat luck and old opening echo, and never reissues already consumed reserves',()=>{
 let s=scene();s.phase='dead';s.player.hp=0;s.blessing=3;s.eventPower=15;s.eventLuck=8;s.nextLuck=15;s.enemy.openingEcho=.25;
 assert.equal(row(s,'openingEcho'),undefined);assert.equal(row(s,'nextLuck').when,'重燃时清除');
 s=reload(E.transition(s,{type:'retry'}));assert.deepEqual(rows(s).map(r=>r.key),['blessing','eventPower','eventLuck']);assert.equal(s.nextLuck,0);assert.equal(s.enemy.openingEcho,0);
 assert.equal(s.ward,Math.round(E.stats(s).maxHp*E.stats(s).barrier));
});

test('opening echo requires both live combat and an unrolled enemy, even when stale optional metadata exists',()=>{
 const s=scene();s.enemy.openingEcho=.25;assert(row(s,'openingEcho'));
 s.enemy.turns=1;assert.equal(row(s,'openingEcho'),undefined);
 s.enemy.turns=0;s.phase='dead';s.player.hp=0;assert.equal(row(s,'openingEcho'),undefined);
 s.phase='route';s.player.hp=E.stats(s).maxHp;assert.equal(row(s,'openingEcho'),undefined);
});
