// Equipment data has no engine/content imports, so content may safely re-export it.
export const RARITIES=[{name:'普通',key:'common',multiplier:1},{name:'稀有',key:'rare',multiplier:1.7},{name:'史诗',key:'epic',multiplier:2.9},{name:'传说',key:'legendary',multiplier:5},{name:'神话',key:'mythic',multiplier:8.5},{name:'太古',key:'ancient',multiplier:14.5},{name:'起源',key:'origin',multiplier:24.5},{name:'永恒',key:'eternal',multiplier:42}];
export const THEMES=['余烬','霜痕','雷鸣','星陨','幽潮','白骨','暮光','荆棘','沙漏','破晓'];
export const PROFILES={
 weapon:[{name:'重刃',attack:1.12,crit:0,follow:0},{name:'刺剑',attack:.98,crit:.04,follow:0},{name:'双锋',attack:.94,crit:0,follow:.06}],
 armor:[{name:'壁垒',hp:1.12,defense:.9},{name:'战甲',hp:1,defense:1.3},{name:'灵衣',hp:.95,defense:1,crit:.025}],
 relic:[{name:'心核',attack:1.1,crit:0,follow:.01},{name:'棱镜',attack:.95,crit:.025,follow:0},{name:'回环',attack:.9,crit:0,follow:.04}],
};
export const AFFINITIES=[
 {key:'fourBonus',label:'4 点伤害',trigger:'每颗 4 点骰子'},{key:'fiveBonus',label:'5 点伤害',trigger:'每颗 5 点骰子'},
 {key:'sixBonus',label:'6 点伤害',trigger:'每颗 6 点骰子'},{key:'pairBonus',label:'共鸣伤害',trigger:'出现双同及以上'},
 {key:'sumBonus',label:'总点 ≥18 伤害',trigger:'本次总点数至少 18'},{key:'bossBonus',label:'强敌伤害',trigger:'精英、首领与悬赏'},
 {key:'firstBonus',label:'首回合伤害',trigger:'首回合'},{key:'critBonus',label:'暴击率',trigger:'掷骰'},
 {key:'followBonus',label:'追击率',trigger:'掷骰'},{key:'healBonus',label:'击杀恢复',trigger:'击杀'},
];
export const SLOT_DESCRIPTIONS={weapon:'进攻核心 · 攻击、暴击与破甲',armor:'生存核心 · 生命、防御与保护',relic:'命运规则 · 幸运、共鸣与连锁'};
export const SLOT_AFFINITIES={
 weapon:[{key:'fourBonus',label:'4 点伤害',amount:.025},{key:'fiveBonus',label:'5 点伤害',amount:.025},{key:'sixBonus',label:'6 点伤害',amount:.03},{key:'critDamage',label:'暴击倍率',amount:.05},{key:'pierce',label:'破甲',amount:.025},{key:'followDamage',label:'追击倍率',amount:.06},{key:'firstBonus',label:'首击伤害',amount:.03},{key:'crit',label:'暴击率',amount:.015},{key:'criticalFollow',label:'暴击追击率',amount:.025},{key:'sumBonus',label:'满盈伤害',amount:.025}],
 armor:[{key:'barrier',label:'开战护盾',amount:.04},{key:'reduction',label:'减伤',amount:.015},{key:'dodge',label:'闪避率',amount:.02},{key:'regen',label:'回合恢复',amount:.01},{key:'pairWard',label:'共鸣护盾',amount:.025},{key:'healBonus',label:'击杀恢复',amount:.025},{key:'barrier',label:'开战护盾',amount:.055},{key:'reduction',label:'减伤',amount:.02},{key:'dodge',label:'闪避率',amount:.025},{key:'regen',label:'回合恢复',amount:.0125}],
 relic:[{key:'luck',label:'幸运',amount:3},{key:'echoChance',label:'同点牵引率',amount:.025},{key:'criticalFollow',label:'暴击追击率',amount:.03},{key:'pairBonus',label:'共鸣伤害',amount:.03},{key:'sumBonus',label:'满盈伤害',amount:.03},{key:'goldBonus',label:'金币收益',amount:.05},{key:'firstBonus',label:'首击伤害',amount:.025},{key:'critBonus',label:'暴击率',amount:.02},{key:'followBonus',label:'追击率',amount:.025},{key:'healBonus',label:'击杀恢复',amount:.025}],
};
const families={
 weapon:[['裂甲',{critDamage:.08,pierce:.025}],['燃星',{sixBonus:.055,firstBonus:.025}],['逐电',{followDamage:.09,criticalFollow:.025}],['双焰',{fourBonus:.05,fiveBonus:.04}],['锋运',{crit:.015,echoChance:.0125}],['弑王',{bossBonus:.05,sumBonus:.035}]],
 armor:[['坚城',{barrier:.05,reduction:.01}],['归息',{dodge:.018,regen:.008}],['共守',{pairWard:.04,barrier:.025}],['长明',{healBonus:.035,reduction:.008}],['泉铠',{barrier:.035,regen:.01}],['影壁',{dodge:.0125,pairWard:.03}]],
 relic:[['星谕',{luck:3,echoChance:.02}],['余音',{criticalFollow:.03,followDamage:.045}],['孪生',{pairBonus:.045,pairWard:.02}],['寻金',{goldBonus:.05,luck:2}],['满月',{sumBonus:.035,sixBonus:.02}],['回潮',{followBonus:.02,barrier:.02}]],
};
export const CATALOG=Object.fromEntries(['weapon','armor','relic'].map(slot=>{
 const original=THEMES.flatMap((theme,t)=>PROFILES[slot].flatMap((profile,p)=>RARITIES.map((r,rarity)=>({
  id:`${slot}-${t}-${p}-${rarity}`,slot,rarity,profile:p,theme:t,name:`${['残响','铭刻','誓约','永恒','赤曜','太初','溯源','无终'][rarity]}·${theme}${profile.name}`,
  affinityKey:SLOT_AFFINITIES[slot][t].key,effects:{[SLOT_AFFINITIES[slot][t].key]:SLOT_AFFINITIES[slot][t].amount*(rarity+1)},description:`${SLOT_DESCRIPTIONS[slot]} · ${SLOT_AFFINITIES[slot][t].label}`,
 }))));
 const additions=families[slot].flatMap(([family,effects],f)=>Array.from({length:4},(_,v)=>RARITIES.map((r,rarity)=>({
  id:`v4-${slot}-${f}-${v}-${rarity}`,slot,rarity,profile:v%3,theme:(f+v)%10,name:`${['残响','铭刻','誓约','永恒','赤曜','太初','溯源','无终'][rarity]}·${family}${['守誓','流光','回响','天启'][v]}${PROFILES[slot][v%3].name}`,
  effects:Object.fromEntries(Object.entries(effects).map(([k,n])=>[k,Math.round(n*(rarity+1)*(1+v*.12)*10000)/10000])),description:`${SLOT_DESCRIPTIONS[slot]} · ${family}双重词条`,
 }))).flat());
 const deepFamilies={
 weapon:[['裂天', 'sixShatter',.12,{pierce:.035}],['合奏','tripleStrike',.15,{pairBonus:.04}],['断王','execution',.18,{bossBonus:.06}],['初火','openingStrike',.2,{critDamage:.1}],['星谱','distinctStrike',.16,{sixBonus:.04}]],
 armor:[['映锋','criticalWard',.035,{reduction:.012}],['余灯','lowWard',.035,{barrier:.03}],['碎冠','phaseWard',.08,{defense:8}],['长生','sixthMend',.015,{hp:50}],['不退','resolveGuard',.1,{dodge:.015}]],
 relic:[['星海','echoRelic',.12,{luck:5}],['启明','firstCritLuck',7,{echoChance:.025}],['追星','eliteLuck',1,{luck:4}],['拾光','gildedSix',.15,{goldBonus:.05}],['归息','resonanceMend',.025,{pairWard:.025}]],
 };
 const deep=deepFamilies[slot].flatMap(([family,ability,base,extra],f)=>Array.from({length:4},(_,v)=>RARITIES.slice(4).map((r,j)=>{
  const rarity=j+4,scale=1+j*.2+v*.05;
  return {id:`v5-${slot}-${f}-${v}-${rarity}`,slot,rarity,profile:v%3,theme:(f+v)%10,name:`${['赤曜','太初','溯源','无终'][j]}·${family}${['守誓','流光','回响','天启'][v]}${PROFILES[slot][v%3].name}`,effects:{...Object.fromEntries(Object.entries(extra).map(([k,n])=>[k,k==='luck'?Math.round(n*(1+j*.2))+v:n*scale])),[ability]:Math.round(base*scale*10000)/10000},description:`${SLOT_DESCRIPTIONS[slot]} · 深层刻印`,ability};
 })).flat());
 return [slot,[...original,...additions,...deep]];
}));
export const CATALOG_BY_ID=new Map(Object.values(CATALOG).flat().map(item=>[item.id,item]));
