import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// QA_VIEWS_ROOT can point these regressions at a comparison source tree.
// Workbench expectations intentionally differ from the superseded dual lists;
// normal npm test always imports this project's files.
const root=process.env.QA_VIEWS_ROOT?pathToFileURL(process.env.QA_VIEWS_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const E=await import(new URL('src/engine.js',root));
const V=await import(new URL('src/views.js',root));
const {validateSave}=await import(new URL('src/storage.js',root));
const {eventChoices}=await import(new URL('src/encounters.js',root));
const {ROOM_NAMES}=await import(new URL('src/content.js',root));
const ui={view:'game',rolling:false,forging:false,busy:false};
const controls=(html,action)=>(html.match(/<button\b[^>]*>/g)||[]).filter(button=>button.includes(`data-action="${action}"`));
const block=(html,action,id)=>(html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[]).find(button=>button.includes(`data-action="${action}"`)&&button.includes(`data-id="${id}"`));
const add=(s,slot,rarity=0)=>{const item=E.makeItem(s,slot,rarity);s.player.items.push(item);return item;};
function room(type,seed=71,floor=30){let s=E.newGame(seed);s.floor=floor;s.player.level=30;s.player.gold=E.GOLD_CAP;s=E.transition(s,{type:'fate'});s.route[0].type=type;return E.transition(s,{type:'enter'});}

test('10,000-item fusion renders one page of 24 cards and preserves all selections beyond the page',()=>{
 const s=room('fusion'),target=s.player.items.find(item=>item.id===s.player.equipped.weapon),base=E.makeItem(s,'weapon',0);
 while(s.player.items.length<10000)s.player.items.push({...base,id:`i${s.nextId++}`});
 const ids=s.player.items.filter(item=>item.slot==='weapon'&&item.id!==target.id).map(item=>item.id);
 const selected={...ui,fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:ids};
 assert(validateSave(s));const before=JSON.stringify(s),preview=E.fusionPreview(s,[target.id],ids,true);assert(preview);
 const first=V.center(s,selected);
 assert.equal(controls(first,'fusion-item').length,24);
 assert.equal((first.match(/data-fusion-item="/g)||[]).length,24,'off-page items must not be hidden DOM cards');
 assert(first.includes('data-page="0" data-pages="417" data-total="9998"'));
 assert(first.includes('已选 <b>9,997</b> 件'));assert(first.includes(V.num(preview.outcomes[5].total)));
 const second=V.center(s,{...selected,fusionPage:1});
 for(const button of controls(second,'fusion-item'))assert(button.includes('aria-pressed="true"'));
 assert.equal(controls(second,'fusion-item').length,24);assert(second.includes('data-page="1" data-pages="417"'));
 assert(second.includes('已选 <b>9,997</b> 件'),'selection count covers the entire inventory');
 const final=V.center(s,{...selected,fusionPage:10000});
 assert.equal(controls(final,'fusion-item').length,14);
 assert(final.includes('data-page="416" data-pages="417"'));assert(final.includes('9,985–9,998 / 9,998 件'));
 assert(block(final,'fusion-item',target.id).includes('is-target'),'the retained target remains recognizable in the shared pool');
 for(const button of controls(final,'fusion-item'))assert(button.includes('aria-pressed="true"'));
 assert(controls(final,'fusion-page').filter(button=>button.includes('data-page="417"')).every(button=>button.includes('disabled')));
 assert.equal(JSON.stringify(s),before,'pagination and preview cannot mutate inventory, gold or game RNG');
});

test('fusion shows each protection explicitly while manual selection stays available for review',()=>{
 const s=room('fusion'),target=add(s,'weapon',1),protectedItem=add(s,'weapon',3),pending=add(s,'weapon',0);
 const higher=add(s,'weapon',2),legendary=add(s,'weapon',3);
 target.locked=true;protectedItem.locked=true;s.loot={item:pending,gold:0};
 const selected={...ui,fusionSlot:'weapon',fusionTargets:[target.id],fusionMaterials:[protectedItem.id,higher.id,legendary.id]},before=JSON.stringify(s),html=V.center(s,selected);
 const targetButton=block(html,'fusion-item',target.id),materialButton=block(html,'fusion-item',protectedItem.id);
 assert(targetButton.includes('is-locked'));assert(targetButton.includes('is-target'));
 assert(materialButton.includes('已锁定'));assert(materialButton.includes('has-protection'));
 assert(materialButton.includes('aria-pressed="true"'));assert(!materialButton.slice(0,materialButton.indexOf('>')).includes('disabled'));
 for(const item of [higher,legendary]){const card=block(html,'fusion-item',item.id);assert(card.includes('受保护'));assert(card.includes('aria-pressed="true"'));assert(!controls(card,'fusion-item')[0].includes('disabled'));}
 const tooltip=V.fusionItemTooltip(s,selected,protectedItem);
 assert(tooltip.includes('已锁定'));assert(tooltip.includes('传说'));assert(tooltip.includes('一键操作会跳过'));assert(tooltip.includes('手动选择后需确认'));
 for(const id of [pending.id,s.player.equipped.weapon]){const card=block(html,'fusion-item',id);assert(card.includes('is-unavailable'));assert(card.includes('aria-pressed="false"'));assert(V.fusionItemTooltip(s,selected,s.player.items.find(item=>item.id===id)).includes('不能消耗'));}
 assert(html.includes('含 3 件受保护材料，需确认'));assert(html.includes('确认保护材料 · 融合'));
 const preview=E.fusionPreview(s,selected.fusionTargets,selected.fusionMaterials,true);assert.equal(preview.protectedItems.length,3);
 assert.equal(controls(html,'fusion-preview').length,1);assert.equal(JSON.stringify(s),before);
});

test('three retained relics show all six exact outcomes, kept enhancement and one truthful total cost',()=>{
 const s=room('fusion'),targets=[add(s,'relic',0),add(s,'relic',1),add(s,'relic',2)],material=add(s,'relic',0);
 targets[0].enhance=19;targets[1].enhance=7;targets[2].locked=true;
 const selected={...ui,fusionSlot:'relic',fusionTargets:targets.map(item=>item.id),fusionMaterials:[material.id]},preview=E.fusionPreview(s,selected.fusionTargets,selected.fusionMaterials,true),html=V.center(s,selected);
 for(const text of ['保留目标','熔炼结算','六面结果','3 / 3','+19 保留','+7 保留'])assert(html.includes(text),text);
 assert(html.includes(`<dd class="fusion-gold">${V.num(preview.cost)}</dd>`),'one engine quote is the total batch charge');
 assert(html.includes(`<dt>熔炼后余额</dt><dd class="">${V.num(s.player.gold-preview.cost)}</dd>`));
 assert(html.includes(`<strong>${V.num(preview.cost)} 金币`),'fixed primary action repeats the same total cost');
 const faces=html.split(/data-fusion-face="[1-6]"/).slice(1);assert.equal(faces.length,6);
 for(const outcome of preview.outcomes){
  const face=faces[outcome.value-1];assert(face.includes(`${outcome.value} 点`));assert(face.includes(`+${V.num(outcome.total)} XP`));
  const levels=[...face.matchAll(/class="fusion-face-level"[^>]*><small>[\s\S]*?<\/small><strong>([^<]+)<\/strong>/g)].map(match=>match[1]);
  assert.deepEqual(levels,outcome.upgrades.map(upgrade=>V.num(upgrade.after.level)),`${outcome.value}: all three exact result levels in target order`);
 }
 assert.equal((html.match(/data-fusion-drop="/g)||[]).length,3);assert.equal(controls(html,'fusion-pick-target').length,3);assert(!html.includes('undefined'));assert(!html.includes('NaN'));
});

test('fusion empty and unavailable states explain the next step, with every write control disabled in flight',()=>{
 const s=room('fusion'),target=s.player.items.find(item=>item.id===s.player.equipped.weapon),material=add(s,'weapon',0);
 const empty=V.center(s,ui);assert(empty.includes('点击物品，或拖到这里'));assert(empty.includes('选择保留目标'));assert(!controls(empty,'fusion-preview')[0].includes('disabled'));
 const noMaterials=V.center(s,{...ui,fusionTargets:[target.id]});assert(noMaterials.includes('选择熔炼材料'));assert(noMaterials.includes('等待材料'));assert.equal((noMaterials.match(/data-fusion-face="/g)||[]).length,6);
 const selected={...ui,fusionTargets:[target.id],fusionMaterials:[material.id]};s.player.gold=0;
 const poor=V.center(s,selected);assert(poor.includes('还差 '));assert(poor.includes('按预算调整材料'));assert(!controls(poor,'fusion-preview')[0].includes('disabled'),'insufficient gold provides an enabled budget-repair action');
 const busy=V.center(s,{...selected,busy:true,forging:true,fusionNotice:{budgetLimited:true},fusionAllCandidates:[material.id],fusionUndo:{expires:Date.now()+5000}});
 for(const action of ['fusion-slot','fusion-pick-target','fusion-target-remove','fusion-item','fusion-page','fusion-all','fusion-page-all','fusion-filtered-all','fusion-force-all','fusion-undo','fusion-clear-materials','fusion-preview']){
  const found=controls(busy,action);assert(found.length,`${action} is actually rendered by this busy fixture`);for(const button of found)assert(button.includes('disabled'),action);
 }
 for(const tag of busy.match(/<(?:input|select)\b[^>]*>/g)||[])assert(tag.includes('disabled'),'search, filters and page input cannot change during a transaction');
 assert(!controls(busy,'skip')[0].includes('disabled'),'skipping presentation remains available without another transaction');
});

test('rolling dice contain no committed face information and settled dice retain every exact result',()=>{
 for(let count=1;count<=6;count++){
  const reference=V.dice(Array(count).fill(1),{rolling:true,match:count,critical:true,follow:true});
  for(let face=1;face<=6;face++)assert.equal(V.dice(Array(count).fill(face),{rolling:true,match:count,critical:true,follow:true}),reference);
  assert(reference.includes(`data-count="${count}"`));assert(!reference.includes('点骰子'));
 }
 for(let face=1;face<=6;face++){const settled=V.dice([face]);assert(settled.includes(`aria-label="${face} 点骰子" data-value="${face}"`));assert(settled.includes(`class="cube-face face-0" data-face="${face}"`));}
});

test('the decorative battle altar does not alter dice count, indexed geometry or unrevealed results',()=>{
 for(let count=1;count<=6;count++)for(const boss of [false,true]){
  const values=Array.from({length:count},(_,i)=>i+1),before=[...values],plain=V.dice(values),decorated=V.dice(values,{altar:true,boss});
  const altar=decorated.match(/<svg class="battle-altar [\s\S]*?<\/svg>/)?.[0];assert(altar);assert(altar.includes('aria-hidden="true"'));
  assert(!altar.includes('data-count'));assert(!altar.includes('data-value'));assert(!altar.includes('cube-die'));
  assert.equal(decorated.replace(altar,''),plain);assert(decorated.includes(`data-count="${count}"`));
  assert.equal((decorated.match(/class="die cube-die /g)||[]).length,count);assert.deepEqual(values,before);
  assert.equal(V.dice(Array(count).fill(1),{altar:true,boss,rolling:true}),V.dice(Array(count).fill(6),{altar:true,boss,rolling:true}));
 }
});

test('waiting fate always has two dice and other idle room dice ignore stale combat rollValues',()=>{
 const fresh=E.newGame(211),stale={...ui,rollValues:[1,2,3,4,5,6]},html=V.center(fresh,stale);
 assert(html.includes('data-count="2"'));assert(!html.includes('data-count="6"'));assert.equal(V.center(fresh,ui),html);
 for(const type of ['forge','altar','fusion']){const s=room(type),before=JSON.stringify(s);assert.equal(V.center(s,stale),V.center(s,ui),type);assert.equal(JSON.stringify(s),before);}
 const gambit=room('gambit');gambit.event.status='resolved';gambit.event.roll=3;gambit.event.outcome='合成已结算事件';assert.equal(V.center(gambit,stale),V.center(gambit,ui));
});

test('forge and fusion result banners stay withheld during the next committed roll',()=>{
 const forge=room('forge');forge.lastForge={name:'上一轮已保存的锻造标记',value:6,gain:3};
 assert(V.center(forge,ui).includes('上一轮已保存的锻造标记'));assert(!V.center(forge,{...ui,forging:true}).includes('上一轮已保存的锻造标记'));
 const fusion=room('fusion'),target=fusion.player.items.find(item=>item.id===fusion.player.equipped.weapon),material=add(fusion,'weapon',0);
 const result=E.transition(fusion,{type:'fuse',targets:[target.id],materials:[material.id]});assert(result.lastForge?.fusion);
 assert(V.center(result,ui).includes('data-fusion-result'));assert(!V.center(result,{...ui,forging:true}).includes('data-fusion-result'));
});

test('deep-floor nominal double-fate award equals actual credit below the cap',()=>{
 for(const floor of [1,10,20,30,80,140,1000]){
  let before,after;
  for(let seed=1;seed<=100;seed++){before=E.newGame(seed);before.floor=floor;after=E.transition(before,{type:'fate'});if(after.fate[0]===after.fate[1])break;}
  assert.equal(after.fate[0],after.fate[1]);const credited=after.player.gold-before.player.gold;
  assert(V.center(after,ui).includes(`标称奖励 ${credited} 金币`),`floor ${floor}: actual ${credited}`);
 }
});

test('rest preview agrees with actual recovery and labels preservation of an existing stronger shield',()=>{
 for(const fraction of [0,.1,.75,2]){const s=room('rest');s.player.hp=1;s.ward=Math.round(E.stats(s).maxHp*fraction);const html=V.center(s,ui),after=E.transition(s,{type:'rest'});assert(html.includes(`<dd>${V.num(after.ward)} <small>`));assert(html.includes('休整保留更强的现有护盾'));if(fraction>.25)assert(html.includes('保留更强护盾'));}
});

test('event labels call an option free only when its actual stated cost is none',()=>{
 let paid=0,free=0;
 for(const type of Object.keys(ROOM_NAMES)){
  const s=room(type);if(s.phase!=='event')continue;
  const html=V.center(s,ui);
  for(const option of eventChoices(s).filter(option=>option.id!=='leave')){
   const choice=block(html,'event-choice',option.id);assert(choice);
   if(option.cost==='无'){free++;assert(choice.includes('无需代价'));}else{paid++;assert(!choice.includes('无需代价'));assert(choice.includes('提交前再次确认'));}
  }
 }
 assert(paid>10);assert(free>=2);
});
