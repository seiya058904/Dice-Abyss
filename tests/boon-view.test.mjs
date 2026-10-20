import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {center,boonReadoutView,eventChoicePreviewView} from '../src/views.js';
import {eventFixture} from '../scripts/audit-event-context.mjs';

function firstCrit(killed=false){
 const s=eventFixture({E,S},'combat',{seed:7919,floor:140});
 s.player.talents.dawnCrit=3;s.nextLuck=0;s.rng=7;s.enemy.hp=killed?1:s.enemy.maxHp;s.enemy.shield=0;s.enemy.attack=1;s.player.hp=E.stats(s).maxHp;
 assert(S.validateSave(s));return s;
}

test('a real first-critical gift is never attributed to the hit currently being revealed',()=>{
 for(const killed of [false,true]){
  const before=firstCrit(killed),encoded=S.encodeSave(before),after=E.transition(before,{type:'roll'}),raw=S.encodeSave(after);
  assert.equal(after.lastRoll.critical,true);assert.equal(after.lastRoll.luck,0);assert.equal(after.nextLuck,15);assert.equal(after.lastRoll.killed,killed);
  // This is the exact impact snapshot constructed by the original app path.
  const impact=center({...after,phase:'combat'},{busy:true,rolling:false});
  assert(!impact.includes('data-ready-boon='),'newly earned luck must not be shown as already used');
  if(!killed){const ready=center(after,{busy:false,rolling:false});assert.match(ready,/data-ready-boon="nextLuck"/);assert.match(ready,/<small>下一掷生效<\/small>/);}
  else assert(!center(after,{}).includes('data-ready-boon='));
  assert.equal(S.encodeSave(before),encoded);assert.equal(S.encodeSave(after),raw);
 }
});

test('pending luck and opening echo refer to the actual before-roll snapshot, then disappear during impact',()=>{
 const s=firstCrit();s.nextLuck=5;s.enemy.openingEcho=.25;const raw=S.encodeSave(s);
 const ready=center(s,{}),rolling=center(s,{busy:true,rolling:true});
 for(const html of [ready,rolling]){assert.match(html,/data-ready-boon="nextLuck"/);assert.match(html,/data-ready-boon="openingEcho"/);}
 assert.match(ready,/<small>下一掷生效<\/small>/);assert.match(rolling,/<small>本掷生效<\/small>/);
 const after=E.transition(s,{type:'roll'});assert.equal(after.lastRoll.luck,E.stats(s).luck);assert.equal(after.enemy.openingEcho,0);
 assert(!center({...after,phase:'combat'},{busy:true,rolling:false}).includes('data-ready-boon='));
 assert.equal(S.encodeSave(s),raw);
});

test('the paid ward readout explains the real shield cap without promising an immediate shield gain',()=>{
 const s=eventFixture({E,S},'wardbank',{seed:7919,floor:140,rich:true});s.ward=1e15;assert(S.validateSave(s));
 const paid=E.transition(s,{type:'event-choice',id:'accept',confirmed:true}),battle=E.transition(paid,{type:'next'});
 assert.equal(paid.ward,s.ward);assert.equal(battle.ward,s.ward);assert.equal(battle.v5Boons.ward,0);
 assert.match(boonReadoutView(paid),/最终护盾受现有数值上限限制，已满时不再增加/);
 const preview=eventChoicePreviewView(s,'accept');assert.match(preview,/当前护盾不变/);assert.match(preview,/最终护盾受现有数值上限限制/);assert(!preview.includes('data-preview-key="ward"'));
});
