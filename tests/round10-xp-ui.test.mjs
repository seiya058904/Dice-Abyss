import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {eventChoices} from '../src/encounters.js';
import {center,gameView,experiencePreviewView,playerExperienceView} from '../src/views.js';
import {eventFixture} from '../scripts/audit-event-context.mjs';

const ui={screen:'game',view:'game',busy:false};
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// Valid synthetic boundaries with real seeded room entry and real settlement.
// Seed 4 reaches memory_archive through the authored mystery pool at floor 140.
function study(key,{level=E.LEVEL_CAP,xp=0,gold=E.GOLD_CAP}={}) {
 const s=eventFixture({E,S},key==='memory_archive'?'mystery':key,{seed:4,floor:140,beforeEnter:s=>{
  Object.assign(s.player,{level,xp,gold});s.player.hp=E.stats(s).maxHp;return s;
 }});
 assert.equal(s.event.key,key);assert(S.validateSave(s));return s;
}
const selected=s=>eventChoices(s).find(choice=>choice.id===(s.event.key==='starlibrary'?'study':'accept'));
const accept=s=>E.transition(s,{type:'event-choice',id:selected(s).id,confirmed:true});
function row(html,key) {
 const found=html.match(new RegExp(`<div data-experience-row="${key}"><dt>[^<]*</dt><dd>([\\d,]+)</dd></div>`));
 assert(found,`missing ${key} quote row`);return Number(found[1].replaceAll(',',''));
}

test('both paid study rooms preview the exact full, partial and zero XP accepted by the real transaction',()=>{
 for(const key of ['memory_archive','starlibrary'])for(const xp of [0,E.XP_CAP-10,E.XP_CAP]){
  const s=study(key,{xp}),before=S.encodeSave(s),choice=selected(s),html=center(s,ui),after=accept(s);
  assert(!choice.disabled);assert.match(html,/data-experience-preview/);
  assert.equal(row(html,'credited'),after.player.xp-xp);
  assert.equal(row(html,'raw'),row(html,'credited')+row(html,'overflow'));
  assert.equal(row(html,'raw'),1_000_000);
  assert.equal(s.player.gold-after.player.gold,s.event.costGold,'capacity does not waive the original payment');
  assert.match(text(html),/不再触发升级/);assert(S.validateSave(after));assert.equal(S.encodeSave(s),before);
  if(xp===E.XP_CAP){assert.match(text(html),/本次计入为 0/);assert.match(choice.confirm,/仍会支付/);}
 }
});

test('a normal level-up preview reports accepted XP before consumption, not the falling final counter',()=>{
 const s=study('memory_archive',{level:100,xp:E.xpNeeded(100)-1}),html=center(s,ui),after=accept(s);
 assert.equal(after.player.level,101);assert.equal(after.player.xp,539);
 assert.equal(row(html,'credited'),540);assert.notEqual(after.player.xp-s.player.xp,row(html,'credited'));
 assert.equal(row(html,'overflow'),0);assert.match(text(html),/可计入量在升级消耗前计算/);
 assert.doesNotMatch(text(html),/角色已达等级上限/);assert(S.validateSave(after));
});

test('imported XP near capacity is quoted before any stored XP converts into levels',()=>{
 const s=study('memory_archive',{level:100,xp:E.XP_CAP-10}),html=center(s,ui),after=accept(s);
 assert.equal(row(html,'credited'),10);assert.equal(row(html,'overflow'),530);
 assert(after.player.level>100);assert(after.player.xp<s.player.xp);
 assert.match(text(html),/不会在升级后补回/);assert(S.validateSave(after));
});

test('zero incoming XP never implies existing stored XP cannot still convert into levels',()=>{
 const s=study('memory_archive',{level:100,xp:E.XP_CAP}),html=center(s,ui),after=accept(s);
 assert.equal(row(html,'credited'),0);assert(!selected(s).disabled);
 assert(after.player.level>100);assert(after.player.xp<s.player.xp);
 assert.match(text(html),/升级后经验余额可能减少/);assert.doesNotMatch(text(html),/不再触发升级/);
 assert.equal(s.player.gold-after.player.gold,s.event.costGold);
});

test('insufficient gold keeps study unavailable while leaving its XP quote readable',()=>{
 for(const key of ['memory_archive','starlibrary']){
  const s=study(key,{xp:E.XP_CAP-10,gold:0}),choice=selected(s),html=center(s,ui);
  assert(choice.disabled);assert.match(text(html),/当前无法提交：金币不足/);assert.equal(row(html,'credited'),10);
  assert.strictEqual(accept(s),s);assert.match(html,new RegExp(`data-id="${choice.id}" disabled`));
 }
});

test('the starlibrary XP quote belongs only to study and does not turn permanent insight into an XP action',()=>{
 const s=study('starlibrary'),choices=eventChoices(s),studyChoice=choices.find(o=>o.id==='study'),insight=choices.find(o=>o.id==='insight');
 assert.match(experiencePreviewView(s,studyChoice),/data-experience-choice="study"/);
 assert.equal(experiencePreviewView(s,insight),'');assert.equal(insight.experience,undefined);
 assert.match(center(s,ui),/研读星卷 · 经验预览/);assert.match(insight.reward,/天赋点 \+1/);
});

test('repeated and frozen-state rendering never grants XP, spends gold, advances RNG or adds a receipt to the save',()=>{
 const s=study('memory_archive',{xp:E.XP_CAP-10}),bytes=S.encodeSave(s);freeze(s);
 const first=gameView(s,ui),choice=selected(s);
 for(let i=0;i<3;i++){assert.equal(gameView(s,ui),first);assert.equal(row(experiencePreviewView(s,choice),'credited'),10);}
 assert.equal(S.encodeSave(s),bytes);assert.deepEqual(S.decodeSave(bytes),s);
 assert.equal(s.event.experience,undefined);
});

test('resolved and reloaded study displays its saved outcome without recomputing a pending quote',()=>{
 const s=study('starlibrary',{xp:E.XP_CAP-10}),after=accept(s),restored=S.decodeSave(S.encodeSave(after)),html=center(restored,ui);
 assert.match(text(html),/经验计入 10/);assert.match(text(html),/上限未计入 999990/);
 assert.doesNotMatch(html,/data-experience-preview/);assert.deepEqual(eventChoices(restored),[]);
 assert.equal(restored.event.outcome,after.event.outcome);assert(S.validateSave(restored));
});

test('full-level HUD uses XP balance capacity, with a bounded and accessible progress indicator',()=>{
 for(const xp of [0,E.XP_CAP-10,E.XP_CAP]){
  const s=study('memory_archive',{xp}),before=S.encodeSave(s),html=playerExperienceView(s);
  assert.match(html,/data-level-capped="true"/);assert.match(html,/aria-label="经验余额容量"/);
  assert.match(html,/aria-valuemax="100000000"/);assert.match(html,new RegExp(`aria-valuenow="${xp}"`));
  const width=Number(html.match(/width:([\d.]+)%/)?.[1]);assert(width>=0&&width<=100);
  assert.equal(width,xp/E.XP_CAP*100);assert.match(text(html),/余额 .* \/ 100,000,000 EXP/);
  assert.doesNotMatch(html,/10,000,018/);assert.equal(S.encodeSave(s),before);
  if(xp===E.XP_CAP){assert.match(html,/data-xp-capped="true"/);assert.match(html,/经验余额已满，新增经验无法计入/);}
 }
});

test('ordinary and imported pending-level HUD states explain the real next settlement without overfilling',()=>{
 const normal=study('memory_archive',{level:20,xp:10}),normalHtml=playerExperienceView(normal);
 assert.match(normalHtml,/aria-label="角色升级进度"/);assert.match(normalHtml,/aria-valuemax="218"/);
 assert.match(normalHtml,/距离 Lv.21 还需 208 经验/);assert.doesNotMatch(normalHtml,/data-level-capped/);
 const pending=study('memory_archive',{level:100,xp:E.XP_CAP}),pendingHtml=playerExperienceView(pending);
 assert.match(text(pendingHtml),/待结算升级/);assert.match(pendingHtml,/width:100%/);
 assert.match(pendingHtml,/现有经验将在下次经验结算时用于升级/);assert.doesNotMatch(pendingHtml,/data-level-capped/);
});

test('large nominal and overflow XP are printed as complete integers rather than compact rounded amounts',()=>{
 const s=study('memory_archive',{xp:E.XP_CAP-10}),choice={...selected(s),experience:E.xpPreview(s.player.xp,1_000_000_000_003)};
 const html=experiencePreviewView(s,choice);
 assert.equal(row(html,'raw'),1_000_000_000_003);assert.equal(row(html,'credited'),10);assert.equal(row(html,'overflow'),999_999_999_993);
 assert.match(html,/1,000,000,000,003/);assert.match(html,/999,999,999,993/);assert.doesNotMatch(html,/NaN|万|亿/);
});
