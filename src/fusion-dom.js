// Small DOM reconciliation for the workbench's string templates. Keeping the
// existing inputs, scroll containers and keyed cards avoids a full app remount.
const identity = node => {
  if (node.nodeType !== 1) return null;
  if (node.id) return `id:${node.id}`;
  if (node.hasAttribute('data-fusion-item')) return `item:${node.dataset.fusionItem}`;
  if (node.hasAttribute('data-fusion-drop')) return `slot:${node.dataset.fusionDrop}`;
  if (node.hasAttribute('data-fusion-face')) return `face:${node.dataset.fusionFace}`;
  if (node.dataset.action) return `action:${node.dataset.action}:${node.dataset.id || ''}:${node.dataset.index || ''}:${node.dataset.slot || ''}:${node.dataset.page || ''}`;
  return null;
};
const compatible = (a, b) => a?.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

function patch(node, next) {
  if (node.nodeType !== 1) {
    if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
    return;
  }
  // The GPU surface and dice poses are owned by mountEffects, not by selection
  // updates. A real game transaction still takes the normal rendering path.
  if (node.classList.contains('fusion-kiln-dice')) return;
  for (const { name } of [...node.attributes]) {
    if (node.tagName === 'DETAILS' && name === 'open') continue;
    if (!next.hasAttribute(name)) node.removeAttribute(name);
  }
  for (const { name, value } of [...next.attributes]) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  if (node.tagName === 'INPUT') {
    if (node.value !== next.value) node.value = next.value;
    node.checked = next.checked;
  } else {
    patchChildren(node, next);
    if (node.tagName === 'SELECT' && node.value !== next.value) node.value = next.value;
  }
}

function patchChildren(parent, next) {
  const original = [...parent.childNodes], keyed = new Map(original.map(node => [identity(node), node]).filter(([key]) => key));
  const used = new Set();
  let cursor = parent.firstChild;
  for (const incoming of [...next.childNodes]) {
    const key = identity(incoming);
    let current = key ? keyed.get(key) : original.find(node => !used.has(node) && !identity(node) && compatible(node, incoming));
    if (current && (!compatible(current, incoming) || used.has(current))) current = null;
    if (!current) current = incoming.cloneNode(true);
    else patch(current, incoming);
    used.add(current);
    if (current !== cursor) parent.insertBefore(current, cursor);
    cursor = current.nextSibling;
  }
  for (const node of original) if (!used.has(node)) node.remove();
}

export function captureWorkbenchPosition(app) {
  const focus = app.contains(document.activeElement) ? document.activeElement : null;
  return {
    x:window.scrollX, y:window.scrollY,
    scroll:[...app.querySelectorAll('[data-fusion-scroll], #current-room, .inventory-list')].map(node => ({
      id:node.id, key:node.dataset.fusionScroll, className:node.classList.contains('inventory-list') ? 'inventory-list' : null,
      top:node.scrollTop, left:node.scrollLeft,
    })),
    focus, focusId:focus?.id, focusData:focus?.dataset.action ? { ...focus.dataset } : null,
    start:focus?.selectionStart, end:focus?.selectionEnd,
  };
}

export function restoreWorkbenchPosition(app, before, dialogOpen = false) {
  if (!before) return;
  for (const item of before.scroll) {
    const node = item.id ? app.querySelector(`#${CSS.escape(item.id)}`)
      : item.key ? app.querySelector(`[data-fusion-scroll="${CSS.escape(item.key)}"]`)
      : item.className ? app.querySelector(`.${item.className}`) : null;
    if (node) { node.scrollTop = item.top; node.scrollLeft = item.left; }
  }
  if (!dialogOpen) {
    const focus = before.focus?.isConnected ? before.focus
      : before.focusId ? app.querySelector(`#${CSS.escape(before.focusId)}`)
      : before.focusData ? [...app.querySelectorAll('[data-action]')].find(node => Object.entries(before.focusData).every(([key, value]) => node.dataset[key] === value)) : null;
    if (focus && !focus.disabled) {
      if (document.activeElement !== focus) focus.focus({ preventScroll:true });
      if (typeof before.start === 'number' && focus.setSelectionRange) {
        try { focus.setSelectionRange(before.start, before.end); } catch { /* Numeric inputs have no text selection. */ }
      }
    }
  }
  if (window.scrollX !== before.x || window.scrollY !== before.y) window.scrollTo({ left:before.x, top:before.y, behavior:'instant' });
}

export function updateFusionDOM(app, html) {
  const current = app.querySelector('.fusion-workroom');
  if (!current) return false;
  const template = document.createElement('template');
  template.innerHTML = html;
  const next = template.content.firstElementChild;
  if (!next || !compatible(current, next)) return false;
  patch(current, next);
  return true;
}
