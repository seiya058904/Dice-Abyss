import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition} from '../src/engine.js';
import {SAVE_KEY,BACKUP_KEY,loadSave,loadSettings,inspectSaveRecovery,readLegacyBackup,restoreMissingSave,saveGame,saveImportedGame,encodeSave} from '../src/storage.js';

test('denied localStorage getter reaches read/recovery/write error handling',t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('Storage access denied','SecurityError');}});
  const state=newGame(21021),before=structuredClone(state);
  const loaded=loadSave();
  assert.equal(loaded.state,null);
  assert.match(loaded.error,/无法读取存档/);
  assert.deepEqual(loadSettings(),{fastPace:false,sound:false,effects:'full',scale:1});
  assert.equal(readLegacyBackup(),null);
  assert.equal(inspectSaveRecovery().status,'unreadable');
  assert.throws(()=>restoreMissingSave(state,{primary:null,mirror:null}),/无法检查浏览器中的存档/);
  assert.throws(()=>saveGame(state,null),/浏览器无法保存进度/);
  assert.throws(()=>saveImportedGame(state,encodeSave(state),null),/浏览器无法保存进度/);
  assert.deepEqual(state,before);
});

test('default storage remains live across denial and restored permission',t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
  const records=new Map(),writes=[];
  const storage={getItem(key){assert.equal(this,storage);return records.get(key)??null;},setItem(key,value){assert.equal(this,storage);writes.push(key);records.set(key,value);}};
  let denied=false;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){if(denied)throw new DOMException('Storage access denied','SecurityError');return storage;}});
  const state=newGame(21022);
  assert.equal(saveGame(state,null).mirrored,true);
  assert.deepEqual(writes,[SAVE_KEY,BACKUP_KEY]);
  assert.deepEqual(loadSave().state,state);
  const next=transition(state,{type:'fate'}),before=new Map(records);
  denied=true;
  assert.equal(loadSave().state,null);
  assert.throws(()=>saveGame(next,state),/另一窗口已更新进度/);
  assert.deepEqual(records,before);
  denied=false;
  assert.equal(saveGame(next,state).mirrored,true);
  assert.deepEqual(loadSave().state,next);
  assert.equal(records.get(SAVE_KEY),records.get(BACKUP_KEY));
});
