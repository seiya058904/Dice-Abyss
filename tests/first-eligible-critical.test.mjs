import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {ABILITY_DEFS,DEEP_TALENTS,deepTalentText} from '../src/deep-content.js';
import {CATALOG} from '../src/content.js';
import {EXTRA_ENEMIES,encounterReward,encounterNarrative} from '../src/encounters.js';
import {equipmentComparisonDetails} from '../src/equipment-comparison.js';
import {boonReadout} from '../src/boon-readout.js';
import {itemEffects} from '../src/views.js';

const row=(s,key='firstCritLuck')=>boonReadout(s).groups.flatMap(group=>group.entries).find(entry=>entry.key===key);
const reload=s=>{assert(S.validateSave(s),`valid ${s.phase}`);const next=S.decodeSave(S.encodeSave(s));assert.deepEqual(next,s);assert.deepEqual(boonReadout(next),boonReadout(s));return next;};
function scene(type='combat'){
 let s=E.newGame(1);s.floor=80;s.player.level=11;s.player.talentPoints=3;s.player.xp=0;s.player.hp=E.stats(s).maxHp;s.fate=[3,4];
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f80r${i}`,type,done:false,quality:0}));s.phase='route';s=E.transition(s,{type:'enter'});
 Object.assign(s.enemy,{trait:'steady',hp:1e12,maxHp:1e12,shield:0,maxShield:0,attack:1,turns:0});delete s.enemy.mechanic;s.rng=7919;
 return reload(s);
}
function nextCritical(s){
 for(let turn=0;turn<100;turn++){const before=s;s=E.transition(s,{type:'roll'});if(s.lastRoll.critical)return {before,after:reload(s)};}
 assert.fail('The fixed 100-roll fixture did not produce a critical.');
}
function addRelic(s,id='v5-relic-1-0-4'){
 const definition=CATALOG.relic.find(entry=>entry.id===id);assert(definition);
 const item=E.makeItem(s,'relic',definition.rarity);
 Object.assign(item,{catalogId:definition.id,name:definition.name,profile:definition.profile,theme:definition.theme});s.player.items.push(item);
 return item;
}

test('a critical before learning the effect leaves the next eligible critical available',()=>{
 const first=nextCritical(scene()).after;assert.equal(first.enemy.turns,2);assert.equal(E.stats(first).firstCritLuck,0);assert.equal(row(first),undefined);
 assert.equal(first.nextLuck,0);assert.equal(Object.hasOwn(first.enemy,'firstCritUsed'),false);
 const learned=reload(E.transition(first,{type:'talent',id:'dawnCrit'}));
 assert.equal(row(learned).value,'暴击时原始幸运 +5');assert.match(row(learned).when,/尚未触发/);assert.match(row(learned).detail,/此前没有此效果时的暴击不计/);
 assert.equal(row(learned,'nextLuck'),undefined,'an opportunity does not grant luck before a critical');
 const eligible=nextCritical(learned).after;assert.equal(eligible.enemy.turns,9);assert.equal(eligible.nextLuck,5);assert.equal(eligible.enemy.firstCritUsed,true);
 assert.equal(row(eligible).value,'本场已触发');assert.equal(row(eligible,'nextLuck').value,'原始幸运 +5');
});

test('upgrading an already-used talent changes future strength but cannot grant another current-battle trigger',()=>{
 const learned=E.transition(nextCritical(scene()).after,{type:'talent',id:'dawnCrit'}),used=nextCritical(learned).after;
 const upgraded=reload(E.transition(used,{type:'talent',id:'dawnCrit'}));assert.equal(E.stats(upgraded).firstCritLuck,10);assert.equal(upgraded.nextLuck,5);
 assert.equal(row(upgraded).value,'本场已触发');assert.match(row(upgraded).detail,/提高天赋等级都不会再发放/);
 const later=nextCritical(upgraded).after;assert.equal(later.enemy.turns,24);assert.equal(later.nextLuck,0);assert.equal(later.enemy.firstCritUsed,true);assert.equal(row(later).value,'本场已触发');
});

test('equipment-only triggers use the real capped total and stay spent after unequipping and reequipping',()=>{
 let s=scene();const originalRelic=s.player.equipped.relic,item=addRelic(s);
 assert.equal(row(s),undefined,'owning an unequipped relic is not an active trigger');s=reload(E.transition(s,{type:'equip',id:item.id,slot:'relic'}));
 const grant=E.stats(s).firstCritLuck;assert.equal(grant,7);assert.equal(row(s).value,'暴击时原始幸运 +7');
 s=nextCritical(s).after;assert.equal(s.nextLuck,grant);assert.equal(row(s).value,'本场已触发');
 s=reload(E.transition(s,{type:'equip',id:originalRelic,slot:'relic'}));assert.equal(E.stats(s).firstCritLuck,0);assert.equal(row(s),undefined);assert(row(s,'nextLuck'));
 s=reload(E.transition(s,{type:'equip',id:item.id,slot:'relic'}));assert.equal(row(s).value,'本场已触发');assert.equal(nextCritical(s).after.nextLuck,0);
 const capped=scene();capped.player.talents.dawnCrit=3;
 for(const slot of ['relic','relic2','relic3']){const extra=addRelic(capped,'v5-relic-1-3-7');capped.player.equipped[slot]=extra.id;}
 assert.equal(E.stats(capped).firstCritLuck,24);assert.equal(row(reload(capped)).value,'暴击时原始幸运 +24');
});

test('an already-owned effect can become available after an earlier unequipped critical',()=>{
 let s=scene();const item=addRelic(s);s=nextCritical(s).after;
 assert.equal(s.nextLuck,0);assert(!s.enemy.firstCritUsed);assert.equal(row(s),undefined);
 s=reload(E.transition(s,{type:'equip',id:item.id,slot:'relic'}));assert.match(row(s).when,/尚未触发/);
 const used=nextCritical(s).after;assert.equal(used.nextLuck,7);assert.equal(row(used).value,'本场已触发');
});

test('a real kill and multi-wave entry preserve carried luck while opening a separate new opportunity',()=>{
 let s=E.transition(scene('duel'),{type:'talent',id:'dawnCrit'});s.route[0].waves=2;s.route[0].wave=1;s.route[0].waveType='elite';
 s=nextCritical(s).before;s.enemy.hp=1;s.enemy.shield=0;s=reload(E.transition(s,{type:'roll'}));
 assert.equal(s.phase,'chest');assert.equal(s.nextLuck,5);assert(s.lastRoll.critical&&s.lastRoll.killed);assert.equal(row(s),undefined);assert(row(s,'nextLuck'));
 const pending=structuredClone(s.chest);s=reload(E.transition(s,{type:'open'}));assert.deepEqual(s.loot,pending);assert.equal(row(s),undefined);
 s=reload(E.transition(s,{type:'next'}));assert.equal(s.phase,'combat');assert.equal(s.route[0].wave,2);assert.equal(s.nextLuck,5);assert.match(row(s).when,/尚未触发/);assert(row(s,'nextLuck'));
});

test('a real defeat hides the opportunity and retry clears earned luck while restoring the trigger',()=>{
 let s=E.transition(scene(),{type:'talent',id:'dawnCrit'});s=nextCritical(s).after;assert.equal(row(s).value,'本场已触发');
 s.player.hp=1;s.ward=0;s.enemy.attack=1e12;s=reload(E.transition(s,{type:'roll'}));assert.equal(s.phase,'dead');assert.equal(row(s),undefined);
 s=reload(E.transition(s,{type:'retry'}));assert.equal(s.phase,'combat');assert.equal(s.nextLuck,0);assert.equal(s.enemy.firstCritUsed,false);assert.match(row(s).when,/尚未触发/);
});

test('missing and false flags retain backward-compatible availability without being written by readout',()=>{
 for(const explicit of [false,true]){
  let s=E.transition(scene(),{type:'talent',id:'dawnCrit'});s.enemy.turns=6;if(explicit)s.enemy.firstCritUsed=false;else delete s.enemy.firstCritUsed;
  s.futureMetadata={nested:['keep',{value:13}]};s.enemy.futureRule={preserved:true};s=reload(s);const before=S.encodeSave(s),expected=E.transition(s,{type:'roll'});
  const guarded=new Proxy(s,{get(target,key){assert.notEqual(key,'rng','readout must not inspect the future RNG');return target[key];}});
  for(let i=0;i<8;i++)assert.match(row(guarded).when,/尚未触发/);
  assert.equal(S.encodeSave(s),before);assert.equal(Object.hasOwn(s.enemy,'firstCritUsed'),explicit);assert.deepEqual(E.transition(s,{type:'roll'}),expected);
 }
});

test('the opportunity appears only during live combat with a currently active source',()=>{
 const s=E.transition(scene(),{type:'talent',id:'dawnCrit'});assert(row(s));
 for(const phase of ['fate','route','dead','chest','loot','forge','event','cleared']){const changed=structuredClone(s);changed.phase=phase;assert.equal(row(changed),undefined,phase);}
 for(const key of ['player','enemy']){const changed=structuredClone(s);changed[key].hp=0;assert.equal(row(changed),undefined,key);}
 const unavailable=structuredClone(s);unavailable.player.talents.dawnCrit=0;assert.equal(row(unavailable),undefined);
});

test('authoritative item, talent and comparison copy names first eligibility and the existing duration',()=>{
 const definition=ABILITY_DEFS.firstCritLuck,talent=DEEP_TALENTS.dawnCrit;
 for(const text of [definition.text,talent.description,deepTalentText(talent,3)]){assert.match(text,/持有效果时首次暴击/);assert.match(text,/每场一次/);assert.match(text,/同层下一次战斗掷骰结算/);assert(text.length<=200);}
 assert(definition.text.length<=80);assert(talent.description.length<=80);assert.match(deepTalentText(talent,3),/幸运 \+15（3 级）/);
 const s=scene(),item=addRelic(s);assert.match(itemEffects(item),/持有效果时首次暴击/);assert.match(itemEffects(item),/幸运 \+7/);
 const comparison=equipmentComparisonDetails(s,item,'relic').rows.find(r=>r.key==='firstCritLuck');assert(comparison);assert.match(comparison.trigger,/持有效果时首次暴击/);assert.match(comparison.trigger,/每场一次/);
 for(const entry of boonReadout(E.transition(s,{type:'equip',id:item.id,slot:'relic'})).groups.flatMap(group=>group.entries))for(const value of Object.values(entry))assert(value.length<=200);
});

test('the alternate bandit narrative matches its two-roll reward window without rewriting old pending notes',()=>{
 const bandit=EXTRA_ENEMIES.find(e=>e.mechanic==='bandit'&&e.variant===1);assert.match(bandit.note,/前两击/);assert(bandit.note.length<=200);assert(bandit.label.length<=80);
 assert.deepEqual([1,2,3].map(turns=>encounterReward({...bandit,type:'combat',turns}).goldMultiplier),[3,3,1]);
 const old=scene();Object.assign(old.enemy,bandit);old.enemy.note='趁旅者停顿清点财物，前三击是夺回它的机会。';
 const restored=reload(old),before=S.encodeSave(restored);assert.equal(restored.enemy.note,old.enemy.note);assert.equal(E.transition(restored,{type:'roll'}).enemy.note,old.enemy.note);
 assert.equal(encounterNarrative(restored.enemy),bandit.note);assert.equal(S.encodeSave(restored),before);
});

test('inherited bandit narrative correction is an exact presentation match and preserves custom or unrelated notes',()=>{
 const old='趁旅者停顿清点财物，前三击是夺回它的机会。',current='趁旅者停顿清点财物，前两击是夺回它的机会。';
 const inherited=Object.freeze({name:'截路金匪',mechanic:'bandit',variant:1,note:old});assert.equal(encounterNarrative(inherited),current);assert.equal(inherited.note,old);
 for(const enemy of [
  {...inherited,variant:0},{...inherited,variant:undefined},{...inherited,mechanic:'parity'},
  {...inherited,note:old+' 这是玩家自写的记录。'},{...inherited,note:'自定义三回合故事'},
  {...inherited,note:current},{...inherited,note:'<b>三击</b>'},
 ])assert.equal(encounterNarrative(Object.freeze(enemy)),enemy.note);
 assert.equal(encounterNarrative(null),'');assert.equal(encounterNarrative({}),'');
});
