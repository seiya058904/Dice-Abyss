import {RARITIES} from './equipment-content.js';
import {advanceEquipment,fusionCostSummary,fusionMaterialXp,fusionPreview,itemValue,MAX_ITEM_LEVEL,MAX_ITEM_XP,validEquipment} from './equipment.js';

export const FUSION_PAGE_SIZE=24;
const SLOTS=new Set(['weapon','armor','relic']);
const ids=value=>Array.isArray(value)?value:typeof value==='string'?[value]:[];
const unique=value=>[...new Set(ids(value))];
const selectedSlot=ui=>SLOTS.has(ui.fusionSlot)?ui.fusionSlot:'weapon';
const equippedSet=s=>new Set(Object.values(s.player.equipped).filter(Boolean));
const inventoryMap=s=>new Map(s.player.items.map(item=>[item.id,item]));

function selection(s,ui,inventory,equipped){
 const slot=selectedSlot(ui),targetIds=unique(ui.fusionTargets).filter(id=>{
  const item=inventory.get(id);return item?.slot===slot&&validEquipment(item)&&item.level<MAX_ITEM_LEVEL;
 }).slice(0,slot==='relic'?3:1),targetSet=new Set(targetIds);
 const materialIds=targetIds.length?unique(ui.fusionMaterials).filter(id=>{
  const item=inventory.get(id);return item?.slot===slot&&!targetSet.has(id)&&!equipped.has(id)&&id!==s.loot?.item?.id&&validEquipment(item);
 }):[];
 return {targetIds,materialIds};
}

// Only view state is normalized. Saved items, gold and the RNG remain untouched.
// In particular, changing a target retains legal selections, including an
// explicitly selected locked or higher-quality material that needs confirmation.
export function normalizeFusionSelection(s,ui={}){
 return selection(s,ui,inventoryMap(s),equippedSet(s));
}

function levelBound(value){
 if(value===''||value===null||value===undefined)return null;
 const number=Number(value);return Number.isFinite(number)?Math.max(1,Math.trunc(number)):null;
}

// Ordinary clicks and submission need current identities, not a sorted copy of
// the entire pool. This is rebuilt per call, including for in-place mutations.
export function fusionSelectionModel(s,ui={}){
 const slot=selectedSlot(ui),inventory=inventoryMap(s),equipped=equippedSet(s);
 const {targetIds,materialIds}=selection(s,ui,inventory,equipped),targetSet=new Set(targetIds),materialSet=new Set(materialIds);
 const targets=targetIds.map(id=>inventory.get(id)),materials=materialIds.map(id=>inventory.get(id));
 return {slot,inventory,targetIds,targets,materialIds,materials,targetSet,materialSet,equipped};
}

// Range selection and rendering additionally need the current ordering. No
// inventory, filter or quote cache survives this synchronous model build.
export function fusionWorkbenchModel(s,ui={},includePreview=true){
 const selected=fusionSelectionModel(s,ui),{slot,targetIds,materialIds}=selected;
 const candidates=s.player.items.filter(item=>item.slot===slot),search=String(ui.fusionSearch||'').trim().toLocaleLowerCase();
 const rarity=ui.fusionRarity===null||ui.fusionRarity===undefined?'':String(ui.fusionRarity),minLevel=levelBound(ui.fusionMinLevel),maxLevel=levelBound(ui.fusionMaxLevel);
 const sort=['power','level','rarity','enhance','depth','newest'].includes(ui.fusionSort)?ui.fusionSort:'newest';
 const filtered=candidates.map((item,index)=>({item,index})).filter(({item})=>
  (rarity===''||(rarity==='low'?item.rarity<=1:item.rarity===Number(rarity)))&&
  (minLevel===null||item.level>=minLevel)&&(maxLevel===null||item.level<=maxLevel)&&
  (!search||`${item.name} ${RARITIES[item.rarity]?.name||''} ${item.id}`.toLocaleLowerCase().includes(search))
 );
 // Compute an expensive power key only once per filtered item, never per
 // comparator invocation. Inventory order is the exact acquisition tie-breaker.
 for(const entry of filtered)entry.key=sort==='power'?(validEquipment(entry.item)?itemValue(entry.item):0):sort==='newest'?entry.index:Number(entry.item[sort])||0;
 filtered.sort((a,b)=>b.key-a.key||b.index-a.index);
 const ordered=filtered.map(entry=>entry.item),pages=Math.max(1,Math.ceil(ordered.length/FUSION_PAGE_SIZE));
 const requested=Number.isFinite(Number(ui.fusionPage))?Math.trunc(Number(ui.fusionPage)):0,page=Math.max(0,Math.min(pages-1,requested));
 return {...selected,candidates,filtered:ordered,
  pageItems:ordered.slice(page*FUSION_PAGE_SIZE,(page+1)*FUSION_PAGE_SIZE),page,pages,total:ordered.length,
  preview:includePreview&&targetIds.length&&materialIds.length?fusionPreview(s,targetIds,materialIds,true):null};
}

function aggregateFits(targets,xp){
 const base=Math.max(targets.length,Math.floor(xp));
 if(!Number.isSafeInteger(base)||base>MAX_ITEM_XP/2.5)return false;
 const total=Math.floor(base*2.5),share=Math.floor(total/targets.length),remainder=total%targets.length;
 try{for(let index=0;index<targets.length;index++)advanceEquipment(targets[index],share+(index<remainder?1:0));}catch{return false;}
 return true;
}

// The quote is monotone in the number of materials, but not exactly N times the
// one-item cost. Binary search the shared quote to preserve both rounding steps.
function affordableCount(s,targets,count){
 const gold=Number.isFinite(s.player.gold)?Math.max(0,s.player.gold):0;
 let low=0,high=count;
 while(low<high){const middle=Math.ceil((low+high)/2);if(fusionCostSummary(s,targets,middle).cost<=gold)low=middle;else high=middle-1;}
 return low;
}

export function planFusionMaterials(s,targetIds,candidateIds,options={}){
 const {budget=true,includeLocked=false,includePreview=true}=options,inventory=inventoryMap(s),equipped=equippedSet(s),ts=ids(targetIds);
 const empty={ids:[],eligibleCount:0,selectedCount:0,excluded:{equipped:0,loot:0,locked:0,invalid:0,targets:0},budgetLimited:false,safetyLimited:false,cost:0,preview:null};
 if(!ts.length||ts.length>3||new Set(ts).size!==ts.length)return empty;
 const targets=ts.map(id=>inventory.get(id));
 if(targets.some(item=>!validEquipment(item)||item.level===MAX_ITEM_LEVEL)||targets.some(item=>item.slot!==targets[0].slot)||(targets.length>1&&targets[0].slot!=='relic'))return empty;
 const targetSet=new Set(ts),slot=targets[0].slot,scope=candidateIds===undefined?s.player.items.filter(item=>item.slot===slot).map(item=>item.id):unique(candidateIds),eligible=[];
 for(let index=0;index<scope.length;index++){
  const id=scope[index],item=inventory.get(id);
  if(targetSet.has(id)){empty.excluded.targets++;continue;}
  if(equipped.has(id)){empty.excluded.equipped++;continue;}
  if(id===s.loot?.item?.id){empty.excluded.loot++;continue;}
  if(item?.locked&&!includeLocked){empty.excluded.locked++;continue;}
  if(!validEquipment(item)||item.slot!==slot){empty.excluded.invalid++;continue;}
  eligible.push({id,xp:fusionMaterialXp(item),index});
 }
 empty.eligibleCount=eligible.length;
 // A target set has one per-piece price: maximizing XP also maximizes XP/gold.
 // Legendary+ and higher-than-target materials deliberately remain eligible.
 eligible.sort((a,b)=>b.xp-a.xp||a.index-b.index);
 const limit=budget?affordableCount(s,targets,eligible.length):eligible.length,selected=[];
 // The common case fits even at six points. Sum in the same sorted order as
 // the original sequential planner: rounding each piece or changing addition
 // order could change the final integer XP. All smaller prefixes then fit too.
 let prefixXp=0;for(let index=0;index<limit;index++)prefixXp+=eligible[index].xp;
 if(limit&&aggregateFits(targets,prefixXp)){
  for(let index=0;index<limit;index++)selected.push(eligible[index].id);
 }else{
  // Near the safety ceiling a large piece may fail while a later small one
  // still fits. Retain the exact per-piece fallback and three-relic remainder.
  let xp=0;
  for(const entry of eligible){
   if(selected.length===limit)break;
   if(!aggregateFits(targets,xp+entry.xp)){empty.safetyLimited=true;continue;}
   selected.push(entry.id);xp+=entry.xp;
  }
 }
 // Batch controls only place IDs and display a notice. The render and commit
 // each obtain a fresh authoritative six-face quote when it is actually used.
 const preview=includePreview&&selected.length?fusionPreview(s,ts,selected,true):null;
 const cost=selected.length?(includePreview?preview?.cost||0:fusionCostSummary(s,targets,selected.length).cost):0;
 return {...empty,ids:selected,selectedCount:selected.length,budgetLimited:budget&&limit<eligible.length,cost,preview};
}
