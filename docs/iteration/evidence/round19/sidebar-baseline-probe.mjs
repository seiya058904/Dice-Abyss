// Optional local-only reproduction of the inherited long-name equipment rail.
// Invoke with source-root, loopback URL, output directory and an installed browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const [source,url,out]=process.argv.slice(2),root=path.resolve(source);
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const {decodeSave,encodeSave,SAVE_KEY,BACKUP_KEY,SETTINGS_KEY}=await import(pathToFileURL(path.join(root,'src/storage.js')));
const state=decodeSave(await fs.readFile(path.join(root,'docs/iteration/evidence/round18/strategy/original-seed-23757-first-death.save.json'),'utf8'));
state.player.items.find(item=>item.id===state.player.equipped.armor).name='长夜刻痕'.repeat(16);
const raw=encodeSave(state),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(url);await page.evaluate(({raw,main,mirror,settings})=>{localStorage.clear();localStorage.setItem(main,raw);localStorage.setItem(mirror,raw);localStorage.setItem(settings,JSON.stringify({sound:false,effects:'low',scale:1}));},{raw,main:SAVE_KEY,mirror:BACKUP_KEY,settings:SETTINGS_KEY});
 await page.reload();await page.locator('[data-action="continue"]').click();await page.locator('.main-nav [data-action="inventory"]').click();await page.evaluate(()=>document.fonts.ready);
 const cards=await page.locator('.right-rail .equipped-item').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {slot:node.dataset.slot,rect:rect.toJSON(),children:[...node.children].map(child=>({tag:child.tagName,className:child.className,rect:child.getBoundingClientRect().toJSON()}))};}));
 const overflow=cards.flatMap((card,index)=>card.children.filter(child=>child.rect.bottom>card.rect.bottom+1||child.rect.right>card.rect.right+1).map(child=>({index,slot:card.slot,child:child.className||child.tag,bottomBy:child.rect.bottom-card.rect.bottom,rightBy:child.rect.right-card.rect.right})));
 const saved=await page.evaluate(({main,mirror})=>[localStorage.getItem(main),localStorage.getItem(mirror)],{main:SAVE_KEY,mirror:BACKUP_KEY});assert.deepEqual(saved,[raw,raw]);
 await page.screenshot({path:path.join(out,'sidebar-1920-baseline.jpg'),type:'jpeg',quality:72,animations:'disabled'});
 const report={scope:'SYNTHETIC_64_CHARACTER_NAME_IN_ARCHIVED_NATURAL_SAVE',source:root,url,browser:browser.version(),date:new Date().toISOString(),width:1920,height:1080,rawSha256:hash(raw),sourceHashes:Object.fromEntries(await Promise.all(['src/views.js','src/rooms.css','src/progression.css','src/responsive.css'].map(async p=>[p,hash(await fs.readFile(path.join(root,p)))]))),cards,overflow,saveUnchanged:true,errors,classification:overflow.length?'CONFIRMED_INHERITED_LAYOUT_OVERFLOW':'NO_OVERFLOW_OBSERVED'};
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({classification:report.classification,overflow,saveUnchanged:true,errors}));
 assert(overflow.length>0,'This probe must reproduce the existing input overflow; use the final responsive regression for the corrected source');assert.equal(errors.length,0);
}finally{await browser.close();}
