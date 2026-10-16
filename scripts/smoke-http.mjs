// HTTP asset/launcher smoke, NOT a browser/visual test.
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),port=Number(process.env.SMOKE_PORT||4197),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url))],{cwd:fileURLToPath(root),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let startup='';child.stdout.on('data',d=>startup+=d);child.stderr.on('data',d=>startup+=d);
try{
 let ready=false;for(let i=0;i<50;i++){if(child.exitCode!==null)throw Error('Server startup failed: '+startup);try{const r=await fetch(base);if(r.ok){ready=true;break;}}catch{}await setTimeout(100);}assert(ready);
 const files=['index.html','favicon.svg',...(await readdir(new URL('src/',root))).filter(f=>/\.(js|css|svg)$/.test(f)).map(f=>'src/'+f)],rows=[];
 for(const file of files){const response=await fetch(base+'/'+file);assert.equal(response.status,200,file);const body=await response.text();assert(body.length>0);rows.push({file,status:response.status,bytes:Buffer.byteLength(body),type:response.headers.get('content-type')});
  if(file==='index.html')assert(body.includes('name="dice-abyss-build" content="5"'));
  // Every relative JS import resolves to a shipping file.
  if(file.endsWith('.js'))for(const match of body.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)){const asset=new URL(match[1],base+'/'+file),r=await fetch(asset);assert.equal(r.status,200,asset.pathname);}
  if(file.endsWith('.css'))for(const match of body.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)){if(match[1].startsWith('data:')||match[1].startsWith('#'))continue;const asset=new URL(match[1],base+'/'+file);assert.equal(asset.origin,base,'external asset');assert.equal((await fetch(asset)).status,200,asset.pathname);}
 }
 for(const route of ['/package.json','/.git/config','/docs/readme-banner.svg','/tests/v5-systems.test.mjs'])assert.equal((await fetch(base+route)).status,404,route);
 const report={method:'Spawned the delivered Node HTTP server, fetched every shipping module/style/SVG, verified relative imports and CSS URLs, rejected metadata/test paths. No DOM, browser interaction or screenshot claims.',node:process.version,port,files:rows.length,rows,allPassed:true};
 await mkdir(new URL('docs/v5/evidence/',root),{recursive:true});await writeFile(new URL('docs/v5/evidence/http-smoke.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify({files:rows.length,allPassed:true}));
}finally{child.kill();}
