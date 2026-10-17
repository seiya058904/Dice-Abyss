// Single source of truth for unlocks, sources and deep reward probabilities.
export const RARITY_FLOORS = [1,1,1,1,30,50,80,140];
export const highestRarity = floor => RARITY_FLOORS.findLastIndex(n=>floor>=n);
const SOURCE_FACTORS = {combat:1,elite:2.5,trial:3,guardian:4,boss:5,hiddenboss:7,abyssking:7,archiveguard:7,vault:4,merchant:1.5,blackmarket:5,event:5,auction:6,bounty:3};
export function legacyRarity(roll,{floor,fate,luck=0},type){
 const fateLuck=fate?(fate[0]+fate[1]-2)/10:0;
 if(['boss','hiddenboss'].includes(type))return 3;
 if(type==='vault')return roll<.3?3:2;
 if(type==='trial')return roll<.12?3:2;
 if(roll<.012+Math.min(.12,floor*.002)+fateLuck*.008+luck*.00015+(['elite','guardian'].includes(type)?.025:0))return 3;
 if(roll<(type==='elite'?.55:.12+fateLuck*.08))return 2;
 if(roll<(type==='elite'?1:.48+fateLuck*.15))return 1;
 return 0;
}
export function deepProbabilities(floor,source='combat'){
 const multiplier=SOURCE_FACTORS[source]||1;
 const parameters=[[30,.008,.042,65],[50,.003,.027,85],[80,.0015,.0165,140],[140,.0007,.0093,260]];
 const result=Array(8).fill(0);
 for(let i=0;i<4;i++){const [unlock,start,gain,ramp]=parameters[i];if(floor>=unlock)result[i+4]=(start+gain*Math.min(1,(floor-unlock)/ramp))*multiplier;}
 const total=result.reduce((a,b)=>a+b,0);if(total>.55)for(let r=4;r<8;r++)result[r]*=.55/total;
 return result;
}
export function rollRarity(roll,context,source='combat',legacySource=source){
 if(context.floor<30)return legacyRarity(roll,context,legacySource);
 const chances=deepProbabilities(context.floor,source);let cumulative=0;
 for(let rarity=7;rarity>=4;rarity--){cumulative+=chances[rarity];if(roll<cumulative)return rarity;}
 return legacyRarity((roll-cumulative)/(1-cumulative),context,legacySource);
}
// Exact base probabilities; uses breakpoints rather than Monte Carlo.
export function rarityProbabilities(context,source='combat',legacySource=source){
 const fateLuck=context.fate?(context.fate[0]+context.fate[1]-2)/10:0;
 const boundaries=[0,1,.3,.12,.55,.012+Math.min(.12,context.floor*.002)+fateLuck*.008+(context.luck||0)*.00015+(['elite','guardian'].includes(legacySource)?.025:0),.12+fateLuck*.08,.48+fateLuck*.15].filter(n=>n>=0&&n<=1).sort((a,b)=>a-b);
 const deep=context.floor>=30?deepProbabilities(context.floor,source):Array(8).fill(0),remain=1-deep.reduce((a,b)=>a+b,0);
 for(let i=1;i<boundaries.length;i++){const a=boundaries[i-1],b=boundaries[i];deep[legacyRarity((a+b)/2,context,legacySource)]+=(b-a)*remain;}
 return deep;
}
