import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadAffixApi,affixFixture,affixItem,runAffixScenarios} from '../scripts/audit-fixed-affix-truth.mjs';

// The untouched input should fail only the new truthful-copy expectations.
// QA_AFFIX_ROOT=/path/to/input node --test tests/fixed-affix-truth.test.mjs
const api=await loadAffixApi(process.env.QA_AFFIX_ROOT||fileURLToPath(new URL('../',import.meta.url)));
let results;
const audit=()=>results??=runAffixScenarios(api);
const rows=rule=>audit().records.filter(row=>row.rule===rule);
const effects=id=>api.V.itemEffects(affixItem(api,id));

test('critical-follow copy states both gates and distinguishes critical-only from resonance plus critical',()=>{
 const cases=rows('criticalFollow');assert.equal(cases.length,4);
 const noPair=cases.find(row=>row.seed===46),pair=cases.find(row=>row.seed===17);
 assert.deepEqual(noPair.values,[1,5,2]);assert(noPair.critical);assert.equal(noPair.activeFollow,false);assert.equal(noPair.controlFollow,false);
 assert.deepEqual(pair.values,[1,2,2]);assert(pair.critical&&pair.activeFollow);assert.equal(pair.controlFollow,false);assert.equal(pair.activeTotal-pair.controlTotal,420);
 assert.deepEqual(new Set(cases.map(row=>`${row.critical}/${row.best>=2}`)),new Set(['false/false','false/true','true/false','true/true']));
 assert.match(effects('weapon-8-0-3'),/双同及以上且暴击：追击率 \+10%/);
});

test('pierce copy describes shield bypass without claiming increased unshielded damage',()=>{
 const cases=rows('pierce');assert.equal(cases.length,2);
 assert.equal(cases[0].activeHpDamage,1734);assert.equal(cases[0].controlHpDamage,1734);
 assert.equal(cases[1].activeHpDamage,173);assert.equal(cases[1].controlHpDamage,0);
 assert(cases.every(row=>row.total===1734));assert.match(effects('weapon-4-0-3'),/穿盾 \+10%/);assert(!effects('weapon-4-0-3').includes('破甲'));
});

test('ward and recovery copy names maximum HP, timing, survival and additive kill recovery',()=>{
 const regen=rows('regen');assert.equal(regen.length,2);
 assert.equal(regen[0].activeHp-regen[0].controlHp,Math.floor(regen[0].maxHp*.04));assert.equal(regen[1].activeHp,0);assert.equal(regen[1].controlHp,0);
 const barrier=rows('barrier')[0];assert.equal(barrier.activeWard,Math.round(barrier.before+barrier.maxHp*.16));assert.equal(barrier.controlWard,barrier.before);
 const pairs=rows('pairWard');assert.equal(pairs[0].wardGain,Math.round(pairs[0].maxHp*.1));assert.equal(pairs[1].wardGain,0);
 const kill=rows('healBonus')[0];assert.equal(kill.activeHp,kill.beforeHp+Math.ceil(kill.maxHp*.26));assert.equal(kill.controlHp,kill.beforeHp+Math.ceil(kill.maxHp*.16));
 assert.match(effects('armor-3-0-3'),/战斗掷骰后存活：恢复最大生命 \+4%/);
 assert.match(effects('armor-0-0-3'),/开战：获得最大生命护盾 \+16%/);
 assert.match(effects('armor-4-0-3'),/双同及以上：获得最大生命护盾 \+10%/);
 assert.match(effects('armor-5-0-3'),/击杀：额外恢复最大生命 \+10%/);
});

test('follow-damage copy identifies the main-hit base and keeps inactive follow damage at zero',()=>{
 const cases=rows('followDamage');assert.equal(cases.length,2);assert(cases[0].follow);assert(!cases[1].follow);
 assert.equal(cases[0].activeExtra,Math.round(cases[0].main*.59));assert.equal(cases[0].controlExtra,Math.round(cases[0].main*.35));
 assert.equal(cases[1].activeExtra,0);assert.equal(cases[1].controlExtra,0);
 assert.match(effects('weapon-5-0-3'),/追击追加主击 \+24%/);
});

test('gold-affix copy is limited to chests while gold rooms, fate, exchanges and salvage keep base rewards',()=>{
 const cases=rows('goldBonus');assert.equal(cases.length,5);
 assert(cases.find(row=>row.kind==='chest').activeGold>cases.find(row=>row.kind==='chest').controlGold);
 for(const row of cases.filter(row=>row.kind!=='chest'))assert.equal(row.activeGold,row.controlGold,row.kind);
 assert.match(effects('relic-5-0-3'),/宝箱金币 \+20%/);assert(!effects('relic-5-0-3').includes('金币收益'));
});

test('compact equipped labels keep precise critical conditions and expose the complete details without mutating saves',()=>{
 const s=affixFixture(api,'weapon-8-0-3',{seed:46}),before=api.S.encodeSave(s),item=s.player.items[0];
 const compact=api.V.itemEffects(item,{compact:true}),detailed=api.V.itemEffects(item),html=api.V.equipmentRail(s);
 assert.match(compact,/共鸣暴击追击率 \+10%/);assert(!compact.includes('双同及以上且暴击：追击率'));
 assert(html.includes(`title="进攻核心 · 攻击、暴击与穿盾 · ${detailed}"`));assert(html.includes('<span>共鸣暴击追击率 +10%</span>'));
 assert.equal(api.S.encodeSave(s),before);
 assert.deepEqual(api.E.transition(s,{type:'roll'}),api.E.transition(api.S.decodeSave(before),{type:'roll'}));
 assert.equal(audit().states.length,42);assert.equal(audit().records.length,19);
});
