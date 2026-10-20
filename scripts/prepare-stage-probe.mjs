// Instrument only an explicitly supplied external copy, never the source tree.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const target=path.resolve(process.argv[2]||'');
assert(target!==root&&!target.startsWith(root+path.sep),'External copy required');
const manifest={};
for(const [file,names] of Object.entries({
 'storage.js':['checksum','validateSave','validateSaveData','encodeSave','encodeWritableSave','decodeStoredSave','loadStoredSave','assertSaveSnapshot','saveGame'],
 'engine.js':['canAct','transition'],
 'app.js':['render'],
})){
 const p=path.join(target,'src',file);let source=await fs.readFile(p,'utf8');
 assert(!source.includes('__stage_'),'Never instrument a copy twice');
 manifest[file]={before:createHash('sha256').update(source).digest('hex')};
 for(const name of names){
  const re=new RegExp(`(export )?function ${name}\\(`);const match=source.match(re);assert(match,name);
  source=source.replace(re,`function __stage_${name}(`);
  source+=`\n${match[1]||''}function ${name}(...args){const start=performance.now();try{return __stage_${name}(...args);}finally{performance.measure('${file}:${name}',{start,end:performance.now()});}}\n`;
 }
 if(file==='storage.js'&&source.includes('function exceedsUtf8Limit(')){
  source=source.replace('function exceedsUtf8Limit(','function __stage_exceedsUtf8Limit(');
  source+="\nfunction exceedsUtf8Limit(...args){const start=performance.now();try{return __stage_exceedsUtf8Limit(...args);}finally{performance.measure('storage.js:exceedsUtf8Limit',{start,end:performance.now()});}}\n";
 }
 if(file==='storage.js'){
  // Scope JSON timing to storage calls; do not perturb rendering JSON.
  source=source.replaceAll('JSON.stringify(', "__stageJSON('stringify',").replaceAll('JSON.parse(', "__stageJSON('parse',");
  source+="\nfunction __stageJSON(method,...args){const start=performance.now();try{return JSON[method](...args);}finally{performance.measure('storage:JSON.'+method,{start,end:performance.now()});}}\n";
 }
 if(file==='app.js'){
  source=source.replace("const withSaveLock = task => navigator.locks?.request\n  ? navigator.locks.request('dice-abyss:save-write', task)\n  : Promise.resolve().then(task);",
   "const withSaveLock = task => {const start=performance.now();const measured=()=>{performance.measure('app:WebLock-wait',{start,end:performance.now()});return task();};return navigator.locks?.request ? navigator.locks.request('dice-abyss:save-write',measured) : Promise.resolve().then(measured);};");
 }
 await fs.writeFile(p,source);manifest[file].after=createHash('sha256').update(source).digest('hex');
}
await fs.writeFile(path.join(target,'stage-probe-sha256.json'),JSON.stringify(manifest,null,2));
