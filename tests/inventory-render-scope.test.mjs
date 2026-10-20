import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {recoveryFixture} from '../scripts/storage-recovery-harness.mjs';

async function fixture(){
 const f=await recoveryFixture(fileURLToPath(new URL('../',import.meta.url))),counts={full:0,local:0},html=[];
 let markup=f.app.innerHTML,inventoryPresent=true;
 Object.defineProperty(f.app,'innerHTML',{get:()=>markup,set:value=>{counts.full++;markup=value;}});
 // This scope fixture counts the real app's choice of rendering path. Complete
 // DOM reconciliation and selection behavior have separate tree/native tests.
 const root={childNodes:[],classList:{contains:name=>name==='inventory-screen'},cloneNode(){return this;},isEqualNode:()=>true,querySelectorAll:()=>[]};
 f.app.querySelector=selector=>selector==='.inventory-screen'&&inventoryPresent?root:null;
 const previousCreate=f.app.ownerDocument.createElement;
 f.app.ownerDocument.createElement=tag=>tag==='template'?{content:null,set innerHTML(value){counts.local++;html.push(value);this.content={firstElementChild:root,childElementCount:1};}}:previousCreate(tag);
 await f.click('inventory');assert.equal(counts.full,1);assert.equal(counts.local,0);
 return {...f,counts,html,removeInventory(){inventoryPresent=false;}};
}

test('only inventory view choices use local rendering and they keep save bytes and RNG unchanged',async()=>{
 const f=await fixture(),before=f.S.encodeSave(f.probe.state),rng=f.probe.state.rng;
 await f.click('filter',{slot:'armor'});
 for(const [id,value]of [['inventory-rarity','1'],['inventory-sort','level'],['inventory-defense','regen']])
  await f.listeners.document.get('change')({target:{id,value}});
 await f.click('inventory-page',{page:'1'});
 await f.listeners.document.get('submit')({target:{id:'inventory-search',querySelector:()=>({value:'  余火  '})},preventDefault(){}});
 await f.click('inventory-query-clear');await f.click('inventory-reset');
 assert.equal(f.counts.local,8);assert.equal(f.counts.full,1);
 assert(f.html.every(value=>value.startsWith('<section class="collection-screen inventory-screen')));
 assert(f.html.every(value=>!value.includes('class="game-shell')));
 assert.equal(f.S.encodeSave(f.probe.state),before);assert.equal(f.probe.state.rng,rng);assert.deepEqual(f.writes,[]);
 await f.click('lock',{id:f.probe.state.player.items[0].id});
 assert.equal(f.counts.local,8);assert.equal(f.counts.full,2,'a successful save still fully renders');
 assert.equal(f.writes.length,2);assert.equal(f.map.get(f.S.SAVE_KEY),f.map.get(f.S.BACKUP_KEY));
 assert.equal(f.probe.state.revision,f.initial.revision+1);
 await f.click('game');assert.equal(f.counts.full,3);assert.equal(f.counts.local,8);
});

test('local update falls back for modal, busy, missing or changed-run pages',async()=>{
 for(const mode of ['dialog','busy','missing','run']){
  const f=await fixture();
  if(mode==='dialog')f.probe.dialog.showModal();
  if(mode==='busy')f.probe.present();
  if(mode==='missing')f.removeInventory();
  if(mode==='run')f.probe.state.runId='a-different-run';
  await f.listeners.document.get('change')({target:{id:'inventory-sort',value:'rarity'}});
  assert.equal(f.counts.local,0,mode);assert.equal(f.counts.full,2,mode);assert.deepEqual(f.writes,[],mode);
 }
});
