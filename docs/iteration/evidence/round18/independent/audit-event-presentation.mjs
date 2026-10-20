import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||'/workspace/scratch/f0146b2cbcc6/work/Dice-Abyss');
const output=resolve(process.argv[3]||'/workspace/scratch/f0146b2cbcc6/analysis/independent/event-presentation-current.json');
const load=f=>import(pathToFileURL(resolve(root,f)));
const [E,S,C,V,F]=await Promise.all(['src/engine.js','src/storage.js','src/encounters.js','src/views.js','scripts/audit-event-context.mjs'].map(load));
const api={E,S,C,V},rows=[];
function fixture(key){for(let seed=18218;seed<18518;seed++){const s=F.eventFixture(api,C.EVENT_ROOMS.has(key)?key:'mystery',{seed,floor:140,rich:true});if(s.event.key===key)return s;}throw Error(key);}
function check(name,fn){try{const detail=fn();rows.push({name,pass:true,...detail});}catch(error){rows.push({name,pass:false,error:error.message,stack:error.stack});}}
const frozen=s=>{s.audit={nested:['unchanged',{text:'未知字段 😀'}]};return S.encodeSave(s);};
const viewRoles=html=>[...html.matchAll(/data-event-item-role="([^"]+)"[^>]*data-event-item-id="([^"]+)"/g)].map(m=>({role:m[1],id:m[2]}));

for(const key of ['exchange','relic_exchange','silent_anvil','offering','relicloom'])check(`${key}: unnamed payment identity and confirmation`,()=>{
  const s=fixture(key),id=key==='exchange'?'salvage':'accept',offer=s.player.items.find(i=>i.id===s.event.offerId);offer.name='';
  const raw=frozen(s),choice=C.eventChoices(s).find(o=>o.id===id),card=V.eventItemsView(s),review=V.eventItemsView(s,id,{review:true}),cost=V.eventChoiceCost(s,choice);
  assert(!choice.disabled);assert(cost.includes(offer.id));assert(cost.includes(`+${offer.enhance}`));assert(cost.includes('Lv.'));
  assert(review.includes(offer.id));assert(review.includes('未命名'));assert(!review.includes('已不存在的装备'));
  assert(review.includes(V.itemProgress(offer)));assert(!review.includes('data-action="compare-details"'));assert(card.includes('data-action="compare-details"'));
  assert(viewRoles(review).some(r=>r.role==='consume'&&r.id===offer.id));assert.equal(S.encodeSave(s),raw);
  return {offerId:offer.id,roles:viewRoles(review),cost};
});
check('same names retain distinct material and weapon identities',()=>{
  const s=fixture('silent_anvil'),offer=s.player.items.find(i=>i.id===s.event.offerId),target=s.player.items.find(i=>i.id===s.event.targetId);
  offer.name=target.name='同名试验';const raw=frozen(s),review=V.eventItemsView(s,'accept',{review:true});
  assert.deepEqual(viewRoles(review),[{role:'consume',id:offer.id},{role:'retain',id:target.id}]);assert.equal(S.encodeSave(s),raw);
  return {roles:viewRoles(review)};
});
check('a gold-price name cannot turn prayer into an equipment payment',()=>{
  const s=fixture('prayer'),offer=s.player.items.find(i=>i.id===s.event.offerId),choice=C.eventChoices(s).find(o=>o.id==='luck');
  offer.name=choice.cost;const raw=frozen(s);assert.equal(V.eventItemsView(s,'luck',{review:true}),'');assert.equal(V.eventItemsView(s),'');
  assert.equal(V.eventChoiceCost(s,choice),choice.cost);assert.equal(S.encodeSave(s),raw);
  return {incidentalOfferId:offer.id,incidentalOfferName:offer.name,actualPayment:choice.cost};
});
check('safe leave has no equipment payment even when a material is named 无',()=>{
  const s=fixture('exchange'),offer=s.player.items.find(i=>i.id===s.event.offerId);offer.name='无';const raw=frozen(s),choice=C.eventChoices(s).find(o=>o.id==='leave');
  assert.equal(V.eventItemsView(s,'leave',{review:true}),'');assert.equal(V.eventChoiceCost(s,choice),'无');assert.equal(S.encodeSave(s),raw);
  return {offerId:offer.id};
});
check('locked and swapped registered weapon stays a retained target',()=>{
  let s=fixture('hollow_scale');const target=s.player.items.find(i=>i.id===s.event.targetId),replacement=E.makeItem(s,'weapon',0);s.player.items.push(replacement);
  s=E.transition(s,{type:'equip',id:replacement.id});s=E.transition(s,{type:'lock',id:target.id});const raw=frozen(s),review=V.eventItemsView(s,'accept',{review:true});
  assert.deepEqual(viewRoles(review),[{role:'retain',id:target.id}]);assert(review.includes('已锁定'));assert(!review.includes('不可作为消耗材料'));
  assert(!C.eventChoices(s).find(o=>o.id==='accept').disabled);assert.equal(S.encodeSave(s),raw);
  return {registered:target.id,current:s.player.equipped.weapon};
});
for(const key of ['exchange','offering','relicloom','silent_anvil'])for(const protect of ['lock','equip','remove'])check(`${key}: ${protect} exact material stays unavailable`,()=>{
  let s=fixture(key);const offerId=s.event.offerId,id=key==='exchange'?'salvage':'accept';
  s=E.transition(s,protect==='remove'?{type:'salvage',ids:[offerId]}:{type:protect,id:offerId});const raw=frozen(s),choice=C.eventChoices(s).find(o=>o.id===id),card=V.eventItemsView(s);
  assert(choice.disabled);assert.strictEqual(E.transition(s,{type:'event-choice',id,confirmed:true}),s);
  if(protect==='remove'){assert(card.includes('登记的装备已不在背包'));assert(!viewRoles(card).some(r=>r.role==='consume'));}
  else{assert(viewRoles(card).some(r=>r.role==='consume'&&r.id===offerId));assert(card.includes('不可作为消耗材料'));}
  assert.equal(S.encodeSave(s),raw);return {offerId,reason:choice.reason};
});
check('event item names are escaped in roles and comparison-button attributes',()=>{
  const s=fixture('silent_anvil'),offer=s.player.items.find(i=>i.id===s.event.offerId);offer.name='<img src=x onerror=alert(1)>"&';const raw=frozen(s),html=V.eventItemsView(s);
  assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert.equal(S.encodeSave(s),raw);return {escaped:true};
});
const sourceHashes=Object.fromEntries(await Promise.all(['src/views.js','src/app.js','src/event-references.js'].map(async f=>[f,createHash('sha256').update(await readFile(resolve(root,f))).digest('hex')])));
const report={status:rows.every(r=>r.pass)?'PASS':'FAIL',scope:'Independent generated HTML and engine-state checks; does not claim browser clicks, layout, focus or file-input behavior.',root,checks:rows.length,sourceHashes,rows};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:1;
