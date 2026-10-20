import {RARITIES,PROFILES,CATALOG,CATALOG_BY_ID,AFFINITIES} from './equipment-content.js';
export const ENHANCE_CAP=20;
export const MAX_ITEM_LEVEL=1e13;
export const MAX_ITEM_XP=1e15;
const GOLD_CAP=1e10;
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const depthPower=d=>d<=10?d:10+12*Math.log1p((d-10)/12);
const equippedIds=s=>Object.values(s.player.equipped).filter(Boolean);
const rng=s=>{let x=s.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;};
const pick=(s,items)=>items[Math.floor(rng(s)*items.length)];
export const levelXpNeeded=level=>100+12*Math.min(level,10000);
export const effectiveLevel=item=>item.level+(item.levelXp||0)/levelXpNeeded(item.level);
export function itemValue(item){
 if(!item)return 0;
 return Math.round((8+effectiveLevel(item)*3.5)*RARITIES[item.rarity].multiplier*(1+item.enhance*.045));
}
export function itemStats(item){
 if(!item)return {};
 const value=itemValue(item),p=PROFILES[item.slot][item.profile??0];
 if(item.legacy){
  const affinity=item.theme===undefined?{}:{[AFFINITIES[item.theme].key]:(item.rarity+1)*.02};
  if(item.slot==='weapon')return {...affinity,attack:Math.round(value*p.attack),crit:item.rarity*.02+p.crit,follow:p.follow};
  if(item.slot==='armor')return {...affinity,hp:Math.round(value*3*p.hp),defense:Math.round(value*.2*p.defense),crit:p.crit||0};
  return {...affinity,attack:Math.round(value*.45*p.attack),crit:.02+item.rarity*.035+p.crit,follow:item.rarity*.035+p.follow};
 }
 const effects=CATALOG_BY_ID.get(item.catalogId)?.effects||{};
 const result=item.slot==='weapon'?{attack:Math.round(value*p.attack),crit:item.rarity*.015+p.crit,follow:p.follow}:item.slot==='armor'?{hp:Math.round(value*3*p.hp),defense:Math.round(value*.24*p.defense),crit:p.crit||0}:{attack:Math.round(value*.12*p.attack),crit:.01+item.rarity*.015+p.crit,follow:.04+item.rarity*.02+p.follow};
 for(const [key,amount]of Object.entries(effects))result[key]=(result[key]||0)+amount;
 for(const key of ['luck','firstCritLuck','eliteLuck'])if(result[key]!==undefined)result[key]=Math.round(result[key]);
 for(const key of ['attack','hp','defense'])if(result[key]!==undefined)result[key]=Math.min(Number.MAX_SAFE_INTEGER,result[key]);
 return result;
}
export function makeItem(s,slot,rarity=0,depth=s.floor,rewardType='combat'){
 slot ||= pick(s,['weapon','armor','relic']);
 const entry=pick(s,CATALOG[slot].filter(i=>i.rarity===rarity));
 const extra=['boss','vault','guardian','hiddenboss'].includes(rewardType)?3:['elite','trial','blackmarket'].includes(rewardType)?1:rewardType==='event'?5:0;
 const level=Math.max(1,Math.min(MAX_ITEM_LEVEL,s.player.level+Math.floor(rng(s)*5)-2+extra));
 return {id:`i${s.nextId++}`,slot,rarity,depth,level,levelXp:0,enhance:0,locked:false,catalogId:entry.id,profile:entry.profile,theme:entry.theme,name:entry.name};
}
export function validEquipment(item){
 if(!item||Object.hasOwn(item,'growth')||!/^i\d+$/.test(item.id)||!['weapon','armor','relic'].includes(item.slot)||!integer(item.rarity,0,7)||!integer(item.depth,1,Number.MAX_SAFE_INTEGER)||!integer(item.level,1,MAX_ITEM_LEVEL)||!integer(item.levelXp,0,levelXpNeeded(item.level)-1)||!integer(item.enhance,0,ENHANCE_CAP)||typeof item.name!=='string'||item.name.length>64)return false;
 if(item.level===MAX_ITEM_LEVEL&&item.levelXp!==0)return false;
 if(item.locked!==undefined&&typeof item.locked!=='boolean')return false;
 if(item.legacy!==undefined&&typeof item.legacy!=='boolean')return false;
 if(item.profile!==undefined&&!integer(item.profile,0,2))return false;
 if(item.theme!==undefined&&!integer(item.theme,0,9))return false;
 const entry=CATALOG_BY_ID.get(item.catalogId);
 if(item.legacy)return item.catalogId===undefined||entry?.slot===item.slot;
 return !!entry&&entry.slot===item.slot&&entry.rarity===item.rarity&&entry.profile===item.profile&&entry.theme===item.theme;
}
// Used only at the migration boundary and in evidence; runtime itemValue never reads growth/depth.
export function legacyItemValue(item){
 return Math.round((8+(item.catalogId?depthPower(item.depth):item.depth)*3.5)*RARITIES[item.rarity].multiplier*(1+item.enhance*.045+(item.growth||0)*.01));
}
export function migrateEquipment(input){
 const item=structuredClone(input);
 if(item.level!==undefined){if(Object.hasOwn(item,'growth'))throw Error('装备等级记录混合了旧成长字段，原始存档未改动。');if(!validEquipment(item))throw Error('装备等级记录不完整，原始存档未改动。');return item;}
 if(!integer(item.depth,1,Number.MAX_SAFE_INTEGER)||!integer(item.rarity,0,3)||!integer(item.enhance,0,20)||(item.growth!==undefined&&!integer(item.growth,0,1e12)))throw Error('旧装备数据无效，原始存档未改动。');
 const oldValue=legacyItemValue(item),scale=RARITIES[item.rarity].multiplier*(1+item.enhance*.045);
 const exact=((8+(item.catalogId?depthPower(item.depth):item.depth)*3.5)*(1+item.enhance*.045+(item.growth||0)*.01)/(1+item.enhance*.045)-8)/3.5;
 if(!Number.isSafeInteger(oldValue)||exact>MAX_ITEM_LEVEL||exact<1)throw Error('旧装备战力超出安全等级范围，请保留原始备份以便人工转换。');
 item.level=Math.max(1,Math.floor(exact));item.levelXp=Math.min(levelXpNeeded(item.level)-1,Math.max(0,Math.round((exact-item.level)*levelXpNeeded(item.level))));item.legacy=true;delete item.growth;
 // Find an integer progress point whose rounded value protects the previous attribute value.
 const target=(oldValue/scale-8)/3.5,estimate=Math.round((target-item.level)*levelXpNeeded(item.level));
 const candidates=[item.levelXp,...Array.from({length:7},(_,i)=>estimate+i-3)].filter(x=>integer(x,0,levelXpNeeded(item.level)-1));
 item.levelXp=candidates.reduce((best,x)=>Math.abs(itemValue({...item,levelXp:x})-oldValue)<Math.abs(itemValue({...item,levelXp:best})-oldValue)?x:best,item.levelXp);
 if(!validEquipment(item))throw Error('旧装备无法安全转换，原始存档未改动。');
 return item;
}
export function advanceEquipment(input,xp){
 if(!validEquipment(input)||!integer(xp,0,MAX_ITEM_XP))throw Error('装备经验超出安全范围。');
 const item={...input};let remaining=xp+item.levelXp;item.levelXp=0;
 if(item.level<10000){
  const n=10000-item.level,toLimit=n*(100+12*item.level)+6*n*(n-1);
  if(remaining>=toLimit){remaining-=toLimit;item.level=10000;}
  else{
   const b=94+12*item.level,levels=Math.floor((-b+Math.sqrt(b*b+24*remaining))/12);
   remaining-=levels*(100+12*item.level)+6*levels*(levels-1);item.level+=levels;
  }
 }
 if(item.level>=10000){const levels=Math.floor(remaining/levelXpNeeded(item.level));if(levels>MAX_ITEM_LEVEL-item.level||(levels===MAX_ITEM_LEVEL-item.level&&remaining%levelXpNeeded(item.level)!==0))throw Error('装备已接近安全等级上限，材料未消耗。');remaining-=levels*levelXpNeeded(item.level);item.level+=levels;}
 item.levelXp=item.level===MAX_ITEM_LEVEL?0:remaining;
 if(!validEquipment(item))throw Error('装备经验结算未通过安全校验。');return item;
}
export const forgeCost=(s,item)=>Math.min(GOLD_CAP+1,Math.round((35+item.level*8+item.enhance*item.enhance*6)*(1+item.rarity*.25)*(1-(s.player.talents.smith||0)*.05)*(s.route[s.roomIndex]?.quality ? .8 : 1)));
// Read only: show the six possible item panels before spending. These are
// single-item attributes, not promised combat damage or changes to fixed traits.
// The actual forge transaction still rechecks ownership, price and the rolled face.
export function forgePreview(s,id){
 const item=s.player.items.find(item=>item.id===id);
 if(!validEquipment(item))return null;
 const cost=forgeCost(s,item),remaining=ENHANCE_CAP-item.enhance,before={enhance:item.enhance,level:item.level,levelXp:item.levelXp,stats:itemStats(item)};
 const outcomes=Array.from({length:6},(_,index)=>{
  const value=index+1,gain=Math.min(remaining,value>=5?3:value>=3?2:1),after={...before,enhance:item.enhance+gain,stats:itemStats({...item,enhance:item.enhance+gain})};
  const changes=Object.keys(after.stats).filter(key=>after.stats[key]!==before.stats[key]).map(key=>({key,before:before.stats[key]||0,after:after.stats[key],delta:after.stats[key]-(before.stats[key]||0)}));
  return {value,gain,after,changes};
 });
 const affordable=s.player.gold>=cost,capped=remaining===0,equipped=equippedIds(s).includes(id);
 const unchanged=Object.keys(before.stats).filter(key=>outcomes.every(outcome=>outcome.after.stats[key]===before.stats[key])).map(key=>({key,value:before.stats[key]}));
 return {id,slot:item.slot,cost,costExceedsGoldCap:cost>GOLD_CAP,remaining,affordable,capped,equipped,canForge:s.phase==='forge'&&equipped&&!capped&&affordable,before,outcomes,unchanged};
}
export const fusionMaterialXp=item=>(80+18*Math.sqrt(effectiveLevel(item)))*[1,1.6,2.6,4.2,6.8,11,17.8,28.8][item.rarity]*(1+item.enhance*.0125);
// Share the exact quote with bulk selection. Rounding before and after the
// multipliers matters: a rounded single-item quote cannot be multiplied by N.
export function fusionCostSummary(s,targets,materialCount){
 if(!targets.length)return {cost:0,baseCost:0,averageLevel:0,qualityMultiplier:1,levelMultiplier:1};
 const averageLevel=targets.reduce((n,t)=>n+t.level,0)/targets.length,qualityMultiplier=1+targets.reduce((n,t)=>n+t.rarity,0)/targets.length*.25;
 const baseCost=Math.round((18+averageLevel*2.4)*materialCount),levelMultiplier=1+Math.max(0,averageLevel-s.player.level)/Math.max(10,s.player.level);
 const cost=Math.min(GOLD_CAP+1,Math.round(baseCost*qualityMultiplier*levelMultiplier));
 return {cost,baseCost,averageLevel,qualityMultiplier,levelMultiplier};
}
// Selecting a full inventory must not construct a 10,000-entry lookup and six
// detailed outcome tables for every individual material. Keep the same per-item
// safety rules, including the highest-roll level cap, in one bounded pass.
export function safeFusionMaterialIds(s,targetIds){
 const ids=Array.isArray(targetIds)?targetIds:[targetIds];
 if(!ids.length||ids.length>3||new Set(ids).size!==ids.length)return [];
 const inventory=new Map(s.player.items.map(item=>[item.id,item])),targets=ids.map(id=>inventory.get(id));
 if(targets.some(item=>!validEquipment(item)||item.level===MAX_ITEM_LEVEL)||targets.some(item=>item.slot!==targets[0].slot)||(targets.length>1&&targets[0].slot!=='relic'))return [];
 const excluded=new Set([...ids,...equippedIds(s),s.loot?.item?.id]),rarity=Math.min(2,...targets.map(item=>item.rarity));
 return s.player.items.filter(item=>{
  if(excluded.has(item.id)||item.locked||item.rarity>rarity||item.slot!==targets[0].slot||!validEquipment(item))return false;
  const base=Math.max(targets.length,Math.floor(fusionMaterialXp(item)));
  if(base>MAX_ITEM_XP/2.5)return false;
  const total=Math.floor(base*2.5);
  try{for(let index=0;index<targets.length;index++)advanceEquipment(targets[index],Math.floor(total/targets.length)+(index<total%targets.length?1:0));}catch{return false;}
  return true;
 }).map(item=>item.id);
}
export function fusionPreview(s,targetIds,materialIds,allowProtected=false){
 const list=ids=>Array.isArray(ids)?ids:[ids],ts=list(targetIds),ms=list(materialIds);
 if(!ts.length||ts.length>3||!ms.length||new Set([...ts,...ms]).size!==ts.length+ms.length)return null;
 const inventory=new Map(s.player.items.map(i=>[i.id,i]));
 const targets=ts.map(id=>inventory.get(id)),materials=ms.map(id=>inventory.get(id));
 const equipped=new Set(equippedIds(s)),lootId=s.loot?.item?.id;
 if(targets.some(i=>!validEquipment(i))||targets.some(i=>i.slot!==targets[0].slot||i.level===MAX_ITEM_LEVEL)||(targets.length>1&&targets[0].slot!=='relic')||materials.some(i=>!validEquipment(i)||i.slot!==targets[0].slot||equipped.has(i.id)||i.id===lootId))return null;
 const lowestTargetRarity=Math.min(...targets.map(t=>t.rarity));
 const protectedItems=materials.filter(i=>i.locked||i.rarity>=3||i.rarity>lowestTargetRarity);
 if(protectedItems.length&&allowProtected!==true)return null;
 const base=Math.max(targets.length,Math.floor(materials.reduce((n,item)=>n+fusionMaterialXp(item),0)));
 if(base>MAX_ITEM_XP/2.5)return null;
 let outcomes;try{outcomes=Array.from({length:6},(_,i)=>{
  const value=i+1,boost=value===6?2.5:value===5?1.75:1,total=Math.floor(base*boost),gains=targets.map((_,j)=>Math.floor(total/targets.length)+(j<total%targets.length?1:0));
  const upgrades=targets.map((before,j)=>{const after=advanceEquipment(before,gains[j]);return {id:before.id,xp:gains[j],before:{level:before.level,levelXp:before.levelXp,stats:itemStats(before)},after:{level:after.level,levelXp:after.levelXp,stats:itemStats(after)},levels:after.level-before.level};});
  return {value,boost,total,gains,upgrades};
 });}catch{return null;}
 const {cost,baseCost,averageLevel,qualityMultiplier,levelMultiplier}=fusionCostSummary(s,targets,materials.length);
 return {targets,materials,protectedItems,base,min:outcomes[0].gains,max:outcomes[5].gains,cost,baseCost,averageLevel,qualityMultiplier,levelMultiplier,outcomes,target:targets[0],material:materials[0],gain:base,unit:'xp',allowProtected:allowProtected===true};
}
// The engine passes its already-cloned transaction and an actual committed dice face.
export function applyFusion(s,preview,value){
 if(!preview||!integer(value,1,6))return null;
 const current=fusionPreview(s,preview.targets.map(i=>i.id),preview.materials.map(i=>i.id),preview.allowProtected);
 if(!current||s.player.gold<current.cost)return null;
 const outcome=current.outcomes[value-1],replacements=new Map(current.targets.map((item,i)=>[item.id,advanceEquipment(item,outcome.gains[i])])),consumed=new Set(current.materials.map(i=>i.id));
 s.player.items=s.player.items.filter(i=>!consumed.has(i.id)).map(i=>replacements.get(i.id)||i);s.player.gold-=current.cost;
 s.lastForge={value,gain:outcome.total,name:current.targets[0].name,fusion:true,gains:outcome.gains,targets:current.targets.map(t=>t.id),consumed:[...consumed],unit:'xp',levels:outcome.upgrades.map(u=>u.levels),upgrades:outcome.upgrades};
 return s;
}
