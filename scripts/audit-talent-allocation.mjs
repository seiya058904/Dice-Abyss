// Independent baseline differential and memory-store failure injection.
// No browser/private storage. Use --help for the portable command.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const usage='Usage: node scripts/audit-talent-allocation.mjs --baseline INPUT_ROOT --source CURRENT_ROOT --output OUTPUT_JSON';
if(process.argv.includes('--help')){console.log(usage+'\nOnly the requested output is written. The current source defaults to the working directory.');process.exit(0);}
const arg=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
const baselineRoot=arg('--baseline'),currentRoot=arg('--source',process.cwd()),output=arg('--output');
if(!baselineRoot||!currentRoot||!output)throw Error(usage);
const module=(root,p)=>import(pathToFileURL(resolve(root,p)));
const B=await module(baselineRoot,'src/engine.js'),E=await module(currentRoot,'src/engine.js'),S=await module(currentRoot,'src/storage.js');
const {TALENTS}=await module(baselineRoot,'src/content.js');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceFiles=['src/engine.js','src/storage.js','src/content.js','src/encounters.js','src/deep-content.js','tests/talent-allocation.test.mjs'];
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,hash(readFileSync(resolve(currentRoot,p),'utf8'))]));
const beforeHashes=hashes(),start=performance.now();
const result={method:'Independent implementation-to-input full-state comparison for default talent actions, and batch-vs-repeated-input checks. Constructed points/ranks/floors; real engine-created combat/chest/dead phases; in-memory storage faults. No natural balance, browser concurrency or OS power-loss claim.',baselineVersion:JSON.parse(readFileSync(resolve(baselineRoot,'package.json'),'utf8')).version,currentVersion:JSON.parse(readFileSync(resolve(currentRoot,'package.json'),'utf8')).version,sourceBefore:beforeHashes,legacyCases:0,batchCases:0,transactions:[],boundaries:[]};

for(const [id,t] of Object.entries(TALENTS)){
 const floors=[...new Set([1,Math.max(1,(t.floor||1)-1),t.floor||1,200])];
 for(const floor of floors)for(const rank of [0,t.cap-1,t.cap])for(const points of [0,1,3,17,2000000]){
  const s=B.newGame(14791);s.floor=floor;s.player.talents[id]=rank;s.player.talentPoints=points;s.player.hp=20;
  assert(S.validateSave(s));const snapshot=structuredClone(s),action={type:'talent',id};
  assert.equal(E.canAct(s,action),B.canAct(s,action));
  const actual=E.transition(s,action),expected=B.transition(s,action);
  assert.deepEqual(actual,expected,`legacy ${id} rank${rank} points${points} floor${floor}`);
  assert.deepEqual(s,snapshot);assert(S.validateSave(actual));result.legacyCases++;
 }
 for(const rank of [0,t.cap-1,t.cap])for(const count of [1,5,10,'max']){
  const s=B.newGame(21591);s.floor=200;s.player.talents[id]=rank;s.player.talentPoints=17;s.player.hp=20;
  const snapshot=structuredClone(s),preview=E.talentPreview(s,id,count),actual=E.transition(s,{type:'talent',id,count});
  assert.deepEqual(s,snapshot);assert(S.validateSave(actual));
  if(!preview){assert.strictEqual(actual,s);result.batchCases++;continue;}
  let expected=s;for(let i=0;i<preview.count;i++)expected=B.transition(expected,{type:'talent',id});
  expected={...expected,log:actual.log,revision:actual.revision};
  assert.deepEqual(actual,expected,`batch ${id} rank${rank} count${count}`);
  assert.equal(actual.revision,s.revision+1);assert.equal(actual.rng,s.rng);assert.equal(actual.player.hp,s.player.hp);
  assert.deepEqual(S.decodeSave(S.encodeSave(actual)),actual);result.batchCases++;
 }
}
for(const id of ['power','vitality']){
 const s=B.newGame(71913);s.floor=200;s.player.talentPoints=2000000;s.player.hp=20;
 const p=E.talentPreview(s,id,'max'),after=E.transition(s,{type:'talent',id,count:'max'});
 assert.equal(p.count,TALENTS[id].cap);assert.equal(after.player.talents[id],TALENTS[id].cap);
 assert.equal(after.player.talentPoints,2000000-TALENTS[id].cap);assert.equal(after.player.hp,20);assert.equal(after.rng,s.rng);
 assert(S.validateSave(after));assert.deepEqual(S.decodeSave(S.encodeSave(after)),after);
 result.boundaries.push({id,invested:p.count,remaining:after.player.talentPoints,roundTrip:true});
}
const initial=B.newGame(4723);initial.floor=200;initial.player.talentPoints=17;initial.player.hp=20;
const combat=B.transition(B.transition(initial,{type:'fate'}),{type:'enter'});
const almostWon=structuredClone(combat);almostWon.enemy.hp=1;almostWon.enemy.shield=0;
const chest=B.transition(almostWon,{type:'roll'});assert.equal(chest.phase,'chest');
const losing=structuredClone(combat);losing.player.hp=1;losing.enemy.hp=losing.enemy.maxHp=100000000;losing.enemy.attack=1000000000;
const dead=B.transition(losing,{type:'roll'});assert.equal(dead.phase,'dead');
const memory=()=>{const map=new Map(),writes=[];return {map,writes,getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes.push(k);map.set(k,v);}};};
for(const before of [initial,combat,chest,dead]){
 assert(S.validateSave(before));const original=structuredClone(before),after=E.transition(before,{type:'talent',id:'vitality',count:10});
 assert(S.validateSave(after));assert.deepEqual(before,original);assert.equal(after.player.hp,before.player.hp);
 for(const kind of ['primary-failure','mirror-failure','same-revision-branch']){
  const store=memory();S.saveGame(before,null,store);store.writes.length=0;const write=store.setItem;
  if(kind==='same-revision-branch'){
   const branch=structuredClone(before);branch.player.gold++;S.saveGame(branch,before,store);store.writes.length=0;
   const disk=new Map(store.map);assert.throws(()=>S.saveGame(after,before,store),/另一窗口/);assert.deepEqual(store.map,disk);assert.deepEqual(store.writes,[]);
  }else{
   const disk=new Map(store.map),failure=kind==='primary-failure'?S.SAVE_KEY:S.BACKUP_KEY;
   store.setItem=(k,v)=>{if(k===failure)throw Error('synthetic quota');write(k,v);};
   if(kind==='primary-failure'){assert.throws(()=>S.saveGame(after,before,store),/无法保存/);assert.deepEqual(store.map,disk);}
   else {const saved=S.saveGame(after,before,store);assert.equal(saved.mirrored,false);assert.match(saved.warning,/主存档.*镜像更新失败/);assert.equal(store.getItem(S.SAVE_KEY),S.encodeSave(after));assert.equal(store.getItem(S.BACKUP_KEY),disk.get(S.BACKUP_KEY));assert.deepEqual(S.loadSave(store).state,after);}
  }
  assert.deepEqual(before,original);result.transactions.push({phase:before.phase,condition:kind,passed:true});
 }
}
result.sourceAfter=hashes();assert.deepEqual(result.sourceAfter,beforeHashes);result.durationSeconds=(performance.now()-start)/1000;result.pass=true;
mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(resolve(output),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({legacyCases:result.legacyCases,batchCases:result.batchCases,transactionCases:result.transactions.length,boundaries:result.boundaries,sourceStable:true,durationSeconds:result.durationSeconds,pass:true},null,2));
