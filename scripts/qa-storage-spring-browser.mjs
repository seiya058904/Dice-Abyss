// Native file-chooser and event interactions with synthetic saves only.
// Requires external PLAYWRIGHT_MODULE and CHROMIUM_PATH; neither ships with the game.
// node scripts/qa-storage-spring-browser.mjs --baseline=/absolute/input/Dice-Abyss
//   --baseline-url=http://127.0.0.1:4192 --url=http://127.0.0.1:4193 --output=/tmp/qa
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
const options={};
for(const arg of process.argv.slice(2)){const at=arg.indexOf('=');assert(at>2,'Use --name=value');options[arg.slice(0,at)]=arg.slice(at+1);}
const url=options['--url']||'http://127.0.0.1:4193',baselineUrl=options['--baseline-url']||'http://127.0.0.1:4192';
const baseline=options['--baseline']&&path.resolve(options['--baseline']),output=path.resolve(options['--output']||'/tmp/storage-spring-qa');
const B=baseline?await import(pathToFileURL(path.join(baseline,'src/storage.js'))):null;
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const report={started:new Date().toISOString(),synthetic:true,browser:browser.version(),baselineUrl,url,groups:[],errors:[],checks:0,notes:['Only initial fixture installation assigns localStorage; imports use the native file chooser and actual confirmation.', 'The baseline defect is expected and recorded separately from current passes. This is a malformed-import test, not evidence of naturally generated corruption.', 'No physical GPU, mobile hardware, real user save or OS power-loss claims.']};
let active;
function check(value,label,detail){report.checks++;active.checks.push({label,passed:!!value,...(detail===undefined?{}:{detail})});assert(value,label);}
function eq(actual,expected,label){assert.deepEqual(actual,expected,label);check(true,label,{actualSha256:sha(actual),expectedSha256:sha(expected)});}
const button=(p,action)=>p.locator(`[data-action="${action}"]`);
const disk=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
const saved=async(p,storage=S)=>storage.decodeSave((await disk(p))[storage.SAVE_KEY]);
const waitRaw=(p,raw)=>p.waitForFunction(({key,raw})=>localStorage.getItem(key)===raw,{key:S.SAVE_KEY,raw});
const idle=p=>p.waitForFunction(()=>!document.querySelector('.center-panel.busy'));
async function durable(p,state,label){const d=await disk(p);eq(d[S.SAVE_KEY],S.encodeSave(state),label+' primary');eq(d[S.BACKUP_KEY],S.encodeSave(state),label+' mirror');eq(await saved(p),state,label+' complete state');}
async function load(p,state,base=url,storage=S){
 assert(storage.validateSave(state));await p.goto(base);
 await p.evaluate(({raw,keys})=>{localStorage.setItem(keys[0],raw);localStorage.setItem(keys[1],raw);localStorage.setItem(keys[2],JSON.stringify({effects:'low',sound:false,scale:1}));},{raw:storage.encodeSave(state),keys:[storage.SAVE_KEY,storage.BACKUP_KEY,storage.SETTINGS_KEY]});
 await p.reload();await button(p,'continue').click();await idle(p);
}
async function settings(p){await button(p,'settings').click();await p.locator('dialog #save-file').waitFor({state:'attached'});}
async function upload(p,raw,name){const chooser=p.waitForEvent('filechooser');await p.locator('dialog [data-action="import"]').click();await(await chooser).setFiles({name,mimeType:'application/json',buffer:Buffer.from(raw)});}
function room(type,seed=78349){let s=E.newGame(seed);s.runId=`qa-round04-${type}-${seed}`;s.floor=200;s.player.level=50;s.player.hp=Math.floor(E.stats(s).maxHp*.2);s.player.gold=100000;s.fate=[3,4];s.phase='route';s.route=[type,'combat','forge','combat','gold','boss'].map((type,i)=>({id:`f200r${i}`,type,done:false,quality:0}));s=E.transition(s,{type:'enter'});assert(S.validateSave(s));return s;}
function invalid(valid){const bad=structuredClone(valid);bad.shop.find(o=>o.id==='heal').item={id:bad.shop.find(o=>o.item).item.id};const payload=JSON.stringify(bad);let hash=2166136261;for(let i=0;i<payload.length;i++)hash=Math.imul(hash^payload.charCodeAt(i),16777619);const raw=JSON.stringify({format:'dice-abyss',version:bad.version,payload,checksum:(hash>>>0).toString(16)});assert(!S.validateSave(bad));assert.throws(()=>S.decodeSave(raw));return{bad,raw};}
async function run(name,base,fn){
 if(options['--case']&&options['--case']!==name)return;
 active={name,status:'RUNNING',checks:[],sourceHashes:{}};report.groups.push(active);
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(15000);
 p.on('pageerror',e=>report.errors.push({case:name,error:String(e)}));
 try{
  for(const file of ['src/storage.js','src/encounters.js','src/app.js','src/views.js']){const response=await context.request.get(new URL(file,base).href);check(response.ok(),file+' served');active.sourceHashes[file]=sha(await response.body());}
  await fn(p);active.status=name==='baseline-malformed-merchant'?'BASELINE_DEFECT_REPRODUCED':'PASS';
 }catch(e){active.status='FAIL';active.error=e.stack;await p.screenshot({path:path.join(output,'FAIL-'+name+'.png')}).catch(()=>{});}
 finally{await context.close();await fs.writeFile(path.join(output,'storage-spring-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${active.status}`);}
}
try{
 if(B)await run('baseline-malformed-merchant',baselineUrl,async p=>{
  const prior=E.newGame(618),{bad,raw}=invalid(room('merchant'));check(B.validateSave(bad),'the input baseline accepts the otherwise valid malformed offer');await load(p,prior,baselineUrl,B);await settings(p);await upload(p,raw,'malformed-merchant.json');
  // saveGame re-encodes the accepted payload in canonical envelope key order.
  await p.getByRole('button',{name:'确认导入',exact:true}).click();await waitRaw(p,B.encodeSave(bad));
  await p.locator('.toast.visible').filter({hasText:'reading'}).waitFor();check((await p.locator('.toast.visible').innerText()).includes("'key'"),'input baseline shows the real shop rendering exception');eq(await saved(p,B),bad,'input baseline replaced the journey with the malformed shop');await p.screenshot({path:path.join(output,'baseline-import-error.png')});
 });
 for(const type of ['merchant','blackmarket'])await run(type+'-reject-and-valid-purchase',url,async p=>{
  const prior=E.newGame(type==='merchant'?618:619),valid=room(type),{raw}=invalid(valid);await load(p,prior);const before=await disk(p);await settings(p);await upload(p,raw,`invalid-${type}.json`);
  await p.locator('.toast.visible').filter({hasText:'存档内容不完整或版本不兼容。'}).waitFor();eq(await disk(p),before,'rejection preserves every key including absent archives');check(await p.getByRole('button',{name:'确认导入',exact:true}).count()===0,'invalid file has no replacement confirmation');await p.screenshot({path:path.join(output,type+'-rejected.png')});
  const validRaw=S.encodeSave(valid);await upload(p,validRaw,`valid-${type}.json`);await p.getByRole('button',{name:'确认导入',exact:true}).waitFor();eq(await disk(p),before,'valid import waits without writing');await p.getByRole('button',{name:'确认导入',exact:true}).click();await waitRaw(p,validRaw);await p.locator('.merchant-screen').waitFor();await durable(p,valid,'valid counterpart imported');
  const healed=E.transition(valid,{type:'buy',id:'heal'});await p.locator('[data-action="buy"][data-id="heal"]').click();await waitRaw(p,S.encodeSave(healed));await durable(p,healed,'native healing purchase');check(!(await p.locator('[data-action="buy"][data-id="heal"]').isEnabled()),'used supply cannot be purchased twice');check(healed.player.hp===E.stats(healed).maxHp,'purchase really restores full HP');
  const offer=healed.shop.find(o=>o.item&&!o.sold),bought=E.transition(healed,{type:'buy',id:offer.id});await p.locator(`[data-action="buy"][data-id="${offer.id}"]`).click();await waitRaw(p,S.encodeSave(bought));await durable(p,bought,'ordinary equipment purchase still commits once');await p.reload();await button(p,'continue').click();await p.locator('.merchant-screen').waitFor();await durable(p,bought,'refresh restores both purchases');
 });
 await run('spring-stronger-ward-and-history',url,async p=>{
  for(const id of ['heal','ward']){
   const before=room('spring',7919);before.ward=Math.floor(E.stats(before).maxHp*.7);await load(p,before);const d=await disk(p),choice=p.locator(`.event-options [data-action="event-choice"][data-id="${id}"]`);
   check((await choice.innerText()).includes('护盾补足至至少'),'pending choice states a shield floor');check((await choice.innerText()).includes('已有更高护盾会保留，不额外增加'),'pending choice explains the stronger existing shield');eq(await disk(p),d,'reading the pending spring is byte-for-byte read-only');
   if(id==='ward')await p.screenshot({path:path.join(output,'spring-pending.png')});const after=E.transition(before,{type:'event-choice',id});await choice.click();await waitRaw(p,S.encodeSave(after));await durable(p,after,'spring commits the actual healing and shield result');check(after.ward===before.ward,'stronger shield is retained without an additive reward');check((await p.locator('.event-outcome').innerText()).includes('原有更高护盾保留'),'settlement states the real shield rule');await p.reload();await button(p,'continue').click();await durable(p,after,'refresh keeps resolved spring result');
  }
  const historical=E.transition(room('spring',15838),{type:'event-choice',id:'heal'});historical.event.outcome='生命已恢复，获得最大生命 10% 护盾。';await load(p,historical);check((await p.locator('.event-outcome').innerText()).includes(historical.event.outcome),'already resolved historical text stays historical');await durable(p,historical,'display does not rewrite historical outcome');
 });
}finally{report.finished=new Date().toISOString();report.passed=report.groups.length>0&&report.groups.every(g=>g.status==='PASS'||g.status==='BASELINE_DEFECT_REPRODUCED')&&report.errors.length===0;await browser.close();await fs.writeFile(path.join(output,'storage-spring-browser.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,groups:report.groups.map(({name,status})=>({name,status})),errors:report.errors}));if(!report.passed)process.exitCode=1;
