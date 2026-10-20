import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import * as V from '../src/views.js';
import {boonReadout} from '../src/boon-readout.js';
import {eventFixture} from '../scripts/audit-event-context.mjs';

const scene=(type='combat')=>eventFixture({E,S},type,{seed:27017,floor:200,rich:true});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};

function assertPanels(s,ui){
 const before=JSON.stringify({s,ui}),html=V.gameView(s,ui),workbench=ui.view==='game'&&s.phase==='fusion';
 assert(html.includes(V.center(s,ui)));assert(html.includes(V.footer(s,ui)));
 if(!workbench&&ui.view!=='talents'){
  assert(html.includes(V.routeRail(s,ui)));
  if(!(ui.view==='game'&&s.phase==='loot'))assert(html.includes(V.equipmentRail(s)));
 }
 assert.equal(JSON.stringify({s,ui}),before);return html;
}

test('one render agrees with the standalone panels for current benefits and animation phases',()=>{
 const s=scene();s.player.talents.dawnCrit=3;s.nextLuck=15;s.eventLuck=8;s.eventPower=15;s.blessing=2;s.v5Boons={echo:1,ward:1};s.enemy.openingEcho=.25;
 for(const firstCritUsed of [undefined,false,true]){
  if(firstCritUsed===undefined)delete s.enemy.firstCritUsed;else s.enemy.firstCritUsed=firstCritUsed;
  for(const ui of [{view:'game',busy:false},{view:'game',busy:true,rolling:true,rollValues:[6,6,6,6,6,6]},{view:'game',busy:true,rolling:false},{view:'inventory',boonDetails:true},{view:'talents',talentGroup:'critical'},{view:'codex',codexSource:'boss'}])assertPanels(s,ui);
 }
});

test('provided stats are read-only and produce the same detached benefit model as standalone reads',()=>{
 const s=scene();s.player.talents.dawnCrit=3;s.nextLuck=15;s.eventLuck=8;const before=S.encodeSave(s),st=freeze(E.stats(s)),state=freeze(s);
 const model=boonReadout(state,st);assert.deepEqual(model,boonReadout(state));model.groups[0].entries[0].detail='Caller formatting only';
 assert.deepEqual(boonReadout(state,st),boonReadout(state));assert.equal(S.encodeSave(state),before);assertPanels(state,{view:'game'});
});

test('successive renders observe equipment, talent and spent-trigger changes on the same state object',()=>{
 const s=scene(),armor=E.makeItem(s,'armor',7);s.player.items.push(armor);
 const original=assertPanels(s,{view:'game'});assert(!original.includes('data-boon-key="firstCritLuck"'));
 s.player.talents.dawnCrit=3;s.player.equipped.armor=armor.id;s.player.hp=Math.min(s.player.hp,E.stats(s).maxHp);
 const equipped=assertPanels(s,{view:'game'});assert.notEqual(equipped,original);assert.match(equipped,/本场尚未触发/);
 s.enemy.firstCritUsed=true;const spent=assertPanels(s,{view:'game'});assert.match(spent,/本场已触发/);assert.notEqual(spent,equipped);
 s.player.talents.dawnCrit=0;s.player.equipped.armor='i2';s.player.hp=Math.min(s.player.hp,E.stats(s).maxHp);
 const removed=assertPanels(s,{view:'game'});assert(!removed.includes('data-boon-key="firstCritLuck"'));assert(S.validateSave(s));
});

test('fusion workbench and talent views do not derive benefits they do not render',()=>{
 for(const [state,ui]of [[scene('fusion'),{view:'game'}],[scene(),{view:'talents',talentGroup:'critical'}]]){
  Object.defineProperty(state,'v5Boons',{get(){assert.fail('unused reserve model must not be read');}});
  const html=V.gameView(state,ui);assert(!html.includes('class="boon-readout"'));assert(html.includes(V.footer(state,ui)));
 }
});

test('rendering cannot change the next combat transaction or its complete RNG snapshot',()=>{
 const s=scene();s.player.talents.dawnCrit=3;s.nextLuck=15;s.eventLuck=8;s.enemy.openingEcho=.25;
 const before=S.encodeSave(s),after=E.transition(s,{type:'roll'});
 for(const ui of [{view:'game'},{view:'game',busy:true,rolling:true},{view:'game',busy:true,rolling:false},{view:'inventory'}])assertPanels(s,ui);
 assert.equal(S.encodeSave(s),before);assert.deepEqual(E.transition(s,{type:'roll'}),after);
});
