import { fusionSelectionModel, fusionWorkbenchModel, normalizeFusionSelection, planFusionMaterials } from './fusion-workbench.js';
import { fusionPreview, salvagePreview, GOLD_CAP } from './engine.js';
import { fusionCostSummary, MAX_ITEM_LEVEL } from './equipment.js';

// Reserve the full pool, settlement and every visible control. A short safe
// preview can scroll; the visible details button/F2 opens the full dialog.
// Keep only maximal usable rectangles after each split so overlapping obstacle
// rectangles (including cards already inside the pool) cannot multiply work.
export function fusionTooltipPlacement({ viewportWidth, viewportHeight, anchor, pool, settlement, dock, detailsTrigger, controls = [], width = 390, height = 660 }) {
  const pad = 8, gap = 10, minWidth = Math.min(260, viewportWidth - 16), minHeight = 96;
  if (!anchor || !pool || viewportWidth < 32 || viewportHeight < 32) return null;
  let regions = [{ left:pad, top:pad, right:viewportWidth - pad, bottom:viewportHeight - pad }];
  for (const rect of [pool, settlement, dock, anchor, detailsTrigger, ...controls].filter(Boolean)) {
    if (!regions.length) break;
    if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.left >= rect.right || rect.top >= rect.bottom) continue;
    const block = { left:rect.left - gap, top:rect.top - gap, right:rect.right + gap, bottom:rect.bottom + gap };
    const split = regions.flatMap(region => {
      const left = Math.max(region.left, block.left), right = Math.min(region.right, block.right);
      const top = Math.max(region.top, block.top), bottom = Math.min(region.bottom, block.bottom);
      if (left >= right || top >= bottom) return [region];
      return [
        { ...region, bottom:top }, { ...region, top:bottom },
        { ...region, right:left }, { ...region, left:right },
      ];
    });
    const unique = [...new Map(split.filter(part => part.right - part.left >= minWidth && part.bottom - part.top >= minHeight)
      .map(part => [[part.left, part.top, part.right, part.bottom].join(','), part])).values()];
    regions = unique.filter((part, index) => !unique.some((other, otherIndex) => index !== otherIndex &&
      other.left <= part.left && other.top <= part.top && other.right >= part.right && other.bottom >= part.bottom));
  }
  const candidates = regions.map(region => {
    const fittedWidth = Math.min(width, region.right - region.left), fittedHeight = Math.min(height, region.bottom - region.top);
    const left = Math.max(region.left, Math.min(region.right - fittedWidth, anchor.left));
    const top = region.bottom <= anchor.top ? region.bottom - fittedHeight
      : region.top >= anchor.bottom ? region.top : Math.max(region.top, Math.min(region.bottom - fittedHeight, anchor.top));
    const distance = Math.hypot(left + fittedWidth / 2 - (anchor.left + anchor.right) / 2, top + fittedHeight / 2 - (anchor.top + anchor.bottom) / 2);
    return { left, top, width:fittedWidth, height:fittedHeight, maxHeight:region.bottom - region.top, score:fittedWidth * fittedHeight - distance * 30 };
  });
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

// An open preview may be beyond several rows. Preserve its item while the
// pointer crosses the corridor between the trigger and panel, even when that
// journey passes another card. Leaving the corridor resumes ordinary hover.
export function fusionTooltipTransit({ anchor, panel, x, y }) {
  if (!anchor || !panel || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const margin = 12;
  const between = (point, from, to, a0, a1, b0, b1, across) => {
    if (point < Math.min(from, to) - margin || point > Math.max(from, to) + margin) return false;
    const progress = Math.max(0, Math.min(1, (point - from) / (to - from)));
    return across >= a0 + (b0 - a0) * progress - margin && across <= a1 + (b1 - a1) * progress + margin;
  };
  if (panel.bottom < anchor.top) return between(y, anchor.top, panel.bottom, anchor.left, anchor.right, panel.left, panel.right, x);
  if (panel.top > anchor.bottom) return between(y, anchor.bottom, panel.top, anchor.left, anchor.right, panel.left, panel.right, x);
  if (panel.right < anchor.left) return between(x, anchor.left, panel.right, anchor.top, anchor.bottom, panel.top, panel.bottom, y);
  if (panel.left > anchor.right) return between(x, anchor.right, panel.left, anchor.top, anchor.bottom, panel.top, panel.bottom, y);
  return false;
}

// Workbench choices are ephemeral UI state. Every inventory mutation still goes
// through app.act and its original snapshot/Web Locks save transaction.
export function createFusionController({ app, ui, getState, isCommitting, render, act, notify, confirmDialog, reviewItems, dialog, tooltipHTML, esc, num, icon, itemSummary }) {
  let tooltip, tooltipAnchor, tooltipTimer, tooltipHideTimer, pendingTooltipAnchor, hoveredAnchor, lastDetailsAnchor;
  let details, detailsAnchor, detailsState, detailsTargets, menu, menuAnchor, undoTimer, draggedId, touchHoverUntil = 0, composing = false, pointerDown = false, overTooltip = false, tooltipReading = false, tooltipTravelling = false;
  const dismissedHover = new Set(), dismissedFocus = new Set();
  const itemAnchor = node => node?.closest?.('[data-fusion-item], [data-fusion-tooltip]');
  const anchorId = anchor => anchor?.dataset.fusionItem || anchor?.dataset.fusionTooltip;
  const active = () => ui.screen === 'game' && ui.view === 'game' && getState()?.phase === 'fusion';
  const blocked = () => !active() || ui.busy || isCommitting();
  const model = (ordered = false) => ordered ? fusionWorkbenchModel(getState(), ui, false) : fusionSelectionModel(getState(), ui);
  const refresh = () => render({ fusionOnly:true });
  const clearUndo = () => { clearTimeout(undoTimer); ui.fusionUndo = null; };
  const resetBatch = () => { clearUndo(); ui.fusionAllCandidates = null; ui.fusionNotice = null; };
  function reconcile(s = getState(), prepareView = false) {
    if (!s) return;
    const selection = prepareView ? fusionWorkbenchModel(s, ui) : normalizeFusionSelection(s, ui);
    ui.fusionTargets = selection.targetIds; ui.fusionMaterials = selection.materialIds;
    return prepareView ? selection : undefined;
  }
  function undoable(previous) {
    clearTimeout(undoTimer);
    ui.fusionUndo = { materials:[...previous], expires:Date.now() + 5000, runId:getState().runId, revision:getState().revision };
    undoTimer = setTimeout(() => { ui.fusionUndo = null; if (active() && !ui.busy) refresh(); }, 5050);
  }
  function closeTooltip(dismiss = false) {
    if (dismiss) for (const anchor of [tooltipAnchor, pendingTooltipAnchor, hoveredAnchor, itemAnchor(document.activeElement), menuAnchor, detailsAnchor]) {
      const id = anchorId(anchor); if (id) { dismissedHover.add(id); dismissedFocus.add(id); }
    }
    clearTimeout(tooltipTimer); clearTimeout(tooltipHideTimer); pendingTooltipAnchor = null;
    tooltipAnchor?.removeAttribute('aria-describedby');
    tooltipAnchor = null; overTooltip = false; tooltipReading = false; tooltipTravelling = false;
    if (tooltip) tooltip.hidden = true;
  }
  function scheduleTooltipHide() {
    clearTimeout(tooltipHideTimer);
    // The panel may be above the entire pool. Allow a real pointer journey to
    // it; keyboard focus and text selection keep it visible until dismissed.
    tooltipHideTimer = setTimeout(() => {
      if (overTooltip || tooltipReading || tooltipTravelling || tooltipAnchor === hoveredAnchor || tooltipAnchor === document.activeElement) return;
      closeTooltip();
    }, 700);
  }
  function inTooltipTransit(event) {
    return tooltip && !tooltip.hidden && tooltipAnchor?.isConnected && fusionTooltipTransit({
      anchor:tooltipAnchor.getBoundingClientRect(), panel:tooltip.getBoundingClientRect(), x:event.clientX, y:event.clientY,
    });
  }
  function holdTooltipTransit(event) {
    if (!inTooltipTransit(event)) return false;
    tooltipTravelling = true; clearTimeout(tooltipTimer); clearTimeout(tooltipHideTimer); pendingTooltipAnchor = null;
    return true;
  }
  function queueTooltip(anchor) {
    if (dismissedHover.has(anchorId(anchor)) || tooltipReading || details?.open) return;
    clearTimeout(tooltipTimer); pendingTooltipAnchor = anchor;
    tooltipTimer = setTimeout(() => { pendingTooltipAnchor = null; showTooltip(anchor); }, 160);
  }
  function closeMenu(restore = false) {
    if (menu) menu.hidden = true;
    if (restore && menuAnchor?.isConnected) menuAnchor.focus({ preventScroll:true });
    menuAnchor = null;
  }
  function fitFloating(element, rect) {
    element.style.maxHeight = '';
    const width = element.offsetWidth, height = element.offsetHeight;
    const rightFits = rect.right + width + 18 <= innerWidth, leftFits = rect.left >= width + 18;
    const x = rightFits ? rect.right + 10 : leftFits ? rect.left - width - 10 : rect.left;
    element.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, x))}px`;
    let y = Math.max(8, Math.min(innerHeight - height - 8, rect.top));
    if (!rightFits && !leftFits) {
      // A narrow viewport needs a scrollable tooltip above/below the card;
      // clamping a full-width panel sideways would cover its own trigger.
      const bottom = rect.bottom ?? rect.top, below = innerHeight - bottom - 18, above = rect.top - 18;
      const available = Math.max(80, below >= above ? below : above);
      element.style.maxHeight = `${Math.min(660, available)}px`;
      y = below >= above ? bottom + 10 : rect.top - Math.min(height, available) - 10;
    }
    element.style.top = `${Math.max(8, y)}px`;
  }
  function showTooltip(anchor, source = 'hover') {
    if (blocked() || pointerDown || Date.now() < touchHoverUntil || dialog.open || details?.open || menu && !menu.hidden || !anchor?.isConnected) return;
    const id = anchorId(anchor);
    if ((source === 'hover' ? dismissedHover : dismissedFocus).has(id)) return;
    const item = getState().player.items.find(entry => entry.id === id);
    if (!item) return;
    closeTooltip();
    if (!tooltip) {
      tooltip = document.createElement('div'); tooltip.id = 'fusion-item-tooltip'; tooltip.className = 'fusion-item-tooltip';
      tooltip.setAttribute('role', 'tooltip'); document.body.append(tooltip);
      tooltip.addEventListener('pointerenter', () => { overTooltip = true; tooltipTravelling = false; clearTimeout(tooltipTimer); clearTimeout(tooltipHideTimer); pendingTooltipAnchor = null; });
      tooltip.addEventListener('pointerleave', () => { overTooltip = false; scheduleTooltipHide(); });
      tooltip.addEventListener('pointerdown', () => { tooltipReading = true; clearTimeout(tooltipHideTimer); });
    }
    tooltip.style.width = ''; tooltip.style.maxHeight = '';
    tooltip.innerHTML = tooltipHTML(getState(), ui, item); tooltip.hidden = false; tooltip.scrollTop = 0;
    const placement = fusionTooltipPlacement({ viewportWidth:innerWidth, viewportHeight:innerHeight,
      anchor:anchor.getBoundingClientRect(), pool:app.querySelector('#fusion-pool')?.getBoundingClientRect(),
      settlement:app.querySelector('.fusion-settlement')?.getBoundingClientRect(), dock:app.querySelector('.fusion-dock')?.getBoundingClientRect(),
      detailsTrigger:app.querySelector('.fusion-details-trigger')?.getBoundingClientRect(),
      controls:[...app.querySelectorAll('button, input, select, textarea, summary, a[href], [contenteditable], [role="button"], [tabindex]')]
        .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0),
      width:tooltip.offsetWidth, height:tooltip.offsetHeight });
    if (!placement) { tooltip.hidden = true; return; }
    tooltip.style.width = `${placement.width}px`; tooltip.style.maxHeight = `${placement.height}px`;
    tooltip.style.left = `${placement.left}px`; tooltip.style.top = `${placement.top}px`;
    tooltipAnchor = anchor; anchor.setAttribute('aria-describedby', tooltip.id);
  }
  function findDetailsAnchor(id) {
    const cards = [...app.querySelectorAll('[data-fusion-item], [data-fusion-tooltip]')];
    if (id) return cards.find(anchor => anchorId(anchor) === id);
    if (lastDetailsAnchor?.isConnected && cards.includes(lastDetailsAnchor)) return lastDetailsAnchor;
    return cards.find(anchor => anchorId(anchor) === ui.fusionFocusId) || cards.find(anchor => anchor.dataset.fusionItem) || cards[0];
  }
  function closeDetails(restore = true) {
    if (!details?.open) return;
    closeTooltip(true);
    const anchor = detailsAnchor; detailsAnchor = null; detailsState = null; detailsTargets = null;
    details.close();
    if (restore && active()) {
      const target = anchor?.isConnected ? anchor : app.querySelector('[data-action="fusion-details"]');
      target?.focus({ preventScroll:true });
    }
  }
  function openDetails(anchor = findDetailsAnchor(), id = anchorId(anchor)) {
    if (blocked() || dialog.open || !id) return;
    const item = getState().player.items.find(entry => entry.id === id);
    if (!item) return;
    detailsAnchor = anchor; lastDetailsAnchor = anchor; detailsState = getState(); detailsTargets = JSON.stringify(ui.fusionTargets || []);
    dismissedHover.add(id); dismissedFocus.add(id); closeTooltip(true); closeMenu();
    if (!details) {
      details = document.createElement('dialog'); details.className = 'fusion-item-details';
      details.setAttribute('aria-labelledby', 'fusion-details-title'); document.body.append(details);
      details.addEventListener('cancel', event => { event.preventDefault(); closeDetails(); });
    }
    details.innerHTML = `<div class="fusion-details-heading"><h2 id="fusion-details-title">装备详情</h2><button type="button" class="fusion-details-close" aria-label="关闭装备详情">${icon('close')}关闭</button></div><div class="fusion-details-content" tabindex="0" role="region" aria-label="装备完整属性，可滚动">${tooltipHTML(getState(), ui, item)}</div>`;
    const keys = details.querySelector('.fusion-tooltip-keys');
    if (keys) keys.textContent = '方向键 / Page Up / Page Down 滚动 · 可选择并复制文字 · Tab 切换控件 · Esc 关闭';
    details.querySelector('.fusion-details-close').addEventListener('click', () => closeDetails());
    if (!details.open) details.showModal();
    const content = details.querySelector('.fusion-details-content'); content.scrollTop = 0; content.focus({ preventScroll:true });
  }
  function selectTarget(id, index = ui.fusionPickingTarget ?? 0) {
    const m = model(), item = m.inventory.get(id);
    if (!item || item.slot !== m.slot || item.level >= MAX_ITEM_LEVEL) { notify('此装备已到安全等级上限，不能作为融合目标。'); return; }
    resetBatch();
    const targets = [...m.targetIds], cap = m.slot === 'relic' ? 3 : 1;
    index = Math.max(0, Math.min(cap - 1, targets.length, Number(index) || 0));
    const oldIndex = targets.indexOf(id);
    if (oldIndex >= 0 && oldIndex !== index && targets[index]) [targets[index], targets[oldIndex]] = [targets[oldIndex], targets[index]];
    else if (oldIndex < 0) targets[index] = id;
    ui.fusionTargets = targets; ui.fusionPickingTarget = null; ui.fusionAnchor = null; ui.fusionRange = null;
    closeMenu(); closeTooltip(); refresh();
  }
  function toggleItem(id, shift = false) {
    const m = model(shift);
    if (!m.targets.length || ui.fusionPickingTarget != null) { selectTarget(id); return; }
    const item = m.inventory.get(id);
    if (!item || m.targetSet.has(id)) { notify('这件是保留目标。点击上方槽位，或右键其他装备来替换。'); return; }
    if (m.equipped.has(id) || id === getState().loot?.item?.id) { notify('已装备与本次战利品会保留。可通过右键将它设为目标。'); return; }
    resetBatch();
    const from = shift ? m.filtered.findIndex(entry => entry.id === ui.fusionAnchor) : -1, to = shift ? m.filtered.findIndex(entry => entry.id === id) : -1;
    const ranged = shift && from >= 0 && to >= 0;
    if (ranged && !ui.fusionRange) ui.fusionRange = { base:[...m.materialIds], selecting:m.materialSet.has(ui.fusionAnchor) };
    const next = new Set(ranged ? ui.fusionRange.base : m.materialIds);
    const selecting = ranged ? ui.fusionRange.selecting : !next.has(id);
    const range = ranged ? m.filtered.slice(Math.min(from, to), Math.max(from, to) + 1) : [item];
    for (const entry of range) {
      if (m.targetSet.has(entry.id) || m.equipped.has(entry.id) || entry.id === getState().loot?.item?.id || shift && selecting && entry.locked) continue;
      if (selecting) next.add(entry.id); else next.delete(entry.id);
    }
    ui.fusionMaterials = [...next]; if (!ranged) { ui.fusionAnchor = id; ui.fusionRange = null; } ui.fusionFocusId = id;
    refresh();
  }
  function batch(scope = 'all', force = false, adjustCurrent = false) {
    const m = model(scope !== 'all');
    if (!m.targets.length) {
      ui.fusionPickingTarget = 0; ui.fusionNotice = { text:'先放入一件保留目标，再一键挑选同类材料。' }; refresh();
      app.querySelector('[data-fusion-item]')?.focus({ preventScroll:true }); return;
    }
    const scopedIds = (scope === 'page' ? m.pageItems : scope === 'filtered' ? m.filtered : getState().player.items.filter(item => item.slot === m.slot)).map(item => item.id);
    const previous = [...m.materialIds], inScope = new Set(scopedIds);
    const basicEligible = scopedIds.filter(id => {
      const item = m.inventory.get(id);
      return item && !m.targetSet.has(id) && !m.equipped.has(id) && id !== getState().loot?.item?.id && !item.locked;
    });
    if (!force && !adjustCurrent && basicEligible.length && basicEligible.every(id => m.materialSet.has(id))) {
      ui.fusionMaterials = scope === 'all' ? [] : previous.filter(id => !inScope.has(id));
      ui.fusionAllCandidates = null; ui.fusionNotice = { text:scope === 'all' ? '已取消全部材料，目标保留。' : '已取消这个范围的材料，其他选择保留。' };
    } else {
      const full = planFusionMaterials(getState(), m.targetIds, scopedIds, { budget:false, includePreview:false });
      const desired = adjustCurrent ? previous : force ? ui.fusionAllCandidates || full.ids
        : scope === 'all' ? full.ids : [...new Set([...previous.filter(id => !inScope.has(id)), ...full.ids])];
      // Locked pieces in desired can only be earlier explicit manual choices;
      // new pieces entering through a bulk scope were excluded by full above.
      const plan = planFusionMaterials(getState(), m.targetIds, desired, { budget:!force, includeLocked:true, includePreview:false });
      ui.fusionMaterials = plan.ids; ui.fusionAllCandidates = desired;
      const total = scope === 'all' && !adjustCurrent && !force ? full.eligibleCount : desired.length;
      const budgetLimited = plan.budgetLimited, safetyLimited = full.safetyLimited || plan.safetyLimited;
      const singleExceedsGoldCap = fusionCostSummary(getState(), m.targets, 1).cost > GOLD_CAP;
      const text = budgetLimited ? `已放入 ${num(plan.selectedCount)}/${num(total)} 件（预算上限），优先保留经验收益高的材料。${plan.selectedCount ? '' : singleExceedsGoldCap ? '单件材料费用超过金币持有上限。请更换目标后再试。' : '当前金币不足一件；可换较低等级目标、回收旧装或继续探索。'}`
        : safetyLimited ? `已放入 ${num(plan.selectedCount)}/${num(total)} 件，超出最高骰面安全等级的材料已保留。`
        : force && plan.cost > GOLD_CAP ? `已放入全部 ${num(plan.selectedCount)} 件；费用超过金币持有上限。${singleExceedsGoldCap ? '请更换目标后再试。' : '请减少材料或更换目标后再试。'}`
        : force && plan.cost > getState().player.gold ? `已放入全部 ${num(plan.selectedCount)} 件；还差 ${num(plan.cost - getState().player.gold)} 金币，可按预算重新调整。`
        : plan.selectedCount ? `已放入 ${num(plan.selectedCount)} 件材料，确认后才消耗。`
        : '此范围没有可用材料；已装备、本次战利品和锁定件均会保留。';
      ui.fusionNotice = { text, budgetLimited, safetyLimited, selectedCount:plan.selectedCount, eligibleCount:total, excluded:full.excluded };
    }
    ui.fusionAnchor = null; ui.fusionRange = null; undoable(previous); refresh();
  }
  async function submit() {
    const m = model();
    if (!m.targets.length) { ui.fusionPickingTarget = 0; refresh(); notify('先在物品池选择一件保留目标。'); app.querySelector('[data-fusion-item]')?.focus({ preventScroll:true }); return; }
    if (!m.materials.length) { batch('all'); return; }
    const preview = fusionPreview(getState(), m.targetIds, m.materialIds, true);
    if (preview?.cost > GOLD_CAP) {
      notify(fusionCostSummary(getState(), m.targets, 1).cost > GOLD_CAP ? '单件材料费用超过金币持有上限。请更换目标后再试。' : '本次费用超过金币持有上限。请减少材料或更换目标后再试。');
      return;
    }
    if (!preview || preview.cost > getState().player.gold) { batch('all', false, true); return; }
    const snapshot = getState(), action = { type:'fuse', targets:[...m.targetIds], materials:[...m.materialIds], allowProtected:preview.protectedItems.length > 0 };
    const commit = async () => {
      if (getState() !== snapshot) { notify('进度已变化，本次清单未消耗。请按最新状态重新选择。'); return; }
      closeTooltip(); closeMenu(); clearUndo(); await act(action);
    };
    if (!preview.protectedItems.length) { await commit(); return; }
    const protectedIds = new Set(preview.protectedItems.map(item => item.id));
    confirmDialog('确认消耗受保护材料？', `<p>以下 ${num(preview.materials.length)} 件材料将消耗，含 <strong class="danger">${num(protectedIds.size)} 件受保护装备</strong>：</p>${reviewItems(preview.materials, item => `<li class="${protectedIds.has(item.id) ? 'danger' : ''}">${esc(itemSummary(item))}${item.locked ? ' · 已锁定' : ''}${item.rarity >= 3 ? ' · 传说及以上' : ''}${preview.targets.some(target => item.rarity > target.rarity) ? ' · 高于目标品质' : ''}</li>`)}<p>花费 <strong>${num(preview.cost)} 金币</strong> · 余额 ${num(snapshot.player.gold - preview.cost)} 金币</p>`, '确认消耗并投骰', commit);
  }
  function openMenu(anchor, point) {
    if (blocked() || dialog.open) return;
    const m = model(), id = anchor.dataset.fusionItem || anchor.dataset.fusionTooltip, item = m.inventory.get(id);
    if (!item) return;
    closeTooltip();
    if (!menu) { menu = document.createElement('div'); menu.className = 'fusion-context-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '装备操作'); document.body.append(menu); }
    menuAnchor = anchor;
    const canSalvage = !m.targetSet.has(id) && !!salvagePreview(getState(), [id], true, true);
    const cap = m.slot === 'relic' ? 3 : 1;
    menu.innerHTML = `<p>${esc(item.name)}</p>${Array.from({ length:cap }, (_, index) => `<button role="menuitem" data-action="fusion-target" data-id="${esc(id)}" data-index="${index}" ${item.level >= MAX_ITEM_LEVEL ? 'disabled' : ''}>${icon('fusion')}设为${cap > 1 ? `第 ${index + 1} 个` : ''}目标</button>`).join('')}<button role="menuitem" data-action="fusion-details" data-id="${esc(id)}">${icon('inventory')}查看完整详情</button><button role="menuitem" data-action="fusion-lock" data-id="${esc(id)}">${icon('lock')}${item.locked ? '解锁装备' : '锁定装备'}</button><button role="menuitem" data-action="fusion-salvage" data-id="${esc(id)}" ${canSalvage ? '' : 'disabled'}>${icon('inventory')}回收装备${canSalvage ? '' : '（需保留）'}</button>`;
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect(); fitFloating(menu, point ? { left:point.x, right:point.x, top:point.y } : rect);
    menu.querySelector('button:not(:disabled)')?.focus({ preventScroll:true });
  }
  async function handleClick(event, control) {
    const action = control.dataset.action;
    if (!action?.startsWith('fusion-')) return false;
    if (blocked()) return true;
    const id = control.dataset.id;
    if (action === 'fusion-details') { const anchor = id ? findDetailsAnchor(id) || menuAnchor : findDetailsAnchor(); openDetails(anchor, id || anchorId(anchor)); return true; }
    if (action !== 'fusion-lock' && action !== 'fusion-salvage') closeMenu();
    if (action === 'fusion-slot') {
      if (control.dataset.slot === (ui.fusionSlot || 'weapon')) return true;
      resetBatch(); ui.fusionSlot = control.dataset.slot; ui.fusionTargets = []; ui.fusionMaterials = []; ui.fusionPickingTarget = null; ui.fusionAnchor = null; ui.fusionRange = null; ui.fusionFocusId = null;
      closeTooltip(); refresh();
    } else if (action === 'fusion-page') { ui.fusionPage = Math.max(0, Math.min(model(true).pages - 1, Number(control.dataset.page) || 0)); closeTooltip(); refresh(); }
    else if (action === 'fusion-pick-target') { ui.fusionPickingTarget = Number(control.dataset.index) || 0; refresh(); }
    else if (action === 'fusion-target') selectTarget(id, Number(control.dataset.index) || 0);
    else if (action === 'fusion-target-remove') { resetBatch(); ui.fusionTargets = model().targetIds.filter((_, index) => index !== Number(control.dataset.index)); ui.fusionPickingTarget = null; ui.fusionAnchor = null; ui.fusionRange = null; refresh(); }
    else if (action === 'fusion-item' || action === 'fusion-material') toggleItem(id, event.shiftKey);
    else if (action === 'fusion-all') batch('all');
    else if (action === 'fusion-page-all') batch('page');
    else if (action === 'fusion-filtered-all') batch('filtered');
    else if (action === 'fusion-force-all') batch('all', true);
    else if (action === 'fusion-clear-materials') { const before = [...(ui.fusionMaterials || [])]; resetBatch(); ui.fusionMaterials = []; ui.fusionAnchor = null; ui.fusionRange = null; undoable(before); refresh(); }
    else if (action === 'fusion-undo') {
      const undo = ui.fusionUndo;
      if (undo && Date.now() <= undo.expires && undo.runId === getState().runId && undo.revision === getState().revision) {
        ui.fusionMaterials = undo.materials; ui.fusionAnchor = null; ui.fusionRange = null; resetBatch(); ui.fusionNotice = { text:'已撤销预选，金币与装备都未消耗。' }; refresh();
      } else { clearUndo(); refresh(); notify('5 秒撤销时间已过，仍可逐件取消或清空材料。'); }
    } else if (action === 'fusion-preview') await submit();
    else if (action === 'fusion-lock') { closeMenu(); resetBatch(); await act({ type:'lock', id }); if (getState().player.items.find(item => item.id === id)?.locked) ui.fusionMaterials = (ui.fusionMaterials || []).filter(value => value !== id); refresh(); }
    else if (action === 'fusion-salvage') {
      closeMenu(); const s = getState(), preview = salvagePreview(s, [id], true, true);
      if (preview && !model().targetSet.has(id)) {
        const item = preview.items[0];
        confirmDialog('回收这件装备？', `<p>${esc(itemSummary(item))}</p><p>物品将永久移除。预计实收 <strong>${preview.gold.toLocaleString('en-US')} 金币</strong>${preview.overflow ? `；将放弃 <strong class="danger">${preview.overflow.toLocaleString('en-US')} 溢出金币</strong>（持有上限 ${GOLD_CAP.toLocaleString('en-US')}）` : ''}。</p>`, '确认回收', async () => {
          if (getState() !== s) { notify('进度已变化，请重新核对回收清单。'); return; }
          resetBatch(); await act({ type:'salvage', ids:[id], allowProtected:item.rarity >= 3, allowOverflow:!!preview.overflow });
        });
      }
    }
    return true;
  }
  function handleInput(event) {
    if (blocked() || composing || event.isComposing) return false;
    const fields = { 'fusion-search':'fusionSearch', 'fusion-rarity':'fusionRarity', 'fusion-min-level':'fusionMinLevel', 'fusion-max-level':'fusionMaxLevel', 'fusion-sort':'fusionSort' };
    const field = fields[event.target.id];
    if (field) {
      if (ui[field] === event.target.value) return true;
      ui[field] = event.target.value; ui.fusionAnchor = null; ui.fusionRange = null; closeTooltip(); refresh(); return true;
    }
    if (event.target.id === 'fusion-page-jump' && event.type === 'change') {
      ui.fusionPage = Math.max(0, Math.min(model(true).pages - 1, (Number(event.target.value) || 1) - 1)); closeTooltip(); refresh(); return true;
    }
    return false;
  }
  function handleKeydown(event) {
    touchHoverUntil = 0;
    // Let the modal keep native scrolling and text selection;
    // game shortcuts must not turn Ctrl+A/Space into a material transaction.
    if (details?.open) {
      if (event.key === 'Escape') { event.preventDefault(); closeDetails(); }
      if (event.key === 'Tab') {
        const entries = [details.querySelector('.fusion-details-close'), details.querySelector('.fusion-details-content')];
        const current = entries.indexOf(document.activeElement), next = current < 0 ? event.shiftKey ? entries.length - 1 : 0 : (current + (event.shiftKey ? -1 : 1) + entries.length) % entries.length;
        event.preventDefault(); entries[next].focus({ preventScroll:true });
      }
      return true;
    }
    if (!active() || dialog.open) return false;
    if (event.key === 'Escape') {
      closeTooltip(true); closeMenu(true);
      if (ui.fusionPickingTarget != null) { ui.fusionPickingTarget = null; refresh(); }
      event.preventDefault(); return true;
    }
    if (menu && !menu.hidden && menu.contains(event.target)) {
      const entries = [...menu.querySelectorAll('button:not(:disabled)')], index = entries.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % entries.length;
      if (event.key === 'ArrowUp') next = (index - 1 + entries.length) % entries.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = entries.length - 1;
      if (next !== undefined) { event.preventDefault(); entries[next]?.focus(); return true; }
      if (event.key === 'Tab') closeMenu();
      return false;
    }
    if (blocked() || event.target.closest('input, select, textarea, [contenteditable]')) return false;
    if (event.key === 'F2') { event.preventDefault(); openDetails(itemAnchor(event.target) || tooltipAnchor || findDetailsAnchor()); return true; }
    if (tooltipReading && tooltip && !tooltip.hidden) {
      if (itemAnchor(event.target) && ['Enter', ' '].includes(event.key)) event.preventDefault();
      return true;
    }
    const card = event.target.closest('[data-fusion-item]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); batch('filtered'); return true; }
    if (!card) return false;
    if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); openMenu(card); return true; }
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!event.repeat) toggleItem(card.dataset.fusionItem, event.shiftKey); return true; }
    const cards = [...app.querySelectorAll('[data-fusion-item]')], index = cards.indexOf(card);
    const columns = Math.max(1, getComputedStyle(app.querySelector('.fusion-item-grid')).gridTemplateColumns.split(' ').length);
    let next;
    if (event.key === 'ArrowRight') next = index + 1;
    if (event.key === 'ArrowLeft') next = index - 1;
    if (event.key === 'ArrowDown') next = index + columns;
    if (event.key === 'ArrowUp') next = index - columns;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = cards.length - 1;
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault(); const m = model(true); ui.fusionPage = Math.max(0, Math.min(m.pages - 1, m.page + (event.key === 'PageDown' ? 1 : -1))); refresh();
      const nextCards = [...app.querySelectorAll('[data-fusion-item]')]; nextCards[Math.min(index, nextCards.length - 1)]?.focus(); return true;
    }
    if (next !== undefined) {
      event.preventDefault(); const target = cards[Math.max(0, Math.min(cards.length - 1, next))];
      if (event.shiftKey) { if (!ui.fusionAnchor) { ui.fusionAnchor = card.dataset.fusionItem; ui.fusionRange = { base:[...(ui.fusionMaterials || [])], selecting:true }; } toggleItem(target.dataset.fusionItem, true); }
      app.querySelector(`[data-fusion-item="${CSS.escape(target.dataset.fusionItem)}"]`)?.focus(); return true;
    }
    return false;
  }
  app.addEventListener('pointerdown', event => {
    const anchor = itemAnchor(event.target);
    if (anchor) {
      pointerDown = true; hoveredAnchor = anchor; lastDetailsAnchor = anchor;
      dismissedHover.add(anchorId(anchor)); dismissedFocus.add(anchorId(anchor)); closeTooltip();
    }
  }, true);
  document.addEventListener('pointerup', event => { pointerDown = false; if (event.pointerType === 'touch') touchHoverUntil = Date.now() + 800; }, true);
  document.addEventListener('pointercancel', () => { pointerDown = false; }, true);
  app.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || Date.now() < touchHoverUntil) return;
    const anchor = itemAnchor(event.target);
    if (!anchor || anchor.contains(event.relatedTarget) || anchor === hoveredAnchor) return;
    hoveredAnchor = anchor;
    if (anchor === tooltipAnchor) { tooltipTravelling = false; clearTimeout(tooltipHideTimer); return; }
    if (tooltipTravelling && holdTooltipTransit(event)) return;
    tooltipTravelling = false; lastDetailsAnchor = anchor; queueTooltip(anchor);
  });
  app.addEventListener('pointerout', event => {
    const anchor = itemAnchor(event.target);
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    if (hoveredAnchor === anchor) hoveredAnchor = null;
    dismissedHover.delete(anchorId(anchor));
    if (pendingTooltipAnchor === anchor) { clearTimeout(tooltipTimer); pendingTooltipAnchor = null; }
    if (anchor === tooltipAnchor && !tooltip?.contains(event.relatedTarget) && !holdTooltipTransit(event)) scheduleTooltipHide();
  });
  document.addEventListener('pointermove', event => {
    if (!tooltipTravelling || event.pointerType === 'touch') return;
    if (tooltip?.contains(event.target) || tooltipAnchor?.contains(event.target)) { tooltipTravelling = false; return; }
    if (inTooltipTransit(event)) return;
    tooltipTravelling = false;
    const anchor = itemAnchor(event.target);
    if (anchor && anchor !== tooltipAnchor) { hoveredAnchor = anchor; lastDetailsAnchor = anchor; queueTooltip(anchor); }
    else scheduleTooltipHide();
  });
  app.addEventListener('focusin', event => {
    const anchor = itemAnchor(event.target);
    if (anchor) {
      if (anchor.dataset.fusionItem) ui.fusionFocusId = anchor.dataset.fusionItem;
      lastDetailsAnchor = anchor; updateCardTabStops(); showTooltip(anchor, 'focus');
    }
    else closeTooltip();
  });
  app.addEventListener('focusout', event => {
    const anchor = itemAnchor(event.target);
    if (anchor && anchorId(anchor) !== anchorId(itemAnchor(event.relatedTarget))) dismissedFocus.delete(anchorId(anchor));
    if (!event.target.contains(event.relatedTarget) && !tooltip?.contains(event.relatedTarget) && !overTooltip && !tooltipReading) closeTooltip();
  });
  app.addEventListener('contextmenu', event => {
    const anchor = event.target.closest('[data-fusion-item], [data-fusion-tooltip]');
    if (anchor) { event.preventDefault(); openMenu(anchor, { x:event.clientX, y:event.clientY }); }
  });
  document.addEventListener('pointerdown', event => {
    // Closing a touch dialog can expose a different card beneath the finger
    // and generate compatibility mouseover there. It is not a new hover intent.
    if (event.pointerType === 'touch') touchHoverUntil = Date.now() + 800;
    if (!tooltip?.contains(event.target)) closeTooltip();
    if (menu && !menu.hidden && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('scroll', event => { if (!tooltip?.contains(event.target)) closeTooltip(true); if (!menu?.contains(event.target)) closeMenu(); }, true);
  window.addEventListener('resize', () => { closeTooltip(true); closeMenu(); });
  app.addEventListener('compositionstart', () => { composing = true; });
  app.addEventListener('compositionend', event => { composing = false; handleInput(event); });
  app.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-fusion-item]');
    if (!card || blocked()) { if (card) event.preventDefault(); return; }
    draggedId = card.dataset.fusionItem; closeTooltip(); closeMenu();
    event.dataTransfer.setData('application/x-dice-abyss-item', draggedId); event.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging');
  });
  app.addEventListener('dragover', event => { const slot = event.target.closest('[data-fusion-drop]'); if (slot && draggedId && !blocked()) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; slot.classList.add('is-dragover'); } });
  app.addEventListener('dragleave', event => { const slot = event.target.closest('[data-fusion-drop]'); if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove('is-dragover'); });
  const clearDrag = () => { draggedId = null; for (const node of app.querySelectorAll('.is-dragover, .is-dragging')) node.classList.remove('is-dragover', 'is-dragging'); };
  app.addEventListener('dragend', clearDrag);
  app.addEventListener('drop', event => { const slot = event.target.closest('[data-fusion-drop]'); if (slot && draggedId && !blocked()) { event.preventDefault(); selectTarget(draggedId, Number(slot.dataset.fusionDrop)); } clearDrag(); });
  function updateCardTabStops() {
    const cards = [...app.querySelectorAll('[data-fusion-item]')];
    const focus = cards.find(card => card.dataset.fusionItem === ui.fusionFocusId) || cards[0];
    for (const card of cards) card.tabIndex = card === focus ? 0 : -1;
  }
  function afterRender() {
    closeTooltip(true);
    // A notice/undo countdown is not a game-state change. Do not interrupt a
    // reader merely because its ephemeral toolbar needed a partial refresh.
    if (!active() || detailsState !== getState() || detailsTargets !== JSON.stringify(ui.fusionTargets || [])) closeDetails(false);
    if (!active()) { closeMenu(); return; }
    updateCardTabStops();
  }
  function committed(action) {
    closeTooltip(true); closeDetails(false);
    resetBatch(); ui.fusionAnchor = null; ui.fusionRange = null;
    if (action?.type === 'lock' && getState().player.items.find(item => item.id === action.id)?.locked) ui.fusionMaterials = (ui.fusionMaterials || []).filter(id => id !== action.id);
  }
  function reset() {
    resetBatch(); closeTooltip(); closeDetails(false); closeMenu(); clearDrag();
    dismissedHover.clear(); dismissedFocus.clear(); hoveredAnchor = null; lastDetailsAnchor = null; pointerDown = false; touchHoverUntil = 0;
    for (const field of ['fusionTargets','fusionMaterials']) ui[field] = [];
    for (const field of ['fusionPickingTarget','fusionAnchor','fusionFocusId','fusionRange']) ui[field] = null;
    ui.fusionPage = 0; ui.fusionSearch = ''; ui.fusionRarity = ''; ui.fusionMinLevel = ''; ui.fusionMaxLevel = ''; ui.fusionSort = 'newest';
  }
  return { handleClick, handleInput, handleKeydown, reconcile, afterRender, committed, reset, closeTooltip, closeMenu };
}
