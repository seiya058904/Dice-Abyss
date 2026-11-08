import {stats,diceOdds,talent,talentPreview,combatCriticalChance,combatFollowChance} from './engine.js';
import {ABILITY_DEFS,DEEP_TALENTS} from './deep-content.js';

// Only the inspected node is evaluated. The preview shares the actual capped
// stats/probabilities with settlement and never transitions, rolls or writes.
export function talentBenefit(s,id,count=1) {
 const quote=talentPreview(s,id,count);
 if(!quote||!(['attune','critical','keen','echo','spark','luck','omen','vitality','guard'].includes(id)||Object.hasOwn(DEEP_TALENTS,id)))return null;
 // Inherit unrelated fields without reading them (including optional reserves).
 // This temporary overlay never leaves the calculation or enters persistence.
 const next=Object.create(s,{player:{value:{...s.player,talents:{...s.player.talents,[id]:quote.afterRank}}}});
 const before=stats(s),after=stats(next),rows=[];
 let note='按当前装备与天赋合计；条件满足时生效，不预言下一掷结果。';
 const add=(key,label,a,b,unit='percent',nominal=null)=>rows.push({key,label,before:a,after:b,unit,limited:nominal!==null&&b-a<nominal-1e-10});
 const crit=six=>add(six?'six-crit':'crit',six?'出现6：暴击率':'未出现6：暴击率',combatCriticalChance(s,before,six),combatCriticalChance(next,after,six),'percent',quote.count*.03);
 const follow=(pair,critical)=>add(critical?'critical-follow':pair?'pair-follow':'follow',critical?'共鸣且暴击：追击率':pair?'共鸣未暴击：追击率':'无共鸣：追击率',combatFollowChance(s,before,pair,critical),combatFollowChance(next,after,pair,critical),'percent',quote.count*(id==='critical'?.02:id==='echo'?.03:.05));
 if(id==='attune') {
  add('echo','后续骰跟随同点概率',diceOdds(s).echoChance,diceOdds(next).echoChance,'percent',quote.count*.02);
  note='上限25%；战斗、命运等多骰场景生效，第一颗骰不受同点引导影响。';
 } else if(id==='critical') {
  crit(false);if(talent(s,'keen'))crit(true);
  follow(false);if(talent(s,'echo'))follow(true,false);
  if(before.criticalFollow||talent(s,'spark'))follow(true,true);
 } else if(id==='keen')crit(true);
 else if(id==='echo'){follow(true,false);if(before.criticalFollow||talent(s,'spark'))follow(true,true);}
 else if(id==='spark')follow(true,true);
 else if(id==='luck'||id==='omen') {
  const active=id==='luck'||!!s.fate&&s.fate[0]===s.fate[1],a=diceOdds(s),b=diceOdds(next);
  add('luck','有效幸运',before.luck,after.luck,'integer',active?quote.count*(id==='luck'?4:2):null);
  add('high','单颗骰基础5／6点概率',a.highChance,b.highChance);
  add('echo','后续骰跟随同点概率',a.echoChance,b.echoChance);
  add('gold','新宝箱金币加成',before.goldBonus,after.goldBonus);
  note=active?'含当前本层与临时幸运；幸运软增长、取整及概率上限会影响收益，溢出可能增加宝箱金币。':'本层命运不是双同，当前没有新增幸运；后续楼层命运双同时可生效。';
 } else if(id==='vitality') {
  add('maxHp','生命上限',before.maxHp,after.maxHp,'integer');
  note='只增加生命上限，当前生命不会恢复。';
 } else if(id==='guard')add('defense','防御',before.defense,after.defense,'integer');
 else {
  const t=DEEP_TALENTS[id],def=ABILITY_DEFS[t.effect];
  let a=before[t.effect],b=after[t.effect],label=def.text;
  if(t.effect==='sixShatter') {
   a=Math.min(1,before.pierce+a);b=Math.min(1,after.pierce+b);
   label='出现6：基础与六刻穿盾合计';note='总穿盾最多100%；此处不含当前遭遇的额外穿盾。';
  } else if(['echoRelic','tripleStrike'].includes(t.effect)) {
   a=Math.min(1.4,before.echoRelic+before.tripleStrike);b=Math.min(1.4,after.echoRelic+after.tripleStrike);
   label='三同：追加主击伤害合计';
  } else if(t.effect==='eliteLuck') {
   const remaining=Math.max(0,20-(s.eventLuck||0));
   a=Math.min(remaining,Math.ceil(a));b=Math.min(remaining,Math.ceil(b));
   label='击败精英／首领：可增加本层幸运';note='本层累计上限20；换层后重新计算可增加量。';
  }
  add(t.effect,label,a,b,def.kind==='luck'?'integer':def.kind==='ward'||def.kind==='heal'?'maxHp':def.kind==='guard'?'reduction':'percent',quote.count*t.amount);
 }
 const unchanged=rows.every(row=>Math.abs(row.after-row.before)<1e-10);
 return {quote,rows,unchanged,limited:rows.some(row=>row.limited),note};
}
