import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=new URL('../scripts/prepare-stage-probe.mjs',import.meta.url);
for(const ending of ['\n','\r\n'])for(const matching of [true,false]){
 test(`stage probe ${JSON.stringify(ending)} ${matching?'records lock wait':'rejects missing lock target'}`,async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dice-stage-probe-test-'));await fs.mkdir(path.join(dir,'src'));
  const names={storage:['checksum','validateSave','validateSaveData','encodeSave','encodeWritableSave','decodeStoredSave','loadStoredSave','assertSaveSnapshot','saveGame'],engine:['canAct','transition'],app:['render']};
  for(const [file,functions] of Object.entries(names)){
   let source=functions.map(name=>`export function ${name}(){return 1;}`).join(ending);
   if(file==='app'&&matching)source+=ending+["const withSaveLock = task => navigator.locks?.request","  ? navigator.locks.request('dice-abyss:save-write', task)","  : Promise.resolve().then(task);"].join(ending);
   await fs.writeFile(path.join(dir,'src',file+'.js'),source);
  }
  const result=spawnSync(process.execPath,[fileURLToPath(script),dir],{encoding:'utf8'});
  if(matching){assert.equal(result.status,0,result.stderr);assert.match(await fs.readFile(path.join(dir,'src/app.js'),'utf8'),/performance.measure\('app:WebLock-wait'/);}
  else {assert.notEqual(result.status,0);assert.match(result.stderr,/Web Locks instrumentation must match exactly once/);}
 });
}
