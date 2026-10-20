// Lossless reconstruction of the compact Round14 performance evidence package.
// Reports are archived whole: no slow samples, HTML fields or failure rows are
// removed to meet the ZIP budget. See MANIFEST.json for deliberate raw omissions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const options=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');assert(at>0,'Arguments use --name=value');return[value.slice(0,at),value.slice(at+1)];}));
const root=path.resolve(fileURLToPath(new URL('../docs/iteration/evidence/round14/performance/',import.meta.url))),output=path.resolve(options['--output']||'/tmp/dice-round14-performance-restored');
const manifest=JSON.parse(await fs.readFile(path.join(root,'MANIFEST.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const local=(directory,file)=>{
 assert(typeof file==='string'&&file.length&&!path.isAbsolute(file),'Evidence paths must be relative');
 const absolute=path.resolve(directory,file),relative=path.relative(directory,absolute);
 assert(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'Evidence path escaped its declared directory');return absolute;
};
assert.notEqual(root,output,'Restore into a separate folder');
const restored=[];
for(const entry of manifest.entries){
 const bytes=await fs.readFile(local(root,entry.storedPath));assert.equal(bytes.length,entry.storedBytes);assert.equal(sha(bytes),entry.storedSha256);
 assert(['gzip','copy'].includes(entry.encoding),'Unknown evidence encoding');const original=entry.encoding==='gzip'?gunzipSync(bytes):bytes;
 assert.equal(original.length,entry.originalBytes,entry.restorePath+' byte count');assert.equal(sha(original),entry.originalSha256,entry.restorePath+' SHA-256');
 const file=local(output,entry.restorePath);await fs.mkdir(path.dirname(file),{recursive:true});
 try{const existing=await fs.readFile(file);assert(existing.equals(original),'Refusing to overwrite different existing output: '+file);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(file,original);}
 restored.push({file,bytes:original.length,sha256:entry.originalSha256});
}
const result={status:'PASS_LOSSLESS_RECONSTRUCTION',output,files:restored.length,bytes:restored.reduce((n,file)=>n+file.bytes,0),manifestSha256:sha(await fs.readFile(path.join(root,'MANIFEST.json'))),restored,deliberateOmissions:manifest.deliberateOmissions};
await fs.writeFile(path.join(output,'RESTORATION.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,output,files:result.files,bytes:result.bytes}));
