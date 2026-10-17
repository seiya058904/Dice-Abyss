import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import {CATALOG,RARITIES,TALENTS} from '../src/content.js';
import {ABILITY_DEFS,DEEP_TALENTS,DEEP_ROOMS,DEEP_BOSSES} from '../src/deep-content.js';
import {abilityRoll} from '../src/deep-rules.js';
import {highestRarity,rarityProbabilities,rollRarity} from '../src/rarity.js';
import {roomEligible} from '../src/route-weights.js';
import {eventChoices} from '../src/encounters.js';
import {validateSave,encodeSave,decodeSave} from '../src/storage.js';
import {validEquipment,MAX_ITEM_LEVEL} from '../src/equipment.js';
import {center,gameView} from '../src/views.js';
const entries=Object.values(CATALOG).flat();
const assign=(s,entry)=>({...E.makeItem(s,entry.slot,entry.rarity),catalogId:entry.id,name:entry.name,profile:entry.profile,theme:entry.theme,level:40});
function scene(type='combat',seed=7919,floor=200){
 let s=E.newGame(seed);s.floor=floor;s.player.level=50;s.player.xp=0;s.player.gold=1e7;s.player.items=[];
 for(const [slot,id]of Object.entries({weapon:'weapon-3-0-0',armor:'armor-1-1-0',relic:'relic-5-0-0'})){const entry=entries.find(e=>e.id===id);assert(entry,id);const item=assign(s,entry);s.player.items.push(item);s.player.equipped[slot]=item.id;}
 s.player.hp=E.stats(s).maxHp;s.fate=[3,4];s.phase='route';s.roomIndex=0;
 s.route=[type,'combat','forge','combat','gold',floor%5===0?'boss':'elite'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));
 return E.transition(s,{type:'enter'});
}
function inert(s){Object.assign(s.enemy,{trait:'steady',hp:1e9,maxHp:1e9,attack:180,shield:0,maxShield:1e8,turns:0,stage:2});delete s.enemy.mechanic;s.ward=0;s.player.hp=Math.floor(E.stats(s).maxHp*.25);return s;}
const reload=s=>{assert(validateSave(s),'save '+s.phase);assert.deepEqual(decodeSave(encodeSave(s)),s);return s;};
function nonCriticalRoll(s){for(let seed=1;seed<=1000;seed++){const before=structuredClone(s);before.rng=seed;const after=E.transition(before,{type:'roll'});if(!after.lastRoll.critical)return {before,after};}throw Error('no non-critical roll seed');}
function triggerCase(key,kind='equipment'){
 let s=inert(scene(key==='phaseWard'?'boss':key==='eliteLuck'?'elite':'combat'));
 if(kind==='equipment'){
  const entry=entries.find(e=>e.ability===key&&e.rarity===4);assert(entry,key);const item=assign(s,entry);s.player.items.push(item);s.player.equipped[item.slot]=item.id;
 }else{const [id]=Object.entries(DEEP_TALENTS).find(([,t])=>t.effect===key);s.player.talents[id]=3;}
 s.player.hp=Math.floor(E.stats(s).maxHp*.25);s.enemy.attack=50;
 if(key==='sixShatter')s.enemy.shield=1e8;
 if(key==='execution'){s.enemy.type='elite';s.enemy.hp=Math.floor(s.enemy.maxHp*.3);}
 if(key==='phaseWard'){s.enemy.stage=1;s.enemy.hp=Math.ceil(s.enemy.maxHp/2)+1;}
 if(['eliteLuck','gildedSix'].includes(key)){s.enemy.hp=1;s.enemy.shield=0;}
 for(let seed=1;seed<=1500;seed++){
  const before=structuredClone(s);before.rng=seed*104729>>>0;
  const after=E.transition(before,{type:'roll'}),r=after.lastRoll;
  const satisfied=key==='phaseWard'?r.phaseChanged:key==='firstCritLuck'?r.critical:key==='eliteLuck'?r.killed:key==='gildedSix'?r.killed&&r.values.filter(v=>v===6).length>=2:r.mechanics.some(t=>t.startsWith(ABILITY_DEFS[key].name+' ·'));
  if(satisfied&&(key!=='resolveGuard'||!r.dodged))return {before,after,st:E.stats(before),r};
 }
 throw Error('untriggered '+key+'/'+kind);
}
function verifyAbility(key,kind){
 const {before,after,st,r}=triggerCase(key,kind),a=abilityRoll(before,st,r.values,r.best,r.critical);
 assert(st[key]>0,key);reload(after);
 if(['tripleStrike','echoRelic'].includes(key)){assert.equal(r.echoDamage,Math.round(r.main*a.echo));assert(r.echoDamage>0);assert.equal(r.total,r.main+r.extra+r.echoDamage);}
 if(key==='sixShatter'){assert.equal(r.absorbed,Math.min(before.enemy.shield,Math.round(r.total*(1-Math.min(1,st.pierce+st.sixShatter)))));assert(r.hpDamage>0);}
 if(['criticalWard','lowWard','phaseWard'].includes(key)){const expected=key==='phaseWard'?Math.round(st.maxHp*st.phaseWard):a.ward;assert.equal(r.wardGain,expected);assert(expected>0);}
 if(['sixthMend','resonanceMend'].includes(key)){assert.equal(after.player.hp,Math.min(st.maxHp,before.player.hp-r.retaliation+a.heal));assert(a.heal>0);}
 if(key==='resolveGuard'){const raw=E.enemyAttack(before.enemy);assert.equal(r.retaliation,Math.max(1,Math.round((raw*(1-st.resolveGuard)-st.defense)*(1-st.reduction))));}
 if(key==='openingStrike'){const again=E.transition(after,{type:'roll'});assert(!again.lastRoll.mechanics.some(t=>t.startsWith(ABILITY_DEFS[key].name+' ·')));}
 if(key==='firstCritLuck'){assert.equal(after.nextLuck,Math.round(st.firstCritLuck));assert(after.enemy.firstCritUsed);const second=E.transition(after,{type:'roll'});assert.equal(second.lastRoll.luck,E.diceOdds(after).luck);assert.equal(second.nextLuck,0);}
 if(key==='eliteLuck'){assert.equal(after.eventLuck,Math.min(20,before.eventLuck+Math.ceil(st.eliteLuck)));const trial=structuredClone(before);trial.enemy.type='trial';assert.equal(E.transition(trial,{type:'roll'}).eventLuck,before.eventLuck);}
 if(key==='gildedSix')assert(after.chest.gold>0&&st.gildedSix>0);
 if(['execution','openingStrike','distinctStrike'].includes(key))assert(a.damage>1);
}
for(const key of Object.keys(ABILITY_DEFS))test('V5 real equipment trigger / '+key,()=>verifyAbility(key,'equipment'));
for(const [id,t] of Object.entries(DEEP_TALENTS))test('V5 gated talent, metadata, actual effect / '+id,()=>{
 let s=scene('rest',97,t.floor-1);s.player.talentPoints=3;assert.strictEqual(E.transition(s,{type:'talent',id}),s);s.floor=t.floor;
 const prior=E.stats(s)[t.effect];for(let i=0;i<3;i++)s=E.transition(s,{type:'talent',id});assert.equal(s.player.talents[id],3);assert(Math.abs(E.stats(s)[t.effect]-prior-t.amount*3)<1e-8);assert.strictEqual(E.transition(s,{type:'talent',id}),s);verifyAbility(t.effect,'talent');
});
test('all deep room and boss rule families alter actual damage, protection or retaliation, not only labels',()=>{
 const rules=[...Object.values(DEEP_ROOMS).filter(r=>r.kind==='combat').map(r=>r.key),...DEEP_BOSSES.map(b=>b.mechanic)];
 for(const mechanic of rules){let proved=false;
  for(let k=1;k<=120&&!proved;k++){const base=inert(scene(mechanic.startsWith('boss_')?'boss':'combat'));base.rng=k*104729>>>0;base.enemy.mechanic=mechanic;base.enemy.stage=k%2+1;base.enemy.turns=k%5;base.enemy.wave=3;base.enemy.hp=9e8;base.enemy.shield=['hush','boss_thread'].includes(mechanic)?1e8:0;base.player.hp=E.stats(base).maxHp;
   const neutral=structuredClone(base);neutral.enemy.mechanic=undefined;
   const actual=E.transition(base,{type:'roll'}),control=E.transition(neutral,{type:'roll'});assert.deepEqual(actual.lastRoll.values,control.lastRoll.values);
   proved=['total','retaliation','wardGain','absorbed'].some(key=>actual.lastRoll[key]!==control.lastRoll[key])||actual.enemy.hp!==control.enemy.hp||actual.enemy.shield!==control.enemy.shield;
  }
  assert(proved,mechanic);
 }
});
test('powerful gear can kill every new boss without a forced half-health gate',()=>{
 for(const boss of DEEP_BOSSES){let s=scene('boss');s.enemy.mechanic=boss.mechanic;s.enemy.hp=s.enemy.maxHp=2;s.enemy.shield=0;s.enemy.stage=1;const after=E.transition(s,{type:'roll'});assert.equal(after.phase,'chest');assert.equal(after.lastRoll.phaseChanged,false);assert.equal(after.lastRoll.retaliation,0);reload(after);}
});
for(const room of Object.values(DEEP_ROOMS).filter(r=>r.kind==='event'))test('V5 event accepts once, refuses safely, previews real cost and survives reload / '+room.key,()=>{
 let s=scene(room.key);s.player.talents.power=1;
 // Re-enter after provisioning an unprotected spare, so the actual offer is selected by the event engine.
 const spare=E.makeItem(s,'relic',1);s.player.items.push(spare);s.phase='route';s=E.transition(s,{type:'enter'});reload(s);
 const html=center(s,{view:'game',busy:false});assert(html.includes(room.name));assert(!/undefined|NaN/.test(html));
 const choices=eventChoices(s),option=choices.find(o=>!o.disabled&&o.id!=='leave');assert(option,room.key);assert(choices.some(o=>o.id==='leave'));
 const denied=E.transition(s,{type:'event-choice',id:'leave'});assert.equal(denied.player.gold,s.player.gold);assert.equal(denied.player.hp,s.player.hp);assert.deepEqual(denied.player.items,s.player.items);reload(denied);
 if(option.confirm)assert.strictEqual(E.transition(s,{type:'event-choice',id:option.id}),s);
 const bought=E.transition(s,{type:'event-choice',id:option.id,confirmed:true});assert.notStrictEqual(bought,s);reload(bought);assert.strictEqual(E.transition(bought,{type:'event-choice',id:option.id,confirmed:true}),bought);
 if(room.key==='bloodwell'){assert.equal(bought.player.hp,s.player.hp-s.event.costHp);assert(bought.chest.item.rarity>=3);}
 if(room.key==='relicloom'){assert(!bought.player.items.some(i=>i.id===s.event.offerId));assert.equal(bought.chest.item.slot,'relic');}
 if(room.key==='offering'){assert.equal(bought.player.talentPoints,s.player.talentPoints+1);assert.equal(bought.player.deepOfferings,1);}
 if(room.key==='abyssauction'){assert.deepEqual(bought.chest,s.event.reward);assert.equal(bought.rng,s.rng);assert.equal(bought.player.gold,s.player.gold-s.event.costGold);}
 if(room.key==='memorywell'){assert.equal(bought.player.talents.power,0);assert.equal(bought.player.talentPoints,s.player.talentPoints+1);assert(bought.player.hp<=s.player.hp);}
 if(room.key==='wishingvault'){assert.equal(bought.event.rolls.length,2);assert(bought.event.rolls.every(v=>v>=1&&v<=6));}
 if(['echochamber','wardbank'].includes(room.key)){
  const key=room.key==='echochamber'?'echo':'ward';assert.equal(bought.v5Boons[key],1);assert(!roomEligible(bought,room.key));let next=E.transition(bought,{type:'next'});next=E.transition(next,{type:'enter'});assert.equal(next.phase,'combat');assert.equal(next.v5Boons[key],0);
  if(key==='echo'){assert.equal(next.enemy.openingEcho,.25);next=E.transition(next,{type:'roll'});assert(next.lastRoll.echoDamage>=Math.round(next.lastRoll.main*.25));assert.equal(next.enemy.openingEcho,0);}else assert(next.ward>=Math.floor(E.stats(next).maxHp*.5));reload(next);
 }
 if(room.key==='oathgate'){let current=bought;const ids=[];for(let wave=1;wave<=2;wave++){current.enemy.hp=1;current.enemy.shield=0;current=E.transition(current,{type:'roll'});assert.equal(current.phase,'chest');assert(current.chest.item.rarity>=2);ids.push(current.chest.item.id);current=E.transition(current,{type:'open'});current=E.transition(current,{type:'next'});if(wave===1)assert.equal(current.phase,'combat');}assert.equal(new Set(ids).size,2);assert.equal(current.roomIndex,1);reload(current);}
});
test('eight-tier protections, finite growth, three relic slots and explicit gold-overflow recycling cannot trap a full bag',()=>{
 let s=scene('chest');const pending=structuredClone(s.chest);
 for(let rarity=3;rarity<8;rarity++){const item=E.makeItem(s,'relic',rarity);s.player.items.push(item);assert.equal(E.salvagePreview(s,[item.id]),null);assert(E.salvagePreview(s,[item.id],true));assert.equal(E.fusionPreview(s,s.player.equipped.relic,item.id),null);}
 const safe=E.makeItem(s,'weapon',0);s.player.items.push(safe);while(s.player.items.length<10000)s.player.items.push(E.makeItem(s,'armor',0));s.player.gold=E.GOLD_CAP;
 assert.strictEqual(E.transition(s,{type:'open'}),s);assert.equal(E.salvagePreview(s,[safe.id]),null);
 const preview=E.salvagePreview(s,[safe.id],false,true);assert.equal(preview.gold,0);assert(preview.overflow>0);
 const cleaned=E.transition(s,{type:'salvage',ids:[safe.id],allowOverflow:true});assert.equal(cleaned.player.items.length,9999);assert.equal(cleaned.player.gold,E.GOLD_CAP);assert.deepEqual(cleaned.chest,pending);
 const opened=E.transition(cleaned,{type:'open'});assert.equal(opened.player.items.length,10000);assert(opened.player.items.some(i=>i.id===pending.item.id));assert.equal(opened.player.gold,E.GOLD_CAP);reload(opened);assert(encodeSave(opened).length<5e6);
 for(const slot of ['weapon','armor','relic']){const max=E.makeItem(s,slot,7);max.level=MAX_ITEM_LEVEL;max.enhance=20;assert(validEquipment(max));assert(Number.isSafeInteger(E.itemValue(max)));assert(Object.values(E.itemStats(max)).every(Number.isFinite));}
});
test('unlock gates have exact zero early probability; each late source retains lower rarities and all top tiers are drawable',()=>{
 for(const floor of [1,29,30,49,50,79,80,139,140,200,400])for(const source of ['combat','elite','boss','hiddenboss','vault','merchant','blackmarket','auction']){
  const legacy=['merchant','blackmarket','auction'].includes(source)?'combat':source,ctx={floor,fate:[3,4],luck:20},prob=rarityProbabilities(ctx,source,legacy);
  assert(Math.abs(prob.reduce((a,b)=>a+b,0)-1)<1e-10);assert(prob.slice(highestRarity(floor)+1).every(n=>n===0));assert(prob.slice(0,4).some(n=>n>0));
  for(let rarity=4;rarity<=highestRarity(floor);rarity++){assert(prob[rarity]>0);const point=prob.slice(rarity+1).reduce((a,b)=>a+b,0)+prob[rarity]/2;assert.equal(rollRarity(point,ctx,source,legacy),rarity);}
 }
 assert.deepEqual(RARITIES.map(r=>r.multiplier),[1,1.7,2.9,5,8.5,14.5,24.5,42]);
});
test('all six deep stages and eight rarity filters render real rule data without mutating state or RNG',()=>{
 const ui={view:'codex',busy:false};let s=scene('rest');const old=structuredClone(s);const text=center(s,ui);for(const rarity of RARITIES)assert(text.includes(rarity.name));for(const category of ['combat','event']){const page=center(s,{...ui,codexCategory:category});for(const room of Object.values(DEEP_ROOMS).filter(r=>r.kind===category))assert(page.includes(room.name),room.name);}assert.deepEqual(s,old);
 for(const group of ['high','resonance','critical','vitality','luck']){const html=center(s,{...ui,view:'talents',talentGroup:group});for(const [key,t]of Object.entries(DEEP_TALENTS).filter(([,t])=>t.group===group))assert(html.includes(key));assert(!/undefined|NaN/.test(html));}
 const html=gameView(s,{...ui,view:'inventory'});for(let r=0;r<8;r++)assert(html.includes(RARITIES[r].name));assert.deepEqual(s,old);
});
test('a weapon losing penetration explicitly warns about thick shields instead of claiming an unconditional upgrade',()=>{
 const s=scene('combat'),entry=entries.find(e=>e.id==='weapon-4-0-3'),old=assign(s,entry);s.player.items.push(old);s.player.equipped.weapon=old.id;
 const next=assign(s,entries.find(e=>e.ability==='openingStrike'&&e.rarity===4));const report=E.compareEquipment(s,next);assert(report.delta>8);assert(report.shieldTradeoff);assert.equal(report.grade,'穿盾需权衡');assert(report.note.includes('厚盾'));assert(report.note.includes('另看词条'));
});
test('first-crit luck survives chest claim, save reload and room entry, then affects the first roll once',()=>{
 let s=scene('combat',1,80);s.player.level=1;s.player.talents.dawnCrit=3;s.enemy.hp=1;s.enemy.shield=0;s.rng=2;
 s=E.transition(s,{type:'roll'});assert.equal(s.phase,'chest');assert(s.lastRoll.critical&&s.lastRoll.killed);assert.equal(s.nextLuck,15);
 const reward=structuredClone(s.chest);s=E.transition(s,{type:'open'});assert.equal(s.phase,'loot');assert.equal(s.nextLuck,15);assert.deepEqual(s.loot,reward);
 assert.strictEqual(E.transition(s,{type:'open'}),s);assert.equal(s.counters.chests,1);
 s=reload(E.transition(s,{type:'next'}));assert.equal(s.phase,'combat');assert.equal(s.floor,80);assert.equal(s.nextLuck,15);
 const {before,after}=nonCriticalRoll(s),expected=E.diceOdds(before).luck;assert(expected>0);assert.equal(after.lastRoll.luck,expected);assert.equal(after.nextLuck,0);reload(after);
});
test('first-crit luck survives a multi-wave transition and is consumed by the next wave roll',()=>{
 let s=scene('combat',1,80);s.player.level=1;s.route[0].waves=2;s.route[0].wave=1;s.route[0].waveType='combat';s.player.talents.dawnCrit=3;s.enemy.hp=1;s.enemy.shield=0;s.rng=2;
 s=E.transition(s,{type:'roll'});assert(s.lastRoll.critical&&s.lastRoll.killed);assert.equal(s.nextLuck,15);
 s=E.transition(E.transition(s,{type:'open'}),{type:'next'});assert.equal(s.phase,'combat');assert.equal(s.route[0].wave,2);assert.equal(s.nextLuck,15);
 const {before,after}=nonCriticalRoll(s),expected=E.diceOdds(before).luck;assert.equal(after.lastRoll.luck,expected);assert.equal(after.nextLuck,0);reload(after);
});
test('first-crit luck persists through intervening transactions and clears on floor departure or retry',()=>{
 const {after,st}=triggerCase('firstCritLuck');assert(after.nextLuck>0);const between=structuredClone(after);between.phase='forge';const withBonus=E.stats(between).luck;between.nextLuck=0;assert(withBonus>E.stats(between).luck);
 const cleared=structuredClone(after);cleared.phase='cleared';cleared.roomIndex=5;cleared.route.forEach(r=>r.done=true);const departed=E.transition(cleared,{type:'descend'});assert.equal(departed.nextLuck,0);
 const dead=structuredClone(after);dead.phase='dead';dead.player.hp=0;const retried=E.transition(dead,{type:'retry'});assert.equal(retried.nextLuck,0);
});
