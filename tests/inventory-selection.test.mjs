import test from 'node:test';
import assert from 'node:assert/strict';
import {captureInventoryPosition,restoreInventoryPosition} from '../src/inventory-dom.js';

const previousCSS=globalThis.CSS;
globalThis.CSS||={escape:value=>value};
test.after(()=>{if(previousCSS===undefined)delete globalThis.CSS;else globalThis.CSS=previousCSS;});

// The test supplies only focus/selection surfaces. It does not simulate browser
// caret defaults or claim native rendering; browser QA checks those separately.
function scene({value='甲乙丙丁戊己',start=2,end=4,direction='forward',active=true}={}){
 const doc={activeElement:null},calls=[];
 const input={id:'inventory-query',value,selectionStart:start,selectionEnd:end,selectionDirection:direction,dataset:{},disabled:false,
  closest:()=>null,getClientRects:()=>[{}],focus(options){doc.activeElement=this;calls.push(['focus',options]);},
  setSelectionRange(a,b,d){this.selectionStart=a;this.selectionEnd=b;this.selectionDirection=d;calls.push(['selection',a,b,d]);}};
 const list={scrollTop:12,scrollLeft:3,querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0,bottom:100})};
 const screen={contains:node=>node===input,querySelector:selector=>selector==='.inventory-list'?list:selector==='#inventory-query'?input:null,querySelectorAll:()=>[]};
 const app={ownerDocument:doc,querySelector:selector=>selector==='.inventory-screen'?screen:null};
 if(active)doc.activeElement=input;
 return {doc,input,list,app,calls};
}
const range=input=>[input.selectionStart,input.selectionEnd,input.selectionDirection];

test('same-run redraw restores collapsed carets and forward/backward selections in an unchanged draft',()=>{
 for(const [start,end,direction]of [[0,0,'none'],[2,2,'none'],[2,4,'forward'],[2,4,'backward'],[0,6,'forward']]){
  const before=scene({start,end,direction}),snapshot=captureInventoryPosition(before.app,'run-a');
  const after=scene({start:6,end:6,direction:'none',active:false});
  restoreInventoryPosition(after.app,snapshot,{runId:'run-a'});
  assert.equal(after.doc.activeElement,after.input);
  assert.equal(after.input.value,before.input.value);
  assert.deepEqual(range(after.input),[start,end,direction]);
 }
});

test('explicit result reset retains unchanged draft selection while resetting list scroll',()=>{
 const before=scene({start:1,end:5,direction:'backward'}),snapshot=captureInventoryPosition(before.app,'run-a',{reset:true});
 const after=scene({start:6,end:6,active:false});
 restoreInventoryPosition(after.app,snapshot,{runId:'run-a',reset:true});
 assert.deepEqual(range(after.input),[1,5,'backward']);
 assert.equal(after.list.scrollTop,0);assert.equal(after.list.scrollLeft,0);
});

test('trimmed, replaced and cleared text keeps its new selection instead of importing a stale range',()=>{
 const before=scene({value:'  余火  ',start:1,end:5,direction:'backward'}),snapshot=captureInventoryPosition(before.app,'run-a');
 for(const value of ['余火','','新草稿']){
  const after=scene({value,start:0,end:0,direction:'none',active:false});
  restoreInventoryPosition(after.app,snapshot,{runId:'run-a'});
  assert.equal(after.doc.activeElement,after.input);
  assert.deepEqual(range(after.input),[0,0,'none']);
  assert.equal(after.calls.filter(([kind])=>kind==='selection').length,0);
 }
});

test('new runs neither focus a reused search control nor restore the previous run selection',()=>{
 const snapshot=captureInventoryPosition(scene().app,'run-a'),after=scene({start:0,end:0,active:false});
 restoreInventoryPosition(after.app,snapshot,{runId:'run-b'});
 assert.equal(after.doc.activeElement,null);assert.deepEqual(after.calls,[]);
 assert.deepEqual(range(after.input),[0,0,'forward']);
 assert.equal(after.list.scrollTop,0);assert.equal(after.list.scrollLeft,0);
});

test('a modal dialog retains focus and does not apply the background search selection',()=>{
 const snapshot=captureInventoryPosition(scene().app,'run-a'),after=scene({start:0,end:0,active:false}),dialogButton={};
 after.doc.activeElement=dialogButton;
 restoreInventoryPosition(after.app,snapshot,{runId:'run-a',dialogOpen:true});
 assert.equal(after.doc.activeElement,dialogButton);assert.deepEqual(after.calls,[]);
});

test('a retained native input with the correct selection receives no focus or selection reset',()=>{
 const state=scene({direction:'backward'}),snapshot=captureInventoryPosition(state.app,'run-a',{reset:true});
 restoreInventoryPosition(state.app,snapshot,{runId:'run-a',reset:true});
 assert.deepEqual(state.calls,[]);assert.deepEqual(range(state.input),[2,4,'backward']);
});

test('an unfocused search field does not acquire focus during a background redraw',()=>{
 const before=scene({active:false}),snapshot=captureInventoryPosition(before.app,'run-a'),after=scene({active:false});
 restoreInventoryPosition(after.app,snapshot,{runId:'run-a'});
 assert.equal(after.doc.activeElement,null);assert.deepEqual(after.calls,[]);
});
