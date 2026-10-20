// Entry reserves exact equipment IDs. A later swap, lock or salvage may make
// the recorded payment unavailable; none is permission to pick a replacement.
// Keep those recoverable states readable. Only contradictions which normal
// inventory actions cannot create invalidate a pending event's references.
// 1 = consumed material; 2 = retained upgrade target. Choice and display code
// share this exact authority table instead of inferring roles from prose.
const eventRoles={exchange:{salvage:1,relic:1},relic_exchange:{accept:1},silent_anvil:{accept:3},offering:{accept:1},relicloom:{accept:1},hollow_scale:{accept:2}};
const issued=(id,nextId)=>Number.isSafeInteger(nextId)&&typeof id==='string'&&/^i\d+$/.test(id)&&Number.isSafeInteger(Number(id.slice(1)))&&Number(id.slice(1))>=0&&Number(id.slice(1))<nextId;

export function eventReferenceRoles(s,choiceId) {
 const e=s?.event,choices=e?.status==='pending'&&typeof e.key==='string'&&Object.hasOwn(eventRoles,e.key)?eventRoles[e.key]:null;
 const roles=!choices?0:choiceId===undefined?Object.values(choices).reduce((mask,role)=>mask|role,0):typeof choiceId==='string'&&Object.hasOwn(choices,choiceId)?choices[choiceId]:0;
 return {usesOffer:!!(roles&1),usesTarget:!!(roles&2)};
}

export function eventReferenceIssue(s) {
 const e=s?.event;
 if(!e||e.status!=='pending')return null;
 const {usesOffer:material,usesTarget:weapon}=eventReferenceRoles(s);
 if(!material&&!weapon)return null;
 if(e.key==='silent_anvil'&&e.offerId!=null&&e.offerId===e.targetId)return {code:'offer-target-collision',message:'登记的升级目标与待消耗旧物指向同一件装备，不能安全结算。'};
 for(const [needed,id,role,label]of [[material,e.offerId,'offer','旧物'],[weapon,e.targetId,'target','武器目标']]){
  // Null records that entry did not reserve an item. Previously issued but
  // missing IDs may have been legally salvaged; availability handles both.
  if(needed&&id!=null&&!issued(id,s.nextId))return {code:`invalid-${role}-id`,message:`登记的${label} ID 不属于本局已分配的物品，不能猜测替代装备。`};
 }
 if(!Array.isArray(s?.player?.items))return null;
 let offeredCount=0,targetCount=0,target;
 for(const item of s.player.items){
  if(!item)continue;
  if(material&&e.offerId!=null&&item.id===e.offerId)offeredCount++;
  if(weapon&&e.targetId!=null&&item.id===e.targetId){targetCount++;target=item;}
 }
 if(offeredCount>1)return {code:'duplicate-offer-id',message:'登记的旧物 ID 对应多件库存装备，不能确定应消耗哪一件。'};
 if(targetCount>1)return {code:'duplicate-target-id',message:'登记的武器目标 ID 对应多件库存装备，不能确定应升级哪一件。'};
 // The registered weapon remains the target after swapping or locking it.
 // Locks protect consumption, not upgrades; current equipment is not a proxy
 // for the entry record, and a missing target must not be retargeted.
 if(target&&target.slot!=='weapon')return {code:'target-not-weapon',message:'登记的升级目标不是武器，与本次事件的武器升级不一致。'};
 return null;
}
