import {DICE_LEVELS} from './content.js';
import {diceCount} from './engine.js';

// Only deterministic combat-dice requirements, never the next roll's faces.
// Investment remains legal before a requirement is met.
const minimumDice={sum:3,resonance:2,pair:2,triple:3,quartet:4,choir:5,echo:2,spark:2,jackpot:3,
  deepEcho:3,tripleBlade:3,chorusMend:4,diversity:4,emberGuard:2,gildedFaces:2};
export function talentReadiness(s,id) {
 const required=Object.hasOwn(minimumDice,id)?minimumDice[id]:0;if(!required)return null;
 const count=diceCount(s),available=count>=required;
 const condition=id==='sum'?`当前最多 ${count*6} 点，需要总点数至少 18。`:`需要至少 ${required} 颗战斗骰，当前 ${count} 颗。`;
 return {available,count,required,unlockLevel:DICE_LEVELS[required-1],
  label:available?'骰数条件已满足':'当前骰数不足',
  message:available?'骰数条件已满足；仍需掷出对应点数，并满足节点的其他条件。':`${condition}第 ${required} 颗骰在 Lv.${DICE_LEVELS[required-1]} 解锁。可以提前投入，当前战斗中无法触发。`};
}
