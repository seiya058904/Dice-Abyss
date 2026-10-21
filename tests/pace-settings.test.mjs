import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSettings} from '../src/storage.js';
import {settingsView} from '../src/views.js';
test('old and invalid settings retain standard pace; fast pace is independent of quality',()=>{
 for(const raw of [null,'{',JSON.stringify({effects:'full'}),JSON.stringify({fastPace:'true'})])assert.equal(loadSettings({getItem:()=>raw}).fastPace,false);
 for(const effects of ['full','low']){
  const s=loadSettings({getItem:()=>JSON.stringify({fastPace:true,effects,sound:true,scale:1.1})});
  assert.deepEqual(s,{fastPace:true,effects,sound:true,scale:1.1});
  assert.match(settingsView(s,true),/aria-label="加速节奏" aria-checked="true"/);
 }
});
