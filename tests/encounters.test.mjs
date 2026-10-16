import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM_ADDITIONS,ROOM_ADDITION_DETAILS,COMBAT_ROOMS,EXTRA_ENEMIES,EXTRA_BOSSES,ENCOUNTER_MECHANICS,EVENT_KEYS,generateExpandedRoute,canonicalCombatType,encounterProfile,initEncounterEnemy,combatModifiers,extraEnemyAttack,extraEnemyIntent,postRetaliation,encounterReward,createEvent,eventChoices,eventPresentation,applyEvent,eventStatBonuses} from '../src/encounters.js';
import {MAX_ITEM_LEVEL} from '../src/equipment.js';

const random=s=>{s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;};
function fixture(){
 const item=(id,slot,enhance=0)=>({id,slot,rarity:1,name:id,level:40,levelXp:0,enhance,locked:false});
 return {rng:17,nextId:7,floor:30,phase:'event',roomIndex:0,route:[{type:'mystery'}],log:[],player:{level:40,xp:0,gold:10000,hp:1000,items:[item('i1','weapon'),item('i2','armor'),item('i3','relic'),item('i4','relic'),item('i5','weapon',7),item('i6','armor')],equipped:{weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null}}};
}
function apiFor(template){return {
 random,pick:(s,list)=>template?(list.find(t=>t.key===template)||assert.fail(`Unavailable template ${template}`)):list[Math.floor(random(s)*list.length)],
 stats:s=>({maxHp:Math.round(1000*(1-(s.player.pactScars||0)*.02))}),
 makeItem:(s,slot='weapon',rarity=0,depth=s.floor,rewardType)=>({id:`i${s.nextId++}`,slot,rarity,name:'事件装备',depth,level:s.player.level+(rewardType==='event'?5:0),levelXp:0,enhance:0}),
 createChest:(s,type,source)=>({item:{id:`i${s.nextId++}`,slot:'weapon',rarity:type==='vault'?2:1,name:'箱内装备',level:s.player.level,levelXp:0,enhance:0},type,source,gold:40}),
 createEnemy:(s,type)=>({name:'挑战目标',type:canonicalCombatType(type),encounterKey:type,hp:100,maxHp:100,shield:0,maxShield:12,turns:0,attack:20}),
 gainGold:(s,n)=>s.player.gold=Math.min(1e10,s.player.gold+n),gainXp:(s,n)=>s.player.xp+=n,log:(s,text)=>s.log.push(text),
 };}

test('thirty real room types are reachable with four combat nodes and a service every four floors',()=>{
 assert.equal(Object.keys(ROOM_ADDITIONS).length+13,30);assert.equal(COMBAT_ROOMS.size,16);
 const seen=new Set();let combats=0,nodes=0;
 for(let seed=1;seed<=250;seed++){
  const s={rng:seed,floor:1};const services=[];
  for(let floor=1;floor<=60;floor++){
   s.floor=floor;const route=generateExpandedRoute(s,seed%2?[6,6]:[1,1],random);assert.equal(route.length,6);
   assert.equal(route.filter(r=>COMBAT_ROOMS.has(r.type)).length,4);assert.equal(route[5].type,floor%5===0?'boss':'elite');
   services.push(route[2].type);assert(s.encounterHistory.length<=8);
   route.forEach((room,index)=>{seen.add(room.type);assert.equal(room.id,`f${floor}r${index}`);assert.equal(room.done,false);if(COMBAT_ROOMS.has(room.type))combats++;nodes++;if(room.type==='gauntlet')assert.equal(room.waves,3);if(room.type==='duel')assert.equal(room.waves,2);});
  }
  for(let i=0;i<=services.length-4;i++)assert.deepEqual(new Set(services.slice(i,i+4)),new Set(['merchant','forge','fusion','rest']));
 }
 assert.equal(seen.size,30);assert.equal(combats/nodes,2/3);
});

test('twenty-four new enemies and six bosses carry actual mechanics, profiles and visible intent',()=>{
 assert.equal(EXTRA_ENEMIES.length,24);assert.equal(EXTRA_BOSSES.length,6);assert.equal(new Set([...EXTRA_ENEMIES,...EXTRA_BOSSES].map(e=>e.name)).size,30);
 for(const template of [...EXTRA_ENEMIES,...EXTRA_BOSSES]){
  assert(ENCOUNTER_MECHANICS.includes(template.mechanic));assert.equal(template.trait,'steady');assert(template.label);assert(template.note);
  const enemy={...template,hp:500,maxHp:1000,shield:0,maxShield:200,turns:0,attack:100};assert(extraEnemyIntent(enemy).detail);
 }
 const base={hp:1000,maxHp:1000,shield:0,maxShield:120};const armed=initEncounterEnemy(base,{type:'armored'});assert.equal(armed.shield,320);assert.equal(base.shield,0);
 assert.equal(encounterProfile('gauntlet').waves,3);assert.equal(canonicalCombatType('guardian'),'boss');assert.equal(canonicalCombatType('duel'),'elite');
 assert.equal(Object.keys(ROOM_ADDITION_DETAILS).length,17);
});

test('six new boss rules change damage, retaliation, recovery or player shield under their named conditions',()=>{
 const e={hp:500,maxHp:1000,shield:100,maxShield:200,turns:0},st={maxHp:1000};
 assert.equal(combatModifiers({...e,mechanic:'boss_sixseal'},[6,3],1,st).damageMultiplier,1.25);
 assert.equal(combatModifiers({...e,mechanic:'boss_sixseal'},[2,3],1,st).attackMultiplier,1.15);
 assert.equal(combatModifiers({...e,mechanic:'boss_choir'},[4,4],2,st).attackMultiplier,.8);
 assert.equal(combatModifiers({...e,mechanic:'boss_choir'},[4,3],1,st).attackMultiplier,1.15);
 assert.equal(postRetaliation({...e,mechanic:'boss_tide',turns:2},{values:[2,3]},st).enemyHeal,30);
 assert.equal(postRetaliation({...e,mechanic:'boss_tide',turns:2},{values:[6,6,6]},st).enemyHeal,0);
 assert.equal(combatModifiers({...e,mechanic:'boss_cinder'},[4,5,6],1,st).shieldPierce,.5);
 assert.equal(extraEnemyAttack({...e,mechanic:'boss_cinder',turns:1},100),130);
 assert.equal(extraEnemyAttack({...e,mechanic:'boss_hourglass'},100),125);
 assert.equal(combatModifiers({...e,mechanic:'boss_hourglass',turns:1},[2,3],1,st).damageMultiplier,1.25);
 assert.equal(combatModifiers({...e,mechanic:'boss_collector'},[3,3,3],3,st).wardGain,80);
 assert.equal(combatModifiers({...e,mechanic:'boss_collector'},[2,3],1,st).attackMultiplier,1.2);
});

test('special encounters have real triggers without mutating dice or hidden invulnerability',()=>{
 const values=Object.freeze([1,3,4]),e=Object.freeze({hp:300,maxHp:1000,shield:10,maxShield:200,turns:0,mechanic:'disruptor'}),st={maxHp:1000};
 assert.equal(combatModifiers(e,values,1,st).attackMultiplier,1.25);
 assert.equal(combatModifiers(e,[1,6],1,st).attackMultiplier,1);
 assert.equal(extraEnemyAttack({...e,mechanic:'berserker'},100),140);
 assert.equal(combatModifiers({...e,mechanic:'armored'},[6],1,st).shieldPierce,.45);
 assert.equal(combatModifiers({...e,mechanic:'mirror'},[2,3,4],1,st).damageMultiplier,1.35);
 assert.equal(combatModifiers({...e,mechanic:'mirror'},[3,3,3],3,st).damageMultiplier,.85);
 assert.equal(postRetaliation({...e,mechanic:'leech'},{values:[3]},st).enemyHeal,20);
 assert.equal(postRetaliation({...e,mechanic:'cursed'},{values:[1,3]},st).playerDrain,10);
 assert.equal(postRetaliation({...e,mechanic:'cursed'},{values:[1,6]},st).playerDrain,0);
 assert.equal(postRetaliation({...e,mechanic:'guardian'},{values:[2]},st).enemyWard,20);
 assert.equal(postRetaliation({...e,mechanic:'guardian'},{values:[6]},st).enemyWard,0);
 assert.equal(extraEnemyAttack({...e,mechanic:'gauntlet',wave:3},100),120);
 assert.equal(encounterReward({...e,mechanic:'bandit',turns:3}).goldMultiplier,2);assert.equal(encounterReward({...e,mechanic:'bandit',turns:4}).goldMultiplier,1);
 for(const mechanic of ENCOUNTER_MECHANICS)assert(combatModifiers({...e,mechanic},values,1,st).damageMultiplier>0);
});

test('each authored enemy pair has a mechanically different second variant, not only a different name',()=>{
 const inputs=[{values:[1,2,3],best:1},{values:[1,3,4],best:1},{values:[2,3,4],best:1},{values:[1,5,6],best:1},{values:[3,3,3],best:3},{values:[4,5,6],best:1},{values:[5,5,6],best:2}];
 const withoutNotes=result=>{const {notes,...numbers}=result;return numbers;};
 for(const roomType of new Set(EXTRA_ENEMIES.map(e=>e.roomType))){
  const [a,b]=EXTRA_ENEMIES.filter(e=>e.roomType===roomType);assert.equal(a.variant,0);assert.equal(b.variant,1);assert.notEqual(a.label,b.label);
  const signature=template=>JSON.stringify(inputs.flatMap(input=>[0,1,2,3].flatMap(turns=>[1,2,3].map(wave=>{
   const enemy={...template,hp:300,maxHp:1000,shield:0,maxShield:200,turns,wave};
   return {mod:withoutNotes(combatModifiers(enemy,input.values,input.best,{maxHp:1000})),attack:extraEnemyAttack(enemy,100),after:withoutNotes(postRetaliation({...enemy,turns:turns+1},{values:input.values},{maxHp:1000})),reward:encounterReward(enemy)};
  }))));
  assert(signature(a)!==signature(b),`${roomType} variants have identical numerical rules`);
 }
});

test('all eight mystery templates are conditional, serializable, executable and safely rejectable',()=>{
 const keys=EVENT_KEYS.filter(k=>!['spring','prayer','gambit','exchange'].includes(k));assert.equal(keys.length,8);
 for(const key of keys){
  const s=fixture(),api=apiFor(key);createEvent(s,'mystery',api);assert.equal(s.event.key,key);assert.deepEqual(JSON.parse(JSON.stringify(s.event)),s.event);
  const presentation=eventPresentation(s);assert(presentation.title);assert(presentation.body);assert.equal(presentation.options.at(-1).id,'leave');
  assert(presentation.options.length>=2&&presentation.options.length<=3);
  const choice=eventChoices(s)[0];assert.equal(choice.disabled,false,`${key}: ${choice.reason}`);assert(choice.cost);assert(choice.reward);
  const snapshot=JSON.stringify(s);assert.equal(applyEvent(s,{id:choice.id},api),false);assert.equal(JSON.stringify(s),snapshot);
  assert.equal(applyEvent(s,{id:choice.id,confirmed:true},api),true);assert.equal(s.event.status,'resolved');assert.deepEqual(eventChoices(s),[]);
  const committed=JSON.stringify(s);assert.equal(applyEvent(s,{id:choice.id,confirmed:true},api),false);assert.equal(JSON.stringify(s),committed);
  const refuse=fixture();createEvent(refuse,'mystery',api);const original=structuredClone(refuse.player);assert(applyEvent(refuse,'leave',api));assert.deepEqual(refuse.player,original);assert.equal(refuse.phase,'event');
 }
});

test('events apply concrete costs and bounded benefits; protected/missing materials disable offers',()=>{
 const pact=fixture();createEvent(pact,'mystery',apiFor('hollow_scale'));const oldEnhance=pact.player.items[0].enhance;assert(applyEvent(pact,{id:'accept',confirmed:true},apiFor()));assert.equal(pact.player.items[0].level,43);assert.equal(pact.player.items[0].enhance,oldEnhance);assert.equal(pact.player.pactScars,1);assert.equal(pact.player.hp,980);
 const exchange=fixture();createEvent(exchange,'mystery',apiFor('relic_exchange'));const consumed=exchange.event.offerId;assert(applyEvent(exchange,{id:'accept',confirmed:true},apiFor()));assert(!exchange.player.items.some(i=>i.id===consumed));assert.equal(exchange.phase,'chest');assert.equal(exchange.chest.item.rarity,2);assert.equal(exchange.chest.item.slot,'relic');assert.equal(exchange.chest.item.level,45);
 const anvil=fixture();createEvent(anvil,'mystery',apiFor('silent_anvil'));const target=anvil.player.items[0];assert(applyEvent(anvil,{id:'accept',confirmed:true},apiFor()));assert.equal(target.enhance,2);assert.equal(target.level,40);
 const hunt=fixture();createEvent(hunt,'mystery',apiFor('pursuer_contract'));assert(applyEvent(hunt,{id:'accept',confirmed:true},apiFor()));assert.equal(hunt.phase,'combat');assert.equal(hunt.route[0].waves,2);assert.equal(hunt.route[0].waveType,'elite');
 const disabled=fixture();createEvent(disabled,'mystery',apiFor('relic_exchange'));disabled.player.items.find(i=>i.id===disabled.event.offerId).locked=true;assert.equal(eventChoices(disabled)[0].disabled,true);assert.equal(applyEvent(disabled,{id:'accept',confirmed:true},apiFor()),false);
 const capped=fixture();capped.player.fateBlessings=5;capped.player.pactScars=5;capped.eventLuck=20;capped.eventPower=30;assert.deepEqual(eventStatBonuses(capped),{luck:25,damageMultiplier:1.3,maxHpMultiplier:.9});
 for(const type of ['spring','prayer','gambit','exchange']){const s=fixture();createEvent(s,type,apiFor());assert.equal(s.event.key,type);assert(eventChoices(s).some(o=>o.id==='leave'));}
 const prayer=fixture();prayer.eventLuck=19;createEvent(prayer,'prayer',apiFor());const gold=prayer.player.gold;assert(applyEvent(prayer,{id:'luck',confirmed:true},apiFor()));assert.equal(prayer.eventLuck,20);assert.equal(prayer.player.gold,gold-prayer.event.costGold);
 const poor=fixture();createEvent(poor,'prayer',apiFor());poor.player.hp=1;poor.player.gold=0;assert(eventChoices(poor).slice(0,-1).every(o=>o.disabled));assert(applyEvent(poor,'leave',apiFor()));
});

test('gambit commits all six faces once, stage pools stay eligible, and item level caps normalize progress',()=>{
 for(let face=1;face<=6;face++){
  const s=fixture(),api=apiFor();api.random=()=>((face-1)+.1)/6;createEvent(s,'gambit',api);const gold=s.player.gold,cost=s.event.costGold;
  assert(applyEvent(s,{id:'roll',confirmed:true},api));assert.equal(s.event.roll,face);
  assert.equal(s.player.gold,face<=2?gold-cost+Math.floor(cost/2):gold-cost);
  assert.equal(s.phase,face<=2?'event':'chest');if(face>=3)assert.equal(s.chest.item.rarity,face>=5?2:1);
  const committed=JSON.stringify(s);assert.equal(applyEvent(s,{id:'roll',confirmed:true},api),false);assert.equal(JSON.stringify(s),committed);
 }
 const early=fixture();early.floor=3;const api=apiFor();api.pick=(s,pool)=>{assert(pool.every(t=>t.minFloor<=3));assert(!pool.some(t=>['star_seal','thread_of_dawn','pursuer_contract'].includes(t.key)));return pool[0];};createEvent(early,'mystery',api);
 const nearCap=fixture();nearCap.player.items[0].level=MAX_ITEM_LEVEL-1;nearCap.player.items[0].levelXp=50;createEvent(nearCap,'mystery',apiFor('hollow_scale'));
 assert.match(eventChoices(nearCap)[0].reward,/Lv\. \+1$/);assert(applyEvent(nearCap,{id:'accept',confirmed:true},apiFor()));assert.equal(nearCap.player.items[0].level,MAX_ITEM_LEVEL);assert.equal(nearCap.player.items[0].levelXp,0);
 const maxed=fixture();maxed.player.items[0].level=MAX_ITEM_LEVEL;createEvent(maxed,'mystery',apiFor('hollow_scale'));assert(eventChoices(maxed)[0].disabled);
 const lucky=fixture(),luckyApi=apiFor();let dieCalls=0;luckyApi.die=()=>{dieCalls++;return 6;};luckyApi.random=()=>{throw Error('Uniform die should not bypass injected lucky die');};createEvent(lucky,'gambit',luckyApi);assert(applyEvent(lucky,{id:'roll',confirmed:true},luckyApi));assert.equal(lucky.event.roll,6);assert.equal(dieCalls,1);assert.equal(lucky.chest.item.level,45);
});

test('temporary buff offers reject saturation atomically and disclose the actual remaining gain',()=>{
 const offers=[{room:'prayer',id:'luck',key:'eventLuck',cap:20,near:16,gain:4},
  {room:'mystery',template:'traveler_lantern',id:'accept',key:'eventLuck',cap:20,near:16,gain:4},
  {room:'prayer',id:'power',key:'eventPower',cap:30,near:25,gain:5}];
 for(const offer of offers){
  const s=fixture(),api=apiFor(offer.template);s[offer.key]=offer.cap;createEvent(s,offer.room,api);
  const choice=()=>eventChoices(s).find(o=>o.id===offer.id);
  assert(choice().disabled);assert.match(choice().reason,/已达上限/);assert.match(choice().reward,/\+0/);
  const capped=JSON.stringify(s);assert.equal(applyEvent(s,{id:offer.id,confirmed:true},api),false);assert.equal(JSON.stringify(s),capped);
  s[offer.key]=offer.near;assert.equal(choice().disabled,false);assert(choice().reward.includes(`+${offer.gain}`));
  // A previously enabled preview must be checked again if another action has filled the cap.
  s[offer.key]=offer.cap;const stale=JSON.stringify(s);assert.equal(applyEvent(s,{id:offer.id,confirmed:true},api),false);assert.equal(JSON.stringify(s),stale);
  s[offer.key]=offer.near;const gold=s.player.gold,hp=s.player.hp;
  assert(applyEvent(s,{id:offer.id,confirmed:true},api));assert.equal(s[offer.key],offer.cap);
  assert(s.event.outcome.includes(`+${offer.gain}`));assert.equal(s.event.status,'resolved');
  assert.equal(s.player.gold,gold-(offer.id==='power'?0:s.event.costGold));assert.equal(s.player.hp,hp-(offer.id==='power'?s.event.costHp:0));
  const committed=JSON.stringify(s);assert.equal(applyEvent(s,{id:offer.id,confirmed:true},api),false);assert.equal(JSON.stringify(s),committed);
 }
});
