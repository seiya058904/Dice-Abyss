// Read the saved defeat without predicting dice, changing the build, or opening
// a paid service. Locked items remain wearable under the engine's equip rule.
import {canAct,equippedIds} from './engine.js';
import {TALENTS} from './content.js';
const description=value=>typeof value==='string'?value:'';

export function defeatReview(s) {
 if(s?.phase!=='dead')return null;
 const equipped=new Set(equippedIds(s)),available={weapon:0,armor:0,relic:0};
 for(const item of s.player.items)if(!equipped.has(item.id)&&Object.hasOwn(available,item.slot))available[item.slot]++;
 const enemy=s.enemy,roll=s.lastRoll;
 return {
  floor:s.floor,
  enemyName:enemy.name,
  turns:enemy.turns,
  enemyHp:enemy.hp,
  enemyMaxHp:enemy.maxHp,
  enemyShield:enemy.shield,
  lastRoll:roll?{hpDamage:roll.hpDamage,retaliation:roll.retaliation}:null,
  available,
  availableItems:Object.values(available).reduce((sum,n)=>sum+n,0),
  talentPoints:s.player.talentPoints,
  canInvest:Object.keys(TALENTS).some(id=>canAct(s,{type:'talent',id})),
  warning:description(enemy.warning)||description(enemy.label),
  counterplay:description(enemy.counterplay),
  phaseNote:description(enemy.phaseNote),
 };
}
