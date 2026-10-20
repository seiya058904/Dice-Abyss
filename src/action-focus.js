// A disabled/remounted primary button cannot keep native focus during a reveal.
// Retain only that explicit focus intent until this presentation settles;
// dialogs and a player's move to another control always take precedence.
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
