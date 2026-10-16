import {MAX_ITEM_LEVEL,ENHANCE_CAP} from './equipment.js';
// Pure encounter rules and transaction helpers. This module never imports the engine.
export const ROOM_ADDITIONS = {
 armored:'重甲守卫',berserker:'狂怒猎手',leech:'汲光异兽',disruptor:'扰骰巡卫',mirror:'镜像对手',bandit:'黄金盗匪',gauntlet:'连续围猎',duel:'双重决斗',storm:'雷暴裂隙',cursed:'诅咒战场',guardian:'古代守门者',hiddenboss:'隐秘首领',
 spring:'恢复泉',prayer:'幸运祈愿',gambit:'命运赌桌',exchange:'遗迹置换',mystery:'未知遭遇',
};
export const COMBAT_ROOMS = new Set(['combat','elite','boss','trial','armored','berserker','leech','disruptor','mirror','bandit','gauntlet','duel','storm','cursed','guardian','hiddenboss']);
export const EVENT_ROOMS = new Set(['spring','prayer','gambit','exchange','mystery']);
export const ROOM_ADDITION_DETAILS = {
 armored:{purpose:'初始护盾较厚，六点可以穿透护盾。',reward:'出现 6 点时穿盾 45% 或 60%，以当前守卫标签为准。'},
 berserker:{purpose:'生命降至临界值后反击增强，两个猎手的阈值不同。',reward:'击杀必开箱；把握终结一击，避免承受激怒反击。'},
 leech:{purpose:'存活反击后汲取生命，部分异兽将汲光分给护盾。',reward:'爆发可以压过恢复；终结一击不会回血或重筑。'},
 disruptor:{purpose:'特定低点引发强化反击，指定高点可抵消。',reward:'实际骰面不变；当前敌人标签明确显示触发与解法。'},
 mirror:{purpose:'共鸣会被折射，异点或高点可以击破不同镜面。',reward:'明确的共鸣反制，不反弹伤害，也不改变骰面。'},
 bandit:{purpose:'前两次掷骰有伤害奖励，限时击杀追回额外金币。',reward:'拾金者三回合内金币 ×2；截路匪两回合内金币 ×3。'},
 gauntlet:{purpose:'连续三波较轻敌人，按追兵种类逐波增强反击。',reward:'每次击杀都出现真实宝箱；开箱后再迎接下一波。'},
 duel:{purpose:'两名精英依次迎战，首击与第二波有不同破绽。',reward:'每次击杀均开箱；两波结束才推进路线。'},
 storm:{purpose:'引雷者每两回合雷击，导电体每三回合爆雷。',reward:'出现 6 可减轻本次反击；雷击节奏始终可见。'},
 cursed:{purpose:'低点诱发短暂蚀命，指定高点可解除当次诅咒。',reward:'当前敌人标签说明对应点数；击杀不触发流失。'},
 guardian:{purpose:'反击后重筑少量护盾，指定高点阻止本次重筑。',reward:'首领级战利品；护盾重筑有上限，不会无限膨胀。'},
 hiddenboss:{purpose:'罕见首领：高点齐聚打出弱点，1 点使反击 +15%。',reward:'必得传说宝箱；弱点条件明确，不强制拖延回合。'},
 spring:{purpose:'选择治疗或储备护盾，也可以不取泉水。',reward:'本房只可选择一次，治疗与护盾有明确区别。'},
 prayer:{purpose:'用金币换本层幸运，或用生命换本层伤害。',reward:'收益直到下一层清除，选项始终允许拒绝。'},
 gambit:{purpose:'选择明确保底交易，或支付金币投一颗奖励骰。',reward:'1–2 点返还一半金币，3–4 点稀有箱，5–6 点史诗箱。'},
 exchange:{purpose:'自愿消耗一件未装备、未锁定的旧装备。',reward:'换取金币经验，或用旧遗物换高品质遗物箱。'},
 mystery:{purpose:'按深度、生命和背包状态出现的八种原创事件。',reward:'代价先展示；可以安全离开，稀有永久祝福有严格上限。'},
};

export const ENCOUNTER_MECHANICS = Object.freeze([...COMBAT_ROOMS].filter(k=>!['combat','elite','boss','trial'].includes(k)).concat(['boss_sixseal','boss_choir','boss_tide','boss_cinder','boss_hourglass','boss_collector']));
export function canonicalCombatType(type){return ['boss','guardian','hiddenboss'].includes(type)?'boss':['elite','duel'].includes(type)?'elite':type==='trial'?'trial':'combat';}
export function encounterProfile(type){
 const values={armored:[1.08,.9,.32],berserker:[.95,1.05,0],leech:[1,1,0],disruptor:[.95,1,0],mirror:[1.05,1,0],bandit:[.95,1,0],gauntlet:[.48,.9,0,3],duel:[.65,.95,0,2],storm:[1,1,0],cursed:[.95,.95,0],guardian:[.55,.9,.18],hiddenboss:[1.05,1,0]};
 const [hpMultiplier=1,attackMultiplier=1,shieldFraction=0,waves=1]=values[type]||[];
 return {hpMultiplier,attackMultiplier,shieldFraction,waves};
}
export function initEncounterEnemy(enemy,room){
 const profile=encounterProfile(room.type),shield=Math.round(enemy.maxHp*profile.shieldFraction);
 const leechWard=enemy.mechanic==='leech'&&enemy.variant===1?Math.ceil(enemy.maxHp*.12):0;
 return {...enemy,encounterKey:room.type,wave:room.wave||1,shield:Math.max(enemy.shield||0,shield),maxShield:Math.max(enemy.maxShield||0,shield,leechWard)};
}

const authored = [
 ['armored',1,'断铆卫士','石门负甲者','把遗迹大门当作盾牌，守住最后一道门缝。','盔甲的铆钉早已断裂，旧命令仍支撑着重量。'],
 ['berserker',3,'赤痕追猎者','余火搏命者','生命的余火越暗，最后的扑击越急。','不顾伤口逼近，等待一次濒危的反扑。'],
 ['leech',4,'噬辉幼兽','饮烬潜伏者','循着护符的微光靠近，把敌人的迟疑当成食物。','藏在暖灰里，只有反击时才显出汲取的痕迹。'],
 ['disruptor',5,'错刻巡卫','偏针司骰者','刻度错开一格，每个低点都让它重新绷紧。','追逐偏离的点数，唯独不敢靠近完整的六点。'],
 ['mirror',7,'碎镜行者','反照监守','模仿同一个动作，却会被不同的骰声扰乱。','镜面捕捉整齐的共鸣，杂乱的回声却能穿过去。'],
 ['bandit',2,'拾金掠夺者','截路金匪','腰间金币还未系紧，迅速击败便能全部追回。','趁旅者停顿清点财物，前三击是夺回它的机会。'],
 ['gauntlet',6,'窄道围猎者','连哨追兵','前一队倒下，后一队才从窄道另一端出现。','哨声逐渐逼近，每一波都要亲手夺回战利品。'],
 ['duel',8,'无旗决斗者','空誓副手','约好依次交锋，每次登场都暴露一瞬破绽。','等第一位倒下才拔剑，绝不分享同一个战利品。'],
 ['storm',6,'引雷游骑','裂隙导电体','雷纹每两轮聚满，六点却能将电光引向地面。','碎裂的躯壳传导暴雷，也留下了可见的间歇。'],
 ['cursed',9,'缚咒祭守','蚀命低语者','咒线缠住最低的刻点，完整六点能把它烧断。','反击后留下短暂诅咒，结束战斗便不再追索。'],
 ['guardian',12,'旧城扉主','沉碑守门者','每次回击重筑一块门砖，六点能打断工序。','石碑收拢裂隙，却不可能筑出比原来更厚的墙。'],
 ['hiddenboss',15,'无名裂隙主','失序守望者','只在极深的裂隙里现身，高点齐聚时会露出破绽。','拒绝整齐的旧秩序，却无法承受完整高点的冲击。'],
];
const variantLabels={
 armored:['出现 6：穿盾 45%','出现 6：穿盾 60%'],
 berserker:['生命 ≤35%：反击 +40%','生命 ≤50%：反击 +25%'],
 leech:['反击后恢复最大生命 2%','反击后恢复 1% 生命、重筑 1% 护盾'],
 disruptor:['出现 1 且无 6：反击 +25%','出现 2 且无 5：反击 +25%'],
 mirror:['三同伤害 -15%；异点伤害 +35%','双同伤害 -10%；全为高点再 +30%'],
 bandit:['前两击伤害 +25%；三回合内金币 ×2','前两击伤害 +15%；两回合内金币 ×3'],
 gauntlet:['每后续波反击 +10%','每后续波反击 +15%'],
 duel:['每波首击伤害 +25%','第一波首击 +10%；第二波全部伤害 +20%'],
 storm:['每两回合反击 ×1.35；6 点导雷 -25%','每三回合反击 ×1.6；6 点导雷 -25%'],
 cursed:['出现 1 且无 6：反击后流失生命 1%','出现 2 且无 5：反击后流失生命 1%'],
 guardian:['反击后重筑 2% 护盾，6 点阻止','反击后重筑 3% 护盾，5 点阻止'],
 hiddenboss:['全为 4–6 点：伤害 +30%；1 点反击 +15%','全为 5–6 点：伤害 +50%；1 点反击 +15%'],
};
export const EXTRA_ENEMIES = authored.flatMap(([mechanic,minFloor,a,b,na,nb])=>[a,b].map((name,index)=>({name,note:index?nb:na,trait:'steady',mechanic,variant:index,roomType:mechanic,minFloor,label:variantLabels[mechanic][index]})));
export const EXTRA_BOSSES = [
 {name:'六封掌印者',identity:'封印刻点的保管者',mechanic:'boss_sixseal',label:'6 点破封：伤害 +25%；无 6 反击 +15%',note:'「每一道封印，都留着第六个缺口。」',warning:'没有 6 点时，本次反击会更强。',counterplay:'六点同时提升伤害并压制额外反击。'},
 {name:'失谐唱诗长',identity:'回声合唱的囚徒',mechanic:'boss_choir',label:'共鸣使反击 -20%；无共鸣反击 +15%',note:'「让我听见，不属于我的第二个声音。」',warning:'无共鸣时会强烈反击。',counterplay:'双同即可压制反击，不要求稀有的高重共鸣。'},
 {name:'归潮记录官',identity:'记录每次退潮的看守',mechanic:'boss_tide',label:'每两次反击回血 3%；总点 ≥18 阻止恢复',note:'「潮水记得，每一道未愈合的伤口。」',warning:'第二、四、六次存活反击后恢复生命。',counterplay:'总点达到 18 可阻止这一次归潮。'},
 {name:'熔棱督造者',identity:'熔炉的最后督工',mechanic:'boss_cinder',label:'每两回合反击 ×1.3；三颗高点穿盾 50%',note:'「炉中锻出的裂缝，也会传导你的火。」',warning:'偶数回合反击增强。',counterplay:'至少三颗 4–6 点可穿透本次 50% 护盾。'},
 {name:'倒沙裁定者',identity:'交替刻度的裁定者',mechanic:'boss_hourglass',label:'奇数回合反击 +25%；偶数回合受伤 +25%',note:'「一步收紧，一步松开。」',warning:'奇数回合反击较强，偶数回合会暴露破绽。',counterplay:'交替的强弱都可见，不设置无敌等待回合。'},
 {name:'索光藏主',identity:'收藏失落光线的主人',mechanic:'boss_collector',label:'总点 <14 反击 +20%；三同给我方 8% 护盾',note:'「你能带走多少光，便要留下多少回声。」',warning:'低总点会让本次反击增强。',counterplay:'三同可夺回最大生命 8% 的护盾，当次即可抵挡反击。'},
].map(b=>({...b,trait:'steady',phaseLabel:'封界再临',phaseNote:'半血后进入第二阶段，留意已显示的反击与护盾。'}));

const unlock={combat:1,elite:3,trial:3,armored:2,berserker:3,leech:4,disruptor:5,mirror:7,bandit:2,gauntlet:6,duel:8,storm:6,cursed:9,guardian:12,hiddenboss:15};
const noncombat=['gold','chest','merchant','forge','fusion','vault','blackmarket','altar','rest','spring','prayer','gambit','exchange','mystery'];
const choose=(s,list,random)=>list[Math.min(list.length-1,Math.floor(random(s)*list.length))];
export function generateExpandedRoute(s,fate,random){
 const floor=s.floor,rich=fate[0]+fate[1]>=9,history=Array.isArray(s.encounterHistory)?s.encounterHistory:[],seen=new Set();
 const pool=['combat','combat','combat','combat','combat','combat',...Object.keys(unlock).filter(k=>k!=='combat'&&floor>=unlock[k])];
 const combat=()=>{let choices=pool.filter(k=>!seen.has(k)&&!history.slice(-3).includes(k));if(!choices.length)choices=pool.filter(k=>!seen.has(k));if(!choices.length)choices=pool;const type=choose(s,choices,random);seen.add(type);return type;};
 const service=['merchant','forge','fusion','rest'][(floor-1)%4];
 let events=noncombat.filter(k=>k!==service&&(floor>=3||!['vault','blackmarket','mystery','exchange','gambit'].includes(k)));
 if(rich&&floor>=3)events=events.concat(['vault','blackmarket','mystery']);
 const withoutRecent=events.filter(k=>!history.slice(-2).includes(k));if(withoutRecent.length)events=withoutRecent;
 const types=[combat(),combat(),service,combat(),choose(s,events,random),floor%5===0?'boss':'elite'];
 s.encounterHistory=[...history,...types].slice(-8);
 return types.map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:rich?1:0,...(['gauntlet','duel'].includes(type)?{wave:1,waves:encounterProfile(type).waves}:{} )}));
}

// Input enemy.turns is the number of completed rolls, before this roll.
export function combatModifiers(e,values,best,st){
 const result={damageMultiplier:1,bonusDamage:0,shieldPierce:0,healPlayer:0,wardGain:0,attackMultiplier:1,notes:[]};
 const alternate=e.variant===1,six=values.includes(6),sum=values.reduce((n,v)=>n+v,0),high=values.filter(v=>v>=4).length;
 const note=text=>result.notes.push(text);
 switch(e.mechanic){
  case 'armored':if(six){result.shieldPierce=alternate?.6:.45;note(`六点破甲 · 本击穿盾 ${alternate?60:45}%`);}break;
  case 'disruptor':if(values.includes(alternate?2:1)&&!values.includes(alternate?5:6)){result.attackMultiplier=1.25;note('低点扰动 · 本次反击 +25%');}break;
  case 'mirror':result.damageMultiplier=alternate?(best>=2?.9:1)*(high===values.length?1.3:1):best>=3?.85:best===1?1.35:1;if(result.damageMultiplier!==1)note(`镜面规则 · 本击伤害 ×${result.damageMultiplier.toFixed(2)}`);break;
  case 'bandit':if(e.turns<2){result.damageMultiplier=alternate?1.15:1.25;note(`抢先夺金 · 前两击伤害 +${alternate?15:25}%`);}break;
  case 'duel':if(alternate&&(e.wave||1)===2){result.damageMultiplier=1.2;note('第二波破绽 · 本击伤害 +20%');}else if(e.turns===0){result.damageMultiplier=alternate?1.1:1.25;note(`决斗破绽 · 首击伤害 +${alternate?10:25}%`);}break;
  case 'storm':if(six){result.attackMultiplier=.75;note('六点导雷 · 本次反击 -25%');}break;
  case 'hiddenboss':if(values.every(v=>v>=(alternate?5:4))){result.damageMultiplier=alternate?1.5:1.3;note(`高点齐聚 · 本击伤害 +${alternate?50:30}%`);}if(values.includes(1)){result.attackMultiplier=1.15;note('裂隙低鸣 · 本次反击 +15%');}break;
  case 'boss_sixseal':if(six){result.damageMultiplier=1.25;note('六封松动 · 本击伤害 +25%');}else result.attackMultiplier=1.15;break;
  case 'boss_choir':result.attackMultiplier=best>=2?.8:1.15;note(best>=2?'共鸣压制 · 本次反击 -20%':'失谐反击 · 本次反击 +15%');break;
  case 'boss_cinder':if(high>=3){result.shieldPierce=.5;note('高点熔穿 · 本击穿盾 50%');}break;
  case 'boss_hourglass':if((e.turns+1)%2===0){result.damageMultiplier=1.25;note('倒沙破绽 · 本击伤害 +25%');}break;
  case 'boss_collector':if(sum<14)result.attackMultiplier=1.2;if(best>=3){result.wardGain=Math.floor(st.maxHp*.08);note('三同夺光 · 我方获得 8% 护盾');}break;
 }
 return result;
}
export function extraEnemyAttack(e,baseAttack){
 let multiplier=1;
 if(e.mechanic==='berserker'&&e.hp<=e.maxHp*(e.variant===1?.5:.35))multiplier=e.variant===1?1.25:1.4;
 if(e.mechanic==='gauntlet')multiplier=1+((e.wave||1)-1)*(e.variant===1?.15:.1);
 if(e.mechanic==='storm'&&(e.turns+1)%(e.variant===1?3:2)===0)multiplier=e.variant===1?1.6:1.35;
 if(e.mechanic==='boss_cinder'&&(e.turns+1)%2===0)multiplier=1.3;
 if(e.mechanic==='boss_hourglass'&&(e.turns+1)%2===1)multiplier=1.25;
 return Math.max(1,Math.round(baseAttack*multiplier));
}
export function extraEnemyIntent(e){
 if(!e?.mechanic)return null;
 const period=e.mechanic==='storm'?(e.variant===1?3:2):e.mechanic==='boss_cinder'?2:null;
 const warning=period?(e.turns+1)%period===0:e.mechanic==='berserker'?e.hp<=e.maxHp*(e.variant===1?.5:.35):e.mechanic==='boss_hourglass'?(e.turns+1)%2===1:false;
 const data=EXTRA_BOSSES.find(b=>b.mechanic===e.mechanic),detail=data?.label||e.label||ROOM_ADDITION_DETAILS[e.mechanic]?.purpose;
 return {label:warning?'特殊反击将至':'遭遇规则',detail,warning};
}
// Input enemy.turns includes the just-completed roll. Apply only after a surviving counter.
export function postRetaliation(e,roll,st){
 const result={enemyHeal:0,enemyWard:0,playerDrain:0,notes:[]};if(e.hp<=0)return result;
 const six=roll.values.includes(6),sum=roll.values.reduce((n,v)=>n+v,0);
 if(e.mechanic==='leech'){result.enemyHeal=Math.min(e.maxHp-e.hp,Math.ceil(e.maxHp*(e.variant===1?.01:.02)));if(e.variant===1)result.enemyWard=Math.min(Math.max(0,e.maxShield-e.shield),Math.ceil(e.maxHp*.01));result.notes.push(e.variant===1?'汲光 · 恢复 1% 生命并重筑 1% 护盾':'汲光 · 敌方恢复 2% 最大生命');}
 if(e.mechanic==='guardian'&&!roll.values.includes(e.variant===1?5:6)){result.enemyWard=Math.min(Math.max(0,e.maxShield-e.shield),Math.ceil(e.maxHp*(e.variant===1?.03:.02)));result.notes.push('守门者重筑护盾');}
 if(e.mechanic==='cursed'&&roll.values.includes(e.variant===1?2:1)&&!roll.values.includes(e.variant===1?5:6)){result.playerDrain=Math.max(1,Math.floor(st.maxHp*.01));result.notes.push('低点诅咒 · 流失 1% 最大生命');}
 if(e.mechanic==='boss_tide'&&e.turns%2===0&&sum<18){result.enemyHeal=Math.min(e.maxHp-e.hp,Math.ceil(e.maxHp*.03));result.notes.push('归潮 · 敌方恢复 3% 最大生命');}
 return result;
}
export function encounterReward(e){return {goldMultiplier:e.mechanic==='bandit'&&e.turns<=(e.variant===1?2:3)?e.variant===1?3:2:1,minRarity:e.type==='boss'?3:e.type==='elite'?1:0};}

export const EVENT_KEYS = Object.freeze(['spring','prayer','gambit','exchange','hollow_scale','relic_exchange','traveler_lantern','silent_anvil','pursuer_contract','star_seal','memory_archive','thread_of_dawn']);
const mysteryTemplates = [
 {key:'hollow_scale',minFloor:3,title:'空衡之约',text:'一座缺口天平，愿用少量生命容量交换武器的等级。损失永久保留，最多五次。'},
 {key:'relic_exchange',minFloor:3,title:'失物回廊',text:'廊中的刻印愿收下一件旧遗物，归还一只史诗遗物宝箱。'},
 {key:'traveler_lantern',minFloor:3,title:'借灯者',text:'一盏灯只照亮这一层。支付金币，可让命运更偏爱高点数。'},
 {key:'silent_anvil',minFloor:5,title:'无声的铁砧',text:'将一件 +5 以上的旧装备留在铁砧，换取当前武器 +2。旧强化不会转移。'},
 {key:'pursuer_contract',minFloor:6,title:'双哨追猎',text:'答应连战两名精英；每一名都留下可亲手打开的宝箱。也可拒绝追猎。'},
 {key:'star_seal',minFloor:12,title:'星隙封匣',text:'以当前生命唤醒隐秘首领。挑战会立刻开始；击败后必得传说宝箱。'},
 {key:'memory_archive',minFloor:3,title:'遗迹学录',text:'封存的记录能化为经验。只收金币，不会消耗装备或重置天赋。'},
 {key:'thread_of_dawn',minFloor:10,title:'黎明细线',text:'极细的亮线能留下一点永久幸运。每位旅者最多接受五次馈赠。'},
];
const eventPick=(s,list,api)=>api.pick?api.pick(s,list):choose(s,list,api.random);
const safeItems=s=>s.player.items.filter(i=>!Object.values(s.player.equipped).includes(i.id)&&!i.locked&&i.rarity<3);
const itemName=(s,id)=>s.player.items.find(i=>i.id===id)?.name||'已不存在的装备';
const itemById=(s,id)=>s.player.items.find(i=>i.id===id);
const eventXpReward=s=>Math.min(1000000,40+s.player.level*5);
const spendGold=(s,amount)=>{s.player.gold-=amount;};
export function eventStatBonuses(s){return {luck:Math.min(20,s.eventLuck||0)+Math.min(5,s.player.fateBlessings||0),damageMultiplier:1+Math.min(30,s.eventPower||0)/100,maxHpMultiplier:1-Math.min(5,s.player.pactScars||0)*.02};}
export function createEvent(s,roomType,api){
 const spare=safeItems(s),relic=spare.find(i=>i.slot==='relic'),forged=spare.find(i=>i.enhance>=5),target=s.player.equipped.weapon;
 let template={key:roomType,title:ROOM_ADDITIONS[roomType],text:ROOM_ADDITION_DETAILS[roomType]?.purpose||''};
 if(roomType==='mystery'){
  const pool=mysteryTemplates.filter(t=>s.floor>=t.minFloor&&(t.key!=='hollow_scale'||(s.player.pactScars||0)<5)&&(t.key!=='thread_of_dawn'||(s.player.fateBlessings||0)<5)&&(t.key!=='relic_exchange'||relic)&&(t.key!=='silent_anvil'||forged));
  template=eventPick(s,pool.length?pool:[mysteryTemplates[6]],api);
 }
 s.event={key:template.key,roomType,title:template.title,text:template.text,status:'pending',choice:null,outcome:'',costGold:Math.min(50000,Math.round(35+s.player.level*8)),costHp:Math.max(1,Math.floor(api.stats(s).maxHp*.15)),offerId:(template.key==='relic_exchange'?relic:template.key==='silent_anvil'?forged:spare[0])?.id||null,targetId:target||null,rewardRarity:2};
 s.phase='event';return s.event;
}
  function option(id,label,detail,cost,reward,disabled=false,reason='',confirm=null){return {id,label,detail,cost,reward,disabled,reason,confirm,destructive:!!confirm};}
  const temporaryGain=(s,key,amount,cap)=>Math.max(0,Math.min(amount,cap-(s[key]||0)));
export function eventChoices(s){
 const e=s.event;if(!e||e.status!=='pending')return [];
 const offered=itemById(s,e.offerId),target=itemById(s,e.targetId),safe=offered&&safeItems(s).some(i=>i.id===offered.id),gold=s.player.gold>=e.costGold,hp=s.player.hp>e.costHp;
   const pay=()=>!gold?'金币不足':'',confirm=text=>`${text}；此项提交后不可撤销。`;
   const luckGain=temporaryGain(s,'eventLuck',8,20),powerGain=temporaryGain(s,'eventPower',15,30);
 let options=[];
 switch(e.key){
  case 'spring':options=[option('heal','饮下清泉','充分恢复，护盾较少。','无','恢复全部生命，获得最大生命 10% 护盾'),option('ward','凝结护幕','少量治疗，储备更多护盾。','无','恢复最大生命 35%，获得 35% 护盾')];break;
    case 'prayer':options=[option('luck','点亮幸运','幸运只在本层生效。',`${e.costGold} 金币`,`本层幸运 +${luckGain}（本层上限 20）`,!gold||!luckGain,!luckGain?'本层临时幸运已达上限 20':pay(),confirm(`消耗 ${e.costGold} 金币`)),option('power','燃起战意','代价为当前生命，不损失生命上限。',`${e.costHp} 生命`,`本层伤害 +${powerGain}%（本层上限 30%）`,!hp||!powerGain,!powerGain?'本层临时伤害增幅已达上限 30%':!hp?'当前生命不足以安全支付':'',confirm(`失去 ${e.costHp} 当前生命`))];break;
  case 'gambit':options=[option('roll','投下命运骰','1–2 返一半金币；3–4 稀有箱；5–6 史诗箱。幸运偏向高点。',`${e.costGold} 金币`,'随机报酬，结果立即保存',!gold,pay(),confirm(`支付 ${e.costGold} 金币，低点可能只返还一半`)),option('safe','选择保底','确定的稀有装备宝箱。',`${e.costGold*2} 金币`,'稀有宝箱',s.player.gold<e.costGold*2,'金币不足',confirm(`支付 ${e.costGold*2} 金币`))];break;
  case 'exchange':options=[option('salvage','交出旧装','装备彻底消耗，不影响任何已装备物品。',itemName(s,e.offerId),`${e.costGold} 金币与 ${eventXpReward(s)} 经验`,!safe,'没有可安全置换的旧装备',confirm(`永久消耗「${itemName(s,e.offerId)}」`))];if(offered?.slot==='relic')options.push(option('relic','交换遗物','换得史诗遗物箱，旧遗物不可恢复。',itemName(s,e.offerId),'史诗遗物宝箱',!safe,'旧遗物已不存在或已受保护',confirm(`永久消耗「${itemName(s,e.offerId)}」`)));break;
  case 'hollow_scale':options=[option('accept','签下空衡','永久代价有五次上限，目标是当前记录的这一件武器。','永久最大生命 -2%',`${itemName(s,e.targetId)} Lv. +${Math.min(3,MAX_ITEM_LEVEL-(target?.level||s.player.level))}`,!target||(s.player.pactScars||0)>=5||target.level>=MAX_ITEM_LEVEL,'目标不存在或已达生命/等级上限',confirm('永久减少最大生命 2%'))];break;
  case 'relic_exchange':options=[option('accept','交出旧遗物','只消耗这一件，不触及已装备、锁定或传说遗物。',itemName(s,e.offerId),'史诗遗物宝箱',!safe||offered.slot!=='relic','没有可安全交换的旧遗物',confirm(`永久消耗「${itemName(s,e.offerId)}」`))];break;
    case 'traveler_lantern':options=[option('accept','借走灯火','下楼后灯火熄灭。',`${e.costGold} 金币`,`本层幸运 +${luckGain}（上限 20）`,!gold||!luckGain,!luckGain?'本层临时幸运已达上限 20':pay(),confirm(`支付 ${e.costGold} 金币`))];break;
  case 'silent_anvil':options=[option('accept','留下旧锻品','消耗旧物，武器增加最多 +2，不继承旧 +N。',itemName(s,e.offerId),`${itemName(s,e.targetId)} 强化 +${Math.min(2,Math.max(0,ENHANCE_CAP-(target?.enhance||0)))}`,!safe||!target||offered.enhance<5||target.enhance>=ENHANCE_CAP,`需要未受保护 +5 旧装，且目标尚未 +${ENHANCE_CAP}`,confirm(`永久消耗「${itemName(s,e.offerId)}」`))];break;
  case 'pursuer_contract':options=[option('accept','迎接双哨','连续两名精英；每次击杀先开箱再进入下一波。','两场精英战斗','两个真实击杀宝箱',false,'',confirm('立即开始连续两场精英战斗'))];break;
  case 'star_seal':options=[option('accept','推开封匣','支付生命后立即开始隐秘首领战。',`${e.costHp} 当前生命`,'击败首领后必得传说宝箱',!hp,'当前生命不足以安全支付',confirm(`失去 ${e.costHp} 生命并立即挑战隐秘首领`))];break;
  case 'memory_archive':options=[option('accept','研读学录','经验即时结算，可能触发升级。',`${e.costGold} 金币`,`${eventXpReward(s)} 经验`,!gold,pay(),confirm(`支付 ${e.costGold} 金币`))];break;
  case 'thread_of_dawn':options=[option('accept','系住黎明','永久幸运最多获得 5 点。',`${e.costGold*3} 金币`,'永久幸运 +1',s.player.gold<e.costGold*3||(s.player.fateBlessings||0)>=5,'金币不足或已达永久上限',confirm(`支付 ${e.costGold*3} 金币`))];break;
 }
 options.push(option('leave','安全离开','不支付代价，不改变已有资产。','无','保留当前进度'));return options;
}
export function eventPresentation(s){return s.event?{title:s.event.title,body:s.event.text,status:s.event.status,outcome:s.event.outcome,options:eventChoices(s)}:null;}
function rewardChest(s,api,rarity,slot){
 const chest=api.createChest(s,rarity>=2?'vault':'chest',s.event.title);
 // Event items use the shared event level band, regardless of the base chest roll.
 chest.item=api.makeItem(s,slot,rarity,s.floor,'event');
 s.chest=chest;s.loot=null;s.enemy=null;s.phase='chest';
}
export function applyEvent(s,choice,api){
 if(s.phase!=='event')return false;
 const id=typeof choice==='string'?choice:choice?.id,selected=eventChoices(s).find(o=>o.id===id);
 if(!selected||selected.disabled||(selected.confirm&&choice?.confirmed!==true))return false;
 const e=s.event,target=itemById(s,e.targetId),st=api.stats(s),remove=()=>{s.player.items=s.player.items.filter(i=>i.id!==e.offerId);};
 e.status='resolved';e.choice=id;e.outcome='你保留了当前的一切，离开了遭遇。';
 if(id==='leave'){api.log(s,e.outcome);return true;}
  const luck=()=>{const gain=temporaryGain(s,'eventLuck',8,20);s.eventLuck=(s.eventLuck||0)+gain;e.outcome=`灯火相伴 · 本层幸运 +${gain}，当前临时幸运 ${s.eventLuck}`;};
 const xp=()=>api.gainXp(s,eventXpReward(s));
 switch(e.key){
  case 'spring':if(id==='heal'){s.player.hp=st.maxHp;s.ward=Math.max(s.ward||0,Math.floor(st.maxHp*.1));e.outcome='生命已恢复，获得最大生命 10% 护盾。';}else{s.player.hp=Math.min(st.maxHp,s.player.hp+Math.floor(st.maxHp*.35));s.ward=Math.max(s.ward||0,Math.floor(st.maxHp*.35));e.outcome='恢复 35% 最大生命，获得 35% 护盾。';}break;
    case 'prayer':if(id==='luck'){spendGold(s,e.costGold);luck();}else{const gain=temporaryGain(s,'eventPower',15,30);s.player.hp-=e.costHp;s.eventPower=(s.eventPower||0)+gain;e.outcome=`本层伤害 +${gain}%，当前临时增幅 ${s.eventPower}%。`;}break;
  case 'gambit':if(id==='safe'){spendGold(s,e.costGold*2);rewardChest(s,api,1);e.outcome='保底交易完成 · 稀有宝箱等待开启。';}else{spendGold(s,e.costGold);e.roll=api.die?api.die(s):1+Math.min(5,Math.floor(api.random(s)*6));if(e.roll<=2){api.gainGold(s,Math.floor(e.costGold/2));e.outcome=`命运 ${e.roll} 点 · 返还一半金币。`;}else{rewardChest(s,api,e.roll>=5?2:1);e.outcome=`命运 ${e.roll} 点 · ${e.roll>=5?'史诗':'稀有'}宝箱等待开启。`;}}break;
  case 'exchange':remove();if(id==='relic'){rewardChest(s,api,2,'relic');e.outcome='旧遗物已置换，史诗遗物箱等待开启。';}else{api.gainGold(s,e.costGold);xp();e.outcome='旧装已置换为金币与经验。';}break;
  case 'hollow_scale':{const before=target.level||s.player.level;s.player.pactScars=(s.player.pactScars||0)+1;target.level=Math.min(MAX_ITEM_LEVEL,before+3);if(target.level===MAX_ITEM_LEVEL)target.levelXp=0;s.player.hp=Math.min(s.player.hp,api.stats(s).maxHp);e.outcome=`武器等级 +${target.level-before}，永久最大生命减少 2%。`;break;}
  case 'relic_exchange':remove();rewardChest(s,api,2,'relic');e.outcome='旧遗物已消耗，史诗遗物箱等待开启。';break;
  case 'traveler_lantern':spendGold(s,e.costGold);luck();break;
  case 'silent_anvil':{const before=target.enhance;remove();target.enhance=Math.min(ENHANCE_CAP,before+2);e.outcome=`旧锻品已消耗，目标获得新的强化 +${target.enhance-before}。`;break;}
  case 'pursuer_contract':{const room=s.route[s.roomIndex];room.wave=1;room.waves=2;room.waveType='elite';s.enemy=api.createEnemy(s,'elite');s.enemy.encounterKey='mystery';s.enemy.wave=1;s.phase='combat';e.outcome='双哨已近 · 每击败一名精英先领取宝箱。';break;}
  case 'star_seal':s.player.hp-=e.costHp;s.enemy=api.createEnemy(s,'hiddenboss');s.phase='combat';e.outcome='封匣打开，隐秘首领现身。';break;
  case 'memory_archive':spendGold(s,e.costGold);xp();e.outcome='学录已研读，经验已计入。';break;
  case 'thread_of_dawn':spendGold(s,e.costGold*3);s.player.fateBlessings=(s.player.fateBlessings||0)+1;e.outcome=`永久幸运 +1，已接受 ${s.player.fateBlessings} / 5 次馈赠。`;break;
 }
 api.log(s,e.outcome,'gold');return true;
}
