import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionFocus} from '../src/action-focus.js';

// These doubles test presentation ownership and the no-focus-stealing policy.
// Native button activation, remount blur and keyboard continuity are separately
// exercised in a real browser; this is not a browser/layout substitute.
function fixture() {
  const doc={body:{kind:'body'},documentElement:{kind:'html'}};
  let nodes=[],control;
  const app={ownerDocument:doc,contains:node=>nodes.includes(node),querySelector:()=>nodes.find(n=>n.id==='primary-action')||null};
  const make=(id='',action='settings')=>({id,dataset:{action},disabled:false,hidden:false,
    getClientRects(){return this.hidden?[]:[{}];},
    focus(options){doc.activeElement=this;this.focusOptions=options;this.focusCalls=(this.focusCalls||0)+1;control?.observe(this);},
  });
  const primary=make('primary-action','roll'),other=make('','settings'),skip=make('','skip');
  nodes=[primary,other,skip];doc.activeElement=doc.body;control=createActionFocus(app);
  const remount=({disabled=false,hidden=false,missing=false,action='open'}={})=>{
    const replacement=make('primary-action',action);Object.assign(replacement,{disabled,hidden});
    nodes=[...(missing?[]:[replacement]),other,skip];doc.activeElement=doc.body;control.observe(doc.body);return replacement;
  };
  const token={runId:'run-a',generation:7};
  return {doc,app,control,primary,other,skip,remount,token,capture:()=>control.capture(token),restore:overrides=>control.restore({...token,...overrides})};
}

test('only the focused primary action starts a presentation focus request',()=>{
  for(const origin of ['body','other','dialog','primary']){
    const f=fixture();
    if(origin==='other')f.other.focus();else if(origin!=='body')f.primary.focus();
    f.control.capture({...f.token,dialogOpen:origin==='dialog'});
    const next=f.remount();assert.equal(f.restore(),origin==='primary');
    assert.equal(f.doc.activeElement,origin==='primary'?next:f.doc.body);
  }
});

test('intermediate disabled remounts retain intent until the new primary action is enabled',()=>{
  const f=fixture();f.primary.focus();f.capture();
  const busy=f.remount({disabled:true,action:'roll'});assert.equal(f.doc.activeElement,f.doc.body);assert(busy.disabled);
  f.remount({disabled:true,action:'open'});
  const chest=f.remount({action:'open'});assert(f.restore());assert.equal(f.doc.activeElement,chest);
  assert.deepEqual(chest.focusOptions,{preventScroll:true});assert.equal(chest.focusCalls,1);
});

test('moving to another control cancels even if another remount later blurs it',()=>{
  const f=fixture();f.primary.focus();f.capture();f.remount({disabled:true});f.other.focus();
  f.remount();assert.equal(f.restore(),false);assert.equal(f.doc.activeElement,f.doc.body);
});

test('a skip control preserves the original primary action intent',()=>{
  const f=fixture();f.primary.focus();f.capture();f.remount({disabled:true});f.skip.focus();
  const next=f.remount();assert(f.restore());assert.equal(f.doc.activeElement,next);
});

test('open dialogs and explicit lifecycle cancellation never move focus',()=>{
  for(const kind of ['dialog','cancel']){
    const f=fixture();f.primary.focus();f.capture();f.remount();
    if(kind==='cancel')f.control.cancel();
    assert.equal(f.restore({dialogOpen:kind==='dialog'}),false);assert.equal(f.doc.activeElement,f.doc.body);
    assert.equal(f.restore(),false,'a dismissed request cannot return after the dialog closes');
  }
});

test('run boundaries reject reused IDs and stale completion cannot consume a newer request',()=>{
  const replaced=fixture();replaced.primary.focus();replaced.capture();replaced.remount();
  assert.equal(replaced.restore({runId:'run-b'}),false);assert.equal(replaced.doc.activeElement,replaced.doc.body);
  const f=fixture();f.primary.focus();f.control.capture({runId:'run-a',generation:8});const next=f.remount();
  assert.equal(f.restore(),false);assert(f.restore({generation:8}));assert.equal(f.doc.activeElement,next);
});

test('final disabled, hidden or missing primary buttons have no unrelated fallback',()=>{
  for(const option of ['disabled','hidden','missing']){
    const f=fixture();f.primary.focus();f.capture();f.remount({[option]:true});
    assert.equal(f.restore(),false);assert.equal(f.doc.activeElement,f.doc.body);
  }
});

test('final restoration also protects a focused control if no focus event was observed',()=>{
  const f=fixture();f.primary.focus();f.capture();f.remount();f.doc.activeElement=f.other;
  assert.equal(f.restore(),false);assert.equal(f.doc.activeElement,f.other);
});

test('each request restores at most once and never reclaims focus after completion',()=>{
  const f=fixture();f.primary.focus();f.capture();const next=f.remount();assert(f.restore());
  f.doc.activeElement=f.doc.body;assert.equal(f.restore(),false);assert.equal(f.doc.activeElement,f.doc.body);assert.equal(next.focusCalls,1);
});
