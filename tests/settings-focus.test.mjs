import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsFocus} from '../src/settings-focus.js';

function fixture() {
  const doc={body:{},documentElement:{},activeElement:null};
  const controls=[];
  const make=()=>{const node={dataset:{action:'settings'},disabled:false,getClientRects:()=>[{}],focus(options){doc.activeElement=this;this.options=options;}};controls.push(node);return node;};
  let target=make();doc.activeElement=target;
  const app={ownerDocument:doc,contains:n=>controls.includes(n),querySelector:()=>target};
  const dialog={open:false,contains:n=>n?.insideDialog===true};
  const context={screen:'game',view:'inventory',runId:'run-11'};
  const focus=createSettingsFocus(app,dialog);
  return {doc,app,dialog,context,focus,get target(){return target;},remount(){target=make();return target;}};
}

test('settings close restores a remounted opener after a visual preference redraw',()=>{
 const f=fixture();f.focus.capture(f.target,f.context);const replacement=f.remount();f.doc.activeElement=f.doc.body;
 assert.equal(f.focus.restore(f.context),true);assert.equal(f.doc.activeElement,replacement);assert.deepEqual(replacement.options,{preventScroll:true});
 assert.equal(f.focus.restore(f.context),false,'return request is consumed once');
});
test('closing after a replaced dialog child returns to settings',()=>{
 const f=fixture();f.focus.capture(f.target,f.context);f.doc.activeElement={insideDialog:true};
 assert.equal(f.focus.restore(f.context),true);assert.equal(f.doc.activeElement,f.target);
});
test('a player-selected control after dismissal is never overridden',()=>{
 const f=fixture();f.focus.capture(f.target,f.context);const chosen={dataset:{action:'inventory'}};f.doc.activeElement=chosen;
 assert.equal(f.focus.restore(f.context),false);assert.equal(f.doc.activeElement,chosen);
});
test('title, view and run changes each invalidate the settings return target',()=>{
 for(const patch of [{screen:'title'},{view:'talents'},{runId:'new-run'}]){
  const f=fixture();f.focus.capture(f.target,f.context);f.doc.activeElement=f.doc.body;
  assert.equal(f.focus.restore({...f.context,...patch}),false);assert.equal(f.doc.activeElement,f.doc.body);
 }
});
test('confirm, import or cross-tab cancellation cannot restore a stale opener',()=>{
 const f=fixture();f.focus.capture(f.target,f.context);f.focus.cancel();f.doc.activeElement=f.doc.body;
 assert.equal(f.focus.restore(f.context),false);
});
test('an old close event cannot move focus outside a currently open modal',()=>{
 const f=fixture();f.focus.capture(f.target,f.context);f.dialog.open=true;const child={insideDialog:true};f.doc.activeElement=child;
 assert.equal(f.focus.restore(f.context),false);assert.equal(f.doc.activeElement,child);
 f.dialog.open=false;assert.equal(f.focus.restore(f.context),true);
});
test('hidden and disabled settings controls never receive focus',()=>{
 for(const hidden of [false,true]){const f=fixture();f.focus.capture(f.target,f.context);f.doc.activeElement=f.doc.body;
  if(hidden)f.target.getClientRects=()=>[];else f.target.disabled=true;
  assert.equal(f.focus.restore(f.context),false);assert.equal(f.doc.activeElement,f.doc.body);
 }
});
test('settings return cannot be armed by a control outside the app',()=>{
 const f=fixture();f.focus.capture({dataset:{action:'settings'}},f.context);f.doc.activeElement=f.doc.body;
 assert.equal(f.focus.restore(f.context),false);
});
