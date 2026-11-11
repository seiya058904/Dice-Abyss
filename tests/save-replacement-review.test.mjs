import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {newGame} from '../src/engine.js';
import {encodeSave} from '../src/storage.js';
import {saveReplacementView} from '../src/views.js';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

const source=fileURLToPath(new URL('../',import.meta.url));
async function review(f,imported){
  const raw=f.S.encodeSave(imported);
  await f.click('settings');
  const input={id:'save-file',files:[{name:'备份-雪.json',size:Buffer.byteLength(raw),text:async()=>raw}],value:'selected'};
  f.probe.dialog.contains=node=>node===input;
  await f.listeners.document.get('change')({target:input});
  assert.equal(typeof f.probe.pending,'function');return raw;
}

test('replacement summaries show both complete balances, escape names, and only compare revisions within one run',()=>{
  const current=newGame(9),incoming=structuredClone(current);current.revision=6;incoming.revision=2;incoming.player.gold=37;
  const before=[encodeSave(current),encodeSave(incoming)],html=saveReplacementView(current,incoming,'<img src=x onerror=alert(1)>.json');
  for(const text of ['当前进度','待导入进度','80','37','3 件','保存序号较早','主存档与镜像','先导出当前进度','请确认下载完成'])assert(html.includes(text));
  assert(html.includes('&lt;img'));assert(!html.includes('<img'));
  assert.deepEqual([encodeSave(current),encodeSave(incoming)],before);
  incoming.runId='different-run';assert(!saveReplacementView(current,incoming).includes('保存序号较早'));
  assert(!saveReplacementView(null,incoming).includes('data-before-replace'));
});

test('exporting before either replacement keeps the reviewed callback, dialog and exact current bytes',async()=>{
  for(const kind of ['new','import']){
    const f=await recoveryFixture(source),incoming=f.E.newGame(19201);
    if(kind==='new')await f.click('new');else await review(f,incoming);
    assert(f.probe.dialog.innerHTML.includes('data-before-replace="true"'));
    const pending=f.probe.pending,html=f.probe.dialog.innerHTML;
    await f.click('export',{beforeReplace:'true'});
    assert.equal(await f.blobs.at(-1).text(),f.original);assert.equal(f.probe.pending,pending);
    assert.equal(f.probe.dialog.open,true);assert.equal(f.probe.dialog.innerHTML,html);assert.deepEqual(f.writes,[]);
    assert.match(f.announcer.textContent,/已发起.*请确认下载完成/);
    await f.click('close-dialog');assert.deepEqual(f.writes,[]);assert.equal(f.S.encodeSave(f.probe.state),f.original);
  }
});

test('backup then import still rejects a different complete disk snapshot even when run and revision match',async()=>{
  for(const noLocks of [false,true]){
    const f=await recoveryFixture(source,{noLocks}),incoming=f.E.newGame(19202);
    await review(f,incoming);await f.click('export',{beforeReplace:'true'});
    const donor=structuredClone(f.probe.state);donor.qaRecovery.nested.unknown.push('changed without delivery');
    const raw=f.S.encodeSave(donor);f.map.set(f.S.SAVE_KEY,raw);f.map.set(f.S.BACKUP_KEY,raw);
    await f.click('confirm');assert.equal(f.map.get(f.S.SAVE_KEY),raw);assert.equal(f.map.get(f.S.BACKUP_KEY),raw);
    assert.deepEqual(f.writes,[]);assert.match(f.announcer.textContent,/另一窗口/);
  }
});

test('import after backup keeps the durable imported primary when its mirror write fails',async()=>{
  const f=await recoveryFixture(source),incoming=f.E.newGame(19203);incoming.extra={keep:['雪',{complete:true}]};
  const raw=await review(f,incoming);await f.click('export',{beforeReplace:'true'});
  const setItem=f.storage.setItem;
  f.storage.setItem=(key,value)=>{if(key===f.S.BACKUP_KEY)throw Error('synthetic mirror quota');setItem(key,value);};
  await f.click('confirm');assert.equal(f.S.encodeSave(f.probe.state),raw);assert.equal(f.map.get(f.S.SAVE_KEY),raw);
  assert.equal(f.map.get(f.S.BACKUP_KEY),f.original);assert.match(f.announcer.textContent,/进度已保存到主存档，但镜像更新失败/);
});
