import {ABILITY_DEFS,DEEP_ROOMS,deepVariantProfile} from './deep-content.js';
import {LEVEL_CAP,xpPreview,xpSummary} from './experience.js';
export function deepCombatModifiers(e,values,best,st,result){
 const sum=values.reduce((a,b)=>a+b,0),distinct=new Set(values).size,six=values.includes(6),high=values.filter(v=>v>=5).length,odd=values.filter(v=>v%2).length,turn=e.turns+1,variant=deepVariantProfile(e);
 const damage=(n,text)=>{result.damageMultiplier*=n;result.notes.push(text);};
 const counter=(n,text)=>{result.attackMultiplier*=n;result.notes.push(text);};
 switch(e.mechanic){
  case 'parity':if((((turn%2===1)!==!!variant)?odd:values.length-odd)>values.length/2)damage(1.35,'奇偶刻点吻合 · 伤害 +35%');break;
  case 'sequence':if(variant?best>=2:distinct>=3)damage(1.4,variant?'合鸣破阵 · 伤害 +40%':'异点破阵 · 伤害 +40%');break;
  case 'undertow':if(sum>=24)damage(1.25,'总点24 · 截断深潮，伤害 +25%');break;
  case 'hush':if(best>=2)counter(.8,'合鸣寂声 · 反击 -20%');else{result.shieldPierce+=.5;result.notes.push('独声切面 · 穿盾 50%');}break;
  case 'hourward':if(turn%2)counter(.8,'逆时护幕 · 反击 -20%');else damage(1.35,'逆时破绽 · 伤害 +35%');break;
  case 'onslaught':if(best>=3)counter(.75,'三同瓦解军阵 · 反击 -25%');break;
  case 'bounty':if(e.turns<3)damage(1.2,'逐星先手 · 伤害 +20%');break;
  case 'abyssking':if(e.stage===2?best>=3:six)damage(e.stage===2?1.6:1.35,e.stage===2?'碎冠三同 · 伤害 +60%':'六点夺冠 · 伤害 +35%');break;
  case 'archiveguard':if(distinct>=4){damage(1.5,'四种骰面 · 伤害 +50%');result.wardGain+=Math.floor(st.maxHp*.08);}else counter(1.15,'封存反击 · 反击 +15%');break;
  case 'boss_prism':if(distinct>=3)damage(1.4,'三种骰面折光 · 伤害 +40%');else counter(1.15,'棱镜闭合 · 反击 +15%');break;
  case 'boss_eclipse':if(turn%2&&!six)counter(1.25,'蚀日缺刻 · 反击 +25%');else if(turn%2===0&&best>=3)damage(1.5,'三同破蚀 · 伤害 +50%');break;
  case 'boss_witness':if(e.turns===0)damage(1.5,'始火首掷 · 伤害 +50%');else if(high>=3)counter(.75,'高点见证 · 反击 -25%');break;
  case 'boss_thread':if(best>=2){result.shieldPierce+=.45;result.notes.push('双同断线 · 穿盾 45%');}break;
  case 'boss_origin':if(sum>=24)damage(1.4,'始初满盈 · 伤害 +40%');else if(sum<=14)counter(1.25,'始初低谷 · 反击 +25%');break;
  case 'boss_infinite':if(e.stage===2?best>=3:distinct>=4)damage(e.stage===2?1.6:1.4,e.stage===2?'无终合鸣 · 伤害 +60%':'无终异点 · 伤害 +40%');break;
 }
 return result;
}
export function deepEnemyAttack(e,attack){
 if(e.mechanic==='laststand')return attack*(e.turns<2?.75:1+Math.min(.6,(e.turns-1)*.12));
 if(e.mechanic==='onslaught')return attack*(1+Math.max(0,(e.wave||1)-1)*.2);
 return attack;
}
export function deepPostRetaliation(e,roll,result){
 if(e.hp<=0)return result;
 if(e.mechanic==='sequence'){
  const distinct=new Set(roll.values).size,variant=deepVariantProfile(e);
  if(variant?distinct===roll.values.length:distinct<3){result.enemyWard+=Math.ceil(e.maxHp*.03);result.notes.push(variant?'独声未破阵 · 重筑 3% 护盾':'刻点不足 · 重筑 3% 护盾');}
 }
 if(e.mechanic==='undertow'&&roll.values.reduce((a,b)=>a+b,0)<24){result.enemyHeal+=Math.ceil(e.maxHp*.02);result.notes.push('深潮回流 · 恢复 2% 敌方生命');}
 if(e.mechanic==='boss_thread'&&roll.best<2){result.enemyWard+=Math.ceil(e.maxHp*.02);result.notes.push('命线重织 · 重筑 2% 护盾');}
 return result;
}
// Shared by the real roll and its forecast. Booleans describe which effects
// activated; forecasting can inspect them without allocating combat log strings.
export function abilityDefense(s,st,values,critical){
 let low=0;if(st.lowWard>0)for(const value of values)if(value<=2)low++;
 const criticalWard=critical&&st.criticalWard>0,lowWard=low>=2,resolveGuard=st.resolveGuard>0&&s.player.hp<st.maxHp*.35;
 return {criticalWard,lowWard,resolveGuard,ward:Math.floor((criticalWard?st.maxHp*st.criticalWard:0)+(lowWard?st.maxHp*st.lowWard:0)),counter:resolveGuard?1-st.resolveGuard:1};
}
// Triggered equipment is resolved once per manual roll. Echo cannot crit, follow or echo again.
export function abilityRoll(s,st,values,best,critical){
 const e=s.enemy,notes=[],recoveryKeys=[],six=values.includes(6),distinct=new Set(values).size,defense=abilityDefense(s,st,values,critical);
 let damage=1,echo=0,pierce=0,heal=0;
 const trigger=(key,active,apply)=>{if(active&&st[key]>0){apply(st[key]);notes.push(ABILITY_DEFS[key].name+' · 已触发');}};
 trigger('sixShatter',six,n=>pierce+=n);
 trigger('tripleStrike',best>=3,n=>echo+=n);
 trigger('echoRelic',best>=3,n=>echo+=n);
 trigger('execution',e.type!=='combat'&&e.hp<=e.maxHp*.35,n=>damage+=n);
 trigger('openingStrike',e.turns===0,n=>damage+=n);
 trigger('distinctStrike',distinct>=4,n=>damage+=n);
 for(const key of ['criticalWard','lowWard'])if(defense[key])notes.push(ABILITY_DEFS[key].name+' · 已触发');
 // Faces can qualify before retaliation, but recovery requires surviving its
 // complete settlement, including any later life drain. Keep typed recovery
 // keys and their original note position until that outcome is known.
 const recoveryIndex=notes.length;
 for(const [key,active]of [['sixthMend',six],['resonanceMend',best>=4]])if(active&&st[key]>0){heal+=st.maxHp*st[key];recoveryKeys.push(key);}
 if(defense.resolveGuard)notes.push(ABILITY_DEFS.resolveGuard.name+' · 已触发');
 if(e.turns===0&&e.openingEcho){echo+=e.openingEcho;notes.push('蓄室回响 · 首掷追加主击 25%');}
 return {damage,echo:Math.min(1.4,echo),pierce,ward:defense.ward,heal:Math.floor(heal),counter:defense.counter,notes,recoveryKeys,recoveryIndex};
}
export function abilityRecoveryNotes(abilities,survived){
 return abilities.recoveryKeys.map(key=>ABILITY_DEFS[key].name+(survived?' · 已触发':' · 未生效（本掷未存活）'));
}
const safeSpare=s=>s.player.items.filter(i=>!i.locked&&i.rarity<3&&!Object.values(s.player.equipped).includes(i.id)&&i.id!==s.loot?.item?.id);
const option=(id,label,detail,cost,reward,disabled=false,reason='',confirm=null)=>({id,label,detail,cost,reward,disabled,reason,confirm,destructive:!!confirm});
export function createDeepEvent(s,type,api){
 const r=DEEP_ROOMS[type],spare=safeSpare(s),item=spare.find(i=>type!=='relicloom'||i.slot==='relic');
 const e={key:type,roomType:type,title:r.name,text:r.purpose,status:'pending',choice:null,outcome:'',costGold:Math.min(1e8,Math.round(70+s.player.level*12)),costHp:Math.max(1,Math.floor(api.stats(s).maxHp*.2)),offerId:item?.id||null,targetId:s.player.equipped.weapon,rewardRarity:2};
 if(type==='abyssauction'){
  e.reward=api.createChest(s,'abyssauction',r.name);e.reward.type=type;
  e.costGold=Math.min(1e8,Math.round((150+s.player.level*16)*(1+e.reward.item.rarity*.65)));
 }
 s.event=e;s.phase='event';return e;
}
export function deepEventChoices(s){
 const e=s.event,offered=safeSpare(s).find(i=>i.id===e.offerId),enough=s.player.gold>=e.costGold,refundable=Object.values(s.player.talents).reduce((a,b)=>a+b,0);
 const pay=`${e.costGold} 金币`,confirm=`支付 ${pay}，提交后不可撤销。`;
 const earnPoint=(s.player.deepOfferings||0)<20&&s.player.talentPoints<2e6;
 let choices=[];
 switch(e.key){
  case 'bloodwell':choices=[option('accept','以血启匣','只扣当前生命，不减少最大生命。',`${e.costHp} 当前生命`,'至少传说深层宝箱；高阶仍按深度抽取',s.player.hp<=e.costHp,'生命不足，不能安全支付',`失去 ${e.costHp} 当前生命。`)];break;
  case 'relicloom':choices=[option('accept','重新织造','消耗这一件低阶遗物；不消耗传说及以上、已装备或锁定物品。',offered?.name||'无安全旧遗物','至少史诗的深层遗物宝箱',!offered||offered.slot!=='relic','没有可安全消耗的旧遗物','永久消耗所列旧遗物。')];break;
  case 'offering':choices=[option('accept','奉献旧物','永久获得一个可分配天赋点；与书库共用20次上限。',offered?.name||'无安全旧装备',`天赋点 +1（已得 ${s.player.deepOfferings||0}/20）`,!offered||!earnPoint,'无安全旧物或已达永久馈赠上限','永久消耗所列装备。')];break;
  case 'echochamber':choices=[option('accept','封存回声','下一场首掷追加 25% 主击伤害，仅一次；可跨楼层保留。',pay,'储备一次回声',!enough||!!s.v5Boons?.echo,'金币不足或已经储备',confirm)];break;
  case 'wardbank':choices=[option('accept','储备护幕','下一场开战增加最大生命50%的护盾，可跨楼层保留。',pay,'储备一次开场护盾',!enough||!!s.v5Boons?.ward,'金币不足或已经储备',confirm)];break;
  case 'starlibrary':{
   const quote=xpPreview(s.player.xp,Math.min(1e6,100+s.player.level*10)),quoted=xpSummary(quote,String,'经验可计入');
   const studyDetail=s.player.level===LEVEL_CAP?'已达角色等级上限；计入的经验会保留，不再升级。':s.player.talentPoints===2e6?'经验立即结算，可能升级；未分配天赋点已满，升级新增点数无法计入。':'经验立即结算，升级可获得天赋点。';
   choices=[option('study','研读星卷',studyDetail,pay,quote.limited?quoted:`${quote.rawXp} 经验`,!enough,'金币不足',quote.limited?`支付 ${pay}；${quoted}${quote.creditedXp===0?'；经验计入为 0，金币仍会支付':''}；提交后不可撤销。`:confirm),option('insight','永久领悟','与守望奉献共用20次上限；不是临时增益。',`${Math.min(1e8,e.costGold*3)} 金币`,'天赋点 +1',s.player.gold<Math.min(1e8,e.costGold*3)||!earnPoint,'金币不足或已达馈赠上限','支付三倍金币购买一个天赋点。')];
   choices[0].experience=quote;break;
  }
  case 'abyssauction':choices=[option('accept','按原价成交','眼前就是已生成的奖品；购买后仍亲自开箱。',pay,`${apiRarityName(e.reward.item.rarity)} ${e.reward.item.name} · Lv.${e.reward.item.level} · +${e.reward.item.enhance}`,!enough,'金币不足',confirm)];break;
  case 'oathgate':choices=[option('accept','应下双星誓','连续两名逐星悬令精英，各自留下至少史诗的装备宝箱。','两场精英战斗','两只真实宝箱，三掷内击杀各有金币加成',false,'','立即进入两波精英战斗。')];break;
  case 'wishingvault':choices=[option('roll','投下两颗愿骰','总点≤5返半价；6–9至少史诗；10–12至少传说。幸运影响点数。',pay,'高阶从本层已解锁奖池中抽取；不保证永恒',!enough,'金币不足',confirm)];break;
  case 'memorywell':choices=[option('reset','重绘天赋','全部投入返还，武器、防具与遗物不变；生命不会被免费填满。',pay,`返还 ${refundable} 天赋点`,!enough||!refundable||refundable+s.player.talentPoints>2e6,'金币不足、没有投入或点数超过安全上限',confirm+'全部天赋会重置。')];break;
 }
 choices.push(option('leave','安全离开','不支付任何代价。','无','保留当前进度'));return choices;
}
// Avoid importing content (which imports encounters) at the save boundary.
const apiRarityName=r=>['普通','稀有','史诗','传说','神话','太古','起源','永恒'][r];
export function applyDeepEvent(s,choice,api){
 const e=s.event;if(s.phase!=='event'||!e||e.status!=='pending'||!choice)return false;
 const selected=deepEventChoices(s).find(o=>o.id===choice.id);
 if(!selected||selected.disabled||(selected.confirm&&!choice.confirmed))return false;
 e.status='resolved';e.choice=choice.id;e.outcome='已安全离开，资产未改变。';
 if(choice.id==='leave'){api.log(s,e.outcome);return true;}
 const pay=(n=e.costGold)=>s.player.gold-=n,remove=()=>s.player.items=s.player.items.filter(i=>i.id!==e.offerId);
 const chest=(minimum,slot)=>{const reward=api.createChest(s,'vault',e.title);if(reward.item.rarity<minimum||slot)reward.item=api.makeItem(s,slot,Math.max(minimum,reward.item.rarity),s.floor,'event');reward.type=e.roomType;s.chest=reward;s.loot=null;s.enemy=null;s.phase='chest';};
 const point=()=>{s.player.talentPoints++;s.player.deepOfferings=(s.player.deepOfferings||0)+1;};
 switch(e.key){
  case 'bloodwell':s.player.hp-=e.costHp;chest(3);e.outcome='赤誓已付，宝箱已经生成。';break;
  case 'relicloom':remove();chest(2,'relic');e.outcome='旧遗物已消耗，新遗物箱等待开启。';break;
  case 'offering':remove();point();e.outcome='奉献完成，永久获得 1 天赋点。';break;
  case 'echochamber':pay();s.v5Boons={...s.v5Boons,echo:1};e.outcome='一声回响已储备，将在下一场首次掷骰触发。';break;
  case 'wardbank':pay();s.v5Boons={...s.v5Boons,ward:1};e.outcome='护幕已储备，将在下一场开战自动展开。';break;
  case 'starlibrary':if(choice.id==='insight'){pay(Math.min(1e8,e.costGold*3));point();e.outcome='永久获得 1 天赋点。';}else{
   const quote=xpPreview(s.player.xp,Math.min(1e6,100+s.player.level*10));pay();api.gainXp(s,quote.rawXp);
   e.outcome=quote.limited?`星卷已研读 · ${xpSummary(quote)}。${quote.creditedXp===0?`已支付 ${e.costGold} 金币，本次没有新增经验。`:''}`:'星卷已研读，经验立即计入。';
  }break;
  case 'abyssauction':pay();s.chest=structuredClone(e.reward);s.loot=null;s.enemy=null;s.phase='chest';e.outcome='已成交；奖品没有重新抽取，宝箱等待开启。';break;
  case 'oathgate':{const room=s.route[s.roomIndex];room.wave=1;room.waves=2;room.waveType='bounty';s.enemy=api.createEnemy(s,'bounty');s.enemy.encounterKey='bounty';s.enemy.wave=1;s.phase='combat';e.outcome='双星誓成立，第一名精英现身。';break;}
  case 'wishingvault':{pay();e.rolls=[api.die(s),api.die(s)];const sum=e.rolls[0]+e.rolls[1];if(sum<=5){api.gainGold(s,Math.floor(e.costGold/2));e.outcome=`愿骰 ${e.rolls.join(' + ')} = ${sum}，已返还一半金币。`;}else{chest(sum>=10?3:2);e.outcome=`愿骰 ${e.rolls.join(' + ')} = ${sum}，宝箱已生成。`;}break;}
  case 'memorywell':{pay();const points=Object.values(s.player.talents).reduce((a,b)=>a+b,0);s.player.talentPoints+=points;for(const k of Object.keys(s.player.talents))s.player.talents[k]=0;s.player.hp=Math.min(s.player.hp,api.stats(s).maxHp);e.outcome=`天赋重置，返还 ${points} 点。生命未被免费填满。`;break;}
 }
 api.log(s,e.outcome,'gold');return true;
}
