// Optional browser A/B QA; Playwright is supplied by the tester, never the game.
// Fresh contexts, loopback origins and synthetic saves only. No quota overrides.
// The taskbook permits independent Playwright when the preferred browser route
// cannot reach loopback. The release's environment record identifies that route.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const require=createRequire(import.meta.url),args={};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i],split=arg.indexOf('=');
 if(split>=0)args[arg.slice(0,split)]=arg.slice(split+1);
 else args[arg]=!process.argv[i+1]||process.argv[i+1].startsWith('--')?true:process.argv[++i];
}
const mode=args['--mode']||'all';
assert(['all','inventory','frames','smoke','fixtures'].includes(mode),'--mode is all, inventory, frames, smoke or fixtures');
const source=path.resolve(args['--source']||'.'),output=path.resolve(args['--output']||'output/qa-performance-round');
// An older served version can legitimately commit different optional metadata.
// Compare its complete result with its own authoritative engine, never by
// deleting fields or weakening the existing exact-transition assertion.
const baselineSource=path.resolve(args['--baseline-source']||source);
const variants=[{label:'baseline',url:args['--baseline-url']||'http://127.0.0.1:4188'},{label:'after',url:args['--after-url']||'http://127.0.0.1:4189'}];
for(const variant of variants){const u=new URL(variant.url);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Only loopback test URLs are allowed');assert(['http:','https:'].includes(u.protocol));}
const inventorySamples=mode==='smoke'?1:Number(args['--inventory-samples']||16),repeats=mode==='smoke'?1:Number(args['--repeats']||3);
assert(Number.isInteger(inventorySamples)&&inventorySamples>=1&&inventorySamples<=20);assert(Number.isInteger(repeats)&&repeats>=1&&repeats<=5);
if(mode!=='smoke'&&['all','inventory'].includes(mode))assert(inventorySamples>=12,'Formal inventory A/B requires at least 12 samples per variant');
const windowMs=4200,seed=20261017,hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const E=await import(pathToFileURL(path.join(source,'src/engine.js'))),S=await import(pathToFileURL(path.join(source,'src/storage.js'))),Q=await import(pathToFileURL(path.join(source,'src/equipment.js'))),C=await import(pathToFileURL(path.join(source,'src/content.js')));
const baselineEngine=baselineSource===source?E:await import(pathToFileURL(path.join(baselineSource,'src/engine.js'))),baselineStorage=baselineSource===source?S:await import(pathToFileURL(path.join(baselineSource,'src/storage.js')));
const expectedModules={baseline:{engine:baselineEngine,storage:baselineStorage},after:{engine:E,storage:S}};
async function sourceIdentity(root){
 const files=['index.html','package.json','src/app.js','src/engine.js','src/views.js','src/storage.js','src/dice-renderer.js','src/effects.js','src/dice-motion.js','src/visual-timeline.js'];
 return Promise.all(files.map(async file=>({file,sha256:hash(await fs.readFile(path.join(root,file),'utf8'))})));
}
const sourceBefore={baseline:await sourceIdentity(baselineSource),after:await sourceIdentity(source)};
const keys={main:S.SAVE_KEY,mirror:S.BACKUP_KEY,settings:S.SETTINGS_KEY};
await fs.mkdir(output,{recursive:true});
const summarize=values=>{
 assert(values.every(Number.isFinite),'A non-finite sample is an explicit failure, never silently excluded');
 const sorted=values.toSorted((a,b)=>a-b),q=p=>sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;
 return {samples:sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)??null,min:sorted[0]??null};
};
function room(type='boss'){
 let s=E.newGame(seed);s.runId=`qa-round-performance-${type}-${seed}`;s.floor=140;s.fate=[6,6];s.player.level=80;s.player.gold=500000;s.player.talentPoints=35;
 s.roomIndex=type==='boss'?5:0;s.route=Array.from({length:6},(_,i)=>({id:`f140r${i}`,type:i===s.roomIndex?type:i===5?'boss':'combat',quality:0,done:i<s.roomIndex}));
 s.phase='route';s.player.hp=E.stats(s).maxHp;return E.transition(s,{type:'enter'});
}
function inventoryFixture(){
 const s=room('rest');s.runId=`qa-round-inventory-10000-equipped-tail-${seed}`;
 const equipped=[];s.player.equipped={};
 for(const [slot,key]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){
  const item=Q.makeItem(s,slot,3,140);item.level=160;item.enhance=10;equipped.push(item);s.player.equipped[key]=item.id;
 }
 const base=Q.makeItem(s,'weapon',0,140);base.level=1;base.enhance=0;
 const filler=Array.from({length:9995},()=>({...base,id:`i${s.nextId++}`}));
 s.player.items=[...filler,...equipped];s.player.hp=E.stats(s).maxHp;
 assert.deepEqual(s.player.items.slice(-5).map(item=>item.id),Object.values(s.player.equipped));
 return s;
}
function effectFixtures(){
 const s=room('boss');
 for(const key of ['critical','resonance','keen','echo'])s.player.talents[key]=C.TALENTS[key].cap;
 for(const [slot,key]of [['weapon','weapon'],['armor','armor'],['relic','relic'],['relic','relic2'],['relic','relic3']]){
  const item=Q.makeItem(s,slot,4,140);s.player.items.push(item);s.player.equipped[key]=item.id;
 }
 s.player.hp=E.stats(s).maxHp;
 // The real format allows six logs, each at most 180 characters. Exercise the
 // longest legal history instead of introducing an invalid unlimited log.
 const longText='深层战斗合成记录：六骰同点共鸣、暴击追击、护盾吸收与首领阶段交替；本段仅是固定负载，不描述自然探索成绩。';
 s.log=Array.from({length:6},(_,i)=>({text:`记录 ${i+1} · ${longText.repeat(5)}`.slice(0,180),tone:['','gold','rare','epic','legendary','danger'][i]}));
 assert.equal(S.validateSave({...s,log:[...s.log,{text:'第七条',tone:''}]}),false,'Seven logs must remain invalid');
 assert.equal(S.validateSave({...s,log:[{text:'长'.repeat(181),tone:''}]}),false,'A 181-character log must remain invalid');
 let found=false;
 for(let rng=1;rng<=5000;rng++){
  const next=E.transition({...s,rng},{type:'roll'}),r=next.lastRoll;
  if(r.best>=3&&r.critical&&r.follow&&!r.killed&&next.phase==='combat'){s.rng=rng;found=true;break;}
 }
 assert(found,'A real RNG seed must produce the authored boss burst');
 const finish=structuredClone(s);finish.enemy.hp=1;finish.enemy.shield=0;finish.enemy.stage=2;
 const chest=E.transition(finish,{type:'roll'});assert.equal(chest.phase,'chest');
 const chests=Array.from({length:8},(_,rarity)=>{
  const state=structuredClone(chest);state.runId=`qa-round-chest-${rarity}-${seed}`;state.chest.item=Q.makeItem(state,'relic',rarity,140,'boss');
  return {name:rarity===7?'eternal-open':`rarity-${rarity}-open`,action:'open',rarity,state};
 });
 assert.equal(E.transition(s,{type:'roll'}).log.length,6,'A real roll trims a full log to six');
 return {main:[{name:'boss-burst',action:'roll',state:s},chests[7]],coverage:chests.slice(0,7)};
}
const inventory=inventoryFixture(),{main:scenes,coverage:coverageScenes}=effectFixtures();
const fixtures=[{name:'inventory-10000',action:'inventory',state:inventory},...scenes,...coverageScenes];
const manifest=fixtures.map(fixture=>{
 assert(S.validateSave(fixture.state),`Invalid synthetic fixture ${fixture.name}`);
 const raw=S.encodeSave(fixture.state);assert.deepEqual(S.decodeSave(raw),fixture.state);
 if(fixture.action!=='inventory')assert(S.validateSave(E.transition(fixture.state,{type:fixture.action})),`Invalid post-action fixture ${fixture.name}`);
 return {name:fixture.name,action:fixture.action,rarity:fixture.rarity??null,seed,rng:fixture.state.rng,runId:fixture.state.runId,items:fixture.state.player.items.length,equippedIds:Object.values(fixture.state.player.equipped),logCount:fixture.state.log.length,logCharacters:fixture.state.log.map(log=>log.text.length),rawCharacters:raw.length,rawUtf8Bytes:Buffer.byteLength(raw),rawSha256:hash(raw),stateSha256:hash(fixture.state)};
});
await fs.writeFile(path.join(output,'fixture-manifest.json'),JSON.stringify({source,synthetic:true,manifest},null,2)+'\n');

// Independent replay of the measured fixture definitions and full version-specific
// transition oracles. This file is an analysis-only derivative of the fixed sampler.
const oracleRows=[];
for(const fixture of fixtures.filter(f=>f.action!=='inventory')){
 for(const variant of variants){
  const oracle=expectedModules[variant.label];
  const after=oracle.engine.transition(fixture.state,{type:fixture.action});
  assert(oracle.storage.validateSave(after));
  assert.deepEqual(oracle.storage.decodeSave(oracle.storage.encodeSave(after)),after);
  oracleRows.push({label:variant.label,scene:fixture.name,fixtureSha256:hash(fixture.state),persistedSha256:hash(after),fullExpectedState:after});
 }
}
const oracleResult={status:'PASS',derivedFromSamplerSha256:'bb3205985884a20a88a27e289f9ec04f46bd751f3cd4568df60affce0e506981',source,baselineSource,fixtureCount:fixtures.length,rows:oracleRows};
await fs.writeFile(path.join(output,'oracle-transitions.json'),JSON.stringify(oracleResult,null,2)+'\n');
console.log(JSON.stringify({status:oracleResult.status,fixtureCount:fixtures.length,fullTransitionCount:oracleRows.length,output},null,2));
