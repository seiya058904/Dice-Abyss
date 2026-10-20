// Optional A/B check against the prior full ZIP. The game never requires it.
// node scripts/audit-reward-truth.mjs --baseline /absolute/input/Dice-Abyss --source . --output /tmp/reward-truth.json
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
assert(arg('--baseline'),'provide the unmodified prior project with --baseline');
const baseline=resolve(arg('--baseline')),source=resolve(arg('--source','.')),output=resolve(arg('--output','reward-truth.json'));
const B=await import(pathToFileURL(resolve(baseline,'src/engine.js'))),A=await import(pathToFileURL(resolve(source,'src/engine.js')));
const {eventChoices}=await import(pathToFileURL(resolve(source,'src/encounters.js')));
const {RARITIES}=await import(pathToFileURL(resolve(source,'src/content.js')));
const stripPresentation=s=>{
 const copy=structuredClone(s);copy.log=copy.log.map(entry=>({...entry,text:''}));
 if(copy.event)copy.event.outcome='';
 if(copy.enemy)for(const key of ['label','warning','counterplay'])delete copy.enemy[key];
 return copy;
};
let cases=0,changedCopy=0,highTierWitnesses=0;const examples=[];
function compare(s,action,label){
 const b=B.transition(s,action),a=A.transition(s,action);assert.deepEqual(stripPresentation(a),stripPresentation(b),label);
 assert.equal(a.rng,b.rng);assert.equal(a.nextId,b.nextId);assert.deepEqual(a.player,b.player);assert.deepEqual(a.chest,b.chest);
 if(a.event?.outcome!==b.event?.outcome){changedCopy++;assert(a.chest);assert(a.event.outcome.includes(RARITIES[a.chest.item.rarity].name));if(examples.length<8)examples.push({label,rngBefore:s.rng,rarity:a.chest.item.rarity,before:b.event.outcome,after:a.event.outcome});}
 if(a.chest?.item.rarity>=4)highTierWitnesses++;
 cases++;return b;
}
for(const floor of [3,29,30,50,80,140,400])for(let seed=1;seed<=80;seed++)for(const type of ['gambit','exchange','vault','trial','boss']){
 let s=B.newGame(seed*7919);s.floor=floor;s.player.level=100;s.player.gold=1e7;s.player.hp=B.stats(s).maxHp;s.fate=[3,4];s.phase='route';
 s.route=[type,'combat','rest','combat','gold','boss'].map((type,i)=>({id:`f${floor}r${i}`,type,done:false,quality:0}));s.roomIndex=0;
 if(type==='exchange')s.player.items.push(B.makeItem(s,'relic',1));
 s=compare(s,{type:'enter'},`${floor}/${seed}/${type}/enter`);
 if(type==='gambit')for(const id of ['safe','roll'])compare(s,{type:'event-choice',id,confirmed:true},`${floor}/${seed}/gambit/${id}`);
 if(type==='exchange'){
  assert(eventChoices(s).some(o=>o.id==='relic'));compare(s,{type:'event-choice',id:'relic',confirmed:true},`${floor}/${seed}/exchange/relic`);
  const mystery=structuredClone(s);mystery.event.key='relic_exchange';compare(mystery,{type:'event-choice',id:'accept',confirmed:true},`${floor}/${seed}/relic_exchange/accept`);
 }
 if(type==='trial'||type==='boss'){s.enemy.hp=1;s.enemy.shield=0;compare(s,{type:'roll'},`${floor}/${seed}/${type}/kill`);}
}
assert(changedCopy>0&&highTierWitnesses>0,'the comparison must exercise genuinely changed high-tier messages');
const report={method:'Synthetic independent event/room/kill fixtures from the same original state. Full resulting states match after removing only log text, event outcome wording and enemy label/warning/counterplay strings. All player data, purchases, chest contents, RNG, ID allocation, revision, combat and saved transaction fields compare exactly. No live save or natural progression claim.',baselineVersion:JSON.parse(await readFile(resolve(baseline,'package.json'),'utf8')).version,sourceVersion:JSON.parse(await readFile(resolve(source,'package.json'),'utf8')).version,cases,changedCopy,highTierWitnesses,gameplayFieldsIdentical:true,examples};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,cases,changedCopy,highTierWitnesses,gameplayFieldsIdentical:true}));
