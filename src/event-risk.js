// Read-only prices and outcome probabilities for the two existing paid dice
// events. Dice/rarity helpers consume no RNG; committed choices stay in engine.
import {diceOdds,dropOdds} from './engine.js';
import {eventChoices} from './encounters.js';
import {GOLD_CAP,goldPreview} from './gold.js';
import {MAX_ITEM_LEVEL} from './equipment.js';
import {highestRarity} from './rarity.js';

const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const levelRange=(level,low,high)=>({min:Math.min(MAX_ITEM_LEVEL,level+low),max:Math.min(MAX_ITEM_LEVEL,level+high)});

// Returns null outside a pending supported choice or for malformed quote data.
// The app already owns a validated save; this is not another save validator.
// Unaffordable choices still explain odds, but have no invented after-balance.
export function eventRiskPreview(s,choiceId='roll') {
 try {
  const e=s?.event,p=s?.player;
  if(s?.phase!=='event'||!record(e)||e.status!=='pending'||!record(p)||
   !integer(s.floor,1,Number.MAX_SAFE_INTEGER)||!integer(p.level,1,1e6)||
   !integer(p.gold,0,GOLD_CAP)||!integer(e.costGold,0,1e8)||
   !record(p.talents)||!record(p.equipped)||!Array.isArray(p.items)||
   !Array.isArray(s.fate)||s.fate.length!==2||!s.fate.every(n=>integer(n,1,6)))return null;
  if(e.key==='gambit'?!['roll','safe'].includes(choiceId):e.key!=='wishingvault'||choiceId!=='roll')return null;
  const choice=eventChoices(s).find(option=>option.id===choiceId);
  if(!choice)return null;
  const odds=diceOdds(s),faces=[...odds.faces];
  if(!integer(odds.luck,0,200)||faces.length!==6||!faces.every(n=>Number.isFinite(n)&&n>=0&&n<=1)||Math.abs(faces.reduce((a,b)=>a+b,0)-1)>1e-10)return null;
  const costGold=e.costGold*(choiceId==='safe'?2:1),available=!choice.disabled&&p.gold>=costGold;
  const goldAfterPayment=available?p.gold-costGold:null,groups=[];
  const group=(key,rollLabel,probability,minimum)=>groups.push({key,rollLabel,probability,minimum});
  if(choiceId==='safe')group('rare','无需投骰',1,1);
  else if(e.key==='gambit'){
   group('refund','1–2 点',faces[0]+faces[1],null);
   group('rare','3–4 点',faces[2]+faces[3],1);
   group('epic','5–6 点',faces[4]+faces[5],2);
  }else{
   const probabilities=[0,0,0];
   // The real wish invokes die() twice, each drawDice(state, 1). There is no
   // second-face echo draw here; multiplying these single-die marginals is exact.
   for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)probabilities[a+b<=5?0:a+b<=9?1:2]+=faces[a-1]*faces[b-1];
   group('refund','总点 2–5',probabilities[0],null);
   group('epic','总点 6–9',probabilities[1],2);
   group('legendary','总点 10–12',probabilities[2],3);
  }
  const pools=new Map();
  const rewardProbabilities=minimum=>{
   const result=Array(8).fill(0);
   // The older gambler's helper replaces the prize with exactly the stated
   // tier below floor 30. Wishes instead keep their vault draw and enforce a floor.
   if(e.key==='gambit'&&s.floor<30){result[minimum]=1;return result;}
   const source=e.key==='wishingvault'||minimum>=2?'vault':'chest';
   if(!pools.has(source))pools.set(source,dropOdds(s,source,source));
   for(const [rarity,probability] of pools.get(source).entries())result[Math.max(minimum,rarity)]+=probability;
   return result;
  };
  const outcomes=groups.map(({key,rollLabel,probability,minimum})=>{
   const rawGold=minimum===null?Math.floor(costGold/2):0;
   // Refunds arrive AFTER payment, so a valid half-refund cannot be cut off by
   // the starting gold cap. Keep the shared receipt semantics for zero prices too.
   const receipt=available?goldPreview(goldAfterPayment,rawGold):null;
   const rarityProbabilities=minimum===null?Array(8).fill(0):rewardProbabilities(minimum);
   const rarityCeiling=minimum===null?null:rarityProbabilities.findLastIndex(n=>n>0);
   const itemLevelRange=minimum===null?null:e.key==='gambit'?levelRange(p.level,3,7):levelRange(p.level,1,minimum===3?7:5);
   return {key,rollLabel,probability,rarityFloor:minimum,rarityCeiling,rarityProbabilities,itemLevelRange,
    refund:{rawGold,credited:receipt?.credited??null,overflow:receipt?.overflow??null},
    goldAfterChoice:receipt?.after??null,netCostGold:receipt?p.gold-receipt.after:null};
  });
  const range=key=>available?{min:Math.min(...outcomes.map(row=>row[key])),max:Math.max(...outcomes.map(row=>row[key]))}:null;
  return {key:e.key,choiceId,available,reason:available?'':choice.reason||'金币不足',diceCount:choiceId==='safe'?0:e.key==='gambit'?1:2,
   usesEcho:false,luck:odds.luck,faces,costGold,goldBefore:p.gold,goldAfterPayment,unlockedRarity:highestRarity(s.floor),
   outcomes,balanceRange:range('goldAfterChoice'),netCostRange:range('netCostGold'),
   settlement:'choice-only',chestGoldIncluded:false};
 }catch{return null;}
}
