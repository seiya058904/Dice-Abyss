import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||'/workspace/scratch/f0146b2cbcc6/baseline/Dice-Abyss');
const out=resolve(process.argv[3]||'/workspace/scratch/f0146b2cbcc6/analysis/independent/baseline-event-ui.json');
const load=file=>import(pathToFileURL(resolve(root,file)));
const [E,S,C,V,P,F]=await Promise.all(['src/engine.js','src/storage.js','src/encounters.js','src/views.js','src/event-preview.js','scripts/audit-event-context.mjs'].map(load));
const BaselineStorage=await import(pathToFileURL('/workspace/scratch/f0146b2cbcc6/baseline/Dice-Abyss/src/storage.js'));
const api={E,S,C,V};
function fixture(key){
  for(let seed=18018;seed<18318;seed++){
    const s=F.eventFixture(api,C.EVENT_ROOMS.has(key)?key:'mystery',{seed,floor:140,rich:true});
    if(s.event.key===key)return s;
  }
  throw Error(`Could not generate ${key}`);
}
const capture=(name,s,id='accept')=>{
  s.independentAudit={nested:{unicode:'完整未知字段 😀',keep:[true,17,{value:'unknown'}]}};
  s.event.independentAudit={keep:['event',s.event.key]};
  for(const item of s.player.items)item.independentAudit={keep:[item.id,{value:'original'}]};
  const before=structuredClone(s),raw=BaselineStorage.encodeSave(s),valid=S.validateSave(s);
  let encodedByAuditedSource=false,encodeError='',decoded=false,decodeError='',quote=null,previewError='',html='',renderError='',after=null,transitionError='';
  try { encodedByAuditedSource=S.encodeSave(s)===raw; } catch(e) { encodeError=e.message; }
  try { decoded=JSON.stringify(S.decodeSave(raw))===JSON.stringify(s); } catch(e) { decodeError=e.message; }
  try { quote=P.eventChoicePreview(s,id); } catch(e) { previewError=e.message; }
  try { html=V.center(s,{view:'game',busy:false}); } catch(e) { renderError=e.message; }
  const choice=C.eventChoices(s).find(o=>o.id===id);
  try { after=E.transition(s,{type:'event-choice',id,confirmed:true}); } catch(e) {transitionError=e.message;}
  const offered=s.player.items.find(i=>i.id===s.event.offerId),target=s.player.items.find(i=>i.id===s.event.targetId);
  assert.deepEqual(s,before,`${name}: read-only audit never changes input`);
  const left=E.transition(s,{type:'event-choice',id:'leave'});
  const unknownPreserved=after&&JSON.stringify(after.independentAudit)===JSON.stringify(s.independentAudit)&&JSON.stringify(after.event.independentAudit)===JSON.stringify(s.event.independentAudit)&&after.player.items.every(item=>JSON.stringify(item.independentAudit)===JSON.stringify(s.player.items.find(old=>old.id===item.id)?.independentAudit));
  const row={name,event:s.event.key,valid,encodedByAuditedSource,encodeError,decoded,decodeError,offerId:s.event.offerId,targetId:s.event.targetId,offered:offered?{id:offered.id,name:offered.name,slot:offered.slot,enhance:offered.enhance}:null,target:target?{id:target.id,name:target.name,slot:target.slot,level:target.level,enhance:target.enhance,locked:target.locked}:null,choice,quote,previewError,renderError,transitionError,accepted:after!==null&&after!==s,afterValid:after&&S.validateSave(after),targetSurvives:after&&after.player.items.some(i=>i.id===s.event.targetId),inventoryCountBefore:s.player.items.length,inventoryCountAfter:after?.player.items.length,maxHpBefore:E.stats(s).maxHp,maxHpAfter:after&&E.stats(after).maxHp,legacyTextEqualityMatches:!!(offered&&choice?.cost===offered.name),markupSaysMissing:html.includes('已不存在的装备'),markupShowsUnnamedFallback:/未命名(?:旧物|装备)/.test(html),leaveAvailable:C.eventChoices(s).some(o=>o.id==='leave'&&!o.disabled),leavePreservesAssets:JSON.stringify(left.player)===JSON.stringify(s.player)&&left.rng===s.rng,unknownPreserved};
  return row;
};
const results=[];
for(const key of ['hollow_scale','silent_anvil']){
  for(const slot of ['armor','relic']){const s=fixture(key);s.event.targetId=s.player.equipped[slot];results.push(capture(`${key}/nonweapon-${slot}`,s));}
  const s=fixture(key),target=s.player.items.find(i=>i.id===s.event.targetId),replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);
  let changed=E.transition(s,{type:'equip',id:replacement.id});changed=E.transition(changed,{type:'lock',id:target.id});results.push(capture(`${key}/registered-weapon-swapped-and-locked`,changed));
}
{
  const s=fixture('silent_anvil'),target=s.player.items.find(i=>i.id===s.event.targetId);target.enhance=5;
  const replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);const changed=E.transition(s,{type:'equip',id:replacement.id});changed.event.offerId=target.id;
  results.push(capture('silent_anvil/same-id-consumes-upgrade-target',changed));
}
for(const key of ['exchange','relic_exchange','silent_anvil','offering','relicloom']){
  const s=fixture(key);s.player.items.find(i=>i.id===s.event.offerId).name='';results.push(capture(`${key}/unnamed-offer`,s,key==='exchange'?'salvage':'accept'));
}
{
  const s=fixture('exchange');s.player.items.find(i=>i.id===s.event.offerId).name='无';const html=V.center(s,{view:'game',busy:false});
  const options=[...html.matchAll(/<button[^>]*data-id="([^"]+)"[^>]*>(.*?)<\/button>/gs)].map(m=>({id:m[1],html:m[2]}));
  results.push({...capture('exchange/offer-name-is-free-cost-label',s,'salvage'),leaveMarkup:options.find(o=>o.id==='leave')?.html||null});
}
for(const key of ['hollow_scale','silent_anvil']){
  const s=fixture(key);s.event.targetId=[s.event.targetId];results.push(capture(`${key}/array-target-reference`,s));
}
await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify({root,constructedFixture:true,notNaturalFrequencyClaim:true,results},null,2)+'\n');
console.log(JSON.stringify({out,rows:results.map(({name,valid,decoded,accepted,afterValid,markupSaysMissing,legacyTextEqualityMatches,maxHpBefore,maxHpAfter,leavePreservesAssets,targetSurvives,unknownPreserved})=>({name,valid,decoded,accepted,afterValid,markupSaysMissing,legacyTextEqualityMatches,maxHpBefore,maxHpAfter,leavePreservesAssets,targetSurvives,unknownPreserved}))},null,2));
