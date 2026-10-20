// Diagnostic capture for input/release layout and settings focus.
// Positional arguments: source directory, loopback URL, external output directory.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const [root,url,out]=process.argv.slice(2);
if(!root||!url||!out||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error('Provide source, loopback URL and external output directory');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const E=await import(pathToFileURL(path.join(root,'src/engine.js')));
const S=await import(pathToFileURL(path.join(root,'src/storage.js')));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={url,browser:browser.version(),synthetic:true,errors:[],scenes:[],focus:[]};
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>report.errors.push(String(e)));
const active=()=>page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,action:document.activeElement.dataset?.action,role:document.activeElement.getAttribute('role')}));
const saved=async()=>S.decodeSave(await page.evaluate(k=>localStorage.getItem(k),S.SAVE_KEY));
const idle=()=>page.locator('#primary-action:not(:disabled)').waitFor();
async function scene(name){
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
 const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scrollX,primary:(()=>{let e=document.querySelector('#primary-action');if(!e)return null;let r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};})()}));
 report.scenes.push({name,...metrics});await page.screenshot({path:path.join(out,name+'.png')});
}
try{
 await page.goto(url);await scene('title-390');
 await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({effects:'low',sound:false,scale:1})),S.SETTINGS_KEY);await page.reload();
 await page.locator('[data-action="new"]').click();await idle();await scene('fate-390');
 await page.locator('#primary-action').click();await idle();await scene('route-390');
 await page.locator('#primary-action').click();await idle();await scene('combat-390');
 await page.locator('.main-nav [data-action="inventory"]').click();await scene('inventory-390');
 await page.setViewportSize({width:1366,height:768});await page.locator('[data-action="settings"]').click();
 report.focus.push({step:'open',...await active()});
 await page.locator('[data-action="sound"]').focus();await page.keyboard.press('Space');
 report.focus.push({step:'sound-space',...await active()});
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});
 report.focus.push({step:'sound-escape',...await active()});
 await page.locator('[data-action="settings"]').click();await page.locator('#effects').selectOption('full');
 report.focus.push({step:'effects-select',...await active()});await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});
 report.focus.push({step:'effects-escape',...await active()});
 report.finalState={phase:(await saved()).phase,revision:(await saved()).revision};
}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));

if(report.errors.length)process.exitCode=1;
