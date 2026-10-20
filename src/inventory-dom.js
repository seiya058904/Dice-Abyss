// The inventory still renders from the complete current state. Preserve the
// visible item through a same-page update, and start explicit result changes
// at the top without losing their keyboard control.
const available = node => node && !node.disabled && node.getClientRects().length > 0;
const itemId = card => card?.querySelector('[data-action="lock"][data-id]')?.dataset.id;
const cardsIn = list => [...list.querySelectorAll('.item-card')].map(node => ({node,id:itemId(node)}));

export function captureInventoryPosition(app, runId, {reset=false} = {}) {
  const screen = app.querySelector('.inventory-screen'), list = screen?.querySelector('.inventory-list');
  if (!list) return null;
  const active = app.ownerDocument.activeElement;
  const control = screen.contains(active) ? active : null;
  // A changed filter/order/page will start at the top. Its old item positions
  // cannot be used, so capture only the initiating control on that path.
  const cards = reset ? [] : cardsIn(list), box = reset ? null : list.getBoundingClientRect();
  const focusedCard = control?.closest('.item-card');
  const visible = card => { const rect = card.node.getBoundingClientRect(); return rect.bottom > box.top && rect.top < box.bottom; };
  const anchor = reset ? null : cards.find(card => card.node === focusedCard && visible(card)) || cards.find(visible);
  const pageControls = [...screen.querySelectorAll('[data-action="inventory-page"]')];
  return {
    runId,top:reset?0:list.scrollTop,left:reset?0:list.scrollLeft,ids:cards.map(card => card.id),
    anchor:anchor ? {id:anchor.id,index:cards.indexOf(anchor),offset:anchor.node.getBoundingClientRect().top-box.top} : null,
    focus:control ? {
      elementId:control.id,data:{...control.dataset},
      itemId:reset?null:itemId(focusedCard),itemIndex:cards.findIndex(card => card.node === focusedCard),
      pageDirection:pageControls.includes(control) ? pageControls.indexOf(control) : null,
      selection:control.id==='inventory-query'&&typeof control.selectionStart==='number'&&typeof control.selectionEnd==='number'
        ? {value:control.value,start:control.selectionStart,end:control.selectionEnd,direction:control.selectionDirection} : null,
    } : null,
  };
}

function nearbyCard(cards, before, index) {
  const byId = new Map(cards.map(card => [card.id,card]));
  // If a synchronized action removed the item, prefer the next old neighbor,
  // then the preceding one. Only fall back to a new row if none survived.
  for (let distance = 0; distance < before.ids.length; distance++) {
    for (const i of distance ? [index+distance,index-distance] : [index]) {
      const found = byId.get(before.ids[i]);
      if (found) return found;
    }
  }
  return cards[Math.min(cards.length-1,Math.max(0,index))];
}

export function restoreInventoryPosition(app, before, {reset=false,dialogOpen=false,runId} = {}) {
  const screen = app.querySelector('.inventory-screen'), list = screen?.querySelector('.inventory-list');
  if (!list || !before) return;
  // New runs reuse equipment IDs. An old run's anchor and focus cannot follow
  // a coincidentally matching item in the replacement save.
  if (before.runId !== runId) { list.scrollTop=0;list.scrollLeft=0;return; }
  let cards;
  const inventoryCards = () => cards ||= cardsIn(list);
  if (reset) { list.scrollTop=0;list.scrollLeft=0; }
  else {
    list.scrollTop=before.top;list.scrollLeft=before.left;
    if (before.anchor) {
      const anchor = inventoryCards().find(card => card.id === before.anchor.id) || nearbyCard(cards,before,before.anchor.index);
      if (anchor) list.scrollTop += anchor.node.getBoundingClientRect().top-list.getBoundingClientRect().top-before.anchor.offset;
    }
  }
  if (dialogOpen || !before.focus) return;
  const focus = before.focus, controls = [...screen.querySelectorAll('[data-action]')];
  let target;
  if (focus.pageDirection !== null) {
    const pages = controls.filter(node => node.dataset.action === 'inventory-page');
    target = available(pages[focus.pageDirection]) ? pages[focus.pageDirection] : pages.find(available);
  } else {
    target = focus.elementId ? screen.querySelector(`#${CSS.escape(focus.elementId)}`)
      : controls.find(node => Object.entries(focus.data).every(([key,value]) => node.dataset[key] === value));
    if (!available(target) && focus.itemId) {
      const card = inventoryCards().find(card => card.id === focus.itemId) || nearbyCard(cards,before,focus.itemIndex);
      const actions = card ? [...card.node.querySelectorAll('[data-action]')] : [];
      target = actions.find(node => node.dataset.action === focus.data.action && available(node))
        || actions.find(node => node.dataset.action === 'lock' && available(node)) || actions.find(available);
    }
  }
  if (!available(target)) target = controls.find(node => node.dataset.action === 'inventory-page' && available(node))
    || screen.querySelector('#inventory-sort');
  if (!available(target)) return;
  if (app.ownerDocument.activeElement !== target) target.focus({preventScroll:true});
  // The inventory owns this input's focus during a full redraw. Preserve the
  // draft's caret/selection too, but never carry it into a cleared/trimmed value,
  // another run or an open dialog. Retained native controls need no reset.
  const selection=focus.selection;
  if (selection&&target.id==='inventory-query'&&target.value===selection.value&&typeof target.setSelectionRange==='function') {
    const direction=['forward','backward','none'].includes(selection.direction)?selection.direction:'none';
    if(target.selectionStart!==selection.start||target.selectionEnd!==selection.end||target.selectionDirection!==direction)
      target.setSelectionRange(selection.start,selection.end,direction);
  }
}
