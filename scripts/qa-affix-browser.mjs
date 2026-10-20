// Optional current-round browser A/B. Synthetic catalog equipment, fresh
// contexts and native UI actions only. Playwright is an external QA dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {CATALOG} from '../src/equipment-content.js';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');assert(at>0,'Use --name=value');return [value.slice(0,at),value.slice(at+1)];}));
assert(args['--output'],'--output=/absolute/external/directory is required');
const output=path.resolve(args['--output']);
const variants=[...(args['--baseline-url']?[{label:'baseline',url:args['--baseline-url']}]:[]),{label:'current',url:args['--url']||'http://127.0.0.1:4193'}];
for(const {url} of variants)assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Only loopback game origins');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const keys=[S.SAVE_KEY,S.BACKUP_KEY,S.SETTINGS_KEY];
const effectKeys=['criticalFollow','pierce','regen','barrier','pairWard','healBonus','goldBonus','followDamage'];
function fixture(){
 let s=E.newGame(51397);s.runId='qa-round05-fixed-affix-reading';s.floor=140;s.player.level=80;s.player.gold=500000;s.fate=[4,4];
 const selected={};
 for(const key of effectKeys){
  const entry=Object.values(CATALOG).flat().find(entry=>entry.rarity===3&&entry.effects[key]);assert(entry,`${key} has a real catalog item`);
  const item=E.makeItem(s,entry.slot,entry.rarity,140);
  Object.assign(item,{catalogId:entry.id,profile:entry.profile,theme:entry.theme,name:entry.name,level:60,levelXp:0,enhance:0});
  s.player.items.push(item);selected[key]=item.id;
 }
 s.player.equipped.weapon=selected.criticalFollow;s.player.equipped.armor=selected.regen;s.player.equipped.relic=selected.goldBonus;
 s.route=['forge','combat','rest','combat','gold','boss'].map((type,index)=>({id:`f140r${index}`,type,quality:0,done:false}));s.roomIndex=0;s.phase='route';s.player.hp=E.stats(s).maxHp;
 s=E.transition(s,{type:'enter'});assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);return {state:s,selected};
}
const {state,selected}=fixture(),raw=S.encodeSave(state);
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={browser:browser.version(),synthetic:true,fixture:'Existing real catalog effects at legal assigned levels in an injected forge save; not a naturally played journey.',fixtureSha256:hash(state),selected,viewports:[[1366,768],[1920,1080],[2560,1440],[3840,2160]],cases:[],errors:[],status:'RUNNING'};
let active;
const check=(value,label,data)=>{active.checks.push({label,pass:!!value,...(data?{data}:{})});assert(value,label);};
async function unchanged(page,label){const copies=await page.evaluate(keys=>keys.slice(0,2).map(key=>localStorage.getItem(key)),keys);assert.deepEqual(copies,[raw,raw],label);check(true,label,{mainAndMirrorSha256:hash(raw)});}
async function geometry(page,selector){
 return page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{
  const box=node.getBoundingClientRect(),style=getComputedStyle(node),range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();
  return {text:node.textContent,box:{left:box.left,right:box.right,width:box.width,height:box.height},textRight:text.right,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,fontSize:style.fontSize,whiteSpace:style.whiteSpace};
 }));
}
try{
 for(const variant of variants){
  const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push({label:variant.label,message:error.message}));
  page.on('console',message=>{if(message.type()==='error')report.errors.push({label:variant.label,message:message.text()});});
  active={name:`${variant.label}-read-affixes-without-changing-build`,url:variant.url,status:'RUNNING',checks:[]};report.cases.push(active);
  try{
   await page.goto(variant.url);await page.evaluate(({keys,raw})=>{localStorage.setItem(keys[0],raw);localStorage.setItem(keys[1],raw);localStorage.setItem(keys[2],JSON.stringify({effects:'low',sound:false,scale:1}));},{keys,raw});
   await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.forge-screen').waitFor();await page.evaluate(()=>document.fonts.ready);
   check(await page.title()==='骰狱：无尽深渊 · Dice Abyss','Correct game page, real content and loaded offline fonts');
   await page.locator('.main-nav [data-action="inventory"]').click();await page.locator('.inventory-list').waitFor();
   const text=await page.locator('.inventory-list').innerText();
   const phrases=variant.label==='baseline'?['暴击追击率','破甲','金币收益']:['双同及以上且暴击：追击率','穿盾','战斗掷骰后存活：恢复最大生命','开战：获得最大生命护盾','双同及以上：获得最大生命护盾','击杀：额外恢复最大生命','宝箱金币','追击追加主击'];
   for(const phrase of phrases)check(text.includes(phrase),`Catalog effect is rendered: ${phrase}`);
   for(const [width,height] of report.viewports){
    await page.setViewportSize({width,height});
    const central=await geometry(page,'.inventory-list .item-card>p>span');
    const rail=await geometry(page,'.equipment-list>.equipped-item p>span');
    const clipped=[...central,...rail].filter(row=>row.box.width>0&&(row.scrollWidth>row.clientWidth+1||row.textRight>row.box.right+1));
    check(clipped.length===0,`${width}: affix rows fit their text columns`,{clipped,centralRows:central.length,compactRailRows:rail.length});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: no document horizontal overflow`);
    await page.screenshot({path:path.join(output,`${variant.label}-inventory-${width}.png`)});
   }
   await unchanged(page,'All inventory views and viewport changes preserve exact main/mirror bytes');
   await page.setViewportSize({width:1366,height:768});await page.locator('.manual-control [data-action="game"]').click();await page.locator('.forge-screen').waitFor();
   await page.locator('.forge-item-details summary').click();
   check((await page.locator('.forge-item-details').innerText()).includes(variant.label==='baseline'?'暴击追击率':'双同及以上且暴击：追击率'),'Forge uses the same fixed affix conditions');
   await page.locator('.forge-item-details').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${variant.label}-forge-details.png`)});
   await unchanged(page,'Opening forge rules is a read-only action');
   await page.reload();await page.locator('[data-action="continue"]').click();await unchanged(page,'Refresh preserves the exact synthetic build and RNG');
   active.status='PASS';
  }catch(error){active.status='FAIL';active.error=error.stack;await page.screenshot({path:path.join(output,`${variant.label}-FAIL.png`)}).catch(()=>{});}
  finally{await context.close();await fs.writeFile(path.join(output,'affix-browser.json'),JSON.stringify(report,null,2)+'\n');}
 }
 report.status=report.cases.every(row=>row.status==='PASS')&&!report.errors.length?'PASS':'FAIL';
}finally{
 report.finished=new Date().toISOString();report.checks=report.cases.reduce((sum,row)=>sum+row.checks.length,0);report.driverSha256=hash(await fs.readFile(new URL(import.meta.url),'utf8'));
 await fs.writeFile(path.join(output,'affix-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify({status:report.status,groups:report.cases.length,checks:report.checks,errors:report.errors,failures:report.cases.filter(row=>row.status!=='PASS')},null,2));
if(report.status!=='PASS')process.exitCode=1;
