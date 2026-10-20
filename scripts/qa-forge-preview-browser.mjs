// Synthetic saves in an isolated browser context. No user profile or runtime dependency.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node
// scripts/qa-forge-preview-browser.mjs --url=http://127.0.0.1:4193 --output=/tmp/forge-qa
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {num} from '../src/views.js';
import {MAX_ITEM_LEVEL} from '../src/equipment.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)];}));
const url=args['--url']||'http://127.0.0.1:4193',output=path.resolve(args['--output']||'/tmp/forge-preview-qa'),only=args['--case'];
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={synthetic:true,browser:browser.version(),url,renderer:'SwiftShader; functional viewport checks, not physical GPU certification',groups:[],errors:[]};
let active,checks=0;
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function check(value,label,details){checks++;active.checks.push({label,passed:!!value,...(details===undefined?{}:{details})});assert(value,label);}
function equal(actual,expected,label){assert.deepEqual(actual,expected,label);check(true,label,{actual:sha(actual),expected:sha(expected)});}
function fixture(seed=731,enhance=0){
 let s=E.transition(E.newGame(seed),{type:'fate'});s.route[0].type='forge';s=E.transition(s,{type:'enter'});s.player.gold=100000;
 for(const slot of ['relic','relic2','relic3']){const item=E.makeItem(s,'relic',2);s.player.items.push(item);s.player.equipped[slot]=item.id;}
 for(const item of s.player.items)item.enhance=enhance;
 assert(S.validateSave(s));return s;
}
const saved=async p=>S.decodeSave(await p.evaluate(key=>localStorage.getItem(key),S.SAVE_KEY));
async function load(p,state){
 await p.goto(url);await p.evaluate(({raw,keys})=>{localStorage.setItem(keys[0],raw);localStorage.setItem(keys[1],raw);localStorage.setItem(keys[2],JSON.stringify({effects:'low',sound:false,scale:1}));},{raw:S.encodeSave(state),keys:[S.SAVE_KEY,S.BACKUP_KEY,S.SETTINGS_KEY]});
 await p.reload();await p.locator('[data-action="continue"]').click();await p.locator('.forge-screen').waitFor();await p.evaluate(()=>document.fonts.ready);
}
async function idle(p){await p.waitForFunction(()=>!document.querySelector('.center-panel.busy'));}
async function waitRevision(p,revision){await p.waitForFunction(({key,revision})=>JSON.parse(JSON.parse(localStorage.getItem(key)).payload).revision===revision,{key:S.SAVE_KEY,revision});await idle(p);}
async function quote(p,state,slot){
 const item=state.player.items.find(i=>i.id===state.player.equipped[slot]),before=E.itemStats(item),cells=p.locator('[data-forge-face]');
 check(await cells.count()===6,'six outcomes are present');
 for(let face=1;face<=6;face++){
  const gain=Math.min(20-item.enhance,face>=5?3:face>=3?2:1),stats=E.itemStats({...item,enhance:item.enhance+gain}),cell=cells.nth(face-1),text=await cell.innerText();
  check(text.includes(`+${gain}`)&&text.includes(`→ +${item.enhance+gain}`),`face ${face} shows the bounded enhancement`);
  for(const [key,label] of [['attack','攻击'],['hp','生命'],['defense','防御']])if(Object.hasOwn(before,key))check(text.includes(`${label} ${num(stats[key])}`),`face ${face} shows actual item ${key}`,{before:before[key],after:stats[key]});
 }
 check((await p.locator('.forge-forecast-note').innerText()).includes(item.enhance===20?'极限':'本件装备属性')||!(await p.locator('.forge-forecast-note').innerText()).includes('伤害必定'),'forecast never guarantees final combat damage');
 equal(await saved(p),state,'reading the six quotes does not spend, heal or draw RNG');
}
async function run(name,fn){
 if(only&&only!==name)return;
 active={name,status:'RUNNING',checks:[]};report.groups.push(active);
 const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p=await context.newPage();p.on('pageerror',e=>report.errors.push(String(e)));
 try{await fn(p);active.status='PASS';}catch(e){active.status='FAIL';active.error=e.stack;await p.screenshot({path:path.join(output,`FAIL-${name}.png`)}).catch(()=>{});}
 finally{await context.close();report.checks=checks;await fs.writeFile(path.join(output,'forge-preview-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${active.status}`);}
}
try{
 await run('responsive-readable-preview',async p=>{
  const s=fixture();await load(p,s);check(await p.title()==='骰狱：无尽深渊 · Dice Abyss','page identity');
  for(const [width,height] of [[1366,768],[1920,1080],[2560,1440],[3840,2160],[390,844]]){
   await p.setViewportSize({width,height});await p.locator('[data-action="forge-slot"][data-slot="armor"]').click();await quote(p,s,'armor');
   const shape=await p.evaluate(()=>{
    const root=document.querySelector('.forge-screen'),target=root.querySelector('.forge-target'),button=root.querySelector('[data-action="forge"]'),r=button.getBoundingClientRect(),clip=target.getBoundingClientRect();
    return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,button:r.toJSON(),clip:clip.toJSON(),targetScrollable:target.scrollHeight>target.clientHeight,previewVisible:[...root.querySelectorAll('[data-forge-face]')].every(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=innerWidth+1;}),textSize:getComputedStyle(root.querySelector('.forge-face-stats small')).fontSize};
   });
   check(shape.documentWidth<=width+1,'forge scene fits viewport width',shape);
   check(shape.previewVisible,'six quote columns stay inside horizontal viewport');
   check(parseFloat(shape.textSize)>=11,'per-face attribute text has an 11px minimum');
   await p.locator('[data-action="forge"]').scrollIntoViewIfNeeded();
   check(await p.locator('[data-action="forge"]').isVisible(),'forge action is reachable without overlay');
   await p.screenshot({path:path.join(output,`forge-${width}.png`)});
  }
 });
 await run('five-slots-exact-transactions',async p=>{
  for(const [index,slot] of ['weapon','armor','relic','relic2','relic3'].entries()){
   const before=fixture(731+index);await load(p,before);await p.locator(`[data-action="forge-slot"][data-slot="${slot}"]`).click();await quote(p,before,slot);
   const id=before.player.equipped[slot],expected=E.transition(before,{type:'forge',id}),cost=before.player.gold-expected.player.gold;
   check((await p.locator('#forge-availability').innerText()).includes(num(before.player.gold-cost)),'quote shows exact remaining gold');
   await p.locator('[data-action="forge"]').click();await waitRevision(p,before.revision+1);equal(await saved(p),expected,`${slot} spends once and preserves the engine result`);
   check((await p.locator('.forge-result').innerText()).includes(`${expected.lastForge.value} 点`),'settled result names the real face');
   await p.reload();await p.locator('[data-action="continue"]').click();equal(await saved(p),expected,'refresh restores the same committed forge');
  }
 });
 await run('caps-empty-balance-and-keyboard',async p=>{
  for(const enhance of [18,19,20]){
   const s=fixture(912,enhance);await load(p,s);await quote(p,s,'weapon');
   check(await p.locator('[data-action="forge"]').isEnabled()===(enhance<20),`+${enhance} has correct availability`);
  }
  const poor=fixture(),item=poor.player.items.find(i=>i.id===poor.player.equipped.weapon);poor.player.gold=E.forgeCost(poor,item)-1;await load(p,poor);check(!(await p.locator('[data-action="forge"]').isEnabled()),'insufficient gold prevents spending');check((await p.locator('#forge-availability').innerText()).includes('还差 1 金币'),'shortfall is exact');
  const ceiling=fixture(),cappedItem=ceiling.player.items.find(i=>i.id===ceiling.player.equipped.weapon);cappedItem.level=MAX_ITEM_LEVEL;cappedItem.levelXp=0;ceiling.player.gold=E.GOLD_CAP;await load(p,ceiling);
  check(!(await p.locator('[data-action="forge"]').isEnabled()),'a cost above the gold cap cannot be spent');check((await p.locator('#forge-availability').innerText()).includes('费用超过金币持有上限'),'gold cap sentinel is not presented as an attainable one-coin shortfall');equal(await saved(p),ceiling,'reading a cap-limited quote preserves the exact save');
  const empty=fixture();empty.player.equipped.relic3=null;await load(p,empty);await p.locator('[data-action="forge-slot"][data-slot="relic3"]').click();check((await p.locator('.room-empty').innerText()).includes('尚未装备'),'empty slot explains how to recover');check(await p.locator('.room-empty [data-action="inventory"]').isVisible(),'empty slot links to inventory');
  await p.locator('[data-action="forge-slot"][data-slot="armor"]').focus();await p.keyboard.press('Enter');check(await p.locator('[data-action="forge-slot"][data-slot="armor"]').getAttribute('aria-pressed')==='true','keyboard selects armor');
  await p.locator('.forge-item-details summary').focus();await p.keyboard.press('Enter');check(await p.locator('.forge-item-details').getAttribute('open')!==null,'keyboard opens contextual rules');check((await p.locator('.forge-item-details').innerText()).includes('不随 +N 增加'),'fixed affixes are explained');equal(await saved(p),empty,'keyboard preview controls do not modify the save');
 });
}finally{report.checks=checks;await browser.close();await fs.writeFile(path.join(output,'forge-preview-browser.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({groups:report.groups.length,checks,failed:report.groups.filter(g=>g.status!=='PASS').map(g=>g.name),errors:report.errors}));
if(report.groups.some(g=>g.status!=='PASS')||report.errors.length)process.exitCode=1;
