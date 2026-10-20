import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';
import {eventFixture} from '../scripts/audit-event-context.mjs';

// Real application continuations, transitions and complete persisted records;
// the existing harness substitutes DOM/focus/FX. Native resize and real speech
// are separate checks. No production clock or save implementation is patched.
const source=fileURLToPath(new URL('../',import.meta.url));
const room=type=>eventFixture({E,S},type,{seed:251025,floor:140,rich:true});
const fresh=E.newGame(13013);fresh.runId='round25-announcement-fate';
const forge=room('forge');
const scenes=[
  {name:'fate',state:fresh,action:{type:'fate'},text:/命运骰 .*本层路线已生成/},
  {name:'combat',state:room('combat'),action:{type:'roll'},text:/掷出 .*实际削减敌人生命/},
  {name:'chest',state:room('chest'),action:{type:'open'},text:/获得.*金币/},
  {name:'forge',state:forge,action:{type:'forge',id:forge.player.equipped.weapon},text:/强化增加.*Lv\. 保持不变/},
  {name:'blessing',state:room('altar'),action:{type:'bless'},text:/祝福骰 .*本层祝福已保存/},
  ...['gambit','wishingvault'].map(name=>({name,state:room(name),action:{type:'event-choice',id:'roll',confirmed:true},text:null})),
];
async function fixture(state=fresh,options={}) {
  const f=await recoveryFixture(source,{...options,state:structuredClone(state)});
  await f.click('continue');
  const messages=[];let text='';
  Object.defineProperty(f.announcer,'textContent',{get:()=>text,set:value=>{text=value;messages.push(value);}});
  return {...f,messages,resize:()=>f.listeners.window.get('resize')()};
}
const records=f=>[f.storage.getItem(S.SAVE_KEY),f.storage.getItem(S.BACKUP_KEY)];
async function startAt(f,action,ready=()=>true) {
  const running=f.probe.act(action);
  for(let step=0;step<20;step++) {
    await Promise.resolve();
    if(f.probe.ui.busy&&ready())return {running};
  }
  assert.fail('The real app must reach the requested asynchronous presentation phase');
}
function exactCommit(f,expected) {
  assert.deepEqual(f.probe.state,expected);
  assert.deepEqual(records(f),[S.encodeSave(expected),S.encodeSave(expected)]);
  assert.deepEqual(f.writes.map(([key])=>key),[S.SAVE_KEY,S.BACKUP_KEY]);
}

for(const scene of scenes)test(`${scene.name}: early resize publishes the same complete result once as normal reveal`,async()=>{
  const normal=await fixture(scene.state),expected=E.transition(normal.probe.state,scene.action);
  assert.notDeepEqual(expected,normal.probe.state);assert(S.validateSave(expected));
  await normal.probe.act(scene.action);
  assert.equal(normal.messages.length,1,'Normal reveal also publishes only once');
  if(scene.text)assert.match(normal.messages[0],scene.text);
  else assert.equal(normal.messages[0],expected.event.outcome);
  exactCommit(normal,expected);

  const early=await fixture(scene.state),{running}=await startAt(early,scene.action);
  assert.equal(early.messages.length,0,'Resize is injected before result announcement');
  exactCommit(early,expected);
  const saved=records(early),writes=early.writes.length;
  early.resize();early.resize();await running;early.resize();
  assert.equal(early.probe.ui.busy,false);
  assert.deepEqual(early.messages,normal.messages);
  assert.deepEqual(records(early),saved);assert.equal(early.writes.length,writes);
  assert.deepEqual(early.probe.state,expected,'Old continuations cannot replay a transition');
});

test('resizing or skipping an event after reveal does not repeat its outcome',async()=>{
  const scene=scenes.find(scene=>scene.name==='gambit'),f=await fixture(scene.state);
  const {running}=await startAt(f,scene.action,()=>f.messages.length>0);
  assert.equal(f.probe.ui.rolling,false);assert.equal(f.messages.length,1);
  const saved=records(f),messages=[...f.messages];
  f.resize();await f.click('skip');await running;f.resize();
  assert.deepEqual(f.messages,messages);assert.deepEqual(records(f),saved);
});

test('explicit event Skip before reveal uses the shared one-shot announcement',async()=>{
  const scene=scenes.find(scene=>scene.name==='wishingvault'),f=await fixture(scene.state);
  const {running}=await startAt(f,scene.action),expected=f.probe.state.event.outcome,saved=records(f);
  assert.equal(f.messages.length,0);
  await f.click('skip');await running;await f.click('skip');
  assert.deepEqual(f.messages,[expected]);assert.deepEqual(records(f),saved);
});

test('early result keeps a mirror warning first and leaves its visible warning and old mirror intact',async()=>{
  const f=await fixture(),write=f.storage.setItem;
  f.storage.setItem=(key,value)=>{if(key===S.BACKUP_KEY)throw Error('synthetic mirror quota');write(key,value);};
  const {running}=await startAt(f,{type:'fate'}),warning=f.probe.ui.saveError,saved=records(f);
  assert.match(warning,/镜像/);assert.deepEqual(f.messages,[warning]);
  f.resize();await running;
  assert.equal(f.messages.length,2);assert(f.messages[1].startsWith(warning+' '));
  assert.match(f.messages[1],/命运骰 .*本层路线已生成/);
  assert(f.app.innerHTML.includes(warning),'The current save warning remains visible');
  assert.deepEqual(records(f),saved);assert.equal(saved[1],f.original);
  assert.equal(f.writes.length,1,'Only the original successful primary write occurred');
});

test('same-run storage replacement cancels the pending result before an old continuation resumes',async()=>{
  const f=await fixture(),{running}=await startAt(f,{type:'fate'});
  const updated=E.transition(f.probe.state,{type:'lock',id:f.probe.state.player.items[0].id}),raw=S.encodeSave(updated);
  assert.equal(updated.runId,f.probe.state.runId);
  f.map.set(S.SAVE_KEY,raw);f.map.set(S.BACKUP_KEY,raw);f.emit(S.SAVE_KEY);
  assert.equal(f.probe.ui.busy,false);const messages=[...f.messages];
  assert.deepEqual(messages,['已同步另一窗口的最新进度。']);
  await running;f.resize();
  assert.deepEqual(f.messages,messages);assert.deepEqual(f.probe.state,updated);
  assert.deepEqual(records(f),[raw,raw]);assert.equal(f.writes.length,2);
});

test('save recovery cancellation never publishes the superseded pending animation result',async()=>{
  const f=await fixture(),{running}=await startAt(f,{type:'fate'}),committed=structuredClone(f.probe.state);
  f.map.clear();f.emit(null);assert(f.probe.ui.saveRecovery);
  const messages=[...f.messages];assert.equal(messages.length,1);
  await running;f.resize();
  assert.deepEqual(f.messages,messages);assert.deepEqual(f.probe.state,committed);
  assert.deepEqual(records(f),[null,null]);assert.equal(f.writes.length,2);
});

test('a failed primary save cannot queue or announce an uncommitted result',async()=>{
  const f=await fixture(),before=structuredClone(f.probe.state),saved=records(f);
  f.storage.setItem=()=>{throw Error('synthetic primary quota');};
  await f.probe.act({type:'fate'});
  assert.equal(f.probe.ui.busy,false);assert.equal(f.messages.length,1);assert.match(f.messages[0],/保存/);
  const messages=[...f.messages];f.resize();await f.click('skip');
  assert.deepEqual(f.messages,messages);assert.deepEqual(f.probe.state,before);
  assert.deepEqual(records(f),saved);assert.equal(f.writes.length,0);
});
