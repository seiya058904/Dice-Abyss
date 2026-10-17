import {DEEP_ENEMIES,DEEP_BOSSES,DEEP_TALENTS} from './deep-content.js';
import {RARITIES,THEMES,PROFILES,AFFINITIES,CATALOG} from './equipment-content.js';
export {RARITIES,THEMES,PROFILES,AFFINITIES,CATALOG,SLOT_AFFINITIES,SLOT_DESCRIPTIONS} from './equipment-content.js';
import {ROOM_ADDITIONS,ROOM_ADDITION_DETAILS,EXTRA_ENEMIES,EXTRA_BOSSES} from './encounters.js';
export const SLOTS = { weapon: '武器', armor: '防具', relic: '遗物' };
export const ROOM_NAMES = { combat: '战斗', elite: '精英', boss: '首领', gold: '黄金房', chest: '宝箱', merchant: '商人', forge: '锻造', fusion: '融合', vault: '秘藏', blackmarket: '黑市', altar: '祭坛', rest: '休整', trial: '悬赏', ...ROOM_ADDITIONS };
// These describe rules used by the engine, not additional unimplemented room types.
export const ROOM_DETAILS = {
 combat:{purpose:'击败守卫，获得装备与金币。',reward:'每次击杀均出现一个可亲手打开的宝箱。'},
 elite:{purpose:'更耐久的强敌，留意蓄力反击。',reward:'宝箱至少稀有，金币比普通战斗更多。'},
 boss:{purpose:'每五层出现一位首领，半血时进入第二阶段。',reward:'必得传说装备与大量金币；五层武器、十层遗物交替。'},
 gold:{purpose:'无须战斗，领取金币后继续前进。',reward:'直接获得金币；不掉装备，不计入宝箱数量。'},
 chest:{purpose:'打开尘封宝箱，收下装备与金币。',reward:'丰饶命运下，本房宝箱至少稀有。'},
 merchant:{purpose:'武器、防具、遗物各一件，另有一次全额治疗。',reward:'可预览属性后购买，也可直接离开。'},
 forge:{purpose:'只强化当前装备的这一件，每次必定提升。',reward:'1–2 点 +1，3–4 点 +2，5–6 点 +3；单件上限 +20。',rich:'丰饶命运：本层锻造费用八折。'},
 fusion:{purpose:'保留目标，消耗同类材料，成长与强化分别累计。',reward:'1–4 点基础成长，5 点额外 +30%，6 点额外 +40%；最多三件遗物均分。'},
 vault:{purpose:'无需战斗的高品质秘藏。',reward:'必得史诗或传说装备：传说概率 30%，另有金币。'},
 blackmarket:{purpose:'高品质装备交易，仍可逐件预览后购买。',reward:'三类装备至少史诗，其中一类为传说；不强制购买。'},
 altar:{purpose:'投一颗祝福骰，增加本层伤害。',reward:'每点 +5%，本房限领一次，进入下一层清除。'},
 rest:{purpose:'恢复全部生命，并储备下一场战斗的护盾。',reward:'获得最大生命 25% 的护盾；本房限领一次。'},
 trial:{purpose:'击败悬赏目标；四次掷骰内完成有额外报酬。',reward:'必得史诗或传说装备，四回合内击杀使宝箱金币翻倍。'},
};
Object.assign(ROOM_DETAILS,ROOM_ADDITION_DETAILS);
ROOM_DETAILS.fusion={purpose:'保留目标，消耗同类材料，提升装备等级与等级经验。',reward:'1–4 点基础经验，5 点 ×1.75，6 点 ×2.5；最多三件遗物均分，强化不继承。'};
export const FLOOR_NAMES = ['遗忘入口', '低语回廊', '灰烬墓园', '失落圣所', '骸骨王座', '无光水牢', '星陨裂隙', '倒悬钟楼', '永夜边界', '深渊之眼'];
export const ITEM_NAMES = {
  weapon: [['残铁', '无名之锋', '守夜刃'], ['幽光裁决', '逐影', '遗迹断章'], ['灰烬誓约', '星陨之刃', '寂静审判'], ['深渊裁决', '终夜', '破晓之誓']],
  armor: [['旅者旧衣', '风化甲', '灰布长衣'], ['影卫残甲', '不屈之壳', '幽火披风'], ['不眠守望', '永夜之幕', '星陨壁垒'], ['无光王冕', '余烬永存', '命运庇护']],
  relic: [['碎裂印记', '失色刻印', '无名遗骨'], ['命运回声', '幽光指环', '低语之石'], ['虚空残响', '群星余音', '轮回之核'], ['深渊之心', '第七声回响', '永恒星骸']],
};
export const ENEMIES = [
  { name: '锈蚀看守', note: '铁锈落下，空壳仍在守门。', trait: 'steady', label: '普通反击' },
  { name: '流亡影卫', note: '无主的誓言，仍在黑暗里回响。', trait: 'fierce', label: '攻击较强 · 生命较低' },
  { name: '空壳骑士', note: '盔甲之下，只有很久以前的风。', trait: 'shield', label: '护盾 · 先吸收伤害' },
  { name: '失语祷者', note: '祷文停在了最后一个字，厚重余音仍护着空壳。', trait: 'stout', label: '生命 +30% · 攻击 -20%' },
  { name: '星陨残响', note: '已经熄灭的光，仍拒绝消失。', trait: 'fierce', label: '攻击较强 · 生命较低' },
  { name: '无光执刑者', note: '判决已被遗忘，执行从未停止。', trait: 'shield', label: '护盾 · 先吸收伤害' },
];
const LEGACY_TALENTS = {
  high: { name: '高点裁决', short: '高点', description: '每颗 5 / 6 点骰子的点数贡献 +12%', detail: '每级只提高 5 / 6 点骰子的贡献；可与五点、六点天赋叠加。' },
  resonance: { name: '命运共鸣', short: '共鸣', description: '双同及以上：共鸣倍率 +0.12', detail: '加到本次共鸣倍率中；例如双同从 ×1.45 变为 ×1.57。' },
  critical: { name: '破晓锋芒', short: '暴击', description: '暴击率 +3%，追击率 +2%', detail: '均为概率百分点；追击最多一次，基础追加主击 35% 的伤害。' },
};
export const DICE_LEVELS = [1, 2, 3, 5, 8, 11];

// Thirty authored families per slot, each with four genuinely stronger rarity tiers.
export const EQUIP_SLOTS = { weapon: '武器', armor: '防具', relic: '遗物 I', relic2: '遗物 II', relic3: '遗物 III' };
export const BOSSES = [
 {name:'骸骨君王',identity:'王座守门者',trait:'shield',label:'开场骨盾 · 先吸收伤害',note:'「在我的王座之下，遗忘也是臣服。」',warning:'先击破骨盾，才能削减生命。',counterplay:'护盾不会自行恢复，持续伤害可以耗尽它。',phaseLabel:'碎冠再临'},
 {name:'永夜观测者',identity:'终点的见证者',trait:'rage',label:'半血后反击 +35%',note:'「我已见过你的终点。」',warning:'这一击若压入半血，反击立即变强。',counterplay:'看清下次反击，带着充足生命进入后半场。',phaseLabel:'终夜凝视'},
 {name:'倒悬钟主',identity:'第三声钟的主人',trait:'pulse',label:'第 3 / 6 / 9… 回合反击 ×1.6',note:'「第三声钟响，只为你。」',warning:'每逢第三回合，下一次反击为钟鸣重击。',counterplay:'重击前留意生命与护盾，击杀可避免反击。',phaseLabel:'末钟倒响'},
 {name:'幽潮女王',identity:'归潮的统治者',trait:'drain',label:'存活反击后恢复最大生命 2%',note:'「潮水终将收回一切。」',warning:'只要她在这一击后存活，反击后便会回血。',counterplay:'共鸣与暴击可压过恢复；终结一击不会触发回血。',phaseLabel:'满潮封域'},
 {name:'灰烬铸王',identity:'余烬熔炉的囚王',trait:'ramp',label:'反击逐回合 +8%，最多 +80%',note:'「余烬，仍会燃烧。」',warning:'拖得越久，反击越强，最终达到初始的 1.8 倍。',counterplay:'优先构筑持续输出，避免长时间消耗。',phaseLabel:'熔心重燃'},
 {name:'裂星守望',identity:'裂隙之外的守卫',trait:'ward',label:'每三回合重筑最大生命 5% 的护盾',note:'「群星之外，还有群星。」',warning:'第 3 / 6 / 9… 次反击后重筑护盾，上限为初始护盾。',counterplay:'护盾先吸伤；在重筑前形成共鸣可减少消耗。',phaseLabel:'群星合壁'},
].map(boss=>({...boss,phaseNote:'存活且首次跨过半血时凝聚 12% 护盾；二阶段反击增强 15%，溢出伤害不会被强制阻断。'}));
BOSSES.push(...EXTRA_BOSSES);
const ENEMY_TRAITS = {
 pulse:{label:'每三回合反击 ×1.6',warning:'第 3 / 6 / 9… 回合重击。'},
 drain:{label:'反击后恢复最大生命 2%',warning:'存活反击后回血，击杀可阻止恢复。'},
 ramp:{label:'反击逐回合 +8%，最多 +80%',warning:'持久战中反击越来越强。'},
 ward:{label:'每三回合重筑 5% 护盾',warning:'护盾先吸收伤害，重筑量按最大生命计算。'},
 shield:{label:'开场护盾 · 先吸收伤害',warning:'护盾耗尽后才会损失生命。'},
 fierce:{label:'攻击 +25% · 生命 -15%',warning:'伤害较高，但生命较低。'},
};
const ENEMY_NOTES = [
 ['巡查着早已熄灭的炉道，脚步仍留下细碎火星。','提着无焰灯盏，寻找最后一份燃料。','曾是铸炉学徒，如今只记得挥锤的节奏。'],
 ['沿冻结的刻线徘徊，重复最后一次巡夜。','灯芯封在冰里，仍照出一道归途。','名字冻在门后，只剩呼吸刮过长廊。'],
 ['每走三步，碎裂的地砖便轻轻震响。','以残存电光引路，却从不走向出口。','把最后一声呼救，误认成了进军号令。'],
 ['收集坠落的碎光，不许任何人带走。','灯里装着一粒暗星，亮度随骰声起伏。','仰头望着不复存在的天空。'],
 ['在没有水的走廊，仍踩出潮汐的拍子。','灯火沉在水面之下，照见倒行的影子。','退潮夺走了面容，却没带走等待。'],
 ['以骨片记录巡逻次数，已经刻满整面墙。','白色灯罩里，保存着守夜人的最后约定。','从王座退下以后，再没找到属于自己的墓碑。'],
 ['只走在明暗交界处，始终差半步踏入光里。','把黄昏折进灯中，不肯接受夜晚。','沿着拉长的影子，寻找失去的轮廓。'],
 ['被锁在同一段道路，每一步都牵动细线。','灯光穿过层层棘纹，落下碎裂的网。','曾守护此地的花园，现在只认识入侵者。'],
 ['数着脚下落沙，等一条永远不会到来的换岗令。','灯内细沙落尽时，巡夜便从头开始。','记得每一次钟响，却忘了自己为何等待。'],
 ['披着第一缕晨光，却再没见过日出。','守住即将熄灭的光，拒绝最后一次闭眼。','仍站在黎明应当升起的方向。'],
];
ENEMIES.push(...THEMES.flatMap((theme,i)=>['巡游者','执灯人','遗忘者'].map((role,j)=>{
 const trait=['pulse','drain','ramp','ward','shield','fierce'][(i+j)%6];
 return {name:theme+role,role,theme:i,note:ENEMY_NOTES[i][j],trait,...ENEMY_TRAITS[trait]};
})));
ENEMIES.push(...EXTRA_ENEMIES);
export const TALENT_GROUPS = { high:'高点裁决', resonance:'同点共鸣', critical:'锋芒连锁', vitality:'余火永存', luck:'幸运命运' };
const node=(name,description,group,cap=5)=>({name,description,group,cap,short:name,detail:description});
export const TALENTS = {
 high:{...LEGACY_TALENTS.high,group:'high',cap:5},
 four:node('四点火种','每颗 4 点：点数贡献 +15%','high'),
 five:node('五点焰心','每颗 5 点：点数贡献 +15%','high'),
 six:node('六点裁决','每颗 6 点：点数贡献 +18%','high'),
 sum:node('满盈','总点数 ≥18：伤害 +10%','high'),
 power:node('无尽锋刃','全部伤害 +3%','high',1000000),
 resonance:{...LEGACY_TALENTS.resonance,group:'resonance',cap:5},
 pair:node('双生','双同及以上：伤害 +10%','resonance'),
 triple:node('三重星火','三同及以上：伤害 +15%','resonance'),
 quartet:node('四方轰鸣','四同及以上：伤害 +20%','resonance'),
 choir:node('众星齐鸣','五同及以上：伤害 +30%','resonance'),
 echo:node('余音','共鸣时追击率 +3%','resonance'),
 critical:{...LEGACY_TALENTS.critical,group:'critical',cap:5},
 keen:node('六点锋芒','出现 6 点：暴击率 +3%','critical'),
 crush:node('致命一击','暴击倍率 +0.10','critical'),
 pursuit:node('追猎','追击伤害增加主击的 8%','critical'),
 opener:node('先声','首回合伤害 +15%','critical'),
 slayer:node('破王','对精英 / 首领 / 悬赏伤害 +10%','critical'),
 vitality:node('不灭','最大生命 +5%','vitality',1000000),
 guard:node('壁障','防御 +8%','vitality'),
 leech:node('汲光','暴击时恢复最大生命 1%','vitality'),
 recovery:node('余火','击杀恢复增加最大生命的 3%','vitality'),
 fortune:node('寻金','所有宝箱金币 +10%','vitality'),
 smith:node('炉心','锻造费用 -5%','vitality'),
 luck:node('幸运刻印','幸运 +4','luck'),
 attune:node('同点引导','后续骰有额外 2% 概率跟随前一颗点数','luck'),
 omen:node('双星兆示','本层命运双同时：幸运 +2','luck'),
 mercy:node('低谷余光','掷出 1 点：先获得最大生命 1% 的护盾','luck'),
 jackpot:node('高点馈赠','至少三颗 5 / 6 且击杀：本箱金币 +10%','luck'),
 spark:node('暴击回声','同点且暴击：本次追击率 +5%','luck'),
};

ENEMIES.push(...DEEP_ENEMIES);
BOSSES.push(...DEEP_BOSSES);
Object.assign(TALENTS,DEEP_TALENTS);
ROOM_DETAILS.boss.reward='传说保底；30层后可出现高阶品质，但不保证当前最高档。五层武器、十层遗物交替。';
ROOM_DETAILS.hiddenboss.reward='传说保底；深层高阶机会高于日常战斗。';
