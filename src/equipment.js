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
 if(result.luck!==undefined)result.luck=Math.round(result.luck);
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
 if(!item||Object.hasOwn(item,'growth')||!/^i\d+$/.test(item.id)||!['weapon','armor','relic'].includes(item.slot)||!integer(item.rarity,0,3)||!integer(item.depth,1,Number.MAX_SAFE_INTEGER)||!integer(item.level,1,MAX_ITEM_LEVEL)||!integer(item.levelXp,0,levelXpNeeded(item.level)-1)||!integer(item.enhance,0,ENHANCE_CAP)||typeof item.name!=='string'||item.name.length>64)return false;
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
export function fusionPreview(s,targetIds,materialIds,allowProtected=false){
 const list=ids=>Array.isArray(ids)?ids:[ids],ts=list(targetIds),ms=list(materialIds);
 if(!ts.length||ts.length>3||!ms.length||new Set([...ts,...ms]).size!==ts.length+ms.length)return null;
 const inventory=new Map(s.player.items.map(i=>[i.id,i]));
 const targets=ts.map(id=>inventory.get(id)),materials=ms.map(id=>inventory.get(id));
 if([...targets,...materials].some(i=>!validEquipment(i))||targets.some(i=>i.slot!==targets[0].slot||i.level===MAX_ITEM_LEVEL)||(targets.length>1&&targets[0].slot!=='relic')||materials.some(i=>i.slot!==targets[0].slot||equippedIds(s).includes(i.id)||i.id===s.loot?.item?.id))return null;
 const protectedItems=materials.filter(i=>i.locked||i.rarity===3||i.rarity>Math.min(...targets.map(t=>t.rarity)));
 if(protectedItems.length&&!allowProtected)return null;
 const base=Math.max(targets.length,Math.floor(materials.reduce((n,i)=>n+(80+18*Math.sqrt(effectiveLevel(i)))*[1,1.6,2.6,4.2][i.rarity]*(1+i.enhance*.0125),0)));
 if(base>MAX_ITEM_XP/2.5)return null;
 let outcomes;try{outcomes=Array.from({length:6},(_,i)=>{
  const value=i+1,boost=value===6?2.5:value===5?1.75:1,total=Math.floor(base*boost),gains=targets.map((_,j)=>Math.floor(total/targets.length)+(j<total%targets.length?1:0));
  const upgrades=targets.map((before,j)=>{const after=advanceEquipment(before,gains[j]);return {id:before.id,xp:gains[j],before:{level:before.level,levelXp:before.levelXp,stats:itemStats(before)},after:{level:after.level,levelXp:after.levelXp,stats:itemStats(after)},levels:after.level-before.level};});
  return {value,boost,total,gains,upgrades};
 });}catch{return null;}
 const averageLevel=targets.reduce((n,t)=>n+t.level,0)/targets.length,qualityMultiplier=1+targets.reduce((n,t)=>n+t.rarity,0)/targets.length*.25;
 const baseCost=Math.round((18+averageLevel*2.4)*materials.length),levelMultiplier=1+Math.max(0,averageLevel-s.player.level)/Math.max(10,s.player.level);
 const cost=Math.min(GOLD_CAP+1,Math.round(baseCost*qualityMultiplier*levelMultiplier));
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
