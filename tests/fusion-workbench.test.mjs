import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as S from '../src/storage.js';
import {itemStats} from '../src/equipment.js';
import {fusionWorkbenchModel,normalizeFusionSelection,planFusionMaterials} from '../src/fusion-workbench.js';
import {gameView,num} from '../src/views.js';

// Integration probes use valid saved games and real engine/storage operations.
// They do not claim to exercise DOM scrolling, physical dragging or a screen reader.
const baseUi={screen:'game',view:'game',busy:false,rolling:false,forging:false,fusionSlot:'weapon'};
const snapshot=value=>JSON.stringify(value);
const memory=()=>{
 const data=new Map(),writes=[];
 return {data,writes,getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(key);data.set(key,value);}};
};
function room(seed=7919){
 let s=E.newGame(seed);s.floor=200;s.player.level=12;s.player.gold=1000000;s.player.hp=E.stats(s).maxHp;
 s=E.transition(s,{type:'fate'});s.route[0].type='fusion';s=E.transition(s,{type:'enter'});
 assert.equal(s.phase,'fusion');assert(S.validateSave(s));return s;
}
function add(s,slot='weapon',rarity=0,level=12){
 const item=E.makeItem(s,slot,rarity);item.level=level;item.levelXp=0;s.player.items.push(item);return item;
}
function tenWeapons(){
 const s=room(),target=s.player.items.find(i=>i.id===s.player.equipped.weapon);target.level=12;target.levelXp=0;target.enhance=5;
 for(let i=0;i<9;i++)add(s);
 assert.equal(s.player.items.filter(i=>i.slot==='weapon').length,10);assert(S.validateSave(s));return {s,target};
}
const actionFor=plan=>({type:'fuse',targets:plan.preview.targets.map(i=>i.id),materials:plan.ids,allowProtected:plan.preview.protectedItems.length>0});
const roundtrip=s=>{assert(S.validateSave(s));assert.deepEqual(S.decodeSave(S.encodeSave(s)),s);};
const cardIds=html=>[...html.matchAll(/data-fusion-item="([^"]+)"/g)].map(m=>m[1]);
const visibleText=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');

test('one-click ten-weapon plan consumes exactly nine, commits one die result and persists once',()=>{
 const {s,target}=tenWeapons(),before=snapshot(s),store=memory();S.saveGame(s,null,store);store.writes.length=0;
 const plan=planFusionMaterials(s,[target.id]);assert.equal(plan.ids.length,9);assert.equal(plan.eligibleCount,9);
 const ui={...baseUi,fusionTargets:[target.id],fusionMaterials:plan.ids,fusionPage:0};
 const model=fusionWorkbenchModel(s,ui);gameView(s,ui);
 assert.equal(snapshot(s),before,'planning and rendering must not change RNG, gold or inventory');
 assert.equal(store.writes.length,0,'preselection is not a saved game transaction');
 assert.deepEqual(new Set(model.materialIds),new Set(plan.ids));
 const expectedDice=structuredClone(s),face=E.drawDice(expectedDice,1).values[0],expected=plan.preview.outcomes[face-1];
 const after=E.transition(s,actionFor(plan));assert.notStrictEqual(after,s);
 assert.equal(after.rng,expectedDice.rng,'the entire committed fusion consumes one real die draw');
 assert.equal(after.lastForge.value,face);assert.equal(after.revision,s.revision+1);
 assert.equal(after.player.gold,s.player.gold-plan.preview.cost);assert.equal(snapshot(s),before,'transaction input remains intact');
 assert.deepEqual(after.player.items.filter(i=>i.slot==='weapon').map(i=>i.id),[target.id]);
 assert.deepEqual(after.player.items.filter(i=>i.slot!=='weapon'),s.player.items.filter(i=>i.slot!=='weapon'));
 const upgraded=after.player.items.find(i=>i.id===target.id);
 assert.equal(upgraded.enhance,5);assert.equal(upgraded.level,expected.upgrades[0].after.level);assert.equal(upgraded.levelXp,expected.upgrades[0].after.levelXp);
 assert.deepEqual(new Set(after.lastForge.consumed),new Set(plan.ids));roundtrip(after);
 S.saveGame(after,s,store);assert.deepEqual(store.writes,[S.SAVE_KEY,S.BACKUP_KEY]);assert.deepEqual(S.loadSave(store).state,after);
 assert.equal(store.getItem(S.SAVE_KEY),store.getItem(S.BACKUP_KEY));
 const committed=snapshot(after);assert.strictEqual(E.transition(after,actionFor(plan)),after);assert.equal(snapshot(after),committed,'repeated command cannot consume twice');
});

test('default bulk protection and explicit protected consumption retain all absolute exclusions',()=>{
 const s=room(),target=add(s),safe=add(s),higher=add(s,'weapon',1),legendary=add(s,'weapon',3),locked=add(s,'weapon',2),loot=add(s);
 locked.locked=true;s.loot={item:loot,gold:0,type:'combat',source:'Integration fixture: current reward'};roundtrip(s);
 const before=snapshot(s),plan=planFusionMaterials(s,[target.id]);
 assert.deepEqual(new Set(plan.ids),new Set([safe.id,higher.id,legendary.id]));
 assert.equal(plan.excluded.equipped,1);assert.equal(plan.excluded.loot,1);assert.equal(plan.excluded.locked,1);
 assert.deepEqual(new Set(plan.preview.protectedItems.map(i=>i.id)),new Set([higher.id,legendary.id]));
 assert.strictEqual(E.transition(s,{...actionFor(plan),allowProtected:false}),s,'even a sub-legendary higher tier still requires confirmation');
 const after=E.transition(s,actionFor(plan));roundtrip(after);
 for(const id of [s.player.equipped.weapon,loot.id,locked.id,target.id])assert(after.player.items.some(i=>i.id===id));
 assert.equal(snapshot(s),before);
 const manual=normalizeFusionSelection(s,{...baseUi,fusionTargets:[target.id],fusionMaterials:[locked.id]});
 assert.deepEqual(manual.materialIds,[locked.id]);
 assert.strictEqual(E.transition(s,{type:'fuse',targets:[target.id],materials:[locked.id]}),s);
 const explicitlyConfirmed=E.transition(s,{type:'fuse',targets:[target.id],materials:[locked.id],allowProtected:true});roundtrip(explicitlyConfirmed);
 assert(!explicitlyConfirmed.player.items.some(i=>i.id===locked.id));
 assert.equal(E.salvagePreview(s,[locked.id],true,true),null,'locked salvage is prohibited even though explicit protected fusion is allowed');
 for(const id of [s.player.equipped.weapon,loot.id])assert.strictEqual(E.transition(s,{type:'fuse',targets:[target.id],materials:[id],allowProtected:true}),s);
});

test('budget boundaries use executable engine quotes, including fractional target averages and zero budget',()=>{
 const s=room(),targets=[add(s,'relic',0,12),add(s,'relic',1,13),add(s,'relic',2,17)];
 for(let i=0;i<9;i++)add(s,'relic',i%8,11+i*3);
 const targetIds=targets.map(i=>i.id),all=planFusionMaterials(s,targetIds,undefined,{budget:false});assert.equal(all.ids.length,9);
 const quotes=Array.from({length:all.ids.length},(_,i)=>E.fusionPreview(s,targetIds,all.ids.slice(0,i+1),true));
 const budgets=[0,...new Set(quotes.flatMap(q=>[q.cost-1,q.cost,q.cost+1]))];
 for(const gold of budgets){
  s.player.gold=gold;const before=snapshot(s),plan=planFusionMaterials(s,targetIds),expectedCount=quotes.filter(q=>q.cost<=gold).length;
  assert.equal(plan.ids.length,expectedCount,`gold ${gold}: exact executable count`);
  assert.deepEqual(plan.ids,all.ids.slice(0,expectedCount),'the most XP-efficient affordable prefix is retained');
  assert.equal(snapshot(s),before);roundtrip(s);
  if(plan.ids.length){assert(E.canAct(s,actionFor(plan)));const after=E.transition(s,actionFor(plan));roundtrip(after);assert(after.player.gold>=0);}
  else assert.equal(plan.preview,null);
 }
 s.player.gold=0;const forced=planFusionMaterials(s,targetIds,undefined,{budget:false});assert.equal(forced.ids.length,9);
 assert.strictEqual(E.transition(s,actionFor(forced)),s,'showing an over-budget list cannot bypass the engine cost gate');
});

test('three relic targets share all six actual die outcomes without losing identities, enhancement or save validity',()=>{
 const s=room(),first=s.player.items.find(i=>i.id===s.player.equipped.relic),second=add(s,'relic',1,18),third=add(s,'relic',2,24);
 first.level=12;first.levelXp=0;second.enhance=4;third.enhance=9;
 s.player.equipped.relic2=second.id;s.player.equipped.relic3=third.id;
 for(let i=0;i<7;i++)add(s,'relic',i%4,12+i);
 const targets=[first,second,third],targetIds=targets.map(i=>i.id),plan=planFusionMaterials(s,targetIds);assert.equal(plan.ids.length,7);
 const observed=new Set();
 for(let seed=1;seed<=100&&observed.size<6;seed++){
  const current=structuredClone(s);current.rng=seed*7919;const probe=structuredClone(current),face=E.drawDice(probe,1).values[0];if(observed.has(face))continue;observed.add(face);
  const after=E.transition(current,actionFor(plan)),outcome=plan.preview.outcomes[face-1];roundtrip(after);
  assert.equal(after.lastForge.gain,outcome.total);assert.equal(after.lastForge.gains.reduce((sum,n)=>sum+n,0),outcome.total);assert.equal(after.rng,probe.rng);
  assert.deepEqual(after.player.equipped,current.player.equipped);assert.deepEqual(after.lastForge.targets,targetIds);
  for(let i=0;i<3;i++){
   const item=after.player.items.find(t=>t.id===targetIds[i]);assert.equal(item.enhance,targets[i].enhance);
   assert.equal(item.level,outcome.upgrades[i].after.level);assert.equal(item.levelXp,outcome.upgrades[i].after.levelXp);assert.deepEqual(itemStats(item),outcome.upgrades[i].after.stats);
  }
 }
 assert.deepEqual([...observed].sort(),[1,2,3,4,5,6]);
});

test('failed fusion storage and stale snapshots cannot overwrite the active saved inventory',()=>{
 const {s,target}=tenWeapons(),plan=planFusionMaterials(s,[target.id]),after=E.transition(s,actionFor(plan)),store=memory();
 S.saveGame(s,null,store);const originalDisk=new Map(store.data),original=snapshot(s),write=store.setItem;
 store.setItem=(key,value)=>{if(key===S.SAVE_KEY)throw Error('synthetic fusion primary quota');write(key,value);};
 assert.throws(()=>S.saveGame(after,s,store),/无法保存/);assert.deepEqual(store.data,originalDisk);assert.equal(snapshot(s),original);
 store.setItem=write;
 const concurrent=E.transition(s,{type:'lock',id:target.id});S.saveGame(concurrent,s,store);const concurrentDisk=new Map(store.data);store.writes.length=0;
 assert.throws(()=>S.saveGame(after,s,store),/另一窗口/);assert.deepEqual(store.data,concurrentDisk);assert.deepEqual(store.writes,[]);
 assert.deepEqual(S.loadSave(store).state,concurrent);assert.equal(snapshot(s),original);
});

test('a fusion mirror warning retains one durable result and reload cannot reroll it',()=>{
 const {s,target}=tenWeapons(),store=memory();S.saveGame(s,null,store);const oldMirror=store.getItem(S.BACKUP_KEY),plan=planFusionMaterials(s,[target.id]);
 const after=E.transition(s,actionFor(plan)),write=store.setItem;
 store.setItem=(key,value)=>{if(key===S.BACKUP_KEY)throw Error('synthetic fusion mirror quota');write(key,value);};
 const saved=S.saveGame(after,s,store);assert(saved.warning);assert.equal(store.getItem(S.BACKUP_KEY),oldMirror);
 const reloaded=S.loadSave(store).state;assert.deepEqual(reloaded,after);assert.strictEqual(E.transition(reloaded,actionFor(plan)),reloaded);roundtrip(reloaded);
});

test('ten thousand items render only the requested 24-card pool page; selection retains filters and page',()=>{
 const s=room();while(s.player.items.length<10000)add(s,'weapon',s.player.items.length%3,10+s.player.items.length%40);
 const target=s.player.items.find(i=>i.id===s.player.equipped.weapon),ui={...baseUi,fusionTargets:[target.id],fusionMaterials:[],fusionPage:5,fusionSearch:'',fusionRarity:'',fusionMinLevel:'',fusionMaxLevel:'',fusionSort:'newest'};
 const before=snapshot(s),beforeUi=snapshot(ui),model=fusionWorkbenchModel(s,ui),html=gameView(s,ui);
 assert.equal(cardIds(html).length,24);assert.deepEqual(cardIds(html),model.pageItems.map(i=>i.id));assert.equal(new Set(cardIds(html)).size,24);
 assert.equal(snapshot(s),before);assert.equal(snapshot(ui),beforeUi);
 const selected={...ui,fusionMaterials:model.pageItems.slice(0,3).map(i=>i.id)},next=fusionWorkbenchModel(s,selected),selectedHtml=gameView(s,selected);
 assert.equal(next.page,5);assert.deepEqual(cardIds(selectedHtml),cardIds(html));
 const filtered={...selected,fusionRarity:'low',fusionMinLevel:'20',fusionMaxLevel:'30',fusionPage:2},filteredModel=fusionWorkbenchModel(s,filtered),filteredHtml=gameView(s,filtered);
 assert.equal(filteredModel.page,2);assert.deepEqual(cardIds(filteredHtml),filteredModel.pageItems.map(i=>i.id));assert(filteredModel.pageItems.every(i=>i.rarity<=1&&i.level>=20&&i.level<=30));
 const last={...ui,fusionPage:1000000},lastModel=fusionWorkbenchModel(s,last);
 assert.equal(lastModel.page,lastModel.pages-1);assert(cardIds(gameView(s,last)).length<=24);assert.equal(snapshot(s),before);
});

test('committed fusion presents actual level and main-attribute increments with six preview faces',()=>{
 for(const slot of ['weapon','armor','relic']){
  const s=room(),target=s.player.items.find(i=>i.id===s.player.equipped[slot]);target.level=12;target.levelXp=0;
  for(let i=0;i<9;i++)add(s,slot,0,12);
  const plan=planFusionMaterials(s,[target.id]),selected={...baseUi,fusionSlot:slot,fusionTargets:[target.id],fusionMaterials:plan.ids};
  const previewHtml=gameView(s,selected);assert.equal((previewHtml.match(/data-fusion-face=/g)||[]).length,6);
  const after=E.transition(s,actionFor(plan)),html=gameView(after,{...selected,fusionMaterials:[]}),result=html.slice(html.indexOf('data-fusion-result'));
  assert(html.includes('data-fusion-result'));assert(!html.includes('undefined'));assert(!html.includes('NaN'));
  const upgrade=after.lastForge.upgrades[0],text=visibleText(result),key=slot==='armor'?'hp':'attack',delta=upgrade.after.stats[key]-upgrade.before.stats[key];
  assert(text.includes('Lv.'+num(upgrade.before.level)));assert(text.includes('Lv.'+num(upgrade.after.level)));assert(text.includes('+'+num(delta)),`${slot}: actual main-attribute increment must be readable`);
  assert(delta>0);roundtrip(after);
 }
});
