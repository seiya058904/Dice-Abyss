import {ABILITY_DEFS,DEEP_TALENTS,eraFor} from './deep-content.js';
import {abilityRoll} from './deep-rules.js';
import {rollRarity,rarityProbabilities} from './rarity.js';
import { RARITIES, SLOTS, ENEMIES, DICE_LEVELS, TALENTS, BOSSES, EQUIP_SLOTS } from './content.js';
import {itemValue,itemStats,makeItem,forgeCost,fusionPreview,applyFusion,MAX_ITEM_LEVEL} from './equipment.js';
import {COMBAT_ROOMS,EVENT_ROOMS,canonicalCombatType,encounterProfile,initEncounterEnemy,generateExpandedRoute,combatModifiers,extraEnemyAttack,extraEnemyIntent,postRetaliation,encounterReward,eventStatBonuses,createEvent,eventChoices,applyEvent} from './encounters.js';
export {itemValue,itemStats,makeItem,forgeCost,fusionPreview} from './equipment.js';

export const VERSION = 5;
export const ENHANCE_CAP = 20;
export const GOLD_CAP = 1e10;
const copy = value => structuredClone(value);
const safe = n => Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.round(n)));
const health = n => Math.min(1e15,safe(n));
export function random(state) {
  let x = state.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
export function diceOdds(s) {
 const st=stats(s),t=st.luck/(st.luck+40)*1.5,weights=[1,1,1,1,1+t,1+1.4*t],sum=weights.reduce((a,b)=>a+b,0),faces=weights.map(w=>w/sum);
 return {luck:st.luck,highChance:faces[4]+faces[5],echoChance:Math.min(.25,st.echoChance+st.luck*.0015),faces};
}
export function drawDice(s,count) {
 const odds=diceOdds(s),values=[];let echoes=0;
 for(let i=0;i<count;i++){
  if(i&&odds.echoChance>0&&random(s)<odds.echoChance){values.push(values[i-1]);echoes++;continue;}
  const roll=random(s);let cumulative=0,value=6;
  for(let face=0;face<6;face++){cumulative+=odds.faces[face];if(roll<cumulative){value=face+1;break;}}
  values.push(value);
 }
 return {values,echoes,odds};
}
const die = s => drawDice(s,1).values[0];
const pick = (s, list) => list[Math.floor(random(s) * list.length)];
export const diceCount = s => DICE_LEVELS.filter(level => s.player.level >= level).length;
export const xpNeeded = level => 18 + level * 10;
export const equippedIds = s => Object.values(s.player.equipped).filter(Boolean);
export const talent = (s, key) => s.player.talents[key] || 0;
// Logarithmic tail keeps every later floor finite, while depth still increases reward power.
export const depthPower = depth => depth <= 10 ? depth : 10 + 12 * Math.log1p((depth - 10) / 12);
export function equipSlot(s, item, requested) {
 if (item.slot !== 'relic') return item.slot;
 if (['relic','relic2','relic3'].includes(requested)) return requested;
 return ['relic','relic2','relic3'].find(k=>!s.player.equipped[k]) || ['relic','relic2','relic3'].sort((a,b)=>itemValue(s.player.items.find(i=>i.id===s.player.equipped[a]))-itemValue(s.player.items.find(i=>i.id===s.player.equipped[b])))[0];
}
export function damageExpectation(s,st=stats(s)) {
 const count=diceCount(s),t=st.luck/(st.luck+40)*1.5,weights=[1,1,1,1,1+t,1+1.4*t],sum=weights.reduce((a,b)=>a+b,0),p=weights.map(w=>w/sum);
 // Exact independent pair probability; echo adds a bounded approximation. This is an estimate, not a promise for a specific roll.
 const dp=Array(count+1).fill(0);dp[0]=1;
 for(const prob of p)for(let k=count;k>0;k--)dp[k]+=dp[k-1]*prob;
 let factorial=1;for(let k=2;k<=count;k++)factorial*=k;
 const echo=Math.min(.25,st.echoChance+st.luck*.0015),pair=1-Math.min(1,dp[count]*factorial)*Math.pow(1-echo,Math.max(0,count-1));
 const weighted=p.reduce((n,prob,i)=>{const v=i+1;return n+prob*v*(1+(v>=5?talent(s,'high')*.12:0)+(v===4?talent(s,'four')*.15+st.fourBonus:v===5?talent(s,'five')*.15+st.fiveBonus:v===6?talent(s,'six')*.18+st.sixBonus:0));},0)*count;
 const crit=Math.min(.9,st.crit+st.critBonus+talent(s,'keen')*.03*(1-Math.pow(1-p[5],count))),follow=Math.min(.85,st.follow+st.followBonus+pair*talent(s,'echo')*.03+crit*pair*(st.criticalFollow+talent(s,'spark')*.05));
 const triggered=1+(count>=3?pair*.65*((st.echoRelic||0)+(st.tripleStrike||0)):0)+(st.openingStrike||0)*.25+(count>=4?(st.distinctStrike||0)*.45:0)+(st.execution||0)*.1;
 return triggered*st.attack*weighted/5*(1+pair*(.45+talent(s,'resonance')*.12))*(1+talent(s,'power')*.03+pair*(talent(s,'pair')*.1+st.pairBonus))*(1+crit*(.8+talent(s,'crush')*.1+st.critDamage))*(1+follow*(.35+talent(s,'pursuit')*.08+st.followDamage));
}
export function compareEquipment(s,item,requestedSlot) {
 const before=stats(s), next={...s,player:{...s.player,equipped:{...s.player.equipped},items:s.player.items}};
 if (!next.player.items.some(i=>i.id===item.id)) next.player.items=[...next.player.items,item];
 const slot=equipSlot(s,item,requestedSlot);next.player.equipped[slot]=item.id;
 const after=stats(next),survival=st=>st.maxHp*(1+st.defense/Math.max(20,depthPower(s.floor)*6))/(1-st.reduction)*(1+st.barrier+st.regen*2)/(1-st.dodge),armor=item.slot==='armor';
 const delta=Math.round(((armor?survival(after)/survival(before):damageExpectation(next,after)/damageExpectation(s,before))-1)*100);
 const labels={attack:'攻击',maxHp:'生命',defense:'防御',luck:'幸运',echoChance:'跟随同点',crit:'暴击率',follow:'追击率',reduction:'减伤',pairWard:'同点护盾',critDamage:'暴击伤害',pierce:'穿盾',regen:'再生',barrier:'开场护盾',dodge:'闪避',criticalFollow:'共鸣暴击追击',followDamage:'追击伤害',goldBonus:'金币收益'};
 const preferred=armor?['maxHp','defense','reduction','dodge','barrier','regen']:item.slot==='weapon'?['attack','crit','follow','critDamage','pierce']:['luck','echoChance','pairWard','follow','crit','criticalFollow','goldBonus','attack'];
 const core=preferred.filter(key=>before[key]!==after[key]).slice(0,4).map(key=>({key,label:labels[key],before:before[key],after:after[key],delta:after[key]-before[key]}));
 const shieldTradeoff=!armor&&after.pierce+1e-8<before.pierce;
 const conditional=Object.keys(ABILITY_DEFS).some(k=>before[k]!==after[k])||item.slot==='relic'||['firstBonus','bossBonus','pairBonus','pairWard','goldBonus','pierce','healBonus'].some(k=>before[k]!==after[k]);
 return {label:armor?'生存预期':'伤害预期',delta,shieldTradeoff,grade:shieldTradeoff?'穿盾需权衡':delta>=8?(conditional?'估算提升':'明显提升'):delta<=-8?(conditional?'估算降低':'明显降低'):'大致持平',core,conditional,note:shieldTradeoff?`基础穿盾 ${Math.round(before.pierce*100)}% → ${Math.round(after.pierce*100)}%。面板增伤不等于对厚盾的生命伤害提升；条件穿盾另看词条。`:conditional?'按当前天赋估算；条件效果、战斗节奏与金币收益请结合词条选择。':'按当前天赋与骰数估算，实际结果取决于本次点数。',slot};
}
export function stats(s) {
 const p=s.player, level=p.level;
 const result={attack:7+level*2,maxHp:110+level*15,defense:2,crit:.07+talent(s,'critical')*.03,follow:.04+talent(s,'critical')*.02,fourBonus:0,fiveBonus:0,sixBonus:0,pairBonus:0,sumBonus:0,bossBonus:0,firstBonus:0,critBonus:0,followBonus:0,healBonus:0,luck:talent(s,'luck')*4+(s.fate?.[0]===s.fate?.[1]&&s.fate?talent(s,'omen')*2:0),echoChance:talent(s,'attune')*.02,critDamage:0,pierce:0,reduction:0,dodge:0,regen:0,barrier:0,pairWard:0,criticalFollow:0,followDamage:0,goldBonus:0};
 for (const id of new Set(equippedIds(s))) {
  const v=itemStats(p.items.find(i=>i.id===id));
  for(const key of Object.keys(result)) result[key]+=v[key==='maxHp'?'hp':key]||0;
 }
 for(const key of Object.keys(ABILITY_DEFS))result[key]=0;
 for(const id of new Set(equippedIds(s))){const v=itemStats(p.items.find(i=>i.id===id));for(const key of Object.keys(ABILITY_DEFS))result[key]+=v[key]||0;}
 for(const [key,t]of Object.entries(DEEP_TALENTS))result[t.effect]+=talent(s,key)*t.amount;
 for(const [key,definition]of Object.entries(ABILITY_DEFS))result[key]=Math.min(definition.cap,result[key]);
 const event=eventStatBonuses(s);result.luck+=event.luck+(s.nextLuck||0);
 const rawLuck=result.luck;result.rawLuck=Math.round(rawLuck);result.luckOverflow=Math.max(0,Math.round(rawLuck-100));
 result.luck=rawLuck<=100?rawLuck:100+Math.min(100,Math.sqrt(rawLuck-100)*5);
 const overflowGold=Math.min(.5,result.luckOverflow*.002);
 result.maxHp=health(result.maxHp*(1+talent(s,'vitality')*.05)*event.maxHpMultiplier);
 result.defense+=Math.ceil(result.defense*talent(s,'guard')*.08);
 for(const key of Object.keys(result).filter(k=>k.endsWith('Bonus')))result[key]=Math.min(.6,result[key]);
 result.attack=safe(result.attack);result.defense=safe(result.defense);result.crit=Math.min(.75,result.crit);result.follow=Math.min(.6,result.follow);
 const caps={luck:200,echoChance:.25,critDamage:2,pierce:.7,reduction:.65,dodge:.35,regen:.12,barrier:.75,pairWard:.2,criticalFollow:.5,followDamage:1,goldBonus:1};
 for(const [key,cap]of Object.entries(caps))result[key]=Math.max(0,Math.min(cap,result[key]));result.luck=Math.round(result.luck);result.goldBonus+=overflowGold;
 return result;
}

function log(s, text, tone = '') {
  s.log.unshift({ text, tone });
  s.log = s.log.slice(0, 6);
}
function gainGold(s,amount){
 const total=s.player.gold+amount;s.player.gold=Math.min(GOLD_CAP,total);
 if(total>GOLD_CAP)log(s,'金币已达持有上限 · 可先在商店与工坊投入','gold');
}
export function salvagePreview(s,ids,allowProtected=false,allowOverflow=false) {
 const equipped=equippedIds(s),protectedId=s.loot?.item?.id;
 const safe=item=>item&&!equipped.includes(item.id)&&!item.locked&&(item.rarity<3||(ids!==undefined&&allowProtected===true))&&item.id!==protectedId;
 let items;
 if(ids===undefined){
  const weakest=slot=>Math.min(...Object.keys(EQUIP_SLOTS).filter(key=>key===slot||(slot==='relic'&&key.startsWith('relic'))).map(key=>itemValue(s.player.items.find(i=>i.id===s.player.equipped[key]))));
  const thresholds=Object.fromEntries(Object.keys(SLOTS).map(slot=>[slot,weakest(slot)]));
  items=s.player.items.filter(item=>safe(item)&&item.rarity<=1&&itemValue(item)<thresholds[item.slot]);
 }else{
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return null;
  items=ids.map(id=>s.player.items.find(item=>item.id===id));
  if(!items.every(safe))return null;
 }
 if(!items.length)return null;
 const gold=items.reduce((sum,item)=>sum+Math.max(1,Math.floor(itemValue(item)*.15)),0);
 if(!Number.isSafeInteger(gold))return null;
 const credited=Math.min(gold,GOLD_CAP-s.player.gold),overflow=gold-credited;
 if(overflow&&!allowOverflow)return null;
 return {items,gold:credited,overflow,rawGold:gold};
}
export function newGame(seed = Date.now()) {
  const s = { version: VERSION, revision: 0, runId: `${seed}-${Date.now()}`, rng: (seed >>> 0) || 1, nextId: 1, floor: 1, phase: 'fate', route: [], roomIndex: 0, fate: null, enemy: null, chest: null, loot: null, shop: [], lastRoll: null, lastForge: null, log: [], completed: false,event:null,eventLuck:0,eventPower:0,encounterHistory:[],routeMemory:{services:[],last:{},hiddenFloor:0},v5Boons:{echo:0,ward:0},nextLuck:0,
    counters: { rolls: 0, kills: 0, chests: 0, deaths: 0, highestDamage: 0, bosses: 0 },
    player: { level: 1, xp: 0, gold: 80, hp: 1, talentPoints: 0,deepOfferings:0,pactScars:0,fateBlessings:0, talents: Object.fromEntries(Object.keys(TALENTS).map(k=>[k,0])), items: [], equipped: {} } };
  for (const slot of Object.keys(SLOTS)) { const item = makeItem(s, slot, 0, 1); s.player.items.push(item); s.player.equipped[slot] = item.id; }
  s.player.equipped.relic2 = null; s.player.equipped.relic3 = null;
  s.player.hp = stats(s).maxHp;
  log(s, '你踏入了遗忘入口。');
  return s;
}
export function generateRoute(s, fate) {
  return generateExpandedRoute(s,fate,random);
}
export function createEnemy(s,roomType) {
 const type=canonicalCombatType(roomType),profile=encounterProfile(roomType);
 const f=depthPower(s.floor);
 const matching=ENEMIES.filter(e=>e.roomType===roomType&&s.floor>=(e.minFloor||1)),normal=ENEMIES.filter(e=>!e.roomType&&s.floor>=(e.minFloor||1));
 const pool=s.floor<3?normal.slice(0,s.floor===1?3:6):normal;
 const regional=pool.filter(e=>e.minFloor&&e.minFloor===eraFor(s.floor).floor),deepBosses=BOSSES.filter(b=>b.minFloor&&s.floor>=b.minFloor);
 const template=matching.length?pick(s,matching):type==='boss'?(deepBosses.length&&random(s)<.45?pick(s,deepBosses):BOSSES[(Math.max(0,Math.floor(s.floor/5)-1))%12]):regional.length&&random(s)<.45?pick(s,regional):pick(s,pool);
 const tier=type==='boss'?3*Math.pow(Math.max(1,s.floor/10),.3):type==='elite'?2.3:type==='trial'?1.35:1;
 // Dice unlocks, three relics and resonance compound quickly in the first ten floors.
 // Use the floor, never the current loadout, so upgrades retain their full advantage.
 const tail=Math.max(1,s.floor/10);
 const endurance=Math.pow(Math.min(f,10),1.5)*(1+Math.max(0,f-10)*.035)*Math.sqrt(tail);
 const deepPressure=1+Math.max(0,Math.min(s.floor,1000000)-29)*.012;
 const hp=health(deepPressure*(32+f*26+f*f*2.5)*tier*endurance*(template.trait==='stout'?1.3:template.trait==='fierce'?.85:1)*profile.hpMultiplier);
 const attack=health((8+f*3+f*f*.08)*(1+Math.min(9,f-1)*.065)*(type==='boss'?1.2:type==='elite'?1.15:1)*(template.trait==='fierce'?1.25:template.trait==='stout'?.8:1)*profile.attackMultiplier*Math.pow(tail,.4));
 const shield=['shield','ward'].includes(template.trait)?Math.round(hp*.2):0;
 return initEncounterEnemy({...template,type,hp,maxHp:hp,attack,shield,maxShield:Math.max(shield,type==='boss'?Math.ceil(hp*.12):0),turns:0,combatRules:4,stage:1},{...s.route[s.roomIndex],type:roomType});
}
export function enemyAttack(e) {
 const trait=e.trait==='rage'&&e.hp<=e.maxHp/2?1.35:e.trait==='pulse'&&(e.turns+1)%3===0?1.6:e.trait==='ramp'?1+Math.min(.8,e.turns*.08):1;
 const challenge=[2,4].includes(e.combatRules)?(e.type==='elite'&&e.trait!=='pulse'&&(e.turns+1)%3===0?1.55:1)*(e.type==='boss'&&(e.stage===2||e.hp<=e.maxHp/2)?1.15:1):1;
 return health(extraEnemyAttack(e,e.attack*trait*challenge));
}
const diceCombinations=new Map();
function possibleDice(count){
 if(diceCombinations.has(count))return diceCombinations.get(count);
 const result=[],visit=(values,min)=>{if(values.length===count){result.push(values);return;}for(let v=min;v<=6;v++)visit([...values,v],v);};visit([],1);diceCombinations.set(count,result);return result;
}
export function enemyIntent(stateOrEnemy) {
 const s=stateOrEnemy?.player?stateOrEnemy:null,e=s?s.enemy:stateOrEnemy;if(!e)return null;
 const st=s?stats(s):{maxHp:0,defense:0,reduction:0,dodge:0,pairWard:0},phase=e.type==='boss'&&(e.stage===2||(e.combatRules!==4&&e.hp<=e.maxHp/2))?2:1;
 const heavy=e.trait==='pulse'||([2,4].includes(e.combatRules)&&e.type==='elite'),turnsUntilHeavy=heavy?3-e.turns%3:null,extra=extraEnemyIntent(e),warning=turnsUntilHeavy===1||!!extra?.warning;
 const count=s?diceCount(s):6,conditional=!!e.mechanic||st.dodge>0||st.pairWard>0||(s&&talent(s,'mercy')>0),possibilities=conditional?possibleDice(count):[Array(count).fill(6)],healthStates=[e];
 // A surviving hit may cross a rage threshold or boss phase. Forecast both, without looking at or consuming the next RNG draw.
 if(e.hp>1)healthStates.push({...e,hp:1,stage:[2,4].includes(e.combatRules)&&e.type==='boss'?2:e.stage});
 let minDamage=Infinity,maxDamage=0;
 for(const values of possibilities){
  const best=Math.max(...values.map(v=>values.filter(n=>n===v).length));
  for(const candidate of healthStates){
   const mod=e.combatRules===4?combatModifiers(candidate,values,best,st):{attackMultiplier:1,wardGain:0};
   const counter=s?Math.max(1,safe((enemyAttack(candidate)*(mod.attackMultiplier||1)-st.defense)*(1-st.reduction))):enemyAttack(candidate)*(mod.attackMultiplier||1);
   const gained=s?health((values.includes(1)?st.maxHp*talent(s,'mercy')*.01:0)+(best>=2?st.maxHp*st.pairWard:0)+(mod.wardGain||0)):0,ward=health((s?.ward||0)+gained),direct=Math.max(0,counter-ward);
   const post=e.combatRules===4?postRetaliation({...candidate,turns:e.turns+1},{values,best},st):{playerDrain:0},drain=safe(post.playerDrain||0);
   maxDamage=Math.max(maxDamage,safe(direct+drain));minDamage=Math.min(minDamage,safe((st.dodge>0?0:direct)+(s&&direct>=s.player.hp?0:drain)));
  }
 }
 if(!Number.isFinite(minDamage))minDamage=0;
 if(s&&['criticalWard','lowWard','phaseWard','resolveGuard'].some(k=>st[k]>0))minDamage=0;
 const attack=enemyAttack(e),conditionalDamage=maxDamage>minDamage?maxDamage:null;
 const label=extra?.label||(warning?'重击将至':[2,4].includes(e.combatRules)&&e.type==='boss'&&phase===2?'二阶段反击':e.trait==='rage'&&e.hp<=e.maxHp/2?'激怒反击':e.trait==='drain'?'汲取反击':e.trait==='ward'?'护盾反击':'下一次反击');
 const detail=[...new Set([e.label,extra?.detail,heavy?'每三回合重击 · 还有 '+turnsUntilHeavy+' 回合':null,[2,4].includes(e.combatRules)&&e.type==='boss'?(phase===1?'存活进入半血时展开 12% 阶段护盾'+(e.combatRules===2?'；旧版当次伤害止于半血':'；本击伤害完整生效'):'二阶段 · 反击 +15%'):null,maxDamage>minDamage?'点数与阈值可能改变反击 · 本击生命伤害 '+minDamage+'～'+maxDamage:null].filter(Boolean))].join(' · ');
 return {attack,damage:minDamage,minDamage,maxDamage,label,detail,warning,phase,turnsUntilHeavy,conditionalDamage};
}

export function rarityRoll(s,type,legacySource=type){
 return rollRarity(random(s),{floor:s.floor,fate:s.fate,luck:s.floor<30?Math.min(100,stats(s).luck):stats(s).luck},type,legacySource);
}
export function dropOdds(s,type='combat',legacySource=type){return rarityProbabilities({floor:s.floor,fate:s.fate,luck:s.floor<30?Math.min(100,stats(s).luck):stats(s).luck},type,legacySource);}
export function createChest(s, type, source) {
  const combatType=COMBAT_ROOMS.has(type)?canonicalCombatType(type):type==='abyssauction'?'vault':type;
  const deepSource=type==='abyssauction'?'auction':['guardian','hiddenboss','abyssking','archiveguard','bounty','vault','auction'].includes(type)?type:combatType;
  let rarity = rarityRoll(s, s.floor<30?combatType:deepSource,combatType);
  if (type === 'chest' && s.route[s.roomIndex]?.quality) rarity = Math.max(1, rarity);
  // First victory demonstrates a meaningful upgrade; bosses guarantee a jackpot.
  if (s.counters.kills === 1 && type === 'combat') rarity = Math.max(1, rarity);
  const item = makeItem(s, type === 'boss' ? (s.floor % 10 === 0 ? 'relic' : 'weapon') : undefined, rarity,s.floor,combatType);
  return { item, gold: Math.min(1e8,Math.round((22 + depthPower(s.floor) * 10) * (combatType==='boss' ? 4 : combatType==='elite' ? 1.9 : 1) * (1+talent(s,'fortune')*.1+stats(s).goldBonus) * (1 + (s.fate?.reduce((a, b) => a + b, 0) || 2) * 0.025))), type, source };
}
function encounterWard(s){
 const st=stats(s);s.ward=health((s.ward||0)+st.maxHp*(st.barrier+(s.v5Boons?.ward?.5:0)));
 if(s.enemy&&s.v5Boons?.echo)s.enemy.openingEcho=.25;
 s.v5Boons={echo:0,ward:0};s.nextLuck=0;
}
function eventApi(){return {stats,random,die,pick,makeItem,createChest,createEnemy,gainGold,gainXp,log,enhanceCap:ENHANCE_CAP,itemLevelCap:MAX_ITEM_LEVEL};}
function enterRoom(s) {
  const room = s.route[s.roomIndex];
  s.lastRoll = null; s.lastForge = null; s.loot = null; s.chest = null; s.enemy = null;s.event=null;
  if (COMBAT_ROOMS.has(room.type)) { s.enemy = createEnemy(s, room.type); s.phase = 'combat';encounterWard(s); log(s, `遭遇${s.enemy.name}。`, s.enemy.type === 'boss' ? 'danger' : ''); }
  else if (['chest','vault'].includes(room.type)) { s.chest = createChest(s, room.type, room.type==='vault'?'星辉秘藏':'遗迹密藏'); s.phase = 'chest'; }
  else if (['merchant','blackmarket'].includes(room.type)) {
    s.phase = room.type;
    s.shop = Object.keys(SLOTS).map((slot, i) => {
      let rarity = Math.min(3, (room.type==='blackmarket'||s.floor>=6?2:1) + (i === s.floor % 3 ? 1 : 0) + (room.quality && i === s.floor % 3 && s.floor >= 4 ? 1 : 0));
      if(s.floor>=30)rarity=Math.max(rarity,rarityRoll(s,room.type,'combat'));
      const item = makeItem(s, slot, rarity,s.floor,room.type);
      return { id: item.id, item, price: Math.min(1e8,Math.round((38 + s.player.level * 8) * (1 + rarity * 0.85))), sold: false };
    });
    s.shop.push({ id: 'heal', price: Math.round(25 + depthPower(s.floor) * 5), sold: false });
  } else if(EVENT_ROOMS.has(room.type))createEvent(s,room.type,eventApi());
  else s.phase = room.type;
  s.roomUsed=false; s.blessing=s.blessing||0;
}
function gainXp(s, amount) {
  s.player.xp = Math.min(1e8,safe(s.player.xp+amount));
  while (s.player.level<1e6&&s.player.xp >= xpNeeded(s.player.level)) {
    s.player.xp -= xpNeeded(s.player.level); s.player.level++; s.player.talentPoints=Math.min(2e6,s.player.talentPoints+2);
    s.player.hp = stats(s).maxHp;
    log(s, `升至 Lv.${s.player.level} · 获得 2 天赋点${DICE_LEVELS.includes(s.player.level) ? ' · 新骰子解锁' : ''}`, 'gold');
  }
}
export function resolveRoll(s) {
  const {values,echoes,odds}=drawDice(s,diceCount(s)),best=Math.max(...values.map(v=>values.filter(x=>x===v).length)),highCount=values.filter(v=>v>=5).length,st=stats(s),enemy=s.enemy;
  s.nextLuck=0;
  const rules=enemy.combatRules===4,mod=rules?combatModifiers(enemy,values,best,st):{damageMultiplier:1,bonusDamage:0,shieldPierce:0,healPlayer:0,wardGain:0,attackMultiplier:1,notes:[]},mechanics=[...(mod.notes||[])];
  const weighted=values.reduce((sum,v)=>sum+v*(1+(v>=5?talent(s,'high')*.12:0)+(v===4?talent(s,'four')*.15+st.fourBonus:v===5?talent(s,'five')*.15+st.fiveBonus:v===6?talent(s,'six')*.18+st.sixBonus:0)),0);
  const resonance=best>=2?1+(best-1)*.45+talent(s,'resonance')*.12:1;
  const critical=random(s)<Math.min(.9,st.crit+st.critBonus+(values.includes(6)?talent(s,'keen')*.03:0));
  const follow=random(s)<Math.min(.85,st.follow+st.followBonus+(best>=2?talent(s,'echo')*.03:0)+(critical&&best>=2?st.criticalFollow+talent(s,'spark')*.05:0));
  const abilities=abilityRoll(s,st,values,best,critical);mechanics.push(...abilities.notes);
  enemy.openingEcho=0;
  if(critical&&!enemy.firstCritUsed&&st.firstCritLuck){enemy.firstCritUsed=true;s.nextLuck=Math.round(st.firstCritLuck);mechanics.push('启明星 · 幸运 +'+s.nextLuck+'（至下次战斗掷骰结束，离层或重试清除）');}
  const bonus=1+talent(s,'power')*.03+(best>=2?talent(s,'pair')*.1+st.pairBonus:0)+(best>=3?talent(s,'triple')*.15:0)+(best>=4?talent(s,'quartet')*.2:0)+(best>=5?talent(s,'choir')*.3:0)+(values.reduce((a,b)=>a+b,0)>=18?talent(s,'sum')*.1+st.sumBonus:0)+(enemy.turns===0?talent(s,'opener')*.15+st.firstBonus:0)+(enemy.type!=='combat'?talent(s,'slayer')*.1+st.bossBonus:0)+(s.blessing||0)*.05;
  const main=Math.max(1,safe((weighted*st.attack/5*resonance*bonus*(critical?1.8+talent(s,'crush')*.1+st.critDamage:1)*(mod.damageMultiplier||1)*abilities.damage+(mod.bonusDamage||0))*eventStatBonuses(s).damageMultiplier));
  const extra=follow?Math.min(Number.MAX_SAFE_INTEGER-main,safe(main*(.35+talent(s,'pursuit')*.08+st.followDamage))):0,echoDamage=Math.min(Number.MAX_SAFE_INTEGER-main-extra,safe(main*abilities.echo)),total=main+extra+echoDamage;
  if(echoDamage)mechanics.push('深层回响 · 追加 '+echoDamage+'（不递归）');
  const pierce=Math.min(1,st.pierce+(mod.shieldPierce||0)+abilities.pierce),absorbed=Math.min(enemy.shield,safe(total*(1-pierce)));enemy.shield-=absorbed;
  let hpDamage=Math.min(enemy.hp,total-absorbed),phaseChanged=false;const half=Math.ceil(enemy.maxHp/2);
  if([2,4].includes(enemy.combatRules)&&enemy.type==='boss'&&enemy.stage!==2&&enemy.hp>half&&enemy.hp-hpDamage<=half){
    if(enemy.combatRules===2)hpDamage=enemy.hp-half;
    if(enemy.hp-hpDamage>0){enemy.stage=2;phaseChanged=true;}
  }else if([2,4].includes(enemy.combatRules)&&enemy.type==='boss'&&enemy.hp<=half)enemy.stage=2;
  enemy.hp-=hpDamage;enemy.turns++;
  if(phaseChanged){enemy.shield=Math.min(enemy.maxShield,enemy.shield+Math.ceil(enemy.maxHp*.12));log(s,'首领进入二阶段 · 阶段护盾展开，反击 +15%','danger');}
  const killed=enemy.hp<=0,wardGain=health((values.includes(1)?st.maxHp*talent(s,'mercy')*.01:0)+(best>=2?st.maxHp*st.pairWard:0)+(mod.wardGain||0)+abilities.ward+(phaseChanged?st.maxHp*st.phaseWard:0));
  if(wardGain){s.ward=health((s.ward||0)+wardGain);mechanics.push('共鸣与余光护盾 +'+wardGain);}
  if(mod.healPlayer)s.player.hp=Math.min(st.maxHp,s.player.hp+safe(mod.healPlayer));
  let retaliation=0,dodged=false;
  if(!killed){
    dodged=st.dodge>0&&random(s)<st.dodge;
    const raw=enemyAttack({...enemy,turns:enemy.turns-1});
    retaliation=dodged?0:Math.max(1,safe((raw*(mod.attackMultiplier||1)*abilities.counter-st.defense)*(1-st.reduction)));
    const blocked=Math.min(s.ward||0,retaliation);s.ward=Math.max(0,(s.ward||0)-blocked);retaliation-=blocked;s.player.hp=Math.max(0,s.player.hp-retaliation);
    if(dodged)mechanics.push('闪避 · 本次反击归零');
    if(enemy.trait==='drain')enemy.hp=Math.min(enemy.maxHp,enemy.hp+Math.ceil(enemy.maxHp*.02));
    if(enemy.trait==='ward'&&enemy.turns%3===0)enemy.shield=Math.min(enemy.maxShield,enemy.shield+Math.ceil(enemy.maxHp*.05));
    if(rules&&s.player.hp>0){const post=postRetaliation(enemy,{values,best,critical,follow},st);enemy.hp=Math.min(enemy.maxHp,enemy.hp+safe(post.enemyHeal||0));enemy.shield=Math.min(enemy.maxShield,enemy.shield+safe(post.enemyWard||0));const drain=Math.min(s.player.hp,safe(post.playerDrain||0));s.player.hp-=drain;retaliation=safe(retaliation+drain);mechanics.push(...(post.notes||[]));}
  }
  if(s.player.hp>0){s.player.hp=Math.min(st.maxHp,s.player.hp+abilities.heal);if(critical)s.player.hp=Math.min(st.maxHp,s.player.hp+Math.floor(st.maxHp*talent(s,'leech')*.01));if(st.regen)s.player.hp=Math.min(st.maxHp,s.player.hp+Math.floor(st.maxHp*st.regen));}
  s.counters.rolls=safe(s.counters.rolls+1);s.counters.highestDamage=Math.max(s.counters.highestDamage,total);
  s.lastRoll={values,best,critical,follow,main,extra,echoDamage,total,absorbed,hpDamage,retaliation,killed,phaseChanged,guarded:enemy.combatRules===2&&phaseChanged?Math.max(0,total-absorbed-hpDamage):0,luck:odds.luck,luckActive:odds.luck>0||odds.echoChance>0,echoes,highCount,wardGain,dodged,mechanics:mechanics.slice(0,24)};
  log(s,values.join(' · ')+' → '+total+' 伤害'+(critical?' · 暴击':'')+(best>=2?' · '+best+' 同共鸣':'')+(echoes?' · 引导同点 '+echoes:''),best>=3||critical?'gold':'');
  if(killed){
    s.counters.kills=safe(s.counters.kills+1);if(enemy.type==='boss')s.counters.bosses=safe(s.counters.bosses+1);
    if(['elite','boss'].includes(enemy.type)&&st.eliteLuck){s.eventLuck=Math.min(20,(s.eventLuck||0)+Math.ceil(st.eliteLuck));mechanics.push('追星 · 本层幸运提升至 '+s.eventLuck);}
    gainXp(s,Math.round((15+depthPower(s.floor)*4)*(enemy.type==='boss'?2.5:enemy.type==='elite'?1.5:1)));
    s.player.hp=Math.min(stats(s).maxHp,s.player.hp+Math.ceil(stats(s).maxHp*(.16+talent(s,'recovery')*.03+st.healBonus)));
    const reward=encounterReward(enemy),rewardType=enemy.encounterKey&&COMBAT_ROOMS.has(enemy.encounterKey)?enemy.encounterKey:enemy.type;
    s.chest=createChest(s,rewardType,enemy.name);
    if(s.chest.item.rarity<reward.minRarity)s.chest.item=makeItem(s,s.chest.item.slot,reward.minRarity,s.floor,rewardType);
    const bounty=enemy.type==='trial'&&enemy.turns<=4?2:reward.goldMultiplier||1;
    s.chest.gold=Math.min(1e8,safe(s.chest.gold*bounty*(1+(highCount>=3?talent(s,'jackpot')*.1:0)+(values.filter(v=>v===6).length>=2?st.gildedSix:0))));
    s.lastRoll.mechanics=mechanics.slice(0,24);
    if(bounty>1)log(s,'悬赏达成 · 金币 ×'+bounty,'gold');s.phase='chest';log(s,enemy.name+'倒下了 · 宝箱已出现。','gold');
  }else if(!s.player.hp){s.phase='dead';s.counters.deaths=safe(s.counters.deaths+1);log(s,'余火未熄。成长与战利品仍然保留。','danger');}
}
function nextRoom(s) {
  const room=s.route[s.roomIndex];
  if(s.phase==='loot'&&room.wave<room.waves){
    room.wave++;s.loot=null;s.chest=null;s.lastRoll=null;s.enemy=createEnemy(s,room.waveType||room.type);s.enemy.encounterKey=room.waveType||room.type;s.enemy.wave=room.wave;s.phase='combat';encounterWard(s);log(s,`第 ${room.wave} / ${room.waves} 波 · ${s.enemy.name}`,'danger');return;
  }
  s.route[s.roomIndex].done = true;
  if (s.roomIndex >= s.route.length - 1) {
    s.phase = 'cleared';
    if (s.floor === 10) s.completed = true;
    log(s, `第 ${s.floor} 层已肃清。`, 'gold');
  } else { s.roomIndex++; enterRoom(s); }
}
export function canAct(s, action) {
  const p = s.phase;
  if (action.type === 'fate') return p === 'fate';
  if (action.type === 'enter') return p === 'route';
  if (action.type === 'roll') return p === 'combat';
  if (action.type === 'open') return p === 'chest'&&s.player.items.length<10000;
  if (action.type === 'next') return ['loot','merchant','blackmarket','forge','fusion','altar','rest'].includes(p)||(p==='event'&&s.event?.status==='resolved');
  if (action.type === 'event-choice') {const option=eventChoices(s).find(o=>o.id===action.id);return p==='event'&&option&&!option.disabled&&(!option.confirm||action.confirmed===true);}
  if (action.type === 'gold') return p === 'gold';
  if (action.type === 'descend') return ['cleared', 'complete'].includes(p) && s.floor < Number.MAX_SAFE_INTEGER;
  if (action.type === 'retry') return p === 'dead';
  if (action.type === 'equip') return s.player.items.some(i => i.id === action.id && !equippedIds(s).includes(i.id));
  if (action.type === 'talent') return s.player.talentPoints > 0 && Object.hasOwn(TALENTS, action.id) && talent(s,action.id) < TALENTS[action.id].cap && s.floor >= (TALENTS[action.id].floor||1);
  if (action.type === 'buy') { const offer = s.shop.find(o => o.id === action.id); return ['merchant','blackmarket'].includes(p) && offer && !offer.sold && s.player.gold >= offer.price && (offer.item?s.player.items.length<10000:s.player.hp < stats(s).maxHp); }
  if (action.type === 'forge') { const item = s.player.items.find(i => i.id === action.id); return p === 'forge' && item && Object.values(s.player.equipped).includes(item.id) && item.enhance < ENHANCE_CAP && s.player.gold >= forgeCost(s, item); }
  if (action.type === 'fuse') { const preview = fusionPreview(s, action.targets||action.target, action.materials||action.material,action.allowProtected); return p === 'fusion' && preview && s.player.gold >= preview.cost; }
  if(action.type==='bless') return p==='altar'&&!s.roomUsed;
  if(action.type==='rest') return p==='rest'&&!s.roomUsed;
  if(action.type==='lock') return s.player.items.some(i=>i.id===action.id);
  if(action.type==='salvage')return !!salvagePreview(s,action.ids,action.allowProtected,action.allowOverflow);
  return false;
}
export function transition(original, action) {
  if (!canAct(original, action)) return original;
  const s = copy(original);
  switch (action.type) {
    case 'fate':
      s.fate = drawDice(s,2).values; s.route = generateRoute(s, s.fate); s.roomIndex = 0; s.phase = 'route';
      if (s.fate[0] === s.fate[1]) { const gold=Math.round(20+depthPower(s.floor)*5);gainGold(s,gold); log(s, `命运双同 · 额外获得 ${gold} 金币。`, 'gold'); }
      log(s, `命运 ${s.fate.join(' / ')} · 路线已揭晓。`); break;
    case 'enter': enterRoom(s); break;
    case 'roll': resolveRoll(s); break;
    case 'open':
      s.loot = s.chest; gainGold(s,s.chest.gold); s.player.items.push(s.chest.item); s.chest = null; s.counters.chests=safe(s.counters.chests+1); s.phase = 'loot';
      log(s, `获得${s.loot.item.name} · ${RARITIES[s.loot.item.rarity].name}`, RARITIES[s.loot.item.rarity].key); break;
    case 'next': nextRoom(s); break;
    case 'gold':
      gainGold(s,Math.round(65 + depthPower(s.floor) * 22) + (s.fate[0] + s.fate[1]) * 3);
      log(s, `黄金房 · 获得 ${Math.round(65 + depthPower(s.floor) * 22) + (s.fate[0] + s.fate[1]) * 3} 金币。`, 'gold'); nextRoom(s); break;
    case 'descend': s.floor++;s.nextLuck=0; s.blessing=0; s.ward=0;s.event=null;s.eventLuck=0;s.eventPower=0; s.phase = 'fate'; s.route = []; s.fate = null; s.roomIndex = 0; s.enemy = null; s.loot = null;s.chest=null; s.lastRoll = null; s.player.hp = stats(s).maxHp; break;
    case 'retry':
      s.player.hp = stats(s).maxHp; s.enemy.hp = s.enemy.maxHp; s.enemy.shield = ![2,4].includes(s.enemy.combatRules)||['shield','ward'].includes(s.enemy.trait)?s.enemy.maxShield:0;
      if(s.enemy.combatRules===4)s.enemy=initEncounterEnemy(s.enemy,{...s.route[s.roomIndex],type:s.enemy.encounterKey||s.enemy.type});
      s.enemy.turns = 0;s.enemy.firstCritUsed=false;s.enemy.openingEcho=0;s.nextLuck=0;if([2,4].includes(s.enemy.combatRules))s.enemy.stage=1;s.ward=health(stats(s).maxHp*stats(s).barrier); s.lastRoll = null; s.phase = 'combat';
      log(s, '在当前房间重燃余火 · 生命已恢复。'); break;
    case 'equip': {
      const oldMax = stats(s).maxHp; const item = s.player.items.find(i => i.id === action.id);
      s.player.equipped[equipSlot(s,item,action.slot)] = item.id;
      // Never heal on armor swaps; added capacity is filled by recovery later.
      s.player.hp = Math.min(s.player.hp, stats(s).maxHp);
      if (s.phase === 'dead') s.player.hp = 0;
      log(s, `装备${item.name}${stats(s).maxHp > oldMax ? ' · 生命上限提升' : ''}。`); break;
    }
    case 'talent': s.player.talentPoints--; s.player.talents[action.id]=talent(s,action.id)+1; log(s, `${TALENTS[action.id].name}升至 ${s.player.talents[action.id]} 级。`, 'gold'); break;
    case 'buy': {
      const offer = s.shop.find(o => o.id === action.id); offer.sold = true; s.player.gold -= offer.price;
      if (offer.item) { s.player.items.push(offer.item); log(s, `购入${offer.item.name}。`); } else { s.player.hp = stats(s).maxHp; log(s, '余火补给 · 生命已恢复。'); } break;
    }
    case 'forge': {
      const item = s.player.items.find(i => i.id === action.id); s.player.gold -= forgeCost(s, item);
      const value = die(s); const gain = Math.min(ENHANCE_CAP - item.enhance, value >= 5 ? 3 : value >= 3 ? 2 : 1);
      item.enhance += gain; s.lastForge = { value, gain, name: item.name, fusion: false };
      log(s, `${item.name}强化 +${gain} → +${item.enhance}`, 'gold'); break;
    }
    case 'fuse': {
      const info=fusionPreview(s,action.targets||action.target,action.materials||action.material,action.allowProtected),value=die(s);
      if(!applyFusion(s,info,value))return original;
      log(s,`融合 ${info.materials.length} 件 · ${value} 点 · 装备经验 +${s.lastForge.gain}${value>=5?' · 高点增幅':''}`,'epic');break;
    }
    case 'event-choice':if(!applyEvent(s,{id:action.id,confirmed:action.confirmed},eventApi()))return original;else if(s.phase==='combat')encounterWard(s);break;
    case 'bless': {const value=die(s);s.blessing=(s.blessing||0)+value;s.roomUsed=true;s.lastForge={value,gain:value,name:'本层祝福',fusion:false};log(s,`祭坛 ${value} 点 · 本层伤害 +${value*5}%`,'gold');break;}
    case 'rest': s.player.hp=stats(s).maxHp;s.ward=Math.round(stats(s).maxHp*.25);s.roomUsed=true;log(s,'休整完成 · 生命全满，获得 25% 护盾','rare');break;
    case 'lock': {const item=s.player.items.find(i=>i.id===action.id);item.locked=!item.locked;break;}
    case 'salvage': {
      const preview=salvagePreview(s,action.ids,action.allowProtected,action.allowOverflow),ids=new Set(preview.items.map(item=>item.id));
      s.player.items=s.player.items.filter(item=>!ids.has(item.id));s.player.gold+=preview.gold;
      log(s,`回收 ${preview.items.length} 件装备 · 获得 ${preview.gold} 金币`,'gold');break;
    }

  }
  s.revision++;
  return s;
}
