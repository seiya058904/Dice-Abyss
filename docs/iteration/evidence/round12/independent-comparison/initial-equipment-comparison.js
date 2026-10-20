// Read-only explanations for the existing comparison. This module never
// predicts dice, spends RNG, changes equipment, or replaces combat formulas.
import {stats,equipSlot,talent} from './engine.js';
import {itemStats} from './equipment.js';
import {ABILITY_DEFS} from './deep-content.js';

const changed=(a,b)=>Math.abs(a-b)>1e-10;
const chanceCrit=(s,st,six=false)=>Math.min(.9,st.crit+st.critBonus+(six?talent(s,'keen')*.03:0));
const chanceFollow=(s,st,pair=false,critical=false)=>Math.min(.85,st.follow+st.followBonus+(pair?talent(s,'echo')*.03:0)+(pair&&critical?st.criticalFollow+talent(s,'spark')*.05:0));

const omittedDamage={firstBonus:'首击',bossBonus:'强敌',sumBonus:'满盈',pierce:'穿盾',sixShatter:'穿盾',barrier:'护盾',pairWard:'护盾',criticalWard:'护盾',lowWard:'护盾',phaseWard:'护盾',regen:'恢复',healBonus:'击杀恢复',sixthMend:'恢复',resonanceMend:'恢复',resolveGuard:'临界减伤',reduction:'减伤',dodge:'闪避',goldBonus:'宝箱金币',gildedSix:'条件金币',firstCritLuck:'后续幸运',eliteLuck:'胜利幸运'};
const omittedArmor={firstBonus:'首击',bossBonus:'强敌',sumBonus:'满盈',pairBonus:'共鸣增伤',fourBonus:'骰面增伤',fiveBonus:'骰面增伤',sixBonus:'骰面增伤',crit:'暴击',critBonus:'暴击',follow:'追击',followBonus:'追击',critDamage:'暴击伤害',followDamage:'追击伤害',criticalFollow:'条件追击',pierce:'穿盾',sixShatter:'穿盾',openingStrike:'首击',execution:'强敌增伤',distinctStrike:'异点增伤',tripleStrike:'追加主击',echoRelic:'追加主击',pairWard:'共鸣护盾',criticalWard:'暴击护盾',lowWard:'低点护盾',phaseWard:'换相护盾',healBonus:'击杀恢复',sixthMend:'六点恢复',resonanceMend:'合鸣恢复',resolveGuard:'临界减伤',goldBonus:'宝箱金币',gildedSix:'条件金币',firstCritLuck:'后续幸运',eliteLuck:'胜利幸运',luck:'幸运',echoChance:'同点引导'};
const approximateDamage={openingStrike:'首掷',execution:'强敌低血',distinctStrike:'异点',tripleStrike:'三同',echoRelic:'三同',pairBonus:'共鸣',echoChance:'同点引导',criticalFollow:'共鸣暴击追击'};

// Fast card hint: two single-item reads, no whole-build stats or outcome table.
// A raw trait difference can be capped by the current build; the on-demand
// details below are authoritative about effective changes and cap messages.
export function equipmentComparisonHint(s,item,requestedSlot) {
 const slot=equipSlot(s,item,requestedSlot),old=s.player.items.find(i=>i.id===s.player.equipped[slot]);
 const a=itemStats(old),b=itemStats(item),armor=item.slot==='armor';
 const labels=definitions=>[...new Set(Object.entries(definitions).filter(([key])=>changed(a[key]||0,b[key]||0)).map(([,label])=>label))];
 const omittedLabels=labels(armor?omittedArmor:omittedDamage),approximateLabels=labels(armor?{barrier:'开战护盾',regen:'存活恢复'}:approximateDamage);
 const note=omittedLabels.length?`${omittedLabels.slice(0,2).join('、')}${omittedLabels.length>2?'等':''}词条未计入${armor?'生存':'伤害'}估值。`:'';
 return {slot,hasOmitted:omittedLabels.length>0,hasApproximate:approximateLabels.length>0,omittedLabels,approximateLabels,note};
}

// Values are the active whole-build contributions after the same caps used by
// stats(). A contribution is not a promised percentage change to final damage.
// `coverage` describes the shipped score, not the effect's usefulness.
export function equipmentComparisonDetails(s,item,requestedSlot) {
 const slot=equipSlot(s,item,requestedSlot),old=s.player.items.find(i=>i.id===s.player.equipped[slot]);
 const items=s.player.items.some(i=>i.id===item.id)?s.player.items:[...s.player.items,item];
 const next={...s,player:{...s.player,items,equipped:{...s.player.equipped,[slot]:item.id}}};
 const before=stats(s),after=stats(next),rows=[],limits=[],armor=item.slot==='armor';
 const damageCoverage=coverage=>armor?'omitted':coverage;
 const add=(key,label,trigger,a,b,unit='percent',coverage='omitted')=>{
  if(changed(a,b))rows.push({key,label,trigger,before:a,after:b,unit,coverage});
 };
 const stat=(key,label,trigger,unit='percent',coverage='omitted')=>add(key,label,trigger,before[key],after[key],unit,coverage);

 for(const [key,label,value,rank]of [['fourBonus','4点加成',4,'four'],['fiveBonus','5点加成',5,'five'],['sixBonus','6点加成',6,'six']]){
  const fixed=talent(s,rank)*(value===6?.18:.15)+(value>=5?talent(s,'high')*.12:0);
  add(key,label,`每颗${value}点骰`,fixed+before[key],fixed+after[key],'percent',damageCoverage('included'));
 }
 for(const [key,label,trigger,rank,amount,coverage]of [
  ['firstBonus','首击加成','每场首次掷骰','opener',.15,'omitted'],
  ['bossBonus','强敌加成','精英、首领或悬赏','slayer',.1,'omitted'],
  ['sumBonus','满盈加成','本次总点数至少18','sum',.1,'omitted'],
  ['pairBonus','共鸣加成','双同及以上','pair',.1,'approximate'],
 ])add(key,label,trigger,talent(s,rank)*amount+before[key],talent(s,rank)*amount+after[key],'percent',damageCoverage(coverage));

 stat('pierce','基础穿盾','敌人存在护盾');
 if(before.sixShatter||after.sixShatter)add('sixPierce','含6穿盾','装备与天赋合计；遭遇加成另计',Math.min(1,before.pierce+before.sixShatter),Math.min(1,after.pierce+after.sixShatter));
 stat('openingStrike','初焰主击加成','每场首次掷骰','percent',damageCoverage('approximate'));
 stat('execution','弑王主击加成','强敌生命不高于35%','percent',damageCoverage('approximate'));
 stat('distinctStrike','异点主击加成','至少4种不同骰面','percent',damageCoverage('approximate'));
 add('tripleEcho','三同追加主击','三同及以上；不再暴击或追击',Math.min(1.4,before.tripleStrike+before.echoRelic),Math.min(1.4,after.tripleStrike+after.echoRelic),'percent',damageCoverage('approximate'));

 const critical=[before,after].map(st=>[chanceCrit(s,st),chanceCrit(s,st,true)]);
 const variedCritical=critical.some(([plain,six])=>changed(plain,six));
 add('criticalChance','实际暴击率',variedCritical?'未出现6':'每次掷骰',critical[0][0],critical[1][0],'percent',damageCoverage('approximate'));
 if(variedCritical)add('sixCriticalChance','含6暴击率','本次出现6',critical[0][1],critical[1][1],'percent',damageCoverage('approximate'));
 const follow=[before,after].map(st=>[chanceFollow(s,st),chanceFollow(s,st,true),chanceFollow(s,st,true,true)]);
 add('followChance','基础追击率','没有共鸣',follow[0][0],follow[1][0],'percent',damageCoverage('included'));
 if(follow.some(p=>changed(p[0],p[1])))add('pairFollowChance','共鸣追击率','双同及以上且未暴击',follow[0][1],follow[1][1],'percent',damageCoverage('approximate'));
 if(follow.some(p=>changed(p[1],p[2])))add('criticalFollowChance','共鸣暴击追击率','双同及以上且暴击',follow[0][2],follow[1][2],'percent',damageCoverage('approximate'));
 add('criticalMultiplier','暴击主击倍率','发生暴击',1.8+talent(s,'crush')*.1+before.critDamage,1.8+talent(s,'crush')*.1+after.critDamage,'multiplier',damageCoverage('included'));
 add('followMultiplier','追击追加主击','发生追击',.35+talent(s,'pursuit')*.08+before.followDamage,.35+talent(s,'pursuit')*.08+after.followDamage,'percent',damageCoverage('included'));
 add('echoChance','实际同点引导率','从第二颗骰开始',Math.min(.25,before.echoChance+before.luck*.0015),Math.min(.25,after.echoChance+after.luck*.0015),'percent',damageCoverage('approximate'));

 for(const [key,label,trigger,unit,covered]of [
  ['barrier','开战护盾','进入下一场战斗','maxHp',true],
  ['pairWard','共鸣护盾','双同及以上','maxHp',false],
  ['criticalWard','暴击护盾','发生暴击','maxHp',false],
  ['lowWard','低点护盾','至少2颗1或2','maxHp',false],
  ['phaseWard','换相护盾','首领进入二阶段','maxHp',false],
  ['regen','存活恢复','掷骰结算后仍存活','maxHp',true],
  ['sixthMend','六点回生','出现6且结算后仍存活','maxHp',false],
  ['resonanceMend','合鸣恢复','四同且结算后仍存活','maxHp',false],
  ['resolveGuard','临界反击降低','掷骰前生命低于35%','reduction',false],
 ])stat(key,label,trigger,unit,armor&&covered?'approximate':'omitted');
 add('killMend','击杀恢复','击败敌人后',.16+talent(s,'recovery')*.03+before.healBonus,.16+talent(s,'recovery')*.03+after.healBonus,'maxHp');
 stat('firstCritLuck','首次暴击幸运','持续至同层下一次战斗掷骰结算','integer');
 const remainingLuck=Math.max(0,20-(s.eventLuck||0));
 add('eliteLuck','胜利增加本层幸运','击败精英或首领',Math.min(remainingLuck,Math.ceil(before.eliteLuck)),Math.min(remainingLuck,Math.ceil(after.eliteLuck)),'integer');
 add('goldBonus','新宝箱金币加成','生成宝箱时；不改已生成奖励',talent(s,'fortune')*.1+before.goldBonus,talent(s,'fortune')*.1+after.goldBonus);
 stat('gildedSix','六点击杀金币加成','至少2颗6且本掷击杀');

 // Cap messages are limited to an increased item contribution that produces
 // no additional effective value. Ordinary unchanged traits remain silent.
 const oldItem=itemStats(old),newItem=itemStats(item),increased=key=>(newItem[key]||0)>(oldItem[key]||0)+1e-10;
 const limit=(key,label,value,cap,unit='percent')=>limits.push({key,label,value,cap,unit});
 for(const [key,definition]of Object.entries(ABILITY_DEFS))if(increased(key)&&!changed(before[key],after[key])&&after[key]>=definition.cap-1e-10)limit(key,definition.name,after[key],definition.cap,definition.kind==='luck'?'integer':'percent');
 for(const [key,label,cap]of [['crit','基础暴击',.75],['follow','基础追击',.6],['echoChance','同点引导基础项',.25],['pierce','基础穿盾',.7],['barrier','开战护盾',.75],['pairWard','共鸣护盾',.2],['regen','存活恢复',.12],['criticalFollow','共鸣暴击追击加成',.5],['followDamage','追击倍率加成',1]])if(increased(key)&&!changed(before[key],after[key])&&after[key]>=cap-1e-10)limit(key,label,after[key],cap);
 for(const [key,label]of [['firstBonus','首击加成'],['bossBonus','强敌加成'],['sumBonus','满盈加成'],['pairBonus','共鸣加成'],['fourBonus','4点加成'],['fiveBonus','5点加成'],['sixBonus','6点加成'],['critBonus','暴击加成'],['followBonus','追击加成'],['healBonus','击杀恢复加成']])if(increased(key)&&!changed(before[key],after[key])&&after[key]>=.6-1e-10)limit(key,label,after[key],.6);
 // goldBonus also passes through the engine's earlier *Bonus cap. Its
 // effective equipment cap is .6; the later cap of 1 does not restore it.
 if(increased('goldBonus')&&!changed(before.goldBonus,after.goldBonus)&&after.goldBonus-Math.min(.5,after.luckOverflow*.002)>=.6-1e-10)limit('goldBonus','基础宝箱金币加成',.6,.6);
 if((increased('crit')||increased('critBonus'))&&critical.every(p=>p[0]>=.9-1e-10))limit('criticalChance','实际暴击率',.9,.9);
 if((increased('follow')||increased('followBonus')||increased('criticalFollow'))&&follow.every(p=>p[2]>=.85-1e-10))limit('criticalFollowChance','共鸣暴击追击率',.85,.85);
 if(increased('echoChance')&&[before,after].every(st=>st.echoChance+st.luck*.0015>=.25-1e-10)&&!limits.some(row=>row.key==='echoChance'))limit('echoChance','实际同点引导率',.25,.25);
 if(increased('eliteLuck')&&remainingLuck===0)limit('eventLuck','本层胜利幸运',20,20,'integer');

 const omittedLabels=rows.filter(row=>row.coverage==='omitted').map(row=>row.label),approximateLabels=rows.filter(row=>row.coverage==='approximate').map(row=>row.label);
 const note=omittedLabels.length?`${omittedLabels.slice(0,2).join('、')}${omittedLabels.length>2?'等':''}未计入${armor?'生存':'伤害'}估值。`:approximateLabels.length?'触发收益已作近似处理，具体条件见详情。':'';
 return {slot,rows,limits,omittedLabels,approximateLabels,note};
}
