// Restore complete, unprojected Round14 single-item branch reports.
// Built-in Node modules only; this never imports or runs game code.
// node scripts/restore-round14-evidence.mjs --output /tmp/round14-restored
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,basename,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--output'&&args[1],'Usage: --output /path/outside/project');
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(args[1]),rel=relative(project,output);
assert(rel.startsWith('..'+sep)||isAbsolute(rel),'Restore outside the project. Existing files are never overwritten.');
const root=resolve(project,'docs/iteration/evidence/round14/gameplay'),manifest=JSON.parse(await readFile(resolve(root,'defeat-options-manifest.json'),'utf8'));
assert.equal(manifest.format,'dice-abyss-round14-common-gzip-evidence-v1');
const hash=raw=>createHash('sha256').update(raw).digest('hex'),restored=[];
await mkdir(output,{recursive:true});
const common=manifest.common;assert.equal(basename(common.archive),common.archive);
const archive=await readFile(resolve(root,common.archive));assert.equal(archive.length,common.archiveBytes);assert.equal(hash(archive),common.archiveSha256);
const commonRaw=gunzipSync(archive);assert.equal(commonRaw.length,common.bytes);assert.equal(hash(commonRaw),common.sha256);
for(const record of manifest.records){
 assert.equal(basename(record.name),record.name);
 const value=JSON.parse(commonRaw);
 for(const [key,replacement]of Object.entries(record.identityUpdates)){
  assert(['source','sourceVersion'].includes(key),'Only observed identity differences are stored separately.');
  assert(Object.hasOwn(value,key));value[key]=replacement;
 }
 assert.deepEqual(Object.keys(value),record.rootKeys);
 const raw=Buffer.from(JSON.stringify(value,null,2)+'\n');assert.equal(raw.length,record.bytes);assert.equal(hash(raw),record.sha256);
 await writeFile(resolve(output,record.name),raw,{flag:'wx'});
 restored.push({file:resolve(output,record.name),bytes:raw.length,sha256:hash(raw)});
}
console.log(JSON.stringify({restored,description:'Full original JSON bytes restored and SHA256 verified. No game code executed.'}));
