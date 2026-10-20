import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

// Read-only runtime audit with synthetic legal room/inventory fixtures.
// Usage: node scripts/audit-save-closure.mjs --source /path/to/Dice-Abyss --output /external/qa/save-closure.json
// --source defaults to this package; --output is required and must be outside
// both the audited package and this script's package. No logs enter the ZIP.
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const usage='Usage: node scripts/audit-save-closure.mjs [--source PROJECT_ROOT] --output EXTERNAL_JSON';
const args=process.argv.slice(2),options={};
if(args.includes('--help')){console.log(usage);process.exit(0);}
for(let index=0;index<args.length;index+=2){
  const flag=args[index],value=args[index+1];
  if(!['--source','--output'].includes(flag)||!value||value.startsWith('--')||Object.hasOwn(options,flag))throw Error(usage);
  options[flag]=value;
}
if(!options['--output'])throw Error(usage+'; an explicit external output path is required.');
const root=resolve(options['--source']||packageRoot),output=resolve(options['--output']);
const inside=(folder,file)=>{const name=relative(folder,file);return !name||(!isAbsolute(name)&&name!=='..'&&!name.startsWith('..'+(process.platform==='win32'?'\\':'/')));};
if(inside(root,output)||inside(packageRoot,output))throw Error('Audit output must be outside the source and script package directories.');
const uri=p=>pathToFileURL(resolve(root,p));
const E=await import(uri('src/engine.js'));
const S=await import(uri('src/storage.js'));
const C=await import(uri('src/encounters.js'));
const V=await import(uri('src/views.js'));
const report={root,scope:'Independent synthetic legal-state transaction closure, not natural-player incidence or real browser storage.',checks:0,eventKeys:[],eventChoices:0,pendingProtectionVariants:0,shopPurchases:0,legacyFixtures:0,failures:[],notTested:['physical power loss','real browser localStorage quotas','independent browser interactions','actual Windows double click']};
// Hash the complete deterministic states and writes, not rendered HTML or a
// selected set of numeric fields. Matching reports from two --source roots
// can therefore compare data independently of deliberate UI-copy changes.
const stateTranscript=createHash('sha256'),transactionTranscript=createHash('sha256'),writeTranscript=createHash('sha256');
const fingerprints={algorithm:'sha256',format:1,stateSnapshots:0,committedTransactions:0,legacyWrites:0};
// Reviewer adapter: hash every original field and serialized byte after removing
// only the new root receipt. No logs, assets, numeric values or RNG are normalized.
const normalization={policy:'Remove only state.lootCreditedGold from transcript copies and encoded current-save copies; require exact ordinary nominal receipts before removal. Every other field remains hashed.',stateReceiptsRemoved:0,encodedReceiptsRemoved:0,originalAuditSha256:'df68c184fdcecc28b84ff4091f2bb240f070414efbed3e271240a23347cae603'};
function normalizeReceipt(state,counter){
 if(!Object.hasOwn(state,'lootCreditedGold'))return false;
 assert(state.loot&&Number.isSafeInteger(state.lootCreditedGold));
 assert.equal(state.lootCreditedGold,state.loot.gold,'these closure fixtures admit the complete ordinary nominal receipt');
 delete state.lootCreditedGold;normalization[counter]++;return true;
}
const append=(hash,value)=>{
 const copy=structuredClone(value);
 for(const key of ['state','before','after'])if(copy[key])normalizeReceipt(copy[key],'stateReceiptsRemoved');
 for(const key of ['primary','mirror'])if(typeof copy[key]==='string'){
  const envelope=JSON.parse(copy[key]),state=JSON.parse(envelope.payload);
  if(normalizeReceipt(state,'encodedReceiptsRemoved'))copy[key]=S.encodeSave(state);
 }
 hash.update(JSON.stringify(copy)+'\n');
};
const seen=new Set();
const store=()=>{const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
function roundtrip(s,label){
  assert(S.validateSave(s),label+' accepted state');
  const snapshot=JSON.stringify(s),decoded=S.decodeSave(S.encodeSave(s));
  assert.equal(JSON.stringify(s),snapshot,label+' validation pure');
  assert.deepEqual(decoded,s,label+' roundtrip');
  assert.doesNotThrow(()=>V.center(decoded,{view:'game',busy:false}),label+' current view');
  append(stateTranscript,{label,state:decoded});fingerprints.stateSnapshots++;
  report.checks+=4;return decoded;
}
function room(type,seed){
  let s=E.newGame(seed);s.runId=`audit-${seed}`;s.floor=400;s.player.level=100;s.player.gold=10000000;s.player.talentPoints=300;
  for(const slot of ['weapon','armor','relic'])for(let i=0;i<3;i++){const item=E.makeItem(s,slot,i===2?2:1);item.enhance=5;s.player.items.push(item);}
  s=E.transition(s,{type:'talent',id:'vitality',count:5});
  s.player.hp=E.stats(s).maxHp-1;s.fate=[3,4];s.phase='route';
  s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f400r${i}`,type,done:false,quality:0}));
  return E.transition(s,{type:'enter'});
}
function exercise(before,action,label){
  const initial=roundtrip(before,label+' before'),after=E.transition(initial,action);
  assert.notStrictEqual(after,initial,label+' actionable');
  assert.deepEqual(E.transition(roundtrip(before,label+' reload'),action),after,label+' deterministic continuation');
  roundtrip(after,label+' after');
  const storage=store();S.saveGame(initial,null,storage);const old=new Map(storage.map),write=storage.setItem;
  storage.setItem=(k,v)=>{if(k===S.SAVE_KEY)throw Error('synthetic primary quota');write(k,v);};
  assert.throws(()=>S.saveGame(after,initial,storage),/无法保存/,label+' main fault rejected');
  assert.deepEqual(storage.map,old,label+' main fault leaves both copies');
  storage.setItem=write;S.saveGame(after,initial,storage);
  assert.deepEqual(S.loadSave(storage).state,after,label+' persisted after');
  assert.equal(storage.getItem(S.SAVE_KEY),storage.getItem(S.BACKUP_KEY),label+' equal mirror');
  append(transactionTranscript,{label,before:initial,action,after});fingerprints.committedTransactions++;
  append(writeTranscript,{label,primary:storage.getItem(S.SAVE_KEY),mirror:storage.getItem(S.BACKUP_KEY)});
  report.checks+=7;
  return after;
}
function capture(name,fn){try{fn();}catch(error){report.failures.push({name,message:error.message,stack:error.stack});}}

const eventTypes=[...C.EVENT_ROOMS];
for(const type of eventTypes)for(let seed=1;seed<=(type==='mystery'?80:6);seed++)capture(`${type}/${seed}`,()=>{
  const original=roundtrip(room(type,seed),`${type}/${seed}`);seen.add(original.event.key);
  const variants=[['original',original]];
  const offered=original.player.items.find(i=>i.id===original.event.offerId);
  if(offered){
    variants.push(['lock offer',E.transition(original,{type:'lock',id:offered.id})]);
    variants.push(['equip offer',E.transition(original,{type:'equip',id:offered.id})]);
    variants.push(['remove offer',E.transition(original,{type:'salvage',ids:[offered.id],allowProtected:true})]);
  }
  const target=original.player.items.find(i=>i.id===original.event.targetId),replacement=original.player.items.find(i=>i.slot==='weapon'&&i.id!==target?.id);
  if(target&&replacement){const swapped=E.transition(original,{type:'equip',id:replacement.id});variants.push(['remove former target',E.transition(swapped,{type:'salvage',ids:[target.id],allowProtected:true})]);}
  for(const [variant,before]of variants){
    const label=`${type}/${seed}/${before.event.key}/${variant}`;roundtrip(before,label);report.pendingProtectionVariants++;
    const choices=C.eventChoices(before);assert(choices.some(o=>o.id==='leave'&&!o.disabled),label+' leave available');report.checks++;
    for(const choice of choices){
      const action={type:'event-choice',id:choice.id,confirmed:true};
      if(choice.disabled){assert.strictEqual(E.transition(before,action),before,label+' disabled stays same');report.checks++;continue;}
      const after=exercise(before,action,label+'/'+choice.id);report.eventChoices++;
      assert.strictEqual(E.transition(after,action),after,label+' event only once');report.checks++;
      if(after.phase==='chest'){const opened=exercise(after,{type:'open'},label+'/claim');assert.strictEqual(E.transition(opened,{type:'open'}),opened);report.checks++;}
    }
  }
});
for(const type of ['merchant','blackmarket'])for(let seed=1;seed<=6;seed++)capture(`${type}/${seed}`,()=>{
  const s=roundtrip(room(type,seed),`${type}/${seed}`);
  for(const offer of s.shop){
    const bought=exercise(s,{type:'buy',id:offer.id},`${type}/${seed}/${offer.id}`);report.shopPurchases++;
    assert.strictEqual(E.transition(bought,{type:'buy',id:offer.id}),bought);report.checks++;
    if(offer.item)roundtrip(E.transition(bought,{type:'salvage',ids:[offer.id],allowProtected:true}),`${type}/${seed}/sold history`);
  }
});
const golden=JSON.parse(await readFile(uri('tests/fixtures/v4-baseline.json'),'utf8'));
for(const [i,fixture]of golden.saves.entries())capture(`legacy v4/${i}`,()=>{
  const old=JSON.parse(JSON.parse(fixture.raw).payload),s=roundtrip(S.decodeSave(fixture.raw),`v4/${i}`);
  assert.equal(s.rng,old.rng);assert.deepEqual(s.route,old.route);assert.deepEqual(s.shop,old.shop);assert.deepEqual(s.chest,old.chest);assert.deepEqual(s.loot,old.loot);assert.deepEqual(s.enemy,old.enemy);report.checks+=6;
  const storage=store();storage.setItem(S.SAVE_KEY,fixture.raw);storage.setItem(S.BACKUP_KEY,fixture.raw);
  const after=E.transition(s,{type:'lock',id:s.player.equipped.weapon});S.saveGame(after,s,storage);
  assert.equal(S.readLegacyBackup(storage),fixture.raw);assert.deepEqual(S.loadSave(storage).state,after);report.checks+=2;report.legacyFixtures++;
  append(writeTranscript,{label:`legacy v4/${i}`,original:S.readLegacyBackup(storage),primary:storage.getItem(S.SAVE_KEY),mirror:storage.getItem(S.BACKUP_KEY)});fingerprints.legacyWrites++;
});
report.fingerprints={...fingerprints,states:stateTranscript.digest('hex'),transactions:transactionTranscript.digest('hex'),writes:writeTranscript.digest('hex')};
report.normalization=normalization;report.eventKeys=[...seen].sort();report.status=report.failures.length?'FAIL':'PASS';
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=report.failures.length?1:0;
