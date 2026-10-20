import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const args=process.argv.slice(2),get=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
const source=resolve(get('--source',dirname(dirname(fileURLToPath(import.meta.url)))));
const baselineArg=get('--baseline');assert(baselineArg,'Provide --baseline pointing to the untouched Round14 package.');
const baseline=resolve(baselineArg),output=resolve(get('--output','/tmp/dice-abyss-healing-record-round15.json'));
const imports=async root=>Object.fromEntries(await Promise.all(['engine','storage','equipment-content'].map(async key=>[key,await import(pathToFileURL(resolve(root,'src',`${key}.js`)))])));
const A=await imports(baseline),B=await imports(source),sha=value=>createHash('sha256').update(value).digest('hex');
const files=['engine.js','deep-rules.js','encounters.js','equipment.js','equipment-content.js','storage.js'];
const hashes=async root=>Object.fromEntries(await Promise.all(files.map(async name=>[name,sha(await readFile(resolve(root,'src',name)))])));
const sourceHashes=await hashes(source),baselineHashes=await hashes(baseline);
function item(catalogId,id){
 const d=A['equipment-content'].CATALOG_BY_ID.get(catalogId);assert(d,catalogId);
 return {id,catalogId,slot:d.slot,rarity:d.rarity,profile:d.profile,theme:d.theme,name:d.name,level:80,levelXp:0,enhance:0,depth:140,locked:false};
}
function scene(seed){
 const s=A.engine.newGame(seed);s.runId='synthetic-round15-healing-cross-version';s.rng=seed;s.floor=140;s.player.level=80;s.fate=[3,4];
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({type,id:`f140r${i}`,quality:0,done:false}));s.roomIndex=0;s.phase='combat';
 s.player.items=[item('weapon-0-0-0','i1'),item('v5-armor-3-0-4','i2'),item('v5-relic-4-0-4','i3')];
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s.nextId=4;s.player.hp=100;s.ward=0;
 s.enemy={name:'完整状态恢复记录对照',note:'Synthetic audit fixture, not a natural journey.',label:'原规则与逐字段事务比较',type:'combat',trait:'steady',maxHp:1e12,hp:1e12,maxShield:0,shield:0,attack:1,turns:1,stage:1,combatRules:4};
 s.futureTop={retain:{nested:['unknown',null,17]}};s.player.items[1].futureItem={retain:[true,'original']};s.enemy.futureEnemy={retain:'opaque'};
 return s;
}
const scenarios=[
 ['surviving-injured',s=>s],
 ['fatal-primary-retaliation',s=>{s.enemy.attack=1000000;}],
 ['exact-lethal-primary',s=>{s.enemy.attack=871;}],
 ['one-hp-before-recovery',s=>{s.enemy.attack=870;}],
 ['fatal-curse-variant-zero',s=>{s.enemy.mechanic='cursed';s.player.hp=90;}],
 ['fatal-curse-variant-one',s=>{s.enemy.mechanic='cursed';s.enemy.variant=1;s.player.hp=90;}],
 ['full-health',s=>{s.player.hp=A.engine.stats(s).maxHp;}],
 ['killing-blow',s=>{s.enemy.hp=1;}],
 ['killing-blow-full-health',s=>{s.player.hp=A.engine.stats(s).maxHp;s.enemy.hp=1;}],
 ['absent-abilities',s=>{s.player.items[1]=item('armor-0-0-0','i2');s.player.items[2]=item('relic-0-0-0','i3');}],
 ['guard-opening-echo-note-order',s=>{s.player.talents.shatter=1;s.player.talents.lastResolve=1;s.enemy.turns=0;s.enemy.openingEcho=.25;}],
 ['capped-healing',s=>{s.player.talents.sixRebirth=3;s.player.talents.chorusMend=3;s.player.items[1]=item('v5-armor-3-0-7','i2');s.player.items.push(item('v5-relic-4-0-7','i4'));s.player.equipped.relic2='i4';s.nextId=5;}],
 ['legacy-combat-rules-two',s=>{s.enemy.combatRules=2;s.enemy.attack=1000000;}],
 ['life-drain-before-regen-and-critical-mend',s=>{s.player.items[1]=item('armor-3-0-0','i2');s.player.talents.sixRebirth=3;s.player.talents.chorusMend=3;s.player.talents.leech=5;s.player.talents.critical=5;s.enemy.mechanic='cursed';s.player.hp=1;}],
];
const seeds=[1,8,25,64,83,100,193,256,501,777,999,1000,1253,2048,4095,8192].map(seed=>seed*7919>>>0);
const rows=[];let roundTrips=0,correctedRecords=0,correctedNotes=0,unchangedStates=0;
const previousLabels=['六点回生 · 已触发','合鸣归息 · 已触发'],revisedLabels=['六点回生 · 未生效（本掷未存活）','合鸣归息 · 未生效（本掷未存活）'];
for(const [scenario,prepare]of scenarios)for(const seed of seeds){
 const before=scene(seed);prepare(before);assert(A.storage.validateSave(before),scenario);assert(B.storage.validateSave(before),scenario);
 const snapshot=structuredClone(before),a=A.engine.transition(before,{type:'roll'}),b=B.engine.transition(before,{type:'roll'});
 assert.deepEqual(before,snapshot,`${scenario}: input was mutated`);
 for(const [runtime,state]of [[A,before],[B,before],[A,a],[B,b]]){assert.deepEqual(runtime.storage.decodeSave(runtime.storage.encodeSave(state)),state);roundTrips++;}
 const expected=structuredClone(a),changes=[];
 if(a.player.hp===0)expected.lastRoll.mechanics=expected.lastRoll.mechanics.map((text,index)=>{
  const i=previousLabels.indexOf(text);if(i<0)return text;
  assert(i===0?a.lastRoll.values.includes(6):a.lastRoll.best>=4);assert(!a.lastRoll.killed);
  changes.push({path:`lastRoll.mechanics[${index}]`,before:text,after:revisedLabels[i]});return revisedLabels[i];
 });
 assert.deepEqual(b,expected,`${scenario}/${seed}: only the declared death-recovery wording may differ`);
 if(changes.length){correctedRecords++;correctedNotes+=changes.length;}else{assert.deepEqual(a,b);unchangedStates++;}
 rows.push({scenario,seed,openingHp:before.player.hp,openingAttack:before.enemy.attack,phase:b.phase,hp:b.player.hp,values:b.lastRoll.values,retaliation:b.lastRoll.retaliation,changes,baselineStateSha256:sha(JSON.stringify(a)),currentStateSha256:sha(JSON.stringify(b))});
}
assert(correctedRecords>0&&unchangedStates>0);assert(rows.some(r=>r.scenario==='fatal-curse-variant-zero'&&r.changes.length));
assert.deepEqual(await hashes(source),sourceHashes,'Current audited source changed during this run.');
assert.deepEqual(await hashes(baseline),baselineHashes,'Baseline source changed during this run.');
const report={audit:'round15-survival-gated-healing-records',status:'PASS',method:'Identical explicitly synthetic valid starting states; complete roll transitions compared recursively. Every property remains identical except a declared recovery-note string in a fatal roll. No numeric, RNG, item, player, enemy, counter, reward, or other log difference is normalized away.',baseline,source,sourceHashes,baselineHashes,sourceStable:true,scenarios:scenarios.map(([name])=>name),seeds,summary:{cases:rows.length,correctedRecords,correctedNotes,unchangedStates,fullCodecRoundTrips:roundTrips},rows,limitations:['Synthetic causal and boundary tests do not establish natural occurrence frequency, player win rate, or long-term balance.','Existing historical lastRoll records are preserved by unrelated actions; only newly committed rolls use revised descriptions.','Successful activation at full health remains an activation, not a promise of positive realized healing.']};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,status:report.status,summary:report.summary}));
