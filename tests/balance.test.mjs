import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,createEnemy,enemyAttack,enemyIntent,stats,makeItem,salvagePreview,itemValue,canAct,GOLD_CAP,fusionPreview} from '../src/engine.js';
import {encodeSave,decodeSave,validateSave} from '../src/storage.js';
import {runAdventure} from '../scripts/simulate.mjs';

function room(type='boss',seed=7919,floor=10){
 let s=newGame(seed);s.floor=floor;s=transition(s,{type:'fate'});s.route[0].type=type;return transition(s,{type:'enter'});
}

test('intent predicts ordinary retaliation exactly, including heavy timing, defense and rest ward',()=>{
 for(const trait of ['steady','fierce','shield','stout','rage','pulse','drain','ramp','ward'])for(const type of ['combat','elite','boss'])for(const turns of [0,1,2,3,5]){
  let s=room(type);Object.assign(s.enemy,{trait,hp:40000,maxHp:100000,shield:0,maxShield:12000,attack:20,turns,stage:2});s.ward=4;
  const intent=enemyIntent(s),next=transition(s,{type:'roll'});
  assert.equal(next.lastRoll.retaliation,intent.damage,`${trait}/${type}/${turns}`);
  assert.equal(intent.attack,enemyAttack(s.enemy));
  if(trait==='pulse'||type==='elite')assert.equal(intent.warning,turns%3===2);
 }
});

test('elite third-turn windup is visible and does not multiply an existing pulse heavy twice',()=>{
 let s=room('elite');Object.assign(s.enemy,{trait:'steady',attack:100,turns:1});
 assert.equal(enemyIntent(s).warning,false);assert.equal(enemyIntent(s).turnsUntilHeavy,2);
 s.enemy.turns=2;assert.equal(enemyIntent(s).warning,true);assert.equal(enemyAttack(s.enemy),155);
 s.enemy.trait='pulse';assert.equal(enemyAttack(s.enemy),160);
 delete s.enemy.combatRules;s.enemy.trait='steady';assert.equal(enemyAttack(s.enemy),100);
});

test('boss crossing half health creates one saved second phase and a breakable shield, including huge critical rolls',()=>{
 let s=room();s.player.level=1000;s.player.hp=stats(s).maxHp;
 Object.assign(s.enemy,{trait:'rage',hp:100,maxHp:100,shield:0,maxShield:12,attack:1,combatRules:2});
 const before=encodeSave(s),next=transition(s,{type:'roll'});
 assert.equal(encodeSave(s),before);assert.equal(next.enemy.hp,50);assert.equal(next.enemy.shield,12);
 assert.equal(next.enemy.stage,2);assert.equal(next.lastRoll.phaseChanged,true);assert(next.lastRoll.guarded>0);
 assert.equal(next.phase,'combat');assert.equal(enemyIntent(next).phase,2);assert(validateSave(next));
 const restored=decodeSave(encodeSave(next));
 assert.deepEqual(transition(restored,{type:'roll'}),transition(next,{type:'roll'}));
 const killed=transition(restored,{type:'roll'});assert.equal(killed.phase,'chest');assert.equal(killed.lastRoll.retaliation,0);assert.equal(killed.lastRoll.phaseChanged,false);
});

test('a committed old enemy keeps its health, RNG, no phase gate and old attack behavior',()=>{
 let s=room();s.player.level=1000;s.player.hp=stats(s).maxHp;
 delete s.enemy.combatRules;delete s.enemy.stage;Object.assign(s.enemy,{hp:100,maxHp:100,shield:0,maxShield:0,attack:1});
 const restored=decodeSave(encodeSave(s));assert.deepEqual(restored,s);
 assert.equal(transition(restored,{type:'roll'}).phase,'chest');
 restored.enemy.hp=40;restored.enemy.trait='rage';assert.equal(enemyIntent(restored).label,'激怒反击');
});

test('half-health attack increases have an explicit upper forecast before the crossing roll',()=>{
 const s=room();Object.assign(s.enemy,{trait:'rage',attack:100,shield:0,turns:0});s.ward=5;
 const before=enemyIntent(s);assert(before.conditionalDamage>before.damage);assert.match(before.detail,/本击生命伤害/);
 s.enemy.hp=Math.floor(s.enemy.maxHp/2);s.enemy.stage=2;
 assert.equal(enemyIntent(s).damage,before.conditionalDamage);assert.equal(enemyIntent(s).conditionalDamage,null);
});

test('retry resets phase once without inventing an opening shield or changing owned progress',()=>{
 let s=room();Object.assign(s.enemy,{trait:'rage',stage:2,hp:10000,maxHp:20000,shield:0,maxShield:2400,attack:99999});s.player.hp=1;
 s=transition(s,{type:'roll'});assert.equal(s.phase,'dead');const inventory=structuredClone(s.player.items),gold=s.player.gold;
 s=transition(s,{type:'retry'});assert.equal(s.enemy.stage,1);assert.equal(s.enemy.hp,20000);assert.equal(s.enemy.shield,0);assert.equal(s.enemy.turns,0);
 assert.deepEqual(s.player.items,inventory);assert.equal(s.player.gold,gold);assert(validateSave(s));
});

test('enemy power depends on floor and identity rather than secretly matching equipped gear',()=>{
 const a=newGame(881),b=structuredClone(a);a.floor=b.floor=10;b.player.level=500;
 const weapon=makeItem(b,'weapon',3,100);b.player.items.push(weapon);b.player.equipped.weapon=weapon.id;b.rng=a.rng;
 assert.deepEqual(createEnemy(a,'elite'),createEnemy(b,'elite'));
 for(const floor of [1,10,100,10000,1000000]){
  const s=room('boss',888,floor);assert(validateSave(s));assert(s.enemy.maxHp<=1e15);assert(s.enemy.attack<=1e15);
 }
});

test('leech applies to a surviving critical killing blow as described',()=>{
 let observed=false;
 for(let seed=1;seed<100&&!observed;seed++){
  const a=room('combat',seed,1);a.player.level=20;a.player.hp=10;a.enemy.hp=1;a.enemy.shield=0;
  const b=structuredClone(a);b.player.talents.leech=1;
  const x=transition(a,{type:'roll'}),y=transition(b,{type:'roll'});
  if(x.lastRoll.critical){assert.equal(y.player.hp-x.player.hp,Math.floor(stats(a).maxHp*.01));observed=true;}
 }
 assert(observed);
});

test('later merchants stock relevant tiers while already committed offers survive unchanged',()=>{
 for(const floor of [6,10,50,100]){
  let s=room('merchant',822,floor);assert(s.shop.filter(o=>o.item).every(o=>o.item.rarity>=2));assert(s.shop.some(o=>o.item?.rarity===3));
  assert.deepEqual(decodeSave(encodeSave(s)).shop,s.shop);
  s.player.gold=100000;const offer=s.shop.find(o=>o.item),gold=s.player.gold;
  s=transition(s,{type:'buy',id:offer.id});assert.equal(s.player.gold,gold-offer.price);assert(s.player.items.some(i=>i.id===offer.id));
  assert.strictEqual(transition(s,{type:'buy',id:offer.id}),s);
 }
});

test('double fate rewards use bounded depth power even at the maximum supported floor',()=>{
 for(const floor of [1,10,1000000,Number.MAX_SAFE_INTEGER]){
  let s;for(let seed=1;seed<100;seed++){const start=newGame(seed);start.floor=floor;const next=transition(start,{type:'fate'});if(next.fate[0]===next.fate[1]){s=next;break;}}
  assert(s);assert(Number.isSafeInteger(s.player.gold));assert(s.player.gold>80&&s.player.gold<10000);assert(validateSave(s));
  assert.deepEqual(decodeSave(encodeSave(s)),s);
 }
});

test('safe salvage selects only inferior common/rare gear and protects locks, relic vacancies and current loot',()=>{
 let s=room('chest',222,10);s=transition(s,{type:'open'});
 const better=makeItem(s,'weapon',3,10),low=makeItem(s,'weapon',0,1),locked=makeItem(s,'weapon',0,1),epic=makeItem(s,'weapon',2,1),legend=makeItem(s,'weapon',3,1),relic=makeItem(s,'relic',0,1);
 locked.locked=true;s.player.items.push(better,low,locked,epic,legend,relic);s=transition(s,{type:'equip',id:better.id});
 const preview=salvagePreview(s),ids=preview.items.map(i=>i.id);
 assert(ids.includes(low.id));for(const id of [locked.id,epic.id,legend.id,relic.id,s.loot.item.id,better.id])assert(!ids.includes(id));
 assert.equal(preview.gold,preview.items.reduce((n,i)=>n+Math.max(1,Math.floor(itemValue(i)*.15)),0));
 for(const protectedId of [locked.id,legend.id,s.loot.item.id,better.id])assert.equal(salvagePreview(s,[low.id,protectedId]),null);
 assert.equal(salvagePreview(s,[low.id,low.id]),null);assert(salvagePreview(s,[epic.id]));
 const before=encodeSave(s),gold=s.player.gold,next=transition(s,{type:'salvage',ids:[low.id,epic.id]});
 assert.equal(encodeSave(s),before);assert.equal(next.player.gold,gold+salvagePreview(s,[low.id,epic.id]).gold);assert.deepEqual(next.loot,s.loot);assert(validateSave(next));
 assert.strictEqual(transition(next,{type:'salvage',ids:[low.id,epic.id]}),next);
});

test('salvage frees a full inventory before claiming the same pending chest exactly once',()=>{
 let s=room('chest',223,1);const pending=structuredClone(s.chest),base=s.player.items[0];
 s.player.items.push(...Array.from({length:9997},(_,i)=>({...base,id:`i${i+5}`})));s.nextId=10002;
 assert.equal(s.player.items.length,10000);assert(validateSave(s));assert.equal(canAct(s,{type:'open'}),false);assert.strictEqual(transition(s,{type:'open'}),s);
 s=transition(s,{type:'salvage',ids:['i5','i6']});assert.equal(s.player.items.length,9998);assert.deepEqual(s.chest,pending);assert(validateSave(s));
 s=transition(s,{type:'open'});assert.equal(s.player.items.length,9999);assert(s.player.items.some(i=>i.id===pending.item.id));assert.deepEqual(s.loot,pending);assert(validateSave(s));
 assert.strictEqual(transition(s,{type:'open'}),s);
});

test('gold boundary rejects lossy salvage and safely caps natural rewards without invalidating saves',()=>{
 let s=room('chest',224,1);const material=makeItem(s,'weapon',0,1);s.player.items.push(material);s.player.gold=GOLD_CAP;
 assert.equal(salvagePreview(s,[material.id]),null);assert.strictEqual(transition(s,{type:'salvage',ids:[material.id]}),s);
 s=transition(s,{type:'open'});assert.equal(s.player.gold,GOLD_CAP);assert(validateSave(s));
 const fate=newGame(3);fate.floor=Number.MAX_SAFE_INTEGER;fate.player.gold=GOLD_CAP;
 const next=transition(fate,{type:'fate'});assert.equal(next.player.gold,GOLD_CAP);assert(validateSave(next));
});

test('explicit protected salvage can free a full legendary inventory while current loot, locks and gear stay protected',()=>{
 let s=room('chest',225,10);s=transition(s,{type:'open'});
 s.route[1].type='chest';
 delete s.route[0].wave;delete s.route[0].waves;
 const legendary=makeItem(s,'weapon',3,1),locked=makeItem(s,'weapon',3,1);locked.locked=true;s.player.items.push(legendary,locked);
 const start=s.nextId,count=10000-s.player.items.length;s.player.items.push(...Array.from({length:count},(_,i)=>({...legendary,id:`i${start+i}`})));s.nextId=start+count;
 assert.equal(s.player.items.length,10000);assert(validateSave(s));
 assert.equal(salvagePreview(s),null);assert.equal(salvagePreview(s,[legendary.id]),null);assert(salvagePreview(s,[legendary.id],true));
 for(const id of [s.loot.item.id,locked.id,s.player.equipped.weapon])assert.equal(salvagePreview(s,[id],true),null);
 const loot=structuredClone(s.loot);s=transition(s,{type:'salvage',ids:[legendary.id],allowProtected:true});assert.equal(s.player.items.length,9999);assert.deepEqual(s.loot,loot);assert(validateSave(s));
 s=transition(s,{type:'next'});assert.equal(s.phase,'chest');assert.equal(canAct(s,{type:'open'}),true);const pending=s.chest.item.id;s=transition(s,{type:'open'});
 assert.equal(s.player.items.length,10000);assert(s.player.items.some(i=>i.id===pending));assert(validateSave(s));
});

test('seeded encounters retain multi-roll bosses, observable phases and real elite windups',()=>{
 const runs=Array.from({length:40},(_,i)=>runAdventure((i+1)*7919,{validate:i<3}));
 assert(runs.every(r=>r.completed));
 const bosses=runs.flatMap(r=>r.encounters.filter(e=>e.type==='boss'));
 assert(bosses.some(e=>e.phaseChanges===1));assert(bosses.every(e=>e.turns>=1&&e.phaseChanges<=1));
 const median=xs=>xs.toSorted((a,b)=>a-b)[Math.floor(xs.length/2)];
 assert(median(bosses.filter(e=>e.roomType==='boss').map(e=>e.turns))>=3);
 assert(runs.flatMap(r=>r.attempts).filter(e=>e.type==='elite').some(e=>e.heavyAttacks>0));
 assert(runs.flatMap(r=>r.encounters).filter(e=>e.floor>=6&&e.type==='combat').some(e=>e.turns>=2));
});

test('future fusion quotes scale with target investment without changing any owned value or material contribution',()=>{
 const s=room('fusion',226,50),target=makeItem(s,'weapon',3,50),material=makeItem(s,'weapon',1,50);s.player.items.push(target,material);
 const initial=fusionPreview(s,target.id,material.id),value=itemValue(target),snapshot=encodeSave(s);
 target.level=s.player.level;const quote=fusionPreview(s,target.id,material.id);
 assert.equal(quote.levelMultiplier,1);assert.equal(quote.qualityMultiplier,1.75);assert.equal(quote.cost,Math.round(quote.baseCost*1.75));
 assert.equal(itemValue(material),itemValue(initial.material));assert(!Object.hasOwn(target,'growth'));
 target.level=500;const developed=fusionPreview(s,target.id,material.id);
 assert(developed.levelMultiplier>quote.levelMultiplier);assert(developed.cost>quote.cost);
 assert.equal(developed.base,initial.base);assert.deepEqual(developed.outcomes.map(o=>o.gains),initial.outcomes.map(o=>o.gains));
 s.player.gold=developed.cost-1;const unpaid=encodeSave(s);
 assert.strictEqual(transition(s,{type:'fuse',target:target.id,material:material.id}),s);assert.equal(encodeSave(s),unpaid);
 target.level=1e12;assert.equal(fusionPreview(s,target.id,material.id).cost,GOLD_CAP+1);
});

test('fusion previews all six exact rounded payouts and preserves positive three-relic sharing and capped reinforcement conversion',()=>{
 const faces=new Set();
 for(let seed=1;seed<300;seed++){
  let s=room('fusion',seed,10);s.player.gold=100000;
  const targets=Array.from({length:3},()=>makeItem(s,'relic',3,10)),material=makeItem(s,'relic',2,10);material.enhance=20;s.player.items.push(...targets,material);
  const ids=targets.map(t=>t.id),preview=fusionPreview(s,ids,[material.id]);
  assert.equal(preview.outcomes.length,6);assert(preview.outcomes.every(o=>o.gains.every(g=>g>0)));
  assert.equal(preview.outcomes[4].total,Math.floor(preview.base*1.75));assert.equal(preview.outcomes[5].total,Math.floor(preview.base*2.5));
  const next=transition(s,{type:'fuse',targets:ids,materials:[material.id]}),outcome=preview.outcomes[next.lastForge.value-1];faces.add(next.lastForge.value);
  assert.equal(next.lastForge.gain,outcome.total);assert.deepEqual(next.lastForge.gains,outcome.gains);assert.equal(next.player.gold,100000-preview.cost);
  assert(next.player.items.filter(i=>ids.includes(i.id)).every(i=>i.enhance===0));assert(validateSave(next));
 }
 assert.equal(faces.size,6);
});
