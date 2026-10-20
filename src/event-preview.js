// Exact, read-only quotes for choices whose immediate result is already known.
// No transition, dice draw, reward generation, save write or confirmation occurs
// here. The original event choice and transaction remain authoritative.
import {stats} from './engine.js';
import {eventChoices} from './encounters.js';
import {ENHANCE_CAP,MAX_ITEM_LEVEL} from './equipment.js';

const supported={spring:['heal','ward'],prayer:['luck','power'],hollow_scale:['accept'],silent_anvil:['accept'],echochamber:['accept'],wardbank:['accept']};

// Numeric units: integer, level, enhance, items and reserve use their raw count;
// percent is a fraction (0.15 means 15%). Disabled choices have no after-state.
// Rows are detached display data. Unknown save/item fields remain untouched.
export function eventChoicePreview(s,choiceId) {
 const event=s?.event,key=event?.key;
 if(s?.phase!=='event'||event?.status!=='pending'||!Object.hasOwn(supported,key)||!supported[key].includes(choiceId))return null;
 const choice=eventChoices(s).find(option=>option.id===choiceId);
 if(!choice)return null;
 const quote={key,choiceId,available:!choice.disabled,reason:choice.disabled?choice.reason:'',rows:[],notes:[]};
 if(!quote.available)return quote;
 const p=s.player,ward=s.ward||0;
 const row=(key,label,before,after,unit='integer',extra={})=>quote.rows.push({key,label,before,after,delta:after-before,unit,...extra});
 const gold=()=>row('gold','持有金币',p.gold,p.gold-event.costGold);
 if(key==='spring'){
  const maxHp=stats(s).maxHp,heal=choiceId==='heal';
  row('hp','当前生命',p.hp,heal?maxHp:Math.min(maxHp,p.hp+Math.floor(maxHp*.35)));
  row('ward','当前护盾',ward,Math.max(ward,Math.floor(maxHp*(heal?.1:.35))));
  quote.notes.push('已有更高护盾会保留；本房治疗与护幕只能选择一项。');
 }else if(key==='prayer'){
  if(choiceId==='luck'){
   const before=s.eventLuck||0,after=before+Math.max(0,Math.min(8,20-before));
   gold();row('eventLuck','本层临时幸运',before,after);
   row('luck','当前幸运',stats(s).luck,stats({...s,eventLuck:after}).luck);
   quote.notes.push('幸运计入本层；当前幸运总值按现有天赋、装备与额外幸运计算。');
  }else{
   const before=s.eventPower||0,after=before+Math.max(0,Math.min(15,30-before));
   row('hp','当前生命',p.hp,p.hp-event.costHp);
   row('eventPower','本层伤害增幅',before/100,after/100,'percent');
   quote.notes.push('生命代价按入场时记录，换装不重算；伤害增幅在下楼时清除。');
  }
 }else if(key==='hollow_scale'){
  const target=p.items.find(item=>item.id===event.targetId);
  const level=Math.min(MAX_ITEM_LEVEL,target.level+3),levelXp=level===MAX_ITEM_LEVEL?0:target.levelXp;
  const next={...s,player:{...p,pactScars:(p.pactScars||0)+1,items:p.items.map(item=>item.id===target.id?{...item,level,levelXp}:item)}};
  const maxHp=stats(next).maxHp;
  row('maxHp','最大生命',stats(s).maxHp,maxHp);
  row('hp','当前生命',p.hp,Math.min(p.hp,maxHp));
  row('targetLevel','登记目标等级',target.level,level,'level',{targetId:target.id,targetName:target.name});
  if(levelXp!==target.levelXp)row('targetLevelXp','登记目标等级经验',target.levelXp,levelXp,'integer',{targetId:target.id,targetName:target.name});
  quote.notes.push('生命上限的代价永久保留；超出新上限的当前生命会被裁减。只提升本次登记的装备。');
 }else if(key==='silent_anvil'){
  const target=p.items.find(item=>item.id===event.targetId);
  // A contradictory imported reference has no surviving upgrade target. Do
  // not invent an equipment gain; leave its original transaction untouched.
  if(target.id===event.offerId)return null;
  row('inventoryCount','背包装备',p.items.length,p.items.length-1,'items');
  row('targetEnhance','登记目标强化',target.enhance,Math.min(ENHANCE_CAP,target.enhance+2),'enhance',{targetId:target.id,targetName:target.name});
  quote.notes.push('所列旧锻品永久消耗；目标最多增加 +2，不继承旧物的 +N。');
 }else{
  const boon=key==='wardbank'?'ward':'echo';gold();
  row(boon==='ward'?'reservedWard':'reservedEcho',boon==='ward'?'开场护幕储备':'首掷回声储备',s.v5Boons?.[boon]||0,1,'reserve');
  if(boon==='ward'){
   quote.notes.push('当前护盾不变；护幕在下一场开战时按当时最大生命的 50% 展开，储备可跨楼层保留。最终护盾受现有数值上限限制，已满时不再增加。');
  }else quote.notes.push('回声在下一场首掷追加 25% 主击伤害，只触发一次；储备可跨楼层保留。');
 }
 return quote;
}
