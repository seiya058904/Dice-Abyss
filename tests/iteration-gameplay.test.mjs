import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// Point QA_ITERATION_ROOT at an untouched input copy to replay these regressions.
const root=process.env.QA_ITERATION_ROOT?pathToFileURL(process.env.QA_ITERATION_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const {center}=await import(new URL('src/views.js',root));
const {highestRarity}=await import(new URL('src/rarity.js',root));
const {validateSave,encodeSave,decodeSave}=await import(new URL('src/storage.js',root));
const {DEEP_BOSSES}=await import(new URL('src/deep-content.js',root));
const {combatModifiers}=await import(new URL('src/encounters.js',root));

function scene(type,seed=1,floor=80,level=100){
 let s=E.newGame(seed);s.floor=floor;s.player.level=level;s.player.xp=0;s.player.hp=E.stats(s).maxHp;s.player.gold=1e8;
 s.fate=[3,4];s.route=[type,'combat','rest','combat','gold',floor%5===0?'boss':'elite'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));
 s.roomIndex=0;s.phase='route';return E.transition(s,{type:'enter'});
}
function defeat(s,rng){
 s.enemy.hp=1;s.enemy.shield=0;s.rng=rng;
 const after=E.transition(s,{type:'roll'});assert.equal(after.phase,'chest');assert(after.lastRoll.killed);return after;
}
function eliteRewardBand(s){
 assert(s.chest.item.rarity>=2,'the bounty keeps its epic floor');
 assert(s.chest.item.rarity<=highestRarity(s.floor),'locked rarities stay unavailable');
 const low=Math.max(1,s.player.level-1),high=s.player.level+3;
 assert(s.chest.item.level>=low&&s.chest.item.level<=high,`Lv.${s.player.level} bounty dropped Lv.${s.chest.item.level}; elite rewards must be ${low}–${high}`);
}

test('bounty epic-floor replacement retains the canonical elite equipment level bonus',()=>{
 for(const rng of [110866,118785,158380]){
  const after=defeat(scene('bounty'),rng);eliteRewardBand(after);
  assert.equal(after.player.level,100);assert.equal(after.chest.item.level,99);
  assert.equal(after.chest.item.rarity,2);assert.equal(after.chest.type,'bounty');
  assert(validateSave(after));assert.deepEqual(decodeSave(encodeSave(after)),after);
 }
});

test('bounty rewards preserve the elite band across deep stages, seeds and character-level boundaries',()=>{
 for(const floor of [80,100,140,200,400])for(const level of [1,2,11,100,1000000]){
  const base=scene('bounty',1,floor,level),levels=new Set();
  for(let seed=1;seed<=60;seed++){
   const after=defeat(structuredClone(base),seed*7919);eliteRewardBand(after);levels.add(after.chest.item.level);
   assert.equal(after.chest.type,'bounty');assert(Number.isSafeInteger(after.chest.gold));
  }
  assert(levels.size>1,'the reward still uses a real random level band');
 }
});

test('both oathgate waves preserve epic rewards and elite levels through claim and reload',()=>{
 let s=scene('oathgate');s=E.transition(s,{type:'event-choice',id:'accept',confirmed:true});
 assert.equal(s.phase,'combat');
 const ids=[];
 for(const [wave,rng] of [[1,110866],[2,118785]]){
  assert.equal(s.route[0].wave,wave);assert.equal(s.enemy.mechanic,'bounty');
  s=defeat(s,rng);eliteRewardBand(s);ids.push(s.chest.item.id);
  assert(validateSave(s));s=decodeSave(encodeSave(s));
  s=E.transition(s,{type:'open'});assert.strictEqual(E.transition(s,{type:'open'}),s);
  s=E.transition(s,{type:'next'});
 }
 assert.equal(new Set(ids).size,2);assert.equal(s.roomIndex,1);assert.equal(s.phase,'combat');assert(validateSave(s));
});

test('a lethal ordinary dice condition is not described as a boss half-health transition',()=>{
 const s=scene('disruptor',19,80,11);
 s.player.equipped={weapon:null,armor:null,relic:null,relic2:null,relic3:null};s.player.hp=100;s.ward=0;
 Object.assign(s.enemy,{variant:0,mechanic:'disruptor',type:'combat',hp:1e9,maxHp:1e9,shield:0,maxShield:0,attack:100,trait:'steady',turns:0,label:'出现 1 且无 6：反击 +25%'});
 const intent=E.enemyIntent(s);assert.equal(intent.minDamage,98);assert.equal(intent.maxDamage,123);
 const html=center(s,{view:'game',busy:false});
 assert(!html.includes('若进入半血阶段，可能耗尽生命'),'ordinary enemies can be lethal because of a dice condition, with no half-health phase');
 assert(html.includes('可能耗尽生命'),'the real conditional lethal warning must remain visible');
 s.rng=63352;const after=E.transition(s,{type:'roll'});
 assert.equal(after.phase,'dead');assert.equal(after.lastRoll.retaliation,123);
 assert(after.enemy.hp>after.enemy.maxHp*.99);assert.equal(after.enemy.type,'combat');
});

test('Infinite Echo names the four-distinct-face threshold and keeps the phase-two triple rule',()=>{
 const boss=DEEP_BOSSES.find(boss=>boss.mechanic==='boss_infinite');assert.match(boss.label,/至少 4 种骰面/);assert.match(boss.label,/二阶段三同/);
 const before={...boss,stage:1,turns:0},after={...before,stage:2},st={maxHp:1000};
 assert.equal(combatModifiers(before,[1,2,3,3,2,1],2,st).damageMultiplier,1,'three distinct faces do not satisfy the first-phase rule');
 assert.equal(combatModifiers(before,[1,2,3,4,2,1],2,st).damageMultiplier,1.4,'four distinct faces satisfy the first-phase rule');
 assert.equal(combatModifiers(after,[1,2,3,4,2,1],2,st).damageMultiplier,1,'phase two no longer rewards diversity alone');
 assert.equal(combatModifiers(after,[1,1,1,2,3,4],3,st).damageMultiplier,1.6,'a triple satisfies the separate second-phase rule');
});

test('First-fire Witness explicitly counts three 5/6 faces, excluding fours and preserving its first roll',()=>{
 const boss=DEEP_BOSSES.find(boss=>boss.mechanic==='boss_witness');assert.match(boss.label,/至少 3 颗 5 \/ 6 点/);
 const e={...boss,stage:1,turns:1},st={maxHp:1000};
 assert.equal(combatModifiers(e,[4,4,4,2,2,2],3,st).attackMultiplier,1,'three fours are not high faces for this boss');
 assert.equal(combatModifiers(e,[5,6,4,2,2,2],3,st).attackMultiplier,1,'two high faces do not reach the threshold');
 assert.equal(combatModifiers(e,[5,6,5,2,2,2],3,st).attackMultiplier,.75,'three 5/6 faces reduce the counter by 25%');
 const opening=combatModifiers({...e,turns:0},[5,6,5,2,2,2],3,st);
 assert.equal(opening.damageMultiplier,1.5);assert.equal(opening.attackMultiplier,1,'the opening bonus is not combined with later-roll suppression');
});
