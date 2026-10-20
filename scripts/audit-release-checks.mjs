// Small release-tool regression probes. No browser, full test suite or gameplay simulation.
// Usage: node scripts/audit-release-checks.mjs [--source root] [--baseline old-root]
//        [--output external.json] [--occupied-port n] [--free-port n]
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {createServer,createConnection} from 'node:net';
import {resolve,dirname,join,relative,isAbsolute,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const args={};
for(let i=2;i<process.argv.length;i++){
 const input=process.argv[i],split=input.indexOf('='),key=split<0?input:input.slice(0,split);
 if(key==='--help'){console.log('Audit the current check.mjs (4 cases), optionally compare a baseline (8 total), and test occupied/free HTTP ports.\n--source ROOT defaults to this script\'s parent project.\n--baseline ROOT adds historical observations; old failures do not fail the current release.\n--output FILE writes JSON outside the audited roots; otherwise JSON goes to stdout.\n--occupied-port N / --free-port N are optional; defaults use OS-assigned temporary ports.');process.exit(0);}
 assert(['--source','--baseline','--output','--occupied-port','--free-port'].includes(key),`Unknown argument ${key}`);
 const value=split<0?process.argv[++i]:input.slice(split+1);assert(value&&!value.startsWith('--'),`${key} needs a value`);args[key]=value;
}
const source=resolve(args['--source']||fileURLToPath(new URL('../',import.meta.url))),baseline=args['--baseline']?resolve(args['--baseline']):null,output=args['--output']?resolve(args['--output']):null;
const inside=(root,file)=>{const rel=relative(root,file);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+(process.platform==='win32'?'\\':'/')));};
if(output){assert.equal(extname(output).toLowerCase(),'.json','--output must be a JSON file');for(const root of [source,baseline].filter(Boolean))assert(!inside(root,output),'--output must be outside the audited source roots');}
const hash=value=>createHash('sha256').update(value).digest('hex');
const report={method:'Actual check.mjs source in a VM, replacing only imports, file enumeration, spawnSync, exit and logging. Four current-source conditions; optional four baseline observations. Real smoke-http.mjs on an owned occupied port and an OS-selected free port. No browser, timing, gameplay or full-suite claims.',node:process.version,started:new Date().toISOString(),checks:[],baselineProvided:!!baseline,http:{},status:'RUNNING',notes:['Only child processes spawned by this audit (and their own process groups on POSIX) are terminated. No process is found or killed by port.','On Windows, forced wrapper termination uses child.kill and does not guarantee descendant cleanup; any still-open probe port is reported as a failure.','Temporary ports are reserved through an OS bind, then released for the shipping server; a lost bind race fails safely.','Source and temporary-directory paths in diagnostics are normalized; release identifiers and hashes are read from the audited files.']};
const owned=new Set();let temporary=null;

function portable(value){
 if(typeof value!=='string')return value;
 for(const [root,label]of [[source,'<source>'],[baseline,'<baseline>'],[temporary,'<owned-probe-output>']])if(root)value=value.replaceAll(root,label).replaceAll(pathToFileURL(root).href,'file://'+label);
 return value;
}
async function persist(){
 const body=JSON.stringify(report,(_,value)=>portable(value),2)+'\n';
 if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,body);}return body;
}
function meta(html,name){
 for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
  const attrs=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3]]));
  if(attrs.name===name)return attrs.content??null;
 }return null;
}
async function release(root){
 const packageBytes=await readFile(join(root,'package.json')),index=await readFile(join(root,'index.html'),'utf8'),pkg=JSON.parse(packageBytes);
 assert.equal(typeof pkg.version,'string');assert(pkg.version.length>0);
 return {index,identity:{name:pkg.name??null,packageVersion:pkg.version,htmlRelease:meta(index,'dice-abyss-release'),htmlBuild:meta(index,'dice-abyss-build'),packageSha256:hash(packageBytes),indexSha256:hash(index)}};
}
async function checkBranches(root,label){
 const filename=join(root,'scripts/check.mjs'),text=await readFile(filename,'utf8');
 const program=text.replace(/^\s*import\s[\s\S]*?;\s*/gm,'').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(filename).href));
 const conditions=[['spawn-error',{error:new Error('synthetic EAGAIN'),status:null},1],['terminated',{status:null,signal:'SIGKILL'},1],['syntax-failure',{status:2},2],['success',{status:0},0]];
 for(const [scenario,result,expectedExitCode]of conditions){
  const logs=[],errors=[];let calls=0,exitCode=null;const stop={};
  try{runInNewContext(program,{URL,fileURLToPath,readdirSync:()=>['probe.mjs'],spawnSync:()=>{calls++;return result;},process:{execPath:process.execPath,exit(code){exitCode=code;throw stop;}},console:{log:(...args)=>logs.push(args.join(' ')),error:(...args)=>errors.push(args.join(' '))}},{timeout:2000,filename:'check.mjs-probe'});}catch(error){if(error!==stop)throw error;}
  const effectiveExitCode=exitCode??0,correctBehavior=effectiveExitCode===expectedExitCode&&(scenario==='success'?logs.length===1:logs.length===0);
  report.checks.push({label,scenario,sourceSha256:hash(text),exitCode,effectiveExitCode,expectedExitCode,spawnCalls:calls,logs,errors,correctBehavior});
 }
 return report.checks.filter(check=>check.label===label);
}
function start(script,argv=[],env={}){
 const child=spawn(process.execPath,[join(source,'scripts',script),...argv],{cwd:source,env:{...process.env,...env},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
 const item={child,stdout:'',stderr:'',result:null,error:null,truncated:false};owned.add(item);
 const collect=key=>data=>{const next=item[key]+data;item.truncated||=next.length>65536;item[key]=next.slice(0,65536);};
 child.stdout?.on('data',collect('stdout'));child.stderr?.on('data',collect('stderr'));
 child.on('error',error=>{item.error={name:error.name,code:error.code??null,message:error.message};});
 item.closed=new Promise(resolve=>child.once('close',(code,signal)=>{item.result={code,signal};owned.delete(item);resolve(item.result);}));
 return item;
}
function alive(item){return !item.error&&!item.result&&item.child.exitCode===null&&item.child.signalCode===null;}
function signalOwned(item,signal){
 // A leader may have exited while its own descendants still hold stdout open.
 if(!owned.has(item)||item.result||!item.child.pid)return;
 try{if(process.platform==='win32')item.child.kill(signal);else process.kill(-item.child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}
}
async function stopOwned(item){
 if(item.result)return;
 signalOwned(item,'SIGTERM');
 if(!await Promise.race([item.closed.then(()=>true),delay(1000,undefined,{ref:false}).then(()=>false)])){signalOwned(item,'SIGKILL');await Promise.race([item.closed,delay(1000,undefined,{ref:false})]);}
 assert(item.result,'Owned child did not terminate');
}
async function finish(item,milliseconds=15000){
 const done=await Promise.race([item.closed.then(()=>true),delay(milliseconds,undefined,{ref:false}).then(()=>false)]);
 if(!done){await stopOwned(item);throw Error('Owned probe child exceeded its fixed '+milliseconds+' ms deadline');}
 if(item.error)throw Error('Owned probe child failed to spawn: '+item.error.message);
 return {...item.result,pid:item.child.pid,stdout:item.stdout,stderr:item.stderr,diagnosticsTruncated:item.truncated};
}
async function ready(item,port){
 const marker=`Dice Abyss ready: http://127.0.0.1:${port}`;
 for(let i=0;i<250;i++){
  assert(alive(item),'Owned server failed before readiness: '+(item.error?.message||item.stderr));
  if(item.stdout.includes(marker))return;
  await delay(20);
 }
 throw Error('Owned server did not announce readiness within 5000 ms');
}
async function availablePort(option){
 const requested=option===undefined?0:Number(option);assert(Number.isInteger(requested)&&requested>=0&&requested<=65535,'Port must be an integer between 0 and 65535');
 const reservation=createServer();
 await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(requested,'127.0.0.1',resolve);});
 const port=reservation.address().port;await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));return port;
}
async function isOpen(port){
 return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port}),done=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(300,()=>done(true));});
}
async function waitClosed(port){for(let i=0;i<40;i++){if(!await isOpen(port))return true;await delay(25);}return false;}
async function cleanup(){for(const item of [...owned])await stopOwned(item);if(temporary)await rm(temporary,{recursive:true,force:true});}
let interrupted=false;
const interrupt=signal=>async()=>{if(interrupted)return;interrupted=true;report.status='INTERRUPTED';report.failure={message:'Interrupted by '+signal};try{await cleanup();report.finished=new Date().toISOString();await persist();}finally{process.exit(signal==='SIGINT'?130:143);}};
const onInt=interrupt('SIGINT'),onTerm=interrupt('SIGTERM');process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);

try{
 const current=await release(source);report.release=current.identity;
 assert.equal(current.identity.htmlRelease,current.identity.packageVersion,'HTML release must match package.json');assert(current.identity.htmlBuild,'HTML build metadata is required');
 if(baseline){const old=await release(baseline);report.baselineRelease=old.identity;await checkBranches(baseline,'baseline');}
 else report.baselineStatus='NOT_PROVIDED — current-source checks remain fully runnable';
 const checked=await checkBranches(source,'after');assert(checked.every(check=>check.correctBehavior),'Current check.mjs does not satisfy one or more exit/logging branches');
 report.sourceFiles={check:hash(await readFile(join(source,'scripts/check.mjs'))),smoke:hash(await readFile(join(source,'scripts/smoke-http.mjs'))),serve:hash(await readFile(join(source,'scripts/serve.mjs')))};
 temporary=await mkdtemp(join(tmpdir(),'dice-abyss-release-audit-'));
 const occupiedPort=await availablePort(args['--occupied-port']),first=start('serve.mjs',[],{PORT:String(occupiedPort)}),occupiedOutput=join(temporary,'occupied.json');
 const sentinel=JSON.stringify({purpose:'Owned audit output that a failed smoke must not overwrite'})+'\n';await writeFile(occupiedOutput,sentinel);
 let freePort;
 try{
  await ready(first,occupiedPort);
  const smoke=start('smoke-http.mjs',['--output',occupiedOutput],{SMOKE_PORT:String(occupiedPort)}),result=await finish(smoke);
  const unchanged=await readFile(occupiedOutput,'utf8')===sentinel;
  report.http.occupied={port:occupiedPort,ownedHolderPid:first.child.pid,...result,holderStillAlive:alive(first),outputUnchanged:unchanged};
  assert.equal(result.code,1,'A smoke must reject an occupied port');assert.equal(result.signal,null);assert(result.stderr.includes('EADDRINUSE'),'The failure must identify the binding error');assert(unchanged,'Failed smoke must preserve an existing output');assert(alive(first),'Failed smoke must not stop the owned holder');
  const response=await fetch(`http://127.0.0.1:${occupiedPort}/`,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.equal(await response.text(),current.index);assert(alive(first));report.http.occupied.holderStillServesIdenticalIndex=true;
  freePort=await availablePort(args['--free-port']);assert.notEqual(freePort,occupiedPort,'Use distinct ports for the two probes');
 }finally{await stopOwned(first);if(report.http.occupied)report.http.occupied.ownedHolderStopped=!!first.result;}
 const freeOutput=join(temporary,'free.json'),smoke=start('smoke-http.mjs',['--output',freeOutput],{SMOKE_PORT:String(freePort)}),result=await finish(smoke);
 report.http.free={port:freePort,...result};assert.equal(result.code,0,result.stderr);assert.equal(result.signal,null);
 const audit=JSON.parse(await readFile(freeOutput,'utf8'));assert.equal(audit.allPassed,true);assert.equal(audit.spawnedServerReady,true);assert.equal(audit.release,current.identity.packageVersion);assert(Array.isArray(audit.rows)&&audit.rows.length===audit.files&&audit.files>0);
 report.http.free.audit=audit;report.http.free.portClosedAfterSmoke=await waitClosed(freePort);assert(report.http.free.portClosedAfterSmoke,'Owned smoke server did not release its port; no unrelated process was terminated');
 report.currentChecksPassed=checked.length;report.totalCheckObservations=report.checks.length;report.historicalIncorrectBranches=report.checks.filter(check=>check.label==='baseline'&&!check.correctBehavior).length;report.status='PASS';
}catch(error){report.status='FAIL';report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 try{await cleanup();report.ownedChildrenRemaining=owned.size;}catch(error){report.status='FAIL';report.cleanupFailure={name:error.name,message:error.message};process.exitCode=1;}
 report.finished=new Date().toISOString();const body=await persist();process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);
 if(output)console.log(JSON.stringify({status:report.status,checks:report.checks.length,historicalIncorrectBranches:report.historicalIncorrectBranches??null,occupied:report.http.occupied?.code??null,free:report.http.free?.code??null,output},null,2));else process.stdout.write(body);
}
