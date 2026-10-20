// Portable Round11 viewport/scale gate. Use tester-provided Playwright and Chromium.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return [value.slice(0,at),value.slice(at+1)];}));
const root=path.resolve(args['--source']||new URL('..',import.meta.url).pathname);
const out=path.resolve(args['--output']||'/tmp/dice-viewport-scales');
const url=args['--url']||'http://127.0.0.1:4188/';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));
assert(out!==root&&!out.startsWith(root+path.sep),'Keep generated evidence outside the complete source');
const hash=value=>createHash('sha256').update(value).digest('hex');
const E = await import(pathToFileURL(path.join(root,'src/engine.js')));
const S = await import(pathToFileURL(path.join(root,'src/storage.js')));
let fixture = E.transition(E.transition(E.newGame(110011), {type:'fate'}), {type:'enter'});
if (fixture.phase !== 'combat') throw new Error('Deterministic fixture must begin in combat');
const raw = S.encodeSave(fixture); S.decodeSave(raw);
await fs.mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report = {browser:browser.version(),url,sourceVersion:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,scriptSha256:hash(await fs.readFile(new URL(import.meta.url))),cssBefore:hash(await fs.readFile(path.join(root,'src/responsive.css'))),synthetic:true,errors:[],cases:[],rawFixturePhase:fixture.phase};
const geometry = page => page.evaluate(() => {
  const box = selector => { const e = document.querySelector(selector); if(!e) return null; const r=e.getBoundingClientRect(), s=getComputedStyle(e); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,font:s.fontSize,visibility:s.visibility}; };
  const excess = [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); const s=getComputedStyle(e);return r.width>0 && s.visibility!=='hidden' && s.display!=='none' && (r.left < -1 || r.right > innerWidth+1);}).map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,right:Math.round(e.getBoundingClientRect().right)})).slice(0,25);
  return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight,rootFont:getComputedStyle(document.documentElement).fontSize,primary:box('#primary-action'),control:box('.control-strip'),hud:box('.player-health'),location:box('.location'),title:box('.title-copy h1'),enemy:box('.combat-screen h1'),art:box('.title-art'),canvas:box('.title-art .dice-surface'),die:box('.title-art .cube-die'),excess};
});
try {
  for (const width of [390,768,900]) for (const scale of [.9,1,1.1]) {
    const name = `${width}-${String(scale).replace('.','_')}`;
    const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
    await context.addInitScript(({key,scale})=>localStorage.setItem(key,JSON.stringify({effects:'low',sound:false,scale})),{key:S.SETTINGS_KEY,scale});
    const page=await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror',e=>report.errors.push({name,message:String(e)}));
    await page.goto(url);assert.equal(await page.locator('meta[name="dice-abyss-release"]').getAttribute('content'),report.sourceVersion); await page.evaluate(()=>document.fonts.ready);
    await page.locator('.title-art .dice-surface').waitFor();
    // Let the native render and font-ready resize complete before measuring.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const title=await geometry(page);
    if(width===390 && scale===1) await page.screenshot({path:path.join(out,`title-${name}.png`)});
    await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:S.SAVE_KEY,raw});
    await page.reload(); await page.locator('[data-action="continue"]').click();
    await page.locator('.combat-screen').waitFor(); await page.evaluate(()=>document.fonts.ready);
    const combat=await geometry(page);
    if(width===390) await page.screenshot({path:path.join(out,`combat-${name}.png`)});
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const bottom=await page.evaluate(()=>{const foot=document.querySelector('.bottomline').getBoundingClientRect(),bar=document.querySelector('.control-strip').getBoundingClientRect();return{bottomlineBottom:foot.bottom,dockTop:bar.top,visible:foot.bottom<=bar.top,scrollY};});
    await page.locator('.main-nav [data-action="inventory"]').click();
    const inventory=await geometry(page);
    await page.locator('[data-action="settings"]').click();
    const dialog=await page.locator('dialog').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,height:e.clientHeight,scrollHeight:e.scrollHeight,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}));
    report.cases.push({name,scale,title,combat,bottom,inventory,dialog});
    await context.close();
    assert([title,combat,inventory].every(x=>x.scrollWidth===width),name+': all pages reflow');
    assert.equal(combat.excess.length,0,name+': no visible horizontal overflow');
    assert(bottom.visible,name+': final content is reachable above the dock');
    assert.equal(dialog.width,dialog.scrollWidth,name+': dialog content fits');
    assert(Math.abs(parseFloat(combat.enemy.font)-30*scale)<.01,name+': text scale is applied');
  }
  assert.equal(report.cases.length,9);assert.deepEqual(report.errors,[]);report.status='PASS';
} catch(error){report.status='FAIL';report.failure=String(error);throw error;
} finally {
  report.cssAfter=hash(await fs.readFile(path.join(root,'src/responsive.css')));report.cssStable=report.cssBefore===report.cssAfter;
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
}
console.log(JSON.stringify({errors:report.errors,cases:report.cases.map(c=>({name:c.name,titleWidth:c.title.scrollWidth,combatWidth:c.combat.scrollWidth,inventoryWidth:c.inventory.scrollWidth,enemyFont:c.combat.enemy.font,hudY:c.combat.hud.y,hudBottom:c.combat.hud.bottom,dockTop:c.combat.control.y,bottomVisible:c.bottom.visible,dialogWidth:c.dialog.width,dialogScrollWidth:c.dialog.scrollWidth,canvas:c.title.canvas,die:c.title.die,excess:c.combat.excess}))},null,2));

assert(report.cssStable,'Responsive CSS must remain unchanged during the run');
