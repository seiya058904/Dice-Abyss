import {stats} from './engine.js';

// Read the committed state only. These entries explain existing lifetimes;
// they never forecast a face, consume a boon or add a field to the save.
// Current ward is already reported by the health bar. Permanent gifts and
// equipped/talent contributions remain in their existing character views.
export function boonReadout(s, currentStats) {
 const groups=[];
 const addGroup=(key,name,entries)=>{if(entries.length)groups.push({key,name,entries});};
 const entry=(key,name,value,when,detail)=>({key,name,value,when,detail});
 const luckContext=()=>{
  currentStats??=stats(s);
  return `当前总幸运投入 ${currentStats.rawLuck} → 有效幸运 ${currentStats.luck}，按现有软上限与取整结算。`;
 };
 const floor=[];
 if(s.blessing>0)floor.push(entry('blessing','祭坛祝福',`+${s.blessing*5}%`,'下楼清除 · 重燃保留','贡献到主击公式的加法增伤项，与无尽锋刃、首击等加法增伤相加后结算。'));
 if(s.eventPower>0){
  const gain=Math.min(30,s.eventPower);
  floor.push(entry('eventPower','祈愿战意',`伤害 ×${(1+gain/100).toFixed(2)}`,'下楼清除 · 重燃保留',`主击结算时乘以 ${(1+gain/100).toFixed(2)}；追击与回响沿用该主击。当前本层增幅 +${gain}%，上限 30%。`));
 }
 if(s.eventLuck>0)floor.push(entry('eventLuck','本层幸运',`原始幸运 +${Math.min(20,s.eventLuck)}`,'下楼清除 · 重燃保留',`祈愿、借灯与精英／首领胜利共用本层 20 点上限。${luckContext()}`));
 addGroup('floor','本层增益',floor);

 if(s.nextLuck>0){
  const leaving=['cleared','complete'].includes(s.phase),when=s.phase==='dead'?'重燃时清除':leaving?'下楼时清除':'至同层下一次战斗掷骰结算';
  const detail=`生效期间也参与事件、锻造与融合掷骰，以及新生成宝箱的幸运计算；这些操作与开箱不消耗它，也不改变已生成的奖励。下楼或重燃清除。${luckContext()}`;
  addGroup('nextRoll','待结算幸运',[entry('nextLuck','启明星余辉',`原始幸运 +${s.nextLuck}`,when,detail)]);
 }

 // Availability is separate from already-earned luck: a carried boon and the
 // next enemy's unused trigger can coexist. Missing legacy flags mean unused,
 // exactly as in combat settlement; reading this panel never records a use.
 if(s.phase==='combat'&&s.player.hp>0&&s.enemy?.hp>0){
  currentStats??=stats(s);
  if(currentStats.firstCritLuck>0){
   const used=!!s.enemy.firstCritUsed;
   addGroup('combatTrigger','本场触发机会',[entry('firstCritLuck','启明星',used?'本场已触发':`暴击时原始幸运 +${Math.round(currentStats.firstCritLuck)}`,
    used?'下一场或重燃后可再触发':'本场尚未触发 · 每场一次',
    used?'本场已触发；后续暴击、换装或提高天赋等级都不会再发放。下一名敌人或重燃后可重新触发。':
     '持有该效果期间的首次暴击才会占用机会；此前没有此效果时的暴击不计。幸运持续至同层下一次战斗掷骰结算，下楼或重燃清除。')]);
  }
 }

 const reserve=[];
 if(s.v5Boons?.echo)reserve.push(entry('echo','回声储备','首掷追加主击 25%','下场首掷 · 可跨楼层保留','进入下一场战斗时转为本场首掷回声，触发一次；不再触发暴击、追击或递归回响。重燃当前战斗不会重新发放。'));
 if(s.v5Boons?.ward)reserve.push(entry('ward','护幕储备','开战额外护盾 50%','下场开战 · 可跨楼层保留','按开战时的生命上限增加 50% 护盾，并与当时已有护盾、装备开战护盾一起结算；最终护盾受现有数值上限限制，已满时不再增加。当前尚未获得这层护盾；重燃当前战斗不会触发储备。'));
 addGroup('reserve','下场储备',reserve);

 if(s.phase==='combat'&&s.enemy?.turns===0&&s.enemy.openingEcho>0){
  addGroup('opening','本场首掷',[entry('openingEcho','蓄室回响',`追加主击 ${s.enemy.openingEcho*100}%`,'本场下一掷 · 仅一次','已从回声储备转入本场，按本次主击追加伤害；不再触发暴击、追击或递归回响。掷骰后消耗，重燃不重新发放。')]);
 }
 return {groups,empty:groups.length===0};
}
