import test from 'node:test';
import assert from 'node:assert/strict';
import {updateInventoryDOM} from '../src/inventory-render.js';

const previousCSS=globalThis.CSS;
globalThis.CSS||={escape:value=>value};
test.after(()=>{if(previousCSS===undefined)delete globalThis.CSS;else globalThis.CSS=previousCSS;});

// A small tree implements native structural equality separately from live form
// values. Assertions cover complete trees, unchanged node identity and removed
// controls; template parsing/layout are left to the real-browser driver.
class Node {
 constructor(tag='div',attrs={},text=''){
  this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs={...attrs};this.text=text;this.childNodes=[];this.parentNode=null;
  this.value=attrs.value||'';
  this.classList={contains:value=>(this.attrs.class||'').split(' ').includes(value)};
 }
 get id(){return this.attrs.id||'';}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));}
 get children(){return this.childNodes;}
 get childElementCount(){return this.childNodes.length;}
 get firstChild(){return this.childNodes[0]||null;}
 get firstElementChild(){return this.firstChild;}
 get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
 append(...nodes){for(const node of nodes)this.insertBefore(node,null);return this;}
 insertBefore(node,before){
  if(node===before)return node;
  node.remove();const index=before?this.childNodes.indexOf(before):this.childNodes.length;
  assert(index>=0);this.childNodes.splice(index,0,node);node.parentNode=this;return node;
 }
 remove(){if(this.parentNode){this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null;}}
 replaceWith(node){const parent=this.parentNode;assert(parent);parent.insertBefore(node,this);this.remove();}
 cloneNode(deep){const node=new Node(this.tagName,this.attrs,this.text);node.value=this.value;if(deep)node.append(...this.childNodes.map(child=>child.cloneNode(true)));return node;}
 snapshot(){return {tag:this.tagName,attrs:this.attrs,text:this.text,children:this.childNodes.map(node=>node.snapshot())};}
 isEqualNode(other){return JSON.stringify(this.snapshot())===JSON.stringify(other?.snapshot());}
 matches(selector){
  if(selector.startsWith('#'))return this.id===selector.slice(1);
  if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));
  return selector==='[data-action="lock"][data-id]'&&this.dataset.action==='lock'&&Object.hasOwn(this.dataset,'id');
 }
 querySelectorAll(selector){const selectors=selector.split(',').map(value=>value.trim());return this.childNodes.flatMap(node=>[...(selectors.some(s=>node.matches(s))?[node]:[]),...node.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function card(id,label=id){return new Node('article',{class:'item-card'}).append(new Node('h3',{},label),new Node('button',{'data-action':'lock','data-id':id},'锁定'),new Node('button',{'data-action':'equip','data-id':id},'装备'));}
function scene({ids=['i1','i2','i3'],query='',sort='power',changed={},empty=false}={}){
 const list=new Node('div',{class:'inventory-list','aria-label':'装备列表'}).append(...(empty?[new Node('div',{class:'room-empty'},'暂无符合筛选的装备')]:ids.map(id=>card(id,changed[id]||id))));
 return new Node('section',{class:'collection-screen inventory-screen room-refined'}).append(
  new Node('div',{class:'collection-heading'},'随身行囊'),
  new Node('div',{class:'v5-inventory-filters'}).append(new Node('select',{id:'inventory-sort',value:sort})),
  new Node('form',{id:'inventory-search'}).append(new Node('input',{id:'inventory-query',value:query})),
  list,new Node('div',{class:'inventory-pagination'},ids.join(',')));
}
function appFor(current,next){
 const app=new Node('main').append(new Node('header',{class:'topbar'},'固定标题'),current,new Node('footer',{class:'game-footer'},'固定页脚'));
 app.ownerDocument={createElement(tag){assert.equal(tag,'template');return {content:null,set innerHTML(value){assert.equal(value,'complete-view');this.content=new Node('fragment').append(next.cloneNode(true));}};}};
 return app;
}

test('result reorder and removal retain identical full item cards and the surrounding page',()=>{
 const current=scene(),next=scene({ids:['i3','i1']}),app=appFor(current,next);
 const heading=current.firstChild,form=current.querySelector('#inventory-search'),list=current.querySelector('.inventory-list'),oldCards=[...list.children],outside=[app.firstChild,app.children.at(-1)];
 assert.equal(updateInventoryDOM(app,'complete-view'),true);
 assert.deepEqual(current.snapshot(),next.snapshot());
 assert.equal(app.querySelector('.inventory-screen'),current);assert.equal(current.firstChild,heading);
 assert.equal(current.querySelector('#inventory-search'),form);assert.equal(current.querySelector('.inventory-list'),list);
 assert.deepEqual(list.children,[oldCards[2],oldCards[0]]);assert.equal(oldCards[1].parentNode,null);
 assert.equal(app.firstChild,outside[0]);assert.equal(app.children.at(-1),outside[1]);
});

test('changed full card markup replaces the card instead of preserving stale text or controls',()=>{
 const current=scene(),next=scene({changed:{i2:'更新的装备名'}}),app=appFor(current,next),old=current.querySelector('.inventory-list').children[1];
 assert.equal(updateInventoryDOM(app,'complete-view'),true);assert.deepEqual(current.snapshot(),next.snapshot());
 assert.equal(old.parentNode,null);assert.notEqual(current.querySelector('.inventory-list').children[1],old);
});

test('dirty live input and select values are corrected even when their markup already matches',()=>{
 const current=scene(),next=scene(),app=appFor(current,next),input=current.querySelector('#inventory-query'),select=current.querySelector('#inventory-sort');
 input.value='未提交草稿';select.value='rarity';
 assert.equal(updateInventoryDOM(app,'complete-view'),true);assert.deepEqual(current.snapshot(),next.snapshot());
 assert.equal(current.querySelector('#inventory-query'),input);assert.equal(input.value,'');
 assert.equal(current.querySelector('#inventory-sort'),select);assert.equal(select.value,'power');
});

test('empty results remove all old card actions and later results replace the empty state completely',()=>{
 const current=scene(),empty=scene({ids:[],empty:true}),app=appFor(current,empty),oldCards=[...current.querySelector('.inventory-list').children];
 assert.equal(updateInventoryDOM(app,'complete-view'),true);assert.deepEqual(current.snapshot(),empty.snapshot());
 assert(oldCards.every(node=>node.parentNode===null));assert.equal(current.querySelectorAll('[data-action="lock"][data-id]').length,0);
 const later=scene({ids:['i4']}),again=appFor(current,later);
 assert.equal(updateInventoryDOM(again,'complete-view'),true);assert.deepEqual(current.snapshot(),later.snapshot());
 assert.equal(current.querySelector('.room-empty'),null);
});

test('unexpected inventory structure returns to full rendering before changing current nodes',()=>{
 for(const mutate of [node=>node.attrs.class='another-screen',node=>node.append(new Node('p',{},'additional region')),node=>node.attrs['aria-label']='changed root']){
  const current=scene(),next=scene();mutate(next);const app=appFor(current,next),before=current.snapshot(),nodes=[...current.children];
  assert.equal(updateInventoryDOM(app,'complete-view'),false);assert.deepEqual(current.snapshot(),before);assert.deepEqual(current.children,nodes);
 }
 assert.equal(updateInventoryDOM({querySelector:()=>null},'complete-view'),false);
});
