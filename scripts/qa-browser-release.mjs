// Independent release gate; no deploy, no writes to normal browser profiles.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
assert(args.output,'--output external directory required');
const output=path.resolve(args.output);assert(!output.startsWith(root));await fs.mkdir(output);
const site=path.join(output,'_site');await fs.mkdir(site);
const sha=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:20e6});
const report={status:'RUNNING',head:git('rev-parse','HEAD').toString().trim(),release:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,os:os.release(),cpu:os.cpus()[0].model,backend:'ANGLE SwiftShader',checks:[],manifest:[],console:[],network:[],errors:[]};
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
let server,browser,page;
async function check(name,fn){report.activeCheck=name;await persist();await fn();report.checks.push({name,status:'PASS'});}
try{
 await check('assemble-exact-HEAD-shipping-files',async()=>{
  const files=git('ls-tree','-r','--name-only','HEAD').toString().trim().split(/\r?\n/).filter(x=>x==='index.html'||x==='favicon.svg'||x.startsWith('src/'));
  for(const file of files){
   const committed=git('show',`HEAD:${file}`),working=await fs.readFile(path.join(root,file));
   assert.deepEqual(working,committed,`Dirty runtime file: ${file}`);
   const target=path.join(site,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,working);
   assert.equal(sha(await fs.readFile(target)),sha(committed));report.manifest.push({file,bytes:working.length,sha256:sha(working)});
  }
  await fs.writeFile(path.join(site,'.nojekyll'),'');
  assert(report.manifest.some(x=>x.file==='src/fonts/abyss-text-core.woff2'));
  assert(!report.manifest.some(x=>/^(README|tests\/|scripts\/|docs\/)/.test(x.file)));
 });
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
 server=http.createServer(async(req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  if(!report.manifest.some(x=>x.file===file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-cache'});res.end(await fs.readFile(path.join(site,file)));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/`;report.url=url;
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});page=await context.newPage();
 page.on('console',m=>{report.console.push({type:m.type(),text:m.text()});});page.on('pageerror',e=>report.errors.push(String(e)));page.on('response',r=>report.network.push({url:r.url(),status:r.status()}));
 await check('all-shipping-HTTP-bytes',async()=>{for(const asset of report.manifest){const r=await context.request.get(url+asset.file);assert.equal(r.status(),200,asset.file);assert.equal(sha(await r.body()),asset.sha256,asset.file);}});
 await check('release-title-new-manual-roll',async()=>{
  await page.goto(url);assert.equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),report.release);assert.equal(await page.locator('meta[name="dice-abyss-build"]').getAttribute('content'),'5');
  await page.locator('[data-action="new"]').click();await page.locator('#primary-action:not(:disabled)').waitFor();
  const before=S.decodeSave(await page.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY));assert.equal(before.phase,'fate');
  await page.locator('#primary-action').click();await page.locator('#primary-action:not(:disabled)').waitFor();
  assert.deepEqual(S.decodeSave(await page.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY)),E.transition(before,{type:'fate'}));
 });
 await check('10000-inventory-lock-mirror-reload',async()=>{
  const state=E.newGame(27017);state.runId='release-qa-10000';while(state.player.items.length<10000)state.player.items.push(E.makeItem(state,'weapon',state.nextId%8));
  const raw=S.encodeSave(state);report.fixture={items:10000,sha256:sha(raw),bytes:Buffer.byteLength(raw)};
  await page.evaluate(({raw,a,b})=>{localStorage.setItem(a,raw);localStorage.setItem(b,raw);},{raw,a:S.SAVE_KEY,b:S.BACKUP_KEY});
  await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.main-nav [data-action="inventory"]').click();
  assert.equal(await page.locator('.inventory-list .item-card').count(),60);
  const button=page.locator('.inventory-list [data-action="lock"]').first(),id=await button.getAttribute('data-id');await button.click();
  const expected=E.transition(state,{type:'lock',id});
  await page.waitForFunction(rev=>JSON.parse(JSON.parse(localStorage.getItem('dice-abyss:save:v1')).payload).revision===rev,expected.revision);
  const saved=await page.evaluate(({a,b})=>[localStorage.getItem(a),localStorage.getItem(b)],{a:S.SAVE_KEY,b:S.BACKUP_KEY});
  assert.equal(saved[0],saved[1]);assert.deepEqual(S.decodeSave(saved[0]),expected);
  await page.screenshot({path:path.join(output,'10000-inventory.png')});await page.reload();await page.locator('[data-action="continue"]').click();
  assert.deepEqual(S.decodeSave(await page.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY)),expected);
 });
 await check('no-page-console-network-errors',async()=>{
  assert.equal(report.errors.length,0);assert(!report.network.some(x=>x.status>=400));assert(!report.console.some(x=>x.type==='error'),JSON.stringify(report.console));
  assert(!report.network.some(x=>/SourceHanSansCN|fusion-pixel-12px/.test(x.url)),'Normal gameplay must not request Full fonts');
 });
 await browser.close();browser=null;
 // Spawn asynchronously: this process must keep serving the staged site.
 await check('core-browser-regressions',async()=>{
  const {spawn}=await import('node:child_process');
  const child=spawn(process.execPath,[path.join(root,'scripts/qa-core-browser.mjs'),`--url=${url}`,`--output=${path.join(output,'core')}`],{env:process.env,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  await fs.writeFile(path.join(output,'core.log'),log);assert.equal(code,0,'core browser driver failed; see core/report.json');
 });
 report.status='PASS';
}catch(e){report.status='FAIL';report.checks.push({name:report.activeCheck,status:'FAIL',error:String(e)});report.errors.push(e.stack);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await persist();await browser?.close();server?.close();}
console.log(JSON.stringify({status:report.status,head:report.head,checks:report.checks}));
