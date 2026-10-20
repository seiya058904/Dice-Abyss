// Rule-copy audit. All fixtures are synthetic, valid schema-5 states; this is
// not a natural journey, player win-rate study or new balancing policy.
// node scripts/audit-fixed-affix-truth.mjs --baseline /path/to/untouched-input --output /tmp/affix-truth.json
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export async function loadAffixApi(root) {
 const base=pathToFileURL(resolve(root)+'/');
 const [E,V,S,C]=await Promise.all(['engine','views','storage','equipment-content'].map(name=>import(new URL(`src/${name}.js`,base))));
 return {E,V,S,C};
}
export function affixItem(api,catalogId,id='i1') {
 const entry=api.C.CATALOG_BY_ID.get(catalogId);assert(entry,catalogId);
 return {id,catalogId,name:entry.name,slot:entry.slot,rarity:entry.rarity,profile:entry.profile,theme:entry.theme,depth:80,level:20,levelXp:0,enhance:0,locked:false};
}
export function replaceAffixItem(api,s,catalogId) {
 const next=structuredClone(s),slot=api.C.CATALOG_BY_ID.get(catalogId).slot,index=next.player.items.findIndex(item=>item.slot===slot);
 next.player.items[index]=affixItem(api,catalogId,next.player.items[index].id);
 return next;
}
export function affixFixture(api,catalogId,{level=3,seed=7919}={}) {
 let s=api.E.newGame(7919);s.runId='round05-affix-fixture';s.rng=seed;s.floor=80;s.player.level=level;s.player.xp=0;s.nextId=4;
 s.player.items=[affixItem(api,'weapon-6-0-3','i1'),affixItem(api,'armor-7-0-0','i2'),affixItem(api,'relic-6-0-0','i3')];
 s.player.equipped={weapon:'i1',armor:'i2',relic:'i3',relic2:null,relic3:null};s=replaceAffixItem(api,s,catalogId);
 s.player.hp=api.E.stats(s).maxHp;s.ward=0;s.phase='combat';s.fate=[3,4];s.roomIndex=0;
 s.route=['combat','combat','rest','combat','gold','boss'].map((type,i)=>({id:`f80r${i}`,type,done:false,quality:0}));
 s.enemy={name:'固定词条合成对照',note:'Synthetic condition fixture; not a natural journey.',label:'固定轻反击',type:'combat',trait:'steady',maxHp:1e8,hp:1e8,maxShield:0,shield:0,attack:1,turns:1,stage:1,combatRules:4};
 assert(api.S.validateSave(s),'fixture must be valid');assert.deepEqual(api.S.decodeSave(api.S.encodeSave(s)),s);return s;
}
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const numbers=text=>text.match(/[+-]?\d[\d,.]*%?/g)||[];

export function runAffixScenarios(api) {
 const {E,S}=api,states=[],records=[];
 const transact=(s,action,label)=>{
  assert(S.validateSave(s),`${label}: valid before`);const saved=S.encodeSave(s);
  for(const item of s.player.items){api.V.itemEffects(item);api.V.itemEffects(item,{compact:true});}
  api.V.equipmentRail(s);assert.equal(S.encodeSave(s),saved,`${label}: display must not mutate state`);
  const next=E.transition(s,action);assert.notStrictEqual(next,s,`${label}: action commits`);assert.equal(S.encodeSave(s),saved,`${label}: input is immutable`);
  assert(S.validateSave(next),`${label}: valid after`);assert.deepEqual(S.decodeSave(S.encodeSave(next)),next);
  states.push({label,before:s,action,after:next});return next;
 };
 for(const seed of [6,14,17,46]) {
  const active=affixFixture(api,'weapon-8-0-3',{seed}),control=replaceAffixItem(api,active,'weapon-6-0-3');
  const peek=structuredClone(active);E.drawDice(peek,E.diceCount(peek));const criticalDraw=E.random(peek),followDraw=E.random(peek),st=E.stats(active);
  const a=transact(active,{type:'roll'},`critical-follow/${seed}/active`),b=transact(control,{type:'roll'},`critical-follow/${seed}/control`);
  assert.deepEqual(a.lastRoll.values,b.lastRoll.values);assert.equal(a.lastRoll.main,b.lastRoll.main);assert.equal(a.lastRoll.critical,b.lastRoll.critical);
  assert(followDraw>=st.follow&&followDraw<st.follow+st.criticalFollow);assert.equal(b.lastRoll.follow,false);
  assert.equal(a.lastRoll.follow,a.lastRoll.critical&&a.lastRoll.best>=2);
  records.push({rule:'criticalFollow',seed,values:a.lastRoll.values,critical:a.lastRoll.critical,best:a.lastRoll.best,criticalDraw,followDraw,baseChance:st.follow,conditionalBonus:st.criticalFollow,activeFollow:a.lastRoll.follow,controlFollow:b.lastRoll.follow,activeTotal:a.lastRoll.total,controlTotal:b.lastRoll.total});
 }
 for(const shield of [0,1e8]) {
  const active=affixFixture(api,'weapon-4-0-3',{seed:9123});active.enemy.maxShield=active.enemy.shield=shield;
  const control=replaceAffixItem(api,active,'weapon-6-0-3'),a=transact(active,{type:'roll'},`pierce/${shield}/active`),b=transact(control,{type:'roll'},`pierce/${shield}/control`);
  assert.equal(a.lastRoll.total,b.lastRoll.total);assert.deepEqual(a.lastRoll.values,b.lastRoll.values);
  assert.equal(a.lastRoll.hpDamage,shield?173:1734);assert.equal(b.lastRoll.hpDamage,shield?0:1734);
  records.push({rule:'pierce',seed:9123,shield,values:a.lastRoll.values,total:a.lastRoll.total,activeHpDamage:a.lastRoll.hpDamage,controlHpDamage:b.lastRoll.hpDamage});
 }
 for(const lethal of [false,true]) {
  const active=affixFixture(api,'armor-3-0-3',{seed:46});active.player.hp=500;if(lethal)active.enemy.attack=1e9;
  const control=replaceAffixItem(api,active,'armor-0-0-3'),a=transact(active,{type:'roll'},`regen/${lethal}/active`),b=transact(control,{type:'roll'},`regen/${lethal}/control`),amount=Math.floor(E.stats(active).maxHp*.04);
  assert.equal(a.lastRoll.retaliation,b.lastRoll.retaliation);assert.equal(a.player.hp,lethal?0:b.player.hp+amount);
  records.push({rule:'regen',lethal,seed:46,maxHp:E.stats(active).maxHp,rawRecovery:amount,activeHp:a.player.hp,controlHp:b.player.hp});
 }
 {
  const active=affixFixture(api,'armor-0-0-3',{seed:17});active.phase='route';active.enemy=null;active.ward=37;
  const control=replaceAffixItem(api,active,'armor-7-0-3'),a=transact(active,{type:'enter'},'barrier/active'),b=transact(control,{type:'enter'},'barrier/control');
  assert.equal(a.ward,Math.round(37+E.stats(active).maxHp*.16));assert.equal(b.ward,37);assert.deepEqual(a.enemy,b.enemy);
  records.push({rule:'barrier',seed:17,maxHp:E.stats(active).maxHp,before:37,activeWard:a.ward,controlWard:b.ward});
 }
 for(const seed of [17,46]) {
  const active=affixFixture(api,'armor-4-0-3',{seed}),control=replaceAffixItem(api,active,'armor-0-0-3'),a=transact(active,{type:'roll'},`pair-ward/${seed}/active`),b=transact(control,{type:'roll'},`pair-ward/${seed}/control`);
  assert.equal(a.lastRoll.wardGain,a.lastRoll.best>=2?Math.round(E.stats(active).maxHp*.1):0);assert.equal(b.lastRoll.wardGain,0);
  records.push({rule:'pairWard',seed,values:a.lastRoll.values,best:a.lastRoll.best,maxHp:E.stats(active).maxHp,wardGain:a.lastRoll.wardGain,controlWardGain:b.lastRoll.wardGain});
 }
 {
  const active=affixFixture(api,'armor-5-0-3',{level:100,seed:17});active.player.hp=500;active.enemy.hp=1;
  const control=replaceAffixItem(api,active,'armor-0-0-3'),a=transact(active,{type:'roll'},'kill-heal/active'),b=transact(control,{type:'roll'},'kill-heal/control'),maxHp=E.stats(active).maxHp;
  assert.equal(a.player.level,100);assert.equal(b.player.level,100);assert(a.lastRoll.killed&&b.lastRoll.killed);
  assert.equal(a.player.hp,500+Math.ceil(maxHp*.26));assert.equal(b.player.hp,500+Math.ceil(maxHp*.16));
  records.push({rule:'healBonus',seed:17,maxHp,beforeHp:500,activeHp:a.player.hp,controlHp:b.player.hp,levelUnchanged:100});
 }
 for(const seed of [8,17]) {
  const active=affixFixture(api,'weapon-5-0-3',{seed}),control=replaceAffixItem(api,active,'weapon-6-0-3'),a=transact(active,{type:'roll'},`follow-damage/${seed}/active`),b=transact(control,{type:'roll'},`follow-damage/${seed}/control`);
  assert.equal(a.lastRoll.main,b.lastRoll.main);assert.equal(a.lastRoll.follow,b.lastRoll.follow);
  assert.equal(a.lastRoll.extra,a.lastRoll.follow?Math.round(a.lastRoll.main*.59):0);assert.equal(b.lastRoll.extra,b.lastRoll.follow?Math.round(b.lastRoll.main*.35):0);
  records.push({rule:'followDamage',seed,values:a.lastRoll.values,follow:a.lastRoll.follow,main:a.lastRoll.main,activeExtra:a.lastRoll.extra,controlExtra:b.lastRoll.extra});
 }
 for(const kind of ['chest','gold','fate','exchange','salvage']) {
  const active=affixFixture(api,'relic-5-0-3',{level:100,seed:1});let action;
  if(['chest','gold','exchange'].includes(kind)) {
   active.phase='route';active.enemy=null;active.route[0].type=kind;
   if(kind==='exchange'){active.player.items.push(affixItem(api,'weapon-6-0-0','i4'));active.nextId=5;}
   action={type:'enter'};
  } else if(kind==='fate') {active.phase='fate';active.enemy=null;active.route=[];active.fate=null;action={type:'fate'};}
  else {active.player.items.push(affixItem(api,'weapon-6-0-0','i4'));active.nextId=5;action={type:'salvage',ids:['i4']};}
  const control=replaceAffixItem(api,active,'relic-6-0-3');
  let a=transact(active,action,`gold-scope/${kind}/active`),b=transact(control,action,`gold-scope/${kind}/control`);
  if(kind==='gold'){a=transact(a,{type:'gold'},'gold-scope/gold/collect-active');b=transact(b,{type:'gold'},'gold-scope/gold/collect-control');}
  if(kind==='exchange'){a=transact(a,{type:'event-choice',id:'salvage',confirmed:true},'gold-scope/exchange/collect-active');b=transact(b,{type:'event-choice',id:'salvage',confirmed:true},'gold-scope/exchange/collect-control');}
  const activeGold=kind==='chest'?a.chest.gold:a.player.gold-active.player.gold,controlGold=kind==='chest'?b.chest.gold:b.player.gold-control.player.gold;
  if(kind==='chest'){assert(activeGold>controlGold);assert.deepEqual(a.chest.item,b.chest.item);}else assert.equal(activeGold,controlGold);
  records.push({rule:'goldBonus',kind,seed:1,activeGold,controlGold});
 }
 return {records,states};
}

async function main() {
 const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
 const root=resolve(arg('--source',resolve(dirname(fileURLToPath(import.meta.url)),'..'))),baseline=arg('--baseline',null),output=resolve(arg('--output','/tmp/dice-affix-truth.json'));
 const api=await loadAffixApi(root),current=runAffixScenarios(api),details=[];
 let catalogItems=0,changedDescriptions=0,stateComparisons=0;
 const prior=baseline?await loadAffixApi(resolve(baseline)):null;
 if(prior) {
  const before=runAffixScenarios(prior);assert.equal(before.states.length,current.states.length);assert.deepEqual(before.records,current.records);
  for(let i=0;i<before.states.length;i++){assert.deepEqual(current.states[i],before.states[i]);stateComparisons++;}
  for(const [catalogId] of api.C.CATALOG_BY_ID) {
   const item=affixItem(api,catalogId),snapshot=structuredClone(item),text=api.V.itemEffects(item),compact=api.V.itemEffects(item,{compact:true}),old=prior.V.itemEffects(item);
   assert.deepEqual(item,snapshot);assert.deepEqual(api.E.itemStats(item),prior.E.itemStats(item));assert.equal(api.E.itemValue(item),prior.E.itemValue(item));assert.deepEqual(numbers(text),numbers(old));assert.deepEqual(numbers(compact),numbers(old));
   catalogItems++;if(text!==old)changedDescriptions++;
   if(['weapon-8-0-3','weapon-4-0-3','armor-0-0-3','armor-3-0-3','armor-4-0-3','armor-5-0-3','weapon-5-0-3','relic-5-0-3'].includes(catalogId))details.push({catalogId,before:old,after:text,compact});
  }
 }
 const paths=['src/engine.js','src/equipment.js','src/equipment-content.js','src/encounters.js','src/deep-rules.js','src/deep-content.js','src/rarity.js','src/views.js'];
 const sourceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 const result={scope:'Synthetic legal-shaped schema-5 fixtures and exact engine transactions; not naturally reached progress or human-player evidence.',source:root,baseline:baseline?resolve(baseline):null,sourceHashes,summary:{semanticScenarios:current.records.length,committedTransactions:current.states.length,fullStateComparisons:stateComparisons,catalogItems,changedDescriptions,numericCopyDifferences:0},scenarios:current.records,descriptions:details,stateHashes:current.states.map(({label,before,after})=>({label,before:hash(before),after:hash(after)}))};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,...result.summary}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
