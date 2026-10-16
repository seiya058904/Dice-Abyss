import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateSave,validateSave,encodeSave,decodeSave,loadSave,saveGame,readLegacyBackup,SAVE_KEY,BACKUP_KEY,LEGACY_BACKUP_KEY} from '../src/storage.js';
import {itemStats,itemValue,legacyItemValue,levelXpNeeded} from '../src/equipment.js';
import {PROFILES} from '../src/equipment-content.js';
import {stats} from '../src/engine.js';

const legacyItem=(id,slot,rarity=3,depth=100,growth=500)=>({id,slot,rarity,depth,growth,enhance:17,locked:false,catalogId:`${slot}-4-1-${rarity}`,profile:1,theme:4,name:`旧日${slot}`});
export function legacyFixture(version=2,phase='chest'){
 const floor=20,items=[legacyItem('i1','weapon'),legacyItem('i2','armor'),legacyItem('i3','relic')];
 const s={version,revision:42,runId:'legacy-migration-fixture',rng:4958585,nextId:20,floor,phase,route:['combat','chest','forge','merchant','combat','boss'].map((type,i)=>({id:`f${floor}r${i}`,type,quality:0,done:false})),roomIndex:0,fate:[3,3],
  enemy:{name:'已提交的旧敌人',note:'保留原快照。',label:'护盾',trait:'shield',type:'combat',hp:0,maxHp:1000,attack:23,shield:0,maxShield:200,turns:3,combatRules:2,stage:1},
  chest:{item:legacyItem('i4','weapon',2,20,100),gold:600,type:'combat',source:'旧敌人'},loot:null,
  shop:[...['weapon','armor','relic'].map((slot,i)=>({id:`i${i+5}`,item:legacyItem(`i${i+5}`,slot,2,18,0),price:300,sold:false})),{id:'heal',price:99,sold:false}],
  lastRoll:{values:[6,6],best:2,critical:false,follow:false,main:1000,extra:0,total:1000,absorbed:0,hpDamage:1000,retaliation:0,killed:true,phaseChanged:false,guarded:0},
  lastForge:{value:6,gain:40,name:'旧融合结果',fusion:true,gains:[40],targets:['i1'],consumed:['i9']},log:[],completed:true,
  counters:{rolls:3,kills:1,chests:0,deaths:0,highestDamage:1000,bosses:0},
  player:{level:20,xp:5,gold:6000,hp:100,talentPoints:2,talents:{high:3,resonance:4,critical:2,vitality:2},items,equipped:{weapon:'i1',armor:'i2',relic:'i3'}}};
 if(phase==='loot'){s.loot=s.chest;s.chest=null;s.player.items.push(structuredClone(s.loot.item));s.counters.chests=1;}
 if(phase==='combat'){s.enemy.hp=600;s.lastRoll.killed=false;}
 return s;
}
function envelope(s){const payload=JSON.stringify(s);let h=2166136261;for(let i=0;i<payload.length;i++){h^=payload.charCodeAt(i);h=Math.imul(h,16777619);}return JSON.stringify({format:'dice-abyss',version:s.version,checksum:(h>>>0).toString(16),payload});}
const memoryStorage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const oldStats=item=>{const value=legacyItemValue(item),p=PROFILES[item.slot][item.profile??0],affinity={sumBonus:(item.rarity+1)*.02};return item.slot==='weapon'?{...affinity,attack:Math.round(value*p.attack),crit:item.rarity*.02+p.crit,follow:p.follow}:item.slot==='armor'?{...affinity,hp:Math.round(value*3*p.hp),defense:Math.round(value*.2*p.defense),crit:p.crit||0}:{...affinity,attack:Math.round(value*.45*p.attack),crit:.02+item.rarity*.035+p.crit,follow:item.rarity*.035+p.follow};};

test('V1, V2 and V3 migrate every owned and pending item without changing identity, investment, enemy or transaction state',()=>{
 for(const version of [1,2,3])for(const phase of ['combat','chest','loot']){
  const source=legacyFixture(version,phase),before=structuredClone(source),next=migrateSave(source);
  assert.deepEqual(source,before);assert.equal(next.version,4);assert(validateSave(next));
  for(const key of ['rng','revision','runId','floor','phase','nextId','route','fate','enemy','counters'])assert.deepEqual(next[key],before[key]);
  for(const key of ['gold','hp','xp','level','talentPoints'])assert.equal(next.player[key],before.player[key]);
  assert.equal(next.player.items.length,before.player.items.length);assert.deepEqual(next.player.equipped,{...before.player.equipped,relic2:null,relic3:null});
  for(let i=0;i<next.player.items.length;i++){
   const a=before.player.items[i],b=next.player.items[i];for(const key of ['id','name','rarity','enhance','depth','catalogId','locked'])assert.equal(b[key],a[key]);
   assert.deepEqual(itemStats(b),oldStats(a));assert.equal(itemValue(b),legacyItemValue(a));assert(!Object.hasOwn(b,'growth'));
  }
  for(const key of ['chest','loot'])if(before[key]){assert.equal(next[key].gold,before[key].gold);assert.equal(next[key].item.id,before[key].item.id);assert.equal(itemValue(next[key].item),legacyItemValue(before[key].item));}
  assert.deepEqual(next.shop.map(o=>({id:o.id,price:o.price,sold:o.sold})),before.shop.map(o=>({id:o.id,price:o.price,sold:o.sold})));
  assert.equal(next.lastForge.unit,'legacy');assert.equal(next.lastForge.gain,40);assert.equal(next.migration.maxValueDelta,0);
  assert.deepEqual(migrateSave(next),next);assert.deepEqual(decodeSave(encodeSave(next)),next);assert.deepEqual(decodeSave(envelope(before)),next);
 }
});

test('legacy three-relic positions and all old talent ranks survive repeated load and migration',()=>{
 const old=legacyFixture(1);old.player.items.push(legacyItem('i8','relic',2,40,200),legacyItem('i9','relic',3,60,700));old.player.equipped.relic2='i8';old.player.equipped.relic3='i9';
 const next=migrateSave(old);assert.deepEqual(next.player.equipped,old.player.equipped);for(const [key,value]of Object.entries(old.player.talents))assert.equal(next.player.talents[key],value);
 let current=next;for(let i=0;i<10;i++)current=decodeSave(encodeSave(migrateSave(current)));assert.deepEqual(current,next);assert(stats(next).maxHp>=next.player.hp);
});

test('primary/mirror recovery and the first V4 commit retain the original raw archive for rollback',()=>{
 const old=legacyFixture(2),raw=envelope(old),storage=memoryStorage();storage.setItem(SAVE_KEY,'corrupt');storage.setItem(BACKUP_KEY,raw);
 const loaded=loadSave(storage);assert.equal(loaded.recovered,true);assert.equal(loaded.state.revision,42);assert.equal(readLegacyBackup(storage),raw);assert.equal(storage.getItem(LEGACY_BACKUP_KEY),null);
 const next=structuredClone(loaded.state);next.revision++;saveGame(next,loaded.state,storage);
 assert.equal(readLegacyBackup(storage),raw);assert.equal(storage.getItem(SAVE_KEY),encodeSave(next));assert.equal(storage.getItem(BACKUP_KEY),encodeSave(next));
 const later=structuredClone(next);later.revision++;saveGame(later,next,storage);assert.equal(readLegacyBackup(storage),raw);assert.equal(JSON.parse(readLegacyBackup(storage)).version,2);
});

test('migration/archive failures leave original browser assets untouched and state corruption is rejected',()=>{
 const old=legacyFixture(3),raw=envelope(old),storage=memoryStorage();storage.setItem(SAVE_KEY,raw);storage.setItem(BACKUP_KEY,raw);const before=loadSave(storage).state;
 const noArchive={getItem:storage.getItem,setItem:(key,value)=>{if(key===LEGACY_BACKUP_KEY)throw Error('quota');storage.setItem(key,value);}};
 assert.throws(()=>saveGame({...before,revision:43},before,noArchive),/升级前/);assert.equal(storage.getItem(SAVE_KEY),raw);assert.equal(storage.getItem(BACKUP_KEY),raw);
 for(const patch of [{growth:0},{levelXp:levelXpNeeded(before.player.items[0].level)},{level:Infinity}]){const bad=structuredClone(before);Object.assign(bad.player.items[0],patch);assert(!validateSave(bad));assert.throws(()=>encodeSave(bad));}
 const impossible=legacyFixture(2);delete impossible.player.items[0].catalogId;impossible.player.items[0].depth=Number.MAX_SAFE_INTEGER;impossible.player.items[0].growth=1e12;const unsafeRaw=envelope(impossible);storage.setItem(SAVE_KEY,unsafeRaw);storage.setItem(BACKUP_KEY,unsafeRaw);const rejected=loadSave(storage);assert.equal(rejected.state,null);assert.match(rejected.error,/安全等级/);assert.equal(storage.getItem(SAVE_KEY),unsafeRaw);
 assert.equal(readLegacyBackup(storage),unsafeRaw,'checksummed original can still be exported for manual conversion');
 const damagedArchive=memoryStorage();damagedArchive.setItem(SAVE_KEY,raw);damagedArchive.setItem(BACKUP_KEY,raw);damagedArchive.setItem(LEGACY_BACKUP_KEY,'damaged');
 assert.equal(readLegacyBackup(damagedArchive),raw);assert.throws(()=>saveGame({...before,revision:43},before,damagedArchive),/归档校验/);assert.equal(damagedArchive.getItem(SAVE_KEY),raw);assert.equal(damagedArchive.getItem(LEGACY_BACKUP_KEY),'damaged');
});

test('V4 narrow new-schema fields reject bad waves, encounter mechanics, events and roll metadata',()=>{
 const good=migrateSave(legacyFixture(2));
 assert(validateSave(good));
 for(const mutate of [s=>s.route[0].waves=4,s=>{s.route[0].waves=2;s.route[0].wave=3;},s=>s.enemy.combatRules=3,s=>s.enemy.mechanic='unknown',s=>s.eventLuck=21,s=>s.player.pactScars=6,s=>s.lastRoll.echoes=7,s=>s.lastRoll.dodged='yes',s=>s.lastRoll.mechanics=[()=>{}],s=>s.event={key:'fake'}]){const bad=structuredClone(good);mutate(bad);assert(!validateSave(bad));}
 const event=structuredClone(good);event.phase='event';event.route[0].type='spring';event.event={key:'spring',roomType:'spring',title:'恢复泉',text:'旧资产的真实代价。',status:'pending',choice:null,outcome:'',costGold:100,costHp:1e9,offerId:null,targetId:null,rewardRarity:2};assert(validateSave(event));event.event.costHp=1e15+1;assert(!validateSave(event));
});

test('legacy aggregate HP crossing the V4 cap rejects migration without clipping assets or replacing raw',()=>{
 const old=legacyFixture(2);old.player.items[1].growth=1e12;old.player.hp=100;
 const baseHp=110+old.player.level*15+oldStats(old.player.items[1]).hp;
 const lastSafeRank=Math.floor((1e15/baseHp-1)/.05);
 assert(lastSafeRank>0&&lastSafeRank<1e6);
 for(const rank of [0,lastSafeRank]){
  const safe=structuredClone(old);safe.player.talents.vitality=rank;
  const next=migrateSave(safe);assert(validateSave(next));assert.equal(stats(next).maxHp,Math.round(baseHp*(1+rank*.05)));assert.equal(next.migration.maxValueDelta,0);
 }
 for(const rank of [lastSafeRank+1,1e6]){
  const unsafe=structuredClone(old);unsafe.player.talents.vitality=rank;const before=structuredClone(unsafe);
  assert(Math.round(baseHp*(1+rank*.05))>1e15);
  assert.throws(()=>migrateSave(unsafe),/旧角色最大生命.*无法无损迁移/);assert.deepEqual(unsafe,before);
  const raw=envelope(unsafe),storage=memoryStorage();storage.setItem(SAVE_KEY,raw);storage.setItem(BACKUP_KEY,raw);
  const loaded=loadSave(storage);assert.equal(loaded.state,null);assert.match(loaded.error,/旧角色最大生命.*人工转换/);
  assert.equal(storage.getItem(SAVE_KEY),raw);assert.equal(storage.getItem(BACKUP_KEY),raw);assert.equal(storage.getItem(LEGACY_BACKUP_KEY),null);assert.equal(readLegacyBackup(storage),raw);
 }
});
