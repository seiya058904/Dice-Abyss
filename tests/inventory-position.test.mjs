import test from 'node:test';
import assert from 'node:assert/strict';
import {captureInventoryPosition,restoreInventoryPosition} from '../src/inventory-dom.js';

const previousCSS=globalThis.CSS;
globalThis.CSS ||= {escape:value=>value};
test.after(()=>{if(previousCSS===undefined)delete globalThis.CSS;else globalThis.CSS=previousCSS;});

// Small DOM doubles check remount, identity and focus policy. They implement a
// scroll-clamped list; real layout, native clicks and dialog behavior remain
// browser QA responsibilities.
class Element {
  constructor(doc, {id='',classes=[],dataset={},disabled=false,role='node',top=0,height=100}={}) {
    Object.assign(this,{ownerDocument:doc,id,classes,dataset,disabled,role,contentTop:top,height,children:[],parentElement:null,hidden:false});
    this._scrollTop=0;this.scrollLeft=0;
  }
  append(...nodes) { for (const node of nodes) { node.parentElement=this;this.children.push(node); } }
  contains(node) { return node===this || this.children.some(child => child.contains(node)); }
  matches(selector) {
    if (selector[0]==='.') return this.classes.includes(selector.slice(1));
    if (selector[0]==='#') return this.id===selector.slice(1);
    const attributes=[...selector.matchAll(/\[data-([\w-]+)(?:="([^"]*)")?\]/g)];
    return attributes.length>0 && attributes.every(([,name,value]) => {
      const key=name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
      return value===undefined ? Object.hasOwn(this.dataset,key) : this.dataset[key]===value;
    });
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)||null; }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(value) {
    const end=Math.max(0,...this.children.map(child=>child.contentTop+child.height));
    this._scrollTop=Math.max(0,Math.min(value,Math.max(0,end-this.height)));
  }
  getBoundingClientRect() {
    if (this.role==='list') return {top:100,bottom:100+this.height,height:this.height};
    if (this.role==='card') { const top=100+this.contentTop-this.parentElement.scrollTop;return {top,bottom:top+this.height,height:this.height}; }
    return {top:0,bottom:20,height:20};
  }
  getClientRects() { return this.hidden?[]:[this.getBoundingClientRect()]; }
  focus(options) { this.ownerDocument.activeElement=this;this.focusOptions=options; }
}

function scene({ids=Array.from({length:12},(_,i)=>`i${i}`),page=0,pages=3,equipped=[],doc={activeElement:null}}={}) {
  const app=new Element(doc),screen=new Element(doc,{classes:['inventory-screen']}),list=new Element(doc,{classes:['inventory-list'],role:'list',height:250});
  const sort=new Element(doc,{id:'inventory-sort'}),rarity=new Element(doc,{id:'inventory-rarity'});
  const filters=['','weapon'].map(slot=>new Element(doc,{dataset:{action:'filter',slot}}));
  const prev=new Element(doc,{dataset:{action:'inventory-page',page:String(page-1)},disabled:page===0});
  const next=new Element(doc,{dataset:{action:'inventory-page',page:String(page+1)},disabled:page+1>=pages});
  app.append(screen);screen.append(...filters,rarity,sort,list,prev,next);
  for (const [index,id] of ids.entries()) {
    const card=new Element(doc,{classes:['item-card'],role:'card',top:index*100});
    card.append(...['lock','salvage-item','equip'].map(action=>new Element(doc,{dataset:{action,id},disabled:action==='equip'&&equipped.includes(id)})));
    list.append(card);
  }
  const action=(id,action='lock')=>list.querySelectorAll('[data-action]').find(node=>node.dataset.id===id&&node.dataset.action===action);
  return {app,screen,list,sort,rarity,filters,prev,next,doc,action};
}
function remount(before, options={}, captureOptions={}) {
  const position=captureInventoryPosition(before.app,'run-a',captureOptions);before.doc.activeElement=null;
  const after=scene({...options,doc:before.doc});
  return {position,after,restore:settings=>restoreInventoryPosition(after.app,position,{runId:'run-a',...settings})};
}
const focused = state => state.doc.activeElement;

test('existing same-page item controls retain scroll position and keyboard focus',()=>{
  for (const action of ['lock','salvage-item']) {
    const before=scene();before.list.scrollTop=450;before.action('i5',action).focus();
    const {after,restore}=remount(before);restore();
    assert.equal(after.list.scrollTop,450);assert.equal(focused(after),after.action('i5',action));
    assert.deepEqual(focused(after).focusOptions,{preventScroll:true});
  }
});

test('same-page rebuild preserves the visible item when earlier rows change',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5').focus();
  const offset=before.action('i5').closest('.item-card').getBoundingClientRect().top-before.list.getBoundingClientRect().top;
  const {after,restore}=remount(before,{ids:['new',...Array.from({length:12},(_,i)=>`i${i}`)]});restore();
  assert.equal(after.list.scrollTop,550);
  assert.equal(after.action('i5').closest('.item-card').getBoundingClientRect().top-after.list.getBoundingClientRect().top,offset);
  assert.equal(focused(after),after.action('i5'));
});

test('equipping falls back from the now-disabled button to the same item lock',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5','equip').focus();
  const {after,restore}=remount(before,{equipped:['i5']});restore();
  assert.equal(after.list.scrollTop,450);assert.equal(focused(after),after.action('i5','lock'));
});

test('a removed or off-page item uses a surviving old neighbor at its former position',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5').focus();
  const {after,restore}=remount(before,{ids:Array.from({length:12},(_,i)=>`i${i}`).filter(id=>id!=='i5')});restore();
  assert.equal(after.list.scrollTop,450);assert.equal(focused(after),after.action('i6'));
  assert.equal(after.action('i6').closest('.item-card').getBoundingClientRect().top,150);
});

test('explicit sort, rarity and slot changes start at the top and retain their control',()=>{
  for (const key of ['sort','rarity','filter']) {
    const before=scene();before.list.scrollTop=650;(key==='filter'?before.filters[1]:before[key]).focus();
    const {after,restore}=remount(before,{}, {reset:true});restore({reset:true});
    assert.equal(after.list.scrollTop,0);assert.equal(focused(after),key==='filter'?after.filters[1]:after[key]);
  }
});

test('paging tracks the direction control after its target page changes',()=>{
  for (const {from,to,pages,direction,expected} of [
    {from:1,to:2,pages:5,direction:'next',expected:'next'},
    {from:2,to:1,pages:5,direction:'prev',expected:'prev'},
    {from:1,to:0,pages:5,direction:'prev',expected:'next'},
    {from:1,to:2,pages:3,direction:'next',expected:'prev'},
  ]) {
    const before=scene({page:from,pages});before.list.scrollTop=650;before[direction].focus();
    const {after,restore}=remount(before,{page:to,pages}, {reset:true});restore({reset:true});
    assert.equal(after.list.scrollTop,0);assert.equal(focused(after),after[expected]);
    assert.equal(focused(after).disabled,false);
  }
});

test('an empty result has a usable filter fallback instead of a vanished card',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5').focus();
  const {after,restore}=remount(before,{ids:[],pages:1});restore();
  assert.equal(after.list.scrollTop,0);assert.equal(focused(after),after.sort);
});

test('a new run cannot inherit position or focus through reused equipment IDs',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5').focus();
  const {after,restore}=remount(before);restore({runId:'run-b'});
  assert.equal(after.list.scrollTop,0);assert.equal(focused(after),null);
});

test('open dialogs keep focus while a background inventory redraw preserves position',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5').focus();
  const {after,restore}=remount(before);const dialogButton=new Element(after.doc);dialogButton.focus();restore({dialogOpen:true});
  assert.equal(after.list.scrollTop,450);assert.equal(focused(after),dialogButton);
});

test('an unchanged failed transaction restores its original actionable item',()=>{
  const before=scene();before.list.scrollTop=450;before.action('i5','equip').focus();
  const {after,restore}=remount(before);restore();
  assert.equal(after.list.scrollTop,450);assert.equal(focused(after),after.action('i5','equip'));
});

test('other views have no inventory restoration or focus policy',()=>{
  const doc={activeElement:null},app=new Element(doc);assert.equal(captureInventoryPosition(app,'run-a'),null);
  assert.doesNotThrow(()=>restoreInventoryPosition(app,null,{runId:'run-a'}));assert.equal(doc.activeElement,null);
});

test('explicit result changes do not enumerate item cards or read discarded anchor geometry',t=>{
  const calls={cardLists:0,itemLookups:0,anchorGeometry:0};
  const originalAll=Element.prototype.querySelectorAll,originalOne=Element.prototype.querySelector,originalRect=Element.prototype.getBoundingClientRect;
  t.mock.method(Element.prototype,'querySelectorAll',function(selector){
    if(this.role==='list'&&selector==='.item-card')calls.cardLists++;
    return originalAll.call(this,selector);
  });
  t.mock.method(Element.prototype,'querySelector',function(selector){
    if(this.role==='card'&&selector==='[data-action="lock"][data-id]')calls.itemLookups++;
    return originalOne.call(this,selector);
  });
  t.mock.method(Element.prototype,'getBoundingClientRect',function(){
    if(this.role==='card'||this.role==='list')calls.anchorGeometry++;
    return originalRect.call(this);
  });
  const ids=Array.from({length:60},(_,i)=>`i${i}`);
  for(const key of ['sort','rarity','next']){
    const before=scene({ids});before.list.scrollTop=5500;before[key].focus();
    const {position,after,restore}=remount(before,{ids,page:key==='next'?1:0},{reset:true});restore({reset:true});
    assert.equal(position.anchor,null);assert.deepEqual(position.ids,[]);
    assert.equal(after.list.scrollTop,0);assert.equal(focused(after),after[key]);
  }
  assert.deepEqual(calls,{cardLists:0,itemLookups:0,anchorGeometry:0},'unused old/new page geometry must not be scanned to reset a list');
});
