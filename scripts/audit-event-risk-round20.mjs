import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

// Optional, standard-library-only QA. No game state is changed by this script;
// it creates labelled synthetic states, then invokes the real engine on copies.
// --source defaults to this complete project's root; --output is a file prefix.
const args=process.argv.slice(2),options={},positional=[];
for(let i=0;i<args.length;i++){
 const arg=args[i];if(!arg.startsWith('--')){positional.push(arg);continue;}
 const match=arg.match(/^--(source|output)(?:=(.*))?$/);
 if(match){const value=match[2]??args[++i];if(!value||value.startsWith('--'))throw Error(`Missing --${match[1]} value`);options[match[1]]=value;}
 else if(arg==='--require-preview')options.requirePreview=true;
 else if(arg==='--help')options.help=true;
 else throw Error(`Unknown argument: ${arg}`);
}
if(options.help){console.log('Usage: node scripts/audit-event-risk-round20.mjs [--source=/path/to/project] [--output=/tmp/dice-risk] [--require-preview]\nOutputs: <prefix>.json.gz (complete results) and <prefix>-summary.json. Baseline without the new model is supported unless --require-preview is set.');process.exit(0);}
const root=resolve(options.source||positional[0]||resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const output=resolve(options.output||positional[1]||resolve(tmpdir(),'dice-event-risk-round20'));
const imp=p=>import(pathToFileURL(resolve(root,p)));
const [E,S,C,R,H,V]=await Promise.all(['src/engine.js','src/storage.js','src/encounters.js','src/rarity.js','scripts/audit-event-context.mjs','src/views.js'].map(imp));
const preview=existsSync(resolve(root,'src/event-risk.js'))?(await imp('src/event-risk.js')).eventRiskPreview:null;
if(options.requirePreview)assert.equal(typeof preview,'function','--require-preview requires the new model');
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const dependencies=['src/engine.js','src/storage.js','src/encounters.js','src/deep-rules.js','src/rarity.js','src/gold.js','src/equipment.js','src/views.js','scripts/audit-event-context.mjs',...(preview?['src/event-risk.js']:[])];
const sourceBefore=Object.fromEntries(await Promise.all(dependencies.map(async p=>[p,sha(await readFile(resolve(root,p),'utf8'))])));
const rows=[],boundaries=[],snapshots=[],viewRows=[];
const counts={representatives:0,allFaceGroups:0,settlementCases:0,codecPairs:0,quoteChecks:0,guardChecks:0,transactionChecks:0,viewCases:0};
const close=(a,b)=>assert(Math.abs(a-b)<1e-11,`${a} != ${b}`);
// An independently written closed-form table cross-checks the model's helper
// composition. It covers the two actual sources, their floor gates and the
// event minimum transform; it does not call dropOdds/rarityProbabilities.
function conditionalRarities(s,minimum){
 const expected=Array(8).fill(0);
 if(s.event.key==='gambit'&&s.floor<30){expected[minimum]=1;return expected;}
 const vault=s.event.key==='wishingvault'||minimum>=2,factor=vault?4:1;
 const specs=[[30,.008,.042,65],[50,.003,.027,85],[80,.0015,.0165,140],[140,.0007,.0093,260]];
 for(let i=0;i<4;i++){const [unlock,start,gain,ramp]=specs[i];if(s.floor>=unlock)expected[i+4]=(start+gain*Math.min(1,(s.floor-unlock)/ramp))*factor;}
 const total=expected.reduce((a,b)=>a+b,0);if(total>.55)for(let r=4;r<8;r++)expected[r]*=.55/total;
 const remaining=1-expected.reduce((a,b)=>a+b,0),base=Array(4).fill(0);
 if(vault){base[2]=.7;base[3]=.3;}
 else{
  const luck=E.diceOdds(s).luck,fate=(s.fate[0]+s.fate[1]-2)/10;
  const legend=.012+Math.min(.12,s.floor*.002)+fate*.008+luck*.00015,epic=.12+fate*.08,rare=.48+fate*.15;
  base[3]=legend;base[2]=Math.max(0,epic-legend);base[1]=Math.max(0,rare-Math.max(legend,epic));base[0]=1-Math.max(legend,epic,rare);
 }
 for(let rarity=0;rarity<4;rarity++)expected[Math.max(minimum,rarity)]+=base[rarity]*remaining;
 return expected;
}
function fixture(key,floor=140,boost=false){
 const s=H.eventFixture({E,S},key,{seed:19020,floor,rich:true,spares:false});
 s.runId=`independent-risk-${key}-${floor}-${boost}`;
 s.auditRisk={preserved:{label:'full unknown state',values:[1,null,{text:'不改变'}]}};
 s.event.auditRisk={old:'preserved event metadata'};
 s.player.items[0].auditRisk={values:['old equipment',1]};
 if(boost){s.nextLuck=24;s.eventLuck=20;s.player.fateBlessings=5;s.player.talents.luck=5;s.player.talents.attune=5;}
 assert(S.validateSave(s));return s;
}
const faceKey=s=>s.event.key==='gambit'?String(s.event.roll):s.event.rolls.join(',');
function verifyQuote(s,choice='roll'){
 if(!preview)return null;
 const before=S.encodeSave(s),q=preview(s,choice);assert(q);assert.equal(S.encodeSave(s),before);
 const choiceDef=C.eventChoices(s).find(o=>o.id===choice);assert.equal(q.available,!choiceDef.disabled);
 const L=E.diceOdds(s).luck,t=1.5*L/(L+40),a=1+t,b=1+1.4*t,Z=4+a+b;
 const expected=choice==='safe'?[1]:s.event.key==='gambit'?[2/Z,2/Z,(a+b)/Z]:[10/(Z*Z),1-(10+2*b+(a+b)**2)/(Z*Z),(2*b+(a+b)**2)/(Z*Z)];
 q.outcomes.forEach((r,i)=>close(r.probability,expected[i]));close(q.outcomes.reduce((n,r)=>n+r.probability,0),1);
 assert.equal(q.usesEcho,false);assert.equal(q.chestGoldIncluded,false);assert.equal(q.settlement,'choice-only');
 assert.equal(q.costGold,s.event.costGold*(choice==='safe'?2:1));
 for(const row of q.outcomes){
  if(row.rarityFloor===null){assert(row.rarityProbabilities.every(n=>n===0));continue;}
  close(row.rarityProbabilities.reduce((a,b)=>a+b,0),1);
  row.rarityProbabilities.forEach((probability,rarity)=>close(probability,conditionalRarities(s,row.rarityFloor)[rarity]));
  for(let rarity=0;rarity<8;rarity++)if(rarity<row.rarityFloor||rarity>R.highestRarity(s.floor))assert.equal(row.rarityProbabilities[rarity],0);
 }
 if(!q.available){assert.equal(q.goldAfterPayment,null);assert.equal(q.balanceRange,null);assert.equal(q.netCostRange,null);assert(q.outcomes.every(r=>r.goldAfterChoice===null&&r.netCostGold===null&&r.refund.credited===null));}
 counts.quoteChecks++;return q;
}
function settle(s,choice='roll'){
 const before=S.encodeSave(s),q=verifyQuote(s,choice),cost=s.event.costGold*(choice==='safe'?2:1);
 const action={type:'event-choice',id:choice,confirmed:true};
 assert.strictEqual(E.transition(s,{...action,confirmed:false}),s);counts.guardChecks++;
 const after=E.transition(s,action);assert.notStrictEqual(after,s);assert.equal(S.encodeSave(s),before);
 assert(S.validateSave(after));assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);assert.deepEqual(S.decodeSave(before),s);counts.codecPairs++;
 assert.equal(after.event.status,'resolved');assert.equal(after.nextLuck,s.nextLuck);
 assert.deepEqual(after.auditRisk,s.auditRisk);assert.deepEqual(after.event.auditRisk,s.event.auditRisk);assert.deepEqual(after.player.items,s.player.items);
 assert.strictEqual(E.transition(after,action),after);counts.guardChecks++;
 if(preview){assert.equal(preview(after,choice),null);counts.quoteChecks++;}
 const rolled=s.event.key==='gambit'?after.event.roll:after.event.rolls.reduce((a,b)=>a+b,0);
 const refund=choice==='safe'?false:s.event.key==='gambit'?rolled<=2:rolled<=5;
 const minimum=choice==='safe'?1:s.event.key==='gambit'?(rolled>=5?2:1):(rolled>=10?3:2);
 const rawRefund=refund?Math.floor(cost/2):0;
 assert.equal(after.player.gold,s.player.gold-cost+rawRefund);
 assert.equal(after.phase,refund?'event':'chest');
 if(!refund){assert(after.chest.item.rarity>=minimum);assert(after.chest.item.rarity<=R.highestRarity(s.floor));if(s.event.key==='gambit'&&s.floor<30)assert.equal(after.chest.item.rarity,minimum);}
 if(q){
  const branch=q.outcomes.find(r=>refund?r.key==='refund':r.rarityFloor===minimum);assert(branch);
  assert.equal(branch.goldAfterChoice,after.player.gold);assert.equal(branch.netCostGold,s.player.gold-after.player.gold);assert.equal(branch.refund.credited,rawRefund);assert.equal(branch.refund.overflow,0);
  if(!refund){assert(branch.rarityProbabilities[after.chest.item.rarity]>0);if(branch.itemLevelRange)assert(after.chest.item.level>=branch.itemLevelRange.min&&after.chest.item.level<=branch.itemLevelRange.max);}
  counts.quoteChecks++;
 }
 counts.settlementCases++;
 return {after,row:{key:s.event.key,floor:s.floor,boost:s.nextLuck>0,choice,cost,beforeGold:s.player.gold,afterGold:after.player.gold,refund:rawRefund,face:choice==='safe'?null:faceKey(after),rngStart:s.rng,rngEnd:after.rng,rarity:refund?null:after.chest.item.rarity,itemLevel:refund?null:after.chest.item.level,nextLuckBefore:s.nextLuck,nextLuckAfter:after.nextLuck,beforeSha256:sha(before),afterSha256:sha(S.encodeSave(after))}};
}
function representatives(s){
 const target=s.event.key==='gambit'?6:36,seen=new Map();
 for(let i=1;i<=10000&&seen.size<target;i++){
  const candidate=structuredClone(s);candidate.rng=((i*2654435761)>>>0)||1;
  const after=E.transition(candidate,{type:'event-choice',id:'roll',confirmed:true}),key=faceKey(after);
  if(!seen.has(key))seen.set(key,candidate);
 }
 assert.equal(seen.size,target);counts.allFaceGroups++;
 return [...seen].sort((a,b)=>a[0].localeCompare(b[0])).map(([,s])=>s);
}
function auditView(s,choice='roll'){
 if(!preview||typeof V.eventRiskView!=='function')return;
 const before=S.encodeSave(s),q=verifyQuote(s,choice),html=V.eventRiskView(s,choice),summary=V.eventRiskChoiceSummary(s,choice);
 assert(html.includes(`data-event-risk="${s.event.key}"`));assert(html.includes(`data-risk-choice="${choice}"`));
 assert(!/\b(?:NaN|undefined|null)\b/.test(html+summary));
 assert(html.includes('宝箱金币在开箱时另行结算'));
 const percent=n=>n===0?'0%':n<.0001?'&lt;0.01%':`${(n*100).toFixed(2)}%`;
 const detail=html.match(/<details class="event-risk-distribution">([\s\S]*?)<\/details>/)?.[1];assert(detail);
 assert(detail.includes('达到对应点数后'));assert(detail.includes('条件概率'));
 const pools=q.outcomes.filter(row=>row.rarityFloor!==null);
 if(choice==='roll'&&s.event.key==='gambit')pools.push(preview(s,'safe').outcomes[0]);
 const rarityRows=[...detail.matchAll(/<tr><th scope="row"[^>]*>[\s\S]*?<\/th>([\s\S]*?)<\/tr>/g)];assert.equal(rarityRows.length,8);
 rarityRows.forEach((match,rarity)=>{
  const cells=[...match[1].matchAll(/<td>(.*?)<\/td>/g)].map(match=>match[1]);assert.equal(cells.length,pools.length);
  cells.forEach((cell,index)=>assert.equal(cell,percent(pools[index].rarityProbabilities[rarity])));
 });
 for(const outcome of q.outcomes){
  const body=html.match(new RegExp(`<tr data-risk-outcome="${outcome.key}">([\\s\\S]*?)<\\/tr>`))?.[1];assert(body);
  assert(body.includes(percent(outcome.probability)));
  if(q.available)assert(body.includes(`余额 ${V.goldNum(outcome.goldAfterChoice)}`));
  else assert(!body.includes('余额 '));
  if(outcome.key==='refund')assert(body.includes(`返还 ${V.goldNum(outcome.refund.rawGold)} 金币`));
 }
 if(!q.available)assert(summary.includes(`还差 ${V.goldNum(q.costGold-q.goldBefore)} 金币`));
 else{assert(summary.includes('净支出'));assert(summary.includes('选择后余额'));}
 assert.equal(S.encodeSave(s),before);
 viewRows.push({key:s.event.key,choice,price:s.event.costGold,held:s.player.gold,luck:q.luck,htmlSha256:sha(html),summarySha256:sha(summary)});counts.viewCases++;
}

for(const key of ['gambit','wishingvault'])for(const boost of [false,true]){
 const s=fixture(key,140,boost),states=representatives(s);
 for(const state of states){rows.push(settle(state).row);counts.representatives++;}
 // All six / 36 results are retained, including refund and lower guarantee.
 for(const floor of [1,29,30,49,50,79,80,139,400])for(const candidate of states.filter((s,i)=>i%7===0)){
  const atFloor=fixture(key,floor,boost);atFloor.rng=candidate.rng;rows.push(settle(atFloor).row);
 }
 if(key==='gambit')for(const floor of [1,29,30,49,50,79,80,139,140,400])rows.push(settle(fixture(key,floor,boost),'safe').row);
 for(const price of [0,1,835,100000000])for(const held of [0,price,2*price,E.GOLD_CAP]){
  const edge=structuredClone(states[0]);edge.event.costGold=price;edge.player.gold=held;assert(S.validateSave(edge));
  for(const choice of key==='gambit'?['roll','safe']:['roll']){
   const q=verifyQuote(edge,choice),cost=price*(choice==='safe'?2:1),before=S.encodeSave(edge);
   if(held<cost){assert.equal(q?.available??false,false);assert.strictEqual(E.transition(edge,{type:'event-choice',id:choice,confirmed:true}),edge);assert.equal(S.encodeSave(edge),before);counts.guardChecks++;boundaries.push({key,boost,price,held,choice,available:false});}
   else{const {after,row}=settle(edge,choice);boundaries.push({...row,available:true});}
  }
 }
 // Price is stored on entry; a later legal imported level must not reprice it.
 const changed=structuredClone(states[0]);changed.player.level=101;changed.player.hp=Math.min(changed.player.hp,E.stats(changed).maxHp);assert(S.validateSave(changed));
 const {row}=settle(changed);assert.equal(row.cost,s.event.costGold);boundaries.push({...row,case:'stored-price-after-level-change'});
 const quoteInput=structuredClone(states[0]);
 if(preview){
  const guarded=Object.create(Object.getPrototypeOf(quoteInput),Object.getOwnPropertyDescriptors(quoteInput));Object.defineProperty(guarded,'rng',{get(){throw Error('preview must not inspect RNG');}});assert(preview(guarded));counts.quoteChecks++;
  for(const phase of ['route','chest','loot','dead','cleared']){assert.equal(preview({...quoteInput,phase}),null);counts.quoteChecks++;}
  const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};assert(preview(freeze(structuredClone(quoteInput))));counts.quoteChecks++;
 }
 // Exercise the unchanged full storage transaction with unknown fields.
 const next=settle(states[0]).after,original=S.encodeSave(states[0]);
 for(const failure of ['primary','mirror','stale-unknown']){
  const map=new Map([[S.SAVE_KEY,original],[S.BACKUP_KEY,original]]),writes=[];
  const store={getItem:k=>map.get(k)??null,setItem(k,v){writes.push(k);if((failure==='primary'&&k===S.SAVE_KEY)||(failure==='mirror'&&k===S.BACKUP_KEY))throw Error('synthetic quota');map.set(k,v);}};
  if(failure==='stale-unknown'){
   const disk=structuredClone(states[0]);disk.auditRisk.preserved.values.push('other tab');const raw=S.encodeSave(disk);map.set(S.SAVE_KEY,raw);map.set(S.BACKUP_KEY,raw);assert.throws(()=>S.saveGame(next,states[0],store),/另一窗口/);assert.deepEqual(writes,[]);assert.equal(map.get(S.SAVE_KEY),raw);
  }else if(failure==='primary'){assert.throws(()=>S.saveGame(next,states[0],store),/无法保存/);assert.equal(map.get(S.SAVE_KEY),original);assert.equal(map.get(S.BACKUP_KEY),original);}
  else{const result=S.saveGame(next,states[0],store);assert.equal(result.mirrored,false);assert.equal(map.get(S.SAVE_KEY),S.encodeSave(next));assert.equal(map.get(S.BACKUP_KEY),original);assert.deepEqual(S.loadSave(store).state,next);}
  counts.transactionChecks++;
 }
 snapshots.push({key,boost,before:states[0],after:next});
 if(preview&&typeof V.eventRiskView==='function'){
  for(const [price,held]of [[835,E.GOLD_CAP],[835,0],[1,1],[100000000,E.GOLD_CAP]]){
   const viewed=structuredClone(s);viewed.event.costGold=price;viewed.player.gold=held;
   for(const choice of key==='gambit'?['roll','safe']:['roll'])auditView(viewed,choice);
  }
  // A real legal equip while this event remains pending changes the current
  // odds; returning to the room uses those values while its saved price stays.
  const equippedInput=structuredClone(s);let spare;
  for(let i=0;i<100;i++){spare=E.makeItem(equippedInput,'relic',7);if(E.itemStats(spare).luck>0)break;}
  assert(E.itemStats(spare).luck>0);equippedInput.player.items.push(spare);assert(S.validateSave(equippedInput));
  const initialQuote=preview(equippedInput),equipped=E.transition(equippedInput,{type:'equip',id:spare.id,slot:'relic'});
  assert.notStrictEqual(equipped,equippedInput);assert(S.validateSave(equipped));
  const changedQuote=preview(equipped);assert.notEqual(initialQuote.luck,changedQuote.luck);assert.equal(initialQuote.costGold,changedQuote.costGold);
  auditView(equipped);assert.equal(V.eventRiskView(next),'');counts.viewCases++;
 }
}
const sourceHashes=Object.fromEntries(await Promise.all(dependencies.map(async p=>[p,sha(await readFile(resolve(root,p),'utf8'))])));
assert.deepEqual(sourceHashes,sourceBefore,'source dependencies must remain identical during this independent sweep');
const results={rows,boundaries,snapshots};
const report={at:new Date().toISOString(),root,previewIncluded:!!preview,counts,sourceHashes,sourceStable:true,scriptSha256:sha(await readFile(new URL(import.meta.url),'utf8')),resultsSha256:sha(results),viewRows,passed:true,scope:'Validator-accepted constructed fixtures and complete six-face / 36 ordered-pair coverage. Fixed deterministic initial RNG scanning selects all branches, not a natural policy, probability Monte Carlo or future-RNG product feature. All comparisons retain full unknown metadata. View checks inspect real returned HTML strings; they are not native-browser layout or focus checks.',results};
await mkdir(dirname(output),{recursive:true});await writeFile(output+'.json.gz',gzipSync(JSON.stringify(report,null,2)+'\n',{mtime:0}));
const summary={...report};delete summary.results;delete summary.viewRows;await writeFile(output+'-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
