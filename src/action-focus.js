// A disabled/remounted primary button cannot keep native focus during a reveal.
// Retain only that explicit focus intent until this presentation settles;
// dialogs and a player's move to another control always take precedence.
const SPACE_FORWARD_PHASES = new Set(['fate', 'route', 'combat', 'chest', 'loot', 'gold', 'cleared', 'complete']);
const SPACE_INTERACTIVE = 'button, a, input, select, textarea, summary, [contenteditable]';
const ESCAPE_EDITING = 'input, select, textarea, [contenteditable]';

// Safe desktop shortcuts only: Space skips an active presentation or advances
// non-destructive forward phases; Escape returns from collection views to the
// active room. Service, event and defeat phases stay explicit.
export function resolveKeyboardShortcut({ state, ui, event, dialogOpen = false, committing = false, action = null, canExecute = false }) {
  if (!event || ui?.saveRecovery || dialogOpen || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (ui?.screen !== 'game') return null;
  if ((event.key === 'Escape' || event.code === 'Escape') && ui.view !== 'game' && !ui.busy && !committing) {
    if (event.target?.closest?.(ESCAPE_EDITING)) return null;
    return { kind: 'view', view: 'game' };
  }
  if (event.code !== 'Space' || ui.view !== 'game') return null;
  if (event.target?.closest?.(SPACE_INTERACTIVE)) return null;
  if (ui.busy) return committing ? null : { kind: 'skip' };
  if (committing || !state || !SPACE_FORWARD_PHASES.has(state.phase)) return null;
  if (!action || action.type === 'inventory' || !canExecute) return null;
  return { kind: 'act', action: { type: action.type, ...(action.id ? { id: action.id } : {}) } };
}

export function createActionFocus(app) {
  const doc = app.ownerDocument;
  let pending = null;
  const primary = () => app.querySelector('#primary-action');
  const presentationControl = node => app.contains(node)
    && (node === primary() || node?.dataset?.action === 'skip');
  const neutral = node => !node || node === doc.body || node === doc.documentElement;
  return {
    capture({runId,generation,dialogOpen=false}) {
      const target = primary();
      pending = !dialogOpen && target && !target.disabled && doc.activeElement === target
        ? {runId,generation} : null;
    },
    observe(target) {
      // Removing the focused button leaves BODY active. That is not a user's
      // choice of another control; Tab/click/dialog focus is, and cancels it.
      if (pending && !neutral(target) && !presentationControl(target)) pending = null;
    },
    cancel() { pending = null; },
    restore({runId,generation,dialogOpen=false}) {
      if (!pending || pending.generation !== generation) return false;
      const request = pending; pending = null;
      if (dialogOpen || request.runId !== runId) return false;
      const target = primary(), active = doc.activeElement;
      if (!target || target.disabled || !target.getClientRects().length
          || (!neutral(active) && !presentationControl(active))) return false;
      if (active !== target) target.focus({preventScroll:true});
      return true;
    },
  };
}
