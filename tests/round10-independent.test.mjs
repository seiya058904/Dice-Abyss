import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadAuditModules,makeXpFixture,xpNominal,xpOracle,experienceContract,verifyXpFixture,verifyPointLogs,makeCombatXpFixture,verifyCombatXpFixture} from '../scripts/qa-xp-round10-independent.mjs';

const modules=await loadAuditModules(process.env.QA_XP_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const {E,C,S}=modules;

test('independent cumulative cost oracle distinguishes accepted XP from one or multiple upgrade costs',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const s=makeXpFixture(modules,key,{level:100,xp:1017}),r=verifyXpFixture(modules,s);
  assert.equal(r.oracle.creditedXp,key==='starlibrary'?1100:540);
  assert.equal(r.after.player.level,key==='starlibrary'?102:101);
  assert.equal(r.after.player.xp,key==='starlibrary'?71:539);
  assert.notEqual(r.after.player.xp-s.player.xp,r.oracle.creditedXp);
 }
});

test('maximum level with room for XP still accepts the same reward without granting a level or points',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const s=makeXpFixture(modules,key,{level:1e6,xp:0}),r=verifyXpFixture(modules,s);
  assert.equal(r.after.player.level,1e6);assert.equal(r.after.player.xp,1e6);assert.equal(r.after.player.talentPoints,0);
 }
});

test('zero and partial XP capacity remain voluntary paid choices with exact pre-conversion receipts',()=>{
 for(const key of ['memory_archive','starlibrary','exchange'])for(const room of [0,1,10]){
  const s=makeXpFixture(modules,key,{level:1e6,xp:1e8-room}),r=verifyXpFixture(modules,s);
  assert.equal(r.oracle.creditedXp,room);assert.equal(r.oracle.overflowXp,1e6-room);assert.equal(r.after.player.xp,1e8);
 }
});

test('an exact capacity fit reports the entire million with no overflow',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const r=verifyXpFixture(modules,makeXpFixture(modules,key,{level:1e6,xp:99e6}));
  assert.equal(r.oracle.creditedXp,1e6);assert.equal(r.oracle.overflowXp,0);assert.equal(r.quote.experience.limited,false);
 }
});

test('large accepted legacy XP is clipped before it is converted into thousands of levels',()=>{
 for(const key of ['memory_archive','starlibrary','exchange'])for(const room of [0,10]){
  const r=verifyXpFixture(modules,makeXpFixture(modules,key,{level:100,xp:1e8-room}));
  assert.equal(r.oracle.creditedXp,room);assert(r.after.player.level>100);assert(r.after.player.xp<1e8-room);
 }
});

test('last allowed character level preserves surplus XP and stops awarding levels at the existing limit',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const r=verifyXpFixture(modules,makeXpFixture(modules,key,{level:999999,xp:10000007}));
  assert.equal(r.after.player.level,1e6);assert.equal(r.oracle.levelsGained,1);assert.equal(r.after.player.xp,999999);
 }
});

test('upgrade logs name actual 2, 1 and 0 talent-point receipts at their unchanged capacity',()=>{
 for(const key of ['memory_archive','starlibrary','exchange'])for(const points of [1999998,1999999,2000000])verifyPointLogs(modules,key,points);
});

test('all three structured experience quotes are ephemeral pure views, with no new persistence requirement',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const s=makeXpFixture(modules,key,{level:1e6,xp:1e8-10}),raw=S.encodeSave(s),snapshot=structuredClone(s);
  const option=C.eventChoices(s).find(o=>o.id===(key==='starlibrary'?'study':key==='exchange'?'salvage':'accept'));
  assert.deepEqual(option.experience,experienceContract(xpOracle(s,xpNominal(key,s.player.level))));
  assert.deepEqual(s,snapshot);assert.equal(S.encodeSave(s),raw);assert(!Object.hasOwn(s.event,'experience'));
  assert.deepEqual(S.decodeSave(raw),s);
 }
});

test('old unknown event.experience metadata remains untouched when a fresh UI quote is computed',()=>{
 for(const key of ['memory_archive','starlibrary','exchange']){
  const s=makeXpFixture(modules,key,{level:1e6,xp:1e8-10});s.event.experience={authorNote:'old custom metadata',value:-7};
  const original=structuredClone(s.event.experience),r=verifyXpFixture(modules,s);
  assert.deepEqual(r.after.event.experience,original);assert.deepEqual(S.decodeSave(S.encodeSave(r.after)).event.experience,original);
  assert.equal(r.quote.experience.creditedXp,10);
 }
});

test('combat, elite and boss XP admission matches the same oracle while their real dice and chests still resolve',()=>{
 for(const type of ['combat','elite','boss'])for(const config of [{level:1e6,xp:1e8},{level:1e6,xp:1e8-10},{level:100,xp:1017,points:2e6}])verifyCombatXpFixture(modules,makeCombatXpFixture(modules,type,config));
});

test('insufficient registered payment refuses both paid XP entrances without mutating assets or RNG',()=>{
 for(const key of ['memory_archive','starlibrary']){
  const s=makeXpFixture(modules,key,{level:1e6,xp:1e8,costGold:12345,gold:12344}),snapshot=structuredClone(s);
  const id=key==='starlibrary'?'study':'accept';assert(C.eventChoices(s).find(o=>o.id===id).disabled);
  assert.strictEqual(E.transition(s,{type:'event-choice',id,confirmed:true}),s);assert.deepEqual(s,snapshot);
 }
});

test('star-library permanent insight retains its separate shared offering cap and never consumes XP',()=>{
 for(const offered of [19,20]){
  const s=makeXpFixture(modules,'starlibrary',{level:100,xp:1e8}),before=structuredClone(s);s.player.deepOfferings=offered;before.player.deepOfferings=offered;
  const choice=C.eventChoices(s).find(o=>o.id==='insight');assert.equal(choice.disabled,offered===20);assert.equal(choice.experience,undefined);
  const after=E.transition(s,{type:'event-choice',id:'insight',confirmed:true});
  if(offered===20)assert.strictEqual(after,s);else{assert.equal(after.player.talentPoints,s.player.talentPoints+1);assert.equal(after.player.deepOfferings,20);assert.equal(after.player.gold,s.player.gold-Math.min(1e8,s.event.costGold*3));}
  assert.equal(after.player.xp,s.player.xp);assert.equal(after.player.level,s.player.level);assert.deepEqual(s,before);assert(S.validateSave(after));
 }
});
