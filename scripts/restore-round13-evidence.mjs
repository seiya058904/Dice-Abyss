// Reconstruct the two complete, byte-identical original Round 13 paid-window
// reports from a losslessly deduplicated evidence file. This is an offline
// artifact utility; it never imports gameplay code or writes a player save.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{
  const at=value.indexOf('=');
  assert(at>0,'Use --evidence=FILE --output=NEW_DIRECTORY');
  return [value.slice(0,at),value.slice(at+1)];
}));
assert(args['--output'],'An explicit --output=NEW_DIRECTORY is required.');
assert(Object.keys(args).every(key=>['--output','--evidence'].includes(key)),'Unknown argument.');
const input=args['--evidence']||fileURLToPath(new URL('../docs/iteration/evidence/round13/deep-decisions-lossless.json',import.meta.url));
const archive=JSON.parse(await readFile(input,'utf8'));
assert.equal(archive.format,'dice-abyss-evidence-pair-v1');
assert.equal(archive.variants.length,2);
const restored=archive.variants.map(variant=>{
  assert(/^[A-Za-z0-9_-]+\.json$/.test(variant.file),'Unsafe evidence filename.');
  const report={};
  assert.equal(new Set(variant.order).size,variant.order.length);
  for(const key of variant.order){
    assert(Object.hasOwn(variant.fields,key)||Object.hasOwn(archive.shared,key),`Missing field: ${key}`);
    report[key]=Object.hasOwn(variant.fields,key)?variant.fields[key]:archive.shared[key];
  }
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  assert.equal(bytes.length,variant.bytes,`${variant.file}: complete byte length`);
  assert.equal(sha256,variant.sha256,`${variant.file}: complete original SHA-256`);
  return {file:variant.file,bytes,sha256};
});
assert.equal(new Set(restored.map(row=>row.file)).size,restored.length);
const output=path.resolve(args['--output']);
await mkdir(output,{recursive:true});
for(const row of restored)await writeFile(path.join(output,row.file),row.bytes,{flag:'wx'});
console.log(JSON.stringify({status:'PASS_LOSSLESS_RECONSTRUCTION',output,files:restored.map(({file,bytes,sha256})=>({file,bytes:bytes.length,sha256}))},null,2));
