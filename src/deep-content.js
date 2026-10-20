// V5 authored content. No engine imports: safe for saves, rendering and simulation.
export const ERAS = [
 {floor:1,name:'余火年代',subtitle:'四种光，照亮初次下潜',favored:['armored','bandit','gold']},
 {floor:30,name:'神话断层',subtitle:'金色之上，第一次听见赤曜回响',favored:['undertow','bloodwell','prayer']},
 {floor:50,name:'太古星海',subtitle:'沉没的星辰重新刻下命运',favored:['hourward','relicloom','echochamber']},
 {floor:80,name:'起源之境',subtitle:'万物的第一枚骰子仍在转动',favored:['bounty','oathgate','abyssauction']},
 {floor:140,name:'永恒界线',subtitle:'越过终点，仍有下一次掷骰',favored:['archiveguard','wishingvault','sequence']},
 {floor:200,name:'界外回响',subtitle:'没有新颜色替你赢下这场战斗',favored:['abyssking','onslaught','memorywell']},
];
export const eraFor = floor => ERAS.findLast(e=>floor>=e.floor)||ERAS[0];
export const ABILITY_DEFS = {
 sixShatter:{name:'六刻破界',text:'出现 6：本击额外穿盾',kind:'pierce',cap:.5},
 tripleStrike:{name:'三声断章',text:'三同：追加一次主击伤害',kind:'echo',cap:.65},
 execution:{name:'弑王印',text:'强敌生命 ≤35%：主击伤害',kind:'damage',cap:.6},
 openingStrike:{name:'初焰',text:'每场首次掷骰：主击伤害',kind:'damage',cap:.6},
 distinctStrike:{name:'异点剑谱',text:'至少 4 种不同骰面：主击伤害',kind:'damage',cap:.6},
 criticalWard:{name:'锋芒守护',text:'暴击：获得最大生命护盾',kind:'ward',cap:.12},
 lowWard:{name:'沉底余火',text:'至少 2 颗 1 / 2：获得最大生命护盾',kind:'ward',cap:.12},
 phaseWard:{name:'碎冠庇护',text:'首领转入二阶段：获得最大生命护盾',kind:'ward',cap:.25},
 sixthMend:{name:'六点回生',text:'出现 6 且存活：恢复最大生命',kind:'heal',cap:.06},
 resolveGuard:{name:'临界守望',text:'掷骰前生命 <35%：反击伤害降低',kind:'guard',cap:.35},
 echoRelic:{name:'星海回响',text:'三同：追加一次主击伤害',kind:'echo',cap:.5},
 firstCritLuck:{name:'启明星',text:'持有效果时首次暴击（每场一次；至同层下一次战斗掷骰结算）：幸运',kind:'luck',cap:24},
 eliteLuck:{name:'追星',text:'击败精英或首领：本层幸运增加（总上限20）',kind:'luck',cap:4},
 gildedSix:{name:'六点拾光',text:'击杀且至少 2 颗 6：本箱金币',kind:'gold',cap:.5},
 resonanceMend:{name:'合鸣归息',text:'四同且存活：恢复最大生命',kind:'heal',cap:.08},
};
export const DEEP_TALENTS = {
 shatter:{name:'破界刻点',description:'出现 6：额外穿盾 +8%',group:'high',floor:30,effect:'sixShatter',amount:.08,cap:3},
 diversity:{name:'异点星图',description:'至少 4 种骰面：伤害 +8%',group:'high',floor:50,effect:'distinctStrike',amount:.08,cap:3},
 finality:{name:'临终裁决',description:'强敌生命 ≤35%：伤害 +10%',group:'high',floor:80,effect:'execution',amount:.1,cap:3},
 deepEcho:{name:'第三声回响',description:'三同：追加主击 6% 的伤害',group:'resonance',floor:30,effect:'echoRelic',amount:.06,cap:3},
 chorusMend:{name:'合鸣疗愈',description:'四同且存活：恢复生命上限 1%',group:'resonance',floor:50,effect:'resonanceMend',amount:.01,cap:3},
 tripleBlade:{name:'共鸣刻痕',description:'三同：追加主击 8% 的伤害',group:'resonance',floor:80,effect:'tripleStrike',amount:.08,cap:3},
 firstFire:{name:'初焰引燃',description:'每场首次掷骰：伤害 +10%',group:'critical',floor:30,effect:'openingStrike',amount:.1,cap:3},
 critAegis:{name:'暴击护幕',description:'暴击：获得生命上限 2% 的护盾',group:'critical',floor:50,effect:'criticalWard',amount:.02,cap:3},
 dawnCrit:{name:'启明星痕',description:'持有效果时首次暴击：幸运 +5，每场一次；至同层下一次战斗掷骰结算，离层或重燃清除',group:'critical',floor:80,effect:'firstCritLuck',amount:5,cap:3},
 emberGuard:{name:'低谷护心',description:'至少 2 颗 1 / 2：获得生命上限 2% 护盾',group:'vitality',floor:30,effect:'lowWard',amount:.02,cap:3},
 phaseShelter:{name:'换相庇护',description:'首领进入二阶段：获得生命上限 5% 护盾',group:'vitality',floor:50,effect:'phaseWard',amount:.05,cap:3},
 lastResolve:{name:'不退之誓',description:'掷骰前生命 <35%：反击伤害 -6%',group:'vitality',floor:80,effect:'resolveGuard',amount:.06,cap:3},
 hunterStar:{name:'胜者星芒',description:'击败精英 / 首领：本层幸运 +1（上限20）',group:'luck',floor:30,effect:'eliteLuck',amount:1,cap:3},
 gildedFaces:{name:'六点寻宝',description:'击杀且至少 2 颗 6：本箱金币 +10%',group:'luck',floor:50,effect:'gildedSix',amount:.1,cap:3},
 sixRebirth:{name:'幸运回生',description:'出现 6 且存活：恢复生命上限 1%',group:'luck',floor:80,effect:'sixthMend',amount:.01,cap:3},
};
for(const t of Object.values(DEEP_TALENTS)){t.short=t.name;t.detail=t.description;}
export function deepTalentText(t,rank){
 const definition=ABILITY_DEFS[t.effect];
 const n=t.amount*rank,amount=definition.kind==='luck'?` +${n}`:` ${definition.kind==='guard'?'-':'+'}${+(n*100).toFixed(2)}%`;
 return `${definition.text}${amount}（${rank} 级）`;
}
// All rules have distinct, visible counters. Variants change the exposed target, not hidden AI.
const battles = [
 ['parity',10,'奇偶哨站','奇刻巡官','偶刻监军','奇数回合：奇点占多数伤害 +35%；偶数回合反之。',1,.95,0],
 ['sequence',18,'异点试炼','散星守卫','离序执灯者','至少 3 种点数伤害 +40%；否则反击后重筑 3% 护盾。',1.1,.95,.18],
 ['laststand',24,'迟暮围城','暮年卫长','末焰执旗者','前两次反击 -25%；其后每回合 +12%，最多 +60%。',1.1,1.1,0],
 ['undertow',30,'深潮猎场','深潮猎鲸者','沉海牧群者','总点 ≥24 阻止回血并伤害 +25%；否则反击后恢复 2%。',1,1,0],
 ['hush',38,'寂声回廊','无声收割者','寂语司钟','双同压制反击 20%；无共鸣额外穿盾 50%。',1.1,1.05,.3],
 ['hourward',50,'逆时棱室','逆时切面','倒序棱骑','奇数回合反击 -20%；偶数回合受伤 +35%。',1.1,1,0],
 ['onslaught',60,'太古军阵','古阵先锋','星骨后军','三波敌军；后续波反击 +20%，三同压制本次反击 25%。',.58,1,0,3],
 ['bounty',80,'逐星悬令','悬星逃王','索印行刑官','前三掷伤害 +20%；三回合内击杀金币 ×3，至少史诗。',.9,1.08,.1],
 ['abyssking',100,'遗忘王庭','遗忘深渊王','无冕之主','一阶段 6 点破绽 +35%；二阶段三同破绽 +60%。',.9,1,.15],
 ['archiveguard',140,'起源禁卫','始初藏书者','终页封存者','至少 4 种点数伤害 +50%、获得我方生命上限 8% 的护盾；否则反击 +15%。',1,1.05,.12],
];
const events = [
 ['bloodwell',30,'赤誓血井','以最大生命 20% 的当前生命，换一只至少传说的深层宝箱。不能致死。'],
 ['relicloom',50,'太古织机','消耗一件未受保护的旧遗物，换取至少史诗的深层遗物箱。'],
 ['offering',20,'守望奉献','献出一件未受保护的旧装备，获得 1 个永久天赋点；一生最多 20 次。'],
 ['echochamber',50,'回声蓄室','支付金币，储备下一场首掷额外 25% 主击伤害；只触发一次，不递归。'],
 ['wardbank',30,'护幕库','支付金币，为下一场战斗储备最大生命 50% 的开场护盾。不能重复储备。'],
 ['starlibrary',30,'星海书库','支付金币获取经验，或支付更多金币换一个天赋点；永久馈赠一生最多20次。'],
 ['abyssauction',80,'深渊拍卖','先展示已经生成的真实奖品，再决定购买或离开。刷新不会重新出价。'],
 ['oathgate',80,'双星誓门','自愿挑战两名逐星悬令精英。每次击杀亲自开箱，无预付代价。'],
 ['wishingvault',140,'界外许愿','支付金币投两骰：总点 ≤5 返还半价；6–9 至少史诗；10–12 至少传说。'],
 ['memorywell',50,'藏忆池','付费返还全部已投入天赋点，重新选择构筑。装备、等级与永久馈赠保留。'],
];
export const DEEP_ROOMS = Object.fromEntries([...battles.map(([key,floor,name,a,b,purpose,hp,attack,shield,waves=1])=>[key,{key,floor,name,kind:'combat',purpose,reward:['abyssking','archiveguard'].includes(key)?'首领级深层宝箱；传说保底，高阶按当前深度抽取。':key==='bounty'?'三回合内金币 ×3；史诗保底。':waves>1?'每波都有独立真实宝箱。':'击杀必得真实装备箱；高阶品质按深度解锁。',hp,attack,shield,waves}]),...events.map(([key,floor,name,purpose])=>[key,{key,floor,name,kind:'event',purpose,reward:'代价先展示、提交前确认，可无损拒绝。'}])]);
export const DEEP_ENEMIES = battles.flatMap(([mechanic,minFloor,room,a,b,label])=>[a,b].map((name,variant)=>({name,variant,roomType:mechanic,mechanic,minFloor,trait:'steady',label,note:variant?'回声沿着裂隙归来，刻点上的规则清楚可见。':'门后的守卫没有隐藏条件，危险写在每一条刻线上。'})));
// Saved enemies keep their committed rule and label. These profiles are assigned
// only when the engine creates a new authored encounter; a retry is not a new one.
export const DEEP_VARIANT_PROFILES = Object.freeze({
 parity:Object.freeze({title:'偶点先行',label:'奇数回合：偶点占多数伤害 +35%；偶数回合改为奇点占多数。'}),
 sequence:Object.freeze({title:'共鸣破阵',label:'双同或更高共鸣：伤害 +40% 并阻止重筑；全异点时，存活反击后重筑最大生命 3% 的护盾。'}),
});
export function freshDeepVariantProfile(template){
 return template?.variant===1&&template.roomType===template.mechanic&&Object.hasOwn(DEEP_VARIANT_PROFILES,template.mechanic)?DEEP_VARIANT_PROFILES[template.mechanic]:null;
}
export function deepVariantProfile(enemy){
 // combatRules is an existing validated enum: prior saves could not legally
 // contain 5. Unknown metadata, including an old deepVariantRules property,
 // never activates a rule or becomes newly invalid because of this feature.
 return enemy?.combatRules===5?freshDeepVariantProfile(enemy):null;
}
const regionalNames=[
 [30,'赤曜拾火人','断层探灯者','神话刻铭者','空衡遗民'],
 [50,'太古渡星人','沉海缚舟者','遗世观潮人','逆星拾骨者'],
 [80,'起源拓印者','初火司录','界门远行者','未名织誓人'],
 [140,'永恒负碑人','寂海守年者','终页拾梦者','界线执伞人'],
 [200,'界外寻声者','末星骑行者','余响归人','无终记年者'],
];
DEEP_ENEMIES.push(...regionalNames.flatMap(([minFloor,...names])=>names.map((name,i)=>({name,minFloor,trait:'steady',mechanic:['parity','sequence','hourward','hush'][i],variant:0,label:DEEP_ROOMS[['parity','sequence','hourward','hush'][i]].purpose,note:'来自'+eraFor(minFloor).name+'，循着独有的刻点规律行动。'}))));
// The codex describes both possible new opponents. Legacy and regional template
// labels remain independent of this room overview and retain their exact rules.
DEEP_ROOMS.parity.purpose='奇刻巡官：奇数回合追求奇点多数；偶刻监军：奇数回合追求偶点多数。每掷交换目标，命中目标伤害 +35%；奇偶各半不触发。';
DEEP_ROOMS.sequence.purpose='散星守卫：至少 3 种点数破阵；离序执灯者：双同或更高共鸣破阵。成功时伤害 +40% 并阻止重筑；未破阵且反击后双方存活时，重筑最大生命 3% 的护盾。';
export const DEEP_BOSSES = [
 ['折光天君','boss_prism',30,'至少 3 种骰面破棱：伤害 +40%；否则反击 +15%。'],
 ['蚀日无冕者','boss_eclipse',50,'奇数回合无 6 则反击 +25%；偶数回合三同伤害 +50%。'],
 ['始火见证者','boss_witness',80,'首掷伤害 +50%；此后至少 3 颗 5 / 6 点使反击 -25%。'],
 ['命线织王','boss_thread',100,'双同切线：穿盾 45%；否则反击后重织 2% 护盾。'],
 ['第一刻守门人','boss_origin',140,'总点 ≥24：伤害 +40%；总点 ≤14：反击 +25%。'],
 ['无终回声','boss_infinite',200,'一阶段至少 4 种骰面：伤害 +40%；二阶段三同：伤害 +60%。'],
].map(([name,mechanic,minFloor,label])=>({name,mechanic,minFloor,trait:'steady',identity:eraFor(minFloor).name+'的守门者',label,warning:label,counterplay:'构筑真正足够强时可以速杀；没有强制锁血。',note:'「带着你的刻点，越过这条界线。」',phaseLabel:'界线重铸',phaseNote:'半血且存活：凝聚 12% 阶段护盾，二阶段反击 +15%。'}));
