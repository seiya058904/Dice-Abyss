import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,transition,makeItem,ENHANCE_CAP,fusionPreview} from '../src/engine.js';
import {DEEP_TALENTS} from '../src/deep-content.js';
import {TALENTS,ROOM_NAMES} from '../src/content.js';
import {center,gameView,dice,primaryAction,itemEffects,itemSummary,settingsView,migrationSummary,comparisonValue} from '../src/views.js';

const ui={view:'game',rolling:false,forging:false,busy:false};
function room(type){let s=newGame(715);s.floor=20;s=transition(s,{type:'fate'});s.route[0].type=type;return transition(s,{type:'enter'});}

test('every generated room renders and an empty relic comparison does not dereference a missing item',()=>{
 for(const type of Object.keys(ROOM_NAMES)){
  let s=room(type);assert(center(s,ui).length>100,type);
 }
 const s=room('chest'),item=makeItem(s,'relic',2);s.player.items.push(item);s.loot={item,gold:1};s.phase='loot';
 const html=gameView(s,ui);
 assert(html.includes('空装备位'));assert(html.includes(item.name));assert(!html.includes('undefined'));
});

test('a roll in motion never reveals the previous resonance, critical or follow-up result',()=>{
 const s=room('combat');s.lastRoll={values:[6,6,6],best:3,critical:true,follow:true,total:123456,main:100000,extra:23456};
 const html=center(s,{...ui,rolling:true,rollValues:[1,2,3]});
 assert(!html.includes('trigger-line'));assert(!html.includes('123,456'));assert(!html.includes('critical-die'));assert(!html.includes('cube-energy'));
 const direct=dice([6,6,6],{rolling:true,match:3,critical:true,follow:true});
 assert(!direct.includes('resonant'));assert(!direct.includes('critical-die'));assert(!direct.includes('cube-energy'));
});

test('forge displays all actual capped outcomes instead of promising impossible enhancement',()=>{
 const s=room('forge'),target=s.player.items.find(i=>i.id===s.player.equipped.weapon);target.enhance=ENHANCE_CAP-1;
 const html=center(s,ui);assert.equal((html.match(/<b>\+1<\/b>/g)||[]).length,6);assert(!html.includes('<b>+2</b>'));assert(!html.includes('<b>+3</b>'));
 target.enhance=ENHANCE_CAP;assert(center(s,ui).includes('已达强化上限'));
});

test('ten thousand owned items render at most sixty cards, and stale pages clamp to the last actual page',()=>{
 const s=newGame(86);while(s.player.items.length<10000)s.player.items.push(makeItem(s,'weapon',0));
 const first=center(s,{...ui,view:'inventory'});assert.equal((first.match(/<article class="item-card/g)||[]).length,60);assert(first.includes('1–60 / 10000 件'));
 const last=center(s,{...ui,view:'inventory',inventoryPage:10000});assert.equal((last.match(/<article class="item-card/g)||[]).length,40);assert(last.includes('第 167 / 167 页'));
 s.phase='chest';assert.equal(primaryAction(s,ui).type,'inventory');
});

test('talent totals multiply additive multipliers as well as percentage bonuses',()=>{
 const s=newGame(12);s.player.talents.resonance=3;s.player.talents.crush=3;
 assert(center(s,{...ui,view:'talents',talentGroup:'resonance'}).includes('共鸣倍率 +0.36'));
 assert(center(s,{...ui,view:'talents',talentGroup:'critical'}).includes('暴击倍率 +0.30'));
});

test('manual recycling is available for a spare legendary but not equipped, locked or current loot',()=>{
 const s=newGame(19),spare=makeItem(s,'weapon',3),locked=makeItem(s,'armor',2),loot=makeItem(s,'relic',3);
 locked.locked=true;s.player.items.push(spare,locked,loot);s.loot={item:loot,gold:1};
 const html=center(s,{...ui,view:'inventory'});
 assert(html.includes(`data-action="salvage-item" data-id="${spare.id}"`));
 for(const id of [...Object.values(s.player.equipped),locked.id,loot.id].filter(Boolean))assert(!html.includes(`data-action="salvage-item" data-id="${id}"`));
});

test('the destiny map preserves all 30 legacy nodes and exposes selected deep nodes with real floor gates',()=>{
 let s=newGame(114);s.player.talentPoints=1;
 const snapshot=JSON.stringify(s),html=center(s,{...ui,view:'talents',talentGroup:'high'});
 const controls=html.match(/<button[^>]+data-action="talent"[^>]+>/g)||[];
 const ids=controls.map(button=>button.match(/data-id="([^"]+)"/)[1]);
 assert.equal(controls.length,33);assert.deepEqual(new Set(ids),new Set(Object.keys(TALENTS).filter(k=>!DEEP_TALENTS[k]||TALENTS[k].group==='high')));
 assert(controls.filter(button=>DEEP_TALENTS[button.match(/data-id="([^"]+)"/)[1]]).every(button=>button.includes('disabled')));assert.equal(controls.filter(button=>!button.includes('disabled')).length,30);assert.equal(JSON.stringify(s),snapshot,'rendering cannot invest points or consume RNG');
 s=transition(s,{type:'talent',id:'pursuit'});
 const after=center(s,{...ui,view:'talents',talentGroup:'high'}),pursuit=(after.match(/<button[^>]+data-action="talent"[^>]+>/g)||[]).find(button=>button.includes('data-id="pursuit"'));
 assert(pursuit.includes('destiny-node lit'));assert(pursuit.includes('disabled'));assert(after.includes('1 / 45 节点已点亮'));
 const full=gameView(s,{...ui,view:'talents',talentGroup:'critical'});assert(!full.includes('undefined'));assert(full.includes('追击追加主击'));assert(full.includes('+43%'));
});

test('fusion shows all six concrete XP outcomes and preserved enhancement for three relics',()=>{
 const s=room('fusion'),targets=Array.from({length:3},()=>makeItem(s,'relic',0)),material=makeItem(s,'relic',0);
 targets[0].enhance=9;s.player.items.push(...targets,material);s.player.gold=1000000;
 const selected={...ui,fusionSlot:'relic',fusionTargets:targets.map(t=>t.id),fusionMaterials:[material.id]},preview=fusionPreview(s,selected.fusionTargets,selected.fusionMaterials,true);
 assert(preview);assert(preview.outcomes[0].total<preview.outcomes[4].total);assert(preview.outcomes[4].total<preview.outcomes[5].total);
 const snapshot=JSON.stringify(s),html=center(s,selected);
 for(const outcome of preview.outcomes){assert(html.includes(outcome.value+' 点'));assert(html.includes(outcome.total.toLocaleString('en-US')));for(const u of outcome.upgrades)assert(html.includes('Lv.'+u.after.level));}
 assert(html.includes('+9 保留'));assert(html.includes('等级进度'));assert(!html.includes('成长%'));assert(!html.includes('undefined'));assert(!html.includes('NaN'));assert.equal(JSON.stringify(s),snapshot);
});

test('event terms are real, refusal is always available and resolved outcomes render without choices',()=>{
 const s=room('mystery');assert.equal(s.phase,'event');const before=JSON.stringify(s),html=gameView(s,ui);
 assert(html.includes('event-screen'));assert(/data-action="event-choice"[^>]*data-id="leave"/.test(html));assert(html.includes('event-cost'));assert(html.includes('event-reward'));assert.equal(JSON.stringify(s),before);
 const resolved=transition(s,{type:'event-choice',id:'leave'}),after=center(resolved,ui);assert(after.includes('抉择已落定'));assert(!after.includes('class="event-option '));assert.equal(primaryAction(resolved,ui).type,'next');
});

test('equipment identity exposes level, enhancement and source without legacy growth',()=>{
 const s=newGame(22),item=makeItem(s,'relic',3);item.enhance=7;item.legacy=true;s.player.items.push(item);
 const html=center(s,{...ui,view:'inventory'});assert(itemSummary(item).includes('Lv.'));assert(itemSummary(item).includes('+7'));assert(html.includes('于第'));assert(html.includes('旧版效果保留'));assert(!html.includes('成长 +'));assert(!itemEffects(item).includes('undefined'));
 s.migration={fromVersion:3,toVersion:4,equipment:8,inventory:8,maxRelativeDelta:.0001};assert(migrationSummary(s).includes('0.010%'));assert(settingsView({sound:true,effects:'full',scale:1},true,true).includes('export-legacy'));
});

test('actual lucky roll feedback remains hidden while the next roll is moving',()=>{
 const s=room('combat');s.lastRoll={values:[6,6,5],best:2,critical:false,follow:false,total:18,main:18,extra:0,luck:32,luckActive:true,echoes:1,highCount:3,mechanics:['真实触发护盾 +4'],retaliation:0};
 const html=center(s,ui);assert(html.includes('幸运 32'));assert(html.includes('同点引导 1 颗'));assert(html.includes('真实触发护盾 +4'));assert(!center(s,{...ui,rolling:true,rollValues:[1,2,3]}).includes('真实触发护盾 +4'));
});

test('equipment comparisons preserve percentage units and additive critical bonuses',()=>{
 assert.equal(comparisonValue('pierce',.25),'25%');assert.equal(comparisonValue('reduction',.125),'12.5%');assert.equal(comparisonValue('critDamage',.4),'+0.40');
});

test('armor labels its main health bonus explicitly',()=>{
 const s=newGame(37),armor=s.player.items.find(i=>i.slot==='armor');assert.match(itemEffects(armor),/生命 \+\d/);assert(!itemEffects(armor).startsWith('+'));
});

test('unreadable saves retain an explicit raw export entry in settings',()=>{
 const html=settingsView({sound:false,effects:'full',scale:1},true,false,true);
 assert(html.includes('导出不可读取的原始存档'));assert(html.includes('不会改写浏览器记录'));
 assert(!/data-action="export"[^>]*disabled/.test(html));
});

test('loot comparison includes all five real build branches and current invested point totals',()=>{
 let s=room('chest');s=transition(s,{type:'open'});s.player.talents.luck=3;s.player.talents.attune=2;s.player.talents.power=7;const html=gameView(s,ui),summary=html.split('<div class="build-summary">')[1].split('<div class="section-label">成长回响')[0];assert.equal((summary.match(/class="branch-/g)||[]).length,5);assert(summary.includes('幸运命运'));assert(summary.includes('5 点'));assert(summary.includes('7 点'));
});

test('gambit animation uses its committed face and withholds the outcome until settled',()=>{
 for(const face of [1,3,6]){const s=room('gambit');s.event.status='resolved';s.event.choice='roll';s.event.roll=face;s.event.outcome='已保存的赌局结果'+face;const snapshot=JSON.stringify(s),moving=center(s,{...ui,rolling:true,rollValues:[face]});assert(moving.includes('命运正在落定'));assert(/class="dice-row cube-row[^"]*rolling/.test(moving));assert(!moving.includes(s.event.outcome));assert.equal(JSON.stringify(s),snapshot);const settled=center(s,ui);assert(settled.includes(s.event.outcome));assert(!/class="dice-row cube-row[^"]*rolling/.test(settled));}
});
