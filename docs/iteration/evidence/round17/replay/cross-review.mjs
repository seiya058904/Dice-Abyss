import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||'work/Dice-Abyss');
const E=await import(pathToFileURL(resolve(source,'src/engine.js')));
const S=await import(pathToFileURL(resolve(source,'src/storage.js')));
const C=await import(pathToFileURL(resolve(source,'src/encounters.js')));
const P=await import(pathToFileURL(resolve(source,'src/event-preview.js')));
const T=await import(pathToFileURL(resolve(source,'src/encounter-tactics.js')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tracked=['src/event-preview.js','src/encounter-tactics.js','src/engine.js','src/encounters.js','src/deep-rules.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(tracked.map(async file=>[file,sha(await readFile(resolve(source,file)))])));
const beforeHashes=await hashes(),keys=['spring','prayer','hollow_scale','silent_anvil','echochamber','wardbank'];
function fixture(key){
 for(let seed=1;seed<=300;seed++){
  let s=E.newGame(seed*7919);s.floor=140;s.player.level=42;s.player.gold=1e6;
  const spare=E.makeItem(s,'weapon',1);spare.enhance=7;s.player.items.push(spare);s.player.hp=E.stats(s).maxHp;
  s.phase='route';s.fate=[6,6];const type=['hollow_scale','silent_anvil'].includes(key)?'mystery':key;
  s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f140r${i}`,type,done:false,quality:0}));
  s=E.transition(s,{type:'enter'});assert(S.validateSave(s));if(s.event.key===key)return s;
 }
 throw Error('Missing fixture '+key);
}
const base=new Map(keys.map(key=>[key,fixture(key)]));
const variants=[
 ['unchanged',()=>{}],['gold-empty',s=>s.player.gold=0],['free-recorded-price',s=>s.event.costGold=0],
 ['maximum-recorded-price',s=>{s.event.costGold=1e8;s.player.gold=1e10;}],
 ['one-hp',s=>s.player.hp=1],['wounded',s=>s.player.hp=Math.max(1,Math.floor(E.stats(s).maxHp*.6))],
 ['ward-cap',s=>s.ward=1e15],['ward-above-heal',s=>s.ward=E.stats(s).maxHp*2],
 ['near-floor-caps',s=>{s.eventLuck=19;s.eventPower=29;s.nextLuck=24;}],
 ['floor-caps',s=>{s.eventLuck=20;s.eventPower=30;}],
 ['five-scars',s=>{s.player.pactScars=5;s.player.hp=E.stats(s).maxHp;}],
 ['four-scars',s=>{s.player.pactScars=4;s.player.hp=E.stats(s).maxHp;}],
 ['reserved-both',s=>s.v5Boons={echo:1,ward:1}],['old-missing-reserves',s=>delete s.v5Boons],
 ['near-equipment-cap',s=>{const item=s.player.items.find(i=>i.id===s.event.targetId);item.level=1e13-1;item.levelXp=17;item.enhance=19;s.player.hp=E.stats(s).maxHp;}],
 ['equipment-cap',s=>{const item=s.player.items.find(i=>i.id===s.event.targetId);item.level=1e13;item.levelXp=0;item.enhance=20;s.player.hp=E.stats(s).maxHp;}],
 ['unknown-metadata',s=>{s.extra={nested:[{label:'keep',value:12}]};s.player.extra={value:['keep']};s.player.items[0].extra={retained:true};}],
 ['current-protected-offer',s=>{const item=s.player.items.find(i=>i.id===s.event.offerId);if(item)item.locked=true;}],
 ['registered-armor-target',s=>{s.event.targetId=s.player.equipped.armor;s.player.hp=E.stats(s).maxHp;}],
];
function value(s,r){
 if(['hp','gold'].includes(r.key))return s.player[r.key];
 if(['maxHp','luck'].includes(r.key))return E.stats(s)[r.key];
 if(r.key==='ward')return s.ward||0;
 if(r.key==='eventLuck')return s.eventLuck||0;
 if(r.key==='eventPower')return (s.eventPower||0)/100;
 if(r.key==='inventoryCount')return s.player.items.length;
 if(r.key==='reservedWard')return s.v5Boons?.ward||0;
 if(r.key==='reservedEcho')return s.v5Boons?.echo||0;
 const fields={targetLevel:'level',targetLevelXp:'levelXp',targetEnhance:'enhance'};
 assert(fields[r.key]);return s.player.items.find(i=>i.id===r.targetId)[fields[r.key]];
}
let quotes=0,enabled=0,disabled=0,rowComparisons=0;
for(const [key,original]of base)for(const [variant,alter]of variants){
 const s=structuredClone(original);alter(s);assert(S.validateSave(s),`${key}/${variant} is a valid constructed state`);
 const serialized=S.encodeSave(s);
 for(const option of C.eventChoices(s).filter(o=>o.id!=='leave')){
  const q=P.eventChoicePreview(s,option.id);assert(q,`${key}/${variant}/${option.id}`);quotes++;
  assert.equal(q.available,!option.disabled);assert.equal(q.reason,option.disabled?option.reason:'');
  const after=E.transition(s,{type:'event-choice',id:option.id,confirmed:true});
  if(option.disabled){disabled++;assert.strictEqual(after,s);assert.deepEqual(q.rows,[]);}
  else{enabled++;assert(S.validateSave(after));assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
   for(const row of q.rows){rowComparisons++;assert.equal(row.before,value(s,row));assert.equal(row.after,value(after,row));assert.equal(row.delta,value(after,row)-value(s,row));}
   assert.equal(after.rng,s.rng);assert.equal(after.nextId,s.nextId);assert.equal(P.eventChoicePreview(after,option.id),null);
  }
  assert.equal(S.encodeSave(s),serialized,'read and apply preserve source bytes');
 }
}
const matches=(r,faces,best)=>{
 const sum=faces.reduce((a,b)=>a+b,0);
 switch(r.kind){case 'always':return true;case 'hasFace':return faces.includes(r.value);case 'lacksFace':return !faces.includes(r.value);case 'sameAtLeast':return best>=r.value;case 'allDistinct':return new Set(faces).size===faces.length;case 'sumAtLeast':return sum>=r.value;case 'sumAtMost':return sum<=r.value;case 'highAtLeast':return faces.filter(v=>v>=r.minFace).length>=r.value;default:throw Error('Unreviewed requirement '+r.kind);}
};
const arrays=[];for(let count=1;count<=6;count++){const rows=[];const visit=faces=>{if(faces.length===count){rows.push(faces);return;}for(let face=1;face<=6;face++)visit([...faces,face]);};visit([]);arrays.push(rows);}
const mechanics=['boss_sixseal','boss_choir','boss_tide','boss_cinder','boss_hourglass','boss_collector'];
let bossCases=0,reachabilityChecks=0;
for(const mechanic of mechanics)for(const turns of [0,1,2,3])for(const stage of [1,2])for(let count=1;count<=6;count++){
 const e={mechanic,type:'boss',combatRules:4,hp:500,maxHp:1001,shield:20,maxShield:121,turns,stage},st={maxHp:1001};
 const tactics=T.encounterTactics(e,count);assert(tactics);const reachable=tactics.lines.map(()=>false);
 for(const faces of arrays[count-1]){
  bossCases++;const best=Math.max(...faces.map(v=>faces.filter(x=>x===v).length));
  let damage=1,attack=1,pierce=0,ward=0,heal=0,baseAttack=1;
  for(let i=0;i<tactics.lines.length;i++){
   const line=tactics.lines[i];if(!matches(line.requirement,faces,best))continue;reachable[i]=true;
   const f=line.effects;damage*=f.damageMultiplier||1;attack*=f.attackMultiplier||1;pierce+=f.shieldPierce||0;ward+=Math.floor(st.maxHp*(f.wardFraction||0));baseAttack*=f.baseAttackMultiplier||1;
   if(f.enemyHealFraction)heal=Math.min(e.maxHp-e.hp,Math.ceil(e.maxHp*f.enemyHealFraction));
  }
  const mod=C.combatModifiers(e,faces,best,st),post=C.postRetaliation({...e,turns:turns+1},{values:faces,best},st);
  assert.equal(mod.damageMultiplier,damage);assert.equal(mod.attackMultiplier,attack);assert.equal(mod.shieldPierce,pierce);assert.equal(mod.wardGain,ward);
  assert.equal(C.extraEnemyAttack(e,101),Math.round(101*baseAttack));assert.equal(post.enemyHeal,heal);
 }
 tactics.lines.forEach((line,i)=>{reachabilityChecks++;assert.equal(line.possible,reachable[i],`${mechanic}/${turns}/${count}/${line.condition}`);});
}
const tide=C.postRetaliation({mechanic:'boss_tide',hp:500,maxHp:1001,shield:0,maxShield:121,turns:2},{values:[1,1,1],best:3},{maxHp:1001});
const tideQuote=T.encounterTactics({mechanic:'boss_tide',combatRules:4,hp:500,maxHp:1001,turns:1,stage:1},3);
const tideCopy=[...tideQuote.lines.map(line=>line.effect),tideQuote.note,tideQuote.next].join(' ');
const tideCopyResolved=tideCopy.includes('向上取整')&&!/最多.{0,20}3%/.test(tideCopy);
const afterHashes=await hashes();
const report={method:'Independent fixture builder, real committed event transitions and complete native-face enumeration; no author fixture or author numeric oracle is imported. Constructed registered-armor targets are validator-accepted compatibility cases, not claimed natural paths.',source,sourceHashes:beforeHashes,sourceStable:JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),afterHashes,event:{variants:variants.map(([name])=>name),quotes,enabled,disabled,rowComparisons},boss:{mechanics,counts:[1,2,3,4,5,6],completedTurns:[0,1,2,3],stages:[1,2],faceCombinationsPerTurnStage:55986,bossCases,reachabilityChecks},findings:[{severity:'copy precision',status:tideCopyResolved?'RESOLVED':'OPEN',mechanic:'boss_tide',maxHp:1001,actualHeal:tide.enemyHeal,exactThreePercent:30.03,currentCopy:tideCopy,note:'Math.ceil(maxHp * .03) may exceed an exact 3% fraction. The originally reviewed at-most-3% prose was reported to root; the current wording is checked for explicit upward rounding.'}]};
await writeFile(new URL('./cross-review-evidence.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
