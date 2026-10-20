// Read-only independent audit. Node >=20; no package installation required.
// All project and output locations must be supplied explicitly.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

const usage='Usage: node scripts/review-inventory-round16.mjs --baseline INPUT_PROJECT --current CURRENT_PROJECT --output OUTPUT_JSON';
const {values}=parseArgs({options:{baseline:{type:'string'},current:{type:'string'},output:{type:'string'},help:{type:'boolean'}},strict:true,allowPositionals:false});
if(values.help){console.log(usage);process.exit(0);}
for(const option of ['baseline','current','output'])if(!values[option])throw Error(`Missing --${option}. ${usage}`);
const baseline=resolve(values.baseline),current=resolve(values.current),out=resolve(values.output);
mkdirSync(dirname(out),{recursive:true});
const at=(r,f)=>pathToFileURL(resolve(r,f));
const B=await import(at(baseline,'src/inventory-query.js')),C=await import(at(current,'src/inventory-query.js')),E=await import(at(baseline,'src/engine.js')),S=await import(at(baseline,'src/storage.js'));
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const frozen=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);for(const y of Object.values(x))frozen(y);}return x;};
const hashes=()=>Object.fromEntries([['baseline',baseline],['current',current]].map(([k,r])=>[k,Object.fromEntries(['src/inventory-query.js','src/equipment.js','src/engine.js','src/storage.js'].map(f=>[f,hash(readFileSync(at(r,f),'utf8'))]))]));
const report={scope:'Independent Node full-array differential; no browser or timing claims',at:new Date().toISOString(),node:process.version,baselineRoot:baseline,currentRoot:current,scriptSha256:hash(readFileSync(new URL(import.meta.url),'utf8')),hashes:hashes(),status:'RUNNING',cases:[],mutations:[]};
function check(items,ui,label){const positions=new Map(items.map((x,i)=>[x,i])),before=JSON.stringify({items,ui}),expected=B.selectInventoryItems(items,ui),actual=C.selectInventoryItems(items,ui);assert.equal(actual.length,expected.length,label);for(let i=0;i<actual.length;i++)assert.equal(actual[i],expected[i],label+' original object and order '+i);assert.equal(JSON.stringify({items,ui}),before,label+' original graph unchanged');report.cases.push({label,selected:actual.length,exactReferencesAndOrder:true,orderHash:hash(actual.map(x=>[positions.get(x),x.id]))});return actual;}
try{
 for(const count of [32,1000,10000]){
  const s=E.newGame(16601);s.runId='round16-independent-sort-'+count;s.floor=140;s.player.level=100;s.player.hp=E.stats(s).maxHp;
  while(s.player.items.length<count){const i=E.makeItem(s,undefined,s.nextId%8);i.name=['寒潮之刃','Echo [Blade]','echo <Blade>','余火','不匹配'][s.nextId%5];i.level=(s.nextId*31)%101+1;i.enhance=s.nextId%21;i.auditMetadata={nested:[s.nextId,{text:'未知 😀 <script>'}],value:'immutable'};s.player.items.push(i);}
  const raw=S.encodeSave(s);frozen(s);
  for(const inventorySort of ['power','rarity','level','unknown-sort'])for(const inventorySlot of ['','weapon','armor','relic'])for(const inventoryQuery of ['','  寒潮 ','ECHO','[Blade]','<Blade>','.*']){
   const ui=frozen({inventorySort,inventorySlot,inventoryQuery,inventoryRarity:inventorySlot==='relic'?'7':''});check(s.player.items,ui,`${count}/${inventorySort}/${inventorySlot||'all'}/${inventoryQuery||'empty'}`);
  }
  assert.equal(S.encodeSave(s),raw,'full save, RNG and unknown metadata stay unchanged');
 }
 const s=E.newGame(16602),a={...s.player.items[0],id:'i99',level:5,enhance:0},b={...s.player.items[0],id:'i99',level:500,enhance:20},c={...s.player.items[0],id:'i100',level:5,enhance:0};
 for(const inventorySort of ['power','rarity','level'])check([a,c,b,a,c],{inventorySort},'duplicate IDs and repeated references/'+inventorySort);
 const bag=[a,b,c];for(const inventorySort of ['power','rarity','level']){
  const initial=check(bag,{inventorySort},'before same-object mutation/'+inventorySort);a.level=9000;a.levelXp=0;a.enhance=20;
  const next=check(bag,{inventorySort},'after same-object mutation/'+inventorySort);assert.equal(next[0],a);report.mutations.push({inventorySort,firstChanged:initial[0]!==next[0],noCrossCallValueCache:true});a.level=5;a.enhance=0;
 }
 for(const inventoryRarity of ['0',0,'7',7,'','bad-value',null])check(bag,{inventoryRarity},'rarity coercion/'+String(inventoryRarity));
 assert.deepEqual(hashes(),report.hashes,'source stable during review');assert.equal(hash(readFileSync(new URL(import.meta.url),'utf8')),report.scriptSha256,'script stable during review');report.sourceAndScriptStable=true;report.status='PASS';
}catch(e){report.status='FAIL';report.error={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;}
report.completedAt=new Date().toISOString();writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,mutations:report.mutations,hashes:report.hashes,error:report.error,output:out},null,2));
