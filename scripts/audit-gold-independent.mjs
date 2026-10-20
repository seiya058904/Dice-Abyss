import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {cpus,platform,arch,release} from 'node:os';

// Read-only independent boundary comparison. No author test helper or browser.
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const usage='Usage: node scripts/audit-gold-independent.mjs --baseline BASELINE_ROOT [--source PROJECT_ROOT] --output EXTERNAL_JSON';
const args=process.argv.slice(2),options={};
if(args.length===1&&args[0]==='--help'){console.log(usage);process.exit(0);}
for(let index=0;index<args.length;index+=2){
 const flag=args[index],value=args[index+1];
 if(!['--baseline','--source','--output'].includes(flag)||!value||value.startsWith('--')||Object.hasOwn(options,flag))throw Error(usage);
 options[flag]=value;
}
if(!options['--baseline']||!options['--output'])throw Error(usage);
const source=await realpath(resolve(options['--source']||packageRoot)),baseline=await realpath(resolve(options['--baseline']));
const output=resolve(options['--output']);
const inside=(folder,file)=>{const name=relative(folder,file);return !name||(!isAbsolute(name)&&name!=='..'&&!name.startsWith('..'+sep));};
async function canonical(path){
 try{return await realpath(path);}catch(error){
  if(error.code!=='ENOENT')throw error;
  const parent=dirname(path);if(parent===path)throw error;
  return resolve(await canonical(parent),relative(parent,path));
 }
}
const canonicalOutput=await canonical(output);
if([source,baseline,await realpath(packageRoot)].some(root=>inside(root,output)||inside(root,canonicalOutput)))throw Error('Output must remain outside baseline, source and script package directories, including symlinks.');
const at=(root,file)=>pathToFileURL(resolve(root,file));
const B=await import(at(baseline,'src/engine.js')),BS=await import(at(baseline,'src/storage.js'));
const C=await import(at(source,'src/engine.js')),CS=await import(at(source,'src/storage.js'));
const CV=await import(at(source,'src/views.js')),CE=await import(at(source,'src/encounters.js'));
const G=await import(at(source,'src/gold.js')),EQ=await import(at(source,'src/equipment.js'));
const {createFusionController}=await import(at(source,'src/fusion-controller.js'));

// Independent reviewer-owned fixtures. No author test helper is imported.
// Only this external evidence directory is written; all product modules stay read-only.
const files=['src/gold.js','src/engine.js','src/encounters.js','src/storage.js','src/views.js','src/app.js','src/gold.css','src/fusion-view.js','src/fusion-controller.js'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,digest(await readFile(at(source,path)))])));
const started=performance.now(),beforeHashes=await hashes();
const report={audit:'round09-gold-independent',protocolVersion:3,source,baseline,scriptSha256:digest(await readFile(fileURLToPath(import.meta.url))),environment:{node:process.version,platform:platform(),arch:arch(),release:release(),logicalCPUs:cpus().length},scope:'Independent synthetic accepted-state boundary review against the untouched input. No browser, full-suite or natural-incidence claim.',checks:{matrixRows:0,acceptedInputs:0,legalTransactions:0,refusedActions:0,roundtrips:0,renderReads:0,nullPreviewInputs:0,storageFaults:0,fusionCases:0,xpCapacityCases:0,protectionCases:0,highValueSalvageCases:0,receiptHelperCases:0,receiptLifecycleCases:0,fullInventoryCases:0},failures:[],textDifferences:0,newReceiptDifferences:0,maxLogCharacters:0,maxOutcomeCharacters:0,refundPaths:{gambit:0,wishingvault:0},sourceHashes:beforeHashes};
const record=(name,fn)=>{try{fn();}catch(error){report.failures.push({name,message:error.message,stack:error.stack});}};
function fixture(type,{floor=140,level=100,held=C.GOLD_CAP-10,rng=1}={}){
 let s=B.newGame(37091);s.runId=`independent-${type}-${floor}-${level}-${held}-${rng}`;s.rng=rng;
 s.floor=floor;s.player.level=level;s.player.gold=held;s.player.hp=B.stats(s).maxHp;
 s.reviewMetadata={preserve:{value:'未知字段 <>& 😀',nested:[{creditedGold:'unrelated-path'}]}};
 for(const slot of ['weapon','armor','relic']){const item=B.makeItem(s,slot,1);s.player.items.push(item);}
 s.rng=rng;
 if(type==='fate')return s;
 s.fate=[6,6];s.phase='route';s.route=[type,'combat','rest','combat','gold','boss'].map((type,index)=>({id:`f${floor}r${index}`,type,done:false,quality:0}));
 s=B.transition(s,{type:'enter'});
 if(s.event&&['exchange','gambit','wishingvault'].includes(type)){
  if(rng===1)s.event.costGold=0;
  if(rng===0xffffffff)s.event.costGold=1e8;
 }
 return s;
}
function diffs(a,b,path='',out=[]){
 if(Object.is(a,b))return out;
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diffs(a[key],b[key],path?path+'.'+key:key,out);
 }else out.push({path,before:a,after:b});
 return out;
}
function verifyTransition(s,action,label){
 const snapshot=JSON.stringify(s),old=B.transition(s,action),now=C.transition(s,action),actual=now.player.gold-s.player.gold;
 assert.equal(JSON.stringify(s),snapshot,'inputs remain unchanged');
 assert.equal(old===s,now===s,'same action permission');
 if(now===s){report.checks.refusedActions++;return now;}
 report.checks.legalTransactions++;
 const overflow=action.type==='open'?s.chest.gold>actual:action.type==='gold'?Math.round(65+B.depthPower(s.floor)*22)+s.fate.reduce((a,b)=>a+b,0)*3>actual:action.type==='fate'?s.player.gold+Math.round(20+B.depthPower(s.floor)*5)>C.GOLD_CAP:action.type==='event-choice'&&s.event.key==='exchange'&&action.id==='salvage'?s.event.costGold>actual||Math.min(1e6,40+s.player.level*5)>1e8-s.player.xp:action.type==='salvage'?B.salvagePreview(s,action.ids,action.allowProtected,action.allowOverflow).rawGold>actual:false;
 for(const d of diffs(old,now)){
  if(d.path==='lootCreditedGold'&&action.type==='open'){
   assert.equal(d.after,actual);report.newReceiptDifferences++;continue;
  }
  if(d.path==='lootCreditedGold'&&d.after===undefined&&!now.loot&&d.before===s.lootCreditedGold){report.receiptCleanupDifferences=(report.receiptCleanupDifferences||0)+1;continue;}
  if(/^log\.\d+\.text$/.test(d.path)&&overflow){report.textDifferences++;continue;}
  if(d.path==='event.outcome'&&overflow&&s.event?.key==='exchange'&&action.id==='salvage'){report.textDifferences++;continue;}
  throw Error(label+' unexpected full-state difference '+JSON.stringify(d));
 }
 assert(CS.validateSave(now),'current after must save');assert(BS.validateSave(now),'baseline decoder remains forward tolerant');
 assert.deepEqual(CS.decodeSave(CS.encodeSave(now)),now);assert.deepEqual(BS.decodeSave(CS.encodeSave(now)),now);report.checks.roundtrips+=2;
 assert.equal(now.rng,old.rng);assert.equal(now.revision,old.revision);assert.deepEqual(now.player,old.player);
 for(const entry of now.log){assert(entry.text.length<=180);report.maxLogCharacters=Math.max(report.maxLogCharacters,entry.text.length);}
 if(now.event){assert(now.event.outcome.length<=180);report.maxOutcomeCharacters=Math.max(report.maxOutcomeCharacters,now.event.outcome.length);}
 if(action.type==='open'){
  assert.equal(now.loot.gold,s.chest.gold);assert.equal(now.lootCreditedGold,actual);assert.deepEqual(now.loot,s.chest);assert.equal(now.counters.chests,s.counters.chests+1);
  assert.strictEqual(C.transition(now,action),now,'no second claim');
 }
 if(action.type==='event-choice'&&['gambit','wishingvault'].includes(s.event.key)&&now.phase==='event')report.refundPaths[s.event.key]++;
 return now;
}
const ui={screen:'game',view:'game',busy:false,forging:false};
for(const floor of [1,10,30,140,400,1e6,Number.MAX_SAFE_INTEGER])for(const level of [1,100,1e6])for(const held of [0,80,C.GOLD_CAP-1e8,C.GOLD_CAP-1,C.GOLD_CAP])for(const rng of [1,7919,0xffffffff])for(const type of ['fate','gold','chest','exchange','gambit','wishingvault'])record(`${type}/${floor}/${level}/${held}/${rng}`,()=>{
 report.checks.matrixRows++;
 const s=fixture(type,{floor,level,held,rng});assert(BS.validateSave(s),'baseline input valid');assert(CS.validateSave(s),'current input valid');report.checks.acceptedInputs++;
 const snapshot=JSON.stringify(s);
 const quoteAmount=type==='fate'?Math.round(20+B.depthPower(floor)*5):type==='gold'?Math.round(65+B.depthPower(floor)*22)+36:type==='chest'?s.chest.gold:s.event.costGold;
 const quote=G.goldPreview(s.player.gold,quoteAmount);if(quote===null)report.checks.nullPreviewInputs++;assert(quote);
 const html=CV.center(s,ui)+JSON.stringify(CV.primaryAction(s,ui));assert(!/(?:NaN|Infinity)/.test(html));assert.equal(JSON.stringify(s),snapshot);report.checks.renderReads++;
 const action=type==='fate'?{type:'fate'}:type==='gold'?{type:'gold'}:type==='chest'?{type:'open'}:{type:'event-choice',id:type==='exchange'?'salvage':'roll',confirmed:true};
 const now=verifyTransition(s,action,type);
 if(now!==s&&now.phase==='chest')verifyTransition(now,{type:'open'},type+'/pending reward');
});

// Additional reviewer-owned XP capacity cross-product, including low-level
// imports whose already stored XP is converted after incoming XP is clipped.
report.xpCapacityExamples=[];
for(const level of [1,1e6])for(const xp of [0,1e8-1e6,1e8-1,1e8])for(const held of [C.GOLD_CAP-1,C.GOLD_CAP])for(const costGold of [0,1e8])record(`xp-capacity/${level}/${xp}/${held}/${costGold}`,()=>{
 const s=fixture('exchange',{level,held});s.player.xp=xp;s.event.costGold=costGold;
 assert(BS.validateSave(s));assert(CS.validateSave(s));
 const snapshot=JSON.stringify(s),rawXp=Math.min(1e6,40+level*5),creditedXp=Math.min(rawXp,1e8-xp),overflowXp=rawXp-creditedXp;
 const choice=CE.eventChoices(s).find(o=>o.id==='salvage');assert(choice&&!choice.disabled);
 if(overflowXp){assert(choice.reward.includes(`经验可计入 ${creditedXp}（原额 ${rawXp}，上限未计入 ${overflowXp}）`));assert(choice.confirm.includes(`经验可计入 ${creditedXp}`));}
 const bothZero=Math.min(costGold,C.GOLD_CAP-held)===0&&creditedXp===0;
 assert.equal(choice.confirm.includes('两项入账均为 0'),bothZero);
 assert(choice.confirm.includes('永久消耗'));
 assert(!/(?:NaN|Infinity)/.test(CV.center(s,ui)));assert.equal(JSON.stringify(s),snapshot);
 assert.strictEqual(C.transition(s,{type:'event-choice',id:'salvage'}),s,'confirmation is still required');
 const now=verifyTransition(s,{type:'event-choice',id:'salvage',confirmed:true},'xp-capacity');
 if(overflowXp)assert(now.event.outcome.includes(`经验计入 ${creditedXp}（原额 ${rawXp}，上限未计入 ${overflowXp}）`));
 assert.equal(now.event.outcome.includes('两项入账均为 0'),bothZero);
 assert.equal(now.player.items.length,s.player.items.length-1);assert.deepEqual(now.player.equipped,s.player.equipped);
 assert.strictEqual(C.transition(now,{type:'event-choice',id:'salvage',confirmed:true}),now);
 report.checks.xpCapacityCases++;
 if(xp===1e8&&held===C.GOLD_CAP&&costGold===1e8)report.xpCapacityExamples.push({level,xp,rawXp,creditedXp,afterLevel:now.player.level,afterXp:now.player.xp,outcome:now.event.outcome});
});

// An offered item becoming protected while an encounter is pending must not
// be consumed, even when both numeric rewards are already capped.
for(const protection of ['locked','equipped','legendary','missing'])record(`exchange-protection/${protection}`,()=>{
 const s=fixture('exchange',{held:C.GOLD_CAP,level:1e6});s.player.xp=1e8;
 const index=s.player.items.findIndex(item=>item.id===s.event.offerId),offered=s.player.items[index];
 if(protection==='locked')offered.locked=true;
 if(protection==='equipped')s.player.equipped[offered.slot]=offered.id;
 if(protection==='legendary'){const replacement=B.makeItem(s,offered.slot,3);replacement.id=offered.id;s.player.items[index]=replacement;}
 if(protection==='missing')s.player.items.splice(index,1);
 s.player.hp=Math.min(s.player.hp,B.stats(s).maxHp);assert(BS.validateSave(s));assert(CS.validateSave(s));
 const choice=CE.eventChoices(s).find(o=>o.id==='salvage');assert(choice.disabled);
 verifyTransition(s,{type:'event-choice',id:'salvage',confirmed:true},'protected-exchange');report.checks.protectionCases++;
});

// Six independently assembled high-value batches span safe and unsafe integer
// totals. Unsafe sums keep the established early rejection; legal quotes may
// never return null solely because the eventual credited amount is capped.
report.highValueSalvage=[];
for(const count of [1,2,16,64,128,512])record(`high-value-salvage/${count}`,()=>{
 const s=fixture('rest',{held:C.GOLD_CAP-1}),ids=[];
 for(let n=0;n<count;n++){const item=B.makeItem(s,'weapon',7);item.level=EQ.MAX_ITEM_LEVEL;item.levelXp=0;item.enhance=EQ.ENHANCE_CAP;item.depth=Number.MAX_SAFE_INTEGER;s.player.items.push(item);ids.push(item.id);}
 assert(BS.validateSave(s));assert(CS.validateSave(s));
 const raw=ids.reduce((sum,id)=>sum+Math.max(1,Math.floor(B.itemValue(s.player.items.find(i=>i.id===id))*.15)),0),safe=Number.isSafeInteger(raw);
 const old=B.salvagePreview(s,ids,true,true),quote=C.salvagePreview(s,ids,true,true);assert.deepEqual(quote,old);
 if(safe){assert(quote);assert(G.goldPreview(s.player.gold,raw));verifyTransition(s,{type:'salvage',ids,allowProtected:true,allowOverflow:true},'high-value-salvage');}
 else{assert.equal(quote,null);assert.strictEqual(C.transition(s,{type:'salvage',ids,allowProtected:true,allowOverflow:true}),s);}
 assert.strictEqual(C.transition(s,{type:'salvage',ids,allowProtected:true}),s,'overflow requires explicit acceptance');
 assert.strictEqual(C.transition(s,{type:'salvage',ids,allowOverflow:true}),s,'high rarity requires explicit acceptance');
 report.highValueSalvage.push({count,rawGold:raw,safeInteger:safe,credited:quote?.gold??null});report.checks.highValueSalvageCases++;
});

// Max-length names with injection-looking text are legitimate JSON names, and
// must remain escaped while every newly persisted message fits the validator.
for(const type of ['chest','exchange'])record(`long-name/${type}`,()=>{
 const s=fixture(type,{held:C.GOLD_CAP-1,level:1e6});
 const item=type==='chest'?s.chest.item:s.player.items.find(item=>item.id===s.event.offerId);
 item.name='<img src=x onerror=alert(1)>'.padEnd(64,'界');
 if(type==='chest')s.chest.gold=1e8;else s.event.costGold=1e8;
 assert(BS.validateSave(s));assert(CS.validateSave(s));
 const html=CV.center(s,ui);assert(!html.includes('<img src=x onerror=alert(1)>'));
 verifyTransition(s,type==='chest'?{type:'open'}:{type:'event-choice',id:'salvage',confirmed:true},'max-name/'+type);
});

// Nested creditedGold is pre-existing unknown reward metadata. Fresh claiming
// preserves it byte-for-byte while writing the actual amount at the state root.
for(const oldReceipt of [0,1,100])record(`pending-receipt/${oldReceipt}`,()=>{
 const s=fixture('chest');s.chest.gold=100;s.chest.creditedGold=oldReceipt;
 assert(CS.validateSave(s));const now=C.transition(s,{type:'open'});
 assert.equal(now.lootCreditedGold,10);assert.deepEqual(now.loot,s.chest);assert.equal(now.player.gold,C.GOLD_CAP);
 const reloaded=CS.decodeSave(CS.encodeSave(now));assert.strictEqual(C.transition(reloaded,{type:'open'}),reloaded);assert.equal(reloaded.player.gold,C.GOLD_CAP);
 assert.deepEqual(s.chest.creditedGold,oldReceipt);
});

function store(state){const raw=CS.encodeSave(state),map=new Map([[CS.SAVE_KEY,raw],[CS.BACKUP_KEY,raw]]),writes=[];return {map,writes,getItem:key=>map.get(key)??null,setItem:(key,value)=>{writes.push(key);map.set(key,value);}};}
for(const type of ['chest','exchange','gambit','wishingvault'])for(const fail of ['primary','mirror','stale-metadata'])record(`save-fault/${type}/${fail}`,()=>{
 const s=fixture(type,{held:C.GOLD_CAP-1});const action=type==='chest'?{type:'open'}:{type:'event-choice',id:type==='exchange'?'salvage':'roll',confirmed:true};const now=C.transition(s,action);assert.notStrictEqual(now,s);
 const storage=store(s),raw=storage.map.get(CS.SAVE_KEY),write=storage.setItem;
 if(fail==='stale-metadata'){
  const stale=structuredClone(s);stale.reviewMetadata.preserve.nested[0].creditedGold='different unknown data';
  assert.throws(()=>CS.saveGame(now,stale,storage),/另一窗口/);assert.deepEqual(storage.writes,[]);
 }else{
  const key=fail==='primary'?CS.SAVE_KEY:CS.BACKUP_KEY;storage.setItem=(k,v)=>{if(k===key)throw Error('controlled reviewer write fault');write(k,v);};
  if(fail==='primary')assert.throws(()=>CS.saveGame(now,s,storage),/无法保存/);
  else{const saved=CS.saveGame(now,s,storage);assert.equal(saved.mirrored,false);assert.deepEqual(CS.loadSave(storage).state,now);}
 }
 assert.equal(storage.map.get(CS.BACKUP_KEY),raw);
 if(fail!=='mirror')assert.equal(storage.map.get(CS.SAVE_KEY),raw);
 report.checks.storageFaults++;
});

// Nested reward metadata was historically unrestricted. The new root receipt
// must never reinterpret, overwrite or invalidate any of these legacy values.
report.nestedRewardMetadataCompatibility=[];
for(const value of [null,'custom extension',-1,101,{},[],0,100])for(const location of ['chest','loot','event.reward'])record(`nested-metadata/${location}/${JSON.stringify(value)}`,()=>{
 let s=fixture(location==='event.reward'?'abyssauction':'chest');
 if(location==='loot')s=B.transition(s,{type:'open'});
 const reward=location==='event.reward'?s.event.reward:s[location];reward.gold=100;reward.creditedGold=value;
 assert(BS.validateSave(s));assert(CS.validateSave(s));
 assert.deepEqual(CS.decodeSave(CS.encodeSave(s)),s);
 assert.equal(G.goldReceipt(reward),null,'nested metadata cannot become an implicit current receipt');
 if(location==='loot')assert(CV.center(s,ui).includes('未记实收'));
 report.nestedRewardMetadataCompatibility.push({location,value,currentAccepted:true});
});

// Only state.lootCreditedGold is now reserved, and only with a valid loot object.
report.reservedFieldCompatibility=[];
for(const value of [null,'custom extension',-1,101,{},[],0,100])for(const hasLoot of [false,true])record(`reserved-root/${hasLoot}/${JSON.stringify(value)}`,()=>{
 let s=fixture('chest');if(hasLoot){s=B.transition(s,{type:'open'});s.loot.gold=100;}
 s.lootCreditedGold=value;assert(BS.validateSave(s));
 const accepted=CS.validateSave(s);assert.equal(accepted,hasLoot&&Number.isSafeInteger(value)&&value>=0&&value<=100);
 report.reservedFieldCompatibility.push({location:'state.lootCreditedGold',hasLoot,value,currentAccepted:accepted});
});

for(const credited of [0,10,100])record(`explicit-helper/${credited}`,()=>{
 const reward={gold:100,creditedGold:'legacy custom annotation'};
 assert.equal(G.goldReceipt(reward),null);
 assert.deepEqual(G.goldReceipt(reward,credited),{rawGold:100,credited,overflow:100-credited});report.checks.receiptHelperCases++;
});
for(const invalid of [undefined,null,true,'10',-1,.5,101,NaN,Infinity,-Infinity,{},[]])record(`explicit-helper-invalid/${String(invalid)}`,()=>{
 assert.equal(G.goldReceipt({gold:100,creditedGold:10},invalid),null);report.checks.receiptHelperCases++;
});

// Current receipts survive ordinary inventory actions and floor-cleared views,
// and are removed by every transition that clears the corresponding loot.
for(const mode of ['room-entry','multi-wave','floor-descent'])record(`receipt-lifecycle/${mode}`,()=>{
 let s=C.transition(fixture('chest'),{type:'open'});assert(CS.validateSave(s));
 const receipt=s.lootCreditedGold,loot=structuredClone(s.loot);
 const extra=s.player.items.find(item=>item.id!==s.loot.item.id&&!Object.values(s.player.equipped).includes(item.id));
 s=verifyTransition(s,{type:'lock',id:extra.id},mode+'/inventory');assert.equal(s.lootCreditedGold,receipt);assert.deepEqual(s.loot,loot);
 if(mode==='multi-wave')Object.assign(s.route[0],{type:'gauntlet',waves:2,wave:1,waveType:'gauntlet'});
 if(mode==='floor-descent'){s.roomIndex=5;for(let i=0;i<5;i++)s.route[i].done=true;s.route[5].type='chest';}
 assert(CS.validateSave(s));s=verifyTransition(s,{type:'next'},mode+'/next');
 if(mode==='floor-descent'){assert.equal(s.phase,'cleared');assert.equal(s.lootCreditedGold,receipt);assert.deepEqual(s.loot,loot);s=verifyTransition(s,{type:'descend'},mode+'/descend');}
 assert.equal(s.loot,null);assert(!Object.hasOwn(s,'lootCreditedGold'));assert(CS.validateSave(s));report.checks.receiptLifecycleCases++;
});

// Validator-accepted imported event states can retain old loot. Event rewards
// must clear its root receipt together with the loot, before the paid save.
for(const [type,id]of [['gambit','safe'],['abyssauction','accept'],['bloodwell','accept'],['relicloom','accept'],['relic_exchange','accept']])record(`receipt-event-lifecycle/${type}`,()=>{
 let s;
 if(type==='relic_exchange'){
  for(let seed=1;seed<=1000;seed++){const candidate=fixture('mystery',{held:C.GOLD_CAP,rng:(seed*7919)>>>0});if(candidate.event?.key===type){s=candidate;break;}}
  assert(s,'the fixture must enter a legal mystery room that generates relic_exchange');
 }else s=fixture(type,{held:C.GOLD_CAP});
 s.loot={item:structuredClone(s.player.items[0]),gold:100,type:'chest',source:'Accepted historical reward'};s.lootCreditedGold=10;
 assert(BS.validateSave(s));assert(CS.validateSave(s));
 let next=verifyTransition(s,{type:'event-choice',id,confirmed:true},'historical-loot/'+type);
 assert.equal(next.phase,'chest');assert.equal(next.loot,null);assert(!Object.hasOwn(next,'lootCreditedGold'));
 const beforeGold=next.player.gold;next=verifyTransition(next,{type:'open'},'historical-loot/'+type+'/claim');assert.equal(next.lootCreditedGold,next.player.gold-beforeGold);
 report.checks.receiptLifecycleCases++;
});

record('full-inventory exact pending reward preserved at claim',()=>{
 let s=fixture('chest',{held:0});const exemplar=s.player.items[0];
 while(s.player.items.length<10000)s.player.items.push({...exemplar,id:`i${s.nextId++}`});
 assert(CS.validateSave(s));const pending=structuredClone(s.chest),ids=s.player.items.slice(-2).map(item=>item.id);
 assert.strictEqual(C.transition(s,{type:'open'}),s);
 s=verifyTransition(s,{type:'salvage',ids},'full-inventory/salvage');assert.equal(s.player.items.length,9998);assert.deepEqual(s.chest,pending);
 s=verifyTransition(s,{type:'open'},'full-inventory/open');assert.equal(s.player.items.length,9999);assert.deepEqual(s.loot,pending);assert.equal(s.lootCreditedGold,pending.gold);
 assert.strictEqual(C.transition(s,{type:'open'}),s);report.checks.fullInventoryCases++;
});

const oldDocument=globalThis.document,oldWindow=globalThis.window;
globalThis.document={addEventListener(){},activeElement:null};globalThis.window={addEventListener(){}};
try{
 for(const [name,targetLevel,materialCount]of [['single-above-cap',1e7,1],['combined-above-cap',50000,20],['payable-high-cost',50000,1],['ordinary-poor',10,1]]){
  try{
   const s=fixture('fusion',{held:name==='ordinary-poor'?0:C.GOLD_CAP,level:1});
   const target=s.player.items.find(item=>item.id===s.player.equipped.weapon);target.level=targetLevel;
   const materials=[];for(let n=0;n<materialCount;n++){const item=C.makeItem(s,'weapon',0);s.player.items.push(item);materials.push(item.id);}
   assert(CS.validateSave(s));const preview=C.fusionPreview(s,[target.id],materials,true);assert(preview);const oldPreview=B.fusionPreview(s,[target.id],materials,true);assert.deepEqual(preview,oldPreview);
   const screen={...ui,fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:materials,fusionPage:0};const html=CV.fusionView(s,screen),stateBefore=JSON.stringify(s);
   const expectedCap=name.includes('above-cap');assert.equal(preview.cost>C.GOLD_CAP,expectedCap);
   assert(!html.includes('NaN'));assert(!html.includes('Infinity'));
   if(expectedCap){assert(html.includes('费用超过持有上限'));assert(html.includes('无法结算'));assert(!/还差\s*(?:1|一)\s*金币/.test(html));assert(!html.includes('10,000,000,001'));}
   const notifications=[],actions=[];const app={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}};
   const controller=createFusionController({app,ui:screen,getState:()=>s,isCommitting:()=>false,render(){},act:async action=>actions.push(action),notify:text=>notifications.push(text),confirmDialog(){throw Error('Unexpected protected confirmation');},reviewItems:()=>'',dialog:{open:false},tooltipHTML:()=>'',esc:CV.esc,num:CV.num,icon:CV.icon,itemSummary:CV.itemSummary});
   await controller.handleClick({shiftKey:false},{dataset:{action:'fusion-preview'}});
   if(expectedCap){assert.deepEqual(actions,[]);assert(notifications.some(text=>text.includes('超过金币持有上限')));assert.deepEqual(screen.fusionMaterials,materials);assert.strictEqual(C.transition(s,{type:'fuse',targets:[target.id],materials,allowProtected:true}),s);}
   if(name==='payable-high-cost'){assert.equal(actions.length,1);const after=C.transition(s,actions[0]);assert.equal(after.player.gold,s.player.gold-preview.cost);assert(CS.validateSave(after));assert.equal(after.rng,B.transition(s,actions[0]).rng);}
   assert.equal(JSON.stringify(s),stateBefore);controller.reset();report.checks.fusionCases++;
  }catch(error){report.failures.push({name:'fusion/'+name,message:error.message,stack:error.stack});}
 }
}finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}

report.afterHashes=await hashes();report.sourceStable=JSON.stringify(report.afterHashes)===JSON.stringify(beforeHashes);
report.durationMs=performance.now()-started;report.status=report.failures.length?'FAIL':'PASS';
report.maximumFloorReward={floor:Number.MAX_SAFE_INTEGER,depthPower:B.depthPower(Number.MAX_SAFE_INTEGER),fate:Math.round(20+B.depthPower(Number.MAX_SAFE_INTEGER)*5),goldRoom:Math.round(65+B.depthPower(Number.MAX_SAFE_INTEGER)*22)+36};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,sourceHashes:undefined,afterHashes:undefined,reservedFieldCompatibility:undefined},null,2));
if(report.failures.length)process.exitCode=1;
