import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const index=arg.indexOf('=');return [arg.slice(2,index),arg.slice(index+1)];}));
const root=resolve(args.source||fileURLToPath(new URL('../',import.meta.url)));
const {captureInventoryPosition,restoreInventoryPosition}=await import(pathToFileURL(resolve(root,'src/inventory-dom.js')));
const {captureWorkbenchPosition,restoreWorkbenchPosition}=await import(pathToFileURL(resolve(root,'src/fusion-dom.js')));
const noop=()=>{};
globalThis.CSS={escape:value=>value};
globalThis.window={scrollX:0,scrollY:0,scrollTo:noop};
const calls={setSelectionRange:0};
function scene(value,range){
 const document={activeElement:null};
 const list={scrollTop:0,scrollLeft:0,id:'',dataset:{},classList:{contains:c=>c==='inventory-list'},querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0,bottom:100})};
 const input={id:'inventory-query',dataset:{},disabled:false,value,selectionStart:range[0],selectionEnd:range[1],selectionDirection:range[2],closest:()=>null,getClientRects:()=>[{}],focus(){document.activeElement=this;},setSelectionRange(a,b,d='none'){calls.setSelectionRange++;this.selectionStart=a;this.selectionEnd=b;this.selectionDirection=d;}};
 const screen={contains:n=>n===input,querySelector:s=>s==='.inventory-list'?list:s==='#inventory-query'?input:null,querySelectorAll:()=>[]};
 const app={ownerDocument:document,contains:n=>n===input,querySelector:s=>s==='.inventory-screen'?screen:s==='.inventory-list'?list:s==='#inventory-query'?input:null,querySelectorAll:s=>s.includes('.inventory-list')?[list]:[]};
 document.activeElement=input;return {document,list,input,app};
}
const before=scene('余火护甲草稿',[2,4,'backward']);globalThis.document=before.document;
const general=captureWorkbenchPosition(before.app);
const position=captureInventoryPosition(before.app,'same-run');
assert.equal(general.start,2);assert.equal(general.end,4);
// The ownership transfer is the unmodified render() policy at app.js:125.
general.scroll=general.scroll.filter(item=>item.className!=='inventory-list');
if(position.focus){general.focus=null;general.focusId=null;general.focusData=null;}
const after=scene(before.input.value,[before.input.value.length,before.input.value.length,'none']);
after.document.activeElement=null;globalThis.document=after.document;
restoreWorkbenchPosition(after.app,general,false);
restoreInventoryPosition(after.app,position,{runId:'same-run'});
assert.equal(after.document.activeElement,after.input);
assert.equal(after.input.value,before.input.value);
const beforeRange=[before.input.selectionStart,before.input.selectionEnd,before.input.selectionDirection],afterRange=[after.input.selectionStart,after.input.selectionEnd,after.input.selectionDirection];
const restored=JSON.stringify(beforeRange)===JSON.stringify(afterRange);
assert.equal(restored,args.expect!=='missing');
assert.equal(calls.setSelectionRange,restored?1:0);
console.log(JSON.stringify({method:'Short DOM-double proof of missing selection restoration; no browser or timing claim.',sourceRoot:root,status:restored?'RESTORED':'REPRODUCED_MISSING_RESTORATION',sourceOwnership:'src/app.js:125',captureFields:Object.keys(position.focus),draftPreserved:true,focusRestored:true,beforeSelection:[before.input.selectionStart,before.input.selectionEnd,before.input.selectionDirection],afterMockRemountSelection:[after.input.selectionStart,after.input.selectionEnd,after.input.selectionDirection],setSelectionRangeCalls:calls.setSelectionRange},null,2));
