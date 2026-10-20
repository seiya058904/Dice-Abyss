import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Read-only source integration probe. UI methods are counters/stubs, so this
// verifies the actual application branch logic, not native focus or rendering.
const root=path.resolve(process.argv[2]||'/workspace/scratch/16b883e72bb3/work/Dice-Abyss');
const output=path.resolve(process.argv[3]||'/workspace/scratch/16b883e72bb3/scratch-evidence/capacity/ui-handler-probe.json');
const src=await fs.readFile(path.join(root,'src/app.js'),'utf8');
const S=await import(pathToFileURL(path.join(root,'src/storage.js')));
const E=await import(pathToFileURL(path.join(root,'src/engine.js')));
const V=await import(pathToFileURL(path.join(root,'src/views.js')));
const C=await import(pathToFileURL(path.join(root,'src/save-capacity-view.js')));
const marker="window.addEventListener('storage', ";
const start=src.indexOf(marker),end=src.indexOf('\n});\nrender();',start);
assert(start>=0&&end>start);
const storageExpression=src.slice(start+marker.length,end+2);
const capacityStart=src.indexOf("  if (action === 'save-capacity') {");
const capacityEnd=src.indexOf("  if (action === 'fullscreen')",capacityStart);
const capacityExpression=`(function(control){const action=control.dataset.action;${src.slice(capacityStart,capacityEnd)}})`;
const exportStart=src.indexOf("  if (action === 'export') {");
const exportEnd=src.indexOf("  if (action === 'export-legacy')",exportStart);
const exportExpression=`(function(control){const action=control.dataset.action;${src.slice(exportStart,exportEnd)}})`;
const report={scope:'Actual source-extracted app.js storage/capacity/export branches with real storage codec and capacity/view functions; memory Storage and DOM counter stubs. No browser was started and native modal/focus semantics are outside this probe.',sourceRoot:root,sourceSha256:createHash('sha256').update(src).digest('hex'),cases:[],limitations:[]};
const snapshotsEqual=(actual,expected)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected));
function fixture(seed=12345){
 const state=E.newGame(seed);state.extraRecord={text:'额外记录🜁',future:{keep:[1,2,3]}};
 const raw=S.encodeSave(state),store=new Map([[S.SAVE_KEY,raw],[S.BACKUP_KEY,raw]]),calls={reads:0,writes:0,render:0,close:0,cancelSettings:0,cancelAction:0,clearSelections:0,committed:0,notices:[],downloads:[],revoked:[]};
 const storage={getItem(key){calls.reads++;return store.get(key)||null;},setItem(key,value){calls.writes++;store.set(key,String(value));},removeItem(key){calls.writes++;store.delete(key);}};
 const capacityResult={innerHTML:'',textContent:''},control={dataset:{action:'save-capacity'},textContent:'检查容量'};
 const document={activeElement:control,createElement(type){assert.equal(type,'a');return {click(){calls.downloads.push({href:this.href,name:this.download});}};}};
 const blobMap=new Map();let nextBlob=1;
 const ctx={state,ui:{busy:false,rolling:false,forging:false,saveError:''},settings:{sound:false,effects:'low',scale:1},pending:()=>{},visualState:null,animationGeneration:0,
  SAVE_KEY:S.SAVE_KEY,BACKUP_KEY:S.BACKUP_KEY,
  loadSave:()=>S.loadSave(storage),encodeSave:S.encodeSave,measureSaveCapacity:S.measureSaveCapacity,saveCapacityView:C.saveCapacityView,
  rawSave:()=>store.get(S.SAVE_KEY)||store.get(S.BACKUP_KEY)||null,
  settingsFocus:{cancel(){calls.cancelSettings++;}},actionFocus:{cancel(){calls.cancelAction++;}},clearRunSelections(){calls.clearSelections++;},fusion:{committed(){calls.committed++;}},render(){calls.render++;},notify(message){calls.notices.push(message);},
  dialog:{open:true,close(){this.open=false;calls.close++;},querySelector(selector){assert.equal(selector,'#save-capacity-result');return capacityResult;}},
  document,Blob,URL:{createObjectURL(blob){const url=`blob:probe-${nextBlob++}`;blobMap.set(url,blob);return url;},revokeObjectURL(url){calls.revoked.push(url);}},setTimeout(callback){callback();}
 };
 vm.createContext(ctx);
 const handle=vm.runInContext(`(${storageExpression})`,ctx),check=vm.runInContext(capacityExpression,ctx),exportSave=vm.runInContext(exportExpression,ctx);
 return {ctx,calls,store,storage,raw,capacityResult,control,blobMap,handle,check(){check(control);},async exportRaw(){exportSave({dataset:{action:'export'}});return blobMap.get(calls.downloads.at(-1).href).text();}};
}
function record(name,details){report.cases.push({name,status:'PASS',...details});}

{
 const f=fixture();const before=JSON.stringify(f.ctx.state);f.check();
 assert(f.capacityResult.innerHTML.includes(S.measureSaveCapacity(f.ctx.state).bytes.toLocaleString('en-US')));
 assert.equal(f.calls.reads,0);assert.equal(f.calls.writes,0);assert.equal(f.calls.render,0);assert.equal(f.ctx.document.activeElement,f.control);assert.equal(JSON.stringify(f.ctx.state),before);
 record('explicit-check-is-local-read-only',{storeReads:0,storeWrites:0,sceneRenders:0,inputUnchanged:true,controlIdentityPreserved:true});
}
{
 const f=fixture();f.check();const oldBytes=S.measureSaveCapacity(f.ctx.state).bytes;
 const next=E.transition(f.ctx.state,{type:'fate'}),nextRaw=S.encodeSave(next);f.store.set(S.SAVE_KEY,nextRaw);f.store.set(S.BACKUP_KEY,nextRaw);
 f.handle({key:S.SAVE_KEY});snapshotsEqual(f.ctx.state,next);assert.equal(f.ctx.dialog.open,false);assert.equal(f.calls.cancelSettings,1);assert.equal(f.calls.cancelAction,1);assert.equal(f.ctx.pending,null);assert.equal(f.ctx.animationGeneration,1);
 assert.equal(await f.exportRaw(),nextRaw);assert.equal(f.calls.writes,0);
 const fresh=V.settingsView(f.ctx.settings,true,false,false);assert(fresh.includes('按需检查当前进度'));assert(!fresh.includes('capacity-reading'));
 f.capacityResult.innerHTML='';f.ctx.dialog.open=true;f.check();const newBytes=S.measureSaveCapacity(next).bytes;assert.notEqual(oldBytes,newBytes);assert(f.capacityResult.innerHTML.includes(newBytes.toLocaleString('en-US')));
 record('valid-other-tab-commit-invalidates-old-dialog',{oldBytes,newBytes,closed:true,fullStateEqual:true,exportMatchesNewState:true,reopenStartsUnmeasured:true,storeWrites:0});
}
{
 const f=fixture();f.check();const before=f.capacityResult.innerHTML;const next=structuredClone(f.ctx.state);next.extraRecord.future.keep.push(99);const nextRaw=S.encodeSave(next);f.store.set(S.SAVE_KEY,nextRaw);f.store.set(S.BACKUP_KEY,nextRaw);
 f.handle({key:S.SAVE_KEY});assert.equal(f.ctx.dialog.open,false);snapshotsEqual(f.ctx.state,next);assert.equal(f.ctx.state.revision,0);assert.equal(await f.exportRaw(),nextRaw);
 record('same-revision-unknown-field-branch-is-not-stale',{sameRevision:true,fullUnknownFieldUpdate:true,closed:true,exportMatchesNewState:true});
}
{
 const f=fixture();f.check();const before=f.capacityResult.innerHTML,stateRef=f.ctx.state;f.ctx.ui.saveError='主存档可用，但镜像尚未同步。';f.handle({key:S.BACKUP_KEY});
 assert.equal(f.ctx.dialog.open,true);assert.equal(f.capacityResult.innerHTML,before);assert.equal(f.ctx.state,stateRef);assert.equal(f.ctx.ui.saveError,'');assert.equal(f.calls.render,1);assert.equal(f.calls.writes,0);
 record('same-state-mirror-completion-keeps-valid-result',{sameStateReference:true,capacityUnchanged:true,warningCleared:true,dialogPreserved:true,storeWrites:0});
}
{
 const f=fixture();f.check();const before=f.capacityResult.innerHTML;f.store.set(S.SAVE_KEY,'corrupt-primary');f.store.set(S.BACKUP_KEY,'corrupt-mirror');f.handle({key:S.SAVE_KEY});
 assert.equal(f.ctx.dialog.open,true);assert.equal(f.capacityResult.innerHTML,before);assert.equal(S.encodeSave(f.ctx.state),f.raw);assert(f.ctx.ui.saveError.includes('无法读取存档'));assert(f.calls.notices.some(message=>message.includes('无法读取存档')));assert.equal(await f.exportRaw(),f.raw);
 const next=E.transition(f.ctx.state,{type:'fate'});assert.throws(()=>S.saveGame(next,f.ctx.state,f.storage),/另一窗口已更新进度/);assert.equal(f.calls.writes,0);
 record('unreadable-other-tab-data-preserves-current-memory-export',{visibleLoadFailure:true,capacityStillMeasuresRetainedMemory:true,exportMatchesLastValidState:true,conflictingWriteRejected:true,storeWrites:0});
}
{
 const f=fixture();f.check();const before=f.capacityResult.innerHTML;f.store.clear();f.handle({key:null});f.handle({key:S.SAVE_KEY});f.handle({key:S.BACKUP_KEY});
 assert.equal(f.ctx.dialog.open,true);assert.equal(f.capacityResult.innerHTML,before);assert.equal(f.calls.close,0);assert.equal(f.calls.notices.length,0);assert.equal(S.encodeSave(f.ctx.state),f.raw);assert.equal(await f.exportRaw(),f.raw);
 const next=E.transition(f.ctx.state,{type:'fate'});assert.throws(()=>S.saveGame(next,f.ctx.state,f.storage),/另一窗口已更新进度/);assert.equal(f.calls.writes,0);
 record('all-copies-removed-existing-behavior',{observed:'The pre-existing storage listener ignores key=null and has no missing-both-copies branch. In-memory progress/capacity/export remain available; expected-snapshot guard rejects a later write.',currentMemoryPreserved:true,exportMatchesLastValidState:true,conflictingWriteRejected:true,storeWrites:0});
 report.limitations.push('Removing all save keys (including localStorage.clear) does not immediately close settings or warn; this listener is unchanged from V5.11. The result still describes retained in-memory progress and export, while a later write is rejected by full expected validation.');
}

assert.equal(createHash('sha256').update(await fs.readFile(path.join(root,'src/app.js'))).digest('hex'),report.sourceSha256);
report.sourceUnchanged=true;report.status='PASS';report.finished=new Date().toISOString();
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases:report.cases.length,limitations:report.limitations.length,output}));
