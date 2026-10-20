// HTTP asset/launcher smoke, NOT a browser/visual test.
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
const root=new URL('../',import.meta.url),port=Number(process.env.SMOKE_PORT||4197),base=`http://127.0.0.1:${port}`;
const outputArg=process.argv.indexOf('--output');
const output=outputArg<0?fileURLToPath(new URL('docs/iteration/evidence/http-smoke.json',root)):resolve(process.argv[outputArg+1]);
const child=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url))],{cwd:fileURLToPath(root),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let startup='',startupError=null,exited=false;
child.stdout.on('data',d=>startup+=d);child.stderr.on('data',d=>startup+=d);
child.on('error',error=>{startupError=error;});child.on('exit',()=>{exited=true;});
const assertChildAlive=()=>{if(startupError||exited||child.exitCode!==null||child.signalCode!==null)throw Error('Server startup or lifetime failed: '+(startupError?.message||startup));};
try{
 // Only this child's listen callback proves it owns the requested port. A
 // different process answering HTTP must never turn a failed spawn into PASS.
 let ready=false;for(let i=0;i<100;i++){assertChildAlive();if(startup.includes(`Dice Abyss ready: ${base}`)){ready=true;break;}await setTimeout(100);}assert(ready,'Spawned server did not announce readiness');
 const release=JSON.parse(await readFile(new URL('package.json',root),'utf8')).version;
 const files=['index.html','favicon.svg',...(await readdir(new URL('src/',root))).filter(f=>/\.(js|css|svg|webp)$/.test(f)).map(f=>'src/'+f),...(await readdir(new URL('src/fonts/',root))).filter(f=>f.endsWith('.woff2')).map(f=>'src/fonts/'+f)],rows=[];
 for(const file of files){const response=await fetch(base+'/'+file);assert.equal(response.status,200,file);const bytes=Buffer.from(await response.arrayBuffer()),body=bytes.toString('utf8');assert(bytes.length>0);assert.deepEqual(bytes,await readFile(new URL(file,root)),`${file}: served bytes equal shipping bytes`);if(file.endsWith('.webp'))assert.equal(response.headers.get('content-type'),'image/webp');if(file.endsWith('.woff2'))assert.equal(response.headers.get('content-type'),'font/woff2');rows.push({file,status:response.status,bytes:bytes.length,type:response.headers.get('content-type')});
  if(file==='index.html'){assert(body.includes('name="dice-abyss-build" content="5"'));assert(body.includes(`name="dice-abyss-release" content="${release}"`),'release matches package.json');}
  // Every relative JS import resolves to a shipping file.
  if(file.endsWith('.js'))for(const match of body.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)){const asset=new URL(match[1],base+'/'+file),r=await fetch(asset);assert.equal(r.status,200,asset.pathname);}
  if(file.endsWith('.css'))for(const match of body.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)){if(match[1].startsWith('data:')||match[1].startsWith('#'))continue;const asset=new URL(match[1],base+'/'+file);assert.equal(asset.origin,base,'external asset');assert.equal((await fetch(asset)).status,200,asset.pathname);}
 }
 for(const route of ['/package.json','/.git/config','/docs/readme-banner.svg','/tests/v5-systems.test.mjs'])assert.equal((await fetch(base+route)).status,404,route);
 assertChildAlive();
 const report={method:'Confirmed readiness from the spawned server itself; byte-compared shipping modules/styles/SVG/WebP/fonts; verified relative imports, CSS URLs and binary MIME types; rejected metadata/test paths. No DOM, browser interaction or screenshot claims.',node:process.version,release,port,spawnedServerReady:true,files:rows.length,rows,allPassed:true};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({files:rows.length,allPassed:true}));
}finally{child.kill();}
