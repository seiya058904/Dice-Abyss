import { fusionView as fusionWorkbenchView, fusionItemTooltip as fusionTooltip } from './fusion-view.js';
import {ABILITY_DEFS,DEEP_TALENTS,DEEP_ROOMS,eraFor,deepTalentText} from './deep-content.js';
import {RARITY_FLOORS,highestRarity} from './rarity.js';
import {ROOM_WEIGHTS,POOL_WEIGHTS} from './route-weights.js';
import { RARITIES, SLOTS, ROOM_NAMES, ROOM_DETAILS, FLOOR_NAMES, TALENTS, DICE_LEVELS, EQUIP_SLOTS, TALENT_GROUPS } from './content.js';
import { levelXpNeeded } from './equipment.js';
import { SLOT_DESCRIPTIONS } from './equipment-content.js';
import { eventPresentation, encounterNarrative } from './encounters.js';
import { encounterTactics } from './encounter-tactics.js';
import { GOLD_CAP, goldPreview, goldReceipt } from './gold.js';
import { equipmentComparisonDetails, equipmentComparisonHint } from './equipment-comparison.js';
import { defeatReview } from './defeat-review.js';
import { RELEASE_VERSION, RELEASE_STAMP } from './release.js';
import { inventoryQuery, inventoryDefense, INVENTORY_DEFENSE_FILTERS, selectInventoryItems } from './inventory-query.js';
import { boonReadout } from './boon-readout.js';
import { eventChoicePreview } from './event-preview.js';
import { eventRiskPreview } from './event-risk.js';
import { eventReferenceRoles } from './event-references.js';
import { stats, diceCount, itemValue, itemStats, compareEquipment, compareEquipmentBatch, xpNeeded, XP_CAP, LEVEL_CAP, forgePreview, fusionPreview, canAct, ENHANCE_CAP, equippedIds, equipSlot, talent, talentPreview, memorywellPreview, depthPower, enemyIntent, diceOdds, dropOdds } from './engine.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A formatter holds only fixed locale/options, never a game value or snapshot.
const compactNumber = new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:2});
export const num = n => Math.abs(Number(n||0))>=1e9?compactNumber.format(Number(n||0)):Number(n||0).toLocaleString('en-US');
// Exact amounts matter at the cap: compact formatting would make a ten-coin
// gain appear as the same 100亿 balance before and after the transaction.
export const goldNum = n => Number(n).toLocaleString('en-US');
function goldLimitView(receipt, pending=false) {
 if(!receipt.overflow)return '';
 return `<div class="gold-limit-detail" data-gold-overflow="${receipt.overflow}"><p><span>原额 ${goldNum(receipt.rawGold)}</span><strong>${pending?'将超出上限':'上限截去'} ${goldNum(receipt.overflow)}</strong></p><small>持有上限 ${goldNum(GOLD_CAP)} 金币</small></div>`;
}
function goldIncomingView(s, amount) {
 const receipt=goldPreview(s.player.gold,amount);
 return `<div class="gold-incoming${receipt.overflow?' gold-limited':''}" data-gold-preview><p>${icon('gold')}<span>金币可收</span><strong>+${goldNum(receipt.credited)}</strong></p>${goldLimitView(receipt,true)}${receipt.overflow?'<small>装备照常领取，超出上限的金币不会保留。</small>':''}</div>`;
}
function goldRoomView(s) {
 const amount=Math.round(65+depthPower(s.floor)*22)+s.fate.reduce((a,b)=>a+b,0)*3;
 const receipt=goldPreview(s.player.gold,amount);
 return `<section class="room-screen gold-screen"><span class="room-symbol">${icon('gold')}</span><h1>遗落的黄金</h1><p>不是每一份馈赠，都需要一场战斗。</p><div class="gold-hoard">${icon('gold')}<strong>+${goldNum(receipt.credited)}</strong><span>可收金币</span></div>${goldLimitView(receipt,true)}<p class="gold-balance-preview">领取后余额 <strong>${goldNum(receipt.after)}</strong> 金币</p><p class="room-hint">${receipt.overflow?'超出上限的金币不会保留，领取后继续前行。':'收下它，让下一次锻造更有底气。'}</p></section>`;
}
function goldLootView(reward, creditedGold) {
 const receipt=goldReceipt(reward,creditedGold);
 return `<div class="gold-reward frame${receipt?.overflow?' gold-limited':''}" data-gold-receipt="${receipt?'recorded':'legacy'}">${icon('gold')}<span>${receipt?'金币实收':'本箱标称金币'}</span><strong>+ ${goldNum(receipt?receipt.credited:reward.gold)}</strong>${receipt?`${goldLimitView(receipt)}<p>用于锻造、交易与成长</p><small>本次开箱入账 · 记录已保存</small>`:'<p>此历史记录未记实收，无法核对当时到账。</p><small>当前余额见下方金币栏</small>'}</div>`;
}
export const floorName = s => FLOOR_NAMES[(s.floor - 1) % FLOOR_NAMES.length];
export function icon(name, cls = '') {
  const paths = {
    dice: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="3"/>',
    inventory: '<path d="m4 7 8-4 8 4v11l-8 4-8-4Z M4 7l8 4 8-4 M12 11v11"/>',
    talent: '<path d="M12 4v5M12 13l-6 6M12 13l6 6"/><circle cx="12" cy="3" r="2"/><circle cx="12" cy="11" r="2"/><circle cx="5" cy="20" r="2"/><circle cx="19" cy="20" r="2"/>',
    settings: '<path d="M4 7h16M4 17h16"/><rect x="8" y="4" width="4" height="6" fill="currentColor"/><rect x="14" y="14" width="4" height="6" fill="currentColor"/>',
    arrow: '<path d="M4 12h15M14 6l6 6-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    combat: '<path d="m5 3 14 17M19 3 5 20M3 16l5 4M16 20l5-4"/>',
    elite: '<path d="m12 3 8 9-8 9-8-9Z M12 7v10M8 12h8"/>',
    boss: '<path d="m3 6 4 5 5-7 5 7 4-5-2 13H5Z M6 22h12"/>',
    gold: '<circle cx="12" cy="12" r="8"/><path d="m12 7 4 5-4 5-4-5Z"/>',
    chest: '<path d="M4 10h16v10H4Z M4 10l2-6h12l2 6M4 13h16M10 11v5h4v-5"/>',
    merchant: '<path d="M3 9h18l-2-5H5Z M5 9v12h14V9M9 21v-7h6v7"/>',
    forge: '<path d="m14 3 7 7-4 4-3-3L5 20l-3-3 9-9-1-1Z"/>',
    heart: '<path d="M12 20 4 12C-1 5 8 0 12 7c4-7 13-2 8 5Z"/>',
    shield: '<path d="m12 3 8 3v6c0 4-5 8-8 10-3-2-8-6-8-10V6Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    fusion: '<path d="M3 5h4l5 7-5 7H3M21 5h-4l-5 7 5 7h4M9 12h6"/>',
    altar: '<path d="m12 3 7 9-7 9-7-9ZM3 21h18M9 12h6M12 8v8"/>',
    rest: '<path d="m12 3 5 8-5 10-5-10ZM3 21h18M2 8l3 3M22 8l-3 3"/>',
    trial: '<path d="m12 3 8 4v6l-8 8-8-8V7ZM8 9l8 8M16 9l-8 8"/>',
    blackmarket: '<path d="M3 10h18l-2-6H5ZM5 10v11h14V10M8 4V2M16 4V2M9 21v-6h6v6"/>',
    vault: '<path d="M4 4h16v16H4ZM8 8h8v8H8ZM12 8v8M8 12h8M20 7h2M20 17h2"/>',
    full: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dice}</svg>`;
}
export function dice(values, { large=false,rolling=false,match=0,locked=false,critical=false,follow=false,altar=false,boss=false }={}) {
 // In-flight geometry is presentation only. A saved result is rendered only
 // after settling; neither face order nor data-value may disclose it early.
 if(rolling)values=values.map((_,index)=>[2,5,3,6,1,4][index%6]);
 const nonResonant=values.map((value,i)=>match>=2&&values.filter(v=>v===value).length===match?-1:i).filter(i=>i>=0);
 const followIndex=follow?nonResonant.at(-1):-1, criticalIndex=critical?nonResonant.find(i=>i!==followIndex):-1;
 return `<div class="dice-row cube-row ${large?'large':''} ${rolling?'rolling':''}" data-count="${values.length}">${altar?battleAltar(boss):''}${values.map((value,i)=>{
 const resonance=match>=2&&values.filter(v=>v===value).length===match;
 const charged=i===followIndex, sharp=i===criticalIndex;
 const others=[1,2,3,4,5,6].filter(v=>v!==value&&v!==7-value);
 const faces=[value,others[0],7-value,7-others[0],others.find(v=>v!==others[0]&&v!==7-others[0]),0];faces[5]=7-faces[4];
 return `<div class="die cube-die ${!rolling?(resonance?'resonant':charged?'charged':sharp?'critical-die':''):''}" style="--i:${i}" aria-label="${rolling?'骰子投掷中':`${value} 点骰子`}" data-value="${value}"><div class="die-shadow"></div><div class="die-flight"><div class="die-cube">${faces.map((v,j)=>`<div class="cube-face face-${j}" data-face="${v}"><span>${v}</span><i class="face-corner"></i><div class="pips">${Array.from({length:v},()=>'<b></b>').join('')}</div></div>`).join('')}</div></div><small class="die-index">${locked?'待解锁':rolling?'翻滚中':String(i+1).padStart(2,'0')}</small></div>`;
 }).join('')}</div>`;
}
function button(label, action, cls = '', attrs = '') { return `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`; }
function badge(rarity) { return `<span class="rarity ${RARITIES[rarity].key}">${RARITIES[rarity].name}</span>`; }
export const itemSummary = item => `${RARITIES[item.rarity].name} ${item.name} · Lv.${num(item.level)} · +${item.enhance}`;
export const itemProgress = item => `${num(item.levelXp)} / ${num(levelXpNeeded(item.level))}`;
// Payment and upgrade roles come from the same event table as validation.
// Names are display data: blank or equal names never establish item identity.
function eventItemName(s, item) {
 return item.name?.trim() ? item.name : `未命名${['offering','relicloom'].includes(s.event?.key)?'旧物':'装备'}（${item.id}）`;
}
function eventItemSummary(s, item) { return itemSummary({...item,name:eventItemName(s,item)}); }
export function eventChoiceCost(s, choice) {
 const roles=eventReferenceRoles(s,choice.id);
 const offered=roles.usesOffer?s.player.items.filter(item=>item.id===s.event?.offerId):[];
 return offered.length===1 ? eventItemSummary(s,offered[0]) : choice.cost;
}
export function eventItemsView(s, choiceId, {review=false} = {}) {
 if(s?.phase!=='event')return '';
 const roles=eventReferenceRoles(s,choiceId),entries=[];
 for(const [used,role,id,label] of [[roles.usesOffer,'consume',s.event?.offerId,'选用后永久消耗'],[roles.usesTarget,'retain',s.event?.targetId,'保留并升级的武器']]){
  if(!used)continue;
  const matches=s.player.items.filter(item=>item.id===id),item=matches.length===1?matches[0]:null;
  if(!item){
   const reason=!id?'入场时未登记装备':matches.length>1?'同一编号对应多件装备，无法确认':'登记的装备已不在背包';
   entries.push(`<div class="event-equipment-item is-unavailable" data-event-item-role="${role}"><h3>${label}</h3><p>${esc(reason)}</p><small>本次选择不可用，不会改用其他装备。</small></div>`);continue;
  }
  const equipped=equippedIds(s).includes(item.id),notes=[];
  if(item.locked)notes.push('已锁定');
  if(equipped)notes.push('装备中');
  if(role==='consume'){
   if(item.rarity>=3)notes.push('传说及以上，受保护');
   if(item.id===s.loot?.item?.id)notes.push('当前战利品，受保护');
  }
  const note=role==='retain'?'沿用入场登记目标；换装不会转移这次升级。':'Lv.、等级经验与 +N 随材料一并消耗。';
  entries.push(`<div class="event-equipment-item" data-event-item-role="${role}" data-event-item-id="${esc(item.id)}"><h3>${icon(role==='consume'?'inventory':'forge')}${label}</h3><p class="event-equipment-name">${esc(eventItemSummary(s,item))}</p><dl><div><dt>等级进度</dt><dd>${itemProgress(item)}</dd></div><div><dt>物品编号</dt><dd>${esc(item.id)}</dd></div></dl>${notes.length?`<p class="event-equipment-protection">${icon(item.locked?'lock':'shield')}${esc(notes.join(' · '))}${role==='retain'?' · 升级后仍保留':' · 不可作为消耗材料'}</p>`:''}<p class="event-equipment-note">${note}</p>${review?'':button('查看属性与比较','compare-details','small',`data-id="${esc(item.id)}"`)}</div>`);
 }
 if(!entries.length)return '';
 return `<section class="event-equipment" aria-label="本次抉择的装备"><div class="event-equipment-heading"><h2>本次抉择的装备</h2><p>以入场登记为准</p></div><div class="event-equipment-grid" data-items="${entries.length}">${entries.join('')}</div></section>`;
}
export function migrationSummary(s) {
 if(s?.v5Migration&&!s.migration)return `V${s.v5Migration.fromVersion} 存档已接入 V5：${num(s.v5Migration.inventory)} 件背包装备、旧宝箱、商店与随机状态原样保留。`;
 const report=s?.migration;if(!report)return '';
 return `旧版 V${report.fromVersion} 存档已升级：转换 ${num(report.equipment)} 件装备，背包保留 ${num(report.inventory)} 件，强化 +N 保留；物品估值最大偏差 ${(Number(report.maxRelativeDelta||0)*100).toFixed(3)}%。`;
}
export function itemEffects(item,{compact=false}={}) {
 const st=itemStats(item),parts=[];
 for(const [key,label] of [['attack','攻击'],['hp','生命'],['defense','防御'],['luck','幸运']])if(st[key])parts.push(`${label} +${num(st[key])}`);
 const percent=value=>Math.round(value*1000)/10;
 for(const [amount,label] of [[(st.crit||0)+(st.critBonus||0),'暴击率'],[(st.follow||0)+(st.followBonus||0),'追击率']])if(amount)parts.push(`${label} +${percent(amount)}%`);
 // Detailed views name the actual trigger and percentage base. The compact
 // equipped rail keeps its short labels; its title and inventory expose details.
 const detail=compact?{}:{regen:'战斗掷骰后存活：恢复最大生命',barrier:'开战：获得最大生命护盾',pairWard:'双同及以上：获得最大生命护盾',criticalFollow:'双同及以上且暴击：追击率',healBonus:'击杀：额外恢复最大生命'};
 for(const [key,label] of [['fourBonus','4 点伤害'],['fiveBonus','5 点伤害'],['sixBonus','6 点伤害'],['pairBonus','共鸣伤害'],['sumBonus','总点 ≥18 伤害'],['bossBonus','强敌伤害'],['firstBonus','首击伤害'],['pierce','穿盾'],['reduction','减伤'],['dodge','闪避率'],['regen','存活回合恢复'],['barrier','开战护盾'],['pairWard','共鸣护盾'],['criticalFollow','共鸣暴击追击率'],['followDamage','追击追加主击'],['goldBonus','宝箱金币'],['echoChance','同点引导率'],['healBonus','击杀额外恢复']])if(st[key])parts.push(`${detail[key]||label} +${percent(st[key])}%`);
 if(st.critDamage)parts.push(`暴击倍率 +${st.critDamage.toFixed(2)}`);
 for(const [key,def]of Object.entries(ABILITY_DEFS))if(st[key])parts.push(`${def.text}${def.kind==='guard'?' -':' +'}${def.kind==='luck'?Math.round(st[key]):percent(st[key])}${def.kind==='luck'?'':'%'}`);
 return parts.join(' · ');
}
export function comparisonValue(key,value) {
 if(['critDamage'].includes(key))return `+${Number(value).toFixed(2)}`;
 if(['pierce','crit','follow','echoChance','pairBonus','critBonus','followBonus','reduction','dodge','regen','barrier','pairWard','criticalFollow','followDamage','goldBonus'].includes(key))return `${Math.round(Number(value)*1000)/10}%`;
 return num(Number.isInteger(value)?value:Math.round(value*100)/100);
}
export function comparison(s,item,requestedSlot) {
 if(equippedIds(s).includes(item.id))return '<span class="muted">已装备</span>';
 return comparisonMarkup(s,item,requestedSlot,compareEquipment(s,item,requestedSlot));
}
function comparisonMarkup(s,item,requestedSlot,result) {
 const delta=result.delta,hint=equipmentComparisonHint(s,item,requestedSlot);
 const grade=result.shieldTradeoff?result.grade:hint.hasOmitted?'条件需权衡':result.grade||(delta>=8?'明显提升':delta<=-8?'明显降低':'大致持平');
 const note=[hint.note,result.shieldTradeoff?result.note:hint.hasOmitted?'请结合触发条件与生效上限选择。':result.note].filter(Boolean).join(' ');
 return `<div class="item-comparison ${hint.hasOmitted?'condition-tradeoff':delta>0?'improvement':delta<0?'decline':'muted'}"><span class="comparison-verdict"><b>${grade}</b><small>${item.slot==='armor'?'基础生存估值':'基础伤害估值'} ${delta>0?'+':''}${delta}%</small></span>${result.core?.length?`<dl class="comparison-core">${result.core.map(change=>`<div><dt>${change.key==='goldBonus'?'宝箱金币':change.label}</dt><dd>${comparisonValue(change.key,change.before)} <span>→</span> ${comparisonValue(change.key,change.after)}</dd></div>`).join('')}</dl>`:''}${result.conditional||hint.hasOmitted||hint.hasApproximate?`<small class="comparison-conditional">${esc(note||'条件词条需看触发，不能只比较攻击。')}</small>`:''}</div>`;
}
function comparisonContextView(context) {
 if(!context.showVitals)return '';
 const {before,after,hpLost,dead}=context;
 const healthNote=dead?'换装不会复活；重燃时才按当时构筑恢复全部生命。':hpLost?`超出新上限的 ${num(hpLost)} 点当前生命会被裁减；换回装备不会补回。`:after.maxHp>before.maxHp?'生命上限提高，当前生命不会随之恢复。':after.maxHp<before.maxHp?'当前生命未超出新上限，本次不会裁减。':'换装不会恢复当前生命。';
 return `<section data-comparison-context><h4>此时装备后的状态</h4><dl class="comparison-conditions"><div data-comparison-context-key="hp"><dt>当前生命 / 生命上限</dt><dd>${num(before.hp)} / ${num(before.maxHp)}<span>→</span>${num(after.hp)} / ${num(after.maxHp)}</dd></div><div data-comparison-context-key="ward"><dt>当前护盾</dt><dd>${num(before.ward)}<span>→</span>${num(after.ward)}</dd></div></dl><p class="comparison-scope">${healthNote} 换装不重新发放开战护盾，已获得的护盾保留。</p></section>`;
}
export function equipmentComparisonView(s,item,requestedSlot) {
 const detail=equipmentComparisonDetails(s,item,requestedSlot),old=s.player.items.find(i=>i.id===s.player.equipped[detail.slot]);
 const value=(amount,unit)=>unit==='integer'?num(amount):unit==='multiplier'?`×${Number(amount).toFixed(2)}`:`${unit==='reduction'?'降低 ':''}${Math.round(amount*1000)/10}%${unit==='maxHp'?' 最大生命':''}`;
 const coverage={omitted:'未计入估值',approximate:'近似计入',included:'已计入估值'};
 const unreachable=new Map(detail.context.unreachable.map(condition=>[condition.key,condition.message]));
 return `<div class="dialog-heading"><h2 id="dialog-title">装备比较</h2>${button(icon('close'),'close-dialog','icon-button','aria-label="关闭装备比较"')}</div><section class="comparison-detail" data-comparison-item="${esc(item.id)}"><h3>${esc(itemSummary(item))}</h3>${item.slot==='relic'?`<label class="comparison-detail-slot">比较替换位<select id="comparison-slot" data-id="${esc(item.id)}" aria-label="比较替换的遗物位">${['relic','relic2','relic3'].map(slot=>`<option value="${slot}" ${slot===detail.slot?'selected':''}>${EQUIP_SLOTS[slot]}</option>`).join('')}</select></label>`:''}<p>当前${EQUIP_SLOTS[detail.slot]}：${old?esc(itemSummary(old)):'空装备位'}</p>${comparison(s,item,detail.slot)}${comparisonContextView(detail.context)}<h4>触发条件与实际属性</h4><p class="comparison-scope" data-comparison-dice-count="${detail.context.count}">当前使用 ${detail.context.count} 颗战斗骰；骰数足够仍须满足对应触发条件。</p>${detail.rows.length?`<dl class="comparison-conditions">${detail.rows.map(row=>`<div data-comparison-key="${esc(row.key)}" data-comparison-possible="${!unreachable.has(row.key)}"><dt>${esc(row.label)}<small>${esc(row.trigger)}</small>${unreachable.has(row.key)?`<small><strong>${esc(unreachable.get(row.key))}</strong></small>`:''}</dt><dd>${value(row.before,row.unit)}<span>→</span>${value(row.after,row.unit)}<small>${coverage[row.coverage]}</small></dd></div>`).join('')}</dl>`:'<p>本次换装没有生效的条件属性变化；常态属性见上方对照。</p>'}${detail.limits.length?`<h4>已触及的上限</h4><ul class="comparison-limits">${detail.limits.map(limit=>`<li data-comparison-limit="${esc(limit.key)}">${esc(limit.label)}：生效上限 ${value(limit.cap,limit.unit)}，超过部分不再叠加。${unreachable.has(limit.key)?` ${esc(unreachable.get(limit.key))}`:''}</li>`).join('')}</ul>`:''}<p class="comparison-scope">${esc(detail.note)}</p><p class="comparison-scope">这里显示触发时的构筑属性，不能将各行百分比直接相加当作最终伤害。</p>${button('关闭比较','close-dialog','small')}</section>`;
}
function itemCard(s, item, action = true, comparisonState = s, preparedComparison) {
 const equipped=equippedIds(s).includes(item.id);
 return `<article class="item-card refined-item ${RARITIES[item.rarity].key} ${equipped?'item-equipped':''}"><div class="item-meta">${badge(item.rarity)}<span>${SLOTS[item.slot]}</span>${item.locked?`<span class="item-lock" title="已锁定，安全批量融合会跳过">${icon('lock')}</span>`:''}</div><h3>${esc(item.name)} <small class="item-enhance">+${item.enhance}</small></h3><div class="item-level-line"><strong>Lv.${num(item.level)}</strong><span>等级进度 ${itemProgress(item)}</span></div><p>${itemEffects(item).split(' · ').map(effect=>`<span>${effect}</span>`).join('')}</p><div class="item-origin">于第 ${num(item.depth)} 层获得${item.legacy?'<span>旧版效果保留</span>':''}</div><div class="item-bottom">${preparedComparison?comparisonMarkup(comparisonState,item,undefined,preparedComparison):comparison(comparisonState,item)}<div class="item-actions">${action&&!equipped?button('比较条件','compare-details','small quiet',`data-id="${item.id}" aria-label="比较${esc(item.name)}的触发条件"`):''}${action?button(item.locked?'解锁':'锁定','lock','small quiet',`data-id="${item.id}" aria-pressed="${!!item.locked}" aria-label="${item.locked?'解锁':'锁定'}${esc(item.name)}"`):''}${action&&!equipped&&!item.locked&&item.id!==s.loot?.item?.id?button('回收','salvage-item',`small ${item.rarity>=3?'danger quiet':'quiet'}`,`data-id="${item.id}" aria-label="回收${esc(item.name)}，需再次确认"`):''}${action?button(equipped?`${icon('check')} 已装备`:item.slot==='relic'&&['relic','relic2','relic3'].every(k=>s.player.equipped[k])?'选择替换':'装备','equip','small',`data-id="${item.id}" ${equipped?'disabled':''}`):''}</div></div></article>`;
}
export function header(s, title = false) {
  return `<header class="topbar"><a class="brand" href="#" data-action="home" aria-label="返回标题"><span>骰狱<span class="brand-sub">：无尽深渊</span></span><small>— D I C E　 A B Y S S —</small></a><div class="header-motto">以骰为火<br>点燃永夜</div>${!title ? `<div class="location">第 <b>${String(s.floor).padStart(2, '0')}</b> 层 <span class="location-divider"></span>${floorName(s)}</div>` : '<span class="title-top-note">每一次掷骰，都更接近深渊。</span>'}<div class="header-actions">${!title?button(`${icon('inventory')}<span>图鉴</span>`,'codex','quiet'):''}${button(`${icon('full')} 全屏`, 'fullscreen', 'quiet', 'aria-label="切换全屏"')}${button(`${icon('settings')}<span>设置</span>`, 'settings', 'quiet')}</div></header>`;
}
export function titleView(s, error) {
  return `${header(s, true)}<main class="title-screen"><div class="title-copy"><div class="title-rule"></div><h1>每一次掷骰，<br>都更接近<span>深渊。</span></h1><p>让命运落定，让回响燃烧。<br>踏入黑暗，带着战利品归来。</p><div class="title-buttons">${button(`${s ? '继续深入' : '踏入深渊'} ${icon('arrow')}`, s ? 'continue' : 'new', 'primary title-primary')}${s ? button('开始新游戏', 'new', 'quiet') : ''}</div>${s?.migration||s?.v5Migration?`<p class="migration-notice">${esc(migrationSummary(s))}</p>`:''}${s ? `<div class="resume-note">第 ${s.floor} 层 · ${floorName(s)}<span>Lv.${s.player.level} · ${diceCount(s)} 颗战斗骰</span></div>` : '<div class="resume-note">手动掷骰 · 每战必有宝箱 · 进度自动保存</div>'}${error ? `<p class="error-note">${esc(error)}</p>` : ''}</div><div class="title-art" aria-hidden="true"><div class="title-orbit"></div>${dice([6], { large: true })}<div class="art-caption"><span>01 — ∞</span><span>THE ABYSS AWAITS</span></div></div></main><footer class="title-footer"><span>DICE ABYSS / V${RELEASE_VERSION}</span><span>一颗骰子，一段尚未写下的命运。</span><span>桌面体验 · 本地存档</span></footer>`;
}
export function boonReadoutView(s, ui = {}, model=boonReadout(s)) {
 if(model.empty)return '';
 const groups=['opening','nextRoll','combatTrigger','reserve','floor'].map(key=>model.groups.find(group=>group.key===key)).filter(Boolean);
 const entries=groups.flatMap(group=>group.entries);
 return `<section class="boon-readout" aria-labelledby="boon-heading"><h2 id="boon-heading">增益与储备 <span>${entries.length} 项</span></h2>${groups.map(group=>`<section class="boon-group" data-boon-group="${esc(group.key)}" aria-label="${esc(group.name)}"><h3>${esc(group.name)}</h3><dl>${group.entries.map(entry=>`<div class="boon-entry" data-boon-key="${esc(entry.key)}"><dt>${esc(entry.name)}</dt><dd><strong>${esc(entry.value)}</strong><small>${esc(entry.when)}</small></dd></div>`).join('')}</dl></section>`).join('')}<details class="boon-details" data-boon-details ${ui.boonDetails?'open':''}><summary id="boon-details-toggle">生效与消耗规则</summary>${entries.map(entry=>`<p><b>${esc(entry.name)}</b>${esc(entry.detail)}</p>`).join('')}</details></section>`;
}
function combatBoonView(s, ui = {}, model) {
 // Impact presents the committed result. Any newly earned nextLuck belongs to
 // the following manual roll, so it must not appear as a benefit of this hit.
 if(s.phase!=='combat'||s.player.hp<=0||(ui.busy&&!ui.rolling))return '';
 const entries=(model??boonReadout(s)).groups.filter(group=>['opening','nextRoll'].includes(group.key)).flatMap(group=>group.entries);
 return entries.length?`<div class="combat-boon-ready" aria-label="待用战斗增益">${entries.map(entry=>`<p data-ready-boon="${esc(entry.key)}">${icon(entry.key==='openingEcho'?'fusion':'dice')}<span>${esc(entry.name)}</span><strong>${esc(entry.value)}</strong><small>${ui.rolling?'本掷生效':'下一掷生效'}</small></p>`).join('')}</div>`:'';
}
export function eventChoicePreviewView(s, choiceId) {
 const preview=eventChoicePreview(s,choiceId);
 if(!preview?.available||!preview.rows.length)return '';
 const value=(n,unit)=>unit==='reserve'?(n?'已储备':'未储备'):unit==='level'?`Lv.${goldNum(n)}`:unit==='enhance'?`+${n}`:unit==='percent'?`${Math.round(n*10000)/100}%`:unit==='items'?`${goldNum(n)} 件`:goldNum(n);
 return `<span class="event-choice-preview" data-event-preview="${esc(choiceId)}"><span class="event-preview-title">选择后的即时状态</span>${preview.rows.map(row=>`<span class="event-preview-row" data-preview-key="${esc(row.key)}"><span class="event-preview-label">${esc(row.label)}${row.targetName?`<small>${esc(row.targetName)}</small>`:''}</span><span class="event-preview-values"><span>${value(row.before,row.unit)}</span><span class="event-preview-arrow" aria-hidden="true">→</span><span class="sr-only">选择后</span><strong>${value(row.after,row.unit)}</strong></span></span>`).join('')}${preview.notes.map(note=>`<small class="event-preview-note">${esc(note)}</small>`).join('')}</span>`;
}
export function routeRail(s, ui = {}, boons) {
  const reward = s.phase === 'loot' || s.phase === 'chest';
  return `<aside class="left-rail"><section class="route-panel frame"><div class="section-label">${reward ? '战斗结算' : '深渊探索'} <span>${reward ? 'BATTLE REPORT' : 'DUNGEON'}</span></div><h2>第 <b>${s.floor}</b> 层 · ${floorName(s)}</h2><div class="era-line"><strong>${eraFor(s.floor).name}</strong><span>已解锁至 ${RARITIES[highestRarity(s.floor)].name}</span></div><p class="rail-quote">「死亡并非终点，<br>　而是更深的开始。」</p><ol class="route-list">${(s.route.length ? s.route : Array.from({ length: 6 }, (_, i) => ({ type: 'unknown', id: i }))).map((room, i) => `<li class="${room.done ? 'done' : i === s.roomIndex && s.phase !== 'fate' ? 'current' : ''}"><span class="route-node">${room.done ? icon('check') : room.type === 'unknown' ? '<span>?</span>' : icon(room.type)}</span><span>${ROOM_NAMES[room.type] || '未知'}</span><em>${String(i + 1).padStart(2, '0')}</em></li>`).join('')}</ol>${boonReadoutView(s,ui,boons)}<div class="section-label sub-label">${reward ? '本场回响' : '探索概况'}<span>${reward ? 'RESULT' : 'FATE'}</span></div><dl class="exploration-stats">${reward && s.lastRoll ? `<div><dt>终结伤害</dt><dd class="danger">${num(s.lastRoll.total)}</dd></div><div><dt>战斗回合</dt><dd>${s.enemy?.turns || 0}</dd></div>` : `<div><dt>本层命运</dt><dd>${s.fate ? s.fate.join(' + ') : '尚未揭晓'}</dd></div><div><dt>路线进度</dt><dd>${s.route.filter(r => r.done).length} / 6</dd></div>`}<div><dt>累计胜利</dt><dd>${s.counters.kills}</dd></div><div><dt>最高伤害</dt><dd class="gold">${num(s.counters.highestDamage)}</dd></div></dl>${s.fate ? `<p class="fate-summary">${s.fate.reduce((a, b) => a + b) >= 9 ? '丰饶 · 宝箱倾向提升 / 锻造折扣' : s.fate.reduce((a, b) => a + b) >= 7 ? '顺遂 · 宝箱与补给交替' : '微光 · 战斗、交易与成长'}</p>` : ''}</section><section class="log-panel frame"><div class="section-label">战斗日志 <span>LOG</span></div><ol>${s.log.map((l,i) => `<li class="${esc(l.tone)}"><span class="log-index">[${String(i+1).padStart(2,'0')}]</span> ${esc(l.text)}</li>`).join('')}</ol></section><p class="rail-foot">每一次掷骰，都是向深渊更进一步。<small>ROLL DEEPER. MEET A GREATER YOU.</small></p></aside>`;
}
export function equipmentRail(s, st=stats(s)) {
 const odds=diceOdds(s);
 return `<aside class="right-rail frame"><div class="section-label">当前装备 <span>EQUIPMENT</span></div><div class="equipment-list">${Object.keys(EQUIP_SLOTS).map(slot=>{
  const item=s.player.items.find(i=>i.id===s.player.equipped[slot]);
  if(!item)return `<button class="equipped-item empty-slot" data-action="inventory" data-slot="${slot.startsWith('relic')?'relic':slot}">${EQUIP_SLOTS[slot]}<span>＋ 空装备位</span></button>`;
  return `<button class="equipped-item ${RARITIES[item.rarity].key}" data-action="inventory" data-slot="${slot.startsWith('relic')?'relic':slot}" title="${esc(SLOT_DESCRIPTIONS[item.slot].replace('破甲','穿盾')+' · '+itemEffects(item))}"><div class="item-meta"><span>${EQUIP_SLOTS[slot]}</span><strong>Lv.${num(item.level)}</strong>${badge(item.rarity)}</div><h3>${esc(item.name)} <small>+${item.enhance}</small></h3><p>${itemEffects(item,{compact:true}).split(' · ').map(effect=>`<span>${effect}</span>`).join('')}</p><div class="equipment-depth">于第 ${num(item.depth)} 层获得 <span>等级进度 ${itemProgress(item)}</span></div></button>`;
 }).join('')}</div><div class="character-stats"><div class="section-label">掷骰之力 <span>幸运 ${num(st.luck)}</span></div><dl><div><dt>攻击</dt><dd>${num(st.attack)}</dd></div><div><dt>基础暴击</dt><dd>${Math.round(Math.min(.9,st.crit+st.critBonus)*100)}<small>%</small></dd></div><div><dt>防御</dt><dd>${num(st.defense)}</dd></div><div><dt>基础追击</dt><dd>${Math.round(Math.min(.85,st.follow+st.followBonus)*100)}<small>%</small></dd></div></dl></div><div class="dice-growth"><div class="section-label">战斗骰 <span>${diceCount(s)} / 6</span></div><div class="mini-dice">${DICE_LEVELS.map(level=>`<span class="${s.player.level>=level?'unlocked':''}" title="Lv.${level} 解锁">${s.player.level>=level?icon('dice'):level}</span>`).join('')}</div><p>${diceCount(s)<6?`下一颗骰子 · Lv.${DICE_LEVELS[diceCount(s)]} 解锁`:'六骰齐鸣 · 命运由你掷下'}<small class="luck-odds">基础 5 / 6 点概率 ${(odds.highChance*100).toFixed(1)}% · 同点引导 ${(odds.echoChance*100).toFixed(1)}%</small>${st.luckOverflow?`<small class="luck-odds">幸运投入 ${st.rawLuck} → 有效 ${st.luck}；溢出宝箱金币加成 +${Math.round(Math.min(.5,st.luckOverflow*.002)*100)}%</small>`:''}</p></div></aside>`;
}
function talentEffect(description,rank) {
 return description.replace(/([+-])(\d+(?:\.\d+)?)(%?)|(\d+(?:\.\d+)?)%/g,(_,sign,value,unit,percent)=>{if(percent!==undefined)return `${Math.round(Number(percent)*rank*100)/100}%`;const scaled=Number(value)*rank,precision=value.includes('.')?value.split('.')[1].length:0;return `${sign}${unit?Math.round(scaled*100)/100:precision?scaled.toFixed(precision):scaled}${unit}`;});
}
export function talentInvestmentCount(value) {
 return value==='max'?'max':[1,5,10,'1','5','10'].includes(value)?Number(value):1;
}
function talentNodePreview(s,ui,id) {
 const definition=TALENTS[id],rank=talent(s,id),count=talentInvestmentCount(ui.talentCount);
 const preview=talentPreview(s,id,count),maxed=rank>=definition.cap;
 const reason=s.floor<(definition.floor||1)?`第 ${definition.floor} 层解锁`:maxed?'本节点已满':s.player.talentPoints<=0?'暂无可用天赋点':ui.busy?'结果揭晓后可投入':'';
 const effect=value=>DEEP_TALENTS[id]?deepTalentText(definition,value):talentEffect(definition.description,value);
 return {definition,rank,count,preview,maxed,reason,can:!!preview&&!ui.busy,beforeEffect:effect(rank),afterEffect:effect(preview?.afterRank??rank)};
}
export function talentInspectorView(s,ui,id=ui.talentInspect) {
 const group=Object.hasOwn(TALENT_GROUPS,ui.talentGroup)?ui.talentGroup:'high';
 if(!Object.hasOwn(TALENTS,id))id=Object.keys(TALENTS).find(key=>TALENTS[key].group===group);
 const {definition,rank,count,preview,reason,beforeEffect,afterEffect}=talentNodePreview(s,ui,id);
 return `<div class="talent-preview-heading" data-talent-inspected="${id}" data-preview-count="${preview?.count||0}" data-preview-before="${rank}" data-preview-after="${preview?.afterRank??rank}" data-preview-remaining="${preview?.remainingPoints??s.player.talentPoints}"><strong>${esc(definition.name)}</strong><span>${TALENT_GROUPS[definition.group]} · ${DEEP_TALENTS[id]?'深层节点':'基础节点'}</span><b>${preview?`实际投入 +${num(preview.count)} 点`:esc(reason)}</b></div><div class="talent-preview-values"><span><small>节点等级</small><b>${num(rank)} <i>→</i> ${num(preview?.afterRank??rank)}</b></span><span class="talent-preview-effect"><small>节点累计贡献</small><b>${esc(beforeEffect)} <i>→</i> <em>${esc(afterEffect)}</em></b></span><span><small>投入后剩余</small><b>${num(preview?.remainingPoints??s.player.talentPoints)} <small>点</small></b></span></div><p class="talent-preview-note">${preview?count==='max'?'本节点最多：仅投入此节点，其他节点不会变化。':preview.capped?`所选 ${count} 点受余额或节点上限限制，本次实际投入 ${num(preview.count)} 点。`:'点击节点后才会投入，当前仅为预览。':esc(reason)+'。'}${id==='vitality'?' 仅增加生命上限，当前生命不恢复。':''}</p>`;
}
function buildRail(s) {
  const st=stats(s);
  return `<aside class="left-rail build-rail"><section class="frame build-profile"><div class="section-label">深渊旅者 <span>Lv.${s.player.level}</span></div><p>在无尽的轮回中，寻找下一个可能。</p><dl class="exploration-stats"><div><dt>生命值</dt><dd class="danger">${num(s.player.hp)} / ${num(st.maxHp)}</dd></div><div><dt>攻击强度</dt><dd>${st.attack}</dd></div><div><dt>暴击率</dt><dd>${Math.round(Math.min(.9,st.crit+st.critBonus)*100)}%</dd></div><div><dt>追击率</dt><dd>${Math.round(Math.min(.85,st.follow+st.followBonus)*100)}%</dd></div><div><dt>幸运 / 高点概率</dt><dd>${num(st.luck)} / ${(diceOdds(s).highChance*100).toFixed(1)}%</dd></div></dl></section><section class="frame build-set"><div class="section-label">当前骰组 <span>DICE SET</span></div><div class="build-dice">${DICE_LEVELS.map((lv,i)=>`<div class="${s.player.level>=lv?'unlocked':''}">${icon('dice')}<b>${i+1}</b><small>${s.player.level>=lv?'已解锁':`Lv.${lv}`}</small></div>`).join('')}</div><p>手动投骰 · 同点共鸣 · 最多一次追击</p></section><section class="frame build-equipment"><div class="section-label">装备 <span>EQUIPMENT</span></div>${Object.keys(EQUIP_SLOTS).map(slot=>{const item=s.player.items.find(i=>i.id===s.player.equipped[slot]);if(!item)return `<div class="build-equipped empty-slot">${EQUIP_SLOTS[slot]} · 空位</div>`;return `<button data-action="inventory" data-slot="${slot.startsWith('relic')?'relic':slot}" class="build-equipped ${RARITIES[item.rarity].key}"><b>［${RARITIES[item.rarity].name}］${esc(item.name)} Lv.${num(item.level)} +${item.enhance}</b><small>${itemEffects(item)}</small><small class="build-origin">来源第 ${num(item.depth)} 层 · 等级进度 ${itemProgress(item)}</small></button>`;}).join('')}</section><p class="rail-foot">构筑不是终点，而是下一次坠落的起点。</p></aside>`;
}
function buildDetails(s,ui) {
 const selected=ui.talentGroup||'high', resonance=talent(s,'resonance')*.12;
 return `<aside class="right-rail frame build-details destiny-build-details"><div class="section-label">骰子成长 <span>${diceCount(s)} / 6</span></div><div class="growth-cards">${DICE_LEVELS.map((lv,i)=>`<div class="${s.player.level>=lv?'unlocked':''}">${icon('dice')}<b>${i+1}</b><small>${s.player.level>=lv?'已解锁':`Lv.${lv}`}</small></div>`).join('')}</div><p class="destiny-unlock-note">${diceCount(s)<6?`下一颗战斗骰 · Lv.${DICE_LEVELS[diceCount(s)]}`:'六骰已齐 · 同点共鸣，交由你掷下'}</p><div class="section-label">核心组合 <span>COMBO</span></div><dl class="combo-rules">${[2,3,4,5,6].map(n=>`<div><dt>${['','','双同','三同','四同','五同','六同'][n]}</dt><dd>×${(1+(n-1)*.45).toFixed(2)}<small>${n} 颗相同点数</small></dd></div>`).join('')}</dl><dl class="destiny-multipliers"><div><dt>天赋共鸣增幅</dt><dd>+${resonance.toFixed(2)}</dd></div><div><dt>暴击倍率</dt><dd>×${(1.8+talent(s,'crush')*.1+stats(s).critDamage).toFixed(2)}</dd></div><div><dt>追击追加主击</dt><dd>+${Math.round((.35+talent(s,'pursuit')*.08+stats(s).followDamage)*100)}%</dd></div></dl><div class="section-label">天赋回响 <span>PROGRESSION</span></div><div class="destiny-build-summary">${Object.entries(TALENT_GROUPS).map(([key,name])=>{const nodes=Object.entries(TALENTS).filter(([,t])=>t.group===key),spent=nodes.reduce((n,[id])=>n+talent(s,id),0);return `<div class="branch-${key} ${selected===key?'selected':''}"><div><b>${name}</b><strong>${num(spent)}<small> 点</small></strong></div><span class="destiny-summary-track" aria-label="${nodes.filter(([id])=>talent(s,id)>0).length}个节点已点亮">${nodes.map(([id,t])=>`<i class="${talent(s,id)?'lit':''} ${talent(s,id)>=t.cap?'complete':''}"></i>`).join('')}</span></div>`;}).join('')}</div><p class="rail-foot">每次升级获得 2 点<br>${Object.keys(TALENTS).length} 个节点；深层节点按楼层解锁。</p></aside>`;
}
function rewardRail(s) {
 const item=s.player.items.find(i=>i.id===s.loot.item.id)||s.loot.item, slot=equipSlot(s,item), old=s.player.items.find(i=>i.id===s.player.equipped[slot]);
 return `<aside class="right-rail frame reward-rail"><div class="section-label">装备对比 <span>COMPARE</span></div><div class="compare-item"><h3>${item.slot==='relic'?EQUIP_SLOTS[slot]:'当前装备'} <small>${old?'已装备':'空装备位'}</small></h3>${old?itemCard(s,old,false):'<p class="compare-empty">此处尚未装备 · 新装备可直接填入</p>'}</div><div class="compare-item"><h3>新获得 <small>${RARITIES[item.rarity].name}</small></h3>${itemCard(s,item)}</div>${item.slot==='relic'?'<p class="comparison-note">空位优先；满槽时按最弱遗物比较，换装可选择替换位。</p>':''}<div class="section-label">当前构筑 <span>BUILD SUMMARY</span></div><div class="build-summary">${Object.entries(TALENT_GROUPS).map(([key,name])=>{const nodes=Object.entries(TALENTS).filter(([,t])=>t.group===key),spent=nodes.reduce((sum,[id])=>sum+talent(s,id),0),lit=nodes.filter(([id])=>talent(s,id)>0).length;return `<div class="branch-${key}"><span>${name}</span><b>${num(spent)} 点</b><i style="--progress:${lit/nodes.length*100}%" aria-label="${lit} / ${nodes.length} 节点已点亮"></i></div>`;}).join('')}</div><div class="section-label">成长回响 <span>PROGRESSION</span></div><dl class="exploration-stats"><div><dt>已打开宝箱</dt><dd>${s.counters.chests}</dd></div><div><dt>已有装备</dt><dd>${s.player.items.length}</dd></div><div><dt>战斗骰</dt><dd>${diceCount(s)} / 6</dd></div></dl><p class="rail-foot">你带走的不只是战利品，<br>而是继续前行的理由。</p></aside>`;
}
// Vector relief derived from the V5.1 visual study; it carries no game state.
function battleAltar(boss) {
 return `<svg class="battle-altar ${boss?'boss-altar':''}" viewBox="0 0 900 240" fill="none" aria-hidden="true"><ellipse class="altar-stone" cx="450" cy="120" rx="398" ry="89"/><ellipse class="altar-bevel" cx="450" cy="119" rx="397" ry="88"/><ellipse cx="450" cy="112" rx="368" ry="73"/><ellipse class="altar-inner" cx="450" cy="112" rx="286" ry="54"/><path d="M57 119h94m598 0h94M450 31v25m0 110v25M193 55l50 25m414 64 50 25M707 55l-50 25m-414 64-50 25"/><path class="altar-glyph" d="m450 79 59 33-59 33-59-33Z m0 10 42 23-42 23-42-23Z M430 112h40m-20-12v24"/><g class="altar-notches">${Array.from({length:32},(_,i)=>{const a=i*Math.PI/16,x=450+Math.cos(a)*340,y=112+Math.sin(a)*67;return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${(-Math.cos(a)*(i%4===0?18:9)).toFixed(1)} ${(-Math.sin(a)*(i%4===0?6:3)).toFixed(1)}"/>`;}).join('')}</g></svg>`;
}
function combatTacticsView(t,phase) {
 const context=[`第 ${t.turn} 掷`,`${t.count} 骰`,phase?`阶段 ${phase} / 2`:t.wave?`第 ${t.wave} 波`:null].filter(Boolean).join(' · ');
 return `<section class="combat-tactics" aria-label="当前一掷对策" data-tactic="${esc(t.mechanic)}" data-tactic-turn="${t.turn}"><div class="combat-tactics-heading"><h2>当前一掷${t.variantLabel?`<span class="tactic-variant">${esc(t.variantLabel)}</span>`:''}</h2><span>${context}</span></div><dl>${t.lines.map(row=>`<div data-tactic-condition="${esc(row.requirement.kind)}" data-tactic-possible="${row.possible}"><dt>${esc(row.condition)}</dt><dd>${esc(row.effect)}${row.possible?'':`<small>当前仅 ${t.count} 骰，无法达成此条件</small>`}</dd></div>`).join('')}</dl></section>`;
}
function historicalMultiplier(value,percent=false) {
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return null;
 const scaled=value*(percent?100:1);
 return Number.isFinite(scaled)?String(Number(scaled.toFixed(percent?2:4))):null;
}
function combatView(s, ui, boons) {
  const e = s.enemy, last = ui.rolling ? null : s.lastRoll, intent=enemyIntent(s);
  const maxIntent=Math.max(intent.damage,intent.conditionalDamage||0), fatal=maxIntent>=s.player.hp, trialLeft=Math.max(0,4-e.turns);
  const intentDetail=intent.detail.startsWith(e.label)?intent.detail.slice(e.label.length).replace(/^ · /,''):intent.detail;
  const tactics=s.player.hp>0?encounterTactics(e,diceCount(s)):null,criticalFactor=historicalMultiplier(last?.criticalMultiplier),followFactor=historicalMultiplier(last?.followMultiplier,true);
  const power = last ? last.killed ? 'finish' : last.best >= 3 && last.critical ? 'chain' : last.critical ? 'critical' : last.best >= 2 ? 'resonance' : 'hit' : 'idle';
  return `<section class="combat-screen ${e.type === 'boss' ? 'boss-screen' : ''}" data-impact="${power}"><div class="enemy-heading"><span class="enemy-type ${e.type === 'boss' ? 'danger' : ''}">${icon(e.type)} ${e.type === 'boss' ? '〈 B O S S 〉' : e.type === 'elite' ? '精英 / ELITE' : '遭遇 / ENCOUNTER'}</span><span class="enemy-round">ROUND ${String(e.turns + 1).padStart(2,'0')}</span></div><h1>${esc(e.name)}</h1><p class="enemy-note">${esc(encounterNarrative(e))}</p><div class="enemy-health"><div class="health-track"><span style="--percent:${e.hp / e.maxHp * 100}%"></span><div class="health-label"><span>生命</span><b>${num(e.hp)} / ${num(e.maxHp)}</b><span>${(e.hp/e.maxHp*100).toFixed(1)}%</span></div></div>${e.maxShield ? `<div class="shield-line"><span class="shield-fill" style="width:${e.shield/e.maxShield*100}%"></span><span>${icon('shield')} 敌方护盾</span><b>${num(e.shield)} / ${num(e.maxShield)}</b></div>` : ''}</div><div class="enemy-trait refined-intent"><div class="enemy-mechanic">${tactics?combatTacticsView(tactics,e.type==='boss'?intent.phase:null):`<span class="trait-tag">${icon(e.trait==='shield'||e.trait==='ward'?'shield':'elite')} ${e.type==='boss'&&[2,4,5].includes(e.combatRules)?`阶段 ${intent.phase} / 2 · `:''}${esc(e.label)}</span>${e.type==='trial'?`<small class="trial-countdown ${trialLeft===1?'danger':''}">${trialLeft?`悬赏剩余 ${trialLeft} 回合 · 限时击破金币翻倍`:'限时已过 · 击破仍可获得宝箱'}</small>`:''}`}</div><div class="enemy-warning ${intent.warning||fatal?'warning-urgent':''}">${icon('combat')}<span>${e.hp===0?'敌人已击破':esc(intent.label)}<b>${e.hp===0?'':`${num(intent.damage)}${maxIntent>intent.damage?`～${num(maxIntent)}`:''} <small>生命伤害</small>`}</b>${fatal?`<small>${intent.damage>=s.player.hp?'若未击破，将耗尽当前生命':'若未击破，本次反击可能耗尽生命'}</small>`:s.ward?`<small>已计入护盾 ${num(s.ward)}</small>`:''}</span></div></div>${tactics?`<details class="combat-rules"><summary>${tactics.next?`<span>${esc(tactics.next)}</span>`:''}<span>完整遭遇规则</span></summary><p>${esc(e.label)}</p>${tactics.note?`<p>${esc(tactics.note)}</p>`:''}${intentDetail?`<p>${esc(intentDetail)}</p>`:''}</details>`:`<p class="enemy-intent-detail">${esc(intentDetail)}</p>`}${combatBoonView(s,ui,boons)}<div class="combat-stage ${last?.best >= 3 ? 'major-resonance' : ''}"><div class="stage-line"></div><div class="roll-caption">${ui.rolling ? '命 运 正 在 落 定' : last ? last.best >= 2 ? '命 运 共 鸣 ！' : last.critical ? '锋 芒 乍 现 ！' : '骰 声 回 荡' : '掷 下 你 的 第 一 击'}</div>${dice((ui.rolling?ui.rollValues:null) || last?.values || Array(diceCount(s)).fill(6), { rolling: ui.rolling, match: last?.best || 0, critical:last?.critical, follow:last?.follow, altar:true, boss:e.type==='boss' })}<div class="damage-result ${last?.critical || last?.best >= 3 ? 'emphatic' : ''}">${last ? `<div class="trigger-line">${last.best >= 2 ? `<span class="combo-tag">${['','','双重','三重','四重','五重','六重'][last.best]}共鸣</span>` : '<span class="neutral-tag">普通命中</span>'}${last.critical ? `<span class="critical-tag">暴击${criticalFactor?` ×${criticalFactor}`:''}</span>` : ''}${last.follow ? `<span class="follow-tag">连锁追击${followFactor?` +${followFactor}%`:''}</span>` : ''}${last.killed ? '<span class="kill-tag">终结一击</span>' : ''}</div>${last.luckActive?`<div class="roll-luck">幸运 ${num(last.luck)}${last.echoes?` · 同点引导 ${last.echoes} 颗`:""} · 高点 ${last.highCount||0} 颗</div>`:""}<div class="hit-breakdown"><span class="hit-history">第 ${e.turns} 掷结算</span><span class="hit-primary">主击 <b>${num(last.main)}</b></span>${last.follow?`<span class="hit-follow">追击 <b>+${num(last.extra)}</b></span>`:''}</div><div class="damage-number"><strong>${num(last.total)}</strong>${last.critical ? '<b class="crit-stamp">暴击!</b>' : ''}</div><span class="damage-label">T O T A L　D A M A G E</span><p>${last.absorbed ? `敌盾吸收 ${num(last.absorbed)} · ` : ''}${last.guarded?`阶段阻断 ${num(last.guarded)} · 实际削减生命 ${num(last.hpDamage)} · `:''}${last.killed ? '敌人已倒下 · 战利品正在凝聚' : last.phaseChanged ? `半血屏障展开 · 进入二阶段 · 受到 ${num(last.retaliation)} 点反击伤害` : `受到 ${num(last.retaliation)} 点反击伤害`}</p>${last.mechanics?.length?`<div class="roll-mechanics">${last.mechanics.map(text=>`<span>${esc(text)}</span>`).join('')}</div>`:''}` : `<div class="waiting-line"></div><p>${ui.rolling ? '骰子停下后，伤害自动结算。' : '点数越高，伤害越强。相同点数触发共鸣。'}</p>`}</div></div></section>`;
}
function fateView(s, ui) {
  const revealed = s.phase === 'route' && !ui.rolling;
  return `<section class="room-screen fate-screen"><span class="room-symbol">${icon('dice')}</span><h1>${revealed ? '命运已落定' : '下一步，交给命运。'}</h1><p>${revealed ? '通往深处的路，已经为你展开。' : '投出本层命运骰，揭晓一条新的地牢路线。'}</p>${dice(revealed ? s.fate : (ui.rolling ? ui.rollValues : null) || [6, 6], { large: true, rolling: ui.rolling })}${revealed ? `<div class="fate-verdict"><b>${s.fate.reduce((a, b) => a + b)}<small> / 12</small></b><span>${s.fate.reduce((a, b) => a + b) >= 9 ? '丰饶之兆' : s.fate.reduce((a, b) => a + b) >= 7 ? '顺遂之兆' : '微光之兆'}</span></div><div class="route-preview">${s.route.map(r => `<span class="${r.type === 'boss' ? 'danger' : ''}">${icon(r.type)}<small>${ROOM_NAMES[r.type]}</small></span>`).join('')}</div><p class="room-hint">${s.fate[0] === s.fate[1] ? `命运双同，标称奖励 ${Math.round(20 + depthPower(s.floor) * 5)} 金币；超出持有上限的部分不会计入。` : '路线已记录，随时可以继续。'}</p>` : '<p class="room-hint">更高点数带来更丰厚的收获。每条路都有值得打开的宝箱。</p>'}</section>`;
}
function rewardDust() {
  return `<g class="reward-dust">${Array.from({length:100},(_,i)=>{
    const x=18+(i*137.51)%564,y=(i*53.13)%235,r=.7+i%4;
    return `<path opacity="${.25+(i%7)/10}" d="M${x.toFixed(1)} ${y.toFixed(1)}h${r}v${r}h-${r}Z"/>`;
  }).join('')}</g><g class="reward-traces"><path d="M0 70h35l65 65h55M0 87h30l60 60h65M600 70h-35l-65 65h-55M600 87h-30l-60 60h-65M15 240h35l50-50M585 240h-35l-50-50"/></g>`;
}
function relicGeometry(grade) {
 if(grade<4)return '';
 const geometry={
  4:'<path d="m300 11 48 29-17 58h-62l-17-58Z M300 24v61m-27-32h54m-56 36 29 22 29-22"/>',
  5:'<ellipse cx="300" cy="66" rx="92" ry="29" transform="rotate(-16 300 66)"/><ellipse cx="300" cy="66" rx="72" ry="43" transform="rotate(16 300 66)"/><path d="m300 31 22 35-22 35-22-35Z"/>',
  6:'<path d="m300 8 17 34 39 7-29 27 5 40-32-18-32 18 5-40-29-27 39-7Z m0 24 29 34-29 27-29-27Z M220 66h33m94 0h33"/>',
  7:'<ellipse cx="300" cy="62" rx="103" ry="27" transform="rotate(-13 300 62)"/><ellipse cx="300" cy="62" rx="76" ry="40" transform="rotate(29 300 62)"/><ellipse cx="300" cy="62" rx="25" ry="54" transform="rotate(33 300 62)"/><path d="m300 28 24 34-24 34-24-34Z m0 13 15 21-15 21-15-21Z M196 62h12m184 0h12"/>'
 };
 return `<svg class="relic-geometry ${RARITIES[grade].key}" viewBox="0 0 600 260" fill="none" aria-hidden="true">${geometry[grade]}</svg>`;
}
function chestArt(boss = false, opened = false) {
  return `<div class="chest-art ${boss ? 'grand' : ''} ${opened ? 'opened' : ''}" aria-hidden="true"><div class="treasure-light"></div><svg viewBox="0 0 600 260" fill="none">${rewardDust()}<g class="chest-lid"><path d="m85 107-30-76 87-17 65 27h188l65-27 87 17-30 76-64 22H149Z"/><path d="m96 96-24-57 68-13 63 26h194l63-26 68 13-24 57-54 21H150Z"/><path d="m113 91-17-44 43-8 63 26h196l63-26 43 8-17 44M212 55v48M388 55v48"/></g><g class="chest-body"><path d="m85 142 55-28h320l55 28-28 97H113Z"/><path d="M85 142h430M113 239l29-88h316l29 88M125 225h350M153 160h294l18 55H135Z"/><path d="M266 141v41h68v-41M283 153v18h34v-18M142 114v28M458 114v28"/></g><path class="chest-beams" d="M300 144V0M244 144 214 9M356 144 386 9M175 144 105 0M425 144 495 0"/><path class="chest-seal" d="m300 148 13 13-13 13-13-13Z"/></svg><span class="chest-ground"></span></div>`;
}
function chestView(s) {
 const boss=['boss','vault','hiddenboss','guardian','abyssking','archiveguard'].includes(s.chest.type), vault=s.chest.type==='vault';
 return `<section class="room-screen chest-screen ${boss ? 'boss-victory' : ''}"><span class="victory-mark">~　${s.enemy?.hp===0?'V I C T O R Y':'D I S C O V E R Y'}　~</span><h1>${s.enemy?.hp===0?'胜 利':'遗 藏'}</h1><p>${s.enemy?.hp===0?`${esc(s.chest.source)}已陨落 · 无尽仍在延伸`:'尘封的回响里，仍有未熄灭的光'}</p>${chestArt(boss)}<div class="chest-caption"><span>封 印 待 解</span><h2>${vault?'星辉秘藏':boss?'首领遗藏':s.chest.type==='elite'?'精英宝箱':s.chest.type==='trial'?'悬赏宝箱':'深渊宝箱'}</h2><p>${vault?'至少史诗品质 · 深层高阶奖池已接通':boss?'传说保底 · 深层可发现更高品质':s.chest.type==='trial'?'至少史诗品质 · 限时击破金币翻倍':'金币与装备 · 每一场胜利都有回报'}</p></div>${goldIncomingView(s,s.chest.gold)}</section>`;
}
function lootView(s) {
 const item=s.player.items.find(i=>i.id===s.loot.item.id)||s.loot.item;
 return `<section class="room-screen loot-screen ${RARITIES[item.rarity].key}"><span class="victory-mark">${s.enemy?.hp===0?'~　V I C T O R Y　~':'~　D I S C O V E R Y　~'}</span><h1>${s.enemy?.hp===0?'胜 利':'遗 藏'}</h1><p>战利品已入囊 · 换上新的力量</p><div class="reward-theatre">${chestArt(item.rarity>=2,true)}${relicGeometry(item.rarity)}<div class="treasure-title"><h2>宝 箱 开 启</h2><span>T R E A S U R E　R E W A R D</span></div><div class="drop-banner">${badge(item.rarity)}掉落<small>${RARITIES[item.rarity].key.toUpperCase()} DROP</small></div></div><div class="loot-reveal">${itemCard(s,item)}${goldLootView(s.loot,s.lootCreditedGold)}</div><p class="room-hint">装备已放入背包 · 换装后旧装备仍会保留</p></section>`;
}
function merchantView(s) {
  const black=s.phase==='blackmarket', heal=s.shop.find(o=>o.id==='heal'), missingHp=stats(s).maxHp-s.player.hp, inventoryFull=s.player.items.length>=10000;
  return `<section class="room-screen merchant-screen room-refined ${black?'blackmarket-room':''}"><div class="room-heading"><div><h1>${black?'星辉黑市':'无名行商'}</h1><p>${black?'稀有回响，在此交换。':'「带走一点光。前面的路还很长。」'}</p></div><div class="room-balance">${icon('gold')}<span>持有金币<b>${num(s.player.gold)}</b></span></div></div>${inventoryFull?`<div class="shop-capacity-note"><p>背包已满（${num(s.player.items.length)} 件） · 请先回收或融合闲置装备，再购买新装备。</p>${button('整理背包','inventory','small')}</div>`:''}<div class="shop-grid">${s.shop.filter(o => o.item).map(o => `<article class="shop-item ${RARITIES[o.item.rarity].key} ${o.sold?'offer-sold':''}"><div class="item-meta">${badge(o.item.rarity)}<span>${SLOTS[o.item.slot]}</span></div><h3>${esc(o.item.name)}</h3><span class="shop-depth">Lv.${num(o.item.level)} · +${o.item.enhance} · 来源第 ${num(o.item.depth)} 层</span><p class="shop-effects">${itemEffects(o.item).split(' · ').map(effect=>`<span>${effect}</span>`).join('')}</p>${o.sold?'<span class="muted">购入时属性 · 当前状态见背包</span>':comparison(s, o.item)}${!o.sold?button('比较条件','compare-details','small quiet compare-offer',`data-id="${o.item.id}" aria-label="比较${esc(o.item.name)}的触发条件"`):''}${button(o.sold ? `${icon('check')} 已购入` : inventoryFull ? '背包已满' : `${icon('gold')} ${num(o.price)} <span>购买</span>`, 'buy', '', `data-id="${o.id}" aria-describedby="offer-status-${esc(o.id)}" ${canAct(s, { type: 'buy', id: o.id }) ? '' : 'disabled'}`)}<small class="offer-status" id="offer-status-${esc(o.id)}">${o.sold?'装备已存入背包':inventoryFull?'背包容量已满，请先整理闲置装备':s.player.gold<o.price?`还差 ${num(o.price-s.player.gold)} 金币`:'购买后在背包装备'}</small></article>`).join('')}</div>${heal?`<div class="supply-row"><div><h3>${icon('heart')} 余火补给</h3><p>${heal.sold?'本房间的补给已使用':missingHp<=0?'生命已满，无需补给':`恢复 ${num(missingHp)} 点生命至全满 · 限购一次`}</p></div>${button(heal.sold?'已使用':missingHp<=0?'生命已满':`补满生命 · ${num(heal.price)} 金币`,'buy','small',`data-id="heal" ${canAct(s,{type:'buy',id:'heal'})?'':'disabled'}`)}</div>`:''}<p class="room-hint">本房间商品不会刷新 · 旧装备在换装后保留</p></section>`;
}
const forgeStats = [['attack','攻击'],['hp','生命'],['defense','防御']];
const forgeRange = values => {
 const min=Math.min(...values),max=Math.max(...values);
 return min===max?num(min):`${num(min)}–${num(max)}`;
};
function forgeForecast(preview) {
 const shown=forgeStats.filter(([key])=>Object.hasOwn(preview.before.stats,key));
 const flat=preview.outcomes.every(outcome=>!outcome.changes.length);
 return `<div class="forge-forecast" aria-label="本件装备的强化收益预览"><div class="forge-forecast-heading"><h3>这一锤，能带来什么</h3><span>${preview.capped?'已达上限':'本次可能结果'}</span></div><dl class="forge-stat-forecast">${shown.map(([key,label])=>`<div data-forge-stat="${key}"><dt>本件${label}</dt><dd><span>${num(preview.before.stats[key])}</span><i aria-hidden="true">→</i><strong>${forgeRange(preview.outcomes.map(outcome=>outcome.after.stats[key]))}</strong></dd><small>${preview.capped?'保持不变':`增加 ${forgeRange(preview.outcomes.map(outcome=>outcome.after.stats[key]-preview.before.stats[key]))}`}</small></div>`).join('')}</dl><p class="forge-forecast-note">${preview.capped?'此件已锻至极限，可换一件继续强化。':flat?'本次属性取整后不变；强化等级仍会增加。':'预览为本件装备属性；实战还受天赋与触发条件影响。'}</p></div>`;
}
function forgeView(s,ui) {
 const slot=ui.forgeSlot||'weapon',target=s.player.items.find(i=>i.id===s.player.equipped[slot]);
 const preview=target?forgePreview(s,target.id):null,cost=preview?.cost||0,remaining=preview?.remaining||0,last=!ui.forging&&s.lastForge&&!s.lastForge.fusion?s.lastForge:null;
 return `<section class="room-screen forge-screen room-refined level-forge-screen forge-preview-screen"><div class="room-heading"><div><h1>余烬锻炉</h1><p>看清收益，再把金币投进火中。</p></div><div class="room-balance">${icon('gold')}<span>持有金币<b>${num(s.player.gold)}</b></span></div></div><div class="slot-tabs" aria-label="选择强化装备位">${Object.entries(EQUIP_SLOTS).map(([k,n])=>button(n,'forge-slot',slot===k?'active':'',`data-slot="${k}" aria-pressed="${slot===k}" ${ui.busy?'disabled':''}`)).join('')}</div>${target&&preview?`<div class="forge-target ${RARITIES[target.rarity].key}"><div class="forge-item-heading">${badge(target.rarity)}<h2>${esc(target.name)}</h2><span>Lv.${num(target.level)} <b>+${target.enhance}</b> / +${ENHANCE_CAP} · 等级进度 ${itemProgress(target)}</span></div><div class="forge-decision"><div class="forge-dice">${dice([ui.forging?ui.rollValues?.[0]||6:last?.value||6],{rolling:ui.forging,critical:last?.value>=5})}</div>${forgeForecast(preview)}</div><div class="forge-rule forge-six-outcomes" aria-label="六个点数的实际强化结果">${preview.outcomes.map(outcome=>`<span class="${outcome.value>=5?'high-outcome':''}" data-forge-face="${outcome.value}">${outcome.value} 点 <b>+${outcome.gain}</b><small>→ +${outcome.after.enhance}</small><span class="forge-face-stats">${forgeStats.filter(([key])=>Object.hasOwn(preview.before.stats,key)).map(([key,label])=>`<small>${label} ${num(outcome.after.stats[key])}<em>${outcome.after.stats[key]===preview.before.stats[key]?'不变':`+${num(outcome.after.stats[key]-preview.before.stats[key])}`}</em></small>`).join('')}</span></span>`).join('')}</div><div class="forge-spend">${button(remaining<=0?'已达强化上限':`投骰强化 · ${num(cost)} 金币`,'forge','primary',`data-id="${target.id}" aria-describedby="forge-availability" ${!ui.busy&&canAct(s,{type:'forge',id:target.id})?'':'disabled'}`)}<p id="forge-availability" class="forge-availability ${remaining>0&&!preview.affordable?'danger':''}">${remaining<=0?'此件无需再支付金币':preview.costExceedsGoldCap?'本件强化费用超过金币持有上限，请更换装备。':!preview.affordable?`还差 ${num(cost-s.player.gold)} 金币。`:`支付后余额 <strong>${num(s.player.gold-cost)}</strong> 金币`}</p></div><details class="forge-item-details"><summary>当前属性与强化规则</summary><p>${itemEffects(target)}</p><p>幸运、暴击、追击和条件词条不随 +N 增加。面板数值按实际规则取整，部分低阶强化可能暂不增加属性。</p><p>于第 ${num(target.depth)} 层获得 · 不失败、不降级 · 强化只属于单件装备 · Lv. 与等级进度保持不变</p></details></div>`:`<div class="room-empty">${icon('inventory')}<h2>${EQUIP_SLOTS[slot]}尚未装备</h2><p>先从背包选择一件，再回来强化。</p>${button('打开背包','inventory','small',`data-slot="${slot.startsWith('relic')?'relic':slot}"`)}</div>`}${last?`<div class="forge-result" role="status">${icon('check')} ${last.value} 点 · ${esc(last.name)} <b>强化 +${last.gain}</b></div>`:''}</section>`;
}
export function fusionOutcomeTable(preview,compact=false) {
 return `<div class="fusion-outcomes level-fusion-outcomes ${compact?'compact':''}" role="table" aria-label="六面融合的实际等级和进度"><div class="fusion-level-row outcome-heading" role="row"><span role="columnheader">保留目标 · 当前 Lv. / 进度</span>${preview.outcomes.map(o=>`<b class="${o.value>=5?'high-outcome':''}" role="columnheader">${o.value} 点<small>×${o.boost}</small></b>`).join('')}</div>${preview.targets.map((t,i)=>`<div class="fusion-level-row" role="row"><span role="rowheader"><strong>${esc(t.name)}</strong><small>Lv.${num(t.level)} · ${itemProgress(t)} · +${t.enhance} 保留</small></span>${preview.outcomes.map(o=>{const u=o.upgrades[i];return `<b class="${o.value>=5?'high-outcome':''}" role="cell" title="${o.value} 点：获得 ${num(u.xp)} 装备经验，Lv.${u.before.level} → Lv.${u.after.level}；强化 +${t.enhance} 不变">Lv.${num(u.after.level)}<small class="xp-gain">+${num(u.xp)} XP</small><small>${num(u.after.levelXp)} / ${num(levelXpNeeded(u.after.level))}</small></b>`;}).join('')}</div>`).join('')}<div class="fusion-level-row outcome-total" role="row"><span role="rowheader">装备经验合计 · ${preview.materials.length} 件材料</span>${preview.outcomes.map(o=>`<b class="${o.value>=5?'high-outcome':''}" role="cell">${num(o.total)}</b>`).join('')}</div></div>`;
}
const fusionHelpers = {esc,num,icon,button,dice,itemEffects,itemSummary,itemProgress,comparison};
export function fusionView(s,ui,preparedModel) { return fusionWorkbenchView(s,ui,fusionHelpers,preparedModel); }
export function fusionItemTooltip(s,ui,item) { return fusionTooltip(s,ui,item,fusionHelpers); }
function sanctuaryView(s,ui) {
 const rest=s.phase==='rest';
 const st=stats(s), ward=Math.max(s.ward||0,Math.round(st.maxHp*.25)), value=s.roomUsed?s.lastForge?.value:6;
 return `<section class="room-screen sanctuary-screen room-refined ${rest?'rest-room':'altar-room'}"><div class="room-heading"><div><h1>${rest?'余火营地':'命运祭坛'}</h1><p>${rest?'在余火旁，整理下一次出发。':'让这一层的每一次落骰，都更有分量。'}</p></div><span class="room-use-state ${s.roomUsed?'claimed':''}">${s.roomUsed?`${icon('check')} 已领取`:'本房间 · 一次馈赠'}</span></div>${rest?`<div class="sanctuary-emblem" aria-hidden="true">${icon('rest')}</div><dl class="sanctuary-benefits"><div><dt>生命</dt><dd>${num(s.player.hp)} <span>→</span> ${num(st.maxHp)}</dd></div><div><dt>${s.roomUsed?'当前护盾':'休整护盾'}</dt><dd>${num(s.roomUsed?s.ward:ward)} <small>${s.roomUsed?'':(s.ward||0)>Math.round(st.maxHp*.25)?'保留更强护盾':'至少生命上限的 25%'}</small></dd></div></dl>`:`${dice([ui.forging?ui.rollValues?.[0]||6:value||6],{large:true,rolling:ui.forging})}<dl class="sanctuary-benefits"><div><dt>祝福收益</dt><dd>伤害 +5%～30%</dd></div><div><dt>当前本层加成</dt><dd>+${(s.blessing||0)*5}%</dd></div></dl>`}${button(s.roomUsed?'馈赠已领取':rest?'休整 · 恢复生命与护盾':'投骰 · 领取本层祝福',rest?'rest':'bless','primary',s.roomUsed||ui.busy?'disabled':'')}<p class="room-hint">${rest?'护盾优先吸收反击伤害 · 休整保留更强的现有护盾':'每点骰面增加 5% 伤害 · 本层有效，进入下一层结束'}<br>${s.roomUsed?'可以继续前往下一房间。':'可以领取后前行，也可以直接离开。'}</p></section>`;
}
function inventoryView(s, ui, selectedItems) {
  const query=inventoryQuery(ui.inventoryQuery),defense=inventoryDefense(ui.inventoryDefense);
  const defenseLabel=INVENTORY_DEFENSE_FILTERS.find(filter=>filter.key===defense)?.label;
  const hasFilter=!!query||!!defense||!!ui.inventorySlot||(ui.inventoryRarity!=null&&ui.inventoryRarity!=='');
  const criteria=[SLOTS[ui.inventorySlot],ui.inventoryRarity!=null&&ui.inventoryRarity!==''?RARITIES[Number(ui.inventoryRarity)]?.name:'',defenseLabel,query?`名称含「${query}」`:''].filter(Boolean);
  const defenseNote={regen:'存活恢复：每次战斗掷骰结算后仍存活时恢复生命；不含特定骰面或击杀触发的恢复。',barrier:'开战护盾：进入战斗或重燃时获得；不含共鸣等条件护盾，现在换装不会立即补盾。',reduction:'基础减伤：常态降低反击伤害；不包含低血量触发的临界减伤。'}[defense];
  // Only equipped items contribute to a build comparison. Keep all other state
  // and the complete inventory for actions, but do one read-only selection per
  // render instead of rescanning a large bag for every stat on every card.
  const equipped=new Set(equippedIds(s)),comparisonState={...s,player:{...s.player,items:s.player.items.filter(item=>equipped.has(item.id))}};
  const sortLabel=ui.inventorySort==='rarity'?'品质优先':ui.inventorySort==='level'?'等级优先':'装备强度';
  const items = selectedItems ?? selectInventoryItems(s.player.items,ui);
  const pageCount=Math.max(1,Math.ceil(items.length/60)), page=Math.min(pageCount-1,Math.max(0,Math.floor(Number(ui.inventoryPage)||0)));
  const visibleItems=items.slice(page*60,(page+1)*60);
  const comparisons=compareEquipmentBatch(comparisonState,visibleItems.filter(item=>!equipped.has(item.id)));
  let comparisonIndex=0;
  const cards=visibleItems.map(item=>itemCard(s,item,true,comparisonState,equipped.has(item.id)?undefined:comparisons[comparisonIndex++])).join('');
  return `<section class="collection-screen inventory-screen room-refined"><div class="collection-heading"><div><h1>随身行囊</h1><p>新的力量，旧的回响。</p></div><span>${s.player.items.length} 件装备 <small>已装备 ${equippedIds(s).length} / 5</small></span></div><div class="slot-tabs" aria-label="装备分类">${button(`全部 <small>${s.player.items.length}</small>`, 'filter', !ui.inventorySlot ? 'active' : '', 'data-slot=""')}${Object.keys(SLOTS).map(slot => button(`${SLOTS[slot]} <small>${s.player.items.filter(i=>i.slot===slot).length}</small>`, 'filter', ui.inventorySlot === slot ? 'active' : '', `data-slot="${slot}"`)).join('')}</div><div class="v5-inventory-filters"><label>品质<select id="inventory-rarity"><option value="">全部八档</option>${RARITIES.map((r,i)=>`<option value="${i}" ${String(ui.inventoryRarity)===String(i)?'selected':''}>${r.name}</option>`).join('')}</select></label><label class="inventory-defense-filter" for="inventory-defense">生存词条<select id="inventory-defense" aria-describedby="inventory-defense-help inventory-search-result"><option value="">不限词条</option>${INVENTORY_DEFENSE_FILTERS.map(filter=>`<option value="${filter.key}" ${defense===filter.key?'selected':''}>${filter.label}</option>`).join('')}</select></label><label>排序<select id="inventory-sort">${[['power','装备强度'],['rarity','品质优先'],['level','等级优先']].map(([k,v])=>`<option value="${k}" ${ui.inventorySort===k?'selected':''}>${v}</option>`).join('')}</select></label><span>传说及以上默认受保护</span></div><form id="inventory-search" class="inventory-search" role="search" aria-label="背包装备名称搜索"><div class="inventory-search-row"><label for="inventory-query">装备名称</label><input id="inventory-query" type="search" maxlength="64" autocomplete="off" spellcheck="false" placeholder="输入名称后按回车" value="${esc(ui.inventoryQueryDraft??query)}" aria-describedby="inventory-search-result"><button id="inventory-search-submit" type="submit" class="small">搜索</button>${button('清除名称','inventory-query-clear','small quiet','type="button"')}</div><p id="inventory-search-result" class="inventory-search-result">${criteria.length?`${esc(criteria.join(' · '))} · 找到 <b>${num(items.length)}</b> 件`:`可与装备位、品质、生存词条组合筛选 · 当前 <b>${num(items.length)}</b> 件`}</p></form><div class="inventory-reclaim"><span>全背包检查（不受搜索与筛选影响）<br>仅回收弱于当前装备的普通 / 稀有旧装<br>已装备、锁定和本次战利品会保留</span>${button('检查可回收旧装','salvage-preview','small','aria-haspopup="dialog" title="先查看物品与金币，确认后回收"')}</div><div class="inventory-guidance"><p>当前排序：${sortLabel} · 品质、Lv. 与 +N 各自保留</p><span id="inventory-defense-help" class="inventory-defense-help">${defenseNote?`${defenseNote} 筛选装备自身词条；换装后的生效数值与上限见「比较条件」。`:ui.inventorySlot==='relic'?'遗物优先填空位；满槽按最弱遗物比较，换装时选择替换位。可按生存词条筛选装备自身效果。':'生存词条按装备自身效果筛选；可以组合名称、装备位和品质，再比较条件与上限。'}</span></div><div class="inventory-list" aria-label="装备列表">${cards||`<div class="room-empty">${icon('inventory')}<h2>${s.player.items.length?'暂无符合筛选的装备':'背包暂时为空'}</h2><p>${s.player.items.length?'试试清除名称、装备位、品质与生存词条条件，查看背包中的其他装备。':'战斗后的宝箱与行商处都能获得装备。'}</p><div class="empty-filter-actions">${hasFilter?button('清除筛选','inventory-reset','small'):''}${button('继续探索','game','small')}</div></div>`}</div><div class="inventory-pagination"><span>${items.length?`${page*60+1}–${Math.min(items.length,(page+1)*60)} / ${items.length} 件`:'0 件装备'}</span><div>${button('上一页','inventory-page','small',`data-page="${page-1}" ${page===0?'disabled':''}`)}<span>第 ${page+1} / ${pageCount} 页</span>${button('下一页','inventory-page','small',`data-page="${page+1}" ${page+1>=pageCount?'disabled':''}`)}</div></div><p class="inventory-lock-note">${icon('lock')} 锁定装备会被安全批量融合跳过 · Lv. 与强化 +N 都跟随单件装备</p></section>`;
}
function talentView(s,ui) {
 const group=Object.hasOwn(TALENT_GROUPS,ui.talentGroup)?ui.talentGroup:'high',count=talentInvestmentCount(ui.talentCount);
 const groupCopy={high:'高点更强，汇聚落骰之力。',resonance:'同点成阵，让每次共鸣更响。',critical:'锋芒乍现，接续最后一击。',vitality:'余火不灭，向更深处前行。',luck:'高点与同点，都多一分期待。'};
 const glyphs={high:'焰',four:'肆',five:'伍',six:'陆',sum:'盈',power:'刃',resonance:'鸣',pair:'双',triple:'叁',quartet:'轰',choir:'众',echo:'音',critical:'锋',keen:'锐',crush:'破',pursuit:'逐',opener:'先',slayer:'王',vitality:'生',guard:'御',leech:'汲',recovery:'烬',fortune:'金',smith:'铸',luck:'运',attune:'引',omen:'兆',mercy:'微',jackpot:'赠',spark:'映'};
 const branchCount=Object.keys(TALENT_GROUPS).length,nodeCount=Object.keys(TALENTS).length,branchWord=['','','二','三','四','五','六'][branchCount]||String(branchCount);
 const centers=branchCount===5?{high:[50,20],resonance:[20,43],critical:[80,43],vitality:[32,78],luck:[68,78]}:{high:[50,20],resonance:[22,50],critical:[78,50],vitality:[50,80]};
 const radiusX=branchCount===5?9:12,radiusY=branchCount===5?11:12.5;
 const groups=Object.entries(TALENT_GROUPS).map(([key,name])=>{
  const [x,y]=centers[key],nodes=Object.entries(TALENTS).filter(([id,t])=>t.group===key&&!DEEP_TALENTS[id]).map(([id,t],i)=>{
   const angle=(-90+i*60)*Math.PI/180;
   return {id,t,rank:talent(s,id),orientation:i===0?'north':i===3?'south':i<3?'east':'west',x:x+Math.cos(angle)*radiusX,y:y+Math.sin(angle)*radiusY};
  });
  return {key,name,x,y,nodes,spent:nodes.reduce((n,node)=>n+node.rank,0),lit:nodes.filter(node=>node.rank>0).length};
 });
 const selected=groups.find(g=>g.key===group),active=Object.values(s.player.talents).filter(n=>n>0).length;
 const links=groups.map(g=>`<g class="branch-${g.key} ${g.key===group?'branch-selected':''}"><path class="destiny-spoke" d="M500 500L${g.x*10} ${g.y*10}"/><ellipse class="destiny-branch-orbit" cx="${g.x*10}" cy="${g.y*10}" rx="${radiusX*10}" ry="${radiusY*10}"/>${g.nodes.map((node,i)=>{const next=g.nodes[(i+1)%g.nodes.length];return `<path class="destiny-link ${node.rank?'lit':''}" d="M${g.x*10} ${g.y*10}L${node.x*10} ${node.y*10}"/><path class="destiny-ring-link ${node.rank&&next.rank?'lit':''}" d="M${node.x*10} ${node.y*10}L${next.x*10} ${next.y*10}"/>`;}).join('')}</g>`).join('');
 const nodeButton=node=>{
  const {preview,maxed,reason,can,beforeEffect,afterEffect}=talentNodePreview(s,ui,node.id);
  const planned=preview?`+${num(preview.count)}`:maxed?'已满':'—';
  const ranks=`${num(node.rank)}${preview?` → ${num(preview.afterRank)}`:` / ${num(node.t.cap)}`}`;
  const label=`${node.t.name}，当前 ${num(node.rank)} 级。${preview?`实际投入 ${num(preview.count)} 点，等级 ${num(node.rank)} 到 ${num(preview.afterRank)}。节点贡献：${beforeEffect}，投入后：${afterEffect}。点击节点后投入。`:reason+'。每点：'+node.t.description}`;
  return button(`<span class="destiny-node-ring"><i aria-hidden="true">${glyphs[node.id]||node.t.name.slice(0,1)}</i>${maxed?`<span class="destiny-node-complete" aria-hidden="true">${icon('check')}</span>`:''}</span><span class="destiny-node-name">${node.t.name}</span><span class="destiny-node-rank">${ranks}</span><span class="talent-node-investment">${planned}</span><span class="talent-node-effect">${esc(beforeEffect)}${preview?` <i>→</i> <b>${esc(afterEffect)}</b>`:''}</span>`,'talent',`destiny-node ${node.rank?'lit':''} ${maxed?'complete':''} node-${node.orientation}`,`data-id="${node.id}" data-count="${count}" data-talent-preview="${node.id}" data-investment="${preview?.count||0}" style="--x:${node.x.toFixed(3)};--y:${node.y.toFixed(3)}" aria-label="${esc(label)}" title="${esc(label)}" ${can?'':'disabled'}`);
 };
 const deepButtons=Object.entries(DEEP_TALENTS).filter(([,t])=>t.group===group).map(([id,t])=>{
  const {rank,preview,reason,can,beforeEffect,afterEffect}=talentNodePreview(s,ui,id);
  return button(`<span class="v5-talent-depth">${s.floor>=t.floor?'已解锁':`第 ${t.floor} 层解锁`} · ${num(rank)} / ${t.cap}</span><strong>${t.name}<b class="talent-deep-investment">${preview?`实际 +${num(preview.count)} 点`:'—'}</b></strong><span class="talent-deep-rank">${preview?`等级 ${num(rank)} → ${num(preview.afterRank)}`:reason}</span><small>${esc(beforeEffect)}${preview?` <i>→</i> <em>${esc(afterEffect)}</em>`:''}</small>`,'talent',`v5-talent ${rank?'lit':''}`,`data-id="${id}" data-count="${count}" data-talent-preview="${id}" data-investment="${preview?.count||0}" aria-label="${esc(t.name+'。'+(preview?`实际投入 ${num(preview.count)} 点，等级 ${num(rank)} 到 ${num(preview.afterRank)}。${beforeEffect}，投入后：${afterEffect}。点击节点后投入。`:reason+'。'+t.description))}" ${can?'':'disabled'}`);
 }).join('');
 return `<section class="collection-screen talent-screen room-refined destiny-screen" data-branches="${branchCount}">
  <div class="collection-heading"><div><h1>命运网络</h1><p>${branchWord}道回响 · ${active} / ${nodeCount} 节点已点亮</p></div><span class="talent-points">可用天赋点 <b data-talent-points>${num(s.player.talentPoints)}</b></span></div>
  <div class="talent-allocation"><div class="talent-count-row"><span id="talent-count-label">单次投入</span><div class="talent-count-options" role="group" aria-labelledby="talent-count-label">${[1,5,10,'max'].map(amount=>button(amount==='max'?'本节点最多':`${amount} 点`,'talent-count',`talent-count ${count===amount?'active':''}`,`data-count="${amount}" aria-pressed="${count===amount}" ${ui.busy?'disabled':''}`)).join('')}</div></div><p>选择数量只更新预览，点击节点后投入。<span>最多仅用于所点击的节点。</span><span class="talent-scroll-hint">↓ 滚动查看深层节点</span></p></div>
  <nav class="talent-branch-nav" aria-label="选择天赋分支">${groups.map(g=>button(g.name,'talent-group',`branch-${g.key}`,`data-id="${g.key}" aria-pressed="${g.key===group}"`)).join('')}</nav>
  <div id="talent-scroll" class="talent-scroll" tabindex="-1" aria-label="命运节点与分支收益">
   <div class="destiny-map" aria-label="${branchCount}路命运网络，${nodeCount}个节点，深层节点按楼层解锁"><svg class="destiny-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" fill="none" aria-hidden="true"><g class="destiny-orbits"><ellipse cx="500" cy="500" rx="402" ry="453"/><ellipse cx="500" cy="500" rx="285" ry="310"/><path d="M500 36V71M500 929v35M42 500h36M922 500h36M180 180l23 23M797 797l23 23M820 180l-23 23M203 797l-23 23"/>${Array.from({length:48},(_,i)=>{const a=i*Math.PI/24,x=500+Math.cos(a)*402,y=500+Math.sin(a)*453;return `<path d="M${x.toFixed(2)} ${y.toFixed(2)}l${(-Math.cos(a)*(i%4===0?12:5)).toFixed(2)} ${(-Math.sin(a)*(i%4===0?12:5)).toFixed(2)}"/>`;}).join('')}</g>${links}<g class="destiny-core-traces"><path d="m500 420 80 80-80 80-80-80Z m0 20 60 60-60 60-60-60Z"/><path d="M490 411h20M490 589h20M411 490v20M589 490v20"/></g></svg><div class="destiny-core" aria-hidden="true">${icon('dice')}<b>骰之本源</b><small>${branchWord}道回响</small></div>${groups.map(g=>`<div class="destiny-cluster branch-${g.key} ${g.key===group?'selected':''}">${button(`<strong>${g.name}</strong><small>${num(g.spent)} 点 · ${g.lit} / ${g.nodes.length} 点亮</small>`,'talent-group','destiny-branch-title',`style="--x:${g.x};--y:${g.y}" data-id="${g.key}" aria-pressed="${g.key===group}" aria-label="查看${g.name}分支收益"`)}${g.nodes.map(nodeButton).join('')}</div>`).join('')}</div>
   <div class="v5-talent-strip" aria-label="深层天赋">${deepButtons}</div>
   <section class="destiny-brief branch-${group}" aria-label="当前分支收益"><div class="destiny-brief-heading"><h2>${TALENT_GROUPS[group]}</h2><span>${groupCopy[group]}</span><b>${num(selected.spent)} 点已投入</b></div><dl class="destiny-effect-list">${selected.nodes.map(node=>{const {preview,beforeEffect,afterEffect}=talentNodePreview(s,ui,node.id);return `<div class="${node.rank?'lit':''}"><dt>${node.t.name}<small>${num(node.rank)}${preview?` → ${num(preview.afterRank)} · +${num(preview.count)} 点`:' 级'}</small></dt><dd><span>${esc(beforeEffect)}</span>${preview?`<b>→ ${esc(afterEffect)}</b>`:''}</dd></div>`;}).join('')}</dl><p class="talent-contribution-note">此处为节点累计贡献；战斗触发条件、概率与幸运上限仍按当前规则结算。</p></section>
   <p class="room-hint">基础节点无前置 · 深层节点在 30 / 50 / 80 层解锁 · 每次升级获得 2 点</p>
  </div>
  <section id="talent-preview" class="talent-preview" aria-label="节点投入预览" aria-live="polite" aria-atomic="true">${talentInspectorView(s,ui)}</section>
 </section>`;
}
// The same fragment is used in the pending room and its confirmation dialog.
// Exact numerals matter for a permanent clipping decision; do not abbreviate
// a large value with the general-purpose compact HUD formatter.
export function memorywellPreviewView(s) {
 const preview=memorywellPreview(s);if(!preview)return '';
 const {before,after,canReset,costGold,goldShortfall,refundPoints,hpLost,reason}=preview;
 const exact=n=>Number(n).toLocaleString('en-US');
 const row=(key,label,oldValue,newValue,note,tone='')=>`<div data-memorywell-row="${key}"><dt>${label}</dt><dd><span class="memorywell-before"><span class="sr-only">${canReset?'重置前':'当前'} </span>${exact(oldValue)}</span><span class="memorywell-arrow" aria-hidden="true">→</span><strong class="${canReset?tone:''}"><span class="sr-only">${canReset?'重置后':'清空天赋后的理论数值'} </span>${newValue===null?'无法提交':exact(newValue)}</strong><small>${note}</small></dd></div>`;
 return `<section class="memorywell-preview" aria-label="天赋重置数值预览" data-memorywell-preview data-can-reset="${canReset}"><h2>重置预览</h2>${canReset?'':`<p class="memorywell-unavailable">当前无法重置：${esc(reason)}。以下仅为清空天赋后的数值对照，当前无法提交。</p>`}<dl class="memorywell-values">${row('hp','当前生命',before.hp,after.hp,hpLost?`裁减 ${exact(hpLost)} 生命`:'当前生命保留',hpLost?'memorywell-loss':'')}${row('maxHp','生命上限',before.maxHp,after.maxHp,'按清空天赋后的当前装备计算')}${row('talentPoints','可分配天赋点',before.talentPoints,after.talentPoints,`${canReset?'返还':'理论返还'} ${exact(refundPoints)} 点`,'memorywell-refund')}${row('gold','金币余额',before.gold,after.gold,goldShortfall?`还差 ${exact(goldShortfall)} 金币`:`${canReset?'支付':'需支付'} ${exact(costGold)} 金币`)}</dl><p class="memorywell-note">${hpLost?'重新加点不会补回已裁减的生命。':'重置与重新加点都不会恢复当前生命。'}装备与已有护盾保留。</p></section>`;
}
// Quotes come from the action's read-only reward rules. The accepted amount is
// measured before level conversion, never from the final XP balance difference.
export function experiencePreviewView(s, choice) {
 const quote=choice?.experience;if(!quote)return '';
 const capacity=XP_CAP-quote.beforeXp,levelCapped=s.player.level>=LEVEL_CAP;
 const row=(key,label,value)=>`<div data-experience-row="${key}"><dt>${label}</dt><dd>${goldNum(value)}</dd></div>`;
 const status=quote.overflowXp?(quote.creditedXp?'部分计入':'本次计入为 0'):'全部计入';
 const explanation=levelCapped?'角色已达等级上限；计入只增加经验余额，不再触发升级。':'可计入量在升级消耗前计算；升级后经验余额可能减少。';
 return `<section class="experience-preview${quote.overflowXp?' experience-limited':''}" aria-label="${esc(choice.label)}经验预览" data-experience-preview data-experience-choice="${esc(choice.id)}" data-experience-overflow="${quote.overflowXp}"><h2>${esc(choice.label)} · 经验预览<span>${status}</span></h2>${choice.disabled?`<p class="experience-unavailable">当前无法提交：${esc(choice.reason)}。以下为这项选择的经验报价。</p>`:''}<dl class="experience-values">${row('raw','本次原额',quote.rawXp)}${row('credited','可计入',quote.creditedXp)}${row('overflow','上限未计入',quote.overflowXp)}</dl><p class="experience-capacity">当前剩余容量 <strong>${goldNum(capacity)}</strong> · 余额上限 ${goldNum(XP_CAP)}</p><p class="experience-note">${explanation}${quote.overflowXp?'上限未计入的经验不会保留，也不会在升级后补回。':''}</p></section>`;
}

// At the level cap this bar describes saved XP capacity, not a fictional next
// level. Valid imported balances above a level threshold are settled by the next
// real XP action, so rendering only explains that pending conversion.
export function playerExperienceView(s) {
 const {level,xp}=s.player,levelCapped=level>=LEVEL_CAP,threshold=xpNeeded(level),pending=!levelCapped&&xp>=threshold;
 const maximum=levelCapped?XP_CAP:threshold,value=Math.min(maximum,Math.max(0,xp)),percent=value/maximum*100;
 const label=levelCapped?'等级上限':pending?'待结算升级':'旅途之人';
 const detail=levelCapped?`已达等级上限 ${num(LEVEL_CAP)}。经验余额 ${num(xp)}，剩余容量 ${num(XP_CAP-xp)}。${xp===XP_CAP?'经验余额已满，新增经验无法计入。':'新增经验不再触发升级。'}`:pending?`当前经验 ${num(xp)}，已达到升级所需的 ${num(threshold)}。现有经验将在下次经验结算时用于升级。${xp===XP_CAP?'经验余额已满，新收入先按余额上限计入，再结算升级。':''}`:`当前经验 ${num(xp)} / ${num(threshold)}，距离 Lv.${num(level+1)} 还需 ${num(threshold-xp)} 经验。`;
 return `<div class="player-level"${levelCapped?' data-level-capped="true"':''}${xp===XP_CAP?' data-xp-capped="true"':''}${pending?' data-level-pending="true"':''} title="${esc(detail)}"><b><small>Lv.</small>${num(level)}</b><span>${label}</span><div class="xp-track" role="progressbar" aria-label="${levelCapped?'经验余额容量':'角色升级进度'}" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${value}" aria-valuetext="${esc(detail)}"><span style="width:${percent}%" aria-hidden="true"></span></div><small>${levelCapped?'余额 ':''}${num(xp)} / ${num(maximum)} EXP</small></div>`;
}
const riskPercent = probability => probability===0?'0%':probability<.0001?'&lt;0.01%':`${(probability*100).toFixed(2)}%`;
const riskRange = range => range.min===range.max?goldNum(range.min):`${goldNum(range.min)}–${goldNum(range.max)}`;
const riskPrize = outcome => outcome.rarityFloor===null?'半价返还':`${outcome.rarityFloor===outcome.rarityCeiling?'':'至少'}${RARITIES[outcome.rarityFloor].name}宝箱`;

// Probability is a preview of public rules, not a prediction of the saved RNG.
// All balances stop at the event choice; a later chest-open has its own receipt.
function eventRiskChoiceFromQuote(quote) {
 if(!quote)return '';
 if(!quote.available)return `<span class="event-risk-choice is-unavailable">金币不足 · 还差 ${goldNum(Math.max(0,quote.costGold-quote.goldBefore))} 金币</span>`;
 return `<span class="event-risk-choice"><span>净支出 <b>${riskRange(quote.netCostRange)}</b> 金币</span><span>选择后余额 <b>${riskRange(quote.balanceRange)}</b> 金币</span></span>`;
}

export function eventRiskChoiceSummary(s,choiceId) {
 return eventRiskChoiceFromQuote(eventRiskPreview(s,choiceId));
}

function eventRiskFromQuote(s,quote,{review=false,guaranteed=null}={}) {
 if(!quote)return '';const {choiceId}=quote;
 const mode=quote.diceCount===2?'两颗独立愿骰':quote.diceCount===1?'一颗命运骰':'保底交易';
 const shortfall=Math.max(0,quote.costGold-quote.goldBefore);
 const pools=quote.outcomes.filter(outcome=>outcome.rarityFloor!==null).map(outcome=>({label:outcome.rollLabel,outcome}));
 if(!review&&quote.key==='gambit'&&choiceId==='roll'){
  if(guaranteed)pools.push({label:'保底交易',outcome:guaranteed.outcomes[0]});
 }
 return `<section class="event-risk${review?' event-risk-review':''}" data-event-risk="${quote.key}" data-risk-choice="${choiceId}" aria-label="${review?'本次选择的概率与金币':'命运抉择的概率与金币'}"><div class="event-risk-heading"><h2>当前幸运下的概率</h2><span>${mode}</span></div><p class="event-risk-payment">持有 <strong>${goldNum(quote.goldBefore)}</strong> 金币 · 先付 <strong>${goldNum(quote.costGold)}</strong>${quote.available?` · 支付后 <strong>${goldNum(quote.goldAfterPayment)}</strong>`:`<span class="event-risk-shortfall">金币不足 · 还差 ${goldNum(shortfall)} 金币</span>`}</p><table class="event-risk-table"><caption class="sr-only">${mode}的点数、发生概率、结果与即时余额</caption><thead><tr><th scope="col">点数</th><th scope="col">概率</th><th scope="col">选择后结果</th></tr></thead><tbody>${quote.outcomes.map(outcome=>`<tr data-risk-outcome="${outcome.key}"><th scope="row">${esc(outcome.rollLabel)}</th><td class="event-risk-percent">${riskPercent(outcome.probability)}</td><td><strong class="${outcome.rarityFloor===null?'event-risk-refund':RARITIES[outcome.rarityFloor].key}">${riskPrize(outcome)}</strong><small>${outcome.rarityFloor===null?`返还 ${goldNum(outcome.refund.rawGold)} 金币${quote.available?` · 净支出 ${goldNum(outcome.netCostGold)} · 余额 ${goldNum(outcome.goldAfterChoice)}`:'（足额支付后）'}`:quote.available?`余额 ${goldNum(outcome.goldAfterChoice)} 金币 · 宝箱待开启`:'生成宝箱，等待亲手开启'}</small></td></tr>`).join('')}</tbody></table><p class="event-risk-note">${quote.diceCount===2?'两颗骰子各自掷出，同点引导不参与本次许愿。':quote.diceCount===1?'幸运影响各点数的概率；保底交易不投骰。':'保底保证获得宝箱，不保证金币回本。'}宝箱金币在开箱时另行结算。</p><details class="event-risk-distribution"><summary>查看宝箱品质概率</summary><p>达到对应点数后，宝箱品质按下表抽取；各列分别合计 100%。百分比为四舍五入值。</p><table><caption class="sr-only">达到对应点数后的宝箱品质条件概率</caption><thead><tr><th scope="col">品质</th>${pools.map(pool=>`<th scope="col">${esc(pool.label)}</th>`).join('')}</tr></thead><tbody>${RARITIES.map((rarity,index)=>`<tr><th scope="row" class="${rarity.key}">${rarity.name}${s.floor<RARITY_FLOORS[index]?`<small>${RARITY_FLOORS[index]} 层解锁</small>`:''}</th>${pools.map(pool=>`<td>${riskPercent(pool.outcome.rarityProbabilities[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></details></section>`;
}

export function eventRiskView(s,choiceId='roll',{review=false}={}) {
 const quote=eventRiskPreview(s,choiceId);
 const guaranteed=!review&&quote?.key==='gambit'&&choiceId==='roll'?eventRiskPreview(s,'safe'):null;
 return eventRiskFromQuote(s,quote,{review,guaranteed});
}

function eventView(s,ui) {
 const event=eventPresentation(s);if(!event)return '<section class="room-screen"><h1>遭遇尚未揭晓</h1><p>请重新读取已保存的旅途。</p></section>';
 // Share each read-only quote only within this render. Confirmation and later
 // renders call the public helper again from their complete current state.
 const rollRisk=eventRiskPreview(s),safeRisk=rollRisk?.key==='gambit'?eventRiskPreview(s,'safe'):null;
 const options=event.options.filter(o=>o.id!=='leave'),odds=diceOdds(s),memoryPreview=memorywellPreviewView(s),experienceChoice=['memory_archive','starlibrary'].includes(s.event.key)?options.find(o=>o.experience):null,experiencePreview=experiencePreviewView(s,experienceChoice),riskPreview=eventRiskFromQuote(s,rollRisk,{guaranteed:safeRisk});
 return `<section class="room-screen room-refined event-screen ${event.status==='resolved'?'event-resolved':''} ${ui.rolling?'event-rolling':''}${memoryPreview?' memorywell-screen':''}${experiencePreview?' experience-screen':''}${riskPreview?' event-risk-screen':''}"><div class="room-heading"><div><h1>${ui.rolling?'命运正在落定':esc(event.title)}</h1><p>${esc(event.body)}</p></div><div class="event-luck"><span>当前幸运</span><b>${num(odds.luck)}</b><small>单骰 5 / 6 点 ${(odds.highChance*100).toFixed(1)}%</small></div></div>${event.status==='resolved'?`<div class="event-outcome" role="status">${!ui.rolling?`<span class="event-sigil" aria-hidden="true">${icon('check')}</span>`:''}<h2>${ui.rolling?(s.event.rolls?.length===2?'投下这两颗命运骰':'投下这一颗命运骰'):'抉择已落定'}</h2><p>${ui.rolling?'骰子停下后，揭晓本次已保存的结果。':esc(event.outcome)}</p>${s.event.roll||s.event.rolls?`<div class="event-result-die">${dice(s.event.rolls||[s.event.roll],{rolling:ui.rolling})}</div>`:''}</div>`:`${riskPreview||memoryPreview||experiencePreview||eventItemsView(s)||`<div class="event-atmosphere" aria-hidden="true"><svg viewBox="0 0 500 180" fill="none"><ellipse cx="250" cy="90" rx="135" ry="75"/><ellipse cx="250" cy="90" rx="108" ry="58"/><path d="M82 90h55M363 90h55M250 6v30M250 144v30M148 36l25 18M327 126l25 18M352 36l-25 18M173 126l-25 18"/><path d="m250 30 48 60-48 60-48-60Z"/></svg><span>?</span></div>`}${s.event.reward?.item?`<div class="auction-preview ${RARITIES[s.event.reward.item.rarity].key}"><strong>${esc(itemSummary(s.event.reward.item))}</strong><p>${esc(itemEffects(s.event.reward.item))}</p><small>真实奖品 · 已保存 · 刷新不重抽</small></div>`:''}<div class="event-options" data-options="${options.length}">${options.map(option=>button(`<span class="event-option-title"><strong>${esc(option.label)}</strong><small>${option.confirm?'提交前再次确认':option.cost==='无'?'无需代价':'代价见下方'}</small></span><span class="event-option-detail">${esc(option.detail)}</span><span class="event-terms event-cost"><small>代价</small><b>${esc(eventChoiceCost(s,option))}</b></span><span class="event-terms event-reward"><small>获得</small><b>${esc(option.reward)}</b></span>${eventChoicePreviewView(s,option.id)}${eventRiskChoiceFromQuote(option.id==='roll'?rollRisk:option.id==='safe'?safeRisk:null)}${option.disabled?`<span class="event-option-reason">${esc(option.reason)}</span>`:'<span class="event-option-choose">选择此项 →</span>'}`,'event-choice',`event-option ${option.destructive?'requires-confirmation':''}`,`data-id="${option.id}" ${option.disabled||ui.busy?'disabled':''}`)).join('')}</div><p class="room-hint">代价先明示，选择由你决定。也可以使用下方「拒绝并离开」，保留已有资产。</p>`}</section>`;
}
function codexView(s,ui){
 const source=ui.codexSource||'combat',legacy=['boss','hiddenboss'].includes(source)?'boss':source==='blackmarket'?'combat':source;
 const odds=dropOdds(s,source,legacy),category=ui.codexCategory||'combat';
 const rows=ROOM_WEIGHTS.filter(r=>r.slot===category);
 return `<section class="collection-screen codex-screen"><div class="collection-heading"><div><h1>深渊图鉴</h1><p>${eraFor(s.floor).name} · 第 ${num(s.floor)} 层 · 规则来自实际奖池</p></div><strong>V5</strong></div><div class="codex-rarities">${RARITIES.map((r,i)=>`<div class="${r.key} ${s.floor<RARITY_FLOORS[i]?'tier-locked':''}"><b>${r.name}</b><small>${i<4?'起始品质':RARITY_FLOORS[i]+' 层解锁'}</small><strong>×${r.multiplier}</strong></div>`).join('')}</div><div class="codex-odds"><label>基础奖励来源<select id="codex-source">${[['combat','普通战斗'],['elite','精英'],['boss','常规首领'],['hiddenboss','隐藏首领'],['vault','秘藏'],['trial','悬赏']].map(([key,label])=>`<option value="${key}" ${source===key?'selected':''}>${label}</option>`).join('')}</select></label><p>${RARITIES.map((r,i)=>`<span class="${r.key}">${r.name} <b>${(odds[i]*100).toFixed(2)}%</b></span>`).join('')}</p><small>当前楼层、命运与有效幸运下的基础概率。首杀、丰饶宝箱及明确写出的品质保底单独生效；没有隐藏保底计数或免费重投。</small></div><div class="codex-policy"><p>每层：3间战斗 + 1间服务 + 1间事件/奖励 + 1间精英；每五层末房为首领。</p><p>战斗首位固定核心；其余战斗位按55% / 39% / 6%抽池。深层合计约70%核心、26%特色、4%罕见；条件过滤会改变实测比例。事件池73% / 23% / 4%。</p><p>四项服务按连续四层洗牌组各出现一次，两次同类服务最多相隔7层。隐藏首领同组至少相隔8层；主题只改变池内权重，不扩大罕见池总概率。</p></div><label class="codex-category">遭遇分类<select id="codex-category">${[['combat','战斗'],['service','服务'],['event','事件与奖励'],['endpoint','末房']].map(([k,v])=>`<option value="${k}" ${category===k?'selected':''}>${v}</option>`).join('')}</select></label><div class="codex-room-list">${rows.map(r=>`<article><div><strong>${ROOM_NAMES[r.type]}</strong><span>${{core:'核心',special:'特色',rare:'罕见'}[r.pool]} · 第${r.floor}层 · 池内权重${r.weight}</span></div><p>${ROOM_DETAILS[r.type]?.purpose||''}</p><small>${ROOM_DETAILS[r.type]?.reward||''}</small></article>`).join('')}</div><details class="codex-caps"><summary>能力上限与长期边界</summary><p>概率不会无限增加：实际暴击最多90%、追击85%、同点引导25%、闪避35%、减伤65%。幸运100以后软增长至200，溢出额外提供最多50%宝箱金币收益；面板显示有效幸运。</p><p>装备刻印与天赋同规则相加后封顶。三同额外回响最多主击140%，不会递归、再暴击或再追击。当前装备基础属性依旧随Lv.与+N提高。</p><p>角色等级上限1,000,000；装备等级上限10,000,000,000,000；金币上限10,000,000,000；背包上限10,000件。达到金币上限仍可明确确认放弃回收溢出，清理背包后继续开箱。</p></details></section>`;
}
export function defeatReviewView(s) {
 const review=defeatReview(s);if(!review)return '';
 const talentNote=review.talentPoints?review.canInvest?`还有 <strong>${num(review.talentPoints)} 点</strong>天赋可以投入。`:`保留 <strong>${num(review.talentPoints)} 点</strong>未用天赋；当前可用节点已达上限或尚未解锁。`:'当前没有未用天赋点。';
 const inventoryNote=review.availableItems?`背包中有 <strong>${num(review.availableItems)} 件</strong>未装备物品，其中防具 <strong>${num(review.available.armor)} 件</strong>。`:'背包中暂时没有未装备的物品。';
 return `<section class="room-screen death-screen defeat-review" aria-label="战败复盘与备战"><div class="defeat-heading"><span class="room-symbol">${icon('heart')}</span><h1>余火，尚未熄灭。</h1></div><p class="defeat-intro">${esc(review.enemyName)}暂时挡住了去路。成长与战利品仍在。</p><dl class="defeat-snapshot"><div><dt>本次战斗</dt><dd>${num(review.turns)} 掷</dd></div><div><dt>敌人剩余生命</dt><dd>${num(review.enemyHp)} <span>/ ${num(review.enemyMaxHp)}</span></dd></div>${review.lastRoll?`<div class="defeat-last-roll"><dt>最后一掷</dt><dd>对敌生命伤害 ${num(review.lastRoll.hpDamage)} <span>·</span> 所受反击 ${num(review.lastRoll.retaliation)}</dd></div>`:''}</dl><section class="defeat-prepare" aria-labelledby="defeat-prepare-title"><h2 id="defeat-prepare-title">重燃前，整理构筑</h2><p>${inventoryNote} ${talentNote}</p><div class="defeat-actions">${review.available.armor?button('调整防具','inventory','defeat-armor','data-slot="armor" data-reset-rarity="true"'):''}${button('打开背包','inventory','','data-slot="" data-reset-rarity="true"')}${button(review.canInvest?'投入天赋':'查看天赋','talents')}</div>${review.availableItems?'<p class="defeat-comparison-note">在背包用「生存词条」找到存活恢复、开战护盾或基础减伤，再查看「比较条件」。基础估值不能保证这一战的存活结果。</p>':''}</section>${review.warning||review.counterplay||review.phaseNote?`<section class="defeat-tactics" aria-labelledby="defeat-tactics-title"><h2 id="defeat-tactics-title">敌方机制回顾</h2>${review.warning?`<p><b>特性</b>${esc(review.warning)}</p>`:''}${review.phaseNote?`<p><b>换相</b>${esc(review.phaseNote)}</p>`:''}${review.counterplay?`<p class="defeat-counterplay"><b>应对</b>${esc(review.counterplay)}</p>`:''}</section>`:''}<div class="recovery-summary"><h2>在当前房间重燃余火</h2><p>重燃不消耗金币，按重燃时的构筑恢复全部生命；敌人从头开始。装备、金币、天赋和已完成的房间全部保留。</p><p>现有护盾与下一掷临时幸运不继承；开战护盾按当前构筑重新计算。</p><p class="defeat-services">购物、锻造、融合与洗点需要对应房间。当前可以换装、投入可用天赋，或重燃后继续挑战。</p></div></section>`;
}
export function center(s, ui, boons, inventorySelection) {
  if (ui.view === 'codex') return codexView(s,ui);
  if (ui.view === 'inventory') return inventoryView(s, ui, inventorySelection);
  if (ui.view === 'talents') return talentView(s,ui);
  switch (s.phase) {
    case 'fate': case 'route': return fateView(s, ui);
    case 'combat': return combatView(s, ui, boons);
    case 'chest': return chestView(s);
    case 'loot': return lootView(s);
    case 'blackmarket': case 'merchant': return merchantView(s);
    case 'event': return eventView(s,ui);
    case 'forge': return forgeView(s, ui);
    case 'fusion': return fusionView(s,ui);
    case 'altar': case 'rest': return sanctuaryView(s,ui);
    case 'gold': return goldRoomView(s);
    case 'dead': return defeatReviewView(s);
    case 'cleared': case 'complete': return `<section class="room-screen milestone-screen"><span class="victory-mark">${s.phase === 'complete' ? 'ABYSS CONQUERED' : 'FLOOR CLEARED'}</span><h1>${s.phase === 'complete' ? '你让永夜，听见了回响。' : '再深一层。'}</h1><p>${s.phase === 'complete' ? '前十层已征服。命运的故事，仍由你继续。' : `${floorName(s)}已肃清。前方，还有尚未打开的宝箱。`}</p><div class="floor-number">${String(s.floor).padStart(2, '0')}<span>深度已抵达</span></div>${s.phase === 'complete' ? `<div class="milestone-stats"><span>${s.counters.kills} 次胜利</span><span>${s.counters.chests} 次开箱</span><span>${num(s.counters.highestDamage)} 最高伤害</span></div>` : ''}<p class="room-hint">进入下一层时恢复全部生命。${s.floor >= 10 ? '新的主题、首领与装备将持续出现。没有终层。' : ''}</p></section>`;
    default: return '';
  }
}
export function primaryAction(s, ui) {
  if (ui.view !== 'game') return { label: '返回地牢', type: 'game', hint: '进度已保留' };
  if(s.phase==='event')return s.event?.status==='resolved'?{label:'继续前行',type:'next',hint:'抉择结果已保存'}:{label:'拒绝并离开',type:'event-choice',id:'leave',hint:'不支付代价 · 保留已有资产'};
  if (s.phase==='chest'&&!canAct(s,{type:'open'})) return {label:'整理背包',type:'inventory',hint:'宝箱已保留 · 回收旧装后继续开箱'};
  if(s.phase==='gold'&&s.player.gold===GOLD_CAP)return {label:'继续前行',type:'gold',hint:'金币已满 · 本次可收 0'};
  if(s.phase==='chest'&&goldPreview(s.player.gold,s.chest.gold).overflow)return {label:'打开宝箱',type:'open',hint:'金币受上限限制 · 装备照常领取'};
  const map = { fusion:['离开熔室','next','继续探索'],altar:['继续前行','next','本层祝福'],rest:['离开营地','next','继续探索'],blackmarket:['告别黑市','next','继续探索'], fate: ['决定命运', 'fate', '揭晓本层路线'], route: ['踏入地牢', 'enter', '按顺序探索六个房间'], combat: ['掷骰', 'roll', 'SPACE'], chest: ['打开宝箱', 'open', '金币与装备已在等待'], loot: ['继续前行', 'next', '战利品已保存'], gold: ['收下金币', 'gold', '收下后前往下一房间'], merchant: ['告别行商', 'next', '继续探索'], forge: ['离开锻炉', 'next', '继续探索'], dead: ['重燃余火', 'retry', '保留全部成长'], cleared: ['继续深入', 'descend', '下一层 · 恢复生命'], complete: ['继续挑战', 'descend', '进入进阶深渊'] };
  const [label, type, hint] = map[s.phase]; return { label, type, hint };
}
export function footer(s, ui, st=stats(s)) {
 const action=primaryAction(s,ui);
 return `<footer class="game-footer"><div class="status-strip frame">${playerExperienceView(s)}<div class="player-health"><div>${icon('heart')}<span>生命</span><b>${num(s.player.hp)} / ${num(st.maxHp)}</b></div><div class="player-health-track"><span style="width:${s.player.hp/st.maxHp*100}%"></span></div><p>${icon('shield')} 护盾 ${num(s.ward||0)} · 防御 ${st.defense}</p></div><div class="player-gold"${s.player.gold===GOLD_CAP?' data-gold-capped="true"':''}>${icon('gold')}<span>金币${s.player.gold===GOLD_CAP?' · 已达上限':''}<strong title="${goldNum(s.player.gold)} 金币">${num(s.player.gold)}</strong></span><small>攻击 ${st.attack}　·　暴击 ${Math.round(Math.min(.9,st.crit+st.critBonus)*100)}%</small></div></div><div class="control-strip"><nav class="main-nav" aria-label="主要导航">${button(`${icon('inventory')}<span>背包</span>`,'inventory',ui.view==='inventory'?'selected':'')}${button(`${icon('talent')}<span>天赋${s.player.talentPoints?`<i>${s.player.talentPoints}</i>`:''}</span>`,'talents',ui.view==='talents'?'selected':'')}</nav><div class="primary-control">${button(`${icon(action.type==='roll'||action.type==='fate'?'dice':action.type==='open'?'chest':'arrow')}<span>${ui.busy?'命运落定中…':action.label}</span>`,action.type,'primary',`${ui.busy?'disabled':''} id="primary-action" ${action.id?`data-id="${action.id}"`:''}`)}<small>${ui.busy?'本次结果已保存':action.hint}</small></div><div class="manual-control">${button(ui.busy?'跳过演出':`${icon('dice')}<span>手动掷骰</span>`,ui.busy?'skip':'game',ui.view==='game'?'selected':'',`aria-current="${ui.view==='game'?'page':'false'}"`)}<small>${diceCount(s)} / 6 战斗骰 · 随时保存</small></div></div></footer>`;
}
export function gameView(s, ui) {
 const workbench=ui.view==='game'&&s.phase==='fusion';
 // Reuse only within this synchronous render. The footer always needs stats;
 // rails and combat share that snapshot and one readout without retaining it.
 const st=stats(s),boons=!workbench&&ui.view!=='talents'?boonReadout(s,st):undefined;
 return `<div class="game-shell${workbench?' fusion-mode':''}" data-scene="${ui.view==='game'?s.phase:ui.view}">${header(s)}<main class="game-layout${workbench?' fusion-layout':''}">${workbench?'':ui.view === 'talents' ? buildRail(s) : routeRail(s,ui,boons)}<div class="center-panel frame ${ui.busy?'busy':''}" id="current-room"><canvas class="scene-fx" aria-hidden="true"></canvas>${center(s,ui,boons)}</div>${workbench?'':ui.view === 'talents' ? buildDetails(s,ui) : ui.view === 'game' && s.phase === 'loot' ? rewardRail(s) : equipmentRail(s,st)}${footer(s,ui,st)}</main><div class="bottomline"><span>VER ${RELEASE_STAMP}　 INFINITE ABYSS</span><span>${ui.saveError?esc(ui.saveError):'进度已自动保存'}</span><span>骰下的不是数字，而是另一个世界。</span></div></div>`;
}
export function settingsView(settings, hasSave, hasLegacy=false, rawOnly=false) {
  return `<div class="dialog-heading"><h2 id="dialog-title">旅途设置</h2>${button(icon('close'), 'close-dialog', 'icon-button', 'aria-label="关闭设置"')}</div><p class="settings-note">设置即时生效 · 保存在当前浏览器</p><div class="setting-row"><div><b>掷骰声音</b><p>简洁的骰声与奖励音。</p></div><button role="switch" aria-label="掷骰声音" aria-checked="${settings.sound}" data-action="sound" class="switch"><span></span></button></div><div class="setting-row"><div><b>加速节奏</b><p>掷骰与结算时间减半，保留标准特效；奖励仍待你确认。</p></div><button role="switch" aria-label="加速节奏" aria-checked="${settings.fastPace===true}" data-action="fast-pace" class="switch"><span></span></button></div><div class="setting-row"><div><b>特效强度</b><p>低特效减少翻滚与粒子，保留点数和结算。</p></div><select id="effects" aria-label="特效强度"><option value="full" ${settings.effects === 'full' ? 'selected' : ''}>标准</option><option value="low" ${settings.effects === 'low' ? 'selected' : ''}>低特效</option></select></div><div class="setting-row"><div><b>界面比例</b><p>按当前窗口同步缩放文字与布局。</p></div><select id="ui-scale" aria-label="界面比例">${[0.9, 1, 1.1].map(v => `<option value="${v}" ${settings.scale === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></div><div class="save-management"><h3>存档管理</h3>${rawOnly?'<p class="danger">当前存档无法安全读取。导出会保留原始字节，供备份或人工转换；不会改写浏览器记录。</p>':''}<p>进度自动保存在当前浏览器。导出 JSON 可备份或迁移；导入前会再次确认。</p><div>${button(rawOnly?'导出不可读取的原始存档':'导出存档', 'export', '', hasSave ? '' : 'disabled')}${button('导入存档', 'import', '')}${button('返回标题', 'home', '')}</div>${hasLegacy?`<div class="legacy-backup"><p>保留升级前的原始格式，可用于回退到旧版。</p>${button('导出升级前原始存档','export-legacy','')}</div>`:''}<section class="save-capacity" aria-labelledby="save-capacity-heading"><div class="save-capacity-header"><h4 id="save-capacity-heading">存档文件大小</h4>${button('检查容量','save-capacity','small',`aria-controls="save-capacity-result" ${hasSave&&!rawOnly?'':'disabled'}`)}</div><div id="save-capacity-result" class="save-capacity-result" role="status" aria-live="polite" aria-atomic="true"><p>${hasSave&&!rawOnly?'按需检查当前进度的文件大小和增长余量。':'读取到有效进度后可检查容量。'}</p></div></section><section id="save-import-result" class="save-import-result" tabindex="-1" aria-live="polite" aria-atomic="true" hidden></section><input type="file" id="save-file" accept="application/json,.json" aria-describedby="save-import-result" hidden></div><div class="danger-zone"><span>重新开始会替换当前进度</span>${button('重新开始', 'new', 'danger quiet')}</div>`;
}
