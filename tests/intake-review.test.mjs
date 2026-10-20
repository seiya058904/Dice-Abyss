import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {center, gameView} from '../src/views.js';

const ui={screen:'game',view:'game',busy:false,rolling:false,forging:false};
function fused() {
  let state=E.transition(E.newGame(4),{type:'fate'});
  state.route[0].type='fusion';
  state=E.transition(state,{type:'enter'});
  state.player.gold=100000;
  const material=E.makeItem(state,'weapon',0);
  state.player.items.push(material);
  return E.transition(state,{type:'fuse',target:state.player.equipped.weapon,material:material.id});
}

test('a readable fusion save without an optional historical consumption list can resume',()=>{
  const state=fused();
  delete state.lastForge.consumed;
  state.lastForge.extraHistory={source:'preserved import metadata'};
  assert(S.validateSave(state));
  const raw=S.encodeSave(state),restored=S.decodeSave(raw);
  const html=gameView(restored,ui);
  assert.match(html,/历史消耗数量未记录/);
  assert.doesNotMatch(html,/0 件材料已汇入目标/);
  assert.equal(S.encodeSave(restored),raw,'rendering must not manufacture or rewrite history');
});

test('a normal fusion result retains its recorded material count and complete save',()=>{
  const state=fused(),raw=S.encodeSave(state);
  assert.deepEqual(state.lastForge.consumed.length,1);
  assert.match(gameView(state,ui),/1 件材料已汇入目标/);
  assert.equal(S.encodeSave(state),raw);
});

test('double-fate reward wording distinguishes the nominal award from capped credit',()=>{
  for(const held of [E.GOLD_CAP-10,E.GOLD_CAP]) {
    const before=E.newGame(6);before.player.gold=held;
    const after=E.transition(before,{type:'fate'});
    assert.deepEqual(after.fate,[2,2]);
    assert.equal(after.player.gold-held,Math.min(25,E.GOLD_CAP-held));
    const raw=S.encodeSave(after),html=center(after,ui);
    assert.match(html,/标称奖励 25 金币/);
    assert.match(html,/超出持有上限的部分不会计入/);
    assert.doesNotMatch(html,/额外获得 25 金币/);
    assert.equal(S.encodeSave(after),raw);
  }
});
