import {DEEP_ROOMS,eraFor} from './deep-content.js';
// Pool mass is independent of number of members. First battle is always core.
export const POOL_WEIGHTS = {combat:{core:.55,special:.39,rare:.06},event:{core:.73,special:.23,rare:.04}};
const row=(type,slot,pool,floor=1,weight=1)=>({type,slot,pool,floor,weight});
export const ROOM_WEIGHTS = [
 row('combat','combat','core',1,10),row('armored','combat','core',2,2),row('berserker','combat','core',3,2),row('bandit','combat','core',2,2),
 ...Object.entries({elite:3,trial:3,leech:4,disruptor:5,mirror:7,gauntlet:6,duel:8,storm:6,cursed:9}).map(([k,f])=>row(k,'combat','special',f)),
 row('guardian','combat','rare',12,3),row('hiddenboss','combat','rare',15,1),
 ...['merchant','forge','fusion','rest'].map(k=>row(k,'service','core')),
 row('gold','event','core',1,3),row('chest','event','core',1,4),row('altar','event','core',1,2),row('spring','event','core',3,2),row('prayer','event','core',3,2),
 ...['gambit','exchange','mystery','blackmarket'].map(k=>row(k,'event','special',3)),row('vault','event','rare',3,3),
 ...Object.values(DEEP_ROOMS).map(r=>row(r.key,r.kind,['abyssking','archiveguard','wishingvault'].includes(r.key)?'rare':r.key==='parity'?'core':'special',r.floor,r.key==='parity'?1:1)),
 row('elite','endpoint','core'),row('boss','endpoint','core',5),
];
const serviceKeys=['merchant','forge','fusion','rest'];
const hiddenKeys=['hiddenboss','abyssking','archiveguard'];
export function roomEligible(s,type){
 if(!s.player)return true; // Standalone deterministic route audits have no inventory state.
 const spare=s.player.items.some(i=>i.rarity<3&&!i.locked&&!Object.values(s.player.equipped).includes(i.id)&&i.id!==s.loot?.item?.id);
 if(['offering','exchange'].includes(type)&&!spare)return false;
 if(type==='offering'&&(s.player.deepOfferings||0)>=20)return false;
 if(type==='relicloom'&&!s.player.items.some(i=>i.slot==='relic'&&i.rarity<3&&!i.locked&&!Object.values(s.player.equipped).includes(i.id)&&i.id!==s.loot?.item?.id))return false;
 if(type==='memorywell'&&!Object.values(s.player.talents).some(n=>n>0))return false;
 if(type==='echochamber'&&s.v5Boons?.echo)return false;
 if(type==='wardbank'&&s.v5Boons?.ward)return false;
 return true;
}
const weighted=(s,rows,random)=>{let r=random(s)*rows.reduce((n,x)=>n+x.weight,0);for(const row of rows){r-=row.weight;if(r<0)return row;}return rows.at(-1);};
export function weightedRoute(s,fate,random){
 const floor=s.floor,rich=fate[0]+fate[1]>=9,memory=s.routeMemory||{services:[],last:{},hiddenFloor:0};s.routeMemory=memory;
 const seen=new Set(),era=eraFor(floor);
 const draw=(slot,forceCore=false)=>{
  let tier=forceCore?'core':weighted(s,Object.entries(POOL_WEIGHTS[slot]).map(([pool,weight])=>({pool,weight})),random).pool;
  let eligible=ROOM_WEIGHTS.filter(r=>r.slot===slot&&r.floor<=floor&&roomEligible(s,r.type)&&(!hiddenKeys.includes(r.type)||!memory.hiddenFloor||floor-memory.hiddenFloor>=8));
  let candidates=eligible.filter(r=>r.pool===tier);
  if(!candidates.length){tier='core';candidates=eligible.filter(r=>r.pool===tier);}
  const fresh=candidates.filter(r=>!seen.has(r.type)&&(tier==='core'||floor-(memory.last[r.type]||-99)>=3));
  if(fresh.length)candidates=fresh;else {const once=candidates.filter(r=>!seen.has(r.type));if(once.length)candidates=once;}
  const result=weighted(s,candidates.map(r=>({...r,weight:r.weight*(era.favored.includes(r.type)?1.7:1)*(rich&&slot==='event'&&r.type==='chest'?1.25:1)})),random);
  seen.add(result.type);memory.last[result.type]=floor;if(hiddenKeys.includes(result.type))memory.hiddenFloor=floor;
  return {type:result.type,pool:tier,slot};
 };
 const combats=[draw('combat',true),draw('combat'),draw('combat')];
 if(!memory.services.length){memory.services=[...serviceKeys];for(let i=3;i>0;i--){const j=Math.floor(random(s)*(i+1));[memory.services[i],memory.services[j]]=[memory.services[j],memory.services[i]];}}
 const service=memory.services.shift();memory.last[service]=floor;
 const rooms=[combats[0],combats[1],{type:service,pool:'core',slot:'service'},combats[2],draw('event'),{type:floor%5===0?'boss':'elite',pool:'core',slot:'endpoint'}];
 s.encounterHistory=[...(s.encounterHistory||[]),...rooms.map(r=>r.type)].slice(-8);
 return rooms.map((r,i)=>{const waves=DEEP_ROOMS[r.type]?.waves||({gauntlet:3,duel:2}[r.type]||1);return {...r,id:`f${floor}r${i}`,done:false,quality:rich?1:0,...(waves>1?{wave:1,waves}:{})};});
}
