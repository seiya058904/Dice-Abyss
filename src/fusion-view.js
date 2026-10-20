import { RARITIES, SLOTS } from './content.js';
import { ABILITY_DEFS } from './deep-content.js';
import { itemStats, fusionMaterialXp, fusionCostSummary, levelXpNeeded, MAX_ITEM_LEVEL } from './equipment.js';
import { GOLD_CAP } from './engine.js';
import { fusionWorkbenchModel, FUSION_PAGE_SIZE } from './fusion-workbench.js';

const slotIcon = slot => slot === 'weapon' ? 'combat' : slot === 'armor' ? 'shield' : 'altar';
const statNames = {
  attack:'攻击', hp:'生命', defense:'防御', luck:'幸运', crit:'暴击率', follow:'追击率',
  critBonus:'额外暴击率', followBonus:'额外追击率', critDamage:'暴击倍率',
  fourBonus:'4 点伤害', fiveBonus:'5 点伤害', sixBonus:'6 点伤害', pairBonus:'共鸣伤害',
  sumBonus:'总点 ≥18 伤害', bossBonus:'强敌伤害', firstBonus:'首击伤害', pierce:'穿盾',
  reduction:'减伤', dodge:'闪避率', regen:'存活回合恢复', barrier:'开战护盾', pairWard:'共鸣护盾',
  criticalFollow:'共鸣暴击追击率', followDamage:'追击追加主击', goldBonus:'宝箱金币',
  echoChance:'同点引导率', healBonus:'击杀额外恢复',
};
const flatStats = new Set(['attack', 'hp', 'defense', 'luck', 'firstCritLuck', 'eliteLuck']);
const statLabel = key => statNames[key] || ABILITY_DEFS[key]?.text || key;
const statValue = (key, value, num) => key === 'critDamage' ? Number(value || 0).toFixed(2)
  : flatStats.has(key) ? num(value) : `${num(Math.round((value || 0) * 1000) / 10)}%`;

function primaryStats(item) {
  const values = itemStats(item);
  const keys = item.slot === 'armor' ? ['hp', 'defense'] : item.slot === 'relic' && values.luck ? ['luck', 'attack'] : ['attack'];
  return keys.filter(key => values[key]).map(key => ({ key, label:statLabel(key), value:values[key] }));
}

function statLine(item, { num }) {
  return primaryStats(item).map(stat => `<span>${stat.label} <b>${num(stat.value)}</b></span>`).join('');
}

function levelRange(preview, targets, num) {
  if (!targets.length) return '等待保留目标';
  return targets.map((target, index) => {
    const low = preview?.outcomes[0].upgrades[index]?.after.level ?? target.level;
    const high = preview?.outcomes[5].upgrades[index]?.after.level ?? target.level;
    return `Lv.${num(target.level)} → ${num(low)}${high !== low ? `–${num(high)}` : ''}`;
  }).join(' / ');
}

function targetSlots(model, ui, helpers) {
  const { esc, num, icon, button, itemProgress } = helpers;
  const count = model.slot === 'relic' ? 3 : 1;
  return `<section class="fusion-target-bar" aria-labelledby="fusion-target-heading">
    <div class="fusion-target-caption"><h2 id="fusion-target-heading">保留目标</h2><span>${model.targets.length} / ${count}${count > 1 ? ' · 经验均分' : ' · 强化保留'}</span></div>
    <div class="fusion-target-slots" data-slots="${count}">${Array.from({ length:count }, (_, index) => {
      const item = model.targets[index];
      const picking = ui.fusionPickingTarget === index;
      return `<div class="fusion-target-slot ${item ? RARITIES[item.rarity].key : 'is-empty'} ${picking ? 'is-picking' : ''}" data-fusion-drop="${index}">
        ${item ? `${button(`<span class="fusion-target-icon" aria-hidden="true">${icon(slotIcon(item.slot))}</span><span class="fusion-target-info"><strong>${esc(item.name)}</strong><span>${RARITIES[item.rarity].name} · Lv.${num(item.level)} · +${item.enhance} 保留</span><span class="fusion-target-stats">${statLine(item, helpers)}</span></span><span class="fusion-target-kept">${icon('check')} 保留</span>`, 'fusion-pick-target', 'fusion-target-item', `data-index="${index}" data-fusion-tooltip="${esc(item.id)}" aria-label="替换目标 ${esc(item.name)}，当前 Lv.${num(item.level)}，等级进度 ${itemProgress(item)}" ${ui.busy ? 'disabled' : ''}`)}${button(icon('close'), 'fusion-target-remove', 'fusion-target-remove', `data-index="${index}" aria-label="移除保留目标 ${esc(item.name)}" ${ui.busy ? 'disabled' : ''}`)}`
        : button(`<span class="fusion-target-empty-icon" aria-hidden="true">${icon(slotIcon(model.slot))}</span><span><strong>${picking ? '点击一件装备放入' : count > 1 ? `放入第 ${index + 1} 件遗物` : '放入保留目标'}</strong><small>${picking ? '也可拖拽到此槽位' : model.targets.length ? '点击槽位后，从物品池选择' : '点击物品，或拖到这里'}</small></span>`, 'fusion-pick-target', 'fusion-target-empty', `data-index="${index}" aria-label="选择保留目标槽位 ${index + 1}" ${ui.busy ? 'disabled' : ''}`)}
      </div>`;
    }).join('')}</div>
    ${ui.fusionPickingTarget != null ? `<p class="fusion-target-help">正在选择第 ${ui.fusionPickingTarget + 1} 个目标 · 点击物品放入，Esc 取消</p>` : ''}
  </section>`;
}

function itemCard(model, ui, item, index, helpers) {
  const { esc, num, icon, button, itemSummary } = helpers;
  const target = model.targetSet.has(item.id), selected = model.materialSet.has(item.id);
  const equipped = model.equipped.has(item.id), loot = item.id === model.lootId;
  const protectedItem = item.locked || item.rarity >= 3 || model.targets.some(t => item.rarity > t.rarity);
  const unavailable = !target && (equipped || loot);
  const status = target ? '保留目标' : equipped ? '已装备' : loot ? '本次战利品' : item.locked ? '已锁定' : protectedItem ? '受保护' : selected ? '已选材料' : '可作材料';
  const statusIcon = target || selected ? 'check' : item.locked ? 'lock' : equipped || loot || protectedItem ? 'shield' : '';
  return button(`<span class="fusion-card-meta"><span>${RARITIES[item.rarity].name}</span><span class="fusion-card-check ${selected || target ? 'is-checked' : ''}" aria-hidden="true">${selected || target ? icon('check') : ''}</span></span><strong class="fusion-card-name">${esc(item.name)}</strong><span class="fusion-card-level">Lv.${num(item.level)}<span>+${item.enhance}</span></span><span class="fusion-card-stat">${statLine(item, helpers)}</span><span class="fusion-card-state ${protectedItem && !target && !equipped && !loot ? 'is-protected' : ''}">${statusIcon ? icon(statusIcon) : ''}${status}${item.level >= MAX_ITEM_LEVEL ? ' · 等级上限' : ''}</span>`, 'fusion-item', `fusion-card ${RARITIES[item.rarity].key} ${target ? 'is-target' : ''} ${selected ? 'is-selected' : ''} ${item.locked ? 'is-locked' : ''} ${unavailable ? 'is-unavailable' : ''} ${protectedItem ? 'has-protection' : ''}`, `data-id="${esc(item.id)}" data-fusion-item="${esc(item.id)}" data-fusion-index="${index}" draggable="${!ui.busy}" aria-pressed="${selected || target}" aria-keyshortcuts="F2" aria-label="${esc(itemSummary(item))}；${status}；${model.targets.length ? '单击选择材料，右键查看操作' : '单击设为目标'}；F2 查看完整详情" ${ui.busy ? 'disabled' : ''}`);
}

function sixOutcomes(model, helpers) {
  const { esc, num } = helpers;
  const preview = model.preview;
  return `<section class="fusion-six-outcomes ${preview ? 'has-preview' : ''}" data-target-count="${model.targets.length}" aria-labelledby="fusion-six-heading"><div class="fusion-section-title"><h3 id="fusion-six-heading">六面结果</h3><span>${model.targets.length > 1 ? `从上至下：目标 ${model.targets.map((_, index) => index + 1).join(' / ')}` : preview ? '点数落定后获得' : '选择材料后预览'}</span></div><div class="fusion-face-grid">${[1,2,3,4,5,6].map(value => {
    const outcome = preview?.outcomes[value - 1], boost = value === 6 ? 2.5 : value === 5 ? 1.75 : 1;
    return `<div class="fusion-face ${value >= 5 ? 'is-high' : ''}" data-fusion-face="${value}" aria-label="${value} 点，经验倍率 ${boost}${outcome ? `，总经验 ${num(outcome.total)}` : ''}"><div class="fusion-face-heading"><b>${value} 点</b><span>×${boost}</span></div>${model.targets.length ? model.targets.map((target, index) => `<div class="fusion-face-level" title="${esc(target.name)}：Lv.${num(target.level)} → Lv.${num(outcome?.upgrades[index].after.level ?? target.level)}"><small>${model.targets.length > 1 ? `<span class="fusion-face-target-word">目标 </span>${index + 1}` : 'Lv.'}</small><strong>${num(outcome?.upgrades[index].after.level ?? target.level)}</strong></div>`).join('') : '<div class="fusion-face-level is-empty">待选<span class="fusion-face-target-word">目标</span></div>'}<small class="fusion-face-xp">${outcome ? `+${num(outcome.total)} XP` : '等待材料'}</small></div>`;
  }).join('')}</div></section>`;
}

function lastResult(s, model, ui, helpers) {
  const { esc, num } = helpers;
  const last = !ui.forging && s.lastForge?.fusion ? s.lastForge : null;
  if (!last) return '';
  if (last.unit !== 'xp') return '<section class="fusion-last-result" data-fusion-result><h3>上次融合</h3><p>旧版记录已接续为装备等级与进度。</p></section>';
  // Consumption IDs are optional historical metadata in readable saves. Keep
  // that history absent rather than inventing a count or preventing resume.
  const consumedText = Array.isArray(last.consumed)
    ? `${num(last.consumed.length)} 件材料已汇入目标`
    : '材料已汇入目标（历史消耗数量未记录）';
  return `<section class="fusion-last-result ${last.upgrades.length > 1 ? 'has-multiple-results' : ''}" data-fusion-result role="status"><div class="fusion-section-title"><h3>熔炼完成</h3><span>${last.value} 点 · +${num(last.gain)} XP</span></div>${last.upgrades.map(upgrade => {
    const changes = ['attack','hp','defense','luck'].filter(key => (upgrade.after.stats[key] || 0) !== (upgrade.before.stats[key] || 0));
    return `<div class="fusion-result-target"><strong title="${esc(model.inventory.get(upgrade.id)?.name || '保留目标')}">${esc(model.inventory.get(upgrade.id)?.name || '保留目标')}</strong><b class="fusion-result-level">Lv.${num(upgrade.before.level)} → Lv.${num(upgrade.after.level)}</b><div class="fusion-result-stats">${changes.length ? changes.map(key => {
      const before = upgrade.before.stats[key] || 0, after = upgrade.after.stats[key] || 0;
      return `<span>${statLabel(key)} ${num(before)} → ${num(after)} <b>${after - before >= 0 ? '+' : ''}${num(after - before)}</b></span>`;
    }).join('') : '<span>主属性暂未变化，等级进度已增加。</span>'}</div><small>等级进度 ${num(upgrade.after.levelXp)} / ${num(levelXpNeeded(upgrade.after.level))}</small></div>`;
  }).join('')}<p>${consumedText} · 强化 +N 保留</p></section>`;
}

function settlement(s, model, ui, helpers) {
  const { esc, num, icon, button, dice } = helpers;
  const { preview, targets, materials } = model;
  const protectedCount = preview?.protectedItems.length || materials.filter(item => item.locked || item.rarity >= 3 || targets.some(target => item.rarity > target.rarity)).length;
  const canAfford = !preview || s.player.gold >= preview.cost;
  const exceedsGoldCap = !!preview && preview.cost > GOLD_CAP;
  const singleExceedsGoldCap = exceedsGoldCap && fusionCostSummary(s, targets, 1).cost > GOLD_CAP;
  const capRecovery = singleExceedsGoldCap ? '单件材料费用超过金币持有上限。请更换目标后再试。' : '本次费用超过金币持有上限。请减少材料或更换目标后再试。';
  // GOLD_CAP + 1 is an unpayable sentinel, not the exact unbounded quote.
  const costLabel = exceedsGoldCap ? '超过持有上限' : preview ? num(preview.cost) : '—';
  const balanceLabel = !canAfford ? '无法结算' : preview ? num(s.player.gold - preview.cost) : num(s.player.gold);
  const mainLabel = ui.forging ? '经验汇聚中' : !targets.length ? '选择保留目标' : !materials.length ? '选择熔炼材料' : !preview ? '调整材料组合' : exceedsGoldCap ? '费用超过持有上限' : !canAfford ? '按预算调整材料' : protectedCount ? '确认保护材料 · 融合' : '投骰融合';
  const range = levelRange(preview, targets, num);
  const result = lastResult(s, model, ui, helpers);
  return `<aside class="fusion-settlement ${result ? 'has-result' : ''} ${result && !preview && !materials.length ? 'is-settled' : ''}" aria-labelledby="fusion-settlement-heading"><div class="fusion-settlement-heading"><div><h2 id="fusion-settlement-heading">熔炼结算</h2><span>${ui.forging ? '回响正在汇聚' : '确认后才消耗材料'}</span></div><div class="fusion-kiln-dice" aria-hidden="true">${dice([ui.forging ? 6 : s.lastForge?.fusion ? s.lastForge.value : 6], { rolling:!!ui.forging })}</div></div>
    <div class="fusion-settlement-scroll" id="fusion-settlement" data-fusion-scroll="settlement">
      ${result}
      <div class="fusion-selection-summary"><strong>${num(materials.length)} 件材料 <span>→</span> ${targets.length} 件目标</strong><span>${range}</span></div>
      <dl class="fusion-totals"><div><dt>基础经验</dt><dd>${preview ? num(preview.base) : '—'} <small>XP</small></dd></div><div><dt>本次花费</dt><dd class="fusion-gold">${costLabel}</dd></div><div><dt>持有金币</dt><dd>${num(s.player.gold)}</dd></div><div><dt>熔炼后余额</dt><dd class="${canAfford ? '' : 'fusion-danger'}">${balanceLabel}</dd></div></dl>
      ${protectedCount ? `<p class="fusion-protection-warning">${icon('shield')} 含 ${num(protectedCount)} 件受保护材料，需确认</p>` : '<p class="fusion-protection-safe">目标保留 · 仅消耗已选材料</p>'}
      ${preview && !canAfford ? `<p class="fusion-budget-warning">${exceedsGoldCap ? `${capRecovery}持有上限 ${GOLD_CAP.toLocaleString('en-US')} 金币。` : `还差 ${num(preview.cost - s.player.gold)} 金币。点击主按钮，按预算重新放入材料。`}</p>` : ''}
      ${preview ? `<details class="fusion-cost-details"><summary>查看费用组成</summary><p>基础 ${num(preview.baseCost)} × 品质 ${Number(preview.qualityMultiplier.toFixed(3))} × 越级 ${Number(preview.levelMultiplier.toFixed(3))}${exceedsGoldCap ? '：组合费用超过金币持有上限' : ` ≈ ${num(preview.cost)} 金币`}</p><p>目标高于角色等级时费用增加。融合提升 Lv. 与等级进度；材料的 +N 不继承。</p></details>` : '<p class="fusion-settlement-hint">1–4 点获得基础经验；5 点 ×1.75，6 点 ×2.5。</p>'}
    </div>
    <div class="fusion-dock">${sixOutcomes(model, helpers)}
    <div class="fusion-commit"><div class="fusion-commit-copy"><strong>${exceedsGoldCap ? costLabel : preview ? `${costLabel} 金币` : '等待材料'}<small>${num(materials.length)} 件 → ${targets.length} 件</small></strong><span>${range}</span><span class="fusion-commit-xp">基础经验 <b>${preview ? num(preview.base) : '—'}</b> XP</span><small class="${canAfford ? '' : 'fusion-danger'}">${preview ? canAfford ? `余额 ${balanceLabel}` : balanceLabel : `持有 ${num(s.player.gold)} 金币`}${protectedCount ? `<span class="fusion-danger"> · 含 ${num(protectedCount)} 件受保护，需确认</span>` : ''}</small></div>${button(`${icon('fusion')} ${mainLabel}`, 'fusion-preview', 'primary fusion-submit', ui.busy || exceedsGoldCap ? 'disabled' : '')}${ui.forging ? button('跳过演出', 'skip', 'fusion-skip') : ''}</div></div>
  </aside>`;
}

export function fusionView(s, ui, helpers, preparedModel) {
  const { esc, num, icon, button } = helpers;
  const model = preparedModel || fusionWorkbenchModel(s, ui);
  model.lootId = s.loot?.item?.id;
  const eligible = item => !model.targetSet.has(item.id) && !model.equipped.has(item.id) && item.id !== model.lootId && !item.locked;
  const allCandidates = model.candidates.filter(eligible), pageCandidates = model.pageItems.filter(eligible), filteredCandidates = model.filtered.filter(eligible);
  const whollySelected = items => items.length > 0 && items.every(item => model.materialSet.has(item.id));
  const notice = ui.fusionNotice;
  const excluded = notice?.excluded;
  const exclusionCopy = excluded ? [[excluded.equipped, '已装备'], [excluded.loot, '本次战利品'], [excluded.locked, '已锁定'], [excluded.invalid, '不可用']].filter(([count]) => count).map(([count, label]) => `${num(count)} 件${label}`).join(' · ') : '';
  const selectable = model.targets.length && !ui.busy;
  return `<section class="fusion-workroom ${ui.forging ? 'is-forging' : ''}" aria-label="回响熔室工作台" aria-busy="${!!ui.forging}">
    <header class="fusion-heading"><div class="fusion-heading-title">${icon('fusion')}<div><h1>回响熔室</h1><p>放上目标，一次选完材料，让回响继续生长。</p></div></div><nav class="fusion-slot-tabs" aria-label="融合装备类别">${Object.entries(SLOTS).map(([slot, label]) => button(`${icon(slotIcon(slot))}${label}`, 'fusion-slot', slot === model.slot ? 'active' : '', `data-slot="${slot}" aria-pressed="${slot === model.slot}" ${ui.busy ? 'disabled' : ''}`)).join('')}</nav></header>
    ${targetSlots(model, ui, helpers)}
    <div class="fusion-workbench-body"><section class="fusion-catalog" aria-labelledby="fusion-pool-heading">
      <div class="fusion-catalog-heading"><h2 id="fusion-pool-heading">${SLOTS[model.slot]}物品池 <small>${num(model.total)} 件</small></h2><div class="fusion-catalog-tools"><span>单击选材料 · Shift 连选 · 右键操作</span>${button('装备详情', 'fusion-details', 'fusion-details-trigger', `aria-keyshortcuts="F2" aria-label="查看当前装备的完整详情，也可按 F2" ${ui.busy || !model.pageItems.length && !model.targets.length ? 'disabled' : ''}`)}</div></div>
      <div class="fusion-filters"><label class="fusion-search"><span>搜索装备</span><input type="search" id="fusion-search" value="${esc(ui.fusionSearch || '')}" placeholder="搜索名称、品质或编号" autocomplete="off" ${ui.busy ? 'disabled' : ''}></label><label><span>品质</span><select id="fusion-rarity" ${ui.busy ? 'disabled' : ''}><option value="">全部品质</option><option value="low" ${ui.fusionRarity === 'low' ? 'selected' : ''}>普通 + 稀有</option>${RARITIES.map((rarity, index) => `<option value="${index}" ${String(ui.fusionRarity ?? '') === String(index) ? 'selected' : ''}>${rarity.name}</option>`).join('')}</select></label><fieldset class="fusion-level-filter"><legend>等级范围</legend><input type="number" id="fusion-min-level" value="${esc(ui.fusionMinLevel ?? '')}" min="1" max="${MAX_ITEM_LEVEL}" inputmode="numeric" aria-label="最低装备等级" placeholder="最低" ${ui.busy ? 'disabled' : ''}><span>—</span><input type="number" id="fusion-max-level" value="${esc(ui.fusionMaxLevel ?? '')}" min="1" max="${MAX_ITEM_LEVEL}" inputmode="numeric" aria-label="最高装备等级" placeholder="最高" ${ui.busy ? 'disabled' : ''}></fieldset><label><span>排序</span><select id="fusion-sort" ${ui.busy ? 'disabled' : ''}>${[['newest','新获得优先'],['power','强度优先'],['level','等级优先'],['rarity','品质优先'],['enhance','强化优先'],['depth','获得层 · 由深到浅']].map(([value, label]) => `<option value="${value}" ${(ui.fusionSort || 'newest') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <div class="fusion-bulk-toolbar">${button(`${icon('fusion')} ${whollySelected(allCandidates) ? '取消全部' : '一键熔炼'}`, 'fusion-all', `fusion-bulk-main ${whollySelected(allCandidates) ? 'is-active' : ''}`, ui.busy ? 'disabled' : '')}${button(whollySelected(pageCandidates) ? '取消本页' : '本页全选', 'fusion-page-all', 'fusion-bulk-secondary', selectable ? '' : 'disabled')}${button(whollySelected(filteredCandidates) ? '取消筛选' : '当前筛选全部', 'fusion-filtered-all', 'fusion-bulk-secondary', selectable ? '' : 'disabled')}<span class="fusion-selected-count">已选 <b>${num(model.materials.length)}</b> 件</span>${model.materials.length ? button('清空', 'fusion-clear-materials', 'fusion-clear', ui.busy ? 'disabled' : '') : ''}</div>
      <div class="fusion-selection-notice" role="status"><span>${notice?.text ? esc(notice.text) : exclusionCopy ? `已保留：${exclusionCopy}` : '一键跳过已装备、本次战利品与锁定件；高品质材料需确认。'}</span>${notice?.text && exclusionCopy ? `<small>已保留：${exclusionCopy}</small>` : ''}<div>${notice?.budgetLimited && ui.fusionAllCandidates?.length ? button('仍要全部放入', 'fusion-force-all', 'fusion-force', ui.busy ? 'disabled' : '') : ''}${ui.fusionUndo?.expires > Date.now() ? button('撤销选择 · 5秒内', 'fusion-undo', 'fusion-undo', `data-expires="${ui.fusionUndo.expires}" ${ui.busy ? 'disabled' : ''}`) : ''}</div></div>
      <div class="fusion-grid-scroll" id="fusion-pool" data-fusion-scroll="pool"><div class="fusion-item-grid" aria-label="${SLOTS[model.slot]}装备，第 ${model.page + 1} 页">${model.pageItems.map((item, index) => itemCard(model, ui, item, index, helpers)).join('') || `<div class="fusion-grid-empty">${icon('inventory')}<h3>${model.candidates.length ? '没有符合筛选的装备' : '这一类装备还没有入囊'}</h3><p>${model.candidates.length ? '调整名称、品质或等级范围，即可继续选择。' : '继续探索，在战利品中寻找新的回响。'}</p></div>`}</div></div>
      <nav class="fusion-pagination" aria-label="物品池分页" data-page="${model.page}" data-pages="${model.pages}" data-total="${model.total}"><span>${model.total ? `${num(model.page * FUSION_PAGE_SIZE + 1)}–${num(Math.min(model.total, (model.page + 1) * FUSION_PAGE_SIZE))} / ${num(model.total)} 件` : '0 件装备'}</span><div>${button('上一页', 'fusion-page', '', `data-page="${model.page - 1}" ${model.page === 0 || ui.busy ? 'disabled' : ''}`)}<span>${model.page + 1} / ${model.pages}</span>${button('下一页', 'fusion-page', '', `data-page="${model.page + 1}" ${model.page + 1 >= model.pages || ui.busy ? 'disabled' : ''}`)}<label>跳至 <input id="fusion-page-jump" type="number" min="1" max="${model.pages}" value="${model.page + 1}" inputmode="numeric" aria-label="跳转到物品页" ${ui.busy ? 'disabled' : ''}></label></div></nav>
    </section>${settlement(s, model, ui, helpers)}</div>
  </section>`;
}

// Tooltips are rendered on demand, never once per inventory entry. Their
// comparison state contains only equipped items, so a large bag stays cheap.
export function fusionItemTooltip(s, ui, item, helpers) {
  const { esc, num, icon, itemSummary, itemProgress, itemEffects, comparison } = helpers;
  if (!item) return '';
  const equippedIds = new Set(Object.values(s.player.equipped).filter(Boolean));
  const relevantIds = new Set([...equippedIds, ...(ui.fusionTargets || [])]);
  const relevantItems = s.player.items.filter(entry => relevantIds.has(entry.id));
  const targets = (ui.fusionTargets || []).map(id => relevantItems.find(entry => entry.id === id)).filter(Boolean);
  const comparisonState = { ...s, player:{ ...s.player, items:relevantItems.filter(entry => equippedIds.has(entry.id)) } };
  const values = itemStats(item);
  const locked = item.locked, equipped = equippedIds.has(item.id), loot = s.loot?.item?.id === item.id;
  const protection = locked || item.rarity >= 3 || targets.some(target => item.rarity > target.rarity);
  const targetComparisons = targets.filter(target => target.id !== item.id).map(target => {
    const before = itemStats(target), keys = [...new Set([...Object.keys(before), ...Object.keys(values)])];
    const changes = keys.filter(key => Math.abs((values[key] || 0) - (before[key] || 0)) > 0.00001);
    return `<section class="fusion-tooltip-target"><h4>与目标 ${esc(target.name)} 比较</h4>${changes.length ? `<dl>${changes.map(key => {
      const difference = (values[key] || 0) - (before[key] || 0);
      return `<div><dt>${esc(statLabel(key))}</dt><dd class="${difference > 0 ? 'is-positive' : 'is-negative'}">${difference > 0 ? '+' : ''}${statValue(key, difference, num)}</dd></div>`;
    }).join('')}</dl>` : '<p>词条与属性相同</p>'}</section>`;
  }).join('');
  return `<div class="fusion-tooltip-heading ${RARITIES[item.rarity].key}"><span>${RARITIES[item.rarity].name} · ${SLOTS[item.slot]}</span><h3>${esc(item.name)}</h3><strong>Lv.${num(item.level)} · +${item.enhance}</strong></div><p class="fusion-tooltip-origin">等级进度 ${itemProgress(item)} · 第 ${num(item.depth)} 层获得</p><div class="fusion-tooltip-effects">${itemEffects(item).split(' · ').map(effect => `<span>${esc(effect)}</span>`).join('')}</div><p class="fusion-tooltip-xp">${icon('fusion')} 作为材料：约 <b>${num(Math.floor(fusionMaterialXp(item)))}</b> 基础经验<small>全批次合计后取整；投骰倍率另计，遗物目标均分。</small></p>${equipped || loot ? `<p class="fusion-tooltip-protection">${icon('shield')} ${equipped ? '已装备' : '本次战利品'} · 可保留为目标，不能消耗</p>` : protection ? `<p class="fusion-tooltip-protection">${icon(locked ? 'lock' : 'shield')} ${locked ? '已锁定 · 一键操作会跳过；手动选择后需确认' : '受保护材料 · 消耗前需确认'}</p>` : ''}<section class="fusion-tooltip-equipped"><h4>与当前装备比较</h4>${comparison(comparisonState, item)}</section>${targetComparisons}<p class="fusion-tooltip-keys">卡片上 Enter / 空格选择 · Shift 连选 · 右键或菜单键查看操作<br>F2 或「装备详情」查看完整属性 · Esc 关闭</p>`;
}
